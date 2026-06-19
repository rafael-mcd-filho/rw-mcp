// Adaptadores: convertem os relatórios já existentes (Google e Meta) no
// AccountSnapshot que o motor de inteligência consome. Mantém o motor puro —
// ele não conhece as APIs, só o snapshot.

import type { GAccountReport, GKeyword, GSearchTerm } from "../google-ads-api.js";
import type { AccountSnapshot, GateCampaign, GateItem } from "./quality-gates.js";
import type { BenchmarkNiche } from "./types.js";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function parsePct(v: string | null | undefined): number | null {
  if (!v || v === "N/A" || v === "--") return null;
  const n = parseFloat(String(v).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ─── Google ───────────────────────────────────────────────────────────────────

export function googleSnapshot(
  report: GAccountReport,
  opts: { keywords?: GKeyword[]; searchTerms?: GSearchTerm[]; niche?: BenchmarkNiche; month?: number }
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

  // Parcela de impressões da conta: média ponderada por impressões das campanhas.
  let isNum = 0;
  let isDen = 0;
  for (const c of report.campanhas) {
    const p = parsePct(c.parcela_impressoes);
    if (p != null && c.impressoes > 0) {
      isNum += p * c.impressoes;
      isDen += c.impressoes;
    }
  }
  const impressionShare = isDen > 0 ? round2(isNum / isDen) : null;

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
      impression_share: impressionShare,
      quality_score_medio: qsMedio,
    },
    campanhas,
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
  opts: { niche?: BenchmarkNiche; month?: number; objective?: string }
): AccountSnapshot {
  let cliques = 0;
  let impressoes = 0;
  let conversoes = 0;
  const gasto = account.totais.gasto;

  const campanhas: GateCampaign[] = account.campanhas.map((c, i) => {
    cliques += c.cliques;
    impressoes += c.impressoes;
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
    },
    campanhas,
  };
}
