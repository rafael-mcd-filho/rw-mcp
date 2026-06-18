// Detecção automática do objetivo da campanha e mapeamento para o
// action_type que conta como "conversão", além do template de exibição.
//
// Sinais (em ordem de confiança):
//   1. Tags no nome da campanha ([MSG], [PERFIL], [LEAD-FORM]...). O nome pode
//      ter VÁRIAS tags (ex.: "[ENGA] - [WHATS] - [RESERVAS]") — nesse caso vence
//      a tag que DEFINE a conversão (WHATS/MSG vence ENGA).
//   2. Campo `objective` que a Meta devolve (fallback).
//
// Mapeamentos validados com dados reais das contas:
//   - lead por formulário (OUTCOME_LEADS + pixel): action_type `lead`
//   - lead por mensagem (WhatsApp): `onsite_conversion.messaging_conversation_started_7d`
//   - perfil/seguidores (OUTCOME_TRAFFIC): `link_click` (a API de Ads NÃO devolve
//     ganho de seguidores — isso vive na Instagram Graph API)
//   - reconhecimento/autoridade (OUTCOME_AWARENESS): métrica principal = alcance
//   - vendas sem pixel (esta conta): cai em messaging

export type ObjectiveCategory =
  | "messages" // lead por mensagem / WhatsApp
  | "lead_form" // lead por formulário / site (pixel)
  | "sales"
  | "profile" // perfil / seguidores
  | "engagement"
  | "awareness"; // reconhecimento / autoridade

export interface CategoryConfig {
  category: ObjectiveCategory;
  emoji: string;
  title: string;
  /** Rótulo da métrica principal (ex.: "Leads", "Conversas iniciadas"). */
  headlineLabel: string;
  /** Rótulo do custo principal (ex.: "CPL (custo por lead)"). */
  costLabel: string;
  /** Ordem de preferência do action_type que conta como conversão. */
  actionPriority: string[];
  /** Se a métrica principal é uma conversão (actions) ou o alcance (reach). */
  primaryMetric: "conversion" | "reach";
  /** Observação fixa exibida na mensagem (ex.: aviso sobre seguidores). */
  footnote?: string;
}

const CONFIGS: Record<ObjectiveCategory, CategoryConfig> = {
  messages: {
    category: "messages",
    emoji: "💬",
    title: "Leads por Mensagem (WhatsApp)",
    headlineLabel: "Conversas iniciadas",
    costLabel: "CPA (custo por conversa)",
    actionPriority: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection",
      "onsite_conversion.messaging_first_reply",
    ],
    primaryMetric: "conversion",
  },
  lead_form: {
    category: "lead_form",
    emoji: "📋",
    title: "Leads",
    headlineLabel: "Leads",
    costLabel: "CPL (custo por lead)",
    actionPriority: [
      "lead",
      "offsite_conversion.fb_pixel_lead",
      "onsite_web_lead",
      "onsite_conversion.lead_grouped",
      "leadgen_grouped",
    ],
    primaryMetric: "conversion",
  },
  sales: {
    category: "sales",
    emoji: "🛒",
    title: "Vendas",
    headlineLabel: "Conversões",
    costLabel: "CPA (custo por conversão)",
    actionPriority: [
      "offsite_conversion.fb_pixel_purchase",
      "purchase",
      "omni_purchase",
      "onsite_web_purchase",
      // Contas sem pixel de compra — vendas acontecem via WhatsApp:
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection",
    ],
    primaryMetric: "conversion",
  },
  profile: {
    category: "profile",
    emoji: "👤",
    title: "Perfil / Visitas",
    headlineLabel: "Visitas ao perfil (estimativa)",
    costLabel: "Custo por visita (estimativa)",
    actionPriority: ["link_click", "landing_page_view"],
    primaryMetric: "conversion",
  },
  engagement: {
    category: "engagement",
    emoji: "📣",
    title: "Engajamento",
    headlineLabel: "Engajamentos",
    costLabel: "Custo por engajamento",
    actionPriority: ["post_engagement", "page_engagement"],
    primaryMetric: "conversion",
  },
  awareness: {
    category: "awareness",
    emoji: "📢",
    title: "Reconhecimento / Autoridade",
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

/**
 * Regras de detecção em ORDEM DE PRIORIDADE. A primeira que casar com qualquer
 * parte do nome vence. A ordem importa: tags que definem a conversão (FORM,
 * WHATS/MSG) vêm antes de tags de objetivo amplo (ENGA, REC).
 */
const NAME_RULES: Array<{ re: RegExp; category: ObjectiveCategory }> = [
  { re: /FORM/, category: "lead_form" },
  { re: /(WHATS|WPP|MSG|MENSAG)/, category: "messages" },
  { re: /(VENDA|SALE)/, category: "sales" },
  { re: /(SEGUIDOR|PERFIL|CRESCIMENTO)/, category: "profile" },
  { re: /(RESERVA|LEAD)/, category: "lead_form" },
  { re: /(\bENG|ENGAJ|ENGAGE)/, category: "engagement" },
  { re: /(\bREC\b|RECONHEC|AUTORIDADE|ALCANCE|AWARENESS)/, category: "awareness" },
];

function fromName(name: string): ObjectiveCategory | null {
  const n = normalize(name);
  for (const rule of NAME_RULES) {
    if (rule.re.test(n)) return rule.category;
  }
  return null;
}

function fromMetaObjective(objective: string): ObjectiveCategory {
  const o = normalize(objective);
  if (/(SALES|CONVERSION|PURCHASE|CATALOG)/.test(o)) return "sales";
  if (/LEAD/.test(o)) return "lead_form";
  if (/(AWARENESS|REACH)/.test(o)) return "awareness";
  if (/(TRAFFIC|LINK_CLICK)/.test(o)) return "profile";
  if (/(MESSAGE|CONVERSATION)/.test(o)) return "messages";
  // OUTCOME_ENGAGEMENT, POST_ENGAGEMENT, etc.
  return "engagement";
}

/**
 * Detecta a categoria combinando as tags do nome (sinal primário) e o campo
 * objective da Meta (fallback).
 */
export function detectCategory(
  name: string,
  metaObjective?: string
): CategoryConfig {
  const byName = fromName(name);
  if (byName) return CONFIGS[byName];
  if (metaObjective) return CONFIGS[fromMetaObjective(metaObjective)];
  return CONFIGS.engagement;
}

export function getConfig(category: ObjectiveCategory): CategoryConfig {
  return CONFIGS[category];
}
