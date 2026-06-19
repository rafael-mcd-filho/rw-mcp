// Registro das tools de inteligência (diagnóstico e auditoria). Mantido fora do
// server.ts para não inchá-lo. Resolve cliente → IDs + contexto, busca por canal,
// monta snapshots e roda o motor de inteligência.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MetaAdsClient } from "../meta-api.js";
import { buildAccountReport } from "../report.js";
import {
  googleAdsConfigured,
  getGoogleAdsAccountReport,
  getGoogleAdsKeywords,
  getGoogleAdsSearchTerms,
} from "../google-ads-api.js";
import { findClient, clientsConfigured, type ClientRecord } from "../clients-db.js";
import { normalizeNiche } from "../intelligence/niche.js";
import { googleSnapshot, metaSnapshot } from "../intelligence/snapshot.js";
import { buildDiagnosis } from "../intelligence/diagnosis.js";
import { buildAudit } from "../intelligence/audit.js";
import type { AccountSnapshot } from "../intelligence/quality-gates.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function toolError(msg: string) {
  return { content: [{ type: "text" as const, text: msg }] };
}

const onlyDigits = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  return String(v).replace(/-/g, "").trim() || undefined;
};
const scalar = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
};

interface IntelArgs {
  nome_cliente?: string;
  nomeCliente?: string;
  cliente?: string;
  client?: string;
  meta_account_id?: string | number;
  id_conta_meta_ads?: string | number;
  google_customer_id?: string | number;
  id_conta_google?: string | number;
  contexto_cliente?: string;
  nicho?: string;
  since?: string;
  until?: string;
  start_date?: string;
  end_date?: string;
  date_preset?: string;
  preset?: string;
  incluir_meta?: boolean;
  incluir_google?: boolean;
}

const INTEL_SCHEMA = {
  nome_cliente: z.string().optional().describe("Nome do cliente na base. Resolve IDs Meta/Google e o contexto automaticamente."),
  meta_account_id: z.union([z.string(), z.number()]).optional().describe("ID da conta Meta Ads (se não usar nome_cliente)."),
  google_customer_id: z.union([z.string(), z.number()]).optional().describe("ID da conta Google Ads, sem traços (se não usar nome_cliente)."),
  contexto_cliente: z.string().optional().describe("Texto livre com nicho + sobre a empresa. Sobrescreve o da base."),
  nicho: z.string().optional().describe("Força o nicho do benchmark (alimentacao_delivery, franquias, saude_estetica, servicos_locais, imoveis, educacao, infoprodutos, ecommerce_moda, ecommerce_tech, saas_b2b, financeiro, geral)."),
  since: z.string().optional().describe("Data início YYYY-MM-DD."),
  until: z.string().optional().describe("Data fim YYYY-MM-DD."),
  date_preset: z.string().optional().describe("Alternativa a since/until (ex.: last_7d, last_30d)."),
  incluir_meta: z.boolean().optional().describe("Se false, não busca Meta. Padrão: true (se houver ID)."),
  incluir_google: z.boolean().optional().describe("Se false, não busca Google. Padrão: true (se houver ID)."),
};

function periodOf(a: IntelArgs) {
  const since = a.since ?? a.start_date;
  const until = a.until ?? a.end_date;
  const preset = a.date_preset ?? a.preset;
  const label = since && until ? `${since} a ${until}` : preset ?? "últimos 30 dias";
  const month = until ? Number(until.slice(5, 7)) : new Date().getMonth() + 1;
  return { since, until, preset, label, month: Number.isFinite(month) ? month : undefined };
}

async function resolveClient(a: IntelArgs): Promise<{
  cliente: string;
  metaId?: string;
  googleId?: string;
  contexto?: string;
  record?: ClientRecord;
}> {
  const nome = scalar(a.nome_cliente ?? a.nomeCliente ?? a.cliente ?? a.client);
  let record: ClientRecord | undefined;
  if (nome && clientsConfigured()) {
    record = await findClient(nome);
    if (!record) throw new Error(`Cliente "${nome}" não encontrado na base.`);
  }
  const metaId = scalar(a.meta_account_id ?? a.id_conta_meta_ads) ?? record?.id_conta_meta_ads;
  const googleId = onlyDigits(a.google_customer_id ?? a.id_conta_google ?? record?.id_conta_google);
  const contexto = scalar(a.contexto_cliente) ?? record?.contexto_cliente;
  return {
    cliente: record?.nome_cliente ?? nome ?? "Cliente",
    metaId: metaId || undefined,
    googleId: googleId || undefined,
    contexto,
    record,
  };
}

