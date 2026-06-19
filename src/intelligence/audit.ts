// Modo Auditoria — revisão profunda: tudo do diagnóstico + veredito por
// campanha, desperdício por categoria e plano de ação priorizado por impacto.

import { runQualityGates, totalWaste, type AccountSnapshot, type GateCampaign } from "./quality-gates.js";
import { computeHealthScore, GRADE_MEANING } from "./health-score.js";
import { prioritizeAlerts, alertLine } from "./alerts.js";
import { classifyKpis } from "./diagnosis.js";
import type { Alert, BenchmarkResult, Channel, Platform } from "./types.js";

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
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  grade_significado: string;
  kpis: BenchmarkResult[];
  campanhas: CampaignVerdict[];
  alertas: Alert[];
  checks_insuficientes: string[];
}

export interface AuditResult {
  tipo: "auditoria";
  cliente: string;
  periodo: string;
  nicho: string;
  canais: ChannelAudit[];
  desperdicio_por_categoria: Record<string, number>;
  desperdicio_estimado: number;
  plano_de_acao: { urgente: string[]; esta_semana: string[]; este_mes: string[] };
  mensagem: string;
}

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
  return {
    channel: s.channel,
    platform: s.platform,
    score: health.score,
    grade: health.grade,
    grade_significado: GRADE_MEANING[health.grade],
    kpis,
    campanhas,
    alertas: prioritizeAlerts(alerts),
    checks_insuficientes: health.insuficientes,
  };
}

const CHANNEL_LABEL: Record<Channel, string> = { meta: "Meta Ads", google: "Google Ads", integrated: "Integrado" };

export function buildAudit(input: {
  cliente: string;
  periodo: string;
  nicho: string;
  snapshots: AccountSnapshot[];
}): AuditResult {
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

  const linhas: string[] = [];
  linhas.push(`📋 *Auditoria — ${input.cliente}*`);
  linhas.push(`Período: ${input.periodo} · nicho: ${input.nicho}`);

  for (const c of canais) {
    linhas.push("", `*${CHANNEL_LABEL[c.channel]}* — Health Score ${c.score}/100 (${c.grade})`);
    const kpiLine = c.kpis.map((k) => `${k.label} ${k.level}`).join(" · ");
    if (kpiLine) linhas.push(kpiLine);
    const pausar = c.campanhas.filter((v) => v.veredito === "PAUSAR");
    if (pausar.length) {
      linhas.push("Pausar/revisar: " + pausar.map((v) => `${v.nome} (${moneyBR(v.gasto)})`).join(", "));
    }
  }

  if (desperdicio > 0) {
    linhas.push("", `💸 *Desperdício estimado: ${moneyBR(desperdicio)}*`);
    for (const [cat, val] of Object.entries(desperdicioPorCategoria).sort((a, b) => b[1] - a[1])) {
      linhas.push(`  • ${cat}: ${moneyBR(val)}`);
    }
  }

  const planoLinhas: string[] = [];
  if (plano.urgente.length) planoLinhas.push("🔴 *Urgente*", ...plano.urgente.map((p) => `- ${p}`));
  if (plano.esta_semana.length) planoLinhas.push("🟠 *Esta semana*", ...plano.esta_semana.map((p) => `- ${p}`));
  if (plano.este_mes.length) planoLinhas.push("🟡 *Este mês*", ...plano.este_mes.map((p) => `- ${p}`));
  if (planoLinhas.length) linhas.push("", "*Plano de ação*", ...planoLinhas);

  const insuf = [...new Set(canais.flatMap((c) => c.checks_insuficientes))];
  if (insuf.length) {
    linhas.push("", `ℹ️ Checks sem dados suficientes (não entram na nota): ${insuf.join(", ")}.`);
  }

  return {
    tipo: "auditoria",
    cliente: input.cliente,
    periodo: input.periodo,
    nicho: input.nicho,
    canais,
    desperdicio_por_categoria: desperdicioPorCategoria,
    desperdicio_estimado: desperdicio,
    plano_de_acao: plano,
    mensagem: linhas.join("\n"),
  };
}
