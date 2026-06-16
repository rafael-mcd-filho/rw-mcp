import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaAdsClient } from "./meta-api.js";

export function createMcpServer(accessToken: string, adAccountId: string): McpServer {
  const client = new MetaAdsClient({ accessToken, adAccountId });

  const server = new McpServer({
    name: "meta-ads-mcp",
    version: "1.0.0",
  });

  // ─── Conta ──────────────────────────────────────────────────────────────────

  server.tool(
    "get_ad_account",
    "Retorna informações da conta de anúncios: nome, status, moeda, fuso horário, saldo e gasto total",
    {},
    async () => {
      const account = await client.getAdAccount();
      return { content: [{ type: "text", text: JSON.stringify(account, null, 2) }] };
    }
  );

  // ─── Campanhas ──────────────────────────────────────────────────────────────

  server.tool(
    "list_campaigns",
    "Lista todas as campanhas da conta. Filtre por status: ACTIVE, PAUSED, DELETED, ARCHIVED",
    {
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("Filtrar por status da campanha"),
    },
    async ({ status }) => {
      const campaigns = await client.getCampaigns(status);
      return { content: [{ type: "text", text: JSON.stringify(campaigns, null, 2) }] };
    }
  );

  server.tool(
    "get_campaign",
    "Retorna detalhes de uma campanha específica pelo ID",
    { campaign_id: z.string().describe("ID da campanha") },
    async ({ campaign_id }) => {
      const campaign = await client.getCampaign(campaign_id);
      return { content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] };
    }
  );

  // ─── Conjuntos de Anúncios ───────────────────────────────────────────────────

  server.tool(
    "list_adsets",
    "Lista conjuntos de anúncios. Pode filtrar por campanha e/ou status",
    {
      campaign_id: z.string().optional().describe("ID da campanha"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("Filtrar por status"),
    },
    async ({ campaign_id, status }) => {
      const adsets = await client.getAdSets(campaign_id, status);
      return { content: [{ type: "text", text: JSON.stringify(adsets, null, 2) }] };
    }
  );

  // ─── Anúncios ────────────────────────────────────────────────────────────────

  server.tool(
    "list_ads",
    "Lista anúncios. Pode filtrar por conjunto de anúncios, campanha e/ou status",
    {
      adset_id: z.string().optional().describe("ID do conjunto de anúncios"),
      campaign_id: z.string().optional().describe("ID da campanha"),
      status: z
        .enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])
        .optional()
        .describe("Filtrar por status"),
    },
    async ({ adset_id, campaign_id, status }) => {
      const ads = await client.getAds(adset_id, campaign_id, status);
      return { content: [{ type: "text", text: JSON.stringify(ads, null, 2) }] };
    }
  );

  // ─── Insights — Período Único ────────────────────────────────────────────────

  server.tool(
    "get_insights",
    `Retorna métricas de desempenho para UM período: spend, impressions, clicks, cpc, cpm, cpp, ctr, objective, reach e actions.
Use este tool quando o usuário quiser analisar um período específico (ex: "semana passada", "junho", "de 01/06 até 15/06").`,
    {
      level: z
        .enum(["account", "campaign", "adset", "ad"])
        .describe("Nível de agregação: account, campaign, adset ou ad"),
      entity_id: z.string().optional().describe("ID da entidade. Omita para a conta inteira."),
      since: z.string().optional().describe("Data de início YYYY-MM-DD"),
      until: z.string().optional().describe("Data de fim YYYY-MM-DD"),
      date_preset: z
        .enum([
          "today", "yesterday", "this_week_mon_today", "last_week_mon_sun",
          "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
          "this_month", "last_month", "this_quarter", "last_year", "this_year",
        ])
        .optional()
        .describe("Período pré-definido (alternativa a since/until). Padrão: last_30d"),
      breakdown: z
        .enum(["age", "gender", "country", "region", "placement", "device_platform"])
        .optional()
        .describe("Quebrar métricas por dimensão"),
      limit: z.number().optional().describe("Máximo de resultados (padrão: 3000)"),
    },
    async ({ level, entity_id, since, until, date_preset, breakdown, limit }) => {
      const insights = await client.getInsights({
        level, entityId: entity_id, since, until,
        datePreset: date_preset, breakdown, limit,
      });
      return { content: [{ type: "text", text: JSON.stringify(insights, null, 2) }] };
    }
  );

  // ─── Insights — Comparação de Dois Períodos ──────────────────────────────────

  server.tool(
    "get_insights_comparison",
    `Retorna métricas comparando DOIS períodos lado a lado.
Use quando o usuário quiser comparar períodos (ex: "compare essa semana com a semana passada", "junho vs maio").
Retorna: { period: [...], comparison: [...] }`,
    {
      level: z
        .enum(["account", "campaign", "adset", "ad"])
        .describe("Nível de agregação: account, campaign, adset ou ad"),
      entity_id: z.string().optional().describe("ID da entidade. Omita para a conta inteira."),
      since: z.string().describe("Início do período PRINCIPAL (YYYY-MM-DD)"),
      until: z.string().describe("Fim do período PRINCIPAL (YYYY-MM-DD)"),
      compare_since: z.string().describe("Início do período de COMPARAÇÃO (YYYY-MM-DD)"),
      compare_until: z.string().describe("Fim do período de COMPARAÇÃO (YYYY-MM-DD)"),
      breakdown: z
        .enum(["age", "gender", "country", "region", "placement", "device_platform"])
        .optional()
        .describe("Quebrar métricas por dimensão"),
      limit: z.number().optional().describe("Máximo de resultados por período (padrão: 3000)"),
    },
    async ({ level, entity_id, since, until, compare_since, compare_until, breakdown, limit }) => {
      const result = await client.getInsightsComparison({
        level, entityId: entity_id, since, until,
        compareSince: compare_since, compareUntil: compare_until,
        breakdown, limit,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}
