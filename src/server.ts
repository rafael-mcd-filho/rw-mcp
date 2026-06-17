import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaAdsClient } from "./meta-api.js";
import { buildReport, buildAccountReport, buildPdfModel } from "./report.js";

const ACCOUNT_DESC =
  "ID da conta de anúncios (com ou sem 'act_'). Se omitido, usa a conta padrão configurada no servidor.";

const STATUS = z
  .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
  .describe("Filtrar por status");

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
  account_id: z.string().optional().describe(ACCOUNT_DESC),
  ad_account_id: z.string().optional().describe("Alias de account_id."),
  accountId: z.string().optional().describe("Alias de account_id."),
  META_AD_ACCOUNT_ID: z.string().optional().describe("Alias de account_id."),
};

const OPTIONAL_PERIOD_SCHEMA = {
  since: z.string().optional().describe("Data inicio YYYY-MM-DD"),
  until: z.string().optional().describe("Data fim YYYY-MM-DD"),
  start_date: z.string().optional().describe("Alias de since."),
  end_date: z.string().optional().describe("Alias de until."),
  date_start: z.string().optional().describe("Alias de since."),
  date_end: z.string().optional().describe("Alias de until."),
};

const CAMPAIGN_ID_SCHEMA = {
  campaign_id: z.string().optional().describe("ID da campanha"),
  campaignId: z.string().optional().describe("Alias de campaign_id."),
  CAMPAIGN_ID: z.string().optional().describe("Alias de campaign_id."),
};

const PIXEL_ID_SCHEMA = {
  pixel_id: z.string().optional().describe("ID do pixel/dataset"),
  pixelId: z.string().optional().describe("Alias de pixel_id."),
  PIXEL_ID: z.string().optional().describe("Alias de pixel_id."),
};

type AccountIdArgs = {
  account_id?: string;
  ad_account_id?: string;
  accountId?: string;
  META_AD_ACCOUNT_ID?: string;
};

type PeriodArgs = {
  since?: string;
  until?: string;
  start_date?: string;
  end_date?: string;
  date_start?: string;
  date_end?: string;
};

type CampaignIdArgs = {
  campaign_id?: string;
  campaignId?: string;
  CAMPAIGN_ID?: string;
};

type PixelIdArgs = {
  pixel_id?: string;
  pixelId?: string;
  PIXEL_ID?: string;
};

function accountIdFrom(args: AccountIdArgs): string | undefined {
  return args.account_id ?? args.ad_account_id ?? args.accountId ?? args.META_AD_ACCOUNT_ID;
}

function periodFrom(args: PeriodArgs): { since?: string; until?: string } {
  return {
    since: args.since ?? args.start_date ?? args.date_start,
    until: args.until ?? args.end_date ?? args.date_end,
  };
}

function campaignIdFrom(args: CampaignIdArgs): string | undefined {
  return args.campaign_id ?? args.campaignId ?? args.CAMPAIGN_ID;
}

