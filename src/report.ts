// Agrega as linhas cruas de insights da Meta e monta uma saída estruturada +
// uma mensagem formatada (estilo WhatsApp), com detecção automática de objetivo.
// Consolida toda a lógica que antes estava repetida nos nodes de Code do n8n.

import type { Insight } from "./meta-api.js";
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
  cpa: number;
  /** Todos os action_types somados, para transparência/correção manual. */
  actionsDisponiveis: Record<string, number>;
}

/** Escolhe o action_type de conversão pela prioridade da categoria. */
function pickActionType(
  actionsMap: Record<string, number>,
  config: CategoryConfig,
  override?: string
): string | null {
  if (override) return override;
  for (const at of config.actionPriority) {
    if (actionsMap[at] > 0) return at;
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
  const actionsMap: Record<string, number> = {};

  let date_start = rows[0]?.date_start ?? "";
  let date_stop = rows[0]?.date_stop ?? "";

  for (const r of rows) {
    totalSpend += toNum(r.spend);
    totalClicks += toInt(r.clicks);
    totalImpressions += toInt(r.impressions);
    totalReach += toInt(r.reach);
    if (r.date_start < date_start) date_start = r.date_start;
    if (r.date_stop > date_stop) date_stop = r.date_stop;

    if (Array.isArray(r.actions)) {
      for (const a of r.actions) {
        actionsMap[a.action_type] =
          (actionsMap[a.action_type] ?? 0) + toInt(a.value);
      }
    }
    if (Array.isArray(r.video_thruplay_watched_actions)) {
      for (const a of r.video_thruplay_watched_actions) {
        totalThruplay += toInt(a.value);
      }
    }
  }

  const actionTypeUsado = pickActionType(actionsMap, config, override);
  const totalConversoes = actionTypeUsado
    ? actionsMap[actionTypeUsado] ?? 0
    : 0;

  // Métricas derivadas calculadas a partir dos totais (ponderadas/corretas).
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCPP = totalReach > 0 ? (totalSpend / totalReach) * 1000 : 0;
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpa = totalConversoes > 0 ? totalSpend / totalConversoes : 0;

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
    cpa,
    actionsDisponiveis: actionsMap,
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
