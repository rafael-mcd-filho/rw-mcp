// Adaptadores V2: preservam o objetivo e o resultado principal de cada
// campanha, além de histórico, criativos e diagnósticos de Google.

import type {
  GAccountReport,
  GAd,
  GAdGroup,
  GAuctionInsight,
  GConversionAction,
  GKeyword,
  GPerformanceSegment,
  GSearchTerm,
} from "../google-ads-api.js";
import type { Insight, MetaActionMetric } from "../meta-api.js";
import {
  detectCategory,
  getConfig,
  type ObjectiveCategory,
} from "../objectives.js";
import type {
  AccountSnapshot,
  GateCampaign,
  GateItem,
  SnapshotSummary,
  TrendValues,
} from "./quality-gates.js";
import type { BenchmarkNiche } from "./types.js";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const number = (value?: string | number | null): number => Number.parseFloat(String(value ?? "0")) || 0;
const integer = (value?: string | number | null): number => Number.parseInt(String(value ?? "0"), 10) || 0;
const actionTotal = (actions?: MetaActionMetric[]): number =>
  round2((actions ?? []).reduce((sum, action) => sum + number(action.value), 0));
const actionByPriority = (actions: MetaActionMetric[] | undefined, priorities: string[]): number => {
  for (const name of priorities) {
    const found = (actions ?? []).filter(action => action.action_type === name);
    if (found.length) return actionTotal(found);
  }
  return 0;
};

const CONVERSION_CATEGORIES = new Set<ObjectiveCategory>(["lead_form", "messages", "sales"]);

function videoMetric(row: Insight, key: keyof Pick<
  Insight,
  "video_play_actions" | "video_thruplay_watched_actions" | "video_p25_watched_actions" |
  "video_p50_watched_actions" | "video_p75_watched_actions" | "video_p100_watched_actions"
>): number {
  return actionTotal(row[key]);
}

function resultForInsight(row: Insight, category: ObjectiveCategory): number {
  if (category === "awareness") return integer(row.reach);
  if (category === "video") return videoMetric(row, "video_thruplay_watched_actions");
  return actionByPriority(row.actions, getConfig(category).actionPriority);
}

function trendOf(c: GateCampaign): TrendValues {
  const completion = c.video_25 && c.video_100 ? round2((c.video_100 / c.video_25) * 100) : undefined;
  return {
    gasto: c.gasto,
    impressoes: c.impressoes,
    cliques: c.cliques,
    conversoes: c.conversoes,
    resultado: c.primary_result,
    ctr: c.ctr,
    cpc: c.cpc_medio,
    cpm: c.cpm,
    frequencia: c.frequencia,
    custo_por_resultado: c.cost_per_result ?? undefined,
    taxa_conversao: c.cliques > 0 ? round2((c.conversoes / c.cliques) * 100) : 0,
    video_completion_rate: completion,
  };
}

function summaryOf(
  gasto: number,
  conversoes: number,
  cliques: number,
  impressoes: number,
  resultado?: number,
  custoResultado?: number | null
): SnapshotSummary {
  return {
    gasto: round2(gasto),
    conversoes: round2(conversoes),
    cliques,
    impressoes,
    resultado,
    ctr: impressoes > 0 ? round2((cliques / impressoes) * 100) : 0,
    cpc: cliques > 0 ? round2(gasto / cliques) : 0,
    cpm: impressoes > 0 ? round2((gasto / impressoes) * 1000) : 0,
    taxa_conversao: cliques > 0 ? round2((conversoes / cliques) * 100) : 0,
    custo_por_resultado: custoResultado ?? (resultado && resultado > 0 ? round2(gasto / resultado) : undefined),
  };
}

