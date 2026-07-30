// Motor de decisão V2 da auditoria.
// A ordem é deliberada: objetivo -> amostra -> histórico/benchmark ->
// diagnóstico -> ação. Ausência de conversão nunca é, por si só, desperdício.

import type { GAuctionInsight, GConversionAction, GPerformanceSegment } from "../google-ads-api.js";
import type { ObjectiveCategory } from "../objectives.js";
import type {
  Alert,
  AuditDimension,
  BenchmarkNiche,
  Channel,
  HealthCheck,
  Platform,
} from "./types.js";
import { classifyMetric } from "./benchmarks.js";

export interface TrendValues {
  gasto?: number;
  impressoes?: number;
  cliques?: number;
  conversoes?: number;
  resultado?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  frequencia?: number;
  custo_por_resultado?: number;
  taxa_conversao?: number;
  video_completion_rate?: number;
}

export interface GateCampaign {
  id: string;
  nome: string;
  parent?: string;
  objective?: ObjectiveCategory | string;
  objective_label?: string;
  primary_result_label?: string;
  primary_result: number;
  cost_per_result: number | null;
  is_conversion_objective: boolean;
  gasto: number;
  conversoes: number;
  cliques: number;
  impressoes: number;
  ctr: number;
  cpc_medio: number;
  custo_por_conversao: number | null;
  cpm?: number;
  alcance?: number;
  frequencia?: number;
  link_clicks?: number;
  landing_page_views?: number;
  thruplays?: number;
  video_starts?: number;
  video_25?: number;
  video_50?: number;
  video_75?: number;
  video_100?: number;
  avg_watch_time?: number;
  parcela_impressoes?: number | null;
  rankings?: { quality?: string; engagementRate?: string; conversionRate?: string };
  status?: string;
  previous?: TrendValues;
  baseline28?: TrendValues;
}

export interface GateItem {
  termo: string;
  gasto: number;
  conversoes: number;
  cliques?: number;
  impressoes?: number;
  quality_score?: number | null;
  ctr_esperado?: string | null;
  relevancia_anuncio?: string | null;
  experiencia_pagina?: string | null;
  relevancia?: "alta" | "media" | "baixa" | "indeterminada";
  keyword?: string;
}

export interface SnapshotSummary extends TrendValues {
  gasto: number;
  conversoes: number;
  cliques: number;
  impressoes: number;
  ctr: number;
  cpc: number;
  cpm: number;
  taxa_conversao: number;
}

export interface AccountSnapshot {
  channel: Channel;
  platform: Platform;
  niche?: BenchmarkNiche;
  objective?: ObjectiveCategory | string;
  objective_label?: string;
  month?: number;
  resumo: {
    gasto: number;
    conversoes: number;
    cliques: number;
    impressoes: number;
    ctr: number;
    cpc_medio: number;
    custo_por_conversao: number | null;
    primary_result?: number;
    primary_result_label?: string;
    cost_per_result?: number | null;
    cpm?: number;
    taxa_conversao?: number;
    frequencia?: number;
    impression_share?: number | null;
    is_perdida_orcamento?: number | null;
    is_perdida_rank?: number | null;
    pct_impressoes_topo?: number | null;
    pct_impressoes_topo_absoluto?: number | null;
    parcela_impressoes_topo?: number | null;
    parcela_impressoes_topo_absoluto?: number | null;
    parcela_cliques?: number | null;
  };
  campanhas: GateCampaign[];
  conjuntos?: GateCampaign[];
  anuncios?: GateCampaign[];
  keywords?: GateItem[];
  termos?: GateItem[];
  pixelEventosRecentes?: boolean | null;
  previous?: SnapshotSummary;
  baseline28?: SnapshotSummary;
  conversionActions?: GConversionAction[];
  segments?: GPerformanceSegment[];
  auctionInsights?: GAuctionInsight[];
}

