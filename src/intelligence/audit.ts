// Modo Auditoria — revisão profunda: tudo do diagnóstico + veredito por
// campanha, desperdício por categoria e plano de ação priorizado por impacto.

import { runQualityGates, totalWaste, type AccountSnapshot, type GateCampaign } from "./quality-gates.js";
import { computeHealthScore, GRADE_MEANING } from "./health-score.js";
import { prioritizeAlerts, alertLine } from "./alerts.js";
import { classifyKpis } from "./diagnosis.js";
import { analyzeLayer, type LayerAnalysis, type LayerKind } from "./layers.js";
import type { Alert, BenchmarkResult, Channel, ClassifyContext, Platform } from "./types.js";

type Verdict = "MANTER" | "OTIMIZAR" | "PAUSAR" | "SEM_ENTREGA";

export interface CampaignVerdict {
  nome: string;
  gasto: number;
  conversoes: number;
  custo_por_conversao: number;
  veredito: Verdict;
  motivo: string;
}

export interface ChannelAudit {
  channel: Channel;
  platform: Platform;
  gasto: number;
  conversoes: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  grade_significado: string;
  kpis: BenchmarkResult[];
  campanhas: CampaignVerdict[];
  alertas: Alert[];
  layers: LayerAnalysis[];
  desperdicio_estimado: number;
  checks_insuficientes: string[];
}

export interface AnalysisResult {
  tipo: "analise";
  cliente: string;
  periodo: string;
  nicho: string;
  nicho_confianca: "alta" | "media" | "baixa";
  canais: ChannelAudit[];
  desperdicio_por_categoria: Record<string, number>;
  desperdicio_estimado: number;
  plano_de_acao: { urgente: string[]; esta_semana: string[]; este_mes: string[] };
  mensagem: string;
}

/** @deprecated diagnóstico e auditoria foram unificados — use AnalysisResult. */
export type AuditResult = AnalysisResult;

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const moneyBR = (n: number): string =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intBR = (n: number): string => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function refCpa(campanhas: GateCampaign[]): number | null {
  const cpas = campanhas.filter((c) => c.conversoes > 0 && c.custo_por_conversao > 0).map((c) => c.custo_por_conversao).sort((a, b) => a - b);
  if (!cpas.length) return null;
  const mid = Math.floor(cpas.length / 2);
  return cpas.length % 2 ? cpas[mid] : (cpas[mid - 1] + cpas[mid]) / 2;
}

function judgeCampaign(c: GateCampaign, gastoConta: number, ref: number | null): CampaignVerdict {
  let veredito: Verdict;
  let motivo: string;
  const relevante = c.gasto >= Math.max(20, gastoConta * 0.05);

  if (c.gasto === 0) {
    veredito = "SEM_ENTREGA";
    motivo = "Sem gasto no período.";
  } else if (c.conversoes === 0 && relevante) {
    veredito = "PAUSAR";
    motivo = `${moneyBR(c.gasto)} sem nenhuma conversão.`;
  } else if (c.conversoes > 0 && ref && c.custo_por_conversao >= ref * 2.5) {
    veredito = "OTIMIZAR";
    motivo = `CPA ${moneyBR(c.custo_por_conversao)} muito acima do médio da conta (${moneyBR(ref)}).`;
  } else if (c.conversoes > 0) {
    veredito = "MANTER";
    motivo = `CPA ${moneyBR(c.custo_por_conversao)} · ${intBR(c.conversoes)} conv.`;
  } else {
    veredito = "OTIMIZAR";
    motivo = "Gasto baixo sem conversão — observar.";
  }
  return {
    nome: c.nome,
    gasto: round2(c.gasto),
    conversoes: round2(c.conversoes),
    custo_por_conversao: round2(c.custo_por_conversao),
    veredito,
    motivo,
  };
}

