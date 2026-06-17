import type { MetaActionMetric } from "./meta-api.js";

export interface ActionSummary {
  raw: Record<string, number>;
  normalized: Record<string, number>;
}

const PREFIXES_TO_STRIP = [
  "omni_",
  "onsite_web_app_",
  "onsite_web_",
  "onsite_app_",
  "web_app_in_store_",
  "offsite_conversion.fb_pixel_",
];

const ACTION_ALIASES: Record<string, string> = {
  onsite_web_lead: "lead",
  onsite_conversion_lead_grouped: "lead",
  leadgen_grouped: "lead",
  onsite_conversion_messaging_conversation_started_7d:
    "messaging_conversation_started",
  onsite_conversion_total_messaging_connection: "messaging_conversation_started",
  onsite_conversion_messaging_first_reply: "messaging_first_reply",
  post_engagement: "engagement",
  page_engagement: "engagement",
};

export function toNumber(value: unknown): number {
  if (value == null) return 0;
  return parseFloat(String(value).replace(",", ".")) || 0;
}

export function normalizeActionType(actionType: string): string {
  let normalized = actionType.trim();
  for (const prefix of PREFIXES_TO_STRIP) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  normalized = normalized.replace(/\./g, "_");
  return ACTION_ALIASES[normalized] ?? normalized;
}

export function summarizeActionMetrics(
  metrics?: MetaActionMetric[]
): ActionSummary {
  const raw: Record<string, number> = {};
  const normalized: Record<string, number> = {};

  for (const metric of metrics ?? []) {
    const actionType = metric.action_type;
    const value = toNumber(metric.value);
    raw[actionType] = (raw[actionType] ?? 0) + value;

    const canonical = normalizeActionType(actionType);
    normalized[canonical] = (normalized[canonical] ?? 0) + value;
  }

  return { raw, normalized };
}

export function mergeActionSummary(
  target: ActionSummary,
  source: ActionSummary
): void {
  for (const [key, value] of Object.entries(source.raw)) {
    target.raw[key] = (target.raw[key] ?? 0) + value;
  }
  for (const [key, value] of Object.entries(source.normalized)) {
    target.normalized[key] = (target.normalized[key] ?? 0) + value;
  }
}

export function pickActionValue(
  summary: ActionSummary,
  actionType: string
): number {
  return (
    summary.raw[actionType] ??
    summary.normalized[normalizeActionType(actionType)] ??
    0
  );
}