interface GateOutcome {
  check: HealthCheck;
  alerts: Alert[];
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const moneyBR = (n: number): string =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctBR = (n: number): string =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
const deltaPct = (current?: number, previous?: number): number | null =>
  previous && Number.isFinite(previous) ? ((Number(current) - previous) / previous) * 100 : null;

const DIM = {
  measurement: "mensuracao",
  result: "resultado",
  efficiency: "eficiencia",
  delivery: "entrega",
  quality: "competitividade_qualidade",
  opportunity: "saturacao_oportunidade",
} as const satisfies Record<string, AuditDimension>;

const check = (
  id: string,
  category: string,
  severity: HealthCheck["severity"],
  status: HealthCheck["status"],
  dimension: AuditDimension,
  detail?: string,
  confidence = 1,
  weight = 1
): HealthCheck => ({ id, category, severity, status, dimension, detail, confidence, weight });

function median(values: number[]): number | null {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function resultReference(s: AccountSnapshot): number | null {
  const historical = s.baseline28?.custo_por_resultado;
  if (historical && historical > 0) return historical;
  return median(s.campanhas.filter(c => c.primary_result > 0 && c.cost_per_result).map(c => c.cost_per_result as number));
}

function adequateSample(c: GateCampaign): boolean {
  const objective = String(c.objective ?? "");
  if (objective === "awareness" || objective === "video" || objective === "engagement") {
    return c.impressoes >= 1_000 || c.gasto >= 30;
  }
  return c.cliques >= 10 || c.gasto >= 50;
}

function gatePrimaryResultRisk(s: AccountSnapshot): GateOutcome {
  const reference = resultReference(s);
  const spendFloor = Math.max(20, s.resumo.gasto * 0.05);
  const offenders = s.campanhas.filter(c =>
    c.gasto >= spendFloor && c.primary_result <= 0 && adequateSample(c)
  );
  const alerts = offenders.map<Alert>(c => {
    const highRisk = reference ? c.gasto >= reference * 2 : c.gasto >= Math.max(50, spendFloor * 2);
    return {
      id: `resultado-ausente:${c.id}`,
      title: "Entrega sem o resultado principal",
      severity: highRisk ? "ALTO" : "MEDIO",
      status: highRisk ? "FAIL" : "ATENCAO",
      channel: s.channel,
      category: "Gasto sob risco",
      dimension: DIM.result,
      entityName: c.nome,
      evidence: `${c.nome} investiu ${moneyBR(c.gasto)} sem registrar ${String(c.primary_result_label ?? "o resultado principal").toLowerCase()}.`,
      recommendation: c.is_conversion_objective
        ? "Investigar tracking, oferta, segmentação e página antes de ampliar o investimento."
        : "Investigar entrega e configuração do objetivo; não pausar apenas pela ausência de conversões.",
      riskEstimate: highRisk ? round2(c.gasto) : round2(c.gasto * 0.5),
      impactEstimate: highRisk ? round2(c.gasto) : undefined,
      confidence: reference ? "alta" : "media",
      sampleNote: `${c.cliques} cliques e ${c.impressoes} impressões.`,
    };
  });
  return {
    check: check(
      "resultado-principal",
      "Resultado",
      "ALTO",
      offenders.some(a => (reference ? a.gasto >= reference * 2 : a.gasto >= 50)) ? "FAIL" : offenders.length ? "ATENCAO" : "PASS",
      DIM.result,
      reference ? `Referência histórica/conta: ${moneyBR(reference)} por resultado.` : "Sem referência histórica robusta.",
      reference ? 0.9 : 0.65,
      1.4
    ),
    alerts,
  };
}

function gateCostPerResult(s: AccountSnapshot): GateOutcome {
  const reference = resultReference(s);
  const current = s.resumo.cost_per_result;
  if (!current || !reference || s.resumo.primary_result === 0) {
    return { check: check("custo-resultado", "Resultado", "ALTO", "DADOS_INSUFICIENTES", DIM.result, "Sem base comparável.", 0), alerts: [] };
  }
  const ratio = current / reference;
  const status = ratio >= 1.5 ? "FAIL" : ratio >= 1.15 ? "ATENCAO" : "PASS";
  const alerts: Alert[] = status === "PASS" ? [] : [{
    id: "custo-resultado",
    title: "Custo por resultado deteriorado",
    severity: ratio >= 1.5 ? "ALTO" : "MEDIO",
    status,
    channel: s.channel,
    category: "Eficiência",
    dimension: DIM.result,
    evidence: `${moneyBR(current)} por resultado, ${round2(ratio)}x a referência de ${moneyBR(reference)}.`,
    recommendation: "Investigar quais campanhas, anúncios ou segmentos explicam a deterioração antes de redistribuir verba.",
    confidence: "alta",
  }];
  return { check: check("custo-resultado", "Resultado", "ALTO", status, DIM.result, alerts[0]?.evidence, 0.95, 1.3), alerts };
}

function gateCtrBenchmark(s: AccountSnapshot): GateOutcome {
  const objective = String(s.objective ?? "default");
  const importance = objective === "awareness" || objective === "video" ? 0.55 : 1;
  const res = classifyMetric("ctr", s.resumo.ctr, {
    platform: s.platform,
    objective,
    niche: s.niche,
    month: s.month,
    history: s.baseline28 ? { ctr: s.baseline28.ctr } : undefined,
    historyLabel: "média de 28 dias",
  });
  if (!res || s.resumo.impressoes < 200) {
    return { check: check("ctr", "Eficiência", "MEDIO", "DADOS_INSUFICIENTES", DIM.efficiency, "Amostra insuficiente.", 0), alerts: [] };
  }
  const status = res.level === "CRITICO" ? "FAIL" : res.level === "ATENCAO" ? "ATENCAO" : "PASS";
  return {
    check: check("ctr", "Eficiência", "MEDIO", status, DIM.efficiency, res.rationale, 0.85, importance),
    alerts: status === "PASS" ? [] : [{
      id: "ctr",
      title: "CTR abaixo da referência",
      severity: "MEDIO",
      status,
      channel: s.channel,
      category: "Eficiência",
      dimension: DIM.efficiency,
      evidence: res.rationale,
      recommendation: s.platform === "meta"
        ? "Comparar criativos, hook, retenção e intenção do objetivo antes de concluir que o anúncio é ruim."
        : "Revisar intenção dos termos, mensagem do anúncio e aderência à página.",
      confidence: "media",
    }],
  };
}

function gateCreativeSaturation(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "meta") {
    return { check: check("saturacao-criativa", "Saturação", "MEDIO", "DADOS_INSUFICIENTES", DIM.opportunity, "Exclusivo do Meta.", 0), alerts: [] };
  }
  const saturated = s.campanhas.map(c => {
    if (!c.previous) return null;
    const signals: string[] = [];
    const f = deltaPct(c.frequencia, c.previous.frequencia);
    const ctr = deltaPct(c.ctr, c.previous.ctr);
    const cpm = deltaPct(c.cpm, c.previous.cpm);
    const cost = deltaPct(c.cost_per_result ?? undefined, c.previous.custo_por_resultado);
    const completion = deltaPct(
      c.video_25 && c.video_100 ? (c.video_100 / c.video_25) * 100 : undefined,
      c.previous.video_completion_rate
    );
    if (f != null && f >= 10) signals.push(`frequência +${round2(f)}%`);
    if (ctr != null && ctr <= -15) signals.push(`CTR ${round2(ctr)}%`);
    if (cpm != null && cpm >= 15) signals.push(`CPM +${round2(cpm)}%`);
    if (cost != null && cost >= 20) signals.push(`custo/resultado +${round2(cost)}%`);
    if (completion != null && completion <= -15) signals.push(`retenção ${round2(completion)}%`);
    return signals.length >= 3 ? { campaign: c, signals } : null;
  }).filter((v): v is { campaign: GateCampaign; signals: string[] } => !!v);

  return {
    check: check(
      "saturacao-criativa",
      "Saturação",
      "MEDIO",
      saturated.length ? "ATENCAO" : s.campanhas.some(c => c.previous) ? "PASS" : "DADOS_INSUFICIENTES",
      DIM.opportunity,
      saturated.length ? `${saturated.length} campanha(s) com sinais convergentes.` : "Sem combinação consistente de deterioração.",
      s.campanhas.some(c => c.previous) ? 0.9 : 0,
      1.2
    ),
    alerts: saturated.map(({ campaign, signals }) => ({
      id: `saturacao:${campaign.id}`,
      title: "Possível saturação criativa",
      severity: "MEDIO",
      status: "ATENCAO",
      channel: s.channel,
      category: "Saturação",
      dimension: DIM.opportunity,
      entityName: campaign.nome,
      evidence: `${campaign.nome}: ${signals.join(", ")} versus o período anterior.`,
      recommendation: "Renovar variações criativas e acompanhar a tendência; frequência isolada não justifica pausar.",
      confidence: "alta",
    })),
  };
}

function gateMetaCreativeQuality(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "meta") {
    return { check: check("meta-relevance", "Competitividade", "MEDIO", "DADOS_INSUFICIENTES", DIM.quality, undefined, 0), alerts: [] };
  }
  const ads = s.anuncios ?? [];
  const hasData = ads.some(a => a.rankings && Object.values(a.rankings).some(Boolean));
  if (!hasData) {
    return { check: check("meta-relevance", "Competitividade", "MEDIO", "DADOS_INSUFICIENTES", DIM.quality, "Meta não retornou diagnósticos de relevância.", 0), alerts: [] };
  }
  const isBelow = (value?: string) => !!value && value.startsWith("BELOW_AVERAGE");
  const offenders = ads.filter(a => isBelow(a.rankings?.quality) || isBelow(a.rankings?.engagementRate) || isBelow(a.rankings?.conversionRate));
  return {
    check: check("meta-relevance", "Competitividade", "MEDIO", offenders.length ? "ATENCAO" : "PASS", DIM.quality, undefined, 0.8),
    alerts: offenders.slice(0, 4).map(ad => {
      const dims = [
        isBelow(ad.rankings?.quality) ? "qualidade" : "",
        isBelow(ad.rankings?.engagementRate) ? "engajamento" : "",
        isBelow(ad.rankings?.conversionRate) ? "conversão" : "",
      ].filter(Boolean);
      return {
        id: `meta-relevance:${ad.id}`,
        title: "Diagnóstico de relevância abaixo da média",
        severity: "MEDIO",
        status: "ATENCAO",
        channel: s.channel,
        category: "Competitividade",
        dimension: DIM.quality,
        entityName: ad.nome,
        evidence: `${ad.nome}: ${dims.join(", ")} abaixo da média no leilão.`,
        recommendation: "Usar o ranking como pista junto com custo, retenção e tendência; não otimizar apenas para elevar o ranking.",
        confidence: "media",
      };
    }),
  };
}