function parsePct(value: string | null | undefined): number | null {
  if (!value || value === "N/A" || value === "--") return null;
  const parsed = Number.parseFloat(String(value).replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function addTrend(
  current: GateCampaign[],
  previous?: GateCampaign[],
  baseline?: GateCampaign[]
): GateCampaign[] {
  const previousByName = new Map((previous ?? []).map(item => [item.nome, item]));
  const baselineByName = new Map((baseline ?? []).map(item => [item.nome, item]));
  return current.map(item => ({
    ...item,
    previous: previousByName.has(item.nome) ? trendOf(previousByName.get(item.nome) as GateCampaign) : undefined,
    baseline28: baselineByName.has(item.nome) ? trendOf(baselineByName.get(item.nome) as GateCampaign) : undefined,
  }));
}

function gEntity(row: GAdGroup | GAd, parent: string): GateCampaign {
  return {
    id: row.id,
    nome: row.nome,
    parent,
    objective: "lead_form",
    objective_label: "Geração de resultados",
    primary_result_label: "Conversões",
    primary_result: row.conversoes,
    cost_per_result: row.conversoes > 0 ? row.custo_por_conversao : null,
    is_conversion_objective: true,
    gasto: row.gasto,
    conversoes: row.conversoes,
    cliques: row.cliques,
    impressoes: row.impressoes,
    ctr: row.ctr,
    cpc_medio: row.cpc_medio,
    custo_por_conversao: row.conversoes > 0 ? row.custo_por_conversao : null,
    cpm: row.impressoes > 0 ? round2((row.gasto / row.impressoes) * 1000) : 0,
    status: row.status,
  };
}

function googleCampaigns(report: GAccountReport): GateCampaign[] {
  return report.campanhas.map(campaign => ({
    id: campaign.id,
    nome: campaign.nome,
    objective: "lead_form",
    objective_label: "Geração de resultados",
    primary_result_label: "Conversões",
    primary_result: campaign.conversoes,
    cost_per_result: campaign.conversoes > 0 ? campaign.custo_por_conversao : null,
    is_conversion_objective: true,
    gasto: campaign.gasto,
    conversoes: campaign.conversoes,
    cliques: campaign.cliques,
    impressoes: campaign.impressoes,
    ctr: campaign.ctr,
    cpc_medio: campaign.cpc_medio,
    custo_por_conversao: campaign.conversoes > 0 ? campaign.custo_por_conversao : null,
    cpm: campaign.impressoes > 0 ? round2((campaign.gasto / campaign.impressoes) * 1000) : 0,
    parcela_impressoes: parsePct(campaign.parcela_impressoes),
    status: campaign.status,
  }));
}

function relevantTokens(text: string): string[] {
  return text
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 5)
    .map(token => token.slice(0, 6));
}

function inferRelevance(term: string, context?: string): GateItem["relevancia"] {
  if (!context?.trim()) return "indeterminada";
  const termTokens = new Set(relevantTokens(term));
  const contextTokens = new Set(relevantTokens(context));
  const matches = [...termTokens].filter(token => contextTokens.has(token)).length;
  if (matches >= 2 || (matches === 1 && termTokens.size <= 2)) return "alta";
  if (matches === 1) return "media";
  return "indeterminada";
}

export function googleSnapshot(
  report: GAccountReport,
  opts: {
    keywords?: GKeyword[];
    searchTerms?: GSearchTerm[];
    adGroups?: GAdGroup[];
    ads?: GAd[];
    previousReport?: GAccountReport;
    baselineReport?: GAccountReport;
    conversionActions?: GConversionAction[];
    segments?: GPerformanceSegment[];
    auctionInsights?: GAuctionInsight[];
    businessContext?: string;
    niche?: BenchmarkNiche;
    month?: number;
  }
): AccountSnapshot {
  const currentCampaigns = googleCampaigns(report);
  const previousCampaigns = opts.previousReport ? googleCampaigns(opts.previousReport) : undefined;
  const baselineCampaigns = opts.baselineReport ? googleCampaigns(opts.baselineReport) : undefined;
  const campaigns = addTrend(currentCampaigns, previousCampaigns, baselineCampaigns);

  const keywords: GateItem[] | undefined = opts.keywords?.map(keyword => ({
    termo: keyword.keyword,
    gasto: keyword.gasto,
    conversoes: keyword.conversoes,
    cliques: keyword.cliques,
    impressoes: keyword.impressoes,
    quality_score: keyword.quality_score,
    ctr_esperado: keyword.ctr_esperado,
    relevancia_anuncio: keyword.relevancia_anuncio,
    experiencia_pagina: keyword.experiencia_pagina,
    relevancia: inferRelevance(keyword.keyword, opts.businessContext),
  }));
  const terms: GateItem[] | undefined = opts.searchTerms?.map(term => ({
    termo: term.termo,
    gasto: term.gasto,
    conversoes: term.conversoes,
    cliques: term.cliques,
    impressoes: term.impressoes,
    relevancia: inferRelevance(term.termo, opts.businessContext),
  }));

  const summary = summaryOf(
    report.resumo.gasto_total,
    report.resumo.conversoes,
    report.resumo.cliques,
    report.resumo.impressoes,
    report.resumo.conversoes,
    report.resumo.conversoes > 0 ? report.resumo.custo_por_conversao : null
  );
  const previous = opts.previousReport
    ? summaryOf(
        opts.previousReport.resumo.gasto_total,
        opts.previousReport.resumo.conversoes,
        opts.previousReport.resumo.cliques,
        opts.previousReport.resumo.impressoes,
        opts.previousReport.resumo.conversoes,
        opts.previousReport.resumo.conversoes > 0 ? opts.previousReport.resumo.custo_por_conversao : null
      )
    : undefined;
  const baseline28 = opts.baselineReport
    ? summaryOf(
        opts.baselineReport.resumo.gasto_total,
        opts.baselineReport.resumo.conversoes,
        opts.baselineReport.resumo.cliques,
        opts.baselineReport.resumo.impressoes,
        opts.baselineReport.resumo.conversoes,
        opts.baselineReport.resumo.conversoes > 0 ? opts.baselineReport.resumo.custo_por_conversao : null
      )
    : undefined;

  return {
    channel: "google",
    platform: "google",
    niche: opts.niche,
    objective: "lead_form",
    objective_label: "Geração de resultados",
    month: opts.month,
    resumo: {
      gasto: summary.gasto,
      conversoes: summary.conversoes,
      cliques: summary.cliques,
      impressoes: summary.impressoes,
      ctr: summary.ctr,
      cpc_medio: summary.cpc,
      custo_por_conversao: report.resumo.conversoes > 0 ? report.resumo.custo_por_conversao : null,
      primary_result: report.resumo.conversoes,
      primary_result_label: "Conversões",
      cost_per_result: report.resumo.conversoes > 0 ? report.resumo.custo_por_conversao : null,
      cpm: summary.cpm,
      taxa_conversao: summary.taxa_conversao,
      impression_share: report.resumo.parcela_impressoes ?? null,
      is_perdida_orcamento: report.resumo.is_perdida_orcamento ?? null,
      is_perdida_rank: report.resumo.is_perdida_rank ?? null,
      pct_impressoes_topo: report.resumo.pct_impressoes_topo ?? null,
      pct_impressoes_topo_absoluto: report.resumo.pct_impressoes_topo_absoluto ?? null,
      parcela_impressoes_topo: report.resumo.parcela_impressoes_topo ?? null,
      parcela_impressoes_topo_absoluto: report.resumo.parcela_impressoes_topo_absoluto ?? null,
      parcela_cliques: report.resumo.parcela_cliques ?? null,
    },
    campanhas: campaigns,
    conjuntos: opts.adGroups?.map(group => gEntity(group, group.campanha)),
    anuncios: opts.ads?.map(ad => gEntity(ad, ad.grupo)),
    keywords,
    termos: terms,
    previous,
    baseline28,
    conversionActions: opts.conversionActions,
    segments: opts.segments,
    auctionInsights: opts.auctionInsights,
  };
}

interface MetaCampaignRow {
  nome: string;
  categoria: ObjectiveCategory | string;
  categoriaLabel?: string;
  headlineLabel?: string;
  costLabel?: string;
  gasto: number;
  resultado: number;
  custo: number;
  cliques: number;
  impressoes: number;
  alcance?: number;
  ctr: number;
  cpc: number;
  cpm?: number;
  frequencia: number;
  thruplay?: number;
  rankings?: { quality?: string; engagementRate?: string; conversionRate?: string };
}

interface MetaAccountReportLike {
  totais: { gasto: number };
  campanhas: MetaCampaignRow[];
}

function metaCampaigns(account: MetaAccountReportLike, rawRows: Insight[] = []): GateCampaign[] {
  const rawByName = new Map(rawRows.map(row => [row.campaign_name ?? "", row]));
  return account.campanhas.map((campaign, index) => {
    const raw = rawByName.get(campaign.nome);
    const category = campaign.categoria as ObjectiveCategory;
    const conversion = CONVERSION_CATEGORIES.has(category);
    const starts = raw ? videoMetric(raw, "video_play_actions") : 0;
    const thruplays = raw ? videoMetric(raw, "video_thruplay_watched_actions") : (campaign.thruplay ?? 0);
    const video25 = raw ? videoMetric(raw, "video_p25_watched_actions") : 0;
    const video50 = raw ? videoMetric(raw, "video_p50_watched_actions") : 0;
    const video75 = raw ? videoMetric(raw, "video_p75_watched_actions") : 0;
    const video100 = raw ? videoMetric(raw, "video_p100_watched_actions") : 0;
    const cpm = campaign.cpm ?? (campaign.impressoes > 0 ? round2((campaign.gasto / campaign.impressoes) * 1000) : 0);
    return {
      id: raw?.campaign_id ?? String(index),
      nome: campaign.nome,
      objective: category,
      objective_label: campaign.categoriaLabel ?? getConfig(category).title,
      primary_result_label: campaign.headlineLabel ?? getConfig(category).headlineLabel,
      primary_result: campaign.resultado,
      cost_per_result: campaign.resultado > 0 ? campaign.custo : null,
      is_conversion_objective: conversion,
      gasto: campaign.gasto,
      conversoes: conversion ? campaign.resultado : 0,
      cliques: campaign.cliques,
      impressoes: campaign.impressoes,
      ctr: campaign.ctr,
      cpc_medio: campaign.cpc,
      custo_por_conversao: conversion && campaign.resultado > 0 ? campaign.custo : null,
      cpm,
      alcance: campaign.alcance,
      frequencia: campaign.frequencia,
      link_clicks: raw ? integer(raw.inline_link_clicks) : undefined,
      landing_page_views: raw ? actionByPriority(raw.actions, ["landing_page_view"]) : undefined,
      thruplays,
      video_starts: starts,
      video_25: video25,
      video_50: video50,
      video_75: video75,
      video_100: video100,
      avg_watch_time: raw ? actionTotal(raw.video_avg_time_watched_actions) : undefined,
      rankings: campaign.rankings,
    };
  });
}

function metaEntity(row: Insight, index: number, kind: "adset" | "ad"): GateCampaign {
  const category = detectCategory(row.campaign_name ?? "", row.objective).category;
  const config = getConfig(category);
  const result = resultForInsight(row, category);
  const spend = number(row.spend);
  const impressions = integer(row.impressions);
  const clicks = integer(row.clicks);
  const conversion = CONVERSION_CATEGORIES.has(category);
  return {
    id: (kind === "ad" ? row.ad_id : row.adset_id) ?? String(index),
    nome: (kind === "ad" ? row.ad_name : row.adset_name) ?? "(sem nome)",
    parent: kind === "ad" ? row.adset_name : row.campaign_name,
    objective: category,
    objective_label: config.title,
    primary_result_label: config.headlineLabel,
    primary_result: result,
    cost_per_result: result > 0 ? round2(spend / result) : null,
    is_conversion_objective: conversion,
    gasto: round2(spend),
    conversoes: conversion ? result : 0,
    cliques: clicks,
    impressoes: impressions,
    ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
    cpc_medio: clicks > 0 ? round2(spend / clicks) : 0,
    custo_por_conversao: conversion && result > 0 ? round2(spend / result) : null,
    cpm: impressions > 0 ? round2((spend / impressions) * 1000) : 0,
    alcance: integer(row.reach),
    frequencia: row.frequency != null ? round2(number(row.frequency)) : undefined,
    link_clicks: integer(row.inline_link_clicks),
    landing_page_views: actionByPriority(row.actions, ["landing_page_view"]),
    thruplays: videoMetric(row, "video_thruplay_watched_actions"),
    video_starts: videoMetric(row, "video_play_actions"),
    video_25: videoMetric(row, "video_p25_watched_actions"),
    video_50: videoMetric(row, "video_p50_watched_actions"),
    video_75: videoMetric(row, "video_p75_watched_actions"),
    video_100: videoMetric(row, "video_p100_watched_actions"),
    avg_watch_time: actionTotal(row.video_avg_time_watched_actions),
    rankings: {
      quality: row.quality_ranking,
      engagementRate: row.engagement_rate_ranking,
      conversionRate: row.conversion_rate_ranking,
    },
  };
}

function metaSummary(campaigns: GateCampaign[], spend: number): SnapshotSummary {
  const clicks = campaigns.reduce((sum, campaign) => sum + campaign.cliques, 0);
  const impressions = campaigns.reduce((sum, campaign) => sum + campaign.impressoes, 0);
  const conversions = campaigns.reduce((sum, campaign) => sum + campaign.conversoes, 0);
  const result = campaigns.reduce((sum, campaign) => sum + campaign.primary_result, 0);
  return summaryOf(spend, conversions, clicks, impressions, result, result > 0 ? spend / result : null);
}

export function metaSnapshot(
  account: MetaAccountReportLike,
  opts: {
    niche?: BenchmarkNiche;
    month?: number;
    rawCampaigns?: Insight[];
    adsets?: Insight[];
    ads?: Insight[];
    previousAccount?: MetaAccountReportLike;
    previousCampaigns?: Insight[];
    previousAds?: Insight[];
    baselineAccount?: MetaAccountReportLike;
    baselineCampaigns?: Insight[];
  }
): AccountSnapshot {
  const currentCampaigns = metaCampaigns(account, opts.rawCampaigns);
  const previousCampaigns = opts.previousAccount
    ? metaCampaigns(opts.previousAccount, opts.previousCampaigns)
    : undefined;
  const baselineCampaigns = opts.baselineAccount
    ? metaCampaigns(opts.baselineAccount, opts.baselineCampaigns)
    : undefined;
  const campaigns = addTrend(currentCampaigns, previousCampaigns, baselineCampaigns);
  const currentAds = (opts.ads ?? []).map((row, index) => metaEntity(row, index, "ad"));
  const previousAds = (opts.previousAds ?? []).map((row, index) => metaEntity(row, index, "ad"));
  const ads = addTrend(currentAds, previousAds, undefined);
  const summary = metaSummary(campaigns, account.totais.gasto);
  const previous = previousCampaigns && opts.previousAccount
    ? metaSummary(previousCampaigns, opts.previousAccount.totais.gasto)
    : undefined;
  const baseline28 = baselineCampaigns && opts.baselineAccount
    ? metaSummary(baselineCampaigns, opts.baselineAccount.totais.gasto)
    : undefined;
  const dominant = [...campaigns].sort((a, b) => b.gasto - a.gasto)[0];
  const frequencyNumerator = campaigns.reduce((sum, c) => sum + (c.frequencia ?? 0) * c.impressoes, 0);

  return {
    channel: "meta",
    platform: "meta",
    niche: opts.niche,
    objective: dominant?.objective ?? "engagement",
    objective_label: dominant?.objective_label ?? "Objetivos mistos",
    month: opts.month,
    resumo: {
      gasto: summary.gasto,
      conversoes: summary.conversoes,
      cliques: summary.cliques,
      impressoes: summary.impressoes,
      ctr: summary.ctr,
      cpc_medio: summary.cpc,
      custo_por_conversao: summary.conversoes > 0 ? round2(summary.gasto / summary.conversoes) : null,
      primary_result: summary.resultado,
      primary_result_label: dominant?.primary_result_label ?? "Resultados",
      cost_per_result: summary.resultado && summary.resultado > 0 ? round2(summary.gasto / summary.resultado) : null,
      cpm: summary.cpm,
      taxa_conversao: summary.taxa_conversao,
      frequencia: summary.impressoes > 0 ? round2(frequencyNumerator / summary.impressoes) : 0,
    },
    campanhas: campaigns,
    conjuntos: opts.adsets?.map((row, index) => metaEntity(row, index, "adset")),
    anuncios: ads,
    previous,
    baseline28,
  };
}
