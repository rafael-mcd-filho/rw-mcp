// Registro das tools de ESCRITA (criação, edição, exclusão, duplicação) e de
// TARGETING (busca de geo/interesses/comportamentos + estimativa de alcance).
// Mantido fora do server.ts para não inchá-lo. Toda ação que modifica a conta
// passa por uma TRAVA DE CONFIRMAÇÃO: sem confirm=true, o tool apenas devolve um
// preview do que seria feito, sem alterar nada.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MetaAdsClient } from "../meta-api.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function toolError(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

const scalar = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
};

const accountIdFrom = (a: Record<string, unknown>): string | undefined =>
  scalar(a["account_id"] ?? a["accountId"] ?? a["ad_account_id"] ?? a["adAccountId"] ?? a["account"]);

const isConfirmed = (a: Record<string, unknown>): boolean =>
  a["confirm"] === true ||
  a["confirmar"] === true ||
  a["confirm"] === "true" ||
  a["confirmar"] === "true";

/**
 * Trava de confirmação. Quando confirm != true, devolve o preview da ação e
 * sinaliza para o handler interromper (nada é alterado na conta).
 */
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

const ACCOUNT_SCHEMA = {
  account_id: z
    .union([z.string(), z.number()])
    .optional()
    .describe("ID da conta (com ou sem 'act_'). Omita para usar a conta padrão."),
  accountId: z.union([z.string(), z.number()]).optional().describe("Alias de account_id."),
  ad_account_id: z.union([z.string(), z.number()]).optional().describe("Alias de account_id."),
};

const STATUS_ENUM = z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]);

/** Converte data ISO (YYYY-MM-DD ou ISO completo) ou número em timestamp unix (segundos). */
function toUnix(v: string | number): number {
  if (typeof v === "number") return v;
  if (/^\d+$/.test(v)) return Number(v);
  const ms = Date.parse(v.length === 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(ms)) throw new Error(`Data inválida: ${v}`);
  return Math.floor(ms / 1000);
}

