const META_API_BASE = "https://graph.facebook.com/v21.0";

/** Garante o prefixo act_ no ID da conta. */
function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

export const INSIGHTS_FIELDS =
  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,cpc,cpm,cpp,ctr,objective,reach,actions,video_thruplay_watched_actions";

export interface MetaApiConfig {
  accessToken: string;
  /** Conta padrão usada quando uma chamada não especifica account_id. */
  adAccountId?: string;
}

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
  limit?: number;
}

export interface ComparisonResult {
  period: Insight[];
  comparison: Insight[];
}

export class MetaAdsClient {
  private accessToken: string;
  private defaultAccountId?: string;

  constructor(config: MetaApiConfig) {
    this.accessToken = config.accessToken;
    this.defaultAccountId = config.adAccountId
      ? normalizeAccountId(config.adAccountId)
      : undefined;
  }

  /** Resolve a conta a usar: override da chamada ou padrão do servidor. */
  private resolveAccount(accountId?: string): string {
    const id = accountId ?? this.defaultAccountId;
    if (!id) {
      throw new Error(
        "Nenhuma conta especificada. Passe account_id ou configure META_AD_ACCOUNT_ID."
      );
    }
    return normalizeAccountId(id);
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

  /** Lista as contas de anúncio acessíveis pelo token. */
  async getAdAccounts(): Promise<AdAccount[]> {
    const result = await this.request<{ data: AdAccount[] }>("me/adaccounts", {
      fields: "id,account_id,name,account_status,currency",
      limit: "200",
    });
    return result.data;
  }

  async getCampaigns(status?: string, accountId?: string): Promise<Campaign[]> {
    const fields =
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
    const params: Record<string, string> = { fields };
    if (status) params["effective_status"] = `["${status}"]`;

    const result = await this.request<{ data: Campaign[] }>(
      `${this.resolveAccount(accountId)}/campaigns`,
      params
    );
    return result.data;
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

    const endpoint = campaignId
      ? `${campaignId}/adsets`
      : `${this.resolveAccount(accountId)}/adsets`;

    const result = await this.request<{ data: AdSet[] }>(endpoint, params);
    return result.data;
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

    let endpoint: string;
    if (adSetId) {
      endpoint = `${adSetId}/ads`;
    } else if (campaignId) {
      endpoint = `${campaignId}/ads`;
    } else {
      endpoint = `${this.resolveAccount(accountId)}/ads`;
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
        : `${this.resolveAccount(options.accountId)}/insights`;

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
        : `${this.resolveAccount(options.accountId)}/insights`;

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

  async getAdAccount(accountId?: string): Promise<Record<string, unknown>> {
    const fields =
      "id,name,account_status,currency,timezone_name,spend_cap,amount_spent,balance";
    return this.request<Record<string, unknown>>(
      this.resolveAccount(accountId),
      { fields }
    );
  }
}
