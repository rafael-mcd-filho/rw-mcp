// Auditoria e diagnóstico unificados V2.
// O score só é calculado depois de identificar objetivo, amostra, referência e tendência.

import { runQualityGates, totalRisk, type AccountSnapshot, type GateCampaign } from "./quality-gates.js";
import { computeHealthScore, GRADE_MEANING } from "./health-score.js";
import { prioritizeAlerts, alertLine } from "./alerts.js";
import { classifyKpis } from "./diagnosis.js";
import { analyzeLayer, type LayerAnalysis, type LayerKind } from "./layers.js";
import type {
  Alert,
  AuditGrade,
  BenchmarkResult,
  Channel,
  DimensionScore,
  Platform,
  Severity,
} from "./types.js";

type Verdict = "MANTER" | "OTIMIZAR" | "INVESTIGAR" | "OBSERVAR" | "SEM_ENTREGA";

export interface CampaignVerdict {
  nome: string;
  objetivo: string;
  resultado_label: string;
  gasto: number;
  resultado: number;
  conversoes: number;
  custo_por_resultado: number | null;
  veredito: Verdict;
  motivo: string;
  confianca: "alta" | "media" | "baixa";
}

export interface TrendSummary {
  label: string;
  current: number;
  previous?: number;
  baseline28?: number;
  delta_previous?: number | null;
  delta_baseline?: number | null;
  direction: "higher_better" | "lower_better" | "neutral";
}

export interface ChannelAudit {
  channel: Channel;
  platform: Platform;
  objetivo_predominante: string;
  gasto: number;
  conversoes: number;
  resultado_principal: number;
  resultado_label: string;
  custo_por_resultado: number | null;
  score: number | null;
  grade: AuditGrade;
  grade_significado: string;
  coverage: number;
  confidence: number;
  dimensoes: DimensionScore[];
  kpis: BenchmarkResult[];
  tendencias: TrendSummary[];
  campanhas: CampaignVerdict[];
  alertas: Alert[];
  layers: LayerAnalysis[];
  gasto_sob_risco: number;
  checks_insuficientes: string[];
  snapshot: AccountSnapshot;
}

export interface AnalysisResult {
  tipo: "analise";
  versao_motor: "2.0";
  cliente: string;
  periodo: string;
  nicho: string;
  nicho_confianca: "alta" | "media" | "baixa";
  canais: ChannelAudit[];
  score_geral: number | null;
  grade_geral: AuditGrade;
  grade_geral_significado: string;
  coverage: number;
  confidence: number;
  gasto_sob_risco_por_canal: Record<string, number>;
  gasto_sob_risco_por_categoria: Record<string, number>;
  gasto_sob_risco: number;
  plano_de_acao: { urgente: string[]; esta_semana: string[]; este_mes: string[] };
  mensagem: string;
  perfil_google?: BusinessProfileAudit;
}

export interface BusinessProfileAudit {
  score: number;
  grade: Exclude<AuditGrade, "N/A">;
  grade_significado: string;
  visualizacoes: number;
  busca: number;
  maps: number;
  rotas: number;
  ligacoes: number;
  cliques_site: number;
  avaliacoes: number;
  nota_media: number;
  novas_avaliacoes: number;
  taxa_resposta: number;
  alertas: Array<{ title: string; evidence: string; recommendation: string; severity: Severity }>;
}

export type AuditResult = AnalysisResult;

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const moneyBR = (n: number): string =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intBR = (n: number): string => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const delta = (current: number, previous?: number): number | null =>
  previous && Number.isFinite(previous) ? round2(((current - previous) / previous) * 100) : null;

