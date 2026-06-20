// Adaptadores: convertem os relatórios já existentes (Google e Meta) no
// AccountSnapshot que o motor de inteligência consome. Mantém o motor puro —
// ele não conhece as APIs, só o snapshot.

import type { GAccountReport, GAdGroup, GAd, GKeyword, GSearchTerm } from "../google-ads-api.js";
import type { Insight, MetaActionMetric } from "../meta-api.js";
import type { AccountSnapshot, GateCampaign, GateItem } from "./quality-gates.js";
import type { BenchmarkNiche } from "./types.js";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Mapeia uma linha de grupo/anúncio do Google para a entidade de camada. */
function gEntity(r: GAdGroup | GAd, parent: string): GateCampaign {
  return {
    id: r.id,
    nome: r.nome,
    parent,
    gasto: r.gasto,
    conversoes: r.conversoes,
    cliques: r.cliques,
    impressoes: r.impressoes,
    ctr: r.ctr,
    cpc_medio: r.cpc_medio,
    custo_por_conversao: r.custo_por_conversao,
    status: r.status,
  };
}

// action_type do Meta que contam como conversão (derivado de objectives.ts).
const META_CONV_ACTIONS = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
  "lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead",
  "onsite_conversion.lead_grouped", "leadgen_grouped",
  "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase",
  "complete_registration", "offsite_conversion.fb_pixel_complete_registration",
]);

/** Conversões best-effort de uma linha de insight (max entre os tipos, evita dupla contagem). */
function metaConversions(actions?: MetaActionMetric[]): number {
  if (!actions) return 0;
  let max = 0;
  for (const a of actions) {
    if (META_CONV_ACTIONS.has(a.action_type)) {
      const v = parseFloat(a.value) || 0;
      if (v > max) max = v;
    }
  }
  return round2(max);
}

/** Mapeia uma linha de insight (adset/ad) do Meta para a entidade de camada. */
function metaEntity(r: Insight, i: number, kind: "adset" | "ad"): GateCampaign {
  const gasto = parseFloat(r.spend) || 0;
  const impressoes = parseInt(r.impressions, 10) || 0;
  const cliques = parseInt(r.clicks, 10) || 0;
  const conv = metaConversions(r.actions);
  return {
    id: String(i),
    nome: (kind === "ad" ? r.ad_name : r.adset_name) ?? "(sem nome)",
    parent: kind === "ad" ? r.adset_name : r.campaign_name,
    gasto: round2(gasto),
    conversoes: conv,
    cliques,
    impressoes,
    ctr: impressoes > 0 ? round2((cliques / impressoes) * 100) : 0,
    cpc_medio: cliques > 0 ? round2(gasto / cliques) : 0,
    custo_por_conversao: conv > 0 ? round2(gasto / conv) : 0,
    frequencia: r.frequency != null ? round2(parseFloat(r.frequency)) : undefined,
  };
}

