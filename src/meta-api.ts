const META_API_BASE = "https://graph.facebook.com/v21.0";

export const INSIGHTS_FIELDS =
  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,cpc,cpm,cpp,ctr,objective,reach,actions,video_thruplay_watched_actions";

export interface MetaApiConfig {
  accessToken: string;
  adAccountId: string;
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
  cpc?: string;
  cpm?: string;
  cpp?: string;
  ctr?: string;
  objective?: string;
  reach?: string;
  actions?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
}

export interface InsightsOptions {
  level: "account" | "campaign" | "adset" | "ad";
  entityId?: string;
  // Período único
  since?: string;
  until?: string;
  // Comparação: período principal + período de comparação
  compareSince?: string;
  compareUntil?: string;
  // Período pré-definido (alternativa a since/until)
  datePreset?: string;
  breakdown?: string;
  limit?: number;
}

export interface ComparisonResult {
  period: Insight[];
  comparison: Insight[];
}

export class MetaAdsClient {
  private accessToken: string;
  private adAccountId: string;

  constructor(config: MetaApiConfig) {
    this.accessToken = config.accessToken;
    this.adAccountId = config.adAccountId.startsWith("act_")
      ? config.adAccountId
      : `act_${config.adAccountId}`;
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${META_API_BASE}/${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());
    const data = (await response.json()) as {
      error?: { message: string; type: string; code: number };
    } & T;

    if (!response.ok || (data as { error?: { message: string } }).error) {
      const err = (data as { error?: { message: string } }).error;
      throw new Error(err?.message ?? `HTTP ${response.status}`);
    }

    return data;
  }

  async getCampaigns(status?: string): Promise<Campaign[]> {
    const fields =
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
    const params: Record<string, string> = { fields };
    if (status) params["effective_status"] = `["${status}"]`;

    const result = await this.request<{ data: Campaign[] }>(
      `${this.adAccountId}/campaigns`,
      params
    );
    return result.data;
  }

  async getCampaign(campaignId: string): Promise<Campaign> {
    const fields =
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
    return this.request<Campaign>(campaignId, { fields });
  }

  async getAdSets(campaignId?: string, status?: string): Promise<AdSet[]> {
    const fields =
      "id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,start_time,end_time";
    const params: Record<string, string> = { fields };
    if (status) params["effective_status"] = `["${status}"]`;

    const endpoint = campaignId
      ? `${campaignId}/adsets`
      : `${this.adAccountId}/adsets`;

    const result = await this.request<{ data: AdSet[] }>(endpoint, params);
    return result.data;
  }

  async getAds(
    adSetId?: string,
    campaignId?: string,
    status?: string
  ): Promise<Ad[]> {
    const fields =
      "id,name,status,adset_id,campaign_id,creative,created_time,updated_time";
    const params: Record<string, string> = { fields };
    if (status) params["effective_status"] = `["${status}"]`;

    let endpoint: string;
    if (adSetId) {
      endpoint = `${adSetId}/ads`;
    } else if (campaignId) {
      endpoint = `${campaignId}/ads`;
    } else {
      endpoint = `${this.adAccountId}/ads`;
    }

    const result = await this.request<{ data: Ad[] }>(endpoint, params);
    return result.data;
  }

  // Busca insights para um único período
  async getInsights(options: InsightsOptions): Promise<Insight[]> {
    const {
      level,
      entityId,
      since,
      until,
      datePreset,
      breakdown,
      limit = 3000,
    } = options;

    const params: Record<string, string> = {
      fields: INSIGHTS_FIELDS,
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

    if (breakdown) params["breakdowns"] = breakdown;

    const endpoint =
      entityId && level !== "account"
        ? `${entityId}/insights`
        : `${this.adAccountId}/insights`;

    const result = await this.request<{ data: Insight[] }>(endpoint, params);
    return result.data;
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
      breakdown,
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

    const params: Record<string, string> = {
      fields: INSIGHTS_FIELDS,
      level,
      limit: String(limit),
      time_increment: "1",
      time_ranges: JSON.stringify(timeRanges),
    };

    if (breakdown) params["breakdowns"] = breakdown;

    const endpoint =
      entityId && level !== "account"
        ? `${entityId}/insights`
        : `${this.adAccountId}/insights`;

    const result = await this.request<{ data: Insight[] }>(endpoint, params);

    // A API retorna os dois períodos intercalados; separamos por data
    const mainStart = since;
    const mainEnd = until;

    const period = result.data.filter(
      (r) => r.date_start >= mainStart && r.date_stop <= mainEnd
    );
    const comparison = result.data.filter(
      (r) => !(r.date_start >= mainStart && r.date_stop <= mainEnd)
    );

    return { period, comparison };
  }

  async getAdAccount(): Promise<Record<string, unknown>> {
    const fields =
      "id,name,account_status,currency,timezone_name,spend_cap,amount_spent,balance";
    return this.request<Record<string, unknown>>(this.adAccountId, { fields });
  }
}