function gradeFromScore(score: number | null): AuditGrade {
  if (score == null) return "N/A";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function judgeCampaign(campaign: GateCampaign): CampaignVerdict {
  const result = campaign.primary_result;
  const previousCost = campaign.previous?.custo_por_resultado;
  const sampleEnough =
    ["awareness", "video", "engagement"].includes(String(campaign.objective))
      ? campaign.impressoes >= 1_000 || campaign.gasto >= 30
      : campaign.cliques >= 10 || campaign.gasto >= 50;

  let veredito: Verdict;
  let motivo: string;
  let confidence: CampaignVerdict["confianca"];
  if (campaign.gasto === 0) {
    veredito = "SEM_ENTREGA";
    motivo = "Sem investimento no período.";
    confidence = "alta";
  } else if (result <= 0 && !sampleEnough) {
    veredito = "OBSERVAR";
    motivo = `Amostra ainda pequena: ${campaign.cliques} cliques e ${campaign.impressoes} impressões.`;
    confidence = "baixa";
  } else if (result <= 0) {
    veredito = "INVESTIGAR";
    motivo = `Não registrou ${String(campaign.primary_result_label ?? "o resultado principal").toLowerCase()} com amostra suficiente.`;
    confidence = "media";
  } else if (
    campaign.cost_per_result != null &&
    previousCost != null &&
    previousCost > 0 &&
    campaign.cost_per_result >= previousCost * 1.3
  ) {
    veredito = "OTIMIZAR";
    motivo = `${campaign.primary_result_label}: ${intBR(result)}; custo ${moneyBR(campaign.cost_per_result)} (+${round2((campaign.cost_per_result / previousCost - 1) * 100)}% vs. anterior).`;
    confidence = "alta";
  } else {
    veredito = "MANTER";
    motivo = `${campaign.primary_result_label}: ${intBR(result)}${campaign.cost_per_result != null ? `; custo ${moneyBR(campaign.cost_per_result)}` : ""}.`;
    confidence = previousCost ? "alta" : "media";
  }

  return {
    nome: campaign.nome,
    objetivo: campaign.objective_label ?? String(campaign.objective ?? "Não identificado"),
    resultado_label: campaign.primary_result_label ?? "Resultados",
    gasto: round2(campaign.gasto),
    resultado: round2(result),
    conversoes: round2(campaign.conversoes),
    custo_por_resultado: campaign.cost_per_result == null ? null : round2(campaign.cost_per_result),
    veredito,
    motivo,
    confianca: confidence,
  };
}

function trendSummaries(snapshot: AccountSnapshot): TrendSummary[] {
  const previous = snapshot.previous;
  const baseline = snapshot.baseline28;
  const rows: TrendSummary[] = [
    {
      label: "Investimento",
      current: snapshot.resumo.gasto,
      previous: previous?.gasto,
      baseline28: baseline?.gasto,
      direction: "neutral",
    },
    {
      label: snapshot.resumo.primary_result_label ?? "Resultados",
      current: snapshot.resumo.primary_result ?? snapshot.resumo.conversoes,
      previous: previous?.resultado,
      baseline28: baseline?.resultado,
      direction: "higher_better",
    },
    {
      label: "Custo por resultado",
      current: snapshot.resumo.cost_per_result ?? 0,
      previous: previous?.custo_por_resultado,
      baseline28: baseline?.custo_por_resultado,
      direction: "lower_better",
    },
    {
      label: "CTR",
      current: snapshot.resumo.ctr,
      previous: previous?.ctr,
      baseline28: baseline?.ctr,
      direction: "higher_better",
    },
    {
      label: "CPC",
      current: snapshot.resumo.cpc_medio,
      previous: previous?.cpc,
      baseline28: baseline?.cpc,
      direction: "lower_better",
    },
  ];
  return rows.map(row => ({
    ...row,
    delta_previous: delta(row.current, row.previous),
    delta_baseline: delta(row.current, row.baseline28),
  }));
}

function auditChannel(snapshot: AccountSnapshot): ChannelAudit {
  const kpis = classifyKpis(snapshot);
  const { checks, alerts } = runQualityGates(snapshot);
  const health = computeHealthScore(checks);
  const campaigns = [...snapshot.campanhas].sort((a, b) => b.gasto - a.gasto).map(judgeCampaign);
  const prioritized = prioritizeAlerts(alerts);
  const layers: LayerAnalysis[] = [];
  const addLayer = (entities: GateCampaign[] | undefined, kind: LayerKind, label: string) => {
    const layer = analyzeLayer(
      entities,
      kind,
      label,
      {
        platform: snapshot.platform,
        objective: snapshot.objective,
        niche: snapshot.niche,
        month: snapshot.month,
        history: snapshot.baseline28
          ? { ctr: snapshot.baseline28.ctr, cpc: snapshot.baseline28.cpc, cpm: snapshot.baseline28.cpm }
          : undefined,
      },
      snapshot.resumo.gasto
    );
    if (layer) layers.push(layer);
  };
  addLayer(snapshot.campanhas, "campanha", "Campanhas");
  addLayer(snapshot.conjuntos, snapshot.platform === "meta" ? "conjunto" : "grupo", snapshot.platform === "meta" ? "Conjuntos" : "Grupos de anúncios");
  addLayer(snapshot.anuncios, "anuncio", "Anúncios");

  return {
    channel: snapshot.channel,
    platform: snapshot.platform,
    objetivo_predominante: snapshot.objective_label ?? String(snapshot.objective ?? "Não identificado"),
    gasto: round2(snapshot.resumo.gasto),
    conversoes: round2(snapshot.resumo.conversoes),
    resultado_principal: round2(snapshot.resumo.primary_result ?? snapshot.resumo.conversoes),
    resultado_label: snapshot.resumo.primary_result_label ?? "Resultados",
    custo_por_resultado: snapshot.resumo.cost_per_result ?? null,
    score: health.score,
    grade: health.grade,
    grade_significado: GRADE_MEANING[health.grade],
    coverage: health.coverage,
    confidence: health.confidence,
    dimensoes: health.dimensions,
    kpis,
    tendencias: trendSummaries(snapshot),
    campanhas: campaigns,
    alertas: prioritized,
    layers,
    gasto_sob_risco: totalRisk(prioritized),
    checks_insuficientes: health.insuficientes,
    snapshot,
  };
}

const CHANNEL_LABEL: Record<Channel, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  integrated: "Integrado",
};