function parsePct(v: string | null | undefined): number | null {
  if (!v || v === "N/A" || v === "--") return null;
  const n = parseFloat(String(v).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ─── Google ───────────────────────────────────────────────────────────────────

export function googleSnapshot(
  report: GAccountReport,
  opts: {
    keywords?: GKeyword[];
    searchTerms?: GSearchTerm[];
    adGroups?: GAdGroup[];
    ads?: GAd[];
    niche?: BenchmarkNiche;
    month?: number;
  }
): AccountSnapshot {
  const campanhas: GateCampaign[] = report.campanhas.map((c) => ({
    id: c.id,
    nome: c.nome,
    gasto: c.gasto,
    conversoes: c.conversoes,
    cliques: c.cliques,
    impressoes: c.impressoes,
    ctr: c.ctr,
    cpc_medio: c.cpc_medio,
    custo_por_conversao: c.custo_por_conversao,
    parcela_impressoes: parsePct(c.parcela_impressoes),
    status: c.status,
  }));

  // Parcela de impressões (e IS perdida por orçamento/rank): média ponderada por impressões.
  let isNum = 0, isDen = 0;
  let budNum = 0, budDen = 0;
  let rankNum = 0, rankDen = 0;
  for (const c of report.campanhas) {
    const p = parsePct(c.parcela_impressoes);
    if (p != null && c.impressoes > 0) { isNum += p * c.impressoes; isDen += c.impressoes; }
    if (c.is_perdida_orcamento != null && c.impressoes > 0) { budNum += c.is_perdida_orcamento * c.impressoes; budDen += c.impressoes; }
    if (c.is_perdida_rank != null && c.impressoes > 0) { rankNum += c.is_perdida_rank * c.impressoes; rankDen += c.impressoes; }
  }
  const impressionShare = isDen > 0 ? round2(isNum / isDen) : null;
  const isPerdidaOrcamento = budDen > 0 ? round2(budNum / budDen) : null;
  const isPerdidaRank = rankDen > 0 ? round2(rankNum / rankDen) : null;

  // Quality Score médio: média simples das keywords com QS definido.
  const qsVals = (opts.keywords ?? []).map((k) => k.quality_score).filter((q): q is number => typeof q === "number");
  const qsMedio = qsVals.length ? round2(qsVals.reduce((a, b) => a + b, 0) / qsVals.length) : null;

  const keywords: GateItem[] | undefined = opts.keywords?.map((k) => ({
    termo: k.keyword,
    gasto: k.gasto,
    conversoes: k.conversoes,
    quality_score: k.quality_score,
  }));
  const termos: GateItem[] | undefined = opts.searchTerms?.map((t) => ({
    termo: t.termo,
    gasto: t.gasto,
    conversoes: t.conversoes,
  }));

  return {
    channel: "google",
    platform: "google",
    niche: opts.niche,
    objective: "default",
    month: opts.month,
    resumo: {
      gasto: report.resumo.gasto_total,
      conversoes: report.resumo.conversoes,
      cliques: report.resumo.cliques,
      impressoes: report.resumo.impressoes,
      ctr: report.resumo.ctr,
      cpc_medio: report.resumo.cpc_medio,
      custo_por_conversao: report.resumo.custo_por_conversao,
      cpm: report.resumo.impressoes > 0 ? round2((report.resumo.gasto_total / report.resumo.impressoes) * 1000) : 0,
      taxa_conversao: report.resumo.cliques > 0 ? round2((report.resumo.conversoes / report.resumo.cliques) * 100) : 0,
      impression_share: impressionShare,
      is_perdida_orcamento: isPerdidaOrcamento,
      is_perdida_rank: isPerdidaRank,
      quality_score_medio: qsMedio,
    },
    campanhas,
    conjuntos: opts.adGroups?.map((g) => gEntity(g, g.campanha)),
    anuncios: opts.ads?.map((a) => gEntity(a, a.grupo)),
    keywords,
    termos,
  };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const CONVERSION_CATEGORIES = new Set(["lead_form", "messages", "sales"]);

interface MetaCampaignRow {
  nome: string;
  categoria: string;
  gasto: number;
  resultado: number;
  custo: number;
  cliques: number;
  impressoes: number;
  ctr: number;
  cpc: number;
  frequencia: number;
}
interface MetaAccountReportLike {
  totais: { gasto: number };
  campanhas: MetaCampaignRow[];
}

/** Mapeia o resultado de buildAccountReport (Meta) para o snapshot. */
export function metaSnapshot(
  account: MetaAccountReportLike,
  opts: { niche?: BenchmarkNiche; month?: number; objective?: string; adsets?: Insight[]; ads?: Insight[] }
): AccountSnapshot {
  let cliques = 0;
  let impressoes = 0;
  let conversoes = 0;
  let freqNum = 0; // Σ frequência_i × impressões_i — base da média ponderada
  const gasto = account.totais.gasto;

  const campanhas: GateCampaign[] = account.campanhas.map((c, i) => {
    cliques += c.cliques;
    impressoes += c.impressoes;
    freqNum += (c.frequencia || 0) * c.impressoes;
    if (CONVERSION_CATEGORIES.has(c.categoria)) conversoes += c.resultado;
    return {
      id: String(i),
      nome: c.nome,
      gasto: c.gasto,
      conversoes: CONVERSION_CATEGORIES.has(c.categoria) ? c.resultado : 0,
      cliques: c.cliques,
      impressoes: c.impressoes,
      ctr: c.ctr,
      cpc_medio: c.cpc,
      custo_por_conversao: c.custo,
      frequencia: c.frequencia,
    };
  });

  const ctr = impressoes > 0 ? round2((cliques / impressoes) * 100) : 0;
  const cpc = cliques > 0 ? round2(gasto / cliques) : 0;
  const cpa = conversoes > 0 ? round2(gasto / conversoes) : 0;
  const cpm = impressoes > 0 ? round2((gasto / impressoes) * 1000) : 0;
  const taxaConv = cliques > 0 ? round2((conversoes / cliques) * 100) : 0;
  const frequencia = impressoes > 0 ? round2(freqNum / impressoes) : 0;

  return {
    channel: "meta",
    platform: "meta",
    niche: opts.niche,
    objective: opts.objective ?? "leads",
    month: opts.month,
    resumo: {
      gasto: round2(gasto),
      conversoes: round2(conversoes),
      cliques,
      impressoes,
      ctr,
      cpc_medio: cpc,
      custo_por_conversao: cpa,
      cpm,
      taxa_conversao: taxaConv,
      frequencia,
    },
    campanhas,
    conjuntos: opts.adsets?.map((r, i) => metaEntity(r, i, "adset")),
    anuncios: opts.ads?.map((r, i) => metaEntity(r, i, "ad")),
  };
}
