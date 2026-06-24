const META_API_BASE = "https://graph.facebook.com/v21.0";

/** Garante o prefixo act_ no ID da conta. */
function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

export const INSIGHTS_FIELDS =
  [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "clicks",
    "inline_link_clicks",
    "cpc",
    "cpm",
    "cpp",
    "ctr",
    "objective",
    "reach",
    "frequency",
    "actions",
    "cost_per_action_type",
    "action_values",
    "conversions",
    "cost_per_conversion",
    "purchase_roas",
    "video_thruplay_watched_actions",
    "video_avg_time_watched_actions",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p100_watched_actions",
    "quality_ranking",
    "engagement_rate_ranking",
    "conversion_rate_ranking",
  ].join(",");

export interface MetaApiConfig {
  accessToken: string;
  /** Conta padrão usada quando uma chamada não especifica account_id. */
  adAccountId?: string;
  /** Lista de contas permitidas (ids). Se vazia, todas são permitidas. */
  allowlist?: string[];
}

/** Códigos de erro da Meta considerados transitórios (vale repetir). */
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004]);
const MAX_RETRIES = 3;
const MAX_PAGES = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AdAccount {
  id: string;
  account_id?: string;
  name: string;
  account_status?: number;
  currency?: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
}

export interface AdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  targeting?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
}

export interface Ad {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  campaign_id: string;
  creative?: { id: string };
  created_time?: string;
  updated_time?: string;
}

export interface MetaActionMetric {
  action_type: string;
  value: string;
}

export interface Insight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend: string;
  impressions: string;
  clicks: string;
  inline_link_clicks?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;
  ctr?: string;
  objective?: string;
  reach?: string;
  frequency?: string;
  /** Preenchido quando a chamada usa breakdowns: ["gender"] */
  gender?: string;
  /** Preenchido quando a chamada usa breakdowns: ["age"] */
  age?: string;
  actions?: MetaActionMetric[];
  cost_per_action_type?: MetaActionMetric[];
  action_values?: MetaActionMetric[];
  conversions?: MetaActionMetric[];
  cost_per_conversion?: MetaActionMetric[];
  purchase_roas?: MetaActionMetric[];
  video_thruplay_watched_actions?: MetaActionMetric[];
  video_avg_time_watched_actions?: MetaActionMetric[];
  video_p25_watched_actions?: MetaActionMetric[];
  video_p50_watched_actions?: MetaActionMetric[];
  video_p75_watched_actions?: MetaActionMetric[];
  video_p100_watched_actions?: MetaActionMetric[];
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  date_start: string;
  date_stop: string;
}

export interface Pixel {
  id: string;
  name?: string;
  code?: string;
  creation_time?: string;
  last_fired_time?: string | number;
  is_created_by_business?: boolean;
  is_unavailable?: boolean;
  can_proxy?: boolean;
  owner_business?: unknown;
  automatic_matching_fields?: string[];
  enable_automatic_matching?: boolean;
  data_use_setting?: string;
  first_party_cookie_status?: string;
}

export interface PixelEventSummary {
  event: string;
  count: number;
}

export interface PixelDiagnostics {
  pixel_id?: string;
  name?: string;
  health: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  last_fired_time?: string | number;
  last_fired_hours_ago: number | null;
  is_unavailable?: boolean;
  can_proxy?: boolean;
  automatic_matching_enabled?: boolean;
  automatic_matching_fields?: string[];
  first_party_cookie_status?: string;
  data_use_setting?: string;
  events_last_7d: Record<string, number>;
  issues: string[];
}

export interface InsightsOptions {
  level: "account" | "campaign" | "adset" | "ad";
  entityId?: string;
  /** Conta a consultar (override). Se omitido, usa a conta padrão. */
  accountId?: string;
  // Período único
  since?: string;
  until?: string;
  // Comparação: período principal + período de comparação
  compareSince?: string;
  compareUntil?: string;
  // Período pré-definido (alternativa a since/until)
  datePreset?: string;
  breakdown?: string;
  breakdowns?: string[];
  actionBreakdowns?: string[];
  actionReportTime?: "impression" | "conversion" | "mixed";
  actionAttributionWindows?: string[];
  useAccountAttribution?: boolean;
  useUnifiedAttribution?: boolean;
  filtering?: Array<Record<string, unknown>>;
  sort?: string;
  defaultSummary?: boolean;
  fields?: string[];
  limit?: number;
  /** Quebra os resultados por dia (1) quando definido. Útil para gráficos. */
  timeIncrement?: number;
}