function gateMetaVideoRetention(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "meta") {
    return { check: check("video-retention", "Criativo", "MEDIO", "DADOS_INSUFICIENTES", DIM.opportunity, undefined, 0), alerts: [] };
  }
  const videos = (s.anuncios ?? []).filter(a => (a.video_starts ?? 0) > 0 || (a.video_25 ?? 0) > 0 || (a.thruplays ?? 0) > 0);
  if (!videos.length) {
    return { check: check("video-retention", "Criativo", "MEDIO", "DADOS_INSUFICIENTES", DIM.opportunity, "Sem criativos de vídeo mensuráveis.", 0), alerts: [] };
  }
  const weak = videos.filter(a => {
    const early = a.video_starts ? (a.video_25 ?? 0) / a.video_starts : 1;
    const completion = a.video_25 ? (a.video_100 ?? 0) / a.video_25 : 1;
    return (a.video_starts ?? 0) >= 100 && (early < 0.25 || completion < 0.15);
  });
  return {
    check: check("video-retention", "Criativo", "MEDIO", weak.length ? "ATENCAO" : "PASS", DIM.opportunity, undefined, 0.85),
    alerts: weak.slice(0, 4).map(ad => ({
      id: `video-retention:${ad.id}`,
      title: "Retenção de vídeo abaixo do esperado",
      severity: "MEDIO",
      status: "ATENCAO",
      channel: s.channel,
      category: "Criativo",
      dimension: DIM.opportunity,
      entityName: ad.nome,
      evidence: `${ad.nome}: ${ad.video_starts ?? 0} inícios, ${ad.video_25 ?? 0} chegaram a 25% e ${ad.video_100 ?? 0} concluíram.`,
      recommendation: "Revisar os primeiros segundos, promessa, ritmo e correspondência entre abertura e mensagem.",
      confidence: "alta",
    })),
  };
}

