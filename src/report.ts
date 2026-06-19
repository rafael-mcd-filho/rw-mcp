// Agrega as linhas cruas de insights da Meta e monta uma saída estruturada +
// uma mensagem formatada (estilo WhatsApp), com detecção automática de objetivo.
// Consolida toda a lógica que antes estava repetida nos nodes de Code do n8n.

import type { Insight } from "./meta-api.js";
import {
  mergeActionSummary,
  pickActionValue,
  summarizeActionMetrics,
  toNumber,
  type ActionSummary,
} from "./action-normalizer.js";
import {
  detectCategory,
  type CategoryConfig,
  type ObjectiveCategory,
} from "./objectives.js";

// ─── Helpers de número/formatação (pt-BR) ─────────────────────────────────────

const toNum = (v: unknown): number =>
  v == null ? 0 : parseFloat(String(v).replace(",", ".")) || 0;
const toInt = (v: unknown): number =>
  v == null ? 0 : parseInt(String(v), 10) || 0;

const moneyBR = (n: number): string =>
  n == null || isNaN(n)
    ? "—"
    : "R$ " +
      n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const intBR = (n: number): string =>
  n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("pt-BR");

const pctBR = (n: number): string =>
  n == null || isNaN(n)
    ? "—"
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + "%";

const dateBR = (iso: string): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** Formata a variação: " (+12,3%)" | " (-8,0%)" | " (—)". */
const varFmt = (pct: number | null): string => {
  if (pct == null || isNaN(pct)) return " (—)";
  const sign = pct > 0 ? "+" : "";
  return ` (${sign}${pct.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%)`;
};

// ─── Agregação ────────────────────────────────────────────────────────────────

export interface Aggregated {
  date_start: string;
  date_stop: string;
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalReach: number;
  totalConversoes: number;
  totalThruplay: number;
  actionTypeUsado: string | null;
  avgCPC: number;
  avgCPM: number;
  avgCPP: number;
  avgCTR: number;
  avgFrequency: number;
  cpa: number;
  totalActionValue: number;
  purchaseRoas: number;
  /** Todos os action_types somados, para transparência/correção manual. */
  actionsDisponiveis: Record<string, number>;
  /** Actions agrupadas por nome canonico, para leitura sem duplicidade visual. */
  actionsNormalizadas: Record<string, number>;
  costPerActionType: Record<string, number>;
  costPerActionTypeNormalizado: Record<string, number>;
  actionValues: Record<string, number>;
  actionValuesNormalizado: Record<string, number>;
  rankings: {
    quality?: string;
    engagementRate?: string;
    conversionRate?: string;
  };
}

/** Escolhe o action_type de conversão pela prioridade da categoria. */
function pickActionType(
  actionsSummary: ActionSummary,
  config: CategoryConfig,
  override?: string
): string | null {
  if (override) return override;
  for (const at of config.actionPriority) {
    if (pickActionValue(actionsSummary, at) > 0) return at;
  }
  return config.actionPriority[0] ?? null;
}

