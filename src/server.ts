import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaAdsClient } from "./meta-api.js";
import { buildReport, buildAccountReport, buildPdfModel } from "./report.js";

const ACCOUNT_DESC =
  "ID da conta de anúncios (com ou sem 'act_'). Se omitido, usa a conta padrão configurada no servidor.";

const STATUS_VALUES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] as const;

const OPTIONAL_SCALAR = z.union([z.string(), z.number()]).optional();

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

export function createMcpServer(
  accessToken: string,
  adAccountId?: string,
  allowlist?: string[]
): McpServer {
  const client = new MetaAdsClient({ accessToken, adAccountId, allowlist });

  const server = new McpServer({ name: "rw-mcp", version: "1.0.0" });

  // ─── Contas ─────────────────────────────────────────────────────────────────

  server.tool(
    "list_ad_accounts",
    "Lista todas as contas de anúncios que o token tem acesso (id, nome, moeda, status). Use para descobrir o account_id de cada cliente.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async () => json(await client.getAdAccounts())
  );

  server.tool(
    "get_ad_account",
    "Informações de uma conta: nome, status, moeda, fuso, saldo e gasto total.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.getAdAccount(accountIdFrom(args)))
  );

  // ─── Campanhas ──────────────────────────────────────────────────────────────

  server.tool(
    "list_campaigns",
    "Lista campanhas da conta. Filtre por status: ACTIVE, PAUSED, DELETED, ARCHIVED.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) =>
      json(await client.getCampaigns(statusFrom(args), accountIdFrom(args)))
  );

  server.tool(
    "get_campaign",
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
    "list_adsets",
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
    "list_ads",
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

  // ─── Insights brutos ──────────────────────────────────────────────────────────

  server.tool(
    "get_insights",
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

      return json(await client.getInsights({
        level: args.level,
        entityId,
        since,
        until,
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
    "list_pixels",
    "Lista pixels/datasets vinculados à conta. Apenas leitura.",
    {
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.listPixels(accountIdFrom(args)))
  );

  server.tool(
    "get_pixel",
    "Detalhes de um pixel/dataset pelo ID. Apenas leitura.",
    {
      ...PIXEL_ID_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => json(await client.getPixel(requireValue(pixelIdFrom(args), "pixel_id")))
  );

  server.tool(
    "get_pixel_events",
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
    "get_pixel_diagnostics",
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
    "get_campaign_report",
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
    "get_account_report",
    `Relatório consolidado de TODAS as campanhas que rodaram no período, numa só chamada.
Detecta o objetivo de cada campanha e mostra o resultado certo de cada uma (leads, conversas, visitas, alcance...), com totais e custo por resultado. Ideal para "como foi a conta ontem / essa semana".`,
    {
      ...OPTIONAL_PERIOD_SCHEMA,
      ...DATE_PRESET_SCHEMA,
      ...CLIENT_NAME_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      const { since, until } = periodFrom(args);
      const rows = await client.getInsights({
        level: "campaign", since, until, datePreset: datePresetFrom(args), accountId: accountIdFrom(args),
      });
      const periodoLabel =
        since && until ? `${since} → ${until}` : datePresetFrom(args) ?? "últimos 30 dias";
      return json(buildAccountReport(rows, periodoLabel));
    }
  );

  // ─── Relatório em PDF ─────────────────────────────────────────────────────────

  server.tool(
    "generate_report_pdf",
    process.env.VERCEL
      ? "PDF ainda nao esta habilitado no deploy remoto. Use somente para receber essa orientacao; relatorios de analise devem usar get_account_report."
      : `Gera um relatório da conta em PDF com layout A4 paginado, prévia PNG, resumo executivo e leitura por objetivo. Retorna os caminhos dos arquivos.
Use quando o usuário pedir "relatório em PDF" de uma conta/cliente.`,
    {
      ...OPTIONAL_PERIOD_SCHEMA,
      ...CLIENT_NAME_SCHEMA,
      ...DATE_PRESET_SCHEMA,
      ...COMMON_COMPAT_SCHEMA,
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      if (process.env.VERCEL) {
        return toolError(
          "A geracao de PDF ainda nao esta habilitada no Vercel. Use get_account_report para relatorio de analise ou configure Chromium serverless antes de usar PDF em producao."
        );
      }

      const { since, until } = periodFrom(args);
      const periodSince = requireValue(since, "since");
      const periodUntil = requireValue(until, "until");
      const account_id = accountIdFrom(args);
      const client_name = clientNameFrom(args);

      // 1) Totais por campanha (tabela) e 2) série diária (gráfico)
      const [accountRows, dailyRows] = await Promise.all([
        client.getInsights({ level: "campaign", since: periodSince, until: periodUntil, accountId: account_id }),
        client.getInsights({
          level: "campaign", since: periodSince, until: periodUntil, timeIncrement: 1, accountId: account_id,
        }),
      ]);

      let cliente = client_name;
      if (!cliente) {
        const acc = await client.getAdAccount(account_id);
        cliente = (acc.name as string) ?? "Relatório Meta Ads";
      }

      const model = buildPdfModel(cliente, `${periodSince} a ${periodUntil}`, accountRows, dailyRows);
      const pdfModulePath = String.fromCharCode(46, 47, 112, 100, 102, 46, 106, 115);
      const { generatePdf } = (await import(pdfModulePath)) as {
        generatePdf: (model: ReturnType<typeof buildPdfModel>, clienteSlug: string) => Promise<{
          pdfPath: string;
          previewPath: string;
          pageCount: number;
        }>;
      };
      const result = await generatePdf(model, cliente);

      return {
        content: [
          {
            type: "text",
            text:
              `PDF gerado com sucesso:\n${result.pdfPath}\n\n` +
              `Prévia PNG:\n${result.previewPath}\n\n` +
              `Páginas: ${result.pageCount}`,
          },
        ],
      };
    }
  );

  return server;
}