function gateGoogleVisibility(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "google" || s.resumo.impression_share == null) {
    return { check: check("google-visibility", "Entrega", "ALTO", "DADOS_INSUFICIENTES", DIM.delivery, undefined, 0), alerts: [] };
  }
  const share = s.resumo.impression_share;
  const budget = s.resumo.is_perdida_orcamento ?? 0;
  const rank = s.resumo.is_perdida_rank ?? 0;
  const status = share < 20 ? "FAIL" : share < 40 ? "ATENCAO" : "PASS";
  const driver = rank > budget ? "Ad Rank" : budget > rank ? "orçamento" : "combinação de orçamento e Ad Rank";
  return {
    check: check("google-visibility", "Entrega", "ALTO", status, DIM.delivery, `${pctBR(share)} capturada; principal limitação: ${driver}.`, 0.95, 1.4),
    alerts: status === "PASS" ? [] : [{
      id: "google-visibility",
      title: "Baixa cobertura da demanda na Pesquisa",
      severity: share < 20 ? "ALTO" : "MEDIO",
      status,
      channel: s.channel,
      category: "Entrega",
      dimension: DIM.delivery,
      evidence: `${pctBR(share)} das impressões elegíveis capturadas; ${pctBR(budget)} perdidas por orçamento e ${pctBR(rank)} por Ad Rank.`,
      recommendation: rank > budget
        ? "Investigar lances, competitividade, relevância, experiência da página e ativos antes de apenas aumentar orçamento."
        : "Validar capacidade de atendimento e retorno marginal antes de ampliar o orçamento.",
      confidence: "alta",
    }],
  };
}

