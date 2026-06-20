// Modo Diagnóstico — check rápido: classifica KPIs por benchmark, roda os
// quality gates, calcula Health Score e devolve top alertas + mensagem pronta.
// Opera sobre AccountSnapshot[] (um por canal) montados na camada de tools.

import { classifyMetric } from "./benchmarks.js";
import { runQualityGates, totalWaste, type AccountSnapshot } from "./quality-gates.js";
import { computeHealthScore, GRADE_MEANING } from "./health-score.js";
import { prioritizeAlerts, alertLine } from "./alerts.js";
import type { Alert, BenchmarkResult, Channel, Platform } from "./types.js";

export interface ChannelDiagnosis {
  channel: Channel;
  platform: Platform;
  gasto: number;
  conversoes: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  grade_significado: string;
  kpis: BenchmarkResult[];
  alertas: Alert[];
  desperdicio_estimado: number;
  checks_insuficientes: string[];
}

export interface DiagnosisResult {
  tipo: "diagnostico";
  cliente: string;
  periodo: string;
  nicho: string;
  nicho_confianca: "alta" | "media" | "baixa";
  canais: ChannelDiagnosis[];
  alertas: Alert[];
  desperdicio_estimado: number;
  mensagem: string;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const moneyBR = (n: number): string =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intBR = (n: number): string => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Classifica os KPIs relevantes de um snapshot contra o benchmark. */
export function classifyKpis(s: AccountSnapshot): BenchmarkResult[] {
  const ctx = { platform: s.platform, objective: s.objective, niche: s.niche, month: s.month };
  const out: BenchmarkResult[] = [];
  const push = (r?: BenchmarkResult) => { if (r) out.push(r); };

  push(classifyMetric("ctr", s.resumo.ctr, ctx));
  push(classifyMetric("cpc", s.resumo.cpc_medio, ctx));
  if (s.resumo.cpm != null) push(classifyMetric("cpm", s.resumo.cpm, ctx));
  if (s.resumo.conversoes > 0) push(classifyMetric("cpl", s.resumo.custo_por_conversao, ctx));
  if (s.resumo.conversoes > 0 && s.resumo.taxa_conversao != null) {
    push(classifyMetric("taxa_conversao", s.resumo.taxa_conversao, ctx));
  }
  if (s.platform === "meta" && s.resumo.frequencia != null) {
    push(classifyMetric("frequencia", s.resumo.frequencia, ctx));
  }
  if (s.platform === "google") {
    if (s.resumo.quality_score_medio != null) push(classifyMetric("quality_score", s.resumo.quality_score_medio, ctx));
    if (s.resumo.impression_share != null) push(classifyMetric("impression_share", s.resumo.impression_share, ctx));
  }
  return out;
}

export function diagnoseChannel(s: AccountSnapshot): ChannelDiagnosis {
  const kpis = classifyKpis(s);
  const { checks, alerts } = runQualityGates(s);
  const health = computeHealthScore(checks);
  const prioritized = prioritizeAlerts(alerts);
  return {
    channel: s.channel,
    platform: s.platform,
    gasto: round2(s.resumo.gasto),
    conversoes: round2(s.resumo.conversoes),
    score: health.score,
    grade: health.grade,
    grade_significado: GRADE_MEANING[health.grade],
    kpis,
    alertas: prioritized,
    desperdicio_estimado: totalWaste(prioritized),
    checks_insuficientes: health.insuficientes,
  };
}

const CHANNEL_LABEL: Record<Channel, string> = { meta: "Meta Ads", google: "Google Ads", integrated: "Integrado" };

export function buildDiagnosis(input: {
  cliente: string;
  periodo: string;
  nicho: string;
  nicho_confianca: "alta" | "media" | "baixa";
  snapshots: AccountSnapshot[];
}): DiagnosisResult {
  const canais = input.snapshots.map(diagnoseChannel);
  const alertas = prioritizeAlerts(canais.flatMap((c) => c.alertas));
  const desperdicio = round2(canais.reduce((acc, c) => acc + c.desperdicio_estimado, 0));

  const linhas: string[] = [];
  linhas.push(`🩺 *Diagnóstico — ${input.cliente}*`);
  linhas.push(`Período: ${input.periodo} · nicho: ${input.nicho}${input.nicho_confianca === "baixa" ? " (régua geral)" : ""}`);

  for (const c of canais) {
    linhas.push("");
    linhas.push(`*${CHANNEL_LABEL[c.channel]}* — Health Score ${c.score}/100 (${c.grade}: ${c.grade_significado})`);
    linhas.push(`${moneyBR(c.gasto)} · ${intBR(c.conversoes)} conv.`);
    const kpiLine = c.kpis.map((k) => `${k.label} ${k.level}`).join(" · ");
    if (kpiLine) linhas.push(kpiLine);
  }

  const top = alertas.filter((a) => a.status !== "PASS").slice(0, 5);
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
    tipo: "diagnostico",
    cliente: input.cliente,
    periodo: input.periodo,
    nicho: input.nicho,
    nicho_confianca: input.nicho_confianca,
    canais,
    alertas,
    desperdicio_estimado: desperdicio,
    mensagem: linhas.join("\n"),
  };
}