export function registerWriteTools(server: McpServer, client: MetaAdsClient): void {
  // ─── Descoberta de assets ────────────────────────────────────────────────────
  server.tool(
    "get_account_assets",
    "Descobre as páginas do Facebook e contas do Instagram vinculadas à conta de anúncios. Use ANTES de criar criativos para obter page_id e instagram_user_id sem precisar perguntar ao usuário.",
    { ...ACCOUNT_SCHEMA },
    async (args) => {
      try {
        return json(await client.getAccountAssets(accountIdFrom(args)));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Targeting: busca ─────────────────────────────────────────────────────────
  server.tool(
    "search_geolocations",
    "Busca localizações (cidade, região, país, CEP) e retorna a 'key' que o targeting usa. Ex: buscar 'Recife' devolve a key da cidade para usar em geo_locations.cities.",
    {
      q: z.string().describe("Texto a buscar (ex: 'Recife', 'São Paulo')."),
      types: z
        .array(z.enum(["country", "region", "city", "zip", "geo_market", "electoral_district"]))
        .optional()
        .describe("Filtrar por tipo de localização (ex: ['city'])."),
      limit: z.number().optional().describe("Máximo de resultados (padrão 25)."),
    },
    async (args) => {
      try {
        return json(await client.searchGeolocations(args.q, args.types, args.limit));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "search_interests",
    "Busca interesses de segmentação detalhada e retorna id + nome + audience_size. Use os ids em targeting.flexible_spec[].interests.",
    {
      q: z.string().describe("Termo do interesse (ex: 'gastronomia', 'pets')."),
      limit: z.number().optional().describe("Máximo de resultados (padrão 25)."),
    },
    async (args) => {
      try {
        return json(await client.searchInterests(args.q, args.limit));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "search_behaviors",
    "Lista comportamentos de segmentação disponíveis (id + nome). Use os ids em targeting.flexible_spec[].behaviors.",
    { limit: z.number().optional().describe("Máximo de resultados (padrão 100).") },
    async (args) => {
      try {
        return json(await client.searchBehaviors(args.limit));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "estimate_reach",
    "Estima o alcance/tamanho de público de um targeting antes de criar o conjunto. Retorna estimate_dau/mau e a estimativa de entrega.",
    {
      ...ACCOUNT_SCHEMA,
      targeting: z.record(z.unknown()).describe("Objeto de targeting completo (geo_locations, age_min, etc)."),
      optimization_goal: z
        .string()
        .describe("Meta de otimização (ex: OFFSITE_CONVERSIONS, LINK_CLICKS, REACH)."),
    },
    async (args) => {
      try {
        return json(
          await client.getDeliveryEstimate({
            accountId: accountIdFrom(args),
            targeting: args.targeting as Record<string, unknown>,
            optimizationGoal: args.optimization_goal as string,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Criação: campanha ────────────────────────────────────────────────────────
  server.tool(
    "create_campaign",
    "Cria uma campanha (sempre PAUSED). Para OUTCOME_LEADS sem orçamento de campanha (ABO), o flag is_adset_budget_sharing_enabled=false é aplicado automaticamente. Definir daily_budget/lifetime_budget aqui = CBO (orçamento na campanha).",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      name: z.string().describe("Nome da campanha."),
      objective: z
        .string()
        .describe("Objetivo (ex: OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS)."),
      status: STATUS_ENUM.optional().describe("Padrão PAUSED. Use create + confirm; ative depois."),
      special_ad_categories: z
        .array(z.string())
        .optional()
        .describe("Categorias especiais (ex: ['HOUSING','EMPLOYMENT','CREDIT']). Padrão []."),
      buying_type: z.string().optional().describe("AUCTION (padrão) ou RESERVED."),
      daily_budget: z.number().optional().describe("Orçamento diário em CENTAVOS (2000 = R$20). Define CBO."),
      lifetime_budget: z.number().optional().describe("Orçamento total em CENTAVOS. Define CBO."),
      bid_strategy: z
        .string()
        .optional()
        .describe("Só com CBO. Padrão LOWEST_COST_WITHOUT_CAP."),
    },
    async (args) => {
      try {
        const p = {
          name: args.name as string,
          objective: args.objective as string,
          accountId: accountIdFrom(args),
          status: args.status as string | undefined,
          specialAdCategories: args.special_ad_categories as string[] | undefined,
          buyingType: args.buying_type as string | undefined,
          dailyBudget: args.daily_budget as number | undefined,
          lifetimeBudget: args.lifetime_budget as number | undefined,
          bidStrategy: args.bid_strategy as string | undefined,
        };
        const guard = previewGuard(args, "create_campaign", p);
        if (guard) return guard;
        return json(await client.createCampaign(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Criação: conjunto ────────────────────────────────────────────────────────
  server.tool(
    "create_adset",
    "Cria um conjunto de anúncios (sempre PAUSED). bid_strategy default LOWEST_COST_WITHOUT_CAP. Se instagram_positions tiver explore_home, 'explore' é adicionado automaticamente. Para conversão no site passe promoted_object={pixel_id, custom_event_type} e destination_type=WEBSITE.",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      name: z.string().describe("Nome do conjunto."),
      campaign_id: z.string().describe("ID da campanha mãe."),
      optimization_goal: z
        .string()
        .describe("Ex: OFFSITE_CONVERSIONS, LINK_CLICKS, LEAD_GENERATION, REACH, IMPRESSIONS."),
      billing_event: z.string().optional().describe("Padrão IMPRESSIONS."),
      bid_strategy: z.string().optional().describe("Padrão LOWEST_COST_WITHOUT_CAP."),
      daily_budget: z.number().optional().describe("Orçamento diário em CENTAVOS (ABO). Omita se a campanha for CBO."),
      lifetime_budget: z.number().optional().describe("Orçamento total em CENTAVOS (ABO)."),
      bid_amount: z.number().optional().describe("Lance em centavos (só para estratégias com cap)."),
      targeting: z.record(z.unknown()).describe("Objeto de targeting (geo_locations, age_min/max, genders, etc)."),
      promoted_object: z
        .record(z.unknown())
        .optional()
        .describe("Ex: {pixel_id, custom_event_type:'LEAD'} para conversão no site."),
      destination_type: z.string().optional().describe("Ex: WEBSITE, MESSENGER, WHATSAPP."),
      attribution_spec: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("Ex: [{event_type:'CLICK_THROUGH',window_days:7},{event_type:'VIEW_THROUGH',window_days:1}]."),
      start_time: z.string().optional().describe("Início (ISO). Omita para começar imediato."),
      end_time: z.string().optional().describe("Fim (ISO). Obrigatório com lifetime_budget."),
      status: STATUS_ENUM.optional().describe("Padrão PAUSED."),
    },
    async (args) => {
      try {
        const p = {
          accountId: accountIdFrom(args),
          name: args.name as string,
          campaignId: args.campaign_id as string,
          optimizationGoal: args.optimization_goal as string,
          billingEvent: args.billing_event as string | undefined,
          bidStrategy: args.bid_strategy as string | undefined,
          dailyBudget: args.daily_budget as number | undefined,
          lifetimeBudget: args.lifetime_budget as number | undefined,
          bidAmount: args.bid_amount as number | undefined,
          targeting: args.targeting as Record<string, unknown>,
          promotedObject: args.promoted_object as Record<string, unknown> | undefined,
          destinationType: args.destination_type as string | undefined,
          attributionSpec: args.attribution_spec as unknown[] | undefined,
          startTime: args.start_time as string | undefined,
          endTime: args.end_time as string | undefined,
          status: args.status as string | undefined,
        };
        const guard = previewGuard(args, "create_adset", p);
        if (guard) return guard;
        return json(await client.createAdSet(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Criação: criativo ────────────────────────────────────────────────────────
  server.tool(
    "create_creative",
    "Cria um criativo. Para vídeo, object_story_spec.video_data PRECISA de image_hash ou image_url (thumbnail). O display link fica em call_to_action.value.link_caption. ATENÇÃO: combinar object_story_spec + asset_feed_spec (ex: WhatsApp addon) pode falhar com erro 3 se o app não tiver capability de Marketing Partner.",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      name: z.string().describe("Nome do criativo."),
      object_story_spec: z
        .record(z.unknown())
        .optional()
        .describe("Spec do post (page_id + video_data/link_data/photo_data)."),
      asset_feed_spec: z
        .record(z.unknown())
        .optional()
        .describe("DCO / variações de texto / message_extensions (WhatsApp). Pode exigir capability."),
      instagram_user_id: z.string().optional().describe("ID da conta IG (use get_account_assets)."),
      url_tags: z.string().optional().describe("UTMs (ex: 'utm_source=facebook&utm_medium=cpc')."),
      degrees_of_freedom_spec: z
        .record(z.unknown())
        .optional()
        .describe("Liga/desliga Advantage+ creative features (OPT_OUT para desativar)."),
    },
    async (args) => {
      try {
        const p = {
          accountId: accountIdFrom(args),
          name: args.name as string,
          objectStorySpec: args.object_story_spec as Record<string, unknown> | undefined,
          assetFeedSpec: args.asset_feed_spec as Record<string, unknown> | undefined,
          instagramUserId: args.instagram_user_id as string | undefined,
          urlTags: args.url_tags as string | undefined,
          degreesOfFreedomSpec: args.degrees_of_freedom_spec as Record<string, unknown> | undefined,
        };
        const guard = previewGuard(args, "create_creative", p);
        if (guard) return guard;
        return json(await client.createAdCreative(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Criação: anúncio ─────────────────────────────────────────────────────────
  server.tool(
    "create_ad",
    "Cria um anúncio (sempre PAUSED) ligando um conjunto a um criativo existente.",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      name: z.string().describe("Nome do anúncio."),
      adset_id: z.string().describe("ID do conjunto."),
      creative_id: z.string().describe("ID do criativo (de create_creative)."),
      conversion_domain: z.string().optional().describe("Domínio de conversão (ex: 'plugguest.com.br')."),
      degrees_of_freedom_spec: z.record(z.unknown()).optional().describe("OPT_OUT de creative features."),
      status: STATUS_ENUM.optional().describe("Padrão PAUSED."),
    },
    async (args) => {
      try {
        const p = {
          accountId: accountIdFrom(args),
          name: args.name as string,
          adsetId: args.adset_id as string,
          creativeId: args.creative_id as string,
          conversionDomain: args.conversion_domain as string | undefined,
          degreesOfFreedomSpec: args.degrees_of_freedom_spec as Record<string, unknown> | undefined,
          status: args.status as string | undefined,
        };
        const guard = previewGuard(args, "create_ad", p);
        if (guard) return guard;
        return json(await client.createAd(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Edição genérica ──────────────────────────────────────────────────────────
  server.tool(
    "update_object",
    "Edita campos de uma campanha, conjunto ou anúncio pelo ID (name, daily_budget em centavos, lifetime_budget, targeting, bid_amount, etc). Para apenas mudar status prefira set_status (cascateia ativação).",
    {
      ...CONFIRM_SCHEMA,
      id: z.string().describe("ID do objeto (campanha, conjunto ou anúncio)."),
      fields: z
        .record(z.unknown())
        .describe("Campos a atualizar (ex: {daily_budget:3000} ou {name:'Novo nome'})."),
    },
    async (args) => {
      try {
        const id = args.id as string;
        const fields = args.fields as Record<string, unknown>;
        const guard = previewGuard(args, "update_object", { id, fields });
        if (guard) return guard;
        return json(await client.updateObject(id, fields));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Mudança de status (com cascata na ativação) ──────────────────────────────
  server.tool(
    "set_status",
    "Muda o status de uma campanha/conjunto/anúncio (ACTIVE, PAUSED, ARCHIVED). Ao ATIVAR uma campanha, ativa em cascata todos os conjuntos e anúncios dentro dela (regra de segurança). object_type ajuda na cascata.",
    {
      ...CONFIRM_SCHEMA,
      id: z.string().describe("ID do objeto."),
      status: STATUS_ENUM.describe("Novo status."),
      object_type: z
        .enum(["campaign", "adset", "ad"])
        .optional()
        .describe("Tipo do objeto. Necessário para cascatear a ativação de campanha."),
    },
    async (args) => {
      try {
        const id = args.id as string;
        const status = args.status as string;
        const objectType = args.object_type as "campaign" | "adset" | "ad" | undefined;
        const cascade = status === "ACTIVE" && objectType === "campaign";

        const guard = previewGuard(args, "set_status", {
          id,
          status,
          cascata: cascade ? "ativa também todos os conjuntos e anúncios da campanha" : "somente este objeto",
        });
        if (guard) return guard;

        if (cascade) {
          const adsets = await client.getAdSets(id);
          const ads = await client.getAds(undefined, id);
          await client.updateObject(id, { status });
          for (const a of adsets) await client.updateObject(a.id, { status });
          for (const a of ads) await client.updateObject(a.id, { status });
          return json({
            updated: id,
            status,
            cascaded: { adsets: adsets.length, ads: ads.length },
          });
        }
        return json(await client.updateObject(id, { status }));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Exclusão ─────────────────────────────────────────────────────────────────
  server.tool(
    "delete_object",
    "Exclui permanentemente uma campanha, conjunto ou anúncio pelo ID. Ação irreversível — exige confirm=true.",
    {
      ...CONFIRM_SCHEMA,
      id: z.string().describe("ID do objeto a excluir."),
    },
    async (args) => {
      try {
        const id = args.id as string;
        const guard = previewGuard(args, "delete_object", { id, aviso: "EXCLUSÃO PERMANENTE" });
        if (guard) return guard;
        return json(await client.deleteObject(id));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Duplicação ───────────────────────────────────────────────────────────────
  server.tool(
    "duplicate_object",
    "Duplica uma campanha, conjunto ou anúncio (cópia sempre PAUSED). Para campanha, deep_copy=true copia também conjuntos e anúncios.",
    {
      ...CONFIRM_SCHEMA,
      id: z.string().describe("ID do objeto a duplicar."),
      object_type: z.enum(["campaign", "adset", "ad"]).describe("Tipo do objeto."),
      deep_copy: z.boolean().optional().describe("Só para campanha: copia conjuntos e anúncios também."),
    },
    async (args) => {
      try {
        const id = args.id as string;
        const kind = args.object_type as "campaign" | "adset" | "ad";
        const deepCopy = args.deep_copy as boolean | undefined;
        const guard = previewGuard(args, "duplicate_object", { id, object_type: kind, deep_copy: deepCopy });
        if (guard) return guard;
        return json(await client.duplicateObject(id, kind, { deepCopy }));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Swap de UTMs ─────────────────────────────────────────────────────────────
  server.tool(
    "swap_url_tags",
    "Troca os url_tags (UTMs) de um anúncio. Como criativos são imutáveis, recria o criativo com os UTMs novos (reusando o post original) e aponta o anúncio para ele.",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      ad_id: z.string().describe("ID do anúncio."),
      url_tags: z.string().describe("Novos UTMs (ex: 'utm_source=facebook&utm_medium=cpc&utm_campaign=x')."),
    },
    async (args) => {
      try {
        const adId = args.ad_id as string;
        const urlTags = args.url_tags as string;
        const guard = previewGuard(args, "swap_url_tags", { ad_id: adId, url_tags: urlTags });
        if (guard) return guard;
        return json(await client.swapUrlTags(adId, urlTags, accountIdFrom(args)));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Programação de orçamento (high demand period) ────────────────────────────
  server.tool(
    "schedule_budget_increase",
    "Programa um aumento de orçamento num conjunto durante um período (a 'Programação do orçamento' da interface). Define um valor de orçamento maior entre as datas. budget_value em CENTAVOS. ABSOLUTE = orçamento alvo no período; MULTIPLIER = fator sobre o orçamento base.",
    {
      ...CONFIRM_SCHEMA,
      adset_id: z.string().describe("ID do conjunto."),
      time_start: z
        .union([z.string(), z.number()])
        .describe("Início do período (YYYY-MM-DD, ISO ou timestamp unix)."),
      time_end: z
        .union([z.string(), z.number()])
        .describe("Fim do período (YYYY-MM-DD, ISO ou timestamp unix)."),
      budget_value: z.number().describe("Valor em CENTAVOS (2500 = R$25)."),
      budget_value_type: z
        .enum(["ABSOLUTE", "MULTIPLIER"])
        .optional()
        .describe("ABSOLUTE (padrão) = orçamento alvo. MULTIPLIER = fator (ex: 1.25)."),
      recurrence_type: z
        .enum(["ONE_TIME", "WEEKLY"])
        .optional()
        .describe("ONE_TIME (padrão para período custom) ou WEEKLY."),
    },
    async (args) => {
      try {
        const adsetId = args.adset_id as string;
        const timeStart = toUnix(args.time_start as string | number);
        const timeEnd = toUnix(args.time_end as string | number);
        const p = {
          timeStart,
          timeEnd,
          budgetValue: args.budget_value as number,
          budgetValueType: args.budget_value_type as string | undefined,
          recurrenceType: args.recurrence_type as string | undefined,
        };
        const guard = previewGuard(args, "schedule_budget_increase", { adset_id: adsetId, ...p });
        if (guard) return guard;
        return json(await client.createBudgetSchedule(adsetId, p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Upload de mídia ──────────────────────────────────────────────────────────
  server.tool(
    "create_video",
    "Envia um vídeo para a conta a partir de uma URL (a Meta baixa o arquivo). Retorna o video_id para usar no criativo. Lembre de pegar o thumbnail depois (GET {video_id}?fields=thumbnails).",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      file_url: z.string().describe("URL pública do arquivo de vídeo (.mp4 etc)."),
      name: z.string().optional().describe("Nome interno do vídeo."),
      title: z.string().optional().describe("Título do vídeo."),
      description: z.string().optional().describe("Descrição do vídeo."),
    },
    async (args) => {
      try {
        const p = {
          accountId: accountIdFrom(args),
          fileUrl: args.file_url as string,
          name: args.name as string | undefined,
          title: args.title as string | undefined,
          description: args.description as string | undefined,
        };
        const guard = previewGuard(args, "create_video", p);
        if (guard) return guard;
        return json(await client.createVideo(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_image",
    "Envia uma imagem para a conta a partir de uma URL. Retorna o image_hash para usar em criativos (link_data.image_hash ou video_data.image_hash como thumbnail).",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      url: z.string().describe("URL pública da imagem (.jpg/.png/.webp)."),
      name: z.string().optional().describe("Nome interno da imagem."),
    },
    async (args) => {
      try {
        const p = {
          accountId: accountIdFrom(args),
          url: args.url as string,
          name: args.name as string | undefined,
        };
        const guard = previewGuard(args, "create_image", p);
        if (guard) return guard;
        return json(await client.createImage(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Públicos (criação) ───────────────────────────────────────────────────────
  server.tool(
    "create_custom_audience",
    "Cria um público personalizado (vazio, para preencher depois, ou de regra). subtype padrão CUSTOM. Para website/pixel use subtype WEBSITE com regras à parte.",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      name: z.string().describe("Nome do público."),
      subtype: z.string().optional().describe("Padrão CUSTOM. Outros: WEBSITE, ENGAGEMENT, etc."),
      description: z.string().optional().describe("Descrição."),
      customer_file_source: z
        .string()
        .optional()
        .describe("Origem dos dados (ex: USER_PROVIDED_ONLY) quando for upload de lista."),
    },
    async (args) => {
      try {
        const p = {
          accountId: accountIdFrom(args),
          name: args.name as string,
          subtype: args.subtype as string | undefined,
          description: args.description as string | undefined,
          customerFileSource: args.customer_file_source as string | undefined,
        };
        const guard = previewGuard(args, "create_custom_audience", p);
        if (guard) return guard;
        return json(await client.createCustomAudience(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_lookalike",
    "Cria um público semelhante (lookalike) a partir de um público de origem. spec ex: {country:'BR', ratio:0.01} (1%).",
    {
      ...ACCOUNT_SCHEMA,
      ...CONFIRM_SCHEMA,
      name: z.string().describe("Nome do lookalike."),
      source_audience_id: z.string().describe("ID do público de origem."),
      spec: z
        .record(z.unknown())
        .describe("Spec do lookalike (ex: {country:'BR', ratio:0.01})."),
    },
    async (args) => {
      try {
        const p = {
          accountId: accountIdFrom(args),
          name: args.name as string,
          sourceAudienceId: args.source_audience_id as string,
          spec: args.spec as Record<string, unknown>,
        };
        const guard = previewGuard(args, "create_lookalike", p);
        if (guard) return guard;
        return json(await client.createLookalike(p));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );
}