function gateGoogleQuality(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "google" || !s.keywords?.length) {
    return { check: check("google-quality", "Competitividade", "MEDIO", "DADOS_INSUFICIENTES", DIM.quality, undefined, 0), alerts: [] };
  }
  const evaluated = s.keywords.filter(k => k.quality_score != null);
  if (!evaluated.length) {
    return { check: check("google-quality", "Competitividade", "MEDIO", "DADOS_INSUFICIENTES", DIM.quality, "Sem keywords com diagnóstico.", 0), alerts: [] };
  }
  const below = (value?: string | null) => value === "BELOW_AVERAGE";
  const offenders = evaluated.filter(k =>
    (k.quality_score ?? 10) <= 4 || below(k.ctr_esperado) || below(k.relevancia_anuncio) || below(k.experiencia_pagina)
  );
  return {
    check: check("google-quality", "Competitividade", "MEDIO", offenders.length ? "ATENCAO" : "PASS", DIM.quality, `${evaluated.length} keywords diagnosticadas.`, 0.85),
    alerts: offenders.slice(0, 5).map(k => {
      const components = [
        below(k.ctr_esperado) ? "CTR esperado abaixo da média" : "",
        below(k.relevancia_anuncio) ? "relevância abaixo da média" : "",
        below(k.experiencia_pagina) ? "página abaixo da média" : "",
      ].filter(Boolean);
      return {
        id: `google-quality:${k.termo}`,
        title: "Diagnóstico de keyword a melhorar",
        severity: "MEDIO",
        status: "ATENCAO",
        channel: s.channel,
        category: "Competitividade",
        dimension: DIM.quality,
        entityName: k.termo,
        evidence: `"${k.termo}": QS ${k.quality_score ?? "N/A"}/10${components.length ? `; ${components.join(", ")}` : ""}.`,
        recommendation: "Tratar os componentes como diagnóstico por keyword, não como KPI agregado nem como sinônimo de Ad Rank.",
        confidence: "alta",
      };
    }),
  };
}

