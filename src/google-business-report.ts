import {
  DAILY_METRICS,
  getBusinessDailyMetrics,
  getBusinessSearchKeywords,
  listBusinessAccounts,
  listBusinessLocations,
  listBusinessReviews,
  type GBLocation,
} from "./google-business-api.js";

export interface GoogleBusinessProfileReport {
  accountId: string;
  locationId: string;
  locationName: string;
  mapsUri?: string;
  periodo: string;
  metricas: {
    visualizacoes_busca: number;
    visualizacoes_maps: number;
    visualizacoes_total: number;
    solicitacoes_rota: number;
    cliques_ligar: number;
    cliques_site: number;
    conversas: number;
  };
  avaliacoes: {
    total: number;
    nota_media: number;
    novas_no_periodo: number;
    sem_resposta: number;
    taxa_resposta: number;
  };
  termos_busca: Array<{ termo: string; impressoes: number; estimado: boolean }>;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function idFromResource(name: string): string {
  return name.split("/").pop() ?? name;
}

function ratingValue(value?: string): number {
  return ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as Record<string, number>)[value ?? ""] ?? 0;
}

async function resolveLocation(clientName: string): Promise<{ accountId: string; location: GBLocation } | null> {
  const target = normalizeName(clientName);
  const candidates: Array<{ accountId: string; location: GBLocation }> = [];
  for (const account of await listBusinessAccounts()) {
    const accountId = idFromResource(account.name);
    const locations = await listBusinessLocations(accountId);
    for (const location of locations) {
      const name = normalizeName(location.title ?? "");
      if (name === target) candidates.push({ accountId, location });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export async function buildGoogleBusinessProfileReport(
  clientName: string,
  since: string,
  until: string
): Promise<GoogleBusinessProfileReport | undefined> {
  const resolved = await resolveLocation(clientName);
  if (!resolved) return undefined;

  const locationId = idFromResource(resolved.location.name);
  const [series, reviews, keywords] = await Promise.all([
    getBusinessDailyMetrics(locationId, DAILY_METRICS, since, until).catch(() => []),
    listBusinessReviews(resolved.accountId, locationId).catch(() => []),
    getBusinessSearchKeywords(locationId, since.slice(0, 7), until.slice(0, 7)).catch(() => []),
  ]);
  const totals = new Map(
    series.map(row => [row.metric, row.points.reduce((sum, point) => sum + point.value, 0)])
  );
  const metric = (name: string) => totals.get(name) ?? 0;
  const busca =
    metric("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") +
    metric("BUSINESS_IMPRESSIONS_MOBILE_SEARCH");
  const maps =
    metric("BUSINESS_IMPRESSIONS_DESKTOP_MAPS") +
    metric("BUSINESS_IMPRESSIONS_MOBILE_MAPS");
  const ratings = reviews.map(review => ratingValue(review.starRating)).filter(value => value > 0);
  const newReviews = reviews.filter(review => {
    const date = review.createTime?.slice(0, 10);
    return Boolean(date && date >= since && date <= until);
  });
  const replied = reviews.filter(review => Boolean(review.reviewReply)).length;

  return {
    accountId: resolved.accountId,
    locationId,
    locationName: resolved.location.title ?? clientName,
    mapsUri: typeof resolved.location.metadata?.mapsUri === "string"
      ? resolved.location.metadata.mapsUri
      : undefined,
    periodo: `${since} a ${until}`,
    metricas: {
      visualizacoes_busca: busca,
      visualizacoes_maps: maps,
      visualizacoes_total: busca + maps,
      solicitacoes_rota: metric("BUSINESS_DIRECTION_REQUESTS"),
      cliques_ligar: metric("CALL_CLICKS"),
      cliques_site: metric("WEBSITE_CLICKS"),
      conversas: metric("BUSINESS_CONVERSATIONS"),
    },
    avaliacoes: {
      total: reviews.length,
      nota_media: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0,
      novas_no_periodo: newReviews.length,
      sem_resposta: reviews.length - replied,
      taxa_resposta: reviews.length ? (replied / reviews.length) * 100 : 0,
    },
    termos_busca: keywords.slice(0, 8).map(row => ({
      termo: row.keyword,
      impressoes: row.impressions,
      estimado: row.isThreshold,
    })),
  };
}
