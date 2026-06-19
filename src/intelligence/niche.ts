// Infere o nicho do cliente a partir do campo livre `contexto_cliente` do
// webhook. Mapeia palavras-chave para um dos baldes de benchmark, com fallback
// para "geral". Sempre devolve evidência e confiança para correção manual.

import type { BenchmarkNiche, NicheResult } from "./types.js";

export const NICHE_LABELS: Record<BenchmarkNiche, string> = {
  alimentacao_delivery: "Alimentação / Delivery",
  franquias: "Franquias",
  saude_estetica: "Saúde / Estética",
  servicos_locais: "Serviços locais",
  imoveis: "Imóveis",
  educacao: "Educação",
  infoprodutos: "Infoprodutos",
  ecommerce_moda: "E-commerce (moda)",
  ecommerce_tech: "E-commerce (tech)",
  saas_b2b: "SaaS / B2B",
  financeiro: "Financeiro",
  geral: "Geral",
};

// Ordem importa: baldes mais específicos primeiro. Ex.: "franqueadora de food
// service" deve cair em `franquias` (captação de investidor, ticket alto), não
// em `alimentacao_delivery` (CPL barato).
const NICHE_KEYWORDS: Array<{ niche: BenchmarkNiche; terms: string[] }> = [
  { niche: "franquias", terms: ["franquia", "franqueadora", "franqueado", "franchising", "franchise"] },
  { niche: "imoveis", terms: ["imovel", "imoveis", "imobiliaria", "corretor", "apartamento", "loteamento", "incorporadora", "construtora", "terreno", "sala comercial", "salas comerciais", "escritorio", "locacao", "empreendimento"] },
  { niche: "financeiro", terms: ["financeir", "credito", "emprestimo", "seguro", "investiment", "consorcio", "banco", "cartao de credito"] },
  { niche: "saude_estetica", terms: ["clinica", "estetica", "odonto", "dentista", "dermato", "harmoniza", "botox", "saude", "fisio", "nutri", "medic", "procedimento facial", "depilacao", "capilar", "farmacia", "farmaceutic", "drogaria", "remedio", "medicament", "manipulacao", "suplement", "psicolog", "psiquiatr", "terapeuta", "cirurgi", "hospital"] },
  { niche: "infoprodutos", terms: ["infoproduto", "curso online", "mentoria", "ebook", "lancamento", "produto digital", "comunidade paga"] },
  { niche: "educacao", terms: ["escola", "faculdade", "ensino", "vestibular", "concurso", "curso preparatorio", "educacao", "idiomas", "pos-graduacao"] },
  { niche: "ecommerce_moda", terms: ["moda", "roupa", "vestuario", "calcad", "fashion", "semijoia", "semijoias", "acessorios", "bijuteria", "lingerie"] },
  { niche: "ecommerce_tech", terms: ["eletronico", "gadget", "informatica", "celular", "computador", "notebook", "smartphone", "tecnologia de consumo"] },
  { niche: "saas_b2b", terms: ["saas", "software", "b2b", "plataforma", "sistema", "aplicativo corporativo", "erp", "crm"] },
  { niche: "alimentacao_delivery", terms: ["restaurante", "delivery", "lanchonete", "pizzaria", "hamburgu", "hamburgueria", "burgueria", "burger", "humbug", "lanche", "espetaria", "espeto", "acai", "comida", "gastronom", "cafeteria", "food service", "food", "doceria", "padaria", "sorveteria", "sorvet", "gelato", "supermercado", "mercearia", "acougue", "hortifruti", "vinho", "enoteca", "adega"] },
  { niche: "servicos_locais", terms: ["servico", "lava jato", "automotiv", "estetica automotiva", "lavagem", "higieniza", "oficina", "pet", "petshop", "caes", "cachorro", "adestrament", "canino", "veterinari", "creche", "salao", "barbearia", "academia", "advoga", "contabil", "consultoria", "despachante", "manutencao", "reforma", "limpeza", "lavanderia", "pintura", "painting", "rastreament", "vidracaria", "vidro", "marcenaria", "moveis planejados", "planejados", "otica", "oculos", "lentes de contato", "lentes de grau", "lentes", "armacoes", "armacao", "joalheria", "relojoaria"] },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Mapeia o texto livre de contexto para um balde de benchmark.
 * Pontua cada balde pelo nº de termos encontrados; o maior vence (empate →
 * ordem da lista, que prioriza baldes mais específicos). Sem match → "geral".
 */
export function normalizeNiche(contexto?: string): NicheResult {
  if (!contexto || !contexto.trim()) {
    return { niche: "geral", label: NICHE_LABELS.geral, confidence: "baixa", evidence: [] };
  }

  const text = normalize(contexto);
  let best: { niche: BenchmarkNiche; hits: string[] } | null = null;

  for (const { niche, terms } of NICHE_KEYWORDS) {
    const hits = terms.filter((t) => text.includes(t));
    if (hits.length && (!best || hits.length > best.hits.length)) {
      best = { niche, hits };
    }
  }

  if (!best) {
    return { niche: "geral", label: NICHE_LABELS.geral, confidence: "baixa", evidence: [] };
  }

  const confidence: NicheResult["confidence"] = best.hits.length >= 2 ? "alta" : "media";
  return {
    niche: best.niche,
    label: NICHE_LABELS[best.niche],
    confidence,
    evidence: best.hits,
  };
}

// Mapeia o RÓTULO de nicho que a IA do n8n entrega (ex.: "Farmácia", "Ótica",
// "Supermercado") para um balde de benchmark. Roda sobre um rótulo canônico e
// curto — bem mais confiável que casar o texto livre. Ordem importa (saúde
// antes de e-commerce; serviços locais como catch-all no fim).
const LABEL_RULES: Array<{ slug: BenchmarkNiche; test: RegExp }> = [
  { slug: "franquias", test: /franqui/ },
  // Automotivo/lava-jato ANTES de saúde, senão "estética automotiva" cai em estética.
  { slug: "servicos_locais", test: /automotiv|lava.?jato/ },
  { slug: "imoveis", test: /corret|constru|imobil|imove|loteament|incorporad|empreendiment/ },
  { slug: "financeiro", test: /financ|credito|seguro|consorci|emprestim|\bbanco/ },
  { slug: "saude_estetica", test: /farmac|saude|odonto|psicolog|beleza|estetic|\bmedic|clinic|fisio|nutri|drogaria|dermat|cirurg|hospital|harmoniza|terapeut/ },
  { slug: "infoprodutos", test: /infoprodut|curso online|mentoria|lancament|produto digital/ },
  { slug: "educacao", test: /educac|escola|ensino|faculdad|vestibular|idiomas/ },
  { slug: "ecommerce_moda", test: /moda|calcad|semijoi|\bjoia|vestuari|fashion|bijuteri|lingerie|acessori/ },
  { slug: "ecommerce_tech", test: /eletronic|\btech|informatic|gadget|celular|computador|notebook/ },
  { slug: "saas_b2b", test: /saas|software|\bb2b|sistema|plataforma|aplicativo/ },
  { slug: "alimentacao_delivery", test: /aliment|restaurant|pizza|hamburg|burg|lanch|sorvet|gelato|padaria|doceria|cafeteri|vinho|enotec|adega|supermercad|mercearia|acougue|hortifruti|\bfood|gastronom|delivery|espeto/ },
  { slug: "servicos_locais", test: /otica|optic|oculos|lente|\bpet|animai|animal|limpeza|automotiv|lavander|despachant|vidrac|pintur|interior|moveis|marcenaria|rastreament|consultoria|salao|barbear|academia|advoga|contabil|oficina|reforma|manutenc|servic|estetica automotiva|lava\s*jato/ },
];

const SLUGS = new Set(Object.keys(NICHE_LABELS) as BenchmarkNiche[]);

/**
 * Fonte de verdade do nicho. Prefere o campo `nicho` (classificado pela IA do
 * n8n); cai para o casamento por palavra-chave no `contexto` só se faltar.
 */
export function resolveNiche(nicho?: string, contexto?: string): NicheResult {
  const raw = (nicho ?? "").trim();
  if (raw) {
    const norm = normalize(raw).replace(/\s+/g, "_");
    if (SLUGS.has(norm as BenchmarkNiche)) {
      const slug = norm as BenchmarkNiche;
      return { niche: slug, label: NICHE_LABELS[slug], confidence: "alta", evidence: ["nicho (n8n)"] };
    }
    const flat = normalize(raw);
    for (const r of LABEL_RULES) {
      if (r.test.test(flat)) {
        return { niche: r.slug, label: NICHE_LABELS[r.slug], confidence: "alta", evidence: [`n8n: "${raw}"`] };
      }
    }
  }
  // Sem rótulo utilizável → fallback por palavra-chave no contexto livre.
  return normalizeNiche(contexto);
}
