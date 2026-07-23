import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { basename } from "node:path";
import { z } from "zod";
import { MetaAdsClient } from "./meta-api.js";
import {
  buildReport,
  buildAccountReport,
  buildPdfModel,
  buildDailySeries,
  type PdfReportModel,
} from "./report.js";
import {
  googleAdsConfigured,
  listGoogleAdsAccounts,
  getGoogleAdsAccountReport,
  getGoogleAdsCampaigns,
  getGoogleAdsKeywords,
  getGoogleAdsDailySeries,
  getGoogleAdsAdGroups,
  getGoogleAdsHourlyBreakdown,
  getGoogleAdsKeywordIdeas,
  getGoogleAdsSearchTerms,
  getGoogleAdsConversionActions,
  getGoogleAdsDemographics,
  getGoogleAdsAdCopy,
  getGoogleAdsAdAssetPerformance,
  getGoogleAdsLocationTargets,
} from "./google-ads-api.js";
import {
  buildGoogleAdsReport,
  buildGoogleAdsComparison,
  buildGooglePdfModel,
  buildGoogleComparisonPdfModel,
  buildIntegratedReport,
  buildIntegratedComparisonReport,
  buildIntegratedPdfModel,
  buildIntegratedComparisonPdfModel,
  type DailyPoint,
  type GoogleAdsEnhancedReport,
  type IntegratedReport,
  type MetaAccountReportLike,
} from "./google-report.js";
import { renderGoogleReportHtml, renderGooglePagesFragment, GOOGLE_PDF_CSS, type GoogleReportComparison } from "./google-pdf.js";
import {
  processMetaAdsets, processMetaAds, processMetaDemographics, buildMetaFunil, renderMetaReportHtml,
  renderMetaPagesFragment, META_PDF_CSS,
  type MetaReportComparison, type TopCriativo, type MetaPdfParams,
} from "./meta-pdf.js";
import { renderIntegratedFullHtml } from "./pdf-template.js";
import { renderBecoCplHtml } from "./beco-cpl-pdf.js";
import { moneyBR, intBR } from "./format.js";
import { clientsConfigured, findClient, loadClients, clientContexto } from "./clients-db.js";
import { registerIntelligenceTools } from "./server-tools/intelligence-tools.js";
import { registerWriteTools } from "./server-tools/write-tools.js";
import { registerGoogleWriteTools } from "./server-tools/google-write-tools.js";
import { registerGoogleBusinessTools } from "./server-tools/google-business-tools.js";
import { googleBusinessConfigured } from "./google-business-api.js";
import { resolveNiche } from "./intelligence/niche.js";

const ACCOUNT_DESC =
  "ID da conta de anúncios (com ou sem 'act_'). Se omitido, usa a conta padrão configurada no servidor.";

const STATUS_VALUES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] as const;

// IDs do Meta/Google (campaign_id, pixel_id, adset_id...) têm 18 dígitos e estouram
// Number.MAX_SAFE_INTEGER — se o schema aceitar "number", o transporte JSON pode
// serializar como número puro e perder precisão nos últimos dígitos antes mesmo do
// zod validar (ex.: ...950546 virando ...950540). Só string preserva os dígitos exatos.
const OPTIONAL_SCALAR = z.string().optional();

const STATUS = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .describe("Filtrar por status: ACTIVE, PAUSED, DELETED, ARCHIVED");

const DATE_PRESETS = [
  "today", "yesterday", "this_week_mon_today", "last_week_mon_sun",
  "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
  "this_month", "last_month", "this_quarter", "last_year", "this_year",
] as const;

const BREAKDOWNS = [
  "age",
  "gender",
  "country",
  "region",
  "publisher_platform",
  "platform_position",
  "device_platform",
  "impression_device",
  "frequency_value",
  "hourly_stats_aggregated_by_advertiser_time_zone",
  "hourly_stats_aggregated_by_audience_time_zone",
  "place_page_id",
  "product_id",
  "placement",
] as const;

const ACTION_BREAKDOWNS = [
  "action_type",
  "action_device",
  "action_destination",
  "action_conversion_device",
] as const;

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

const ACCOUNT_ID_SCHEMA = {
  account_id: OPTIONAL_SCALAR.describe(ACCOUNT_DESC),
  ad_account_id: OPTIONAL_SCALAR.describe("Alias de account_id."),
  adAccountId: OPTIONAL_SCALAR.describe("Alias de account_id."),
  accountId: OPTIONAL_SCALAR.describe("Alias de account_id."),
  accountID: OPTIONAL_SCALAR.describe("Alias de account_id."),
  account: OPTIONAL_SCALAR.describe("Alias de account_id."),
  ad_account: OPTIONAL_SCALAR.describe("Alias de account_id."),
  adAccount: OPTIONAL_SCALAR.describe("Alias de account_id."),
  act_id: OPTIONAL_SCALAR.describe("Alias de account_id."),
  META_AD_ACCOUNT_ID: OPTIONAL_SCALAR.describe("Alias de account_id."),
  META_ACCOUNT_ID: OPTIONAL_SCALAR.describe("Alias de account_id."),
};

const OPTIONAL_PERIOD_SCHEMA = {
  since: z.string().optional().describe("Data inicio YYYY-MM-DD"),
  until: z.string().optional().describe("Data fim YYYY-MM-DD"),
  start_date: z.string().optional().describe("Alias de since."),
  end_date: z.string().optional().describe("Alias de until."),
  startDate: z.string().optional().describe("Alias de since."),
  endDate: z.string().optional().describe("Alias de until."),
  date_start: z.string().optional().describe("Alias de since."),
  date_end: z.string().optional().describe("Alias de until."),
  from: z.string().optional().describe("Alias de since."),
  to: z.string().optional().describe("Alias de until."),
  from_date: z.string().optional().describe("Alias de since."),
  to_date: z.string().optional().describe("Alias de until."),
  start: z.string().optional().describe("Alias de since."),
  end: z.string().optional().describe("Alias de until."),
  since_date: z.string().optional().describe("Alias de since."),
  until_date: z.string().optional().describe("Alias de until."),
};

const CAMPAIGN_ID_SCHEMA = {
  campaign_id: OPTIONAL_SCALAR.describe("ID da campanha"),
  campaignId: OPTIONAL_SCALAR.describe("Alias de campaign_id."),
  campaignID: OPTIONAL_SCALAR.describe("Alias de campaign_id."),
  campaign: OPTIONAL_SCALAR.describe("Alias de campaign_id."),
  campaign_id_meta: OPTIONAL_SCALAR.describe("Alias de campaign_id."),
  id: OPTIONAL_SCALAR.describe("Alias de campaign_id."),
  CAMPAIGN_ID: OPTIONAL_SCALAR.describe("Alias de campaign_id."),
};

const PIXEL_ID_SCHEMA = {
  pixel_id: OPTIONAL_SCALAR.describe("ID do pixel/dataset"),
  pixelId: OPTIONAL_SCALAR.describe("Alias de pixel_id."),
  pixelID: OPTIONAL_SCALAR.describe("Alias de pixel_id."),
  dataset_id: OPTIONAL_SCALAR.describe("Alias de pixel_id."),
  datasetId: OPTIONAL_SCALAR.describe("Alias de pixel_id."),
  id: OPTIONAL_SCALAR.describe("Alias de pixel_id."),
  PIXEL_ID: OPTIONAL_SCALAR.describe("Alias de pixel_id."),
};

const COMMON_COMPAT_SCHEMA = {
  status: STATUS,
  campaign_status: STATUS,
  effective_status: STATUS,
  status_filter: STATUS,
  statuses: z.array(z.string()).optional().describe("Alias de status."),
  objective: z.string().optional().describe("Contexto opcional do tipo de objetivo solicitado."),
  campaign_objective: z.string().optional().describe("Alias de objective."),
  campaign_type: z.string().optional().describe("Contexto opcional do tipo de campanha."),
  report_type: z.string().optional().describe("Contexto opcional do tipo de relatorio."),
  type: z.string().optional().describe("Contexto opcional do tipo de relatorio."),
  tipo: z.string().optional().describe("Alias de report_type."),
  tipo_campanha: z.string().optional().describe("Alias de campaign_type."),
};

const DATE_PRESET_SCHEMA = {
  date_preset: z.string().optional().describe("Alternativa a since/until (ex.: yesterday, last_7d)"),
  datePreset: z.string().optional().describe("Alias de date_preset."),
  preset: z.string().optional().describe("Alias de date_preset."),
  period: z.string().optional().describe("Alias de date_preset quando usar presets como this_month."),
  periodo: z.string().optional().describe("Alias de date_preset quando usar presets como this_month."),
};

const COMPARE_PERIOD_SCHEMA = {
  compare_since: z.string().optional().describe("Inicio do periodo anterior (YYYY-MM-DD)."),
  compare_until: z.string().optional().describe("Fim do periodo anterior (YYYY-MM-DD)."),
  compare_start_date: z.string().optional().describe("Alias de compare_since."),
  compare_end_date: z.string().optional().describe("Alias de compare_until."),
  previous_since: z.string().optional().describe("Alias de compare_since."),
  previous_until: z.string().optional().describe("Alias de compare_until."),
};

const DAILY_SCHEMA = {
  incluir_diario: z.boolean().optional().describe(
    "Inclui a evolução dia a dia (gasto, resultados, cliques, CTR e custo por resultado de cada dia) além dos totais. Use quando o usuário pedir análise diária."
  ),
  daily: z.boolean().optional().describe("Alias de incluir_diario."),
  diario: z.boolean().optional().describe("Alias de incluir_diario."),
  incluir_serie_diaria: z.boolean().optional().describe("Alias de incluir_diario."),
  serie_diaria: z.boolean().optional().describe("Alias de incluir_diario."),
  breakdown_diario: z.boolean().optional().describe("Alias de incluir_diario."),
};

const CLIENT_NAME_SCHEMA = {
  client_name: z
    .string()
    .optional()
    .describe("Nome do cliente para o cabecalho. Se omitido, usa o nome da conta."),
  clientName: z.string().optional().describe("Alias de client_name."),
  CLIENT_NAME: z.string().optional().describe("Alias de client_name."),
  client: z.string().optional().describe("Alias de client_name."),
  cliente: z.string().optional().describe("Alias de client_name."),
  customer_name: z.string().optional().describe("Alias de client_name."),
  account_name: z.string().optional().describe("Alias de client_name."),
};

type AccountIdArgs = {
  account_id?: string | number;
  ad_account_id?: string | number;
  adAccountId?: string | number;
  accountId?: string | number;
  accountID?: string | number;
  account?: string | number;
  ad_account?: string | number;
  adAccount?: string | number;
  act_id?: string | number;
  META_AD_ACCOUNT_ID?: string | number;
  META_ACCOUNT_ID?: string | number;
};

type PeriodArgs = {
  since?: string;
  until?: string;
  start_date?: string;
  end_date?: string;
  startDate?: string;
  endDate?: string;
  date_start?: string;
  date_end?: string;
  from?: string;
  to?: string;
  from_date?: string;
  to_date?: string;
  start?: string;
  end?: string;
  since_date?: string;
  until_date?: string;
};

type CampaignIdArgs = {
  campaign_id?: string | number;
  campaignId?: string | number;
  campaignID?: string | number;
  campaign?: string | number;
  campaign_id_meta?: string | number;
  id?: string | number;
  CAMPAIGN_ID?: string | number;
};

type PixelIdArgs = {
  pixel_id?: string | number;
  pixelId?: string | number;
  pixelID?: string | number;
  dataset_id?: string | number;
  datasetId?: string | number;
  id?: string | number;
  PIXEL_ID?: string | number;
};

type StatusArgs = {
  status?: string | string[];
  campaign_status?: string | string[];
  effective_status?: string | string[];
  status_filter?: string | string[];
  statuses?: string[];
};

type DatePresetArgs = {
  date_preset?: string;
  datePreset?: string;
  preset?: string;
  period?: string;
  periodo?: string;
};