function auditChannel(s: AccountSnapshot): ChannelAudit {
  const kpis = classifyKpis(s);
  const { checks, alerts } = runQualityGates(s);
  const health = computeHealthScore(checks);
  const ref = refCpa(s.campanhas);
  const campanhas = [...s.campanhas]
    .sort((a, b) => b.gasto - a.gasto)
    .map((c) => judgeCampaign(c, s.resumo.gasto, ref));
  const alertas = prioritizeAlerts(alerts);

  // Análise por camada — mesma régua de benchmark aplicada por entidade.
  const ctx: ClassifyContext = { platform: s.platform, objective: s.objective, niche: s.niche, month: s.month };
  const layers: LayerAnalysis[] = [];
  const addLayer = (ents: GateCampaign[] | undefined, kind: LayerKind, label: string) => {
    const a = analyzeLayer(ents, kind, label, ctx, s.resumo.gasto);
    if (a) layers.push(a);
  };
  addLayer(s.campanhas, "campanha", "Campanhas");
  if (s.platform === "meta") {
    addLayer(s.conjuntos, "conjunto", "Conjuntos");
    addLayer(s.anuncios, "anuncio", "Anúncios");
  } else {
    addLayer(s.conjuntos, "grupo", "Grupos de anúncios");
    addLayer(s.anuncios, "anuncio", "Anúncios");
  }

  return {
    channel: s.channel,
    platform: s.platform,
    gasto: round2(s.resumo.gasto),
    conversoes: round2(s.resumo.conversoes),
    score: health.score,
    grade: health.grade,
    grade_significado: GRADE_MEANING[health.grade],
    kpis,
    campanhas,
    alertas,
    layers,
    desperdicio_estimado: totalWaste(alertas),
    checks_insuficientes: health.insuficientes,
  };
}

const CHANNEL_LABEL: Record<Channel, string> = { meta: "Meta Ads", google: "Google Ads", integrated: "Integrado" };

export function buildAnalysis(input: {
  cliente: string;
  periodo: string;
  nicho: string;
  nicho_confianca: "alta" | "media" | "baixa";
  snapshots: AccountSnapshot[];
}): AnalysisResult {
  const canais = input.snapshots.map(auditChannel);
  const alertas = prioritizeAlerts(canais.flatMap((c) => c.alertas)).filter((a) => a.status !== "PASS");

  const desperdicioPorCategoria: Record<string, number> = {};
  for (const a of alertas) {
    if (a.impactEstimate) {
      desperdicioPorCategoria[a.category] = round2((desperdicioPorCategoria[a.category] ?? 0) + a.impactEstimate);
    }
  }
  const desperdicio = round2(Object.values(desperdicioPorCategoria).reduce((acc, v) => acc + v, 0));

  const plano = {
    urgente: alertas.filter((a) => a.severity === "CRITICO").map((a) => `${a.evidence} → ${a.recommendation}`),
    esta_semana: alertas.filter((a) => a.severity === "ALTO").map((a) => `${a.evidence} → ${a.recommendation}`),
    este_mes: alertas.filter((a) => a.severity === "MEDIO" || a.severity === "BAIXO").map((a) => `${a.evidence} → ${a.recommendation}`),
  };

  // Mensagem = ping conciso (estilo WhatsApp). O plano completo, o veredito por
  // campanha e o desperdício por categoria ficam nos campos estruturados + no PDF.
  const linhas: string[] = [];
  linhas.push(`🩺 *Análise — ${input.cliente}*`);
  linhas.push(`Período: ${input.periodo} · nicho: ${input.nicho}${input.nicho_confianca === "baixa" ? " (régua geral)" : ""}`);

  for (const c of canais) {
    linhas.push("");
    linhas.push(`*${CHANNEL_LABEL[c.channel]}* — Health Score ${c.score}/100 (${c.grade}: ${c.grade_significado})`);
    linhas.push(`${moneyBR(c.gasto)} · ${intBR(c.conversoes)} conv.`);
    const kpiLine = c.kpis.map((k) => `${k.label} ${k.level}`).join(" · ");
    if (kpiLine) linhas.push(kpiLine);
    const pausar = c.campanhas.filter((v) => v.veredito === "PAUSAR");
    if (pausar.length) {
      linhas.push("Pausar/revisar: " + pausar.map((v) => v.nome).join(", "));
    }
  }

  const top = alertas.slice(0, 5);
  if (top.length) {
    linhas.push("", "*O que precisa da sua atenção*");
    for (const a of top) linhas.push(`- ${alertLine(a)}`);
  } else {
    linhas.push("", "✅ Sem alertas relevantes no período.");
  }

  if (desperdicio > 0) {
    linhas.push("", `💸 Desperdício estimado: ${moneyBR(desperdicio)} no período.`);
  }

  return {
    tipo: "analise",
    cliente: input.cliente,
    periodo: input.periodo,
    nicho: input.nicho,
    nicho_confianca: input.nicho_confianca,
    canais,
    desperdicio_por_categoria: desperdicioPorCategoria,
    desperdicio_estimado: desperdicio,
    plano_de_acao: plano,
    mensagem: linhas.join("\n"),
  };
}

/** @deprecated diagnóstico e auditoria foram unificados — use buildAnalysis. */
export const buildAudit = buildAnalysis;