export interface ComparisonResult {
  period: Insight[];
  comparison: Insight[];
}

export interface PixelStatsOptions {
  start?: string;
  end?: string;
  aggregation?: string;
  event?: string;
}

const PIXEL_FIELDS = [
  "id",
  "name",
  "code",
  "creation_time",
  "last_fired_time",
  "is_created_by_business",
  "is_unavailable",
  "can_proxy",
  "owner_business",
  "automatic_matching_fields",
  "enable_automatic_matching",
  "data_use_setting",
  "first_party_cookie_status",
].join(",");

export class MetaAdsClient {
  private accessToken: string;
  private defaultAccountId?: string;
  private allowlist: Set<string>;

  constructor(config: MetaApiConfig) {
    this.accessToken = config.accessToken;
    this.defaultAccountId = config.adAccountId
      ? normalizeAccountId(config.adAccountId)
      : undefined;
    this.allowlist = new Set(
      (config.allowlist ?? []).map((id) => normalizeAccountId(id.trim()))
    );
  }

  /** Resolve a conta a usar: override da chamada ou padrão do servidor. */
  private resolveAccount(accountId?: string): string {
    const id = accountId ?? this.defaultAccountId;
    if (!id) {
      throw new Error(
        "Nenhuma conta especificada. Passe account_id ou configure META_AD_ACCOUNT_ID."
      );
    }
    const normalized = normalizeAccountId(id);
    if (this.allowlist.size > 0 && !this.allowlist.has(normalized)) {
      throw new Error(
        `Conta ${normalized} não está na allow-list (META_ACCOUNT_ALLOWLIST).`
      );
    }
    return normalized;
  }

  /** GET com retry/backoff em erros transitórios e rate limit. */
  private async fetchJson<T>(url: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(url);
      } catch (e) {
        // Erro de rede — vale repetir
        lastError = e instanceof Error ? e : new Error(String(e));
        await sleep(500 * 2 ** attempt);
        continue;
      }

      const data = (await response.json()) as {
        error?: { message: string; code: number };
      } & T;
      const err = (data as { error?: { message: string; code: number } }).error;

      if (response.ok && !err) return data;

      const code = err?.code ?? 0;
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        RETRYABLE_META_CODES.has(code);

      lastError = new Error(err?.message ?? `HTTP ${response.status}`);
      if (!retryable || attempt === MAX_RETRIES) throw lastError;