type ClientNameArgs = {
  client_name?: string;
  clientName?: string;
  CLIENT_NAME?: string;
  client?: string;
  cliente?: string;
  customer_name?: string;
  account_name?: string;
};

type ComparePeriodArgs = {
  compare_since?: string;
  compare_until?: string;
  compare_start_date?: string;
  compare_end_date?: string;
  previous_since?: string;
  previous_until?: string;
};

function scalarToString(value: string | number | undefined): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function accountIdFrom(args: AccountIdArgs): string | undefined {
  return scalarToString(
    args.account_id ??
      args.ad_account_id ??
      args.adAccountId ??
      args.accountId ??
      args.accountID ??
      args.account ??
      args.ad_account ??
      args.adAccount ??
      args.act_id ??
      args.META_AD_ACCOUNT_ID ??
      args.META_ACCOUNT_ID
  );
}

function periodFrom(args: PeriodArgs): { since?: string; until?: string } {
  return {
    since:
      args.since ??
      args.start_date ??
      args.startDate ??
      args.date_start ??
      args.from ??
      args.from_date ??
      args.start ??
      args.since_date,
    until:
      args.until ??
      args.end_date ??
      args.endDate ??
      args.date_end ??
      args.to ??
      args.to_date ??
      args.end ??
      args.until_date,
  };
}

function campaignIdFrom(args: CampaignIdArgs): string | undefined {
  return scalarToString(
    args.campaign_id ??
      args.campaignId ??
      args.campaignID ??
      args.campaign ??
      args.campaign_id_meta ??
      args.id ??
      args.CAMPAIGN_ID
  );
}

function pixelIdFrom(args: PixelIdArgs): string | undefined {
  return scalarToString(
    args.pixel_id ??
      args.pixelId ??
      args.pixelID ??
      args.dataset_id ??
      args.datasetId ??
      args.id ??
      args.PIXEL_ID
  );
}

function statusFrom(args: StatusArgs): string | undefined {
  const raw =
    args.status ??
    args.campaign_status ??
    args.effective_status ??
    args.status_filter ??
    args.statuses?.[0];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;

  const normalized = String(value).trim().toUpperCase();
  const aliases: Record<string, string> = {
    ATIVO: "ACTIVE",
    ATIVA: "ACTIVE",
    ACTIVE: "ACTIVE",
    PAUSADO: "PAUSED",
    PAUSADA: "PAUSED",
    PAUSED: "PAUSED",
    DELETADO: "DELETED",
    DELETADA: "DELETED",
    DELETED: "DELETED",
    ARQUIVADO: "ARCHIVED",
    ARQUIVADA: "ARCHIVED",
    ARCHIVED: "ARCHIVED",
  };
  const mapped = aliases[normalized] ?? normalized;

  if (!STATUS_VALUES.includes(mapped as (typeof STATUS_VALUES)[number])) {
    throw new Error(
      `Status invalido: ${value}. Use ACTIVE, PAUSED, DELETED ou ARCHIVED.`
    );
  }
  return mapped;
}

function datePresetFrom(args: DatePresetArgs): string | undefined {
  const raw = args.date_preset ?? args.datePreset ?? args.preset ?? args.period ?? args.periodo;
  if (!raw) return undefined;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    hoje: "today",
    today: "today",
    ontem: "yesterday",
    yesterday: "yesterday",
    mes_atual: "this_month",
    este_mes: "this_month",
    current_month: "this_month",
    this_month: "this_month",
    mes_passado: "last_month",
    ultimo_mes: "last_month",
    last_month: "last_month",
    ultimos_7_dias: "last_7d",
    last_7_days: "last_7d",
    last_7d: "last_7d",
    ultimos_30_dias: "last_30d",
    last_30_days: "last_30d",
    last_30d: "last_30d",
  };
  return aliases[normalized] ?? raw;
}

function clientNameFrom(args: ClientNameArgs): string | undefined {
  return (
    args.client_name ??
    args.clientName ??
    args.CLIENT_NAME ??
    args.client ??
    args.cliente ??
    args.customer_name ??
    args.account_name
  );
}

function requireValue(value: string | undefined, field: string): string {
  if (!value) throw new Error(`Parametro obrigatorio ausente: ${field}`);
  return value;
}

function comparePeriodFrom(args: ComparePeriodArgs): { since?: string; until?: string } {
  return {
    since: args.compare_since ?? args.compare_start_date ?? args.previous_since,
    until: args.compare_until ?? args.compare_end_date ?? args.previous_until,
  };
}

/**
 * Período anterior "smart" para comparação padrão: se o período é um mês de
 * calendário cheio, compara com o mês anterior completo; senão, com um bloco do
 * mesmo tamanho imediatamente anterior. Retorna null se não houver datas concretas.
 */
function smartPreviousPeriod(since?: string, until?: string): { since: string; until: string } | null {
  if (!since || !until) return null;
  const s = new Date(`${since}T00:00:00Z`);
  const u = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(u.getTime()) || u < s) return null;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const fullMonth =
    s.getUTCDate() === 1 &&
    s.getUTCFullYear() === u.getUTCFullYear() &&
    s.getUTCMonth() === u.getUTCMonth() &&
    u.getUTCDate() === lastDay(u.getUTCFullYear(), u.getUTCMonth());
  if (fullMonth) {
    const py = s.getUTCMonth() === 0 ? s.getUTCFullYear() - 1 : s.getUTCFullYear();
    const pm = s.getUTCMonth() === 0 ? 11 : s.getUTCMonth() - 1;
    return { since: iso(new Date(Date.UTC(py, pm, 1))), until: iso(new Date(Date.UTC(py, pm, lastDay(py, pm)))) };
  }
  const dayMs = 86400000;
  const days = Math.round((u.getTime() - s.getTime()) / dayMs) + 1;
  const pu = new Date(s.getTime() - dayMs);
  const ps = new Date(pu.getTime() - (days - 1) * dayMs);
  return { since: iso(ps), until: iso(pu) };
}

/** Baixa uma imagem e devolve como data URI base64 (embutível no PDF). Null se falhar. */
async function imageToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 900_000) return null; // evita inflar o PDF
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function periodLabelFrom(since?: string, until?: string, preset?: string): string {
  return since && until ? `${since} a ${until}` : preset ?? "ultimos 30 dias";
}

const FORMATO_SCHEMA = {
  formato: z.enum(["pdf", "html"]).optional().describe("Formato de saída: 'pdf' (entrega ao cliente, padrão) ou 'html' (dashboard navegável para análise na tela)."),
  format: z.enum(["pdf", "html"]).optional().describe("Alias de formato."),
};

function formatoFrom(args: { formato?: string; format?: string }): "pdf" | "html" {
  return (args.formato ?? args.format) === "html" ? "html" : "pdf";
}

async function renderPdfToolResponse(
  model: PdfReportModel,
  clientName: string,
  formato: "pdf" | "html" = "pdf"
) {
  const slug = clientName
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .toLowerCase().slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);

  if (formato === "html") {
    const { renderReportHtml } = await import("./html-report.js");
    const html = renderReportHtml(model);
    const name = `relatorio-${slug}-${stamp}.html`;
    if (process.env.VERCEL) {
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) {
        return toolError("Relat\u00f3rio HTML gerado, mas falta armazenamento. Defina BLOB_READ_WRITE_TOKEN para receber o link.");
      }
      const { put } = await import("@vercel/blob");
      const result = await put(`relatorios/${name}`, html, {
        access: "public",
        token: blobToken,
        contentType: "text/html; charset=utf-8",
        addRandomSuffix: true,
      });
      return { content: [{ type: "text" as const, text: `Relat\u00f3rio HTML gerado:\n${result.url}` }] };
    }
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "reports");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, name);
    writeFileSync(filePath, html, "utf8");
    const publicBase = process.env.PUBLIC_BASE_URL;
    const where = publicBase ? `${publicBase.replace(/\/$/, "")}/files/${name}` : filePath;
    return { content: [{ type: "text" as const, text: `Relat\u00f3rio HTML gerado:\n${where}` }] };
  }

  const pdf = await import("./pdf.js");

  if (process.env.VERCEL) {
    const { pdf: buffer, pageCount } = await pdf.renderReportPdf(model);
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return toolError(
        `PDF renderizado (${pageCount} paginas, ${Math.round(buffer.length / 1024)} KB), ` +
          "mas falta armazenamento. Defina BLOB_READ_WRITE_TOKEN para receber o link."
      );
    }
    const { put } = await import("@vercel/blob");
    const result = await put(`relatorios/relatorio-${slug}-${stamp}.pdf`, buffer, {
      access: "public",
      token: blobToken,
      contentType: "application/pdf",
      addRandomSuffix: true,
    });
    return {
      content: [{ type: "text" as const, text: `PDF gerado (${pageCount} paginas):\n${result.url}` }],
    };
  }

  const result = await pdf.generatePdf(model, clientName);
  const publicBase = process.env.PUBLIC_BASE_URL;
  if (publicBase) {
    const fileUrl = `${publicBase.replace(/\/$/, "")}/files/${basename(result.pdfPath)}`;
    return {
      content: [{ type: "text" as const, text: `PDF gerado (${result.pageCount} paginas):\n${fileUrl}` }],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text:
          `PDF gerado com sucesso:\n${result.pdfPath}\n\n` +
          `Previa PNG:\n${result.previewPath}\n\n` +
          `Paginas: ${result.pageCount}`,
      },
    ],
  };
}

async function qaPdfToolResponse(model: PdfReportModel) {
  const pdf = await import("./pdf.js");
  return json(await pdf.qaReportPdf(model));
}

async function renderHtmlPdfToolResponse(
  html: string,
  clientName: string,
  formato: "pdf" | "html" = "pdf",
  whatsappText?: string
) {
  const slug = clientName
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .toLowerCase().slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);

  if (formato === "html") {
    const name = `relatorio-${slug}-${stamp}.html`;
    if (process.env.VERCEL) {
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) return toolError("HTML gerado, mas falta BLOB_READ_WRITE_TOKEN.");
      const { put } = await import("@vercel/blob");
      const result = await put(`relatorios/${name}`, html, {
        access: "public", token: blobToken,
        contentType: "text/html; charset=utf-8", addRandomSuffix: true,
      });
      return { content: [{ type: "text" as const, text: `Relatório HTML gerado:\n${result.url}` }] };
    }
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "reports");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, name);
    writeFileSync(filePath, html, "utf8");
    const publicBase = process.env.PUBLIC_BASE_URL;
    const where = publicBase ? `${publicBase.replace(/\/$/, "")}/files/${name}` : filePath;
    return { content: [{ type: "text" as const, text: `Relatório HTML gerado:\n${where}` }] };
  }

  const pdfLib = await import("./pdf.js");
  if (process.env.VERCEL) {
    const { pdf: buffer, pageCount } = await pdfLib.renderHtmlPdf(html);
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return toolError(
        `PDF renderizado (${pageCount} páginas, ${Math.round(buffer.length / 1024)} KB), mas falta BLOB_READ_WRITE_TOKEN.`
      );
    }
    const { put } = await import("@vercel/blob");
    const result = await put(`relatorios/relatorio-${slug}-${stamp}.pdf`, buffer, {
      access: "public", token: blobToken, contentType: "application/pdf", addRandomSuffix: true,
    });
    const suffix = whatsappText ? `\n\n---MSG_WHATSAPP---\n${whatsappText}` : "";
    return { content: [{ type: "text" as const, text: `PDF gerado (${pageCount} páginas):\n${result.url}${suffix}` }] };
  }

  const result = await pdfLib.saveHtmlPdf(html, clientName);
  const publicBase = process.env.PUBLIC_BASE_URL;
  if (publicBase) {
    const fileUrl = `${publicBase.replace(/\/$/, "")}/files/${basename(result.pdfPath)}`;
    return { content: [{ type: "text" as const, text: `PDF gerado (${result.pageCount} páginas):\n${fileUrl}` }] };
  }
  return {
    content: [{
      type: "text" as const,
      text: `PDF gerado com sucesso:\n${result.pdfPath}\n\nPrévia PNG:\n${result.previewPath}\n\nPáginas: ${result.pageCount}`,
    }],
  };
}

