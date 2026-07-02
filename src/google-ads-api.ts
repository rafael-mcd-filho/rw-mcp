const GOOGLE_ADS_API_VERSION = "v23";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function micros(n: number | string): number {
  return r2(Number(n) / 1_000_000);
}

function safeInt(n: number | string | undefined | null): number {
  if (n == null) return 0;
  const v = parseInt(String(n), 10);
  return isNaN(v) ? 0 : v;
}

function safeFloat(n: number | string | undefined | null): number {
  if (n == null) return 0;
  const v = parseFloat(String(n));
  return isNaN(v) ? 0 : v;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Credenciais do Google Ads ausentes. Configure GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e GOOGLE_ADS_REFRESH_TOKEN."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google OAuth token refresh falhou: ${err}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

async function authHeaders(): Promise<Record<string, string>> {
  const accessToken = await getAccessToken();
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/-/g, "");

  if (!devToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN é obrigatório.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": devToken,
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  return headers;
}

/** Executa uma operação de mutate (create/update/remove) num recurso REST v23. */
async function mutate(
  customerId: string,
  resource: string,
  operations: Record<string, unknown>[]
): Promise<{ resourceName: string }[]> {
  const headers = await authHeaders();

  const res = await fetch(
    `${GOOGLE_ADS_BASE}/customers/${customerId}/${resource}:mutate`,
    { method: "POST", headers, body: JSON.stringify({ operations }) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads mutate ${resource} (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { results?: { resourceName: string }[] };
  return data.results ?? [];
}

// ─── Resource names ─────────────────────────────────────────────────────────

const campaignPath = (cid: string, id: string) => `customers/${cid}/campaigns/${id}`;
const adGroupPath = (cid: string, id: string) => `customers/${cid}/adGroups/${id}`;
const adGroupCriterionPath = (cid: string, adGroupId: string, criterionId: string) =>
  `customers/${cid}/adGroupCriteria/${adGroupId}~${criterionId}`;
const campaignCriterionPath = (cid: string, campaignId: string, criterionId: string) =>
  `customers/${cid}/campaignCriteria/${campaignId}~${criterionId}`;
const adGroupAdPath = (cid: string, adGroupId: string, adId: string) =>
  `customers/${cid}/adGroupAds/${adGroupId}~${adId}`;

/** Converte reais (número ou string) em micros como STRING (REST v23 exige int64 como string). */
function toMicrosStr(reais: number | string): string {
  return String(Math.round(safeFloat(reais) * 1_000_000));
}

/** Converte centavos em micros como STRING. */
function centavosToMicrosStr(centavos: number | string): string {
  return String(Math.round(safeFloat(centavos) * 10_000));
}

function matchTypeEnum(matchType?: string): "EXACT" | "PHRASE" | "BROAD" {
  const mt = (matchType ?? "PHRASE").toUpperCase();
  if (mt === "EXACT" || mt === "PHRASE" || mt === "BROAD") return mt;
  return "PHRASE";
}

async function gaqlSearch<T>(customerId: string, query: string): Promise<T[]> {
  const headers = await authHeaders();

  const results: T[] = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = { query };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(
      `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers, body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Ads API (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { results?: T[]; nextPageToken?: string };
    results.push(...(data.results ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

function dateClause(since?: string, until?: string, preset?: string): string {
  if (since && until) return `segments.date BETWEEN '${since}' AND '${until}'`;

  const map: Record<string, string> = {
    today: "TODAY",
    yesterday: "YESTERDAY",
    last_7d: "LAST_7_DAYS",
    last_14d: "LAST_14_DAYS",
    last_28d: "LAST_28_DAYS",
    last_30d: "LAST_30_DAYS",
    last_90d: "LAST_90_DAYS",
    this_month: "THIS_MONTH",
    last_month: "LAST_MONTH",
    this_week_mon_today: "THIS_WEEK_MON_TODAY",
    last_week_mon_sun: "LAST_WEEK_MON_SUN",
    this_quarter: "THIS_QUARTER",
    this_year: "THIS_YEAR",
    last_year: "LAST_YEAR",
  };

  return `segments.date DURING ${map[preset ?? ""] ?? "LAST_30_DAYS"}`;
}

function mccId(): string {
  const id = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/-/g, "");
  if (!id) throw new Error("GOOGLE_ADS_LOGIN_CUSTOMER_ID é obrigatório.");
  return id;
}

export function googleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  );
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface GAccount {
  id: string;
  nome: string;
  moeda: string;
  status: string;
  nivel: number;
  gerenciador: boolean;
}

export interface GCampaign {
  id: string;
  nome: string;
  status: string;
  tipo: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  ctr: number;
  cpc_medio: number;
  custo_por_conversao: number;
  parcela_impressoes: string;
  is_perdida_orcamento?: number | null; // % de IS perdida por orçamento (Search)
  is_perdida_rank?: number | null; // % de IS perdida por rank/qualidade (Search)
}

export interface GAccountReport {
  periodo: string;
  conta_id: string;
  resumo: {
    gasto_total: number;
    impressoes: number;
    cliques: number;
    conversoes: number;
    ctr: number;
    cpc_medio: number;
    custo_por_conversao: number;
  };
  campanhas: GCampaign[];
}

export interface GKeyword {
  keyword: string;
  correspondencia: string;
  grupo: string;
  campanha: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  ctr: number;
  cpc_medio: number;
  custo_por_conversao: number;
  quality_score: number | null;
}

export interface GDayData {
  data: string;
  gasto: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  ctr: number;
}

// ─── Funções públicas ────────────────────────────────────────────────────────

export async function listGoogleAdsAccounts(): Promise<GAccount[]> {
  const rows = await gaqlSearch<{
    customerClient: {
      id: string;
      descriptiveName: string;
      currencyCode: string;
      status: string;
      level: string;
      manager: boolean;
    };
  }>(mccId(), `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.status,
      customer_client.level,
      customer_client.manager
    FROM customer_client
    ORDER BY customer_client.descriptive_name ASC
  `);

  return rows
    .filter(r => r.customerClient)
    .map(r => ({
      id: r.customerClient.id ?? "",
      nome: r.customerClient.descriptiveName ?? "(sem nome)",
      moeda: r.customerClient.currencyCode ?? "BRL",
      status: r.customerClient.status ?? "",
      nivel: Number(r.customerClient.level ?? 0),
      gerenciador: r.customerClient.manager ?? false,
    }))
    .sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome));
}

export async function getGoogleAdsCampaigns(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GCampaign[]> {
  const where = dateClause(since, until, preset);

  const rows = await gaqlSearch<{
    campaign: { id: string; name: string; status: string; advertisingChannelType: string };
    metrics: {
      costMicros: string;
      impressions: string;
      clicks: string;
      conversions: string;
      ctr: string;
      averageCpc: string;
      costPerConversion: string;
      searchImpressionShare: number | string;
      searchBudgetLostImpressionShare: number | string;
      searchRankLostImpressionShare: number | string;
    };
  }>(customerId, `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE ${where}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  const pctOrNull = (v: number | string | null | undefined): number | null =>
    v == null || String(v) === "--" || String(v) === "" ? null : r2(safeFloat(v) * 100);

  return rows.map(r => {
    const sis = r.metrics?.searchImpressionShare;
    const sisLabel =
      sis == null || String(sis) === "--" || String(sis) === ""
        ? "N/A"
        : `${r2(safeFloat(sis) * 100)}%`;

    return {
      id: r.campaign?.id ?? "",
      nome: r.campaign?.name ?? "",
      status: r.campaign?.status ?? "",
      tipo: r.campaign?.advertisingChannelType ?? "",
      gasto: micros(r.metrics?.costMicros ?? "0"),
      impressoes: safeInt(r.metrics?.impressions),
      cliques: safeInt(r.metrics?.clicks),
      conversoes: r2(safeFloat(r.metrics?.conversions)),
      ctr: r2(safeFloat(r.metrics?.ctr) * 100),
      cpc_medio: micros(r.metrics?.averageCpc ?? "0"),
      custo_por_conversao: micros(r.metrics?.costPerConversion ?? "0"),
      parcela_impressoes: sisLabel,
      is_perdida_orcamento: pctOrNull(r.metrics?.searchBudgetLostImpressionShare),
      is_perdida_rank: pctOrNull(r.metrics?.searchRankLostImpressionShare),
    };
  });
}

export async function getGoogleAdsAccountReport(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GAccountReport> {
  const campanhas = await getGoogleAdsCampaigns(customerId, since, until, preset);

  let totalGasto = 0, totalImpressoes = 0, totalCliques = 0, totalConversoes = 0;
  for (const c of campanhas) {
    totalGasto += c.gasto;
    totalImpressoes += c.impressoes;
    totalCliques += c.cliques;
    totalConversoes += c.conversoes;
  }

  const ctr = totalImpressoes > 0 ? (totalCliques / totalImpressoes) * 100 : 0;
  const cpcMedio = totalCliques > 0 ? totalGasto / totalCliques : 0;
  const custoPorConversao = totalConversoes > 0 ? totalGasto / totalConversoes : 0;
  const periodoLabel = since && until ? `${since} → ${until}` : preset ?? "últimos 30 dias";

  return {
    periodo: periodoLabel,
    conta_id: customerId,
    resumo: {
      gasto_total: r2(totalGasto),
      impressoes: totalImpressoes,
      cliques: totalCliques,
      conversoes: r2(totalConversoes),
      ctr: r2(ctr),
      cpc_medio: r2(cpcMedio),
      custo_por_conversao: r2(custoPorConversao),
    },
    campanhas,
  };
}

export async function getGoogleAdsKeywords(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string,
  limit = 50
): Promise<GKeyword[]> {
  const where = dateClause(since, until, preset);

  const rows = await gaqlSearch<{
    adGroupCriterion: {
      keyword: { text: string; matchType: string };
      qualityInfo?: { qualityScore?: number };
    };
    adGroup: { name: string };
    campaign: { name: string };
    metrics: {
      costMicros: string;
      impressions: string;
      clicks: string;
      conversions: string;
      ctr: string;
      averageCpc: string;
      costPerConversion: string;
    };
  }>(customerId, `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.quality_info.quality_score,
      ad_group.name,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM keyword_view
    WHERE ${where}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT ${limit}
  `);

  return rows.map(r => ({
    keyword: r.adGroupCriterion?.keyword?.text ?? "",
    correspondencia: r.adGroupCriterion?.keyword?.matchType ?? "",
    grupo: r.adGroup?.name ?? "",
    campanha: r.campaign?.name ?? "",
    gasto: micros(r.metrics?.costMicros ?? "0"),
    impressoes: safeInt(r.metrics?.impressions),
    cliques: safeInt(r.metrics?.clicks),
    conversoes: r2(safeFloat(r.metrics?.conversions)),
    ctr: r2(safeFloat(r.metrics?.ctr) * 100),
    cpc_medio: micros(r.metrics?.averageCpc ?? "0"),
    custo_por_conversao: micros(r.metrics?.costPerConversion ?? "0"),
    quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
  }));
}

export async function getGoogleAdsDailySeries(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GDayData[]> {
  const where = dateClause(since, until, preset);

  const rows = await gaqlSearch<{
    segments: { date: string };
    metrics: {
      costMicros: string;
      impressions: string;
      clicks: string;
      conversions: string;
      ctr: string;
    };
  }>(customerId, `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr
    FROM campaign
    WHERE ${where}
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date ASC
  `);

  const byDay: Record<string, { gasto: number; cliques: number; impressoes: number; conversoes: number }> = {};

  for (const r of rows) {
    const day = r.segments?.date;
    if (!day) continue;
    if (!byDay[day]) byDay[day] = { gasto: 0, cliques: 0, impressoes: 0, conversoes: 0 };
    byDay[day].gasto += safeInt(r.metrics?.costMicros);
    byDay[day].cliques += safeInt(r.metrics?.clicks);
    byDay[day].impressoes += safeInt(r.metrics?.impressions);
    byDay[day].conversoes += safeFloat(r.metrics?.conversions);
  }

  return Object.keys(byDay).sort().map(day => {
    const d = byDay[day];
    const ctr = d.impressoes > 0 ? (d.cliques / d.impressoes) * 100 : 0;
    return {
      data: day,
      gasto: micros(d.gasto),
      cliques: d.cliques,
      impressoes: d.impressoes,
      conversoes: r2(d.conversoes),
      ctr: r2(ctr),
    };
  });
}

// ─── Ad Groups ───────────────────────────────────────────────────────────────

export interface GAdGroup {
  id: string;
  nome: string;
  status: string;
  campanha: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  ctr: number;
  cpc_medio: number;
  custo_por_conversao: number;
}

export async function getGoogleAdsAdGroups(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GAdGroup[]> {
  const where = dateClause(since, until, preset);

  const rows = await gaqlSearch<{
    adGroup: { id: string; name: string; status: string };
    campaign: { name: string };
    metrics: {
      costMicros: string;
      impressions: string;
      clicks: string;
      conversions: string;
      ctr: string;
      averageCpc: string;
      costPerConversion: string;
    };
  }>(customerId, `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM ad_group
    WHERE ${where}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  return rows.map(r => ({
    id: r.adGroup?.id ?? "",
    nome: r.adGroup?.name ?? "",
    status: r.adGroup?.status ?? "",
    campanha: r.campaign?.name ?? "",
    gasto: micros(r.metrics?.costMicros ?? "0"),
    impressoes: safeInt(r.metrics?.impressions),
    cliques: safeInt(r.metrics?.clicks),
    conversoes: r2(safeFloat(r.metrics?.conversions)),
    ctr: r2(safeFloat(r.metrics?.ctr) * 100),
    cpc_medio: micros(r.metrics?.averageCpc ?? "0"),
    custo_por_conversao: micros(r.metrics?.costPerConversion ?? "0"),
  }));
}

// ─── Anúncios (ad_group_ad) ──────────────────────────────────────────────────

export interface GAd {
  id: string;
  nome: string;
  status: string;
  grupo: string; // grupo de anúncios (parent)
  gasto: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  ctr: number;
  cpc_medio: number;
  custo_por_conversao: number;
}

export async function getGoogleAdsAds(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GAd[]> {
  const where = dateClause(since, until, preset);

  const rows = await gaqlSearch<{
    adGroupAd: { ad: { id: string; name?: string }; status: string };
    adGroup: { name: string };
    metrics: {
      costMicros: string;
      impressions: string;
      clicks: string;
      conversions: string;
      ctr: string;
      averageCpc: string;
      costPerConversion: string;
    };
  }>(customerId, `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      ad_group.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM ad_group_ad
    WHERE ${where}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  return rows.map(r => ({
    id: r.adGroupAd?.ad?.id ?? "",
    nome: r.adGroupAd?.ad?.name?.trim() || `Anúncio #${r.adGroupAd?.ad?.id ?? "?"}`,
    status: r.adGroupAd?.status ?? "",
    grupo: r.adGroup?.name ?? "",
    gasto: micros(r.metrics?.costMicros ?? "0"),
    impressoes: safeInt(r.metrics?.impressions),
    cliques: safeInt(r.metrics?.clicks),
    conversoes: r2(safeFloat(r.metrics?.conversions)),
    ctr: r2(safeFloat(r.metrics?.ctr) * 100),
    cpc_medio: micros(r.metrics?.averageCpc ?? "0"),
    custo_por_conversao: micros(r.metrics?.costPerConversion ?? "0"),
  }));
}

// ─── Hourly Breakdown ────────────────────────────────────────────────────────

export interface GHourData {
  hora: number;
  gasto: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  ctr: number;
}

export async function getGoogleAdsHourlyBreakdown(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GHourData[]> {
  const where = dateClause(since, until, preset);

  const rows = await gaqlSearch<{
    segments: { hour: number };
    metrics: {
      costMicros: string;
      impressions: string;
      clicks: string;
      conversions: string;
      ctr: string;
    };
  }>(customerId, `
    SELECT
      segments.hour,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr
    FROM campaign
    WHERE ${where}
      AND campaign.status != 'REMOVED'
    ORDER BY segments.hour ASC
  `);

  const byHour: Record<number, { gasto: number; cliques: number; impressoes: number; conversoes: number }> = {};

  for (const r of rows) {
    const h = r.segments?.hour;
    if (h == null) continue;
    if (!byHour[h]) byHour[h] = { gasto: 0, cliques: 0, impressoes: 0, conversoes: 0 };
    byHour[h].gasto      += safeInt(r.metrics?.costMicros);
    byHour[h].cliques    += safeInt(r.metrics?.clicks);
    byHour[h].impressoes += safeInt(r.metrics?.impressions);
    byHour[h].conversoes += safeFloat(r.metrics?.conversions);
  }

  return Array.from({ length: 24 }, (_, h) => {
    const d = byHour[h] ?? { gasto: 0, cliques: 0, impressoes: 0, conversoes: 0 };
    const ctr = d.impressoes > 0 ? (d.cliques / d.impressoes) * 100 : 0;
    return {
      hora: h,
      gasto: micros(d.gasto),
      cliques: d.cliques,
      impressoes: d.impressoes,
      conversoes: r2(d.conversoes),
      ctr: r2(ctr),
    };
  });
}

// ─── Keyword Planner ─────────────────────────────────────────────────────────

export interface GKeywordIdea {
  keyword: string;
  media_buscas_mensais: number;
  competicao: string;
  indice_competicao: number;
  lance_topo_min: number;
  lance_topo_max: number;
  tendencia_mensal: Array<{ ano: number; mes: number; buscas: number }>;
}

async function keywordPlannerRequest<T>(
  customerId: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const headers = await authHeaders();

  const res = await fetch(
    `${GOOGLE_ADS_BASE}/customers/${customerId}:${method}`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads Keyword Planner (${res.status}): ${err}`);
  }

  return res.json() as Promise<T>;
}

export async function getGoogleAdsKeywordIdeas(
  customerId: string,
  keywords: string[],
  idioma = "languageConstants/1014",
  geo = "geoTargetConstants/2076"
): Promise<GKeywordIdea[]> {
  const data = await keywordPlannerRequest<{ results?: Array<{
    text: string;
    keywordIdeaMetrics?: {
      avgMonthlySearches?: string;
      competition?: string;
      competitionIndex?: string;
      lowTopOfPageBidMicros?: string;
      highTopOfPageBidMicros?: string;
      monthlySearchVolumes?: Array<{ year: number; month: string; monthlySearches: string }>;
    };
  }> }>(customerId, "generateKeywordIdeas", {
    language: idioma,
    geoTargetConstants: [geo],
    keywordPlanNetwork: "GOOGLE_SEARCH",
    keywordSeed: { keywords },
  });

  const MES: Record<string, number> = {
    JANUARY:1, FEBRUARY:2, MARCH:3, APRIL:4, MAY:5, JUNE:6,
    JULY:7, AUGUST:8, SEPTEMBER:9, OCTOBER:10, NOVEMBER:11, DECEMBER:12,
  };

  return (data.results ?? []).map(r => {
    const m = r.keywordIdeaMetrics;
    return {
      keyword: r.text ?? "",
      media_buscas_mensais: safeInt(m?.avgMonthlySearches),
      competicao: m?.competition ?? "UNSPECIFIED",
      indice_competicao: safeInt(m?.competitionIndex),
      lance_topo_min: micros(m?.lowTopOfPageBidMicros ?? "0"),
      lance_topo_max: micros(m?.highTopOfPageBidMicros ?? "0"),
      tendencia_mensal: (m?.monthlySearchVolumes ?? []).map(v => ({
        ano: v.year,
        mes: MES[v.month] ?? 0,
        buscas: safeInt(v.monthlySearches),
      })).sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes),
    };
  }).sort((a, b) => b.media_buscas_mensais - a.media_buscas_mensais);
}

// ─── Conversion Actions ───────────────────────────────────────────────────────

export interface GConversionAction {
  nome: string;
  conversoes: number;
  todas_conversoes: number;
}

export async function getGoogleAdsConversionActions(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GConversionAction[]> {
  const where = dateClause(since, until, preset);

  try {
    const rows = await gaqlSearch<{
      segments: { conversionActionName: string };
      metrics: { conversions: string; allConversions: string };
    }>(customerId, `
      SELECT
        segments.conversion_action_name,
        metrics.conversions,
        metrics.all_conversions
      FROM campaign
      WHERE ${where}
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.conversions DESC
    `);

    const byName: Record<string, { conversoes: number; todas: number }> = {};
    for (const r of rows) {
      const nome = r.segments?.conversionActionName ?? "(sem nome)";
      if (!byName[nome]) byName[nome] = { conversoes: 0, todas: 0 };
      byName[nome].conversoes += safeFloat(r.metrics?.conversions);
      byName[nome].todas += safeFloat(r.metrics?.allConversions);
    }

    return Object.entries(byName)
      .map(([nome, v]) => ({
        nome,
        conversoes: r2(v.conversoes),
        todas_conversoes: r2(v.todas),
      }))
      .filter((x) => x.todas_conversoes > 0)
      .sort((a, b) => b.todas_conversoes - a.todas_conversoes);
  } catch {
    return [];
  }
}

// ─── Demographics ─────────────────────────────────────────────────────────────

export interface GDemographicRow {
  segmento: string;
  impressoes: number;
  cliques: number;
  conversoes: number;
  gasto: number;
}

export interface GDemographics {
  por_genero: GDemographicRow[];
  por_faixa_etaria: GDemographicRow[];
}

const GENDER_MAP: Record<string, string> = {
  MALE: "Masculino",
  FEMALE: "Feminino",
  UNDETERMINED: "Desconhecido",
  UNKNOWN: "Desconhecido",
};

const AGE_MAP: Record<string, string> = {
  AGE_RANGE_18_24: "18–24",
  AGE_RANGE_25_34: "25–34",
  AGE_RANGE_35_44: "35–44",
  AGE_RANGE_45_54: "45–54",
  AGE_RANGE_55_64: "55–64",
  AGE_RANGE_65_UP: "65+",
  UNDETERMINED: "Desconhecido",
};

export async function getGoogleAdsDemographics(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string
): Promise<GDemographics> {
  const where = dateClause(since, until, preset);

  const [genderRows, ageRows] = await Promise.all([
    gaqlSearch<{
      adGroupCriterion: { gender: { type: string } };
      metrics: { impressions: string; clicks: string; conversions: string; costMicros: string };
    }>(customerId, `
      SELECT
        ad_group_criterion.gender.type,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros
      FROM gender_view
      WHERE ${where}
        AND campaign.status != 'REMOVED'
        AND ad_group.status != 'REMOVED'
    `).catch(() => []),
    gaqlSearch<{
      adGroupCriterion: { ageRange: { type: string } };
      metrics: { impressions: string; clicks: string; conversions: string; costMicros: string };
    }>(customerId, `
      SELECT
        ad_group_criterion.age_range.type,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros
      FROM age_range_view
      WHERE ${where}
        AND campaign.status != 'REMOVED'
        AND ad_group.status != 'REMOVED'
    `).catch(() => []),
  ]);

  const aggGender: Record<string, GDemographicRow> = {};
  for (const r of genderRows) {
    const key = GENDER_MAP[r.adGroupCriterion?.gender?.type ?? ""] ?? "Desconhecido";
    if (!aggGender[key]) aggGender[key] = { segmento: key, impressoes: 0, cliques: 0, conversoes: 0, gasto: 0 };
    aggGender[key].impressoes += safeInt(r.metrics?.impressions);
    aggGender[key].cliques += safeInt(r.metrics?.clicks);
    aggGender[key].conversoes += r2(safeFloat(r.metrics?.conversions));
    aggGender[key].gasto += micros(r.metrics?.costMicros ?? "0");
  }

  const AGE_ORDER = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+", "Desconhecido"];
  const aggAge: Record<string, GDemographicRow> = {};
  for (const r of ageRows) {
    const key = AGE_MAP[r.adGroupCriterion?.ageRange?.type ?? ""] ?? "Desconhecido";
    if (!aggAge[key]) aggAge[key] = { segmento: key, impressoes: 0, cliques: 0, conversoes: 0, gasto: 0 };
    aggAge[key].impressoes += safeInt(r.metrics?.impressions);
    aggAge[key].cliques += safeInt(r.metrics?.clicks);
    aggAge[key].conversoes += r2(safeFloat(r.metrics?.conversions));
    aggAge[key].gasto += micros(r.metrics?.costMicros ?? "0");
  }

  return {
    por_genero: Object.values(aggGender).filter((x) => x.impressoes > 0),
    por_faixa_etaria: AGE_ORDER
      .map((k) => aggAge[k])
      .filter((x): x is GDemographicRow => !!x && x.impressoes > 0),
  };
}

// ─── Search Terms ─────────────────────────────────────────────────────────────

export interface GSearchTerm {
  termo: string;
  status: string;
  campanha: string;
  grupo: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  ctr: number;
  cpc_medio: number;
}

export async function getGoogleAdsSearchTerms(
  customerId: string,
  since?: string,
  until?: string,
  preset?: string,
  limit = 100
): Promise<GSearchTerm[]> {
  const where = dateClause(since, until, preset);

  const rows = await gaqlSearch<{
    searchTermView: { searchTerm: string; status: string };
    campaign: { name: string };
    adGroup: { name: string };
    metrics: {
      costMicros: string;
      impressions: string;
      clicks: string;
      conversions: string;
      ctr: string;
      averageCpc: string;
    };
  }>(customerId, `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.name,
      ad_group.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM search_term_view
    WHERE ${where}
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT ${limit}
  `);

  return rows.map(r => ({
    termo: r.searchTermView?.searchTerm ?? "",
    status: r.searchTermView?.status ?? "",
    campanha: r.campaign?.name ?? "",
    grupo: r.adGroup?.name ?? "",
    gasto: micros(r.metrics?.costMicros ?? "0"),
    impressoes: safeInt(r.metrics?.impressions),
    cliques: safeInt(r.metrics?.clicks),
    conversoes: r2(safeFloat(r.metrics?.conversions)),
    ctr: r2(safeFloat(r.metrics?.ctr) * 100),
    cpc_medio: micros(r.metrics?.averageCpc ?? "0"),
  }));
}

// ─── Escrita: criação, edição e exclusão (Search apenas) ────────────────────
// Espelha os scripts create.py/update.py/delete.py da skill google-ads-ratos,
// mas via REST v23 (sem SDK Python). Toda criação de campanha/ad group/anúncio
// nasce PAUSED — ativar é ação separada (update_status).

export interface GMutationResult {
  status: string;
  resource_name: string;
  [key: string]: unknown;
}

// ── Create ───────────────────────────────────────────────────────────────

export async function createGoogleAdsCampaign(
  customerId: string,
  params: {
    name: string;
    dailyBudgetCentavos: number | string;
    targetCpaReais?: number | string;
    maximizeConversions?: boolean;
    maximizeConversionValue?: boolean;
    targetRoas?: number;
    targetImpressionShareLocation?: "ANYWHERE_ON_PAGE" | "TOP_OF_PAGE" | "ABSOLUTE_TOP_OF_PAGE";
    targetImpressionSharePercent?: number;
    manualCpc?: boolean;
    cpcBidCeilingReais?: number | string;
    targetSearchPartners?: boolean;
    locationTargetingType?: "PRESENCE" | "PRESENCE_OR_INTEREST";
    disableAiAutomation?: boolean;
  }
): Promise<GMutationResult> {
  const budgetResults = await mutate(customerId, "campaignBudgets", [{
    create: {
      name: `Budget-${params.name}-${Date.now()}`,
      amountMicros: centavosToMicrosStr(params.dailyBudgetCentavos),
      deliveryMethod: "STANDARD",
    },
  }]);
  const budgetResource = budgetResults[0]?.resourceName;
  if (!budgetResource) throw new Error("Falha ao criar orçamento da campanha.");

  const campaign: Record<string, unknown> = {
    name: params.name,
    campaignBudget: budgetResource,
    status: "PAUSED",
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    advertisingChannelType: "SEARCH",
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: params.targetSearchPartners ?? true,
    },
  };

  // Padrão: desliga automação por IA (personalização de texto via IA e expansão
  // de URL final automática) — confirmado ao vivo: campaign.assetAutomationSettings
  // é um array de {assetAutomationType, assetAutomationStatus}; campanha real do
  // MCC tem TEXT_ASSET_AUTOMATION=OPTED_OUT. FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION
  // confirmado só via proto oficial (nenhuma campanha do MCC opta por ela hoje).
  if (params.disableAiAutomation ?? true) {
    campaign.assetAutomationSettings = [
      { assetAutomationType: "TEXT_ASSET_AUTOMATION", assetAutomationStatus: "OPTED_OUT" },
      { assetAutomationType: "FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION", assetAutomationStatus: "OPTED_OUT" },
    ];
  }

  if (params.locationTargetingType) {
    campaign.geoTargetTypeSetting = { positiveGeoTargetType: params.locationTargetingType };
  }

  // Prioridade (mutuamente exclusivos): Maximizar Valor da Conversão (teto de ROAS
  // opcional) > Target ROAS estrito > Parcela de Impressões Desejada > Maximizar
  // Conversões (teto de CPA opcional) > Target CPA estrito > CPC Manual (só se
  // pedido explicitamente) > Maximizar Cliques (PADRÃO).
  // Maximizar Cliques como fallback é mais seguro que CPC Manual: CPC Manual sem
  // lance configurado em nenhum nível (ad group/keyword) trava a campanha, que não
  // consegue gastar nada mesmo ativada. Confirmado contra campanhas reais do MCC:
  // TARGET_SPEND = { cpcBidCeilingMicros }, MAXIMIZE_CONVERSIONS aceita targetCpaMicros
  // opcional como teto "soft" (visto em campanhas reais rodando com os dois juntos).
  // TARGET_ROAS/MAXIMIZE_CONVERSION_VALUE/TARGET_IMPRESSION_SHARE NÃO foram
  // confirmados ao vivo (nenhuma campanha do MCC usa essas 3 estratégias hoje) —
  // implementados só com base em documentação estável da API.
  if (params.maximizeConversionValue) {
    campaign.maximizeConversionValue = params.targetRoas != null ? { targetRoas: params.targetRoas } : {};
  } else if (params.targetRoas != null) {
    const targetRoas: Record<string, unknown> = { targetRoas: params.targetRoas };
    if (params.cpcBidCeilingReais != null) targetRoas.cpcBidCeilingMicros = toMicrosStr(params.cpcBidCeilingReais);
    campaign.targetRoas = targetRoas;
  } else if (params.targetImpressionShareLocation) {
    const targetImpressionShare: Record<string, unknown> = {
      location: params.targetImpressionShareLocation,
      locationFractionMicros: String(Math.round(((params.targetImpressionSharePercent ?? 100) / 100) * 1_000_000)),
    };
    if (params.cpcBidCeilingReais != null) {
      targetImpressionShare.cpcBidCeilingMicros = toMicrosStr(params.cpcBidCeilingReais);
    }
    campaign.targetImpressionShare = targetImpressionShare;
  } else if (params.maximizeConversions) {
    campaign.maximizeConversions =
      params.targetCpaReais != null ? { targetCpaMicros: toMicrosStr(params.targetCpaReais) } : {};
  } else if (params.targetCpaReais != null) {
    campaign.targetCpa = { targetCpaMicros: toMicrosStr(params.targetCpaReais) };
  } else if (params.manualCpc) {
    campaign.manualCpc = { enhancedCpcEnabled: false };
  } else {
    campaign.targetSpend =
      params.cpcBidCeilingReais != null ? { cpcBidCeilingMicros: toMicrosStr(params.cpcBidCeilingReais) } : {};
  }

  const results = await mutate(customerId, "campaigns", [{ create: campaign }]);

  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    budget_resource: budgetResource,
    campaign_name: params.name,
    nota: "Campanha criada com status PAUSED. Revise antes de ativar.",
  };
}

// ── Segmentação: geo, idioma, agenda de anúncios ─────────────────────────

export interface GGeoTargetSuggestion {
  id: string;
  nome: string;
  nome_canonico: string;
  pais: string;
  tipo: string;
}

/** Busca geo target constants por nome (ex: "São Paulo") via GeoTargetConstantService.SuggestGeoTargetConstants. */
export async function searchGoogleAdsGeoTargets(
  names: string[],
  countryCode?: string
): Promise<GGeoTargetSuggestion[]> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = { locationNames: { names } };
  if (countryCode) body.countryCode = countryCode;

  const res = await fetch(`${GOOGLE_ADS_BASE}/geoTargetConstants:suggest`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads geoTargetConstants:suggest (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    geoTargetConstantSuggestions?: Array<{
      geoTargetConstant?: { id?: string; name?: string; canonicalName?: string; countryCode?: string; targetType?: string };
    }>;
  };

  return (data.geoTargetConstantSuggestions ?? []).map((s) => ({
    id: s.geoTargetConstant?.id ?? "",
    nome: s.geoTargetConstant?.name ?? "",
    nome_canonico: s.geoTargetConstant?.canonicalName ?? "",
    pais: s.geoTargetConstant?.countryCode ?? "",
    tipo: s.geoTargetConstant?.targetType ?? "",
  }));
}

export async function addGoogleAdsLocationTargets(
  customerId: string,
  params: { campaignId: string; geoTargetConstantIds: string[]; negative?: boolean }
): Promise<GMutationResult> {
  const operations = params.geoTargetConstantIds.map((id) => ({
    create: {
      campaign: campaignPath(customerId, params.campaignId),
      negative: params.negative ?? false,
      location: { geoTargetConstant: `geoTargetConstants/${id}` },
    },
  }));

  const results = await mutate(customerId, "campaignCriteria", operations);
  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    resource_names: results.map((r) => r.resourceName),
    geo_target_constant_ids: params.geoTargetConstantIds,
    negative: params.negative ?? false,
  };
}

export async function addGoogleAdsLanguageTargets(
  customerId: string,
  params: { campaignId: string; languageConstantIds: string[] }
): Promise<GMutationResult> {
  const operations = params.languageConstantIds.map((id) => ({
    create: {
      campaign: campaignPath(customerId, params.campaignId),
      language: { languageConstant: `languageConstants/${id}` },
    },
  }));

  const results = await mutate(customerId, "campaignCriteria", operations);
  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    resource_names: results.map((r) => r.resourceName),
    language_constant_ids: params.languageConstantIds,
  };
}

const AD_SCHEDULE_MINUTE_ENUM: Record<number, string> = {
  0: "ZERO",
  15: "FIFTEEN",
  30: "THIRTY",
  45: "FORTY_FIVE",
};

export interface GAdScheduleSlot {
  dayOfWeek: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
}

export async function addGoogleAdsAdSchedule(
  customerId: string,
  params: { campaignId: string; schedule: GAdScheduleSlot[] }
): Promise<GMutationResult> {
  const operations = params.schedule.map((slot) => {
    const startMinute = AD_SCHEDULE_MINUTE_ENUM[slot.startMinute ?? 0];
    const endMinute = AD_SCHEDULE_MINUTE_ENUM[slot.endMinute ?? 0];
    if (!startMinute || !endMinute) {
      throw new Error("startMinute/endMinute devem ser 0, 15, 30 ou 45.");
    }
    return {
      create: {
        campaign: campaignPath(customerId, params.campaignId),
        adSchedule: {
          dayOfWeek: slot.dayOfWeek,
          startHour: slot.startHour,
          startMinute,
          endHour: slot.endHour,
          endMinute,
        },
      },
    };
  });

  const results = await mutate(customerId, "campaignCriteria", operations);
  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    resource_names: results.map((r) => r.resourceName),
    slots_criadas: params.schedule.length,
  };
}

export async function createGoogleAdsAdGroup(
  customerId: string,
  params: { campaignId: string; name: string; cpcBidReais?: number | string }
): Promise<GMutationResult> {
  const adGroup: Record<string, unknown> = {
    name: params.name,
    campaign: campaignPath(customerId, params.campaignId),
    status: "PAUSED",
    type: "SEARCH_STANDARD",
  };
  if (params.cpcBidReais != null) adGroup.cpcBidMicros = toMicrosStr(params.cpcBidReais);

  const results = await mutate(customerId, "adGroups", [{ create: adGroup }]);

  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    ad_group_name: params.name,
    nota: "Ad group criado com status PAUSED.",
  };
}

export async function addGoogleAdsKeyword(
  customerId: string,
  params: { adGroupId: string; text: string; matchType?: string; bidReais?: number | string }
): Promise<GMutationResult> {
  const matchType = matchTypeEnum(params.matchType);
  const criterion: Record<string, unknown> = {
    adGroup: adGroupPath(customerId, params.adGroupId),
    status: "ENABLED",
    keyword: { text: params.text, matchType },
  };
  if (params.bidReais != null) criterion.cpcBidMicros = toMicrosStr(params.bidReais);

  const results = await mutate(customerId, "adGroupCriteria", [{ create: criterion }]);

  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    keyword: params.text,
    match_type: matchType,
  };
}

export async function createGoogleAdsRsa(
  customerId: string,
  params: {
    adGroupId: string;
    headlines: string[];
    descriptions: string[];
    finalUrl: string;
    path1?: string;
    path2?: string;
  }
): Promise<GMutationResult> {
  const headlines = params.headlines.filter((h) => h.trim()).slice(0, 15).map((text) => ({ text }));
  const descriptions = params.descriptions.filter((d) => d.trim()).slice(0, 4).map((text) => ({ text }));

  if (headlines.length === 0) throw new Error("Informe ao menos 1 headline.");
  if (descriptions.length === 0) throw new Error("Informe ao menos 1 description.");

  const responsiveSearchAd: Record<string, unknown> = { headlines, descriptions };
  if (params.path1) responsiveSearchAd.path1 = params.path1;
  if (params.path2) responsiveSearchAd.path2 = params.path2;

  const results = await mutate(customerId, "adGroupAds", [{
    create: {
      adGroup: adGroupPath(customerId, params.adGroupId),
      status: "PAUSED",
      ad: { finalUrls: [params.finalUrl], responsiveSearchAd },
    },
  }]);

  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    headlines_count: headlines.length,
    descriptions_count: descriptions.length,
    nota: "RSA criado com status PAUSED. Revise antes de ativar.",
  };
}

export async function createGoogleAdsSitelink(
  customerId: string,
  params: { campaignId: string; text: string; url: string; desc1?: string; desc2?: string }
): Promise<GMutationResult> {
  const assetResults = await mutate(customerId, "assets", [{
    create: {
      sitelinkAsset: {
        linkText: params.text,
        description1: params.desc1 ?? "",
        description2: params.desc2 ?? "",
      },
      finalUrls: [params.url],
    },
  }]);
  const assetResource = assetResults[0]?.resourceName;
  if (!assetResource) throw new Error("Falha ao criar sitelink asset.");

  const linkResults = await mutate(customerId, "campaignAssets", [{
    create: {
      campaign: campaignPath(customerId, params.campaignId),
      asset: assetResource,
      fieldType: "SITELINK",
    },
  }]);

  return {
    status: "created",
    resource_name: linkResults[0]?.resourceName ?? "",
    asset_resource: assetResource,
    sitelink_text: params.text,
  };
}

export async function createGoogleAdsCallout(
  customerId: string,
  params: { campaignId: string; text: string }
): Promise<GMutationResult> {
  const assetResults = await mutate(customerId, "assets", [{
    create: { calloutAsset: { calloutText: params.text } },
  }]);
  const assetResource = assetResults[0]?.resourceName;
  if (!assetResource) throw new Error("Falha ao criar callout asset.");

  const linkResults = await mutate(customerId, "campaignAssets", [{
    create: {
      campaign: campaignPath(customerId, params.campaignId),
      asset: assetResource,
      fieldType: "CALLOUT",
    },
  }]);

  return {
    status: "created",
    resource_name: linkResults[0]?.resourceName ?? "",
    asset_resource: assetResource,
    callout_text: params.text,
  };
}

export interface GAssetSummary {
  resource_name: string;
  id: string;
  texto: string;
}

/** Lista sitelinks ou callouts já existentes na conta (biblioteca de assets), pra reaproveitar em vez de criar de novo. */
export async function listGoogleAdsAssets(
  customerId: string,
  type: "SITELINK" | "CALLOUT"
): Promise<GAssetSummary[]> {
  const field = type === "SITELINK" ? "asset.sitelink_asset.link_text" : "asset.callout_asset.callout_text";
  const rows = await gaqlSearch<{
    asset: { resourceName: string; id: string; sitelinkAsset?: { linkText?: string }; calloutAsset?: { calloutText?: string } };
  }>(customerId, `
    SELECT asset.resource_name, asset.id, ${field}
    FROM asset
    WHERE asset.type = '${type}'
  `);

  return rows.map((r) => ({
    resource_name: r.asset?.resourceName ?? "",
    id: r.asset?.id ?? "",
    texto: (type === "SITELINK" ? r.asset?.sitelinkAsset?.linkText : r.asset?.calloutAsset?.calloutText) ?? "",
  }));
}

/** Vincula um asset (sitelink/callout) já existente a uma campanha, sem criar um novo. */
export async function attachGoogleAdsAsset(
  customerId: string,
  params: { campaignId: string; assetResourceName: string; fieldType: "SITELINK" | "CALLOUT" }
): Promise<GMutationResult> {
  const results = await mutate(customerId, "campaignAssets", [{
    create: {
      campaign: campaignPath(customerId, params.campaignId),
      asset: params.assetResourceName,
      fieldType: params.fieldType,
    },
  }]);

  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    asset_resource: params.assetResourceName,
    field_type: params.fieldType,
  };
}

// ── Mensagem WhatsApp (BusinessMessageAsset) ─────────────────────────────
// Confirmado ao vivo contra o anúncio ativo da Batista Rastreamento + proto oficial
// (asset_types.proto): asset.type = "BUSINESS_MESSAGE" (NÃO "MESSAGE" — esse valor
// não existe), campaignAsset.fieldType = "BUSINESS_MESSAGE".

export async function createGoogleAdsWhatsappMessage(
  customerId: string,
  params: {
    campaignId: string;
    countryCode: string;
    phoneNumber: string;
    starterMessage: string;
    callToActionSelection: string;
    callToActionDescription: string;
  }
): Promise<GMutationResult> {
  const assetResults = await mutate(customerId, "assets", [{
    create: {
      businessMessageAsset: {
        messageProvider: "WHATSAPP",
        starterMessage: params.starterMessage,
        callToAction: {
          callToActionSelection: params.callToActionSelection,
          callToActionDescription: params.callToActionDescription,
        },
        whatsappInfo: { countryCode: params.countryCode, phoneNumber: params.phoneNumber },
      },
    },
  }]);
  const assetResource = assetResults[0]?.resourceName;
  if (!assetResource) throw new Error("Falha ao criar business message asset (WhatsApp).");

  const linkResults = await mutate(customerId, "campaignAssets", [{
    create: {
      campaign: campaignPath(customerId, params.campaignId),
      asset: assetResource,
      fieldType: "BUSINESS_MESSAGE",
    },
  }]);

  return {
    status: "created",
    resource_name: linkResults[0]?.resourceName ?? "",
    asset_resource: assetResource,
  };
}

// ── Metas de conversão específicas da campanha ────────────────────────────
// Confirmado ao vivo (GAQL campaign_conversion_goal) + proto oficial
// (campaign_conversion_goal.proto): resourceName
// "customers/{cid}/campaignConversionGoals/{campaignId}~{category}~{origin}",
// campo mutável é só "biddable".

export interface GCampaignConversionGoal {
  category: string;
  origin: string;
  biddable: boolean;
}

export async function listGoogleAdsCampaignConversionGoals(
  customerId: string,
  campaignId: string
): Promise<GCampaignConversionGoal[]> {
  const rows = await gaqlSearch<{
    campaignConversionGoal: { category?: string; origin?: string; biddable?: boolean };
  }>(customerId, `
    SELECT campaign_conversion_goal.category, campaign_conversion_goal.origin, campaign_conversion_goal.biddable
    FROM campaign_conversion_goal
    WHERE campaign.id = ${campaignId}
  `);

  return rows.map((r) => ({
    category: r.campaignConversionGoal?.category ?? "",
    origin: r.campaignConversionGoal?.origin ?? "",
    biddable: r.campaignConversionGoal?.biddable ?? false,
  }));
}

const campaignConversionGoalPath = (cid: string, campaignId: string, category: string, origin: string) =>
  `customers/${cid}/campaignConversionGoals/${campaignId}~${category}~${origin}`;

export async function setGoogleAdsCampaignConversionGoal(
  customerId: string,
  params: { campaignId: string; category: string; origin: string; biddable: boolean }
): Promise<GMutationResult> {
  const resourceName = campaignConversionGoalPath(customerId, params.campaignId, params.category, params.origin);
  const results = await mutate(customerId, "campaignConversionGoals", [{
    update: { resourceName, biddable: params.biddable },
    updateMask: "biddable",
  }]);
  return {
    status: "updated",
    resource_name: results[0]?.resourceName ?? resourceName,
    biddable: params.biddable,
  };
}

export async function addGoogleAdsNegativeKeyword(
  customerId: string,
  params: { campaignId?: string; adGroupId?: string; text: string; matchType?: string }
): Promise<GMutationResult> {
  const matchType = matchTypeEnum(params.matchType);

  if (params.adGroupId) {
    const results = await mutate(customerId, "adGroupCriteria", [{
      create: {
        adGroup: adGroupPath(customerId, params.adGroupId),
        negative: true,
        keyword: { text: params.text, matchType },
      },
    }]);
    return {
      status: "created",
      resource_name: results[0]?.resourceName ?? "",
      keyword: params.text,
      match_type: matchType,
      level: "ad_group",
    };
  }

  if (!params.campaignId) throw new Error("Informe campaignId ou adGroupId para a negativa.");

  const results = await mutate(customerId, "campaignCriteria", [{
    create: {
      campaign: campaignPath(customerId, params.campaignId),
      negative: true,
      keyword: { text: params.text, matchType },
    },
  }]);
  return {
    status: "created",
    resource_name: results[0]?.resourceName ?? "",
    keyword: params.text,
    match_type: matchType,
    level: "campaign",
  };
}

// ── Update ───────────────────────────────────────────────────────────────

export async function updateGoogleAdsCampaign(
  customerId: string,
  params: { campaignId: string; status?: string; name?: string; dailyBudgetCentavos?: number | string }
): Promise<GMutationResult> {
  // REMOVED não é um valor aceito em update+status (INVALID_ENUM_VALUE confirmado
  // ao vivo) — remover é uma operação "remove" separada, igual delete_*.
  if (params.status?.toUpperCase() === "REMOVED") {
    const resourceName = campaignPath(customerId, params.campaignId);
    const results = await mutate(customerId, "campaigns", [{ remove: resourceName }]);
    return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName };
  }

  const fieldsUpdated: string[] = [];
  let resourceName = "";

  if (params.status != null || params.name != null) {
    const update: Record<string, unknown> = { resourceName: campaignPath(customerId, params.campaignId) };
    const mask: string[] = [];
    if (params.status) { update.status = params.status.toUpperCase(); mask.push("status"); }
    if (params.name) { update.name = params.name; mask.push("name"); }

    const results = await mutate(customerId, "campaigns", [{ update, updateMask: mask.join(",") }]);
    resourceName = results[0]?.resourceName ?? "";
    fieldsUpdated.push(...mask);
  }

  if (params.dailyBudgetCentavos != null) {
    const rows = await gaqlSearch<{ campaign: { campaignBudget: string } }>(
      customerId,
      `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${params.campaignId}`
    );
    const budgetResource = rows[0]?.campaign?.campaignBudget;
    if (!budgetResource) throw new Error(`Orçamento não encontrado para a campanha ${params.campaignId}.`);

    await mutate(customerId, "campaignBudgets", [{
      update: { resourceName: budgetResource, amountMicros: centavosToMicrosStr(params.dailyBudgetCentavos) },
      updateMask: "amountMicros",
    }]);
    fieldsUpdated.push("budget_amount_micros");
    if (!resourceName) resourceName = campaignPath(customerId, params.campaignId);
  }

  if (fieldsUpdated.length === 0) {
    throw new Error("Nenhum campo para atualizar. Informe status, name ou dailyBudgetCentavos.");
  }

  return { status: "updated", resource_name: resourceName, fields_updated: fieldsUpdated };
}

export async function updateGoogleAdsAdGroup(
  customerId: string,
  params: { adGroupId: string; status?: string; name?: string; cpcBidReais?: number | string }
): Promise<GMutationResult> {
  if (params.status?.toUpperCase() === "REMOVED") {
    const resourceName = adGroupPath(customerId, params.adGroupId);
    const results = await mutate(customerId, "adGroups", [{ remove: resourceName }]);
    return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName };
  }

  const update: Record<string, unknown> = { resourceName: adGroupPath(customerId, params.adGroupId) };
  const mask: string[] = [];
  if (params.status) { update.status = params.status.toUpperCase(); mask.push("status"); }
  if (params.name) { update.name = params.name; mask.push("name"); }
  if (params.cpcBidReais != null) { update.cpcBidMicros = toMicrosStr(params.cpcBidReais); mask.push("cpcBidMicros"); }

  if (mask.length === 0) throw new Error("Nenhum campo para atualizar. Informe status, name ou cpcBidReais.");

  const results = await mutate(customerId, "adGroups", [{ update, updateMask: mask.join(",") }]);
  return { status: "updated", resource_name: results[0]?.resourceName ?? "", fields_updated: mask };
}

export async function updateGoogleAdsKeyword(
  customerId: string,
  params: { adGroupId: string; criterionId: string; status?: string; bidReais?: number | string }
): Promise<GMutationResult> {
  if (params.status?.toUpperCase() === "REMOVED") {
    const resourceName = adGroupCriterionPath(customerId, params.adGroupId, params.criterionId);
    const results = await mutate(customerId, "adGroupCriteria", [{ remove: resourceName }]);
    return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName };
  }

  const update: Record<string, unknown> = {
    resourceName: adGroupCriterionPath(customerId, params.adGroupId, params.criterionId),
  };
  const mask: string[] = [];
  if (params.status) { update.status = params.status.toUpperCase(); mask.push("status"); }
  if (params.bidReais != null) { update.cpcBidMicros = toMicrosStr(params.bidReais); mask.push("cpcBidMicros"); }

  if (mask.length === 0) throw new Error("Nenhum campo para atualizar. Informe status ou bidReais.");

  const results = await mutate(customerId, "adGroupCriteria", [{ update, updateMask: mask.join(",") }]);
  return { status: "updated", resource_name: results[0]?.resourceName ?? "", fields_updated: mask };
}

export async function updateGoogleAdsAd(
  customerId: string,
  params: { adGroupId: string; adId: string; status?: string }
): Promise<GMutationResult> {
  if (!params.status) throw new Error("Informe status (ENABLED, PAUSED ou REMOVED).");

  if (params.status.toUpperCase() === "REMOVED") {
    const resourceName = adGroupAdPath(customerId, params.adGroupId, params.adId);
    const results = await mutate(customerId, "adGroupAds", [{ remove: resourceName }]);
    return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName };
  }

  const results = await mutate(customerId, "adGroupAds", [{
    update: {
      resourceName: adGroupAdPath(customerId, params.adGroupId, params.adId),
      status: params.status.toUpperCase(),
    },
    updateMask: "status",
  }]);
  return { status: "updated", resource_name: results[0]?.resourceName ?? "", fields_updated: ["status"] };
}

// ── Delete ───────────────────────────────────────────────────────────────

export async function deleteGoogleAdsKeyword(
  customerId: string,
  params: { adGroupId: string; criterionId: string }
): Promise<GMutationResult> {
  const resourceName = adGroupCriterionPath(customerId, params.adGroupId, params.criterionId);
  const results = await mutate(customerId, "adGroupCriteria", [{ remove: resourceName }]);
  return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName };
}

export async function deleteGoogleAdsNegative(
  customerId: string,
  params: { level: "campaign" | "ad_group"; parentId: string; criterionId: string }
): Promise<GMutationResult> {
  if (params.level === "ad_group") {
    const resourceName = adGroupCriterionPath(customerId, params.parentId, params.criterionId);
    const results = await mutate(customerId, "adGroupCriteria", [{ remove: resourceName }]);
    return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName, level: "ad_group" };
  }

  const resourceName = campaignCriterionPath(customerId, params.parentId, params.criterionId);
  const results = await mutate(customerId, "campaignCriteria", [{ remove: resourceName }]);
  return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName, level: "campaign" };
}

export async function deleteGoogleAdsAd(
  customerId: string,
  params: { adGroupId: string; adId: string }
): Promise<GMutationResult> {
  const resourceName = adGroupAdPath(customerId, params.adGroupId, params.adId);
  const results = await mutate(customerId, "adGroupAds", [{ remove: resourceName }]);
  return { status: "removed", resource_name: results[0]?.resourceName ?? resourceName };
}