/** Soma as linhas (nível ad/campaign) em totais e deriva as métricas. */
export function aggregate(
  rows: Insight[],
  config: CategoryConfig,
  override?: string
): Aggregated {
  let totalSpend = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalReach = 0;
  let totalThruplay = 0;
  const actionsSummary: ActionSummary = { raw: {}, normalized: {} };
  const costSummary: ActionSummary = { raw: {}, normalized: {} };
  const valueSummary: ActionSummary = { raw: {}, normalized: {} };
  let purchaseRoasTotal = 0;
  let purchaseRoasCount = 0;
  const rankings: Aggregated["rankings"] = {};

  let date_start = rows[0]?.date_start ?? "";
  let date_stop = rows[0]?.date_stop ?? "";

  for (const r of rows) {
    totalSpend += toNum(r.spend);
    totalClicks += toInt(r.clicks);
    totalImpressions += toInt(r.impressions);
    totalReach += toInt(r.reach);
    if (r.date_start < date_start) date_start = r.date_start;
    if (r.date_stop > date_stop) date_stop = r.date_stop;

    mergeActionSummary(actionsSummary, summarizeActionMetrics(r.actions));
    mergeActionSummary(costSummary, summarizeActionMetrics(r.cost_per_action_type));
    mergeActionSummary(valueSummary, summarizeActionMetrics(r.action_values));

    if (Array.isArray(r.video_thruplay_watched_actions)) {
      for (const a of r.video_thruplay_watched_actions) {
        totalThruplay += toInt(a.value);
      }
    }
    for (const roas of r.purchase_roas ?? []) {
      purchaseRoasTotal += toNumber(roas.value);
      purchaseRoasCount += 1;
    }
    rankings.quality ??= r.quality_ranking;
    rankings.engagementRate ??= r.engagement_rate_ranking;
    rankings.conversionRate ??= r.conversion_rate_ranking;
  }

  const actionTypeUsado = pickActionType(actionsSummary, config, override);
  const totalConversoes = actionTypeUsado
    ? pickActionValue(actionsSummary, actionTypeUsado)
    : 0;

  // Métricas derivadas calculadas a partir dos totais (ponderadas/corretas).
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCPP = totalReach > 0 ? (totalSpend / totalReach) * 1000 : 0;
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;
  const cpa = totalConversoes > 0 ? totalSpend / totalConversoes : 0;
  const totalActionValue = Object.values(valueSummary.normalized).reduce(
    (sum, value) => sum + value,
    0
  );

  return {
    date_start,
    date_stop,
    totalSpend,
    totalClicks,
    totalImpressions,
    totalReach,
    totalConversoes,
    totalThruplay,
    actionTypeUsado,
    avgCPC,
    avgCPM,
    avgCPP,
    avgCTR,
    avgFrequency,
    cpa,
    totalActionValue,
    purchaseRoas: purchaseRoasCount > 0 ? purchaseRoasTotal / purchaseRoasCount : 0,
    actionsDisponiveis: actionsSummary.raw,
    actionsNormalizadas: actionsSummary.normalized,
    costPerActionType: costSummary.raw,
    costPerActionTypeNormalizado: costSummary.normalized,
    actionValues: valueSummary.raw,
    actionValuesNormalizado: valueSummary.normalized,
    rankings,
  };
}

const diff = (a: number, b: number): number | null =>
  b === 0 ? null : ((a - b) / b) * 100;

// ─── Diagnósticos (referenciais, sem recomendações operacionais) ──────────────

function diagnostics(category: ObjectiveCategory, a: Aggregated): string[] {
  const notas: string[] = [];
  const ctrPct = a.avgCTR > 1 ? a.avgCTR : a.avgCTR * 100;

  switch (category) {
    case "messages":
    case "sales":
      if (a.cpa > 0)
        notas.push(
          a.cpa <= 4.5
            ? "CPA em patamar positivo para captação via WhatsApp."
            : "CPA em patamar intermediário para captação via WhatsApp."
        );
      notas.push(
        ctrPct >= 1
          ? "CTR dentro da faixa esperada para tráfego de mensagens."
          : "CTR abaixo do esperado para o segmento."
      );
      if (a.avgCPC > 0)
        notas.push(
          a.avgCPC < 1
            ? "CPC em faixa baixa para o nicho."
            : "CPC dentro da média para o nicho."
        );
      break;
    case "lead_form":
      if (a.cpa > 0)
        notas.push(
          a.cpa <= 7
            ? "CPL em patamar baixo para captação de leads."
            : a.cpa <= 15
            ? "CPL em patamar intermediário para captação de leads."
            : "CPL em patamar alto para captação de leads."
        );
      notas.push(
        ctrPct < 1
          ? "CTR abaixo de 1%."
          : ctrPct <= 3
          ? "CTR dentro da faixa usual para geração de leads."
          : "CTR em faixa alta para geração de leads."
      );
      break;
    case "profile":
      if (a.avgCPM > 0)
        notas.push(
          a.avgCPM < 5
            ? "CPM em faixa baixa para tráfego/visibilidade."
            : a.avgCPM <= 15
            ? "CPM dentro da faixa usual para tráfego/visibilidade."
            : "CPM acima da faixa usual para tráfego/visibilidade."
        );
      if (a.totalSpend > 0) {
        const visitasPorReal = a.totalConversoes / a.totalSpend;
        notas.push(
          visitasPorReal >= 3
            ? "Relação visitas por real investido elevada."
            : visitasPorReal >= 1
            ? "Relação visitas por real investido dentro do esperado."
            : "Relação visitas por real investido abaixo do esperado."
        );
      }
      break;
    case "awareness": {
      if (a.avgCPM > 0)
        notas.push(
          a.avgCPM < 5
            ? "CPM em faixa baixa para reconhecimento."
            : a.avgCPM <= 15
            ? "CPM dentro da faixa usual para reconhecimento."
            : "CPM acima da faixa usual para reconhecimento."
        );
      const cpr = a.totalReach > 0 ? a.totalSpend / a.totalReach : 0;
      if (cpr > 0)
        notas.push(
          cpr <= 0.005
            ? "CPR em patamar baixo."
            : cpr <= 0.015
            ? "CPR em patamar intermediário."
            : "CPR em patamar alto."
        );
      break;
    }
    case "engagement":
      notas.push(
        ctrPct < 0.5
          ? "CTR baixo — conteúdo pode não estar chamando atenção."
          : ctrPct < 1
          ? "CTR razoável — pode melhorar com ajustes criativos."
          : "CTR bom — conteúdo está gerando interesse."
      );
      if (a.avgCPM > 0)
        notas.push(
          a.avgCPM > 20
            ? "CPM alto — possível necessidade de otimizar segmentação."
            : "CPM saudável para campanhas de engajamento."
        );
      break;
  }
  return notas;
}

