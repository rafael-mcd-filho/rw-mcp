// Modo Auditoria — revisão profunda: tudo do diagnóstico + veredito por
// campanha, desperdício por categoria e plano de ação priorizado por impacto.

import { runQualityGates, totalWaste, type AccountSnapshot, type GateCampaign } from "./quality-gates.js";
import { computeHealthScore, GRADE_MEANING } from "./health-score.js";
import { prioritizeAlerts, alertLine } from "./alerts.js";
import { classifyKpis } from "./diagnosis.js";
import { analyzeLayer, type LayerAnalysis, type LayerKind } from "./layers.js";
import type { Alert, BenchmarkResult, Channel, ClassifyContext, Platform, Severity } from "./types.js";

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
  score_geral: number;
  grade_geral: "A" | "B" | "C" | "D" | "F";
  grade_geral_significado: string;
  desperdicio_por_canal: Record<string, number>;
  desperdicio_por_categoria: Record<string, number>;
  desperdicio_estimado: number;
  plano_de_acao: { urgente: string[]; esta_semana: string[]; este_mes: string[] };
  mensagem: string;
  perfil_google?: BusinessProfileAudit;
}

export interface BusinessProfileAudit {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
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

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function auditBusinessProfile(profile: {
  metricas: {
    visualizacoes_total: number; visualizacoes_busca: number; visualizacoes_maps: number;
    solicitacoes_rota: number; cliques_ligar: number; cliques_site: number;
  };
  avaliacoes: {
    total: number; nota_media: number; novas_no_periodo: number; taxa_resposta: number;
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
  const grade = gradeFromScore(score);
  return {
    score, grade, grade_significado: GRADE_MEANING[grade],
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
  const canais = input.snapshots.map(auditChannel);
  const alertas = prioritizeAlerts(canais.flatMap((c) => c.alertas)).filter((a) => a.status !== "PASS");

  const desperdicioPorCategoria: Record<string, number> = {};
  for (const a of alertas) {
    if (a.impactEstimate) {
      desperdicioPorCategoria[a.category] = round2((desperdicioPorCategoria[a.category] ?? 0) + a.impactEstimate);
    }
  }
  const desperdicio = round2(Object.values(desperdicioPorCategoria).reduce((acc, v) => acc + v, 0));
  const desperdicioPorCanal = Object.fromEntries(
    canais.map(c => [c.channel, round2(c.desperdicio_estimado)])
  );
  const scoreGeral = canais.length
    ? Math.round(canais.reduce((sum, channel) => sum + channel.score, 0) / canais.length)
    : 0;
  const gradeGeral = gradeFromScore(scoreGeral);

  // Plano ordenado por R$ economizado dentro de cada bucket; prefixa o impacto.
  const planoItem = (a: Alert) =>
    `${a.impactEstimate ? `[${moneyBR(a.impactEstimate)}] ` : ""}${a.evidence} → ${a.recommendation}`;
  const bucket = (sevs: Severity[]) =>
    alertas
      .filter((a) => sevs.includes(a.severity))
      .sort((x, y) => (y.impactEstimate ?? 0) - (x.impactEstimate ?? 0))
      .map(planoItem);
  const plano = {
    urgente: bucket(["CRITICO"]),
    esta_semana: bucket(["ALTO"]),
    este_mes: bucket(["MEDIO", "BAIXO"]),
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
    score_geral: scoreGeral,
    grade_geral: gradeGeral,
    grade_geral_significado: GRADE_MEANING[gradeGeral],
    desperdicio_por_canal: desperdicioPorCanal,
    desperdicio_por_categoria: desperdicioPorCategoria,
    desperdicio_estimado: desperdicio,
    plano_de_acao: plano,
    mensagem: linhas.join("\n"),
  };
}

/** @deprecated diagnóstico e auditoria foram unificados — use buildAnalysis. */
export const buildAudit = buildAnalysis;
