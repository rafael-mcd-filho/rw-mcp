// Registro das tools de ESCRITA do Google Ads (criação, edição, exclusão).
// Espelha src/server-tools/write-tools.ts (Meta) e o mesmo REST v23 já usado
// nas tools de leitura em src/google-ads-api.ts. Só campanhas Search por ora.
//
// POLÍTICA DE CONFIRMAÇÃO (mesma trava do Meta):
//   - Criação (campanha, ad group, keyword, RSA, sitelink, callout, negativa)
//     nasce sempre PAUSED/inerte — não gasta nada e é reversível, então NÃO
//     pede confirmação.
//   - Update que ativa (status=ENABLED/REMOVED) ou muda orçamento/lance exige
//     confirm=true; sem ele, devolve só o preview e nada muda.
//   - Delete sempre exige confirm=true.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createGoogleAdsCampaign,
  createGoogleAdsAdGroup,
  addGoogleAdsKeyword,
  createGoogleAdsRsa,
  createGoogleAdsSitelink,
  createGoogleAdsCallout,
  addGoogleAdsNegativeKeyword,
  updateGoogleAdsCampaign,
  updateGoogleAdsAdGroup,
  updateGoogleAdsKeyword,
  updateGoogleAdsAd,
  deleteGoogleAdsKeyword,
  deleteGoogleAdsNegative,
  deleteGoogleAdsAd,
  searchGoogleAdsGeoTargets,
  addGoogleAdsLocationTargets,
  addGoogleAdsLanguageTargets,
  addGoogleAdsAdSchedule,
  listGoogleAdsAssets,
  attachGoogleAdsAsset,
  createGoogleAdsWhatsappMessage,
  listGoogleAdsCampaignConversionGoals,
  setGoogleAdsCampaignConversionGoal,
} from "../google-ads-api.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function toolError(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

const isConfirmed = (a: Record<string, unknown>): boolean =>
  a["confirm"] === true ||
  a["confirmar"] === true ||
  a["confirm"] === "true" ||
  a["confirmar"] === "true";

/** Trava de confirmação: sem confirm=true devolve preview e não executa nada. */
function previewGuard(a: Record<string, unknown>, acao: string, detalhe: unknown) {
  if (isConfirmed(a)) return null;
  return json({
    status: "CONFIRMACAO_NECESSARIA",
    acao,
    sera_executado: detalhe,
    aviso: "Nada foi alterado. Confirme com o usuário e chame de novo com confirm=true para executar.",
  });
}

const CONFIRM_SCHEMA = {
  confirm: z
    .boolean()
    .optional()
    .describe("Trava de segurança. false/omitido = apenas preview (nada muda). true = executa de fato."),
  confirmar: z.boolean().optional().describe("Alias de confirm."),
};

const GOOGLE_CUSTOMER_SCHEMA = {
  customer_id: z.union([z.string(), z.number()]).describe("ID da conta Google Ads (só números, sem traços)."),
  customerId: z.union([z.string(), z.number()]).optional().describe("Alias de customer_id."),
  google_customer_id: z.union([z.string(), z.number()]).optional().describe("Alias de customer_id."),
  conta_id: z.union([z.string(), z.number()]).optional().describe("Alias de customer_id."),
};

function customerIdFrom(a: Record<string, unknown>): string {
  const raw = a["customer_id"] ?? a["customerId"] ?? a["google_customer_id"] ?? a["conta_id"];
  if (raw == null) throw new Error("Parâmetro obrigatório: customer_id.");
  const cid = String(raw).replace(/-/g, "").trim();
  if (!cid) throw new Error("Parâmetro obrigatório: customer_id.");
  return cid;
}

const STATUS_ENUM = z.enum(["ENABLED", "PAUSED", "REMOVED"]);