// ─── Montagem da mensagem ─────────────────────────────────────────────────────

function headlineValue(config: CategoryConfig, a: Aggregated): string {
  return config.primaryMetric === "reach"
    ? intBR(a.totalReach)
    : intBR(a.totalConversoes);
}

function costValue(config: CategoryConfig, a: Aggregated): string {
  if (config.primaryMetric === "reach") {
    const cpr = a.totalReach > 0 ? a.totalSpend / a.totalReach : 0;
    return moneyBR(cpr);
  }
  return moneyBR(a.cpa);
}

/** Mensagem de período único. */
function buildSingleMessage(config: CategoryConfig, a: Aggregated): string {
  const linhas = [
    `${config.emoji} *Resumo — ${config.title}*`,
    `Período: ${dateBR(a.date_start)} → ${dateBR(a.date_stop)}`,
    ``,
    `• Investimento: ${moneyBR(a.totalSpend)}`,
    `• ${config.headlineLabel}: ${headlineValue(config, a)}`,
    `• ${config.costLabel}: ${costValue(config, a)}`,
    `• Cliques: ${intBR(a.totalClicks)}`,
    `• CTR médio: ${pctBR(a.avgCTR)}`,
    `• CPC médio: ${moneyBR(a.avgCPC)}`,
    `• CPM médio: ${moneyBR(a.avgCPM)}`,
  ];
  if (config.category === "awareness" && a.totalThruplay > 0) {
    const custoThruplay = a.totalSpend / a.totalThruplay;
    linhas.push(
      `• ThruPlay (vídeo): ${intBR(a.totalThruplay)}`,
      `• Custo por ThruPlay: ${moneyBR(custoThruplay)}`
    );
  }
  if (config.footnote) linhas.push(``, `ℹ️ ${config.footnote}`);
  const notas = diagnostics(config.category, a);
  if (notas.length) linhas.push(``, `📎 *Observações*`, `- ${notas.join("\n- ")}`);
  return linhas.join("\n");
}