function gateConversionHealth(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "google") {
    return { check: check("conversion-health", "Mensuração", "ALTO", "DADOS_INSUFICIENTES", DIM.measurement, undefined, 0), alerts: [] };
  }
  const actions = s.conversionActions ?? [];
  if (!actions.length && s.resumo.conversoes > 0) {
    return {
      check: check("conversion-health", "Mensuração", "ALTO", "ATENCAO", DIM.measurement, "Há conversões, mas as ações não puderam ser qualificadas.", 0.45, 1.4),
      alerts: [{
        id: "conversion-health",
        title: "Conversões sem qualificação suficiente",
        severity: "ALTO",
        status: "ATENCAO",
        channel: s.channel,
        category: "Mensuração",
        dimension: DIM.measurement,
        evidence: `${s.resumo.conversoes} conversões registradas, sem detalhes suficientes sobre ações primárias.`,
        recommendation: "Confirmar nomes, categorias, origem e quais ações entram em 'Conversões' antes de classificar o CPA como excelente.",
        confidence: "media",
      }],
    };
  }
  if (!actions.length) {
    return { check: check("conversion-health", "Mensuração", "ALTO", "DADOS_INSUFICIENTES", DIM.measurement, "Sem ações no período.", 0), alerts: [] };
  }
  const primaries = actions.filter(a => a.primaria || a.incluir_em_conversoes);
  const micro = primaries.filter(a => /PAGE_VIEW|OTHER|DOWNLOAD/i.test(`${a.categoria ?? ""} ${a.nome}`));
  const status = micro.length ? "FAIL" : primaries.length ? "PASS" : "ATENCAO";
  const alerts: Alert[] = [];
  if (micro.length) {
    alerts.push({
      id: "conversion-health:micro",
      title: "Microconversão tratada como principal",
      severity: "ALTO",
      status: "FAIL",
      channel: s.channel,
      category: "Mensuração",
      dimension: DIM.measurement,
      evidence: micro.map(a => `${a.nome} (${a.categoria ?? "sem categoria"})`).join(", "),
      recommendation: "Revisar as metas primárias e separar microconversões antes de interpretar CPA e taxa de conversão.",
      confidence: "alta",
    });
  } else if (!primaries.length) {
    alerts.push({
      id: "conversion-health:no-primary",
      title: "Nenhuma ação primária confirmada",
      severity: "MEDIO",
      status: "ATENCAO",
      channel: s.channel,
      category: "Mensuração",
      dimension: DIM.measurement,
      evidence: `${actions.length} ação(ões) com atividade, mas nenhuma foi confirmada como primária.`,
      recommendation: "Revisar primary_for_goal e inclusão na coluna Conversões.",
      confidence: "media",
    });
  }
  return { check: check("conversion-health", "Mensuração", "ALTO", status, DIM.measurement, `${actions.length} ações analisadas.`, 0.9, 1.4), alerts };
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function gateSearchTermsRisk(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "google" || !s.termos?.length) {
    return { check: check("search-risk", "Oportunidade", "MEDIO", "DADOS_INSUFICIENTES", DIM.opportunity, undefined, 0), alerts: [] };
  }
  const reference = resultReference(s) ?? Math.max(20, s.resumo.custo_por_conversao ?? 0);
  const minimum = reference > 0 ? reference * 0.5 : 20;
  const candidates = s.termos.filter(t => t.conversoes === 0 && t.gasto >= minimum && (t.cliques ?? 0) >= 5);
  const high = candidates.filter(t => t.gasto >= Math.max(reference * 2, 40));
  const observed = candidates.filter(t => !high.includes(t));
  const risk = round2(high.reduce((sum, item) => sum + item.gasto, 0));
  const top = [...candidates].sort((a, b) => b.gasto - a.gasto)[0];
  const alerts: Alert[] = [];
  if (top) {
    const relevant = top.relevancia === "alta";
    alerts.push({
      id: "search-risk",
      title: high.length ? "Termos com gasto sob alto risco" : "Termos para observar",
      severity: high.length ? "ALTO" : "MEDIO",
      status: high.length ? "FAIL" : "ATENCAO",
      channel: s.channel,
      category: "Gasto sob risco",
      dimension: DIM.opportunity,
      entityName: top.termo,
      evidence: `${high.length} termo(s) em alto risco e ${observed.length} em observação. Maior: "${top.termo}", ${moneyBR(top.gasto)}, relevância ${top.relevancia ?? "indeterminada"}.`,
      recommendation: relevant
        ? "O termo parece aderente ao negócio: investigar anúncio, oferta, landing page, tracking e volume; não negativar automaticamente."
        : "Revisar intenção e aderência ao negócio; negativar somente quando a irrelevância estiver confirmada.",
      riskEstimate: risk || round2(observed.reduce((sum, item) => sum + item.gasto * 0.5, 0)),
      impactEstimate: risk || undefined,
      confidence: high.length ? "alta" : "media",
      sampleNote: `Critério: ao menos 5 cliques e gasto mínimo de ${moneyBR(minimum)}.`,
    });
  }
  return {
    check: check("search-risk", "Oportunidade", "MEDIO", high.length ? "FAIL" : observed.length ? "ATENCAO" : "PASS", DIM.opportunity, "Risco calculado somente na camada de termos, sem somar novamente keywords.", 0.85),
    alerts,
  };
}