export function registerGoogleWriteTools(server: McpServer): void {
  // ─── Criação (PAUSED/inerte — sem trava) ────────────────────────────────────

  server.tool(
    "create_google_ads_campaign",
    "Cria uma campanha Search do Google Ads (sempre PAUSED — sem custo até ativar). Só Search por enquanto. Bidding (mutuamente exclusivos, nessa ordem de prioridade): maximize_conversion_value=true = Maximizar Valor da Conversão (target_roas opcional como teto 'soft'); só target_roas (sem maximize_conversion_value) = Target ROAS estrito; target_impression_share_location = Parcela de Impressões Desejada; maximize_conversions=true = Maximizar Conversões (target_cpa_reais opcional como teto 'soft'); só target_cpa_reais = Target CPA estrito; manual_cpc=true = CPC Manual; PADRÃO quando nada é informado = Maximizar Cliques (Target Spend, aceita cpc_bid_ceiling_reais opcional) — é o padrão mais seguro porque não exige lance manual configurado em ad group/keyword pra a campanha conseguir gastar. AVISO: target_roas/maximize_conversion_value/target_impression_share não foram validados contra uma campanha real (nenhuma conta testada usa essas estratégias hoje) — confira o resultado na interface do Google Ads antes de ativar. Depois de criada, use add_google_ads_location_target, add_google_ads_language_target e add_google_ads_ad_schedule para segmentar geografia, idioma e horário.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      name: z.string().describe("Nome da campanha."),
      daily_budget_centavos: z.number().describe("Orçamento diário em CENTAVOS (5000 = R$50)."),
      maximize_conversion_value: z.boolean().optional().describe("Usa bidding Maximizar Valor da Conversão. (não validado ao vivo)"),
      target_roas: z
        .number()
        .optional()
        .describe(
          "ROAS alvo como decimal (ex: 3.5 = 350%). Combinado com maximize_conversion_value=true vira teto 'soft'; sozinho, define bidding Target ROAS estrito. (não validado ao vivo)"
        ),
      target_impression_share_location: z
        .enum(["ANYWHERE_ON_PAGE", "TOP_OF_PAGE", "ABSOLUTE_TOP_OF_PAGE"])
        .optional()
        .describe("Define bidding Parcela de Impressões Desejada, com a posição alvo. (não validado ao vivo)"),
      target_impression_share_percent: z
        .number()
        .optional()
        .describe("Percentual alvo de parcela de impressões (ex: 90 = 90%). Padrão: 100. (não validado ao vivo)"),
      maximize_conversions: z.boolean().optional().describe("Usa bidding Maximizar Conversões."),
      target_cpa_reais: z
        .number()
        .optional()
        .describe(
          "Target CPA em reais (ex: 25.00). Combinado com maximize_conversions=true vira teto 'soft' dentro de Maximizar Conversões; sozinho, define bidding Target CPA estrito."
        ),
      manual_cpc: z.boolean().optional().describe("Usa bidding CPC Manual (exige lance configurado depois em ad group/keyword)."),
      cpc_bid_ceiling_reais: z
        .number()
        .optional()
        .describe("Teto de lance de CPC em reais para Maximizar Cliques (padrão), Target ROAS ou Parcela de Impressões (opcional em todos)."),
      target_search_partners: z
        .boolean()
        .optional()
        .describe("Inclui a Rede de Parceiros de Pesquisa além da Pesquisa Google. Padrão: true (ligado)."),
      location_targeting_type: z
        .enum(["PRESENCE", "PRESENCE_OR_INTEREST"])
        .optional()
        .describe(
          "Modo de segmentação geográfica: PRESENCE = só quem está fisicamente na região; PRESENCE_OR_INTEREST = também quem demonstrou interesse na região (padrão do Google Ads). Só tem efeito combinado com add_google_ads_location_target."
        ),
      disable_ai_automation: z
        .boolean()
        .optional()
        .describe(
          "Desliga automação por IA (personalização de texto e expansão de URL final automáticas). Padrão: true (desligado). Passe false pra deixar ligado (padrão do Google Ads)."
        ),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await createGoogleAdsCampaign(cid, {
            name: args.name,
            dailyBudgetCentavos: args.daily_budget_centavos,
            maximizeConversionValue: args.maximize_conversion_value,
            targetRoas: args.target_roas,
            targetImpressionShareLocation: args.target_impression_share_location,
            targetImpressionSharePercent: args.target_impression_share_percent,
            maximizeConversions: args.maximize_conversions,
            targetCpaReais: args.target_cpa_reais,
            manualCpc: args.manual_cpc,
            cpcBidCeilingReais: args.cpc_bid_ceiling_reais,
            targetSearchPartners: args.target_search_partners,
            locationTargetingType: args.location_targeting_type,
            disableAiAutomation: args.disable_ai_automation,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_google_ads_whatsapp_message",
    "Adiciona uma extensão de Mensagens via WhatsApp a uma campanha (BusinessMessageAsset). Confirmado contra o anúncio ativo real da Batista Rastreamento, que já usa essa extensão.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      country_code: z.string().describe("Código de país de 2 letras do número (ex: 'BR')."),
      phone_number: z.string().describe("Número de WhatsApp do negócio (ex: '83988098480')."),
      starter_message: z.string().describe("Mensagem inicial sugerida ao usuário (ex: 'Olá, vim pelo site e gostaria de ajuda.')."),
      call_to_action: z
        .enum(["APPLY_NOW", "BOOK_NOW", "CONTACT_US", "GET_INFO", "GET_OFFER", "GET_QUOTE", "GET_STARTED", "LEARN_MORE"])
        .describe("Call-to-action pré-definida do botão."),
      call_to_action_description: z.string().describe("Texto explicando o valor da ação (ex: 'Falar no WhatsApp')."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await createGoogleAdsWhatsappMessage(cid, {
            campaignId: args.campaign_id,
            countryCode: args.country_code,
            phoneNumber: args.phone_number,
            starterMessage: args.starter_message,
            callToActionSelection: args.call_to_action,
            callToActionDescription: args.call_to_action_description,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Metas de conversão específicas da campanha ──────────────────────────────

  server.tool(
    "list_google_ads_campaign_conversion_goals",
    "Lista as metas de conversão disponíveis para uma campanha (category + origin) e se cada uma está habilitada pro bidding (biddable) — equivalente ao 'Metas de conversão' da tela de criação de campanha.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(await listGoogleAdsCampaignConversionGoals(cid, args.campaign_id));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "set_google_ads_campaign_conversion_goal",
    "Habilita ou desabilita uma meta de conversão específica (category + origin, de list_google_ads_campaign_conversion_goals) para o bidding dessa campanha. Não exige confirm — não afeta gasto diretamente, só o que conta como conversão pro algoritmo.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      category: z.string().describe("Categoria da conversão, de list_google_ads_campaign_conversion_goals (ex: 'CONTACT', 'SUBMIT_LEAD_FORM')."),
      origin: z.string().describe("Origem da conversão, de list_google_ads_campaign_conversion_goals (ex: 'WEBSITE', 'CALL_FROM_ADS')."),
      biddable: z.boolean().describe("true = incluir no bidding; false = excluir."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await setGoogleAdsCampaignConversionGoal(cid, {
            campaignId: args.campaign_id,
            category: args.category,
            origin: args.origin,
            biddable: args.biddable,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Assets: reaproveitar sitelink/callout existente ─────────────────────────

  server.tool(
    "list_google_ads_assets",
    "Lista sitelinks ou callouts já existentes na biblioteca da conta (reutilizáveis entre campanhas), pra usar com attach_google_ads_asset em vez de criar um novo com create_google_ads_sitelink/create_google_ads_callout.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      type: z.enum(["SITELINK", "CALLOUT"]).describe("Tipo de asset a listar."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(await listGoogleAdsAssets(cid, args.type));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "attach_google_ads_asset",
    "Vincula um sitelink ou callout já existente (de list_google_ads_assets) a uma campanha, sem criar um recurso novo.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      asset_resource_name: z.string().describe("resource_name do asset (ex: 'customers/123/assets/456'), de list_google_ads_assets."),
      field_type: z.enum(["SITELINK", "CALLOUT"]).describe("Tipo do asset sendo vinculado."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await attachGoogleAdsAsset(cid, {
            campaignId: args.campaign_id,
            assetResourceName: args.asset_resource_name,
            fieldType: args.field_type,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Segmentação: geo, idioma, agenda ────────────────────────────────────────

  server.tool(
    "search_google_ads_geo_targets",
    "Busca geo target constants por nome (ex: 'São Paulo', 'Recife') para usar em add_google_ads_location_target. Retorna id, nome, país e tipo (Country, State, City, etc).",
    {
      names: z.array(z.string()).min(1).describe("Nomes de locais a buscar (ex: ['São Paulo', 'Rio de Janeiro'])."),
      country_code: z.string().optional().describe("Filtra por país (ex: 'BR'). Opcional."),
    },
    async (args) => {
      try {
        return json(await searchGoogleAdsGeoTargets(args.names, args.country_code));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "add_google_ads_location_target",
    "Adiciona segmentação geográfica (região/cidade/país) a uma campanha. Use search_google_ads_geo_targets para achar os IDs. Com negative=true, exclui a região em vez de incluir.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      geo_target_constant_ids: z.array(z.string()).min(1).describe("IDs de geo target constant (ex: ['1001777'] para São Paulo, ['2076'] para Brasil)."),
      negative: z.boolean().optional().describe("true = excluir essas regiões em vez de incluir."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await addGoogleAdsLocationTargets(cid, {
            campaignId: args.campaign_id,
            geoTargetConstantIds: args.geo_target_constant_ids,
            negative: args.negative,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "add_google_ads_language_target",
    "Adiciona segmentação de idioma a uma campanha (ex: 1014 = Português, 1000 = Inglês, 1003 = Espanhol). Lista completa: https://developers.google.com/google-ads/api/data/codes-formats#languages",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      language_constant_ids: z.array(z.string()).min(1).describe("IDs de language constant (ex: ['1014'] para Português)."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await addGoogleAdsLanguageTargets(cid, {
            campaignId: args.campaign_id,
            languageConstantIds: args.language_constant_ids,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "add_google_ads_ad_schedule",
    "Define em quais dias e horários os anúncios de uma campanha podem rodar (Ad Schedule). Fora dos horários definidos, os anúncios não veiculam.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      schedule: z
        .array(
          z.object({
            day_of_week: z
              .enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])
              .describe("Dia da semana."),
            start_hour: z.number().int().min(0).max(23).describe("Hora de início (0-23)."),
            start_minute: z.number().int().optional().describe("Minuto de início: 0, 15, 30 ou 45. Padrão 0."),
            end_hour: z.number().int().min(0).max(24).describe("Hora de fim (0-24)."),
            end_minute: z.number().int().optional().describe("Minuto de fim: 0, 15, 30 ou 45. Padrão 0."),
          })
        )
        .min(1)
        .describe("Lista de faixas de dia/horário em que os anúncios podem rodar."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await addGoogleAdsAdSchedule(cid, {
            campaignId: args.campaign_id,
            schedule: args.schedule.map((s) => ({
              dayOfWeek: s.day_of_week,
              startHour: s.start_hour,
              startMinute: s.start_minute,
              endHour: s.end_hour,
              endMinute: s.end_minute,
            })),
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_google_ads_ad_group",
    "Cria um grupo de anúncios (ad group) Search dentro de uma campanha (sempre PAUSED).",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha mãe."),
      name: z.string().describe("Nome do ad group."),
      cpc_bid_reais: z.number().optional().describe("Lance máximo de CPC em reais (ex: 2.50)."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await createGoogleAdsAdGroup(cid, {
            campaignId: args.campaign_id,
            name: args.name,
            cpcBidReais: args.cpc_bid_reais,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "add_google_ads_keyword",
    "Adiciona uma keyword a um ad group. Criada com status ENABLED (seguro: o ad group/campanha continuam PAUSED até serem ativados).",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      ad_group_id: z.string().describe("ID do ad group."),
      text: z.string().describe("Texto da keyword."),
      match_type: z.enum(["EXACT", "PHRASE", "BROAD"]).optional().describe("Padrão: PHRASE."),
      bid_reais: z.number().optional().describe("Lance de CPC em reais (ex: 1.50). Se omitido, usa o lance do ad group."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await addGoogleAdsKeyword(cid, {
            adGroupId: args.ad_group_id,
            text: args.text,
            matchType: args.match_type,
            bidReais: args.bid_reais,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_google_ads_rsa",
    "Cria um Responsive Search Ad (RSA) num ad group (sempre PAUSED). Até 15 headlines e 4 descriptions.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      ad_group_id: z.string().describe("ID do ad group."),
      headlines: z.array(z.string()).min(1).max(15).describe("Headlines do anúncio (1 a 15)."),
      descriptions: z.array(z.string()).min(1).max(4).describe("Descriptions do anúncio (1 a 4)."),
      final_url: z.string().describe("URL de destino do anúncio."),
      path1: z.string().optional().describe("Caminho de exibição 1 (opcional)."),
      path2: z.string().optional().describe("Caminho de exibição 2 (opcional)."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await createGoogleAdsRsa(cid, {
            adGroupId: args.ad_group_id,
            headlines: args.headlines,
            descriptions: args.descriptions,
            finalUrl: args.final_url,
            path1: args.path1,
            path2: args.path2,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_google_ads_sitelink",
    "Cria uma extensão de sitelink e vincula a uma campanha.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      text: z.string().describe("Texto do sitelink."),
      url: z.string().describe("URL do sitelink."),
      desc1: z.string().optional().describe("Linha de descrição 1."),
      desc2: z.string().optional().describe("Linha de descrição 2."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await createGoogleAdsSitelink(cid, {
            campaignId: args.campaign_id,
            text: args.text,
            url: args.url,
            desc1: args.desc1,
            desc2: args.desc2,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_google_ads_callout",
    "Cria uma extensão de callout e vincula a uma campanha.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      text: z.string().describe("Texto do callout."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(await createGoogleAdsCallout(cid, { campaignId: args.campaign_id, text: args.text }));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "add_google_ads_negative_keyword",
    "Adiciona uma keyword negativa no nível de campanha ou de ad group. Informe campaign_id OU ad_group_id (não os dois).",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().optional().describe("ID da campanha (negativa em nível de campanha)."),
      ad_group_id: z.string().optional().describe("ID do ad group (negativa em nível de ad group)."),
      text: z.string().describe("Texto da negativa."),
      match_type: z.enum(["EXACT", "PHRASE", "BROAD"]).optional().describe("Padrão: PHRASE."),
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        return json(
          await addGoogleAdsNegativeKeyword(cid, {
            campaignId: args.campaign_id,
            adGroupId: args.ad_group_id,
            text: args.text,
            matchType: args.match_type,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Update (trava de confirmação quando ativa, gasta mais ou destrói) ──────

  server.tool(
    "update_google_ads_campaign",
    "Edita status, nome e/ou orçamento diário de uma campanha. Mudar status para PAUSED não exige confirmação; ENABLED/REMOVED ou mudar orçamento exige confirm=true. Ao ativar uma campanha, ative também os ad groups e anúncios dela (nessa ordem: campanha → ad groups → anúncios).",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      campaign_id: z.string().describe("ID da campanha."),
      status: STATUS_ENUM.optional().describe("Novo status."),
      name: z.string().optional().describe("Novo nome."),
      daily_budget_centavos: z.number().optional().describe("Novo orçamento diário em CENTAVOS."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        const risky = (args.status && args.status !== "PAUSED") || args.daily_budget_centavos != null;
        if (risky) {
          const guard = previewGuard(args, "update_google_ads_campaign", {
            customer_id: cid,
            campaign_id: args.campaign_id,
            status: args.status,
            name: args.name,
            daily_budget_centavos: args.daily_budget_centavos,
          });
          if (guard) return guard;
        }
        return json(
          await updateGoogleAdsCampaign(cid, {
            campaignId: args.campaign_id,
            status: args.status,
            name: args.name,
            dailyBudgetCentavos: args.daily_budget_centavos,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "update_google_ads_ad_group",
    "Edita status, nome e/ou lance de CPC de um ad group. PAUSED não exige confirmação; ENABLED/REMOVED ou mudar o lance exige confirm=true.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      ad_group_id: z.string().describe("ID do ad group."),
      status: STATUS_ENUM.optional().describe("Novo status."),
      name: z.string().optional().describe("Novo nome."),
      cpc_bid_reais: z.number().optional().describe("Novo lance máximo de CPC em reais."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        const risky = (args.status && args.status !== "PAUSED") || args.cpc_bid_reais != null;
        if (risky) {
          const guard = previewGuard(args, "update_google_ads_ad_group", {
            customer_id: cid,
            ad_group_id: args.ad_group_id,
            status: args.status,
            name: args.name,
            cpc_bid_reais: args.cpc_bid_reais,
          });
          if (guard) return guard;
        }
        return json(
          await updateGoogleAdsAdGroup(cid, {
            adGroupId: args.ad_group_id,
            status: args.status,
            name: args.name,
            cpcBidReais: args.cpc_bid_reais,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "update_google_ads_keyword",
    "Edita status e/ou lance de uma keyword. PAUSED não exige confirmação; ENABLED/REMOVED ou mudar o lance exige confirm=true.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      ad_group_id: z.string().describe("ID do ad group dono da keyword."),
      criterion_id: z.string().describe("ID do critério (keyword) — coluna 'id' de get_google_ads_keywords."),
      status: STATUS_ENUM.optional().describe("Novo status."),
      bid_reais: z.number().optional().describe("Novo lance de CPC em reais."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        const risky = (args.status && args.status !== "PAUSED") || args.bid_reais != null;
        if (risky) {
          const guard = previewGuard(args, "update_google_ads_keyword", {
            customer_id: cid,
            ad_group_id: args.ad_group_id,
            criterion_id: args.criterion_id,
            status: args.status,
            bid_reais: args.bid_reais,
          });
          if (guard) return guard;
        }
        return json(
          await updateGoogleAdsKeyword(cid, {
            adGroupId: args.ad_group_id,
            criterionId: args.criterion_id,
            status: args.status,
            bidReais: args.bid_reais,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "update_google_ads_ad",
    "Edita o status de um anúncio (ad group ad). PAUSED não exige confirmação; ENABLED/REMOVED exige confirm=true.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      ad_group_id: z.string().describe("ID do ad group."),
      ad_id: z.string().describe("ID do anúncio."),
      status: STATUS_ENUM.describe("Novo status."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        if (args.status !== "PAUSED") {
          const guard = previewGuard(args, "update_google_ads_ad", {
            customer_id: cid,
            ad_group_id: args.ad_group_id,
            ad_id: args.ad_id,
            status: args.status,
          });
          if (guard) return guard;
        }
        return json(await updateGoogleAdsAd(cid, { adGroupId: args.ad_group_id, adId: args.ad_id, status: args.status }));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Delete (sempre exige confirmação) ──────────────────────────────────────

  server.tool(
    "delete_google_ads_keyword",
    "Remove uma keyword de um ad group. Ação destrutiva — exige confirm=true.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      ad_group_id: z.string().describe("ID do ad group."),
      criterion_id: z.string().describe("ID do critério (keyword)."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        const guard = previewGuard(args, "delete_google_ads_keyword", {
          customer_id: cid,
          ad_group_id: args.ad_group_id,
          criterion_id: args.criterion_id,
        });
        if (guard) return guard;
        return json(await deleteGoogleAdsKeyword(cid, { adGroupId: args.ad_group_id, criterionId: args.criterion_id }));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "delete_google_ads_negative",
    "Remove uma keyword negativa (nível de campanha ou de ad group). Ação destrutiva — exige confirm=true.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      level: z.enum(["campaign", "ad_group"]).describe("Nível da negativa."),
      parent_id: z.string().describe("ID da campanha (se level=campaign) ou do ad group (se level=ad_group)."),
      criterion_id: z.string().describe("ID do critério da negativa."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        const guard = previewGuard(args, "delete_google_ads_negative", {
          customer_id: cid,
          level: args.level,
          parent_id: args.parent_id,
          criterion_id: args.criterion_id,
        });
        if (guard) return guard;
        return json(
          await deleteGoogleAdsNegative(cid, {
            level: args.level,
            parentId: args.parent_id,
            criterionId: args.criterion_id,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "delete_google_ads_ad",
    "Remove um anúncio de um ad group. Ação destrutiva — exige confirm=true.",
    {
      ...GOOGLE_CUSTOMER_SCHEMA,
      ad_group_id: z.string().describe("ID do ad group."),
      ad_id: z.string().describe("ID do anúncio."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const cid = customerIdFrom(args);
        const guard = previewGuard(args, "delete_google_ads_ad", {
          customer_id: cid,
          ad_group_id: args.ad_group_id,
          ad_id: args.ad_id,
        });
        if (guard) return guard;
        return json(await deleteGoogleAdsAd(cid, { adGroupId: args.ad_group_id, adId: args.ad_id }));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );
}
