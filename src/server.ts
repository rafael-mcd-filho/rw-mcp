import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaAdsClient } from "./meta-api.js";
import { buildReport, buildAccountReport, buildPdfModel } from "./report.js";
import { generatePdf } from "./pdf.js";

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

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function createMcpServer(
  accessToken: string,
  adAccountId?: string,
  allowlist?: string[]
): McpServer {
  const client = new MetaAdsClient({ accessToken, adAccountId, allowlist });

  const server = new McpServer({ name: "meta-ads-mcp", version: "1.0.0" });

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
    { account_id: z.string().optional().describe(ACCOUNT_DESC) },
    async ({ account_id }) => json(await client.getAdAccount(account_id))
  );

  // ─── Campanhas ──────────────────────────────────────────────────────────────

  server.tool(
    "list_campaigns",
    "Lista campanhas da conta. Filtre por status: ACTIVE, PAUSED, DELETED, ARCHIVED.",
    {
      status: STATUS.optional(),
      account_id: z.string().optional().describe(ACCOUNT_DESC),
    },
    async ({ status, account_id }) =>
      json(await client.getCampaigns(status, account_id))
  );

  server.tool(
    "get_campaign",
    "Detalhes de uma campanha específica pelo ID.",
    { campaign_id: z.string().describe("ID da campanha") },
    async ({ campaign_id }) => json(await client.getCampaign(campaign_id))
  );

  // ─── Conjuntos e Anúncios ─────────────────────────────────────────────────────

  server.tool(
    "list_adsets",
    "Lista conjuntos de anúncios. Pode filtrar por campanha e/ou status.",
    {
      campaign_id: z.string().optional().describe("ID da campanha"),
      status: STATUS.optional(),
      account_id: z.string().optional().describe(ACCOUNT_DESC),
    },
    async ({ campaign_id, status, account_id }) =>
      json(await client.getAdSets(campaign_id, status, account_id))
  );

  server.tool(
    "list_ads",
    "Lista anúncios. Pode filtrar por conjunto, campanha e/ou status.",
    {
      adset_id: z.string().optional().describe("ID do conjunto de anúncios"),
      campaign_id: z.string().optional().describe("ID da campanha"),
      status: STATUS.optional(),
      account_id: z.string().optional().describe(ACCOUNT_DESC),
    },
    async ({ adset_id, campaign_id, status, account_id }) =>
      json(await client.getAds(adset_id, campaign_id, status, account_id))
  );

  // ─── Insights brutos ──────────────────────────────────────────────────────────

  server.tool(
    "get_insights",
    "Métricas cruas para UM período: spend, impressions, clicks, cpc, cpm, cpp, ctr, reach, actions e ThruPlay. Use para análises livres.",
    {
      level: z.enum(["account", "campaign", "adset", "ad"]).describe("Nível de agregação"),
      entity_id: z.string().optional().describe("ID da entidade. Omita para a conta inteira."),
      since: z.string().optional().describe("Data início YYYY-MM-DD"),
      until: z.string().optional().describe("Data fim YYYY-MM-DD"),
      date_preset: z.enum(DATE_PRESETS).optional().describe("Período pré-definido (padrão: last_30d)"),
      breakdown: z.enum(["age", "gender", "country", "region", "placement", "device_platform"]).optional(),
      account_id: z.string().optional().describe(ACCOUNT_DESC),
    },
    async ({ level, entity_id, since, until, date_preset, breakdown, account_id }) =>
      json(await client.getInsights({
        level, entityId: entity_id, since, until,
        datePreset: date_preset, breakdown, accountId: account_id,
      }))
  );

  // ─── Relatório de campanha (detecção automática de objetivo) ──────────────────

  server.tool(
    "get_campaign_report",
    `Relatório PRONTO de uma campanha, agregado e formatado.
Detecta o objetivo pelo nome ([MSG], [LEAD], [PERFIL], [VENDA], [REC], [ENG]) e pelo objective da Meta, escolhe o action_type de conversão e calcula CPA/CPL/CPC/CPM/CTR (e ThruPlay em reconhecimento).
Passe compare_since/compare_until para comparar dois períodos com variação %.`,
    {
      campaign_id: z.string().describe("ID da campanha"),
      since: z.string().describe("Início do período (YYYY-MM-DD)"),
      until: z.string().describe("Fim do período (YYYY-MM-DD)"),
      compare_since: z.string().optional().describe("Início da comparação (YYYY-MM-DD)"),
      compare_until: z.string().optional().describe("Fim da comparação (YYYY-MM-DD)"),
      action_type: z.string().optional().describe("Força um action_type de conversão. Auto se omitido."),
      account_id: z.string().optional().describe(ACCOUNT_DESC),
    },
    async ({ campaign_id, since, until, compare_since, compare_until, action_type }) => {
      const campaign = await client.getCampaign(campaign_id);
      const isComparison = Boolean(compare_since && compare_until);

      let rows;
      let comparisonRows;
      if (isComparison) {
        const result = await client.getInsightsComparison({
          level: "campaign", entityId: campaign_id, since, until,
          compareSince: compare_since, compareUntil: compare_until,
        });
        rows = result.period;
        comparisonRows = result.comparison;
      } else {
        rows = await client.getInsights({
          level: "campaign", entityId: campaign_id, since, until,
        });
      }

      return json(buildReport({
        campaignName: campaign.name,
        metaObjective: campaign.objective,
        rows, comparisonRows, actionTypeOverride: action_type,
      }));
    }
  );

  // ─── Relatório da conta inteira ───────────────────────────────────────────────

  server.tool(
    "get_account_report",
    `Relatório consolidado de TODAS as campanhas que rodaram no período, numa só chamada.
Detecta o objetivo de cada campanha e mostra o resultado certo de cada uma (leads, conversas, visitas, alcance...), com totais e custo por resultado. Ideal para "como foi a conta ontem / essa semana".`,
    {
      since: z.string().optional().describe("Início do período (YYYY-MM-DD)"),
      until: z.string().optional().describe("Fim do período (YYYY-MM-DD)"),
      date_preset: z.enum(DATE_PRESETS).optional().describe("Alternativa a since/until (ex.: yesterday, last_7d)"),
      account_id: z.string().optional().describe(ACCOUNT_DESC),
    },
    async ({ since, until, date_preset, account_id }) => {
      const rows = await client.getInsights({
        level: "campaign", since, until, datePreset: date_preset, accountId: account_id,
      });
      const periodoLabel =
        since && until ? `${since} → ${until}` : date_preset ?? "últimos 30 dias";
      return json(buildAccountReport(rows, periodoLabel));
    }
  );

  // ─── Relatório em PDF ─────────────────────────────────────────────────────────

  server.tool(
    "generate_report_pdf",
    `Gera um relatório da conta em PDF (cabeçalho, cards de resumo, gráfico de gasto/resultados por dia e tabela de campanhas) e salva no disco. Retorna o caminho do arquivo.
Use quando o usuário pedir "relatório em PDF" de uma conta/cliente.`,
    {
      since: z.string().describe("Início do período (YYYY-MM-DD)"),
      until: z.string().describe("Fim do período (YYYY-MM-DD)"),
      client_name: z
        .string()
        .optional()
        .describe("Nome do cliente para o cabeçalho. Se omitido, usa o nome da conta."),
      account_id: z.string().optional().describe(ACCOUNT_DESC),
    },
    async ({ since, until, client_name, account_id }) => {
      // 1) Totais por campanha (tabela) e 2) série diária (gráfico)
      const [accountRows, dailyRows] = await Promise.all([
        client.getInsights({ level: "campaign", since, until, accountId: account_id }),
        client.getInsights({
          level: "campaign", since, until, timeIncrement: 1, accountId: account_id,
        }),
      ]);

      let cliente = client_name;
      if (!cliente) {
        const acc = await client.getAdAccount(account_id);
        cliente = (acc.name as string) ?? "Relatório Meta Ads";
      }

      const model = buildPdfModel(cliente, `${since} a ${until}`, accountRows, dailyRows);
      const filePath = await generatePdf(model, cliente);

      return {
        content: [
          { type: "text", text: `PDF gerado com sucesso:\n${filePath}` },
        ],
      };
    }
  );

  return server;
}