      await sleep(500 * 2 ** attempt); // backoff: 0,5s → 1s → 2s
    }

    throw lastError ?? new Error("Falha desconhecida na requisição");
  }

  private buildUrl(endpoint: string, params: Record<string, string>): string {
    const url = new URL(`${META_API_BASE}/${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    return this.fetchJson<T>(this.buildUrl(endpoint, params));
  }

  /** Igual a request, mas segue paging.next e concatena todas as páginas. */
  private async requestPaged<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T[]> {
    let url: string | undefined = this.buildUrl(endpoint, params);
    const out: T[] = [];
    let pages = 0;

    while (url && pages < MAX_PAGES) {
      const page: { data: T[]; paging?: { next?: string } } =
        await this.fetchJson(url);
      out.push(...(page.data ?? []));
      url = page.paging?.next;
      pages++;
    }
    return out;
  }

  private normalizeInsightOptions(options: InsightsOptions): Record<string, string> {
    const {
      level,
      since,
      until,
      datePreset,
      breakdown,
      breakdowns,
      actionBreakdowns,
      actionReportTime,
      actionAttributionWindows,
      useAccountAttribution,
      useUnifiedAttribution,
      filtering,
      sort,
      defaultSummary,
      fields,
      timeIncrement,
      limit = 3000,
    } = options;

    const params: Record<string, string> = {
      fields: fields?.length ? fields.join(",") : INSIGHTS_FIELDS,
      level,
      limit: String(limit),
    };

    if (datePreset) {
      params["date_preset"] = datePreset;
    } else if (since && until) {
      params["time_range"] = JSON.stringify({ since, until });
    } else {
      params["date_preset"] = "last_30d";
    }

    const breakdownList = breakdowns?.length ? breakdowns : breakdown ? [breakdown] : [];
    if (breakdownList.length) params["breakdowns"] = breakdownList.join(",");
    if (actionBreakdowns?.length) {
      params["action_breakdowns"] = actionBreakdowns.join(",");
    }
    if (actionReportTime) params["action_report_time"] = actionReportTime;
    if (actionAttributionWindows?.length) {
      params["action_attribution_windows"] = actionAttributionWindows.join(",");
    }
    if (useAccountAttribution) params["use_account_attribution_setting"] = "true";
    if (useUnifiedAttribution) params["use_unified_attribution_setting"] = "true";
    if (filtering?.length) params["filtering"] = JSON.stringify(filtering);
    if (sort) params["sort"] = sort;
    if (defaultSummary) params["default_summary"] = "true";
    if (timeIncrement) params["time_increment"] = String(timeIncrement);

    return params;
  }

  private parsePixelTime(value?: string): number | undefined {
    if (!value) return undefined;
    if (/^\d+$/.test(value)) return Number(value);
    const ms = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
  }

  private hoursSince(value?: string | number): number | null {
    if (!value) return null;
    const timestamp =
      typeof value === "number" || /^\d+$/.test(String(value))
        ? Number(value)
        : Math.floor(Date.parse(String(value).replace("Z", "+00:00")) / 1000);
    if (!Number.isFinite(timestamp)) return null;
    return Math.round(((Date.now() / 1000 - timestamp) / 3600) * 10) / 10;
  }

  private aggregatePixelEvents(rows: Array<Record<string, unknown>>): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const row of rows) {
      const data = row["data"];
      if (Array.isArray(data)) {
        for (const item of data) {
          if (!item || typeof item !== "object") continue;
          const obj = item as Record<string, unknown>;
          const event = String(obj["value"] ?? obj["event"] ?? "unknown");
          const count = Number(obj["count"] ?? 0) || 0;
          summary[event] = (summary[event] ?? 0) + count;
        }
        continue;
      }

      const event = String(row["aggregation"] ?? row["event"] ?? "unknown");
      const count = Number(row["count"] ?? row["value"] ?? 0) || 0;
      summary[event] = (summary[event] ?? 0) + count;
    }
    return summary;
  }

  /** Lista as contas de anúncio acessíveis pelo token. */
  async getAdAccounts(): Promise<AdAccount[]> {
    return this.requestPaged<AdAccount>("me/adaccounts", {
      fields: "id,account_id,name,account_status,currency",
      limit: "200",
    });
  }

  async getCampaigns(status?: string, accountId?: string): Promise<Campaign[]> {
    const fields =
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
    const params: Record<string, string> = { fields, limit: "200" };
    if (status) params["effective_status"] = `["${status}"]`;

    return this.requestPaged<Campaign>(
      `${this.resolveAccount(accountId)}/campaigns`,
      params
    );
  }

  async getCampaign(campaignId: string): Promise<Campaign> {
    const fields =
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
    return this.request<Campaign>(campaignId, { fields });
  }

  async getAdSets(
    campaignId?: string,
    status?: string,
    accountId?: string
  ): Promise<AdSet[]> {
    const fields =
      "id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,start_time,end_time";
    const params: Record<string, string> = { fields };
    if (status) params["effective_status"] = `["${status}"]`;

    params["limit"] = "200";
    const endpoint = campaignId
      ? `${campaignId}/adsets`
      : `${this.resolveAccount(accountId)}/adsets`;

    return this.requestPaged<AdSet>(endpoint, params);
  }

  async getAds(
    adSetId?: string,
    campaignId?: string,
    status?: string,
    accountId?: string
  ): Promise<Ad[]> {
    const fields =
      "id,name,status,adset_id,campaign_id,creative,created_time,updated_time";
    const params: Record<string, string> = { fields };
    if (status) params["effective_status"] = `["${status}"]`;

    params["limit"] = "200";
    let endpoint: string;
    if (adSetId) {
      endpoint = `${adSetId}/ads`;
    } else if (campaignId) {
      endpoint = `${campaignId}/ads`;
    } else {
      endpoint = `${this.resolveAccount(accountId)}/ads`;
    }

    return this.requestPaged<Ad>(endpoint, params);
  }

  /** URL da imagem do criativo de um anúncio (image_url preferido, senão thumbnail_url). */
  async getAdCreativeThumb(adId: string): Promise<string | null> {
    try {
      const res = await this.request<{ creative?: { thumbnail_url?: string; image_url?: string } }>(
        adId,
        { fields: "creative{thumbnail_url,image_url}" }
      );
      return res.creative?.image_url ?? res.creative?.thumbnail_url ?? null;
    } catch {
      return null;
    }
  }

  // Busca insights para um único período
  async getInsights(options: InsightsOptions): Promise<Insight[]> {
    const { level, entityId } = options;
    const params = this.normalizeInsightOptions(options);

    const endpoint =
      entityId && level !== "account"
        ? `${entityId}/insights`
        : `${this.resolveAccount(options.accountId)}/insights`;

    return this.requestPaged<Insight>(endpoint, params);
  }

  // Busca insights comparando dois períodos usando time_ranges (uma só requisição)
  async getInsightsComparison(options: InsightsOptions): Promise<ComparisonResult> {
    const {
      level,
      entityId,
      since,
      until,
      compareSince,
      compareUntil,
      limit = 3000,
    } = options;

    if (!since || !until || !compareSince || !compareUntil) {
      throw new Error(
        "Para comparação são necessários: since, until, compare_since e compare_until"
      );
    }

    const timeRanges = [
      { since, until },
      { since: compareSince, until: compareUntil },
    ];

    const params = this.normalizeInsightOptions({
      ...options,
      since: undefined,
      until: undefined,
      datePreset: undefined,
      fields: options.fields,
      limit,
    });
    params["time_increment"] = String(options.timeIncrement ?? 1);
    params["time_ranges"] = JSON.stringify(timeRanges);
    delete params["date_preset"];
    delete params["time_range"];

    const endpoint =
      entityId && level !== "account"
        ? `${entityId}/insights`
        : `${this.resolveAccount(options.accountId)}/insights`;

    const data = await this.requestPaged<Insight>(endpoint, params);

    // A API retorna os dois períodos intercalados; separamos por data
    const mainStart = since;
    const mainEnd = until;

    const period = data.filter(
      (r) => r.date_start >= mainStart && r.date_stop <= mainEnd
    );
    const comparison = data.filter(
      (r) => !(r.date_start >= mainStart && r.date_stop <= mainEnd)
    );

    return { period, comparison };
  }

  async getAdAccount(accountId?: string): Promise<Record<string, unknown>> {
    const fields =
      "id,name,account_status,currency,timezone_name,spend_cap,amount_spent,balance";
    return this.request<Record<string, unknown>>(
      this.resolveAccount(accountId),
      { fields }
    );
  }

  async listPixels(accountId?: string, fields = PIXEL_FIELDS): Promise<Pixel[]> {
    return this.requestPaged<Pixel>(`${this.resolveAccount(accountId)}/adspixels`, {
      fields,
      limit: "200",
    });
  }

  async getPixel(pixelId: string, fields = PIXEL_FIELDS): Promise<Pixel> {
    return this.request<Pixel>(pixelId, { fields });
  }

  async getPixelStats(
    pixelId: string,
    options: PixelStatsOptions = {}
  ): Promise<Array<Record<string, unknown>>> {
    const params: Record<string, string> = {
      aggregation: options.aggregation ?? "event",
    };
    const start = this.parsePixelTime(options.start);
    const end = this.parsePixelTime(options.end);
    if (start) params["start_time"] = String(start);
    if (end) params["end_time"] = String(end);
    if (options.event) params["event"] = options.event;

    return this.requestPaged<Record<string, unknown>>(`${pixelId}/stats`, params);
  }

  async getPixelEvents(
    pixelId: string,
    options: Pick<PixelStatsOptions, "start" | "end"> = {}
  ): Promise<PixelEventSummary[]> {
    const rows = await this.getPixelStats(pixelId, {
      ...options,
      aggregation: "event",
    });
    const summary = this.aggregatePixelEvents(rows);
    return Object.entries(summary)
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getPixelDiagnostics(pixelId: string): Promise<PixelDiagnostics> {
    const pixel = await this.getPixel(pixelId);
    const lastFiredHours = this.hoursSince(pixel.last_fired_time);
    const end = Math.floor(Date.now() / 1000);
    const start = end - 7 * 24 * 3600;

    let eventsLast7d: Record<string, number> = {};
    const issues: string[] = [];
    try {
      const rows = await this.getPixelStats(pixelId, {
        aggregation: "event",
        start: String(start),
        end: String(end),
      });
      eventsLast7d = this.aggregatePixelEvents(rows);
    } catch (error) {
      issues.push(
        `nao foi possivel consultar eventos dos ultimos 7 dias: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (pixel.is_unavailable) {
      issues.push("pixel marcado como indisponivel");
    }
    if (!pixel.last_fired_time) {
      issues.push("pixel nunca disparou evento ou nao retornou last_fired_time");
    } else if (lastFiredHours != null && lastFiredHours > 24) {
      issues.push(`ultimo evento ha ${lastFiredHours}h`);
    }
    if (!Object.keys(eventsLast7d).length) {
      issues.push("nenhum evento agregado retornado nos ultimos 7 dias");
    }
    if (pixel.enable_automatic_matching === false) {
      issues.push("automatic matching desabilitado");
    }

    const health =
      issues.length === 0 ? "HEALTHY" : issues.length <= 2 ? "DEGRADED" : "UNHEALTHY";

    return {
      pixel_id: pixel.id,
      name: pixel.name,
      health,
      last_fired_time: pixel.last_fired_time,
      last_fired_hours_ago: lastFiredHours,
      is_unavailable: pixel.is_unavailable,
      can_proxy: pixel.can_proxy,
      automatic_matching_enabled: pixel.enable_automatic_matching,
      automatic_matching_fields: pixel.automatic_matching_fields,
      first_party_cookie_status: pixel.first_party_cookie_status,
      data_use_setting: pixel.data_use_setting,
      events_last_7d: Object.fromEntries(
        Object.entries(eventsLast7d).sort((a, b) => b[1] - a[1])
      ),
      issues,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ESCRITA — create / update / delete / duplicate
  // ───────────────────────────────────────────────────────────────────────────

  /** POST/DELETE com retry/backoff (mesma política de erros do fetchJson). */
  private async sendWrite<T>(
    endpoint: string,
    body: Record<string, unknown>,
    method: "POST" | "DELETE" = "POST"
  ): Promise<T> {
    const url = `${META_API_BASE}/${endpoint}`;
    const payload: Record<string, unknown> = { ...body, access_token: this.accessToken };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        await sleep(500 * 2 ** attempt);
        continue;
      }

      const data = (await response.json()) as {
        error?: { message: string; code: number; error_user_msg?: string };
      } & T;
      const err = (data as {
        error?: { message: string; code: number; error_user_msg?: string };
      }).error;

      if (response.ok && !err) return data;

      const code = err?.code ?? 0;
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        RETRYABLE_META_CODES.has(code);

      lastError = new Error(err?.error_user_msg ?? err?.message ?? `HTTP ${response.status}`);
      if (!retryable || attempt === MAX_RETRIES) throw lastError;

      await sleep(500 * 2 ** attempt);
    }

    throw lastError ?? new Error("Falha desconhecida na requisição de escrita");
  }

  /** Corrige pegadinhas conhecidas no targeting antes de enviar. */
  private normalizeTargeting(t: Record<string, unknown>): Record<string, unknown> {
    const targeting = { ...t };
    const ig = targeting["instagram_positions"];
    // explore_home exige que 'explore' também esteja na lista (erro 2490392).
    if (Array.isArray(ig) && ig.includes("explore_home") && !ig.includes("explore")) {
      targeting["instagram_positions"] = [...ig, "explore"];
    }
    return targeting;
  }

  /**
   * Descobre páginas e contas de Instagram vinculadas à conta de anúncio.
   * Tenta os edges oficiais (promote_pages / instagram_accounts); se vierem
   * vazios (token sem pages_show_list), deriva page_id/instagram_user_id dos
   * criativos existentes — fonte confiável para reusar nos novos criativos.
   */
  async getAccountAssets(accountId?: string): Promise<{
    account_id: string;
    pages: unknown[];
    instagram_accounts: unknown[];
    derived_from_creatives?: { page_ids: string[]; instagram_user_ids: string[] };
  }> {
    const acct = this.resolveAccount(accountId);
    let pages: unknown[] = [];
    let instagram: unknown[] = [];
    try {
      pages = await this.requestPaged(`${acct}/promote_pages`, { fields: "id,name", limit: "100" });
    } catch {
      /* sem permissão de páginas */
    }
    try {
      instagram = await this.requestPaged(`${acct}/instagram_accounts`, {
        fields: "id,username",
        limit: "100",
      });
    } catch {
      /* sem permissão de Instagram */
    }

    if (pages.length && instagram.length) {
      return { account_id: acct, pages, instagram_accounts: instagram };
    }

    // Fallback: varre criativos recentes e coleta page_id / instagram_user_id distintos.
    const pageIds = new Set<string>();
    const igIds = new Set<string>();
    try {
      const creatives = await this.requestPaged<{
        instagram_user_id?: string;
        object_story_spec?: { page_id?: string };
      }>(`${acct}/adcreatives`, {
        fields: "instagram_user_id,object_story_spec{page_id}",
        limit: "100",
      });
      for (const c of creatives) {
        if (c.instagram_user_id) igIds.add(c.instagram_user_id);
        const pid = c.object_story_spec?.page_id;
        if (pid) pageIds.add(pid);
      }
    } catch {
      /* sem criativos acessíveis */
    }

    return {
      account_id: acct,
      pages,
      instagram_accounts: instagram,
      derived_from_creatives: {
        page_ids: [...pageIds],
        instagram_user_ids: [...igIds],
      },
    };
  }

  async createCampaign(p: {
    name: string;
    objective: string;
    accountId?: string;
    status?: string;
    specialAdCategories?: string[];
    buyingType?: string;
    dailyBudget?: number;
    lifetimeBudget?: number;
    bidStrategy?: string;
  }): Promise<{ id: string }> {
    const acct = this.resolveAccount(p.accountId);
    const body: Record<string, unknown> = {
      name: p.name,
      objective: p.objective,
      status: p.status ?? "PAUSED",
      special_ad_categories: p.specialAdCategories ?? [],
    };
    if (p.buyingType) body["buying_type"] = p.buyingType;

    const hasCbo = p.dailyBudget != null || p.lifetimeBudget != null;
    if (p.dailyBudget != null) body["daily_budget"] = p.dailyBudget;
    if (p.lifetimeBudget != null) body["lifetime_budget"] = p.lifetimeBudget;
    if (hasCbo) body["bid_strategy"] = p.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP";

    // Regra aprendida: OUTCOME_LEADS sem CBO (orçamento por conjunto) exige o flag.
    if (p.objective === "OUTCOME_LEADS" && !hasCbo) {
      body["is_adset_budget_sharing_enabled"] = false;
    }

    return this.sendWrite<{ id: string }>(`${acct}/campaigns`, body);
  }

  async createAdSet(p: {
    accountId?: string;
    name: string;
    campaignId: string;
    optimizationGoal: string;
    billingEvent?: string;
    bidStrategy?: string;
    dailyBudget?: number;
    lifetimeBudget?: number;
    bidAmount?: number;
    targeting: Record<string, unknown>;
    promotedObject?: Record<string, unknown>;
    destinationType?: string;
    attributionSpec?: unknown[];
    budgetSchedules?: unknown[];
    startTime?: string;
    endTime?: string;
    status?: string;
  }): Promise<{ id: string }> {
    const acct = this.resolveAccount(p.accountId);
    const body: Record<string, unknown> = {
      name: p.name,
      campaign_id: p.campaignId,
      optimization_goal: p.optimizationGoal,
      billing_event: p.billingEvent ?? "IMPRESSIONS",
      // Regra aprendida: bid_strategy deve ser explícito (erro 2490487).
      bid_strategy: p.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP",
      targeting: this.normalizeTargeting(p.targeting),
      status: p.status ?? "PAUSED",
    };
    if (p.dailyBudget != null) body["daily_budget"] = p.dailyBudget;
    if (p.lifetimeBudget != null) body["lifetime_budget"] = p.lifetimeBudget;
    if (p.bidAmount != null) body["bid_amount"] = p.bidAmount;
    if (p.promotedObject) body["promoted_object"] = p.promotedObject;
    if (p.destinationType) body["destination_type"] = p.destinationType;
    if (p.attributionSpec) body["attribution_spec"] = p.attributionSpec;
    if (p.budgetSchedules) body["budget_schedules"] = p.budgetSchedules;
    if (p.startTime) body["start_time"] = p.startTime;
    if (p.endTime) body["end_time"] = p.endTime;

    return this.sendWrite<{ id: string }>(`${acct}/adsets`, body);
  }

  async createAdCreative(p: {
    accountId?: string;
    name: string;
    objectStorySpec?: Record<string, unknown>;
    assetFeedSpec?: Record<string, unknown>;
    instagramUserId?: string;
    urlTags?: string;
    degreesOfFreedomSpec?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const acct = this.resolveAccount(p.accountId);
    const body: Record<string, unknown> = { name: p.name };
    if (p.objectStorySpec) body["object_story_spec"] = p.objectStorySpec;
    if (p.assetFeedSpec) body["asset_feed_spec"] = p.assetFeedSpec;
    if (p.instagramUserId) body["instagram_user_id"] = p.instagramUserId;
    if (p.urlTags) body["url_tags"] = p.urlTags;
    if (p.degreesOfFreedomSpec) body["degrees_of_freedom_spec"] = p.degreesOfFreedomSpec;
    return this.sendWrite<{ id: string }>(`${acct}/adcreatives`, body);
  }

  async createAd(p: {
    accountId?: string;
    name: string;
    adsetId: string;
    creativeId: string;
    status?: string;
    conversionDomain?: string;
    degreesOfFreedomSpec?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const acct = this.resolveAccount(p.accountId);
    const body: Record<string, unknown> = {
      name: p.name,
      adset_id: p.adsetId,
      creative: { creative_id: p.creativeId },
      status: p.status ?? "PAUSED",
    };
    if (p.conversionDomain) body["conversion_domain"] = p.conversionDomain;
    if (p.degreesOfFreedomSpec) body["degrees_of_freedom_spec"] = p.degreesOfFreedomSpec;
    return this.sendWrite<{ id: string }>(`${acct}/ads`, body);
  }

  /** Atualização genérica de campos (campanha, conjunto ou anúncio). */
  async updateObject(
    id: string,
    fields: Record<string, unknown>
  ): Promise<{ success?: boolean; id?: string }> {
    const body = { ...fields };
    if (body["targeting"] && typeof body["targeting"] === "object") {
      body["targeting"] = this.normalizeTargeting(
        body["targeting"] as Record<string, unknown>
      );
    }
    return this.sendWrite<{ success?: boolean; id?: string }>(id, body);
  }

  async deleteObject(id: string): Promise<{ success?: boolean }> {
    return this.sendWrite<{ success?: boolean }>(id, {}, "DELETE");
  }

  /** Duplica campanha/conjunto/anúncio via endpoint /copies. */
  async duplicateObject(
    id: string,
    kind: "campaign" | "adset" | "ad",
    opts?: { deepCopy?: boolean; statusOption?: string }
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      status_option: opts?.statusOption ?? "PAUSED",
    };
    if (kind === "campaign") body["deep_copy"] = opts?.deepCopy ?? false;
    return this.sendWrite<unknown>(`${id}/copies`, body);
  }

  /**
   * Troca os url_tags de um anúncio recriando o criativo (criativos são imutáveis).
   * Reusa object_story_id quando o criativo vem de post orgânico, senão object_story_spec.
   */
  async swapUrlTags(
    adId: string,
    urlTags: string,
    accountId?: string
  ): Promise<{ old_creative?: string; new_creative: string; ad_id: string }> {
    const acct = this.resolveAccount(accountId);
    const ad = await this.request<{ creative?: { id: string } }>(adId, {
      fields: "creative{id}",
    });
    const oldId = ad.creative?.id;
    if (!oldId) throw new Error("Anúncio sem criativo para copiar.");

    const creative = await this.request<{
      name?: string;
      object_story_id?: string;
      object_story_spec?: Record<string, unknown>;
      instagram_user_id?: string;
    }>(oldId, {
      fields: "name,object_story_id,object_story_spec,instagram_user_id",
    });

    const body: Record<string, unknown> = {
      name: `${creative.name ?? "creative"} [utm]`,
      url_tags: urlTags,
    };
    if (creative.object_story_id) body["object_story_id"] = creative.object_story_id;
    else if (creative.object_story_spec) body["object_story_spec"] = creative.object_story_spec;
    else throw new Error("Criativo sem object_story_id nem object_story_spec — não dá para recriar.");
    if (creative.instagram_user_id) body["instagram_user_id"] = creative.instagram_user_id;

    const created = await this.sendWrite<{ id: string }>(`${acct}/adcreatives`, body);
    await this.sendWrite(adId, { creative: { creative_id: created.id } });
    return { old_creative: oldId, new_creative: created.id, ad_id: adId };
  }

  /** Cria um período de aumento de orçamento (high demand period) num conjunto. */
  async createBudgetSchedule(
    adsetId: string,
    p: {
      timeStart: number;
      timeEnd: number;
      budgetValue: number;
      budgetValueType?: string;
      recurrenceType?: string;
    }
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      time_start: p.timeStart,
      time_end: p.timeEnd,
      budget_value: p.budgetValue,
      budget_value_type: p.budgetValueType ?? "ABSOLUTE",
    };
    if (p.recurrenceType) body["recurrence_type"] = p.recurrenceType;
    return this.sendWrite<unknown>(`${adsetId}/budget_schedules`, body);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TARGETING — busca e estimativa (GET)
  // ───────────────────────────────────────────────────────────────────────────

  async searchInterests(q: string, limit = 25): Promise<unknown[]> {
    return this.requestPaged<unknown>("search", {
      type: "adinterest",
      q,
      limit: String(limit),
    });
  }

  async searchGeolocations(
    q: string,
    types?: string[],
    limit = 25
  ): Promise<unknown[]> {
    const params: Record<string, string> = {
      type: "adgeolocation",
      q,
      limit: String(limit),
    };
    if (types?.length) params["location_types"] = JSON.stringify(types);
    return this.requestPaged<unknown>("search", params);
  }

  async searchBehaviors(limit = 100): Promise<unknown[]> {
    return this.requestPaged<unknown>("search", {
      type: "adTargetingCategory",
      class: "behaviors",
      limit: String(limit),
    });
  }

  async getDeliveryEstimate(p: {
    accountId?: string;
    targeting: Record<string, unknown>;
    optimizationGoal: string;
  }): Promise<unknown> {
    const acct = this.resolveAccount(p.accountId);
    return this.request<unknown>(`${acct}/delivery_estimate`, {
      optimization_goal: p.optimizationGoal,
      targeting_spec: JSON.stringify(this.normalizeTargeting(p.targeting)),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MÍDIA — listar e enviar vídeos/imagens
  // ───────────────────────────────────────────────────────────────────────────

  async listVideos(accountId?: string, limit = 50): Promise<unknown[]> {
    return this.requestPaged<unknown>(`${this.resolveAccount(accountId)}/advideos`, {
      fields: "id,title,created_time,length",
      limit: String(limit),
    });
  }

  async listImages(accountId?: string, limit = 50): Promise<unknown[]> {
    return this.requestPaged<unknown>(`${this.resolveAccount(accountId)}/adimages`, {
      fields: "hash,name,url,width,height,created_time",
      limit: String(limit),
    });
  }

  /** Envia um vídeo a partir de uma URL (a Meta baixa o arquivo server-side). */
  async createVideo(p: {
    accountId?: string;
    fileUrl: string;
    name?: string;
    title?: string;
    description?: string;
  }): Promise<{ id: string }> {
    const acct = this.resolveAccount(p.accountId);
    const body: Record<string, unknown> = { file_url: p.fileUrl };
    if (p.name) body["name"] = p.name;
    if (p.title) body["title"] = p.title;
    if (p.description) body["description"] = p.description;
    return this.sendWrite<{ id: string }>(`${acct}/advideos`, body);
  }

  /** Envia uma imagem a partir de uma URL (baixa os bytes e faz multipart). */
  async createImage(p: {
    accountId?: string;
    url: string;
    name?: string;
  }): Promise<unknown> {
    const acct = this.resolveAccount(p.accountId);
    const res = await fetch(p.url);
    if (!res.ok) throw new Error(`Falha ao baixar imagem: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";

    const form = new FormData();
    form.append("access_token", this.accessToken);
    if (p.name) form.append("name", p.name);
    form.append("filename", new Blob([buf], { type: ct }), `upload.${ext}`);

    const up = await fetch(`${META_API_BASE}/${acct}/adimages`, {
      method: "POST",
      body: form,
    });
    const data = (await up.json()) as {
      error?: { message: string; error_user_msg?: string };
    };
    if (data.error) {
      throw new Error(data.error.error_user_msg ?? data.error.message);
    }
    return data;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PÚBLICOS — listar e criar (custom + lookalike)
  // ───────────────────────────────────────────────────────────────────────────

  async listCustomAudiences(accountId?: string, limit = 100): Promise<unknown[]> {
    return this.requestPaged<unknown>(
      `${this.resolveAccount(accountId)}/customaudiences`,
      {
        fields:
          "id,name,subtype,description,approximate_count_lower_bound,approximate_count_upper_bound,operation_status",
        limit: String(limit),
      }
    );
  }

  async createCustomAudience(p: {
    accountId?: string;
    name: string;
    subtype?: string;
    description?: string;
    customerFileSource?: string;
  }): Promise<{ id: string }> {
    const acct = this.resolveAccount(p.accountId);
    const body: Record<string, unknown> = {
      name: p.name,
      subtype: p.subtype ?? "CUSTOM",
    };
    if (p.description) body["description"] = p.description;
    if (p.customerFileSource) body["customer_file_source"] = p.customerFileSource;
    return this.sendWrite<{ id: string }>(`${acct}/customaudiences`, body);
  }

  async createLookalike(p: {
    accountId?: string;
    name: string;
    sourceAudienceId: string;
    spec: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const acct = this.resolveAccount(p.accountId);
    return this.sendWrite<{ id: string }>(`${acct}/customaudiences`, {
      name: p.name,
      subtype: "LOOKALIKE",
      origin_audience_id: p.sourceAudienceId,
      lookalike_spec: p.spec,
    });
  }

  /** Detalhes de um criativo (útil para inspecionar/reusar configurações). */
  async getCreative(id: string, fields?: string): Promise<unknown> {
    return this.request<unknown>(id, {
      fields:
        fields ??
        "id,name,object_story_spec,asset_feed_spec,call_to_action_type,url_tags,instagram_user_id,thumbnail_url,image_hash,effective_object_story_id",
    });
  }
}