/** Mensagem comparativa entre dois períodos. */
function buildComparisonMessage(
  config: CategoryConfig,
  atual: Aggregated,
  anterior: Aggregated
): string {
  const headlineDiff =
    config.primaryMetric === "reach"
      ? diff(atual.totalReach, anterior.totalReach)
      : diff(atual.totalConversoes, anterior.totalConversoes);
  const costAtual =
    config.primaryMetric === "reach"
      ? atual.totalReach > 0
        ? atual.totalSpend / atual.totalReach
        : 0
      : atual.cpa;
  const costAnterior =
    config.primaryMetric === "reach"
      ? anterior.totalReach > 0
        ? anterior.totalSpend / anterior.totalReach
        : 0
      : anterior.cpa;

  const linhas = [
    `${config.emoji} *Resumo comparativo — ${config.title}*`,
    `Atual: ${dateBR(atual.date_start)} → ${dateBR(atual.date_stop)}`,
    `Anterior: ${dateBR(anterior.date_start)} → ${dateBR(anterior.date_stop)}`,
    ``,
    `• Investimento: ${moneyBR(atual.totalSpend)}${varFmt(
      diff(atual.totalSpend, anterior.totalSpend)
    )}`,
    `• ${config.headlineLabel}: ${headlineValue(config, atual)}${varFmt(
      headlineDiff
    )}`,
    `• ${config.costLabel}: ${costValue(config, atual)}${varFmt(
      diff(costAtual, costAnterior)
    )}`,
    `• Cliques: ${intBR(atual.totalClicks)}${varFmt(
      diff(atual.totalClicks, anterior.totalClicks)
    )}`,
    `• Impressões: ${intBR(atual.totalImpressions)}${varFmt(
      diff(atual.totalImpressions, anterior.totalImpressions)
    )}`,
    `• CTR médio: ${pctBR(atual.avgCTR)}${varFmt(
      diff(atual.avgCTR, anterior.avgCTR)
    )}`,
    `• CPM médio: ${moneyBR(atual.avgCPM)}${varFmt(
      diff(atual.avgCPM, anterior.avgCPM)
    )}`,
  ];
  if (config.category === "awareness" && atual.totalThruplay > 0) {
    const custoAtual = atual.totalSpend / atual.totalThruplay;
    const custoAnterior =
      anterior.totalThruplay > 0
        ? anterior.totalSpend / anterior.totalThruplay
        : 0;
    linhas.push(
      `• ThruPlay (vídeo): ${intBR(atual.totalThruplay)}${varFmt(
        diff(atual.totalThruplay, anterior.totalThruplay)
      )}`,
      `• Custo por ThruPlay: ${moneyBR(custoAtual)}${varFmt(
        diff(custoAtual, custoAnterior)
      )}`
    );
  }
  if (config.footnote) linhas.push(``, `ℹ️ ${config.footnote}`);
  const notas = diagnostics(config.category, atual);
  if (notas.length) linhas.push(``, `📎 *Observações*`, `- ${notas.join("\n- ")}`);
  return linhas.join("\n");
}

// ─── API pública do módulo ────────────────────────────────────────────────────

export interface ReportInput {
  campaignName: string;
  metaObjective?: string;
  /** Linhas do período principal (atual). */
  rows: Insight[];
  /** Linhas do período de comparação (opcional). */
  comparisonRows?: Insight[];
  /** Força um action_type específico de conversão. */
  actionTypeOverride?: string;
}

export function buildReport(input: ReportInput) {
  const config = detectCategory(input.campaignName, input.metaObjective);
  const atual = aggregate(input.rows, config, input.actionTypeOverride);

  const base = {
    campanha: {
      nome: input.campaignName,
      objetivo_meta: input.metaObjective ?? null,
      categoria_detectada: config.category,
      action_type_usado: atual.actionTypeUsado,
    },
    action_types_disponiveis: atual.actionsDisponiveis,
    action_types_normalizados: atual.actionsNormalizadas,
    cost_per_action_type: atual.costPerActionType,
    action_values: atual.actionValues,
  };

  if (input.comparisonRows && input.comparisonRows.length) {
    const anterior = aggregate(
      input.comparisonRows,
      config,
      input.actionTypeOverride
    );
    return {
      ...base,
      atual,
      anterior,
      mensagem: buildComparisonMessage(config, atual, anterior),
    };
  }

  return {
    ...base,
    atual,
    mensagem: buildSingleMessage(config, atual),
  };
}

// ─── Relatório da conta inteira ───────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Resultado principal de uma campanha (valor + custo), conforme o objetivo. */
function campaignResult(config: CategoryConfig, a: Aggregated) {
  if (config.primaryMetric === "reach") {
    const cpr = a.totalReach > 0 ? a.totalSpend / a.totalReach : 0;
    return { valor: a.totalReach, custo: cpr };
  }
  return { valor: a.totalConversoes, custo: a.cpa };
}