/** Busca os canais pedidos e devolve os snapshots + avisos de falha por canal. */
async function buildSnapshots(
  a: IntelArgs,
  metaClient: MetaAdsClient
): Promise<{ cliente: string; periodo: string; nicho: ReturnType<typeof normalizeNiche>; snapshots: AccountSnapshot[]; avisos: string[] }> {
  const { cliente, metaId, googleId, contexto } = await resolveClient(a);
  const { since, until, preset, label, month } = periodOf(a);
  const nicheForced = scalar(a.nicho);
  const niche = nicheForced
    ? { niche: nicheForced as ReturnType<typeof normalizeNiche>["niche"], label: nicheForced, confidence: "alta" as const, evidence: ["forçado"] }
    : normalizeNiche(contexto);

  const wantsMeta = (a.incluir_meta ?? true) && !!metaId;
  const wantsGoogle = (a.incluir_google ?? true) && !!googleId && googleAdsConfigured();
  const snapshots: AccountSnapshot[] = [];
  const avisos: string[] = [];

  if (wantsMeta && metaId) {
    try {
      const rows = await metaClient.getInsights({ level: "campaign", since, until, datePreset: preset, accountId: metaId });
      const account = buildAccountReport(rows, label);
      snapshots.push(metaSnapshot(account as Parameters<typeof metaSnapshot>[0], { niche: niche.niche, month }));
    } catch (e) {
      avisos.push(`Meta Ads falhou: ${(e as Error).message}`);
    }
  }

  if (wantsGoogle && googleId) {
    try {
      const [report, keywords, searchTerms] = await Promise.all([
        getGoogleAdsAccountReport(googleId, since, until, preset),
        getGoogleAdsKeywords(googleId, since, until, preset, 25).catch(() => []),
        getGoogleAdsSearchTerms(googleId, since, until, preset, 100).catch(() => []),
      ]);
      snapshots.push(googleSnapshot(report, { keywords, searchTerms, niche: niche.niche, month }));
    } catch (e) {
      avisos.push(`Google Ads falhou: ${(e as Error).message}`);
    }
  }

  if (!snapshots.length) {
    throw new Error(
      "Não foi possível montar a análise: informe nome_cliente com IDs cadastrados, ou meta_account_id / google_customer_id. " +
        (avisos.length ? `Detalhe: ${avisos.join("; ")}` : "")
    );
  }

  return { cliente, periodo: label, nicho: niche, snapshots, avisos };
}

export function registerIntelligenceTools(server: McpServer, metaClient: MetaAdsClient): void {
  server.tool(
    "get_client_diagnosis",
    `Diagnóstico rápido de um cliente: Health Score (0–100, nota A–F), KPIs classificados por benchmark do nicho, top alertas priorizados por impacto e desperdício estimado em R$. Responde "o que precisa da minha atenção?". Ideal para check diário/semanal. Resolve nome_cliente automaticamente (Meta + Google).`,
    INTEL_SCHEMA,
    async (args) => {
      try {
        const { cliente, periodo, nicho, snapshots, avisos } = await buildSnapshots(args as IntelArgs, metaClient);
        const result = buildDiagnosis({
          cliente,
          periodo,
          nicho: nicho.label,
          nicho_confianca: nicho.confidence,
          snapshots,
        });
        return json(avisos.length ? { ...result, _avisos: avisos, _nicho_evidencia: nicho.evidence } : { ...result, _nicho_evidencia: nicho.evidence });
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "get_client_audit",
    `Auditoria profunda de um cliente: tudo do diagnóstico + veredito por campanha (MANTER/OTIMIZAR/PAUSAR), desperdício por categoria e plano de ação priorizado (urgente/semana/mês). Responde "a conta está saudável? onde perco dinheiro?". Ideal para revisão mensal ou pré-reunião.`,
    INTEL_SCHEMA,
    async (args) => {
      try {
        const { cliente, periodo, nicho, snapshots, avisos } = await buildSnapshots(args as IntelArgs, metaClient);
        const result = buildAudit({ cliente, periodo, nicho: nicho.label, snapshots });
        return json(avisos.length ? { ...result, _avisos: avisos, _nicho_evidencia: nicho.evidence } : { ...result, _nicho_evidencia: nicho.evidence });
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );
}