export function auditBusinessProfile(profile: {
  metricas: {
    visualizacoes_total: number;
    visualizacoes_busca: number;
    visualizacoes_maps: number;
    solicitacoes_rota: number;
    cliques_ligar: number;
    cliques_site: number;
  };
  avaliacoes: {
    total: number;
    nota_media: number;
    novas_no_periodo: number;
    taxa_resposta: number;
  };
}): BusinessProfileAudit {
  const alerts: BusinessProfileAudit["alertas"] = [];
  let score = 100;
  const interactions = profile.metricas.solicitacoes_rota + profile.metricas.cliques_ligar + profile.metricas.cliques_site;
  if (profile.metricas.visualizacoes_total === 0) {
    score -= 25;
    alerts.push({ title: "Perfil sem visualizações", severity: "ALTO", evidence: "Nenhuma visualização foi registrada no período.", recommendation: "Revisar elegibilidade, categoria, endereço e visibilidade do perfil." });
  }
  if (interactions === 0) {
    score -= 20;
    alerts.push({ title: "Perfil sem ações", severity: "ALTO", evidence: "Não houve rotas, ligações ou visitas ao site.", recommendation: "Reforçar oferta, fotos, descrição, produtos/serviços e chamadas para ação." });
  }
  if (profile.avaliacoes.nota_media > 0 && profile.avaliacoes.nota_media < 4) {
    score -= 20;
    alerts.push({ title: "Reputação abaixo do ideal", severity: "ALTO", evidence: `Nota média ${profile.avaliacoes.nota_media.toFixed(1)}.`, recommendation: "Criar rotina de recuperação de clientes e solicitação de avaliações legítimas." });
  } else if (profile.avaliacoes.nota_media > 0 && profile.avaliacoes.nota_media < 4.5) {
    score -= 10;
    alerts.push({ title: "Reputação pode melhorar", severity: "MEDIO", evidence: `Nota média ${profile.avaliacoes.nota_media.toFixed(1)}.`, recommendation: "Aumentar a cadência de avaliações recentes e responder feedbacks críticos." });
  }
  if (profile.avaliacoes.taxa_resposta < 50 && profile.avaliacoes.total > 0) {
    score -= 15;
    alerts.push({ title: "Baixa resposta às avaliações", severity: "ALTO", evidence: `Taxa de resposta ${profile.avaliacoes.taxa_resposta.toFixed(1)}%.`, recommendation: "Responder avaliações positivas e negativas com linguagem personalizada." });
  } else if (profile.avaliacoes.taxa_resposta < 80 && profile.avaliacoes.total > 0) {
    score -= 8;
    alerts.push({ title: "Respostas às avaliações incompletas", severity: "MEDIO", evidence: `Taxa de resposta ${profile.avaliacoes.taxa_resposta.toFixed(1)}%.`, recommendation: "Buscar taxa de resposta superior a 80%." });
  }
  if (profile.avaliacoes.novas_no_periodo === 0) {
    score -= 5;
    alerts.push({ title: "Sem novas avaliações", severity: "BAIXO", evidence: "Nenhuma avaliação nova foi recebida no período.", recommendation: "Ativar uma rotina contínua de solicitação de avaliações após o atendimento." });
  }
  score = Math.max(0, Math.round(score));
  const grade = gradeFromScore(score) as Exclude<AuditGrade, "N/A">;
  return {
    score,
    grade,
    grade_significado: GRADE_MEANING[grade],
    visualizacoes: profile.metricas.visualizacoes_total,
    busca: profile.metricas.visualizacoes_busca,
    maps: profile.metricas.visualizacoes_maps,
    rotas: profile.metricas.solicitacoes_rota,
    ligacoes: profile.metricas.cliques_ligar,
    cliques_site: profile.metricas.cliques_site,
    avaliacoes: profile.avaliacoes.total,
    nota_media: profile.avaliacoes.nota_media,
    novas_avaliacoes: profile.avaliacoes.novas_no_periodo,
    taxa_resposta: profile.avaliacoes.taxa_resposta,
    alertas: alerts,
  };
}