export function createMcpServer(
  accessToken: string,
  adAccountId?: string,
  allowlist?: string[]
): McpServer {
  const client = new MetaAdsClient({ accessToken, adAccountId, allowlist });

  const server = new McpServer({ name: "rw-mcp", version: "1.0.0" });

  // ─── Contas ─────────────────────────────────────────────────────────────────

  server.tool(
    "meta_list_ad_accounts",
    "Lista todas as contas de anúncios que o token tem acesso (id, nome, moeda, status). Use para descobrir o account_id de cada cliente.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async () => json(await client.getAdAccounts())
  );

  server.tool(
    "meta_get_ad_account",
    "Informações de uma conta: nome, status, moeda, fuso, saldo e gasto total.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.getAdAccount(accountIdFrom(args)))
  );

  // ─── Campanhas ──────────────────────────────────────────────────────────────

  server.tool(
    "meta_list_campaigns",
    "Lista campanhas da conta. Filtre por status: ACTIVE, PAUSED, DELETED, ARCHIVED.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) =>
      json(await client.getCampaigns(statusFrom(args), accountIdFrom(args)))
  );

  server.tool(
    "meta_get_campaign",
    "Detalhes de uma campanha específica pelo ID.",
    {
      ...CAMPAIGN_ID_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.getCampaign(requireValue(campaignIdFrom(args), "campaign_id")))
  );

  // ─── Conjuntos e Anúncios ─────────────────────────────────────────────────────

  server.tool(
    "meta_list_adsets",
    "Lista conjuntos de anúncios. Pode filtrar por campanha e/ou status.",
    {
      ...CAMPAIGN_ID_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) =>
      json(await client.getAdSets(campaignIdFrom(args), statusFrom(args), accountIdFrom(args)))
  );

  server.tool(
    "meta_list_ads",
    "Lista anúncios. Pode filtrar por conjunto, campanha e/ou status.",
    {
      adset_id: z.string().optional().describe("ID do conjunto de anúncios"),
      adsetId: z.string().optional().describe("Alias de adset_id."),
      ...CAMPAIGN_ID_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) =>
      json(await client.getAds(args.adset_id ?? args.adsetId, campaignIdFrom(args), statusFrom(args), accountIdFrom(args)))
  );

  // ─── Mídia e públicos (leitura) ───────────────────────────────────────────────

  server.tool(
    "meta_list_videos",
    "Lista os vídeos da conta (id, título, data, duração em segundos). Use para o usuário escolher qual vídeo usar num criativo.",
    { ...ACCOUNT_ID_SCHEMA },
    async (args) => json(await client.listVideos(accountIdFrom(args)))
  );

  server.tool(
    "meta_list_images",
    "Lista as imagens da conta (hash, nome, url, dimensões). O hash é o que se usa em image_hash nos criativos.",
    { ...ACCOUNT_ID_SCHEMA },
    async (args) => json(await client.listImages(accountIdFrom(args)))
  );

  server.tool(
    "meta_list_ig_media",
    "Lista mídias orgânicas de um perfil do Instagram (id, media_type, timestamp, caption, permalink). Use para obter os IDs de vídeos a incluir em públicos personalizados de engajamento de vídeo. O ig_user_id é o ig_business ID — o mesmo usado nas rules de públicos IG (ex: 7399517663443204 para Recife).",
    {
      ig_user_id: z.string().describe("ID do perfil do Instagram (ig_business ID)."),
      since_date: z
        .string()
        .optional()
        .describe("Filtrar mídias publicadas a partir desta data (YYYY-MM-DD). Opcional."),
      media_type: z
        .string()
        .optional()
        .describe("Filtrar por tipo: VIDEO, IMAGE, REELS, CAROUSEL_ALBUM. Opcional."),
    },
    async (args) =>
      json(
        await client.listIgMedia(
          args.ig_user_id as string,
          args.since_date as string | undefined,
          args.media_type as string | undefined
        )
      )
  );

  server.tool(
    "meta_list_custom_audiences",
    "Lista os públicos personalizados da conta (id, nome, subtype, tamanho aproximado). Use para escolher públicos a incluir ou excluir no targeting.",
    { ...ACCOUNT_ID_SCHEMA },
    async (args) => json(await client.listCustomAudiences(accountIdFrom(args)))
  );

  server.tool(
    "meta_list_saved_audiences",
    "Lista os Públicos Salvos (Saved Audiences) da conta — pacotes de targeting (local, idade, interesses, públicos) reutilizáveis ao criar conjuntos. Diferente de meta_list_custom_audiences (retargeting/lookalike).",
    { ...ACCOUNT_ID_SCHEMA },
    async (args) => json(await client.listSavedAudiences(accountIdFrom(args)))
  );

  server.tool(
    "meta_get_custom_audience",
    "Detalhes de um público pelo ID, incluindo a `rule` (regra de segmentação). Use para inspecionar a estrutura exata de um público de regra existente (eventos de pixel ou de engajamento do Instagram) e reusar como base ao criar novos.",
    {
      audience_id: z.string().describe("ID do público personalizado."),
      fields: z.string().optional().describe("Campos específicos (opcional)."),
    },
    async (args) =>
      json(
        await client.getCustomAudience(
          args.audience_id as string,
          args.fields as string | undefined
        )
      )
  );

  server.tool(
    "meta_get_creative",
    "Detalhes de um criativo pelo ID (object_story_spec, asset_feed_spec, url_tags, instagram_user_id, etc). Útil para inspecionar ou reusar a configuração de um criativo existente.",
    {
      creative_id: z.string().describe("ID do criativo."),
      fields: z.string().optional().describe("Campos específicos (opcional)."),
    },
    async (args) =>
      json(await client.getCreative(args.creative_id as string, args.fields as string | undefined))
  );

  server.tool(
    "meta_get_object",
    "GET genérico e SÓ LEITURA de qualquer objeto do Graph API pelo ID (anúncio, post, página, conjunto, criativo, etc.) com os campos que você pedir. Use para inspecionar campos que as tools tipadas não expõem — ex.: ler um ad inteiro, ou o post por trás de effective_object_story_id. Para edges com lista, peça o edge dentro de fields (ex.: 'name,ads{name,creative}').",
    {
      id: z.string().describe("ID do objeto (ad, post, page, adset, creative, etc.)."),
      fields: z
        .string()
        .optional()
        .describe("Lista de campos separada por vírgula (ex.: 'name,creative{object_story_spec}'). Omita para os campos padrão do objeto."),
    },
    async (args) =>
      json(await client.getObject(args.id as string, args.fields as string | undefined))
  );

  server.tool(
    "meta_get_preview",
    "Gera o preview (HTML em iframe) de um criativo num posicionamento, para validar como o anúncio aparece ANTES de ativar. ad_format='all' retorna os principais formatos do Instagram.",
    {
      creative_id: z.string().describe("ID do criativo."),
      ad_format: z
        .string()
        .optional()
        .describe(
          "Formato (ex: INSTAGRAM_STORY, INSTAGRAM_STANDARD, INSTAGRAM_REELS, MOBILE_FEED_STANDARD). 'all' = principais do Instagram. Padrão INSTAGRAM_STORY."
        ),
    },
    async (args) => {
      const fmt = (args.ad_format as string | undefined) ?? "INSTAGRAM_STORY";
      const creativeId = args.creative_id as string;
      if (fmt.toLowerCase() === "all") {
        const formats = [
          "INSTAGRAM_STANDARD",
          "INSTAGRAM_STORY",
          "INSTAGRAM_REELS",
        ];
        const out: Record<string, unknown> = {};
        for (const f of formats) {
          try {
            out[f] = await client.getCreativePreview(creativeId, f);
          } catch (e) {
            out[f] = { error: (e as Error).message };
          }
        }
        return json(out);
      }
      return json(await client.getCreativePreview(creativeId, fmt));
    }
  );

  // ─── Insights brutos ──────────────────────────────────────────────────────────

  server.tool(
    "meta_get_insights",
    "Métricas cruas para UM período. Inclui spend, reach, frequency, actions, cost_per_action_type, action_values, ROAS, rankings e métricas de vídeo quando disponíveis.",
    {
      level: z.enum(["account", "campaign", "adset", "ad"]).describe("Nível de agregação"),
      entity_id: OPTIONAL_SCALAR.describe("ID da entidade. Omita para a conta inteira."),
      entityId: OPTIONAL_SCALAR.describe("Alias de entity_id."),
      ENTITY_ID: OPTIONAL_SCALAR.describe("Alias de entity_id."),
      id: OPTIONAL_SCALAR.describe("Alias de entity_id."),
      ad_id: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=ad."),
      adId: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=ad."),
      AD_ID: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=ad."),
      adset_id: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=adset."),
      adsetId: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=adset."),
      ADSET_ID: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=adset."),
      campaign_id: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=campaign."),
      campaignId: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=campaign."),
      CAMPAIGN_ID: OPTIONAL_SCALAR.describe("Alias de entity_id quando level=campaign."),
      ...OPTIONAL_PERIOD_SCHEMA,
      ...DATE_PRESET_SCHEMA,
      time_increment: z.union([z.number(), z.string()]).optional().describe("Quebra temporal: 1 = uma linha por dia (série diária). Omita para o total do período."),
      timeIncrement: z.union([z.number(), z.string()]).optional().describe("Alias de time_increment."),
      breakdown: z.enum(BREAKDOWNS).optional().describe("Quebra única. 'placement' vira publisher_platform + platform_position."),
      breakdowns: z.array(z.enum(BREAKDOWNS)).optional().describe("Quebras múltiplas."),
      action_breakdowns: z.array(z.enum(ACTION_BREAKDOWNS)).optional(),
      action_report_time: z.enum(["impression", "conversion", "mixed"]).optional(),
      action_attribution_windows: z.array(z.string()).optional().describe("Ex.: ['1d_view','7d_click']"),
      use_account_attribution: z.boolean().optional(),
      use_unified_attribution: z.boolean().optional(),
      filtering: z.array(z.record(z.string(), z.unknown())).optional(),
      sort: z.string().optional().describe("Ex.: spend_descending"),
      default_summary: z.boolean().optional(),
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      const { since, until } = periodFrom(args);
      const entityId = scalarToString(
        args.entity_id ??
          args.entityId ??
          args.ENTITY_ID ??
          args.id ??
          args.ad_id ??
          args.adId ??
          args.AD_ID ??
          args.adset_id ??
          args.adsetId ??
          args.ADSET_ID ??
          args.campaign_id ??
          args.campaignId ??
          args.CAMPAIGN_ID
      );

      const tiRaw = args.time_increment ?? args.timeIncrement;
      const timeIncrement =
        tiRaw != null && Number(tiRaw) > 0 ? Number(tiRaw) : undefined;

      return json(await client.getInsights({
        level: args.level,
        entityId,
        since,
        until,
        timeIncrement,
        datePreset: datePresetFrom(args),
        breakdown: args.breakdown === "placement" ? undefined : args.breakdown,
        breakdowns:
          args.breakdown === "placement"
            ? ["publisher_platform", "platform_position"]
            : (args.breakdowns as string[] | undefined)?.filter((item: string) => item !== "placement"),
        actionBreakdowns: args.action_breakdowns,
        actionReportTime: args.action_report_time,
        actionAttributionWindows: args.action_attribution_windows,
        useAccountAttribution: args.use_account_attribution,
        useUnifiedAttribution: args.use_unified_attribution,
        filtering: args.filtering,
        sort: args.sort,
        defaultSummary: args.default_summary,
        accountId: accountIdFrom(args),
      }));
    }
  );

  // ─── Pixels / datasets ──────────────────────────────────────────────────────

  server.tool(
    "meta_list_pixels",
    "Lista pixels/datasets vinculados à conta. Apenas leitura.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.listPixels(accountIdFrom(args)))
  );

  server.tool(
    "meta_get_pixel",
    "Detalhes de um pixel/dataset pelo ID. Apenas leitura.",
    {
      ...PIXEL_ID_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.getPixel(requireValue(pixelIdFrom(args), "pixel_id")))
  );

  server.tool(
    "meta_get_pixel_events",
    "Resumo de eventos recebidos por um pixel no período informado.",
    {
      ...PIXEL_ID_SCHEMA,
      ...OPTIONAL_PERIOD_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      const { since, until } = periodFrom(args);
      return json(await client.getPixelEvents(requireValue(pixelIdFrom(args), "pixel_id"), {
        start: args.start ?? since,
        end: args.end ?? until,
      }));
    }
  );

  server.tool(
    "meta_get_pixel_diagnostics",
    "Diagnóstico de saúde do pixel: último disparo, eventos recentes, automatic matching e problemas encontrados.",
    {
      ...PIXEL_ID_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.getPixelDiagnostics(requireValue(pixelIdFrom(args), "pixel_id")))
  );

  // ─── Relatório de campanha (detecção automática de objetivo) ──────────────────

  server.tool(
    "meta_get_campaign_report",
    `Relatório PRONTO de uma campanha, agregado e formatado.
Detecta o objetivo pelo nome ([MSG], [LEAD], [PERFIL], [VENDA], [REC], [ENG]) e pelo objective da Meta, escolhe o action_type de conversão e calcula CPA/CPL/CPC/CPM/CTR (e ThruPlay em reconhecimento).
Passe compare_since/compare_until para comparar dois períodos com variação %.`,
    {
      ...CAMPAIGN_ID_SCHEMA,
      ...OPTIONAL_PERIOD_SCHEMA,
      compare_since: z.string().optional().describe("Início da comparação (YYYY-MM-DD)"),
      compare_until: z.string().optional().describe("Fim da comparação (YYYY-MM-DD)"),
      compare_start_date: z.string().optional().describe("Alias de compare_since."),
      compare_end_date: z.string().optional().describe("Alias de compare_until."),
      action_type: z.string().optional().describe("Força um action_type de conversão. Auto se omitido."),
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      const campaign_id = requireValue(campaignIdFrom(args), "campaign_id");
      const { since, until } = periodFrom(args);
      const periodSince = requireValue(since, "since");
      const periodUntil = requireValue(until, "until");
      const compare_since = args.compare_since ?? args.compare_start_date;
      const compare_until = args.compare_until ?? args.compare_end_date;
      const campaign = await client.getCampaign(campaign_id);
      const isComparison = Boolean(compare_since && compare_until);

      let rows;
      let comparisonRows;
      if (isComparison) {
        const result = await client.getInsightsComparison({
          level: "campaign", entityId: campaign_id, since: periodSince, until: periodUntil,
          compareSince: compare_since, compareUntil: compare_until,
        });
        rows = result.period;
        comparisonRows = result.comparison;
      } else {
        rows = await client.getInsights({
          level: "campaign", entityId: campaign_id, since: periodSince, until: periodUntil,
        });
      }

      return json(buildReport({
        campaignName: campaign.name,
        metaObjective: campaign.objective,
        rows, comparisonRows, actionTypeOverride: args.action_type,
      }));
    }
  );

  // ─── Relatório da conta inteira ───────────────────────────────────────────────

  server.tool(
    "meta_get_account_report",
    `Relatório consolidado de TODAS as campanhas que rodaram no período, numa só chamada.
Detecta o objetivo de cada campanha e mostra o resultado certo de cada uma (leads, conversas, visitas, alcance...), com totais e custo por resultado. Ideal para "como foi a conta ontem / essa semana".
Passe incluir_diario=true para receber também a evolução dia a dia (gasto, resultados, cliques, CTR e custo por resultado de cada dia).`,
    {
      ...OPTIONAL_PERIOD_SCHEMA,
      ...DATE_PRESET_SCHEMA,
      ...DAILY_SCHEMA,
      ...CLIENT_NAME_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      const { since, until } = periodFrom(args);
      const datePreset = datePresetFrom(args);
      const accountId = accountIdFrom(args);
      const rows = await client.getInsights({
        level: "campaign", since, until, datePreset, accountId,
      });
      const periodoLabel =
        since && until ? `${since} a ${until}` : datePreset ?? "últimos 30 dias";
      const report = buildAccountReport(rows, periodoLabel, clientNameFrom(args) || undefined);

      const wantsDaily =
        args.incluir_diario ?? args.daily ?? args.diario ??
        args.incluir_serie_diaria ?? args.serie_diaria ?? args.breakdown_diario;

      if (wantsDaily) {
        const dailyRows = await client.getInsights({
          level: "campaign", since, until, datePreset, timeIncrement: 1, accountId,
        });
        return json({ ...report, serie_diaria: buildDailySeries(dailyRows) });
      }

      return json(report);
    }
  );

  // ─── Relatório em PDF ─────────────────────────────────────────────────────────

  server.tool(
    "meta_generate_report_pdf",
    `Gera relatório Meta Ads em PDF com 4 páginas: resumo + funil, conjuntos de anúncio, anúncios e demográficos (gênero/idade). formato='pdf' (padrão) ou 'html'.`,
    {
      ...OPTIONAL_PERIOD_SCHEMA,
      ...CLIENT_NAME_SCHEMA,
      ...DATE_PRESET_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
      ...FORMATO_SCHEMA,
      comparar: z.boolean().optional().describe("Compara com o período anterior (padrão: true). Passe false para não comparar."),
    },
    async (args) => {
      const { since, until } = periodFrom(args);
      const periodSince = requireValue(since, "since");
      const periodUntil = requireValue(until, "until");
      const account_id = accountIdFrom(args);
      const client_name = clientNameFrom(args);
      const formato = formatoFrom(args);

      const [accountRows, adsetRows, adRows, demoRows] = await Promise.all([
        client.getInsights({ level: "campaign", since: periodSince, until: periodUntil, accountId: account_id }),
        client.getInsights({ level: "adset", since: periodSince, until: periodUntil, accountId: account_id }).catch(() => []),
        client.getInsights({ level: "ad", since: periodSince, until: periodUntil, accountId: account_id }).catch(() => []),
        client.getInsights({ level: "account", since: periodSince, until: periodUntil, accountId: account_id, breakdowns: ["gender", "age"] }).catch(() => []),
      ]);

      let cliente = client_name;
      if (!cliente) {
        const acc = await client.getAdAccount(account_id);
        cliente = (acc.name as string) ?? "Relatório Meta Ads";
      }

      const periodo = `${periodSince} a ${periodUntil}`;
      const accountReport = buildAccountReport(accountRows, periodo, cliente);
      const adsets = processMetaAdsets(adsetRows);
      const ads = processMetaAds(adRows);
      const demographics = processMetaDemographics(demoRows);
      const funil = buildMetaFunil(adsets, accountRows);

      // Top criativo do período (melhor resultado) com preview embutido.
      let topCriativo: TopCriativo | undefined;
      try {
        const topAd = [...ads].filter((a) => a.gasto > 0).sort((a, b) => b.resultado - a.resultado || b.gasto - a.gasto)[0];
        if (topAd?.ad_id) {
          const url = await client.getAdCreativeThumb(topAd.ad_id);
          topCriativo = {
            nome: topAd.nome,
            conjunto: topAd.conjunto,
            headlineLabel: topAd.headlineLabel,
            resultado: topAd.resultado,
            custo_resultado: topAd.custo_resultado,
            gasto: topAd.gasto,
            ctr: topAd.ctr,
            preview: url ? await imageToDataUri(url) : null,
          };
        }
      } catch {
        // sem destaque de criativo se falhar
      }

      // Totais da conta
      let totalImp = 0, totalReach = 0, totalCliques = 0, totalFreqWeight = 0;
      const toI = (v: unknown) => parseInt(String(v ?? "0"), 10) || 0;
      const toN = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
      for (const r of accountRows) {
        totalImp += toI(r.impressions);
        totalReach += toI(r.reach ?? "0");
        totalCliques += toI(r.clicks);
        totalFreqWeight += toN(r.frequency ?? "0") * toI(r.reach ?? "0");
      }
      const avgCTR = totalImp > 0 ? (totalCliques / totalImp) * 100 : 0;
      const avgCPM = totalImp > 0 ? (accountReport.totais.gasto / totalImp) * 1000 : 0;
      const avgFrequency = totalReach > 0 ? totalFreqWeight / totalReach : 0;

      // Comparação com o período anterior (padrão; opt-out comparar:false).
      const CONV_CATS = new Set(["lead_form", "messages", "sales"]);
      const resultadoDe = (rep: typeof accountReport) =>
        rep.campanhas.reduce((s, c) => s + (CONV_CATS.has(c.categoria) ? c.resultado : 0), 0);
      let comparacao: MetaReportComparison | undefined;
      const prevP = (args as { comparar?: boolean }).comparar !== false
        ? smartPreviousPeriod(periodSince, periodUntil)
        : null;
      if (prevP) {
        try {
          const prevRows = await client.getInsights({ level: "campaign", since: prevP.since, until: prevP.until, accountId: account_id });
          const prevReport = buildAccountReport(prevRows, `${prevP.since} a ${prevP.until}`);
          if (prevReport.totais.gasto > 0) {
            let pImp = 0, pClk = 0;
            for (const r of prevRows) { pImp += toI(r.impressions); pClk += toI(r.clicks); }
            const prevCtr = pImp > 0 ? (pClk / pImp) * 100 : 0;
            const curRes = resultadoDe(accountReport);
            const prevRes = resultadoDe(prevReport);
            const delta = (a: number, b: number) => ({ atual: a, anterior: b, pct: b > 0 ? ((a - b) / b) * 100 : null });
            const cpaOf = (g: number, res: number) => (res > 0 ? g / res : 0);
            comparacao = {
              periodo_anterior: `${prevP.since} a ${prevP.until}`,
              resultado: delta(curRes, prevRes),
              cpa: delta(cpaOf(accountReport.totais.gasto, curRes), cpaOf(prevReport.totais.gasto, prevRes)),
              ctr: delta(avgCTR, prevCtr),
              investimento: delta(accountReport.totais.gasto, prevReport.totais.gasto),
            };
          }
        } catch {
          // sem comparação se o período anterior falhar
        }
      }

      const leitura = [
        `Investimento total: ${moneyBR(accountReport.totais.gasto)} em ${accountReport.campanhas.filter(c => c.gasto > 0).length} campanhas ativas.`,
        ...accountReport.campanhas.slice(0, 3).map(c =>
          `${c.nome}: ${moneyBR(c.gasto)} · ${intBR(c.resultado)} ${c.headlineLabel.toLowerCase()} · ${c.resultado > 0 ? moneyBR(c.custo) : "sem conversões"}.`
        ),
      ];

      const proximosPassos = [
        `Revisar conjuntos com CPM acima de R$ 15 — pode indicar saturação de audiência.`,
        `Anúncios com frequência acima de 3,0 devem ser rotacionados ou pausados.`,
        `Confirmar no CRM se os resultados registrados na plataforma geram receita real.`,
      ];

      const notas = [
        "Resultados (leads, conversas, compras) são os eventos configurados nas campanhas — valide com o CRM.",
        "Cliques no link = inline_link_clicks, que exclui cliques no perfil e outras interações.",
        "Dados demográficos são estimados pela Meta com base em comportamento e perfil — não são exatos.",
      ];

      const html = renderMetaReportHtml({
        cliente,
        periodo,
        comparacao,
        topCriativo,
        campanhas: accountReport.campanhas,
        totais: { gasto: accountReport.totais.gasto, totalImpressions: totalImp, totalReach, totalCliques, avgCTR, avgCPM, avgFrequency },
        leitura,
        proximosPassos,
        notas,
        adsets,
        ads,
        demographics,
        funil,
      });
      return renderHtmlPdfToolResponse(html, cliente, formato, accountReport.mensagem);
    }
  );

  // ─── Relatório CPL Beco Mágico (todas as unidades, junho 2026) ───────────────

  server.tool(
    "meta_generate_beco_magico_cpl_report",
    "[TOOL DE CLIENTE ÚNICO — não reutilizável para outras contas] Gera relatório de CPL e estimativa de investimento das 5 unidades do Beco Mágico (Natal, João Pessoa, Recife, Manaus e Goiânia) para junho de 2026, com projeção de investimento para faturar R$120k por unidade considerando escala de +35% no CPL. Números e período são fixos no código, não parametrizáveis. formato='pdf' (padrão) ou 'html'.",
    { ...FORMATO_SCHEMA },
    async (args) => {
      const formato = (args.formato ?? args.format ?? "pdf") as "pdf" | "html";
      const html = renderBecoCplHtml();
      return renderHtmlPdfToolResponse(html, "beco-magico-cpl-junho-2026", formato);
    }
  );

  // ─── WhatsApp via Evolution API ─────────────────────────────────────────────

  server.tool(
    "send_whatsapp_message",
    "Envia apenas texto via WhatsApp (sem arquivo). Use somente quando NÃO houver PDF para enviar junto.",
    {
      phone: z.string().describe("Número do destinatário com DDI+DDD, só dígitos (ex: 5583999999999)."),
      message: z.string().describe("Texto completo da mensagem a enviar."),
    },
    async (args) => {
      const baseUrl = (process.env.EVOLUTION_URL ?? "https://evolution.rwsolucoesdigitais.com").replace(/\/$/, "");
      const instance = process.env.EVOLUTION_INSTANCE ?? "RWSL";
      const apiKey = process.env.EVOLUTION_API_KEY;
      if (!apiKey) return toolError("EVOLUTION_API_KEY não configurada no servidor.");

      const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: args.phone, text: args.message }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        return toolError(`Evolution API retornou ${res.status}: ${body}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const key = data.key as Record<string, unknown> | undefined;
      const msgId = key?.id ?? data.id ?? "ok";
      return json({ enviado: true, messageId: msgId, destinatario: args.phone });
    }
  );

  server.tool(
    "send_whatsapp_report",
    "Envia relatório via WhatsApp em UMA única mensagem: o PDF chega como arquivo e o texto do relatório vai como legenda. Use SEMPRE que houver PDF para enviar — nunca chame send_whatsapp_message separado antes deste.",
    {
      phone: z.string().describe("Número do destinatário com DDI+DDD, só dígitos (ex: 5584996463570)."),
      message: z.string().describe("Texto completo da mensagem (métricas + resumo). Vai como legenda do arquivo."),
      document_url: z.string().describe("URL pública do PDF gerado (link do Vercel Blob)."),
      filename: z.string().describe("Nome do arquivo que aparece no WhatsApp (ex: relatorio-cao-sabido-junho.pdf)."),
    },
    async (args) => {
      const baseUrl = (process.env.EVOLUTION_URL ?? "https://evolution.rwsolucoesdigitais.com").replace(/\/$/, "");
      const instance = process.env.EVOLUTION_INSTANCE ?? "RWSL";
      const apiKey = process.env.EVOLUTION_API_KEY;
      if (!apiKey) return toolError("EVOLUTION_API_KEY não configurada no servidor.");

      const res = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          number: args.phone,
          mediatype: "document",
          media: args.document_url,
          fileName: args.filename,
          caption: args.message,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        return toolError(`Evolution API retornou ${res.status}: ${body}`);
      }

      const data = await res.json() as Record<string, unknown>;
      const key = data.key as Record<string, unknown> | undefined;
      const msgId = key?.id ?? data.id ?? "ok";
      return json({ enviado: true, messageId: msgId, destinatario: args.phone, arquivo: args.filename });
    }
  );

  // ─── Base de clientes (webhook n8n) ─────────────────────────────────────────

  const CLIENT_NAME_LOOKUP_SCHEMA = {
    nome_cliente: z.string().optional().describe("Nome do cliente para buscar na base (match parcial, ignora acentos). Quando informado, os IDs de conta Meta e Google são resolvidos automaticamente."),
    nomeCliente: z.string().optional().describe("Alias de nome_cliente."),
    cliente: z.string().optional().describe("Alias de nome_cliente."),
    client: z.string().optional().describe("Alias de nome_cliente."),
  };

  function clientNameLookup(args: Record<string, unknown>): string | undefined {
    return (
      (args.nome_cliente ?? args.nomeCliente ?? args.cliente ?? args.client) as string | undefined
    );
  }

  if (clientsConfigured()) {
    server.tool(
      "get_client_info",
      "Busca as informações de um cliente na base da Plugue: ID da conta Meta Ads, ID da conta Google Ads e JID do grupo WhatsApp. Use antes de pedir relatórios para resolver os IDs automaticamente pelo nome.",
      {
        ...CLIENT_NAME_LOOKUP_SCHEMA,
        listar_todos: z.boolean().optional().describe("Se true, retorna todos os clientes cadastrados."),
      },
      async (args) => {
        if (args.listar_todos) {
          return json(await loadClients());
        }
        const nome = clientNameLookup(args as Record<string, unknown>);
        if (!nome) return toolError("Informe nome_cliente ou use listar_todos=true.");
        const client = await findClient(nome);
        if (!client) return toolError(`Cliente "${nome}" não encontrado na base. Use listar_todos=true para ver todos.`);
        return json(client);
      }
    );
  }

  // ─── Google Ads ───────────────────────────────────────────────────────────────

  const GADS_CUSTOMER_SCHEMA = {
    customer_id: OPTIONAL_SCALAR.describe(
      "ID da conta Google Ads (somente números, sem traços). Use list_google_ads_accounts para descobrir."
    ),
    customerId: OPTIONAL_SCALAR.describe("Alias de customer_id."),
    google_customer_id: OPTIONAL_SCALAR.describe("Alias de customer_id."),
    googleCustomerId: OPTIONAL_SCALAR.describe("Alias de customer_id."),
    id_conta_google: OPTIONAL_SCALAR.describe("Alias de customer_id."),
    conta_id: OPTIONAL_SCALAR.describe("Alias de customer_id."),
    account_id: OPTIONAL_SCALAR.describe("Alias de customer_id."),
  };

  function gadsCustomerId(args: {
    customer_id?: string | number;
    customerId?: string | number;
    google_customer_id?: string | number;
    googleCustomerId?: string | number;
    id_conta_google?: string | number;
    conta_id?: string | number;
    account_id?: string | number;
  }): string | undefined {
    const raw =
      args.customer_id ??
      args.customerId ??
      args.google_customer_id ??
      args.googleCustomerId ??
      args.id_conta_google ??
      args.conta_id ??
      args.account_id;
    if (raw == null) return undefined;
    return String(raw).replace(/-/g, "").trim() || undefined;
  }

  if (googleAdsConfigured()) {
    // As tools qa_* são auxiliares de QA visual (uso interno antes do 1º envio).
    // Ficam ocultas por padrão para não poluir a lista que o modelo escolhe;
    // exponha com EXPOSE_QA_TOOLS=1.
    const exposeQa =
      process.env.EXPOSE_QA_TOOLS === "1" || process.env.EXPOSE_QA_TOOLS === "true";

    type IntegratedArgs = AccountIdArgs & PeriodArgs & DatePresetArgs & ClientNameArgs & {
      nome_cliente?: string;
      nomeCliente?: string;
      meta_account_id?: string | number;
      id_conta_meta_ads?: string | number;
      customer_id?: string | number;
      customerId?: string | number;
      google_customer_id?: string | number;
      googleCustomerId?: string | number;
      id_conta_google?: string | number;
      incluir_meta?: boolean;
      incluir_google?: boolean;
      incluir_keywords?: boolean;
      keywords?: boolean;
      incluir_termos_pesquisa?: boolean;
      termos_pesquisa?: boolean;
      limit_keywords?: number;
      limit_search_terms?: number;
      limit_termos_pesquisa?: number;
    };

    const INTEGRATED_SCHEMA = {
      ...CLIENT_NAME_LOOKUP_SCHEMA,
      ...CLIENT_NAME_SCHEMA,
      meta_account_id: OPTIONAL_SCALAR.describe("ID da conta Meta Ads. Alias de account_id para relatorio integrado."),
      id_conta_meta_ads: OPTIONAL_SCALAR.describe("Alias de meta_account_id."),
      account_id: OPTIONAL_SCALAR.describe("Alias de meta_account_id no relatorio integrado."),
      ad_account_id: OPTIONAL_SCALAR.describe("Alias de meta_account_id."),
      google_customer_id: OPTIONAL_SCALAR.describe("ID da conta Google Ads, sem tracos."),
      googleCustomerId: OPTIONAL_SCALAR.describe("Alias de google_customer_id."),
      customer_id: OPTIONAL_SCALAR.describe("Alias de google_customer_id."),
      customerId: OPTIONAL_SCALAR.describe("Alias de google_customer_id."),
      id_conta_google: OPTIONAL_SCALAR.describe("Alias de google_customer_id."),
      incluir_meta: z.boolean().optional().describe("Se false, nao busca Meta Ads."),
      incluir_google: z.boolean().optional().describe("Se false, nao busca Google Ads."),
      incluir_keywords: z.boolean().optional().describe("Inclui top keywords na leitura Google. Padrao: true."),
      keywords: z.boolean().optional().describe("Alias de incluir_keywords."),
      incluir_termos_pesquisa: z.boolean().optional().describe("Inclui termos de pesquisa reais. Padrao: true."),
      termos_pesquisa: z.boolean().optional().describe("Alias de incluir_termos_pesquisa."),
      limit_keywords: z.number().int().min(1).max(200).optional().describe("Limite de keywords analisadas (1–200). Padrao: 10."),
      limit_search_terms: z.number().int().min(1).max(200).optional().describe("Limite de termos de pesquisa (1–200). Padrao: 10."),
      limit_termos_pesquisa: z.number().int().min(1).max(200).optional().describe("Alias de limit_search_terms."),
      ...OPTIONAL_PERIOD_SCHEMA,
      ...DATE_PRESET_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
    };

    const GOOGLE_DETAILS_SCHEMA = {
      incluir_keywords: z.boolean().optional().describe("Inclui top keywords na leitura executiva. Padrao: true."),
      keywords: z.boolean().optional().describe("Alias de incluir_keywords."),
      incluir_termos_pesquisa: z.boolean().optional().describe("Inclui termos de pesquisa reais. Padrao: true."),
      termos_pesquisa: z.boolean().optional().describe("Alias de incluir_termos_pesquisa."),
      limit_keywords: z.number().int().min(1).max(200).optional().describe("Limite de keywords analisadas (1–200). Padrao: 10."),
      limit_search_terms: z.number().int().min(1).max(200).optional().describe("Limite de termos de pesquisa (1–200). Padrao: 10."),
      limit_termos_pesquisa: z.number().int().min(1).max(200).optional().describe("Alias de limit_search_terms."),
    };

    type GoogleDetailsArgs = {
      incluir_keywords?: boolean;
      keywords?: boolean;
      incluir_termos_pesquisa?: boolean;
      termos_pesquisa?: boolean;
      limit_keywords?: number;
      limit_search_terms?: number;
      limit_termos_pesquisa?: number;
    };

    async function fetchGoogleDetails(
      cid: string,
      since: string | undefined,
      until: string | undefined,
      datePreset: string | undefined,
      args: GoogleDetailsArgs,
      defaultOn = true
    ) {
      const includeKeywords = args.incluir_keywords ?? args.keywords ?? defaultOn;
      const includeTerms = args.incluir_termos_pesquisa ?? args.termos_pesquisa ?? defaultOn;
      const keywordLimit = args.limit_keywords ?? 10;
      const termsLimit = args.limit_search_terms ?? args.limit_termos_pesquisa ?? 10;
      const [keywords, searchTerms] = await Promise.all([
        includeKeywords
          ? getGoogleAdsKeywords(cid, since, until, datePreset, keywordLimit)
          : Promise.resolve([]),
        includeTerms
          ? getGoogleAdsSearchTerms(cid, since, until, datePreset, termsLimit)
          : Promise.resolve([]),
      ]);
      return { keywords, searchTerms };
    }

    function integratedMetaAccountId(
      args: IntegratedArgs,
      record?: { id_conta_meta_ads?: string }
    ): string | undefined {
      return scalarToString(
        args.meta_account_id ??
          args.id_conta_meta_ads ??
          accountIdFrom(args) ??
          record?.id_conta_meta_ads
      );
    }

    function integratedGoogleCustomerId(
      args: IntegratedArgs,
      record?: { id_conta_google?: string }
    ): string | undefined {
      const raw =
        args.google_customer_id ??
        args.googleCustomerId ??
        args.customer_id ??
        args.customerId ??
        args.id_conta_google ??
        record?.id_conta_google;
      if (raw == null) return undefined;
      return String(raw).replace(/-/g, "").trim() || undefined;
    }

    async function buildIntegratedPayload(
      args: IntegratedArgs,
      includeDaily = false
    ): Promise<{
      report: IntegratedReport;
      metaDaily?: DailyPoint[];
      googleDaily?: Awaited<ReturnType<typeof getGoogleAdsDailySeries>>;
    }> {
      const lookupName = clientNameLookup(args as Record<string, unknown>);
      const record =
        lookupName && clientsConfigured()
          ? await findClient(lookupName)
          : undefined;
      if (lookupName && clientsConfigured() && !record) {
        throw new Error(`Cliente "${lookupName}" nao encontrado na base.`);
      }

      const clientName =
        clientNameFrom(args) ??
        record?.nome_cliente ??
        lookupName ??
        "Relatorio integrado";
      const { since, until } = periodFrom(args);
      const datePreset = datePresetFrom(args);
      const periodLabel = periodLabelFrom(since, until, datePreset);
      const wantsMeta = args.incluir_meta ?? true;
      const wantsGoogle = args.incluir_google ?? true;
      const metaAccountId = integratedMetaAccountId(args, record);
      const googleCustomerId = integratedGoogleCustomerId(args, record);
      let metaReport: MetaAccountReportLike | undefined;
      let googleReport: GoogleAdsEnhancedReport | undefined;
      let metaDaily: DailyPoint[] | undefined;
      let googleDaily: Awaited<ReturnType<typeof getGoogleAdsDailySeries>> | undefined;

      if (wantsMeta && metaAccountId) {
        const [rows, dailyRows] = await Promise.all([
          client.getInsights({ level: "campaign", since, until, datePreset, accountId: metaAccountId }),
          includeDaily
            ? client.getInsights({
                level: "campaign",
                since,
                until,
                datePreset,
                timeIncrement: 1,
                accountId: metaAccountId,
              })
            : Promise.resolve([]),
        ]);
        metaReport = buildAccountReport(rows, periodLabel) as MetaAccountReportLike;
        if (includeDaily) metaDaily = buildDailySeries(dailyRows) as DailyPoint[];
      }

      if (wantsGoogle && googleCustomerId) {
        const [rawGoogle, dailyRows, details] = await Promise.all([
          getGoogleAdsAccountReport(googleCustomerId, since, until, datePreset),
          includeDaily
            ? getGoogleAdsDailySeries(googleCustomerId, since, until, datePreset)
            : Promise.resolve([]),
          fetchGoogleDetails(googleCustomerId, since, until, datePreset, args),
        ]);
        const niche = resolveNiche(record?.nicho, clientContexto(record)).niche;
        const month = until ? Number(until.slice(5, 7)) || undefined : undefined;
        googleReport = buildGoogleAdsReport(rawGoogle, { clientName, ...details, niche, month });
        if (includeDaily) googleDaily = dailyRows;
      }

      if (!metaReport && !googleReport) {
        throw new Error(
          "Nao foi possivel montar o relatorio: informe nome_cliente com IDs cadastrados ou passe meta_account_id/google_customer_id."
        );
      }

      return {
        report: buildIntegratedReport({
          clientName,
          periodLabel,
          metaReport,
          googleReport,
        }),
        metaDaily,
        googleDaily,
      };
    }

    server.tool(
      "list_google_ads_accounts",
      "Lista todas as contas Google Ads acessíveis pelo MCC configurado. Use para descobrir os IDs de cada conta antes de buscar relatórios.",
      { ...COMMON_COMPAT_SCHEMA },
      async () => json(await listGoogleAdsAccounts())
    );

    server.tool(
      "get_google_ads_account_report",
      `Relatório consolidado de uma conta Google Ads: resumo (gasto, impressões, cliques, conversões, CTR, CPC médio, custo por conversão), campanhas, leitura executiva e mensagem pronta.
Passe customer_id (ID da conta, sem traços). Sem período: usa últimos 30 dias.
Keywords e termos de pesquisa vêm desligados por padrão (mais rápido); ligue com incluir_keywords/incluir_termos_pesquisa quando quiser o detalhamento.`,
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...CLIENT_NAME_SCHEMA,
        ...GOOGLE_DETAILS_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const datePreset = datePresetFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const [report, details] = await Promise.all([
          getGoogleAdsAccountReport(cid, since, until, datePreset),
          fetchGoogleDetails(cid, since, until, datePreset, args, false),
        ]);
        return json(buildGoogleAdsReport(report, { clientName: clientNameFrom(args), ...details }));
      }
    );

    server.tool(
      "get_google_ads_account_comparison",
      `Comparativo de periodo do Google Ads. Busca periodo atual e periodo anterior, calcula variacoes de gasto, conversoes, CPA, cliques, CTR, CPC e compara campanhas por ID.`,
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMPARE_PERIOD_SCHEMA,
        ...CLIENT_NAME_SCHEMA,
        ...GOOGLE_DETAILS_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const datePreset = datePresetFrom(args);
        const compare = comparePeriodFrom(args);
        const compareSince = requireValue(compare.since, "compare_since");
        const compareUntil = requireValue(compare.until, "compare_until");
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const [current, previous, details] = await Promise.all([
          getGoogleAdsAccountReport(cid, since, until, datePreset),
          getGoogleAdsAccountReport(cid, compareSince, compareUntil),
          fetchGoogleDetails(cid, since, until, datePreset, args),
        ]);
        return json(buildGoogleAdsComparison(current, previous, { clientName: clientNameFrom(args), ...details }));
      }
    );

    server.tool(
      "generate_google_ads_comparison_report_pdf",
      "Gera PDF comparativo do Google Ads entre periodo atual e anterior.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMPARE_PERIOD_SCHEMA,
        ...CLIENT_NAME_SCHEMA,
        ...GOOGLE_DETAILS_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const datePreset = datePresetFrom(args);
        const compare = comparePeriodFrom(args);
        const compareSince = requireValue(compare.since, "compare_since");
        const compareUntil = requireValue(compare.until, "compare_until");
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const [current, previous, details] = await Promise.all([
          getGoogleAdsAccountReport(cid, since, until, datePreset),
          getGoogleAdsAccountReport(cid, compareSince, compareUntil),
          fetchGoogleDetails(cid, since, until, datePreset, args),
        ]);
        const comparison = buildGoogleAdsComparison(current, previous, {
          clientName: clientNameFrom(args),
          ...details,
        });
        const model = buildGoogleComparisonPdfModel(comparison);
        return renderPdfToolResponse(model, comparison.cliente ?? `Google Ads ${cid}`);
      }
    );

    if (exposeQa) server.tool(
      "qa_google_ads_comparison_report_pdf",
      "Executa QA visual do PDF comparativo Google Ads sem salvar arquivo.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMPARE_PERIOD_SCHEMA,
        ...CLIENT_NAME_SCHEMA,
        ...GOOGLE_DETAILS_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const datePreset = datePresetFrom(args);
        const compare = comparePeriodFrom(args);
        const compareSince = requireValue(compare.since, "compare_since");
        const compareUntil = requireValue(compare.until, "compare_until");
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const [current, previous, details] = await Promise.all([
          getGoogleAdsAccountReport(cid, since, until, datePreset),
          getGoogleAdsAccountReport(cid, compareSince, compareUntil),
          fetchGoogleDetails(cid, since, until, datePreset, args),
        ]);
        const comparison = buildGoogleAdsComparison(current, previous, {
          clientName: clientNameFrom(args),
          ...details,
        });
        return qaPdfToolResponse(buildGoogleComparisonPdfModel(comparison));
      }
    );

    server.tool(
      "generate_google_ads_report_pdf",
      "Gera relatório de Google Ads com resumo, campanhas, grupos de anúncio, keywords, ações de conversão e demográficos. formato='pdf' (entrega) ou 'html' (dashboard navegável).",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...CLIENT_NAME_SCHEMA,
        ...GOOGLE_DETAILS_SCHEMA,
        ...FORMATO_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
        comparar: z.boolean().optional().describe("Compara com o período anterior (padrão: true). Passe false para não comparar."),
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const datePreset = datePresetFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const [rawReport, dailyRows, details, adGroups, convActions, demographics] = await Promise.all([
          getGoogleAdsAccountReport(cid, since, until, datePreset),
          getGoogleAdsDailySeries(cid, since, until, datePreset),
          fetchGoogleDetails(cid, since, until, datePreset, args),
          getGoogleAdsAdGroups(cid, since, until, datePreset).catch(() => []),
          getGoogleAdsConversionActions(cid, since, until, datePreset).catch(() => []),
          getGoogleAdsDemographics(cid, since, until, datePreset).catch(() => ({ por_genero: [], por_faixa_etaria: [] })),
        ]);
        const report = buildGoogleAdsReport(rawReport, { clientName: clientNameFrom(args), ...details });

        // Comparação com o período anterior (padrão; opt-out comparar:false).
        let comparacao: GoogleReportComparison | undefined;
        const prev = (args as { comparar?: boolean }).comparar !== false
          ? smartPreviousPeriod(since, until)
          : null;
        if (prev) {
          try {
            const prevReport = await getGoogleAdsAccountReport(cid, prev.since, prev.until);
            const pr = prevReport.resumo;
            if (pr.gasto_total > 0 || pr.impressoes > 0) {
              const cr = rawReport.resumo;
              const delta = (a: number, b: number) => ({ atual: a, anterior: b, pct: b > 0 ? ((a - b) / b) * 100 : null });
              comparacao = {
                periodo_anterior: `${prev.since} a ${prev.until}`,
                gasto: delta(cr.gasto_total, pr.gasto_total),
                conversoes: delta(cr.conversoes, pr.conversoes),
                cpa: delta(cr.custo_por_conversao, pr.custo_por_conversao),
                ctr: delta(cr.ctr, pr.ctr),
              };
            }
          } catch {
            // sem comparação se o período anterior falhar
          }
        }

        const html = renderGoogleReportHtml(report, { adGroups, conversionActions: convActions, demographics, dailyRows, comparacao });
        return renderHtmlPdfToolResponse(html, report.cliente ?? `Google Ads ${cid}`, formatoFrom(args), report.mensagem);
      }
    );

    if (exposeQa) server.tool(
      "qa_google_ads_report_pdf",
      "Executa QA visual do PDF Google Ads sem salvar arquivo.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...CLIENT_NAME_SCHEMA,
        ...GOOGLE_DETAILS_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const datePreset = datePresetFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const [rawReport, dailyRows, details] = await Promise.all([
          getGoogleAdsAccountReport(cid, since, until, datePreset),
          getGoogleAdsDailySeries(cid, since, until, datePreset),
          fetchGoogleDetails(cid, since, until, datePreset, args),
        ]);
        const report = buildGoogleAdsReport(rawReport, { clientName: clientNameFrom(args), ...details });
        return qaPdfToolResponse(buildGooglePdfModel(report, dailyRows));
      }
    );

    server.tool(
      "get_client_performance_report",
      `Relatorio integrado por cliente. Quando houver nome_cliente na base, resolve IDs Meta Ads e Google Ads automaticamente; tambem aceita meta_account_id e google_customer_id explicitos.`,
      INTEGRATED_SCHEMA,
      async (args) => {
        return json((await buildIntegratedPayload(args as IntegratedArgs)).report);
      }
    );

    server.tool(
      "generate_integrated_report_pdf",
      "Gera relatório integrado COMPLETO com Meta Ads e Google Ads — todas as páginas de cada canal (3 Google + 4 Meta) mais resumo consolidado e fechamento tático. formato='pdf' (entrega) ou 'html' (dashboard navegável).",
      { ...INTEGRATED_SCHEMA, ...FORMATO_SCHEMA },
      async (args) => {
        const lookupName = clientNameLookup(args as Record<string, unknown>);
        const record = lookupName && clientsConfigured() ? await findClient(lookupName) : undefined;
        if (lookupName && clientsConfigured() && !record) {
          throw new Error(`Cliente "${lookupName}" nao encontrado na base.`);
        }
        const clientName = clientNameFrom(args) ?? record?.nome_cliente ?? lookupName ?? "Relatório integrado";
        const { since, until } = periodFrom(args);
        const datePreset = datePresetFrom(args);
        const periodLabel = periodLabelFrom(since, until, datePreset);
        const iArgs = args as IntegratedArgs;
        const wantsMeta = iArgs.incluir_meta ?? true;
        const wantsGoogle = iArgs.incluir_google ?? true;
        const metaAccountId = integratedMetaAccountId(iArgs, record);
        const googleCustomerId = integratedGoogleCustomerId(iArgs, record);
        const formato = formatoFrom(args as { formato?: string; format?: string });
        const toI = (v: unknown) => parseInt(String(v ?? "0"), 10) || 0;
        const toN = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

        let metaReport: MetaAccountReportLike | undefined;
        let metaAdsets: ReturnType<typeof processMetaAdsets> = [];
        let metaAds: ReturnType<typeof processMetaAds> = [];
        let metaDemographics: ReturnType<typeof processMetaDemographics> = { por_genero: [], por_faixa_etaria: [] };
        let metaFunil: ReturnType<typeof buildMetaFunil> = { alcance: 0, cliques: 0, cliques_link: 0, meta_label: "", meta_valor: 0 };
        let metaComparacao: MetaReportComparison | undefined;
        let topCriativo: TopCriativo | undefined;
        let metaTotaisExt = { totalImp: 0, totalReach: 0, totalCliques: 0, avgCTR: 0, avgCPM: 0, avgFrequency: 0 };

        let googleReport: GoogleAdsEnhancedReport | undefined;
        let googleAdGroups: Awaited<ReturnType<typeof getGoogleAdsAdGroups>> = [];
        let googleConvActions: Awaited<ReturnType<typeof getGoogleAdsConversionActions>> = [];
        let googleDemographics: Awaited<ReturnType<typeof getGoogleAdsDemographics>> = { por_genero: [], por_faixa_etaria: [] };
        let googleComparacao: GoogleReportComparison | undefined;

        if (wantsMeta && metaAccountId) {
          const [accountRows, adsetRows, adRows, demoRows] = await Promise.all([
            client.getInsights({ level: "campaign", since, until, datePreset, accountId: metaAccountId }),
            client.getInsights({ level: "adset", since, until, datePreset, accountId: metaAccountId }).catch(() => []),
            client.getInsights({ level: "ad", since, until, datePreset, accountId: metaAccountId }).catch(() => []),
            client.getInsights({ level: "account", since, until, datePreset, accountId: metaAccountId, breakdowns: ["gender", "age"] }).catch(() => []),
          ]);
          metaReport = buildAccountReport(accountRows, periodLabel) as MetaAccountReportLike;
          metaAdsets = processMetaAdsets(adsetRows);
          metaAds = processMetaAds(adRows);
          metaDemographics = processMetaDemographics(demoRows);
          metaFunil = buildMetaFunil(metaAdsets, accountRows);
          try {
            const topAd = [...metaAds].filter((a) => a.gasto > 0).sort((a, b) => b.resultado - a.resultado || b.gasto - a.gasto)[0];
            if (topAd?.ad_id) {
              const url = await client.getAdCreativeThumb(topAd.ad_id);
              topCriativo = {
                nome: topAd.nome,
                conjunto: topAd.conjunto,
                headlineLabel: topAd.headlineLabel,
                resultado: topAd.resultado,
                custo_resultado: topAd.custo_resultado,
                gasto: topAd.gasto,
                ctr: topAd.ctr,
                preview: url ? await imageToDataUri(url) : null,
              };
            }
          } catch { /* sem criativo */ }
          let totalImp = 0, totalReach = 0, totalCliques = 0, totalFreqWeight = 0;
          for (const r of accountRows) {
            totalImp += toI(r.impressions);
            totalReach += toI(r.reach ?? "0");
            totalCliques += toI(r.clicks);
            totalFreqWeight += toN(r.frequency ?? "0") * toI(r.reach ?? "0");
          }
          const avgCTR = totalImp > 0 ? (totalCliques / totalImp) * 100 : 0;
          const avgCPM = totalImp > 0 ? (metaReport.totais.gasto / totalImp) * 1000 : 0;
          const avgFrequency = totalReach > 0 ? totalFreqWeight / totalReach : 0;
          metaTotaisExt = { totalImp, totalReach, totalCliques, avgCTR, avgCPM, avgFrequency };
          const CONV_CATS = new Set(["lead_form", "messages", "sales"]);
          const resultadoDe = (rep: typeof metaReport) =>
            rep!.campanhas.reduce((s, c) => s + (CONV_CATS.has(c.categoria) ? c.resultado : 0), 0);
          const prevMeta = smartPreviousPeriod(since, until);
          if (prevMeta) {
            try {
              const prevRows = await client.getInsights({ level: "campaign", since: prevMeta.since, until: prevMeta.until, accountId: metaAccountId });
              const prevReport = buildAccountReport(prevRows, `${prevMeta.since} a ${prevMeta.until}`);
              if (prevReport.totais.gasto > 0) {
                let pImp = 0, pClk = 0;
                for (const r of prevRows) { pImp += toI(r.impressions); pClk += toI(r.clicks); }
                const prevCtr = pImp > 0 ? (pClk / pImp) * 100 : 0;
                const curRes = resultadoDe(metaReport);
                const prevRes = resultadoDe(prevReport as typeof metaReport);
                const delta = (a: number, b: number) => ({ atual: a, anterior: b, pct: b > 0 ? ((a - b) / b) * 100 : null });
                const cpaOf = (g: number, res: number) => (res > 0 ? g / res : 0);
                metaComparacao = {
                  periodo_anterior: `${prevMeta.since} a ${prevMeta.until}`,
                  resultado: delta(curRes, prevRes),
                  cpa: delta(cpaOf(metaReport!.totais.gasto, curRes), cpaOf(prevReport.totais.gasto, prevRes)),
                  ctr: delta(avgCTR, prevCtr),
                  investimento: delta(metaReport!.totais.gasto, prevReport.totais.gasto),
                };
              }
            } catch { /* sem comparação */ }
          }
        }

        if (wantsGoogle && googleCustomerId) {
          const niche = resolveNiche(record?.nicho, clientContexto(record)).niche;
          const month = until ? Number(until.slice(5, 7)) || undefined : undefined;
          const [rawGoogle, details, adGroups, convActions, demographics] = await Promise.all([
            getGoogleAdsAccountReport(googleCustomerId, since, until, datePreset),
            fetchGoogleDetails(googleCustomerId, since, until, datePreset, args, true),
            getGoogleAdsAdGroups(googleCustomerId, since, until, datePreset).catch(() => []),
            getGoogleAdsConversionActions(googleCustomerId, since, until, datePreset).catch(() => []),
            getGoogleAdsDemographics(googleCustomerId, since, until, datePreset).catch(() => ({ por_genero: [], por_faixa_etaria: [] })),
          ]);
          googleReport = buildGoogleAdsReport(rawGoogle, { clientName, ...details, niche, month });
          googleAdGroups = adGroups;
          googleConvActions = convActions;
          googleDemographics = demographics;
          const prevGoogle = smartPreviousPeriod(since, until);
          if (prevGoogle) {
            try {
              const prevReport = await getGoogleAdsAccountReport(googleCustomerId, prevGoogle.since, prevGoogle.until);
              const pr = prevReport.resumo;
              if (pr.gasto_total > 0 || pr.impressoes > 0) {
                const cr = rawGoogle.resumo;
                const delta = (a: number, b: number) => ({ atual: a, anterior: b, pct: b > 0 ? ((a - b) / b) * 100 : null });
                googleComparacao = {
                  periodo_anterior: `${prevGoogle.since} a ${prevGoogle.until}`,
                  gasto: delta(cr.gasto_total, pr.gasto_total),
                  conversoes: delta(cr.conversoes, pr.conversoes),
                  cpa: delta(cr.custo_por_conversao, pr.custo_por_conversao),
                  ctr: delta(cr.ctr, pr.ctr),
                };
              }
            } catch { /* sem comparação */ }
          }
        }

        if (!metaReport && !googleReport) {
          throw new Error("Nao foi possivel montar o relatorio: informe nome_cliente com IDs cadastrados ou passe meta_account_id/google_customer_id.");
        }

        const integratedReport = buildIntegratedReport({ clientName, periodLabel, metaReport, googleReport });
        const model = buildIntegratedPdfModel({ report: integratedReport });

        let googleFragment = "";
        let metaFragment = "";

        if (googleReport) {
          googleFragment = renderGooglePagesFragment(googleReport, {
            adGroups: googleAdGroups,
            conversionActions: googleConvActions,
            demographics: googleDemographics,
            comparacao: googleComparacao,
          });
        }

        if (metaReport) {
          const leitura = [
            `Investimento total: ${moneyBR(metaReport.totais.gasto)} em ${metaReport.campanhas.filter(c => c.gasto > 0).length} campanhas ativas.`,
            ...metaReport.campanhas.slice(0, 3).map(c =>
              `${c.nome}: ${moneyBR(c.gasto)} · ${intBR(c.resultado)} ${c.headlineLabel.toLowerCase()} · ${c.resultado > 0 ? moneyBR(c.custo) : "sem conversões"}.`
            ),
          ];
          const metaParams: MetaPdfParams = {
            cliente: clientName,
            periodo: periodLabel,
            campanhas: metaReport.campanhas,
            totais: {
              gasto: metaReport.totais.gasto,
              totalImpressions: metaTotaisExt.totalImp,
              totalReach: metaTotaisExt.totalReach,
              totalCliques: metaTotaisExt.totalCliques,
              avgCTR: metaTotaisExt.avgCTR,
              avgCPM: metaTotaisExt.avgCPM,
              avgFrequency: metaTotaisExt.avgFrequency,
            },
            adsets: metaAdsets,
            ads: metaAds,
            demographics: metaDemographics,
            funil: metaFunil,
            leitura,
            comparacao: metaComparacao,
            topCriativo,
            proximosPassos: [
              "Revisar conjuntos com CPM acima de R$ 15 — pode indicar saturação de audiência.",
              "Anúncios com frequência acima de 3,0 devem ser rotacionados ou pausados.",
              "Confirmar no CRM se os resultados registrados na plataforma geram receita real.",
            ],
            notas: [
              "Resultados (leads, conversas, compras) são os eventos configurados nas campanhas — valide com o CRM.",
              "Cliques no link = inline_link_clicks, que exclui cliques no perfil e outras interações.",
              "Dados demográficos são estimados pela Meta com base em comportamento e perfil — não são exatos.",
            ],
          };
          metaFragment = renderMetaPagesFragment(metaParams);
        }

        const html = renderIntegratedFullHtml(model, googleFragment, metaFragment, GOOGLE_PDF_CSS + META_PDF_CSS);
        return renderHtmlPdfToolResponse(html, clientName, formato, integratedReport.mensagem);
      }
    );

    if (exposeQa) server.tool(
      "qa_integrated_report_pdf",
      "Executa QA visual do PDF integrado sem salvar arquivo.",
      INTEGRATED_SCHEMA,
      async (args) => {
        const payload = await buildIntegratedPayload(args as IntegratedArgs, true);
        const model = buildIntegratedPdfModel({
          report: payload.report,
          metaDaily: payload.metaDaily,
          googleDaily: payload.googleDaily,
        });
        return qaPdfToolResponse(model);
      }
    );

    server.tool(
      "get_client_performance_comparison",
      "Comparativo integrado por cliente entre periodo atual e anterior, mantendo Meta Ads e Google Ads separados.",
      {
        ...INTEGRATED_SCHEMA,
        ...COMPARE_PERIOD_SCHEMA,
      },
      async (args) => {
        const compare = comparePeriodFrom(args);
        const compareSince = requireValue(compare.since, "compare_since");
        const compareUntil = requireValue(compare.until, "compare_until");
        const previousArgs = {
          ...(args as Record<string, unknown>),
          since: compareSince,
          until: compareUntil,
          date_preset: undefined,
          datePreset: undefined,
          preset: undefined,
          period: undefined,
          periodo: undefined,
        } as IntegratedArgs;
        const [current, previous] = await Promise.all([
          buildIntegratedPayload(args as IntegratedArgs),
          buildIntegratedPayload(previousArgs),
        ]);
        return json(buildIntegratedComparisonReport({
          current: current.report,
          previous: previous.report,
        }));
      }
    );

    server.tool(
      "generate_integrated_comparison_report_pdf",
      "Gera PDF comparativo integrado com Meta Ads e Google Ads entre periodo atual e anterior.",
      {
        ...INTEGRATED_SCHEMA,
        ...COMPARE_PERIOD_SCHEMA,
      },
      async (args) => {
        const compare = comparePeriodFrom(args);
        const compareSince = requireValue(compare.since, "compare_since");
        const compareUntil = requireValue(compare.until, "compare_until");
        const previousArgs = {
          ...(args as Record<string, unknown>),
          since: compareSince,
          until: compareUntil,
          date_preset: undefined,
          datePreset: undefined,
          preset: undefined,
          period: undefined,
          periodo: undefined,
        } as IntegratedArgs;
        const [current, previous] = await Promise.all([
          buildIntegratedPayload(args as IntegratedArgs),
          buildIntegratedPayload(previousArgs),
        ]);
        const comparison = buildIntegratedComparisonReport({
          current: current.report,
          previous: previous.report,
        });
        const model = buildIntegratedComparisonPdfModel(comparison);
        return renderPdfToolResponse(model, comparison.cliente);
      }
    );

    if (exposeQa) server.tool(
      "qa_integrated_comparison_report_pdf",
      "Executa QA visual do PDF comparativo integrado sem salvar arquivo.",
      {
        ...INTEGRATED_SCHEMA,
        ...COMPARE_PERIOD_SCHEMA,
      },
      async (args) => {
        const compare = comparePeriodFrom(args);
        const compareSince = requireValue(compare.since, "compare_since");
        const compareUntil = requireValue(compare.until, "compare_until");
        const previousArgs = {
          ...(args as Record<string, unknown>),
          since: compareSince,
          until: compareUntil,
          date_preset: undefined,
          datePreset: undefined,
          preset: undefined,
          period: undefined,
          periodo: undefined,
        } as IntegratedArgs;
        const [current, previous] = await Promise.all([
          buildIntegratedPayload(args as IntegratedArgs),
          buildIntegratedPayload(previousArgs),
        ]);
        const comparison = buildIntegratedComparisonReport({
          current: current.report,
          previous: previous.report,
        });
        return qaPdfToolResponse(buildIntegratedComparisonPdfModel(comparison));
      }
    );

    server.tool(
      "get_google_ads_campaigns",
      "Lista campanhas de uma conta Google Ads com métricas (gasto, cliques, conversões, CTR, CPC, custo por conversão, parcela de impressões).",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        return json(await getGoogleAdsCampaigns(cid, since, until, datePresetFrom(args)));
      }
    );

    server.tool(
      "get_google_ads_keywords",
      "Keywords de uma conta Google Ads ordenadas por gasto, com Quality Score e métricas de performance. Ideal para identificar termos caros, oportunidades de otimização de lance e problemas de qualidade.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        limit: z.number().int().min(1).max(100).optional().describe("Máximo de keywords retornadas (1–100). Padrão: 50."),
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        return json(await getGoogleAdsKeywords(cid, since, until, datePresetFrom(args), args.limit ?? 50));
      }
    );

    server.tool(
      "get_google_ads_daily_series",
      "Evolução dia a dia de uma conta Google Ads: gasto, cliques, impressões, conversões e CTR por data. Use para identificar picos, quedas e tendências no período.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        return json(await getGoogleAdsDailySeries(cid, since, until, datePresetFrom(args)));
      }
    );

    server.tool(
      "get_google_ads_ad_groups",
      "Métricas por grupo de anúncios (ad group) de uma conta Google Ads: gasto, cliques, impressões, conversões, CTR, CPC médio e CPA. Útil para analisar quais grupos performam melhor dentro de cada campanha.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        return json(await getGoogleAdsAdGroups(cid, since, until, datePresetFrom(args)));
      }
    );

    server.tool(
      "get_google_ads_location_targets",
      "Lê a segmentação geográfica configurada numa campanha Google Ads hoje (cidades/regiões/países incluídos ou excluídos). Complementa add_google_ads_location_target, que só escreve — esta lê o que já está configurado. Use para auditar se uma campanha está restrita à região certa antes de investigar leads fora da área de atuação.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        campaign_id: z.union([z.string(), z.number()]).describe("ID da campanha."),
        campaignId: z.union([z.string(), z.number()]).optional().describe("Alias de campaign_id."),
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const campaignId = (args as { campaign_id?: unknown; campaignId?: unknown }).campaign_id ?? (args as { campaignId?: unknown }).campaignId;
        return json(await getGoogleAdsLocationTargets(cid, requireValue(campaignId != null ? String(campaignId) : undefined, "campaign_id")));
      }
    );

    server.tool(
      "get_google_ads_hourly_breakdown",
      "Performance por hora do dia (0-23) de uma conta Google Ads: gasto, cliques, impressões, conversões e CTR agregados por hora. Útil para identificar os melhores horários para anunciar e otimizar o agendamento de anúncios.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        return json(await getGoogleAdsHourlyBreakdown(cid, since, until, datePresetFrom(args)));
      }
    );

    server.tool(
      "get_google_ads_keyword_ideas",
      "Keyword Planner do Google Ads: sugere palavras-chave relevantes com volume médio de buscas mensais, nível de competição, índice de competição e lance estimado de topo de página. Ideal para pesquisa de palavras-chave e planejamento de novas campanhas.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        keywords: z.array(z.string()).describe("Lista de palavras-chave ou temas para pesquisar ideias (ex: ['rastreamento veicular', 'rastreador gps'])"),
        idioma: z.string().optional().describe("Código do idioma (padrão: 'languageConstants/1014' = Português). Outros: 'languageConstants/1000' = Inglês."),
        geo: z.string().optional().describe("Código geográfico (padrão: 'geoTargetConstants/2076' = Brasil)."),
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const kws = (args as { keywords?: unknown }).keywords;
        if (!Array.isArray(kws) || kws.length === 0) {
          return { content: [{ type: "text" as const, text: "Parâmetro obrigatório: keywords (array de strings não vazio)." }] };
        }
        const idioma = (args as { idioma?: string }).idioma;
        const geo    = (args as { geo?: string }).geo;
        return json(await getGoogleAdsKeywordIdeas(cid, kws as string[], idioma, geo));
      }
    );

    server.tool(
      "get_google_ads_search_terms",
      "Termos de pesquisa reais que acionaram os anúncios de uma conta Google Ads: mostra exatamente o que os usuários digitaram, com gasto, cliques, impressões, conversões, CTR e CPC por termo. Ideal para encontrar negativar palavras irrelevantes ou adicionar novas keywords com bom desempenho.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        return json(await getGoogleAdsSearchTerms(cid, since, until, datePresetFrom(args)));
      }
    );

    server.tool(
      "get_google_ads_ad_copy",
      "Conteúdo real dos anúncios (RSA) de uma conta Google Ads: todas as headlines e descriptions cadastradas (com indicação de qual está fixada/pinada em posição específica), URL final e paths de exibição. Diferente de get_google_ads_ads (que só traz métricas) — esta tool traz o texto do anúncio em si. Filtre por campaign_id e/ou ad_group_id para não trazer a conta inteira.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        campaign_id: z.union([z.string(), z.number()]).optional().describe("Filtrar por ID da campanha."),
        campaignId: z.union([z.string(), z.number()]).optional().describe("Alias de campaign_id."),
        ad_group_id: z.union([z.string(), z.number()]).optional().describe("Filtrar por ID do ad group."),
        adGroupId: z.union([z.string(), z.number()]).optional().describe("Alias de ad_group_id."),
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const campaignId = (args as { campaign_id?: unknown; campaignId?: unknown }).campaign_id ?? (args as { campaignId?: unknown }).campaignId;
        const adGroupId = (args as { ad_group_id?: unknown; adGroupId?: unknown }).ad_group_id ?? (args as { adGroupId?: unknown }).adGroupId;
        return json(
          await getGoogleAdsAdCopy(
            cid,
            campaignId != null ? String(campaignId) : undefined,
            adGroupId != null ? String(adGroupId) : undefined
          )
        );
      }
    );

    server.tool(
      "get_google_ads_ad_asset_performance",
      "Performance individual de cada headline/description dentro dos anúncios RSA (via ad_group_ad_asset_view) — mostra qual título ou descrição específica teve melhor CTR/impressões/cliques, diferente das métricas agregadas do anúncio inteiro. Use pra decidir quais headlines/descriptions manter, trocar ou usar como base pra novas variações.",
      {
        ...GADS_CUSTOMER_SCHEMA,
        campaign_id: z.union([z.string(), z.number()]).optional().describe("Filtrar por ID da campanha."),
        campaignId: z.union([z.string(), z.number()]).optional().describe("Alias de campaign_id."),
        ad_group_id: z.union([z.string(), z.number()]).optional().describe("Filtrar por ID do ad group."),
        adGroupId: z.union([z.string(), z.number()]).optional().describe("Alias de ad_group_id."),
        ...OPTIONAL_PERIOD_SCHEMA,
        ...DATE_PRESET_SCHEMA,
        limit: z.number().int().min(1).max(500).optional().describe("Máximo de linhas retornadas (1–500). Padrão: 100."),
        ...COMMON_COMPAT_SCHEMA,
      },
      async (args) => {
        const { since, until } = periodFrom(args);
        const cid = requireValue(gadsCustomerId(args), "customer_id");
        const campaignId = (args as { campaign_id?: unknown; campaignId?: unknown }).campaign_id ?? (args as { campaignId?: unknown }).campaignId;
        const adGroupId = (args as { ad_group_id?: unknown; adGroupId?: unknown }).ad_group_id ?? (args as { adGroupId?: unknown }).adGroupId;
        return json(
          await getGoogleAdsAdAssetPerformance(
            cid,
            campaignId != null ? String(campaignId) : undefined,
            adGroupId != null ? String(adGroupId) : undefined,
            since,
            until,
            datePresetFrom(args),
            (args as { limit?: number }).limit ?? 100
          )
        );
      }
    );

    // Camada de escrita do Google Ads (criação/edição/exclusão) — Search apenas,
    // mesma trava de confirmação usada no Meta.
    registerGoogleWriteTools(server);
  }

  // Camada do Google Business Profile (avaliações + postagens) — token próprio
  // (GOOGLE_BUSINESS_REFRESH_TOKEN), mesmo client OAuth do Google Ads.
  if (googleBusinessConfigured()) {
    registerGoogleBusinessTools(server);
  }

  // Camada de inteligência (diagnóstico + auditoria) — registrada à parte.
  registerIntelligenceTools(server, client);

  // Camada de escrita (criação/edição/duplicação) + targeting — com trava de confirmação.
  registerWriteTools(server, client);

  return server;
}
