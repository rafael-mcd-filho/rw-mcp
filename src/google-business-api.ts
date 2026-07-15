// Cliente REST para o Google Business Profile (reviews + posts + contas/locais).
// Reaproveita o mesmo OAuth client (Web) do Google Ads, mas com refresh token
// próprio (escopo business.manage) — ver GOOGLE_BUSINESS_REFRESH_TOKEN.
//
// Reviews e Local Posts ainda vivem na API legada v4 (mybusiness.googleapis.com/v4)
// — é o único caminho oficial pra essas duas features até hoje, mesmo com o resto
// da suíte (Account Management, Business Information, Performance) já migrado.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const MYBUSINESS_V4_BASE = "https://mybusiness.googleapis.com/v4";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

export function googleBusinessConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_BUSINESS_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_BUSINESS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Credenciais do Google Business Profile ausentes. Configure GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e GOOGLE_BUSINESS_REFRESH_TOKEN."
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
    throw new Error(`Google OAuth token refresh (Business Profile) falhou: ${err}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Business Profile API (${res.status}): ${err}`);
  }
  if (res.status === 204) return {} as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── Contas e locais ─────────────────────────────────────────────────────────

export interface GBAccount {
  name: string; // "accounts/{accountId}"
  accountName?: string;
  type?: string;
}

export async function listBusinessAccounts(): Promise<GBAccount[]> {
  const out: GBAccount[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${ACCOUNT_MGMT_BASE}/accounts`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await apiFetch<{ accounts?: GBAccount[]; nextPageToken?: string }>(url.toString());
    out.push(...(data.accounts ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export interface GBLocation {
  name: string; // "locations/{locationId}"
  title?: string;
  storefrontAddress?: Record<string, unknown>;
  phoneNumbers?: Record<string, unknown>;
  websiteUri?: string;
}

const LOCATION_READ_MASK = "name,title,storefrontAddress,phoneNumbers,websiteUri,metadata";

export async function listBusinessLocations(accountId: string): Promise<GBLocation[]> {
  const out: GBLocation[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${BUSINESS_INFO_BASE}/accounts/${accountId}/locations`);
    url.searchParams.set("readMask", LOCATION_READ_MASK);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await apiFetch<{ locations?: GBLocation[]; nextPageToken?: string }>(url.toString());
    out.push(...(data.locations ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

// ─── Reviews (mybusiness v4) ─────────────────────────────────────────────────

export interface GBReview {
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: string; // ONE..FIVE
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

export async function listBusinessReviews(accountId: string, locationId: string): Promise<GBReview[]> {
  const out: GBReview[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${MYBUSINESS_V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await apiFetch<{ reviews?: GBReview[]; nextPageToken?: string }>(url.toString());
    out.push(...(data.reviews ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export async function replyToBusinessReview(
  accountId: string,
  locationId: string,
  reviewId: string,
  comment: string
): Promise<{ comment?: string; updateTime?: string }> {
  return apiFetch(
    `${MYBUSINESS_V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`,
    { method: "PUT", body: JSON.stringify({ comment }) }
  );
}

export async function deleteBusinessReviewReply(
  accountId: string,
  locationId: string,
  reviewId: string
): Promise<void> {
  await apiFetch(
    `${MYBUSINESS_V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`,
    { method: "DELETE" }
  );
}

// ─── Local Posts (mybusiness v4) ─────────────────────────────────────────────

export interface GBLocalPost {
  name?: string; // "accounts/{a}/locations/{l}/localPosts/{id}"
  languageCode?: string;
  summary?: string;
  callToAction?: { actionType: string; url?: string };
  topicType?: string; // STANDARD | EVENT | OFFER (ALERT é só COVID-19, Google desativou criação de novos)
  media?: { mediaFormat: string; sourceUrl: string }[];
  state?: string;
  event?: {
    title: string;
    schedule: {
      startDate: { year: number; month: number; day: number };
      startTime?: { hours: number; minutes: number };
      endDate: { year: number; month: number; day: number };
      endTime?: { hours: number; minutes: number };
    };
  };
  offer?: {
    couponCode?: string;
    redeemOnlineUrl?: string;
    termsConditions?: string;
  };
}

export async function listBusinessLocalPosts(accountId: string, locationId: string): Promise<GBLocalPost[]> {
  const out: GBLocalPost[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${MYBUSINESS_V4_BASE}/accounts/${accountId}/locations/${locationId}/localPosts`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await apiFetch<{ localPosts?: GBLocalPost[]; nextPageToken?: string }>(url.toString());
    out.push(...(data.localPosts ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export async function createBusinessLocalPost(
  accountId: string,
  locationId: string,
  post: GBLocalPost
): Promise<GBLocalPost> {
  return apiFetch(`${MYBUSINESS_V4_BASE}/accounts/${accountId}/locations/${locationId}/localPosts`, {
    method: "POST",
    body: JSON.stringify({ languageCode: "pt-BR", topicType: "STANDARD", ...post }),
  });
}

export async function deleteBusinessLocalPost(
  accountId: string,
  locationId: string,
  postId: string
): Promise<void> {
  await apiFetch(
    `${MYBUSINESS_V4_BASE}/accounts/${accountId}/locations/${locationId}/localPosts/${postId}`,
    { method: "DELETE" }
  );
}