export function buildAnalysis(input: {
  cliente: string;
  periodo: string;
  nicho: string;
  nicho_confianca: "alta" | "media" | "baixa";
  snapshots: AccountSnapshot[];
}): AnalysisResult {
  const channels = input.snapshots.map(auditChannel);
  const alerts = prioritizeAlerts(channels.flatMap(channel => channel.alertas)).filter(alert => alert.status !== "PASS");
  const riskByCategory: Record<string, number> = {};
  for (const alert of alerts) {
    if (alert.riskEstimate) {
      riskByCategory[alert.category] = round2((riskByCategory[alert.category] ?? 0) + alert.riskEstimate);
    }
  }
  const riskByChannel = Object.fromEntries(channels.map(channel => [channel.channel, channel.gasto_sob_risco]));
  const totalRiskValue = round2(Object.values(riskByChannel).reduce((sum, value) => sum + value, 0));
  const scored = channels.filter(channel => channel.score != null);
  const score = scored.length
    ? Math.round(scored.reduce((sum, channel) => sum + (channel.score as number) * Math.max(0.25, channel.confidence / 100), 0) /
        scored.reduce((sum, channel) => sum + Math.max(0.25, channel.confidence / 100), 0))
    : null;
  const grade = gradeFromScore(score);
  const coverage = channels.length ? Math.round(channels.reduce((sum, channel) => sum + channel.coverage, 0) / channels.length) : 0;
  const confidence = channels.length ? Math.round(channels.reduce((sum, channel) => sum + channel.confidence, 0) / channels.length) : 0;

  const action = (alert: Alert) =>
    `${alert.riskEstimate ? `[${moneyBR(alert.riskEstimate)} sob risco] ` : ""}${alert.evidence} → ${alert.recommendation}`;
  const bucket = (severities: Severity[]) =>
    alerts
      .filter(alert => severities.includes(alert.severity))
      .sort((a, b) => (b.riskEstimate ?? 0) - (a.riskEstimate ?? 0))
      .map(action);

  const message: string[] = [
    `🩺 *Análise - ${input.cliente}*`,
    `Período: ${input.periodo} · ${input.nicho}${input.nicho_confianca === "baixa" ? " (benchmark geral; baixa confiança)" : ""}`,
  ];
  for (const channel of channels) {
    const scoreText = channel.score == null ? "não calculado" : `${channel.score}/100 (${channel.grade})`;
    message.push(
      "",
      `*${CHANNEL_LABEL[channel.channel]}* - ${scoreText} · confiança ${channel.confidence}%`,
      `Objetivo predominante: ${channel.objetivo_predominante}`,
      `${moneyBR(channel.gasto)} · ${intBR(channel.resultado_principal)} ${channel.resultado_label.toLowerCase()}${channel.custo_por_resultado != null ? ` · ${moneyBR(channel.custo_por_resultado)} por resultado` : ""}`
    );
    const top = channel.alertas[0];
    if (top) message.push(`Resumo: ${alertLine(top)}`);
  }
  if (totalRiskValue > 0) {
    message.push("", `💸 Gasto sob risco: ${moneyBR(totalRiskValue)}. É uma estimativa de exposição, não desperdício confirmado.`);
  }

  return {
    tipo: "analise",
    versao_motor: "2.0",
    cliente: input.cliente,
    periodo: input.periodo,
    nicho: input.nicho,
    nicho_confianca: input.nicho_confianca,
    canais: channels,
    score_geral: score,
    grade_geral: grade,
    grade_geral_significado: GRADE_MEANING[grade],
    coverage,
    confidence,
    gasto_sob_risco_por_canal: riskByChannel,
    gasto_sob_risco_por_categoria: riskByCategory,
    gasto_sob_risco: totalRiskValue,
    plano_de_acao: {
      urgente: bucket(["CRITICO"]),
      esta_semana: bucket(["ALTO"]),
      este_mes: bucket(["MEDIO", "BAIXO"]),
    },
    mensagem: message.join("\n"),
  };
}

export const buildAudit = buildAnalysis;
