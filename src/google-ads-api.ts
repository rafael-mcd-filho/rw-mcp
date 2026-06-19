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

async function gaqlSearch<T>(customerId: string, query: string): Promise<T[]> {
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
      metrics.search_impression_share
    FROM campaign
    WHERE ${where}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

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