function gateSegmentOutliers(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "google" || !s.segments?.length) {
    return { check: check("segment-outliers", "Oportunidade", "MEDIO", "DADOS_INSUFICIENTES", DIM.opportunity, undefined, 0), alerts: [] };
  }
  const reference = s.resumo.custo_por_conversao ?? 0;
  const candidates = s.segments.filter(row =>
    row.gasto >= Math.max(20, s.resumo.gasto * 0.05) &&
    ((row.conversoes === 0 && row.cliques >= 8) || (row.cpa != null && reference > 0 && row.cpa >= reference * 1.8))
  );
  const alerts = candidates.sort((a, b) => b.gasto - a.gasto).slice(0, 5).map<Alert>(row => ({
    id: `segment:${row.dimensao}:${normalize(row.segmento)}`,
    title: "Segmento com eficiência abaixo da conta",
    severity: "MEDIO",
    status: "ATENCAO",
    channel: s.channel,
    category: "Oportunidade",
    dimension: DIM.opportunity,
    entityName: row.segmento,
    evidence: `${row.dimensao} ${row.segmento}: ${moneyBR(row.gasto)}, ${row.conversoes} conversões${row.cpa != null ? `, CPA ${moneyBR(row.cpa)}` : ""}.`,
    recommendation: "Confirmar volume e consistência temporal antes de ajustar lance, agenda ou segmentação.",
    confidence: "media",
  }));
  return {
    check: check("segment-outliers", "Oportunidade", "MEDIO", alerts.length ? "ATENCAO" : "PASS", DIM.opportunity, `${s.segments.length} recortes analisados.`, 0.75),
    alerts,
  };
}

function gatePixel(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "meta") {
    return { check: check("pixel", "Mensuração", "ALTO", "DADOS_INSUFICIENTES", DIM.measurement, undefined, 0), alerts: [] };
  }
  const needsPixel = s.campanhas.some(c => c.is_conversion_objective);
  if (!needsPixel) {
    return { check: check("pixel", "Mensuração", "ALTO", "DADOS_INSUFICIENTES", DIM.measurement, "Pixel não é requisito do objetivo predominante.", 0), alerts: [] };
  }
  if (s.pixelEventosRecentes == null) {
    return { check: check("pixel", "Mensuração", "ALTO", "DADOS_INSUFICIENTES", DIM.measurement, "Diagnóstico não disponível.", 0), alerts: [] };
  }
  const ok = s.pixelEventosRecentes;
  return {
    check: check("pixel", "Mensuração", "ALTO", ok ? "PASS" : "FAIL", DIM.measurement, undefined, 0.9, 1.4),
    alerts: ok ? [] : [{
      id: "pixel",
      title: "Pixel sem eventos recentes",
      severity: "ALTO",
      status: "FAIL",
      channel: s.channel,
      category: "Mensuração",
      dimension: DIM.measurement,
      evidence: "O pixel não registrou eventos recentes para campanhas que dependem de conversão.",
      recommendation: "Verificar pixel/CAPI, GTM e disparo do evento principal.",
      confidence: "alta",
    }],
  };
}

export function runQualityGates(s: AccountSnapshot): { checks: HealthCheck[]; alerts: Alert[] } {
  const outcomes: GateOutcome[] = [
    gatePixel(s),
    gateConversionHealth(s),
    gatePrimaryResultRisk(s),
    gateCostPerResult(s),
    gateCtrBenchmark(s),
    gateGoogleVisibility(s),
    gateMetaCreativeQuality(s),
    gateGoogleQuality(s),
    gateCreativeSaturation(s),
    gateMetaVideoRetention(s),
    gateSearchTermsRisk(s),
    gateSegmentOutliers(s),
  ];
  return {
    checks: outcomes.map(o => o.check),
    alerts: outcomes.flatMap(o => o.alerts),
  };
}

/** Soma o gasto sob risco sem somar keywords novamente quando há termos. */
export function totalRisk(alerts: Alert[]): number {
  return round2(alerts.reduce((sum, alert) => sum + (alert.riskEstimate ?? 0), 0));
}

/** @deprecated use totalRisk; mantido para compatibilidade interna durante a migração. */
export const totalWaste = totalRisk;