/**
 * Recebe as linhas de insights ao nível de campanha (uma por campanha) da conta
 * inteira e devolve um resumo consolidado: cada campanha com seu objetivo
 * detectado e resultado, mais os totais e uma mensagem formatada.
 */
export function buildAccountReport(
  rows: Insight[],
  periodoLabel: string
) {
  const campanhas = rows.map((r) => {
    const config = detectCategory(r.campaign_name ?? "", r.objective);
    const agg = aggregate([r], config);
    const { valor, custo } = campaignResult(config, agg);
    return {
      nome: r.campaign_name ?? "(sem nome)",
      categoria: config.category,
      emoji: config.emoji,
      headlineLabel: config.headlineLabel,
      costLabel: config.costLabel,
      categoriaLabel: config.title,
      primaryMetric: config.primaryMetric,
      gasto: agg.totalSpend,
      resultado: valor,
      custo,
      cliques: agg.totalClicks,
      impressoes: agg.totalImpressions,
      alcance: agg.totalReach,
      ctr: agg.avgCTR,
      cpc: agg.avgCPC,
      cpm: agg.avgCPM,
      frequencia: agg.avgFrequency,
      thruplay: agg.totalThruplay,
      valorConversao: agg.totalActionValue,
      roas: agg.purchaseRoas,
      rankings: agg.rankings,
      actionTypeUsado: agg.actionTypeUsado,
      actionsNormalizadas: agg.actionsNormalizadas,
      costPerActionTypeNormalizado: agg.costPerActionTypeNormalizado,
      actionValuesNormalizado: agg.actionValuesNormalizado,
    };
  });

  // Ordena por gasto (maior primeiro)
  campanhas.sort((a, b) => b.gasto - a.gasto);

  const totalGasto =
    Math.round(campanhas.reduce((s, c) => s + c.gasto, 0) * 100) / 100;
  const totaisPorCategoria: Record<string, number> = {};
  for (const c of campanhas) {
    totaisPorCategoria[c.categoria] =
      (totaisPorCategoria[c.categoria] ?? 0) + c.resultado;
  }

  // Mensagem formatada
  const linhas = [`📊 *Relatório da conta — ${periodoLabel}*`, ``];
  for (const c of campanhas) {
    const custoStr = c.resultado > 0 ? moneyBR(c.custo) : "—";
    linhas.push(
      `${c.emoji} *${c.nome}*`,
      `   ${moneyBR(c.gasto)} · ${c.headlineLabel}: ${intBR(c.resultado)} · ${c.costLabel}: ${custoStr}`
    );
  }
  linhas.push(``, `*Total investido: ${moneyBR(totalGasto)}*`);
  const leadsForm = totaisPorCategoria["lead_form"] ?? 0;
  const conversas = totaisPorCategoria["messages"] ?? 0;
  const destaques: string[] = [];
  if (leadsForm > 0) destaques.push(`Leads (formulário): ${intBR(leadsForm)}`);
  if (conversas > 0) destaques.push(`Conversas (WhatsApp): ${intBR(conversas)}`);
  if (destaques.length) linhas.push(destaques.join(" · "));

  return {
    periodo: periodoLabel,
    totais: { gasto: totalGasto, por_categoria: totaisPorCategoria },
    campanhas,
    mensagem: linhas.join("\n"),
  };
}

// ─── Modelo de dados para o PDF ───────────────────────────────────────────────

const CONVERSION_CATEGORIES = new Set(["lead_form", "messages", "sales"]);

type PdfReportKind =
  | "mixed"
  | "google"
  | "google_comparison"
  | "integrated"
  | "integrated_comparison"
  | "lead"
  | "messages"
  | "awareness"
  | "profile"
  | "sales"
  | "engagement";

interface PdfKpiCard {
  label: string;
  value: string;
  note: string;
  tone: "red" | "black";
}

export interface PdfCampaignRow {
  nome: string;
  categoria: string;
  headlineLabel: string;
  costLabel: string;
  categoriaLabel: string;
  primaryMetric: "conversion" | "reach";
  gasto: number;
  resultado: number;
  custo: number;
  cliques: number;
  impressoes: number;
  alcance: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequencia: number;
  thruplay: number;
  valorConversao: number;
  roas: number;
}

