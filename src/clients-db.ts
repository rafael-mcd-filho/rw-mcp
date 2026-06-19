export interface ClientRecord {
  nome_cliente: string;
  id_conta_meta_ads: string;
  id_conta_google: string;
  id_grupo_cliente: string;
  /** Texto livre opcional (nicho + sobre a empresa). Alimenta o benchmark por nicho. */
  contexto_cliente?: string;
}

let cache: ClientRecord[] | null = null;
let cacheAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

export async function loadClients(): Promise<ClientRecord[]> {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;

  const url = process.env.CLIENTS_WEBHOOK_URL;
  const token = process.env.CLIENTS_WEBHOOK_TOKEN;
  if (!url || !token) return [];

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": token },
      body: "{}",
    });
    if (!res.ok) return cache ?? [];

    const raw = await res.json() as { data?: ClientRecord[] } | ClientRecord[];
    const list = Array.isArray(raw) ? raw : (raw.data ?? []);
    cache = list.filter(c => c.nome_cliente);
    cacheAt = Date.now();
  } catch {
    // falha silenciosa — usa cache antigo ou vazio
  }

  return cache ?? [];
}

/** Busca cliente por nome (match parcial, case-insensitive, ignora acentos). */
export async function findClient(nome: string): Promise<ClientRecord | undefined> {
  const clients = await loadClients();
  if (!clients.length) return undefined;

  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  const query = normalize(nome);

  // Tenta match exato primeiro
  let found = clients.find(c => normalize(c.nome_cliente) === query);
  if (found) return found;

  // Match parcial: query contida no nome do cliente
  found = clients.find(c => normalize(c.nome_cliente).includes(query));
  if (found) return found;

  // Match parcial inverso: nome do cliente contido na query
  return clients.find(c => query.includes(normalize(c.nome_cliente)));
}

export function clientsConfigured(): boolean {
  return !!(process.env.CLIENTS_WEBHOOK_URL && process.env.CLIENTS_WEBHOOK_TOKEN);
}