function pixelIdFrom(args: PixelIdArgs): string | undefined {
  return args.pixel_id ?? args.pixelId ?? args.PIXEL_ID;
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
    {},
    async () => json(await client.getAdAccounts())
  );

  server.tool(
    "get_ad_account",
    "Informações de uma conta: nome, status, moeda, fuso, saldo e gasto total.",
    ACCOUNT_ID_SCHEMA,
    async (args) => json(await client.getAdAccount(accountIdFrom(args)))
  );

  // ─── Campanhas ──────────────────────────────────────────────────────────────

  server.tool(
    "list_campaigns",
    "Lista campanhas da conta. Filtre por status: ACTIVE, PAUSED, DELETED, ARCHIVED.",
    {
      status: STATUS.optional(),
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) =>
      json(await client.getCampaigns(args.status, accountIdFrom(args)))
  );

  server.tool(
    "get_campaign",
    "Detalhes de uma campanha específica pelo ID.",
    CAMPAIGN_ID_SCHEMA,
    async (args) => json(await client.getCampaign(requireValue(campaignIdFrom(args), "campaign_id")))
  );

  // ─── Conjuntos e Anúncios ─────────────────────────────────────────────────────

  server.tool(
    "list_adsets",
    "Lista conjuntos de anúncios. Pode filtrar por campanha e/ou status.",
    {
      ...CAMPAIGN_ID_SCHEMA,
      status: STATUS.optional(),
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) =>
      json(await client.getAdSets(campaignIdFrom(args), args.status, accountIdFrom(args)))
  );

  server.tool(
    "list_ads",
    "Lista anúncios. Pode filtrar por conjunto, campanha e/ou status.",
    {
      adset_id: z.string().optional().describe("ID do conjunto de anúncios"),
      adsetId: z.string().optional().describe("Alias de adset_id."),
      ...CAMPAIGN_ID_SCHEMA,
      status: STATUS.optional(),
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) =>
      json(await client.getAds(args.adset_id ?? args.adsetId, campaignIdFrom(args), args.status, accountIdFrom(args)))
  );

  // ─── Insights brutos ──────────────────────────────────────────────────────────

  server.tool(
    "get_insights",
    "Métricas cruas para UM período. Inclui spend, reach, frequency, actions, cost_per_action_type, action_values, ROAS, rankings e métricas de vídeo quando disponíveis.",
    {
      level: z.enum(["account", "campaign", "adset", "ad"]).describe("Nível de agregação"),
      entity_id: z.string().optional().describe("ID da entidade. Omita para a conta inteira."),
      entityId: z.string().optional().describe("Alias de entity_id."),
      ENTITY_ID: z.string().optional().describe("Alias de entity_id."),
      ...OPTIONAL_PERIOD_SCHEMA,
      date_preset: z.enum(DATE_PRESETS).optional().describe("Período pré-definido (padrão: last_30d)"),
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
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      const { since, until } = periodFrom(args);
      const entityId = args.entity_id ?? args.entityId ?? args.ENTITY_ID;

      return json(await client.getInsights({
        level: args.level,
        entityId,
        since,
        until,
        datePreset: args.date_preset,
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
    ACCOUNT_ID_SCHEMA,
    async (args) => json(await client.listPixels(accountIdFrom(args)))
  );

  server.tool(
    "get_pixel",
    "Detalhes de um pixel/dataset pelo ID. Apenas leitura.",
    PIXEL_ID_SCHEMA,
    async (args) => json(await client.getPixel(requireValue(pixelIdFrom(args), "pixel_id")))
  );

  server.tool(
    "get_pixel_events",
    "Resumo de eventos recebidos por um pixel no período informado.",
    {
      ...PIXEL_ID_SCHEMA,
      start: z.string().optional().describe("Data início YYYY-MM-DD ou timestamp Unix"),
      end: z.string().optional().describe("Data fim YYYY-MM-DD ou timestamp Unix"),
    },
    async (args) =>
      json(await client.getPixelEvents(requireValue(pixelIdFrom(args), "pixel_id"), { start: args.start, end: args.end }))
  );

  server.tool(
    "get_pixel_diagnostics",
    "Diagnóstico de saúde do pixel: último disparo, eventos recentes, automatic matching e problemas encontrados.",
    PIXEL_ID_SCHEMA,
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
      date_preset: z.enum(DATE_PRESETS).optional().describe("Alternativa a since/until (ex.: yesterday, last_7d)"),
      ...ACCOUNT_ID_SCHEMA,
    },
    async (args) => {
      const { since, until } = periodFrom(args);
      const rows = await client.getInsights({
        level: "campaign", since, until, datePreset: args.date_preset, accountId: accountIdFrom(args),
      });
      const periodoLabel =
        since && until ? `${since} → ${until}` : args.date_preset ?? "últimos 30 dias";
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
      client_name: z
        .string()
        .optional()
        .describe("Nome do cliente para o cabeçalho. Se omitido, usa o nome da conta."),
      clientName: z.string().optional().describe("Alias de client_name."),
      CLIENT_NAME: z.string().optional().describe("Alias de client_name."),
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
      const client_name = args.client_name ?? args.clientName ?? args.CLIENT_NAME;

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