export interface PdfObjectiveSummary {
  category: string;
  label: string;
  headlineLabel: string;
  costLabel: string;
  primaryMetric: "conversion" | "reach";
  campaignsCount: number;
  gasto: number;
  resultado: number;
  custo: number;
  cliques: number;
  impressoes: number;
  alcance: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequencia: number;
  valorConversao: number;
  roas: number;
}

export interface PdfReportModel {
  kind: PdfReportKind;
  cliente: string;
  periodo: string;
  geradoEm: string;
  meta: {
    clientName: string;
    periodLabel: string;
    channels: string[];
    sourceLabel: string;
  };
  resumo: {
    gastoTotal: number;
    leads: number;
    conversas: number;
    kpis: PdfKpiCard[];
    leituraExecutiva: string[];
  };
  objetivoPrincipal: PdfObjectiveSummary | null;
  objetivos: PdfObjectiveSummary[];
  campanhas: PdfCampaignRow[];
  serieDiaria: Array<{ data: string; gasto: number; resultados: number }>;
  notasMetodologicas: string[];
  proximosPassos: string[];
}

function summarizeObjectives(
  campanhas: PdfCampaignRow[]
): PdfObjectiveSummary[] {
  const grouped: Record<string, PdfObjectiveSummary | undefined> = {};

  for (const c of campanhas) {
    const existing = grouped[c.categoria];
    if (!existing) {
      grouped[c.categoria] = {
        category: c.categoria,
        label: c.categoriaLabel,
        headlineLabel: c.headlineLabel,
        costLabel: c.costLabel,
        primaryMetric: c.primaryMetric,
        campaignsCount: 0,
        gasto: 0,
        resultado: 0,
        custo: 0,
        cliques: 0,
        impressoes: 0,
        alcance: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequencia: 0,
        valorConversao: 0,
        roas: 0,
      };
    }

    const target = grouped[c.categoria]!;
    target.campaignsCount += 1;
    target.gasto += c.gasto;
    target.resultado += c.resultado;
    target.cliques += c.cliques;
    target.impressoes += c.impressoes;
    target.alcance += c.alcance;
    target.valorConversao += c.valorConversao;
  }

  return Object.values(grouped)
    .filter((o): o is PdfObjectiveSummary => Boolean(o))
    .map((o) => ({
      ...o,
      gasto: round2(o.gasto),
      resultado: Math.round(o.resultado),
      custo: o.resultado > 0 ? round2(o.gasto / o.resultado) : 0,
      cpc: o.cliques > 0 ? round2(o.gasto / o.cliques) : 0,
      cpm: o.impressoes > 0 ? round2((o.gasto / o.impressoes) * 1000) : 0,
      ctr: o.impressoes > 0 ? round2((o.cliques / o.impressoes) * 100) : 0,
      frequencia: o.alcance > 0 ? round2(o.impressoes / o.alcance) : 0,
      roas: o.gasto > 0 ? round2(o.valorConversao / o.gasto) : 0,
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

function buildExecutiveRead(
  objetivos: PdfObjectiveSummary[],
  totalGasto: number
): string[] {
  const principal = objetivos[0];
  const apoio = objetivos[1];
  const linhas: string[] = [];

  if (principal) {
    const share =
      totalGasto > 0 ? Math.round((principal.gasto / totalGasto) * 100) : 0;
    linhas.push(
      `${principal.label} concentrou ${share}% do investimento e entregou ${intBR(
        principal.resultado
      )} em ${principal.headlineLabel.toLowerCase()}.`
    );
  }

  if (apoio) {
    linhas.push(
      `${apoio.label} atuou como apoio, com ${moneyBR(apoio.gasto)} investidos e ${intBR(
        apoio.resultado
      )} em ${apoio.headlineLabel.toLowerCase()}.`
    );
  }

  if (!linhas.length) {
    linhas.push(
      "Nao houve campanhas com entrega suficiente para uma leitura consolidada no periodo."
    );
  }

  return linhas;
}

/**
 * Próximos passos gerados a partir dos dados reais das campanhas:
 * campanha sem resultado, custo por resultado fora da curva, frequência alta
 * (fadiga de público) e destaque para escalar. Sem texto genérico.
 */
function buildNextSteps(
  campanhas: PdfCampaignRow[]
): string[] {
  const ativas = campanhas.filter((c) => c.gasto > 0);
  if (!ativas.length) {
    return ["Sem entrega suficiente no período para recomendações."];
  }

  const passos: string[] = [];
  const totalGasto = ativas.reduce((s, c) => s + c.gasto, 0);
  const jaCitada = (nome: string) => passos.some((p) => p.includes(nome));

  // 1) Campanha com gasto relevante e zero resultado
  for (const c of ativas) {
    if (c.resultado === 0 && c.gasto >= Math.max(20, totalGasto * 0.03)) {
      passos.push(
        `Avaliar pausar ${c.nome}: ${moneyBR(c.gasto)} gastos sem resultado no período.`
      );
    }
  }

  // 2) Custo por resultado fora da curva (entre campanhas de conversão)
  const comResultado = ativas.filter(
    (c) => CONVERSION_CATEGORIES.has(c.categoria) && c.resultado > 0 && c.custo > 0
  );
  if (comResultado.length >= 2) {
    const melhor = Math.min(...comResultado.map((c) => c.custo));
    for (const c of comResultado) {
      if (c.custo >= melhor * 2.5 && c.custo >= 10 && !jaCitada(c.nome)) {
        passos.push(
          `Revisar ${c.nome}: ${c.costLabel.toLowerCase()} de ${moneyBR(
            c.custo
          )}, bem acima das demais (melhor está em ${moneyBR(melhor)}).`
        );
      }
    }
  }

  // 3) Frequência alta = desgaste de público
  for (const c of ativas) {
    if (c.frequencia >= 2.5 && c.gasto >= totalGasto * 0.1 && !jaCitada(c.nome)) {
      passos.push(
        `Renovar criativo/público em ${c.nome}: frequência ${c.frequencia.toFixed(
          2
        )} indica desgaste do público.`
      );
    }
  }

  // 4) Destaque positivo para escalar (melhor custo com volume)
  if (comResultado.length) {
    const melhorCamp = [...comResultado].sort((a, b) => a.custo - b.custo)[0];
    if (!jaCitada(melhorCamp.nome)) {
      passos.push(
        `Manter foco em ${melhorCamp.nome}: melhor custo por resultado (${moneyBR(
          melhorCamp.custo
        )}) e candidata a mais verba.`
      );
    }
  }

  if (!passos.length) {
    passos.push(
      "Concentrar verba nos conjuntos de melhor custo por resultado e acompanhar a evolução diária."
    );
  }
  return passos.slice(0, 4);
}

/**
 * Série diária consolidada (todas as campanhas somadas por dia) com as métricas
 * principais. Recebe linhas ao nível de campanha com time_increment=1.
 * Usada na análise de período para o modelo enxergar a evolução dia a dia.
 */
export function buildDailySeries(dailyRows: Insight[]) {
  const byDay: Record<
    string,
    { gasto: number; resultados: number; cliques: number; impressoes: number }
  > = {};

  for (const r of dailyRows) {
    const day = r.date_start;
    if (!day) continue;
    const config = detectCategory(r.campaign_name ?? "", r.objective);
    const agg = aggregate([r], config);
    if (!byDay[day]) byDay[day] = { gasto: 0, resultados: 0, cliques: 0, impressoes: 0 };
    byDay[day].gasto += agg.totalSpend;
    byDay[day].cliques += agg.totalClicks;
    byDay[day].impressoes += agg.totalImpressions;
    if (CONVERSION_CATEGORIES.has(config.category)) {
      byDay[day].resultados += agg.totalConversoes;
    }
  }

  return Object.keys(byDay)
    .sort()
    .map((day) => {
      const d = byDay[day];
      const ctr = d.impressoes > 0 ? (d.cliques / d.impressoes) * 100 : 0;
      const custoPorResultado = d.resultados > 0 ? d.gasto / d.resultados : 0;
      return {
        data: dateBR(day),
        gasto: round2(d.gasto),
        resultados: d.resultados,
        cliques: d.cliques,
        ctr: round2(ctr),
        custo_por_resultado: round2(custoPorResultado),
      };
    });
}

/**
 * Monta o objeto consumido pelo template HTML do PDF: cabeçalho, cards de
 * resumo, tabela de campanhas e a série diária (gasto + resultados por dia).
 *
 * @param accountRows linhas ao nível de campanha do período (uma por campanha)
 * @param dailyRows   linhas ao nível de campanha com time_increment=1 (por dia)
 */
export function buildPdfModel(
  clientName: string,
  periodoLabel: string,
  accountRows: Insight[],
  dailyRows: Insight[]
): PdfReportModel {
  const account = buildAccountReport(accountRows, periodoLabel);

  // Série diária: agrupa por data, somando gasto e resultados de conversão.
  const byDay: Record<string, { gasto: number; resultados: number }> = {};
  for (const r of dailyRows) {
    const day = r.date_start;
    if (!day) continue;
    const config = detectCategory(r.campaign_name ?? "", r.objective);
    const agg = aggregate([r], config);
    if (!byDay[day]) byDay[day] = { gasto: 0, resultados: 0 };
    byDay[day].gasto += agg.totalSpend;
    if (CONVERSION_CATEGORIES.has(config.category)) {
      byDay[day].resultados += agg.totalConversoes;
    }
  }

  const serieDiaria = Object.keys(byDay)
    .sort()
    .map((day) => ({
      data: dateBR(day),
      gasto: round2(byDay[day].gasto),
      resultados: byDay[day].resultados,
    }));

  const leads = account.totais.por_categoria["lead_form"] ?? 0;
  const conversas = account.totais.por_categoria["messages"] ?? 0;
  const objetivos = summarizeObjectives(account.campanhas);
  const objetivoPrincipal = objetivos[0] ?? null;
  const totalCliques = account.campanhas.reduce((s, c) => s + c.cliques, 0);
  const totalAlcance = account.campanhas.reduce((s, c) => s + c.alcance, 0);
  const mainKpi = objetivoPrincipal
    ? {
        label: objetivoPrincipal.headlineLabel,
        value: intBR(objetivoPrincipal.resultado),
        note:
          objetivoPrincipal.resultado > 0
            ? `${objetivoPrincipal.costLabel}: ${moneyBR(objetivoPrincipal.custo)}`
            : "Sem resultado registrado no periodo",
        tone: "black" as const,
      }
    : {
        label: "Resultado principal",
        value: "0",
        note: "Sem entrega registrada no periodo",
        tone: "black" as const,
      };

  return {
    kind: "mixed",
    cliente: clientName,
    periodo: periodoLabel,
    geradoEm: new Date().toLocaleString("pt-BR"),
    meta: {
      clientName,
      periodLabel: periodoLabel,
      channels: ["Meta Ads"],
      sourceLabel: "Fonte: API de Marketing da Meta",
    },
    resumo: {
      gastoTotal: account.totais.gasto,
      leads,
      conversas,
      kpis: [
        {
          label: "Investimento total",
          value: moneyBR(account.totais.gasto),
          note: `${account.campanhas.length} campanhas com entrega`,
          tone: "red",
        },
        mainKpi,
        {
          label: "Cliques",
          value: intBR(totalCliques),
          note:
            account.totais.gasto > 0 && totalCliques > 0
              ? `CPC medio: ${moneyBR(account.totais.gasto / totalCliques)}`
              : "Sem cliques no periodo",
          tone: "red",
        },
        {
          label: "Alcance",
          value: intBR(totalAlcance),
          note: "Soma por campanha, pode conter sobreposicao",
          tone: "black",
        },
      ],
      leituraExecutiva: buildExecutiveRead(objetivos, account.totais.gasto),
    },
    objetivoPrincipal,
    objetivos,
    campanhas: account.campanhas,
    serieDiaria,
    notasMetodologicas: [
      "Resultados são lidos conforme o objetivo de cada campanha (leads, conversas, visitas ou alcance).",
      "Visitas ao perfil são uma estimativa pelos cliques no link — a Meta não devolve o número exato pela API.",
      "Alcance somado por campanha pode contar a mesma pessoa em campanhas diferentes.",
    ],
    proximosPassos: buildNextSteps(account.campanhas),
  };
}
