// Detecção automática do objetivo da campanha e mapeamento para o
// action_type que conta como "conversão", além do template de exibição.
//
// Sinal primário: prefixo entre colchetes no nome da campanha ([MSG], [PERFIL]...).
// Sinal secundário (fallback): o campo `objective` que a Meta devolve.
//
// Observação importante (validada com dados reais desta conta): campanhas de
// "VENDAS" aqui NÃO têm evento de compra via pixel — elas geram conversas no
// WhatsApp. Por isso o fallback de `sales` inclui o action_type de mensagens.

export type ObjectiveCategory =
  | "messages"
  | "leads"
  | "sales"
  | "profile"
  | "engagement"
  | "awareness";

export interface CategoryConfig {
  category: ObjectiveCategory;
  emoji: string;
  title: string;
  /** Rótulo da métrica principal (ex.: "Mensagens", "Leads", "Visitas"). */
  headlineLabel: string;
  /** Rótulo do custo principal (ex.: "CPA (custo por conversa)"). */
  costLabel: string;
  /** Ordem de preferência do action_type que conta como conversão. */
  actionPriority: string[];
  /** Se a métrica principal é uma conversão (actions) ou o alcance (reach). */
  primaryMetric: "conversion" | "reach";
}

const CONFIGS: Record<ObjectiveCategory, CategoryConfig> = {
  messages: {
    category: "messages",
    emoji: "💬",
    title: "Campanha de Mensagens (WhatsApp)",
    headlineLabel: "Conversas iniciadas",
    costLabel: "CPA (custo por conversa)",
    actionPriority: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection",
      "onsite_conversion.messaging_first_reply",
    ],
    primaryMetric: "conversion",
  },
  leads: {
    category: "leads",
    emoji: "📨",
    title: "Campanha de Leads",
    headlineLabel: "Leads",
    costLabel: "CPA (custo por lead)",
    actionPriority: [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
      "leadgen_grouped",
    ],
    primaryMetric: "conversion",
  },
  sales: {
    category: "sales",
    emoji: "🛒",
    title: "Campanha de Vendas",
    headlineLabel: "Conversões",
    costLabel: "CPA (custo por conversão)",
    actionPriority: [
      "offsite_conversion.fb_pixel_purchase",
      "purchase",
      "omni_purchase",
      "onsite_web_purchase",
      // Esta conta não usa pixel de compra — vendas acontecem via WhatsApp:
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection",
    ],
    primaryMetric: "conversion",
  },
  profile: {
    category: "profile",
    emoji: "📌",
    title: "Campanha de Visitas / Tráfego",
    headlineLabel: "Visitas (cliques no link)",
    costLabel: "Custo por visita",
    actionPriority: ["link_click", "landing_page_view"],
    primaryMetric: "conversion",
  },
  engagement: {
    category: "engagement",
    emoji: "📣",
    title: "Campanha de Engajamento",
    headlineLabel: "Engajamentos",
    costLabel: "Custo por engajamento",
    actionPriority: ["post_engagement", "page_engagement"],
    primaryMetric: "conversion",
  },
  awareness: {
    category: "awareness",
    emoji: "📢",
    title: "Campanha de Reconhecimento",
    headlineLabel: "Alcance",
    costLabel: "CPR (custo por pessoa alcançada)",
    actionPriority: [],
    primaryMetric: "reach",
  },
};

/** Remove acentos e normaliza para comparação. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** Extrai o primeiro token entre colchetes do nome da campanha. */
function extractPrefix(name: string): string | null {
  const match = name.match(/\[([^\]]+)\]/);
  return match ? normalize(match[1]) : null;
}

function fromPrefix(prefix: string): ObjectiveCategory | null {
  if (/(MSG|MENSAG|WHATS|WPP)/.test(prefix)) return "messages";
  if (/LEAD/.test(prefix)) return "leads";
  if (/(VENDA|SALE)/.test(prefix)) return "sales";
  if (/(PERFIL|VISITA|TRAFEGO|TRAFFIC)/.test(prefix)) return "profile";
  if (/(RECONHEC|ALCANCE|AWARENESS|\bREC\b)/.test(prefix)) return "awareness";
  if (/(ENGAJ|ENGAGE|\bENG\b)/.test(prefix)) return "engagement";
  return null;
}

function fromMetaObjective(objective: string): ObjectiveCategory {
  const o = normalize(objective);
  if (/(SALES|CONVERSION|PURCHASE|CATALOG)/.test(o)) return "sales";
  if (/(LEAD)/.test(o)) return "leads";
  if (/(AWARENESS|REACH)/.test(o)) return "awareness";
  if (/(TRAFFIC|LINK_CLICK)/.test(o)) return "profile";
  if (/(MESSAGE|CONVERSATION)/.test(o)) return "messages";
  // OUTCOME_ENGAGEMENT, POST_ENGAGEMENT, etc.
  return "engagement";
}

/**
 * Detecta a categoria da campanha combinando o prefixo do nome (sinal primário,
 * mais confiável) e o campo objective da Meta (fallback).
 */
export function detectCategory(
  name: string,
  metaObjective?: string
): CategoryConfig {
  const prefix = extractPrefix(name);
  const byPrefix = prefix ? fromPrefix(prefix) : null;
  if (byPrefix) return CONFIGS[byPrefix];
  if (metaObjective) return CONFIGS[fromMetaObjective(metaObjective)];
  return CONFIGS.engagement;
}

export function getConfig(category: ObjectiveCategory): CategoryConfig {
  return CONFIGS[category];
}
