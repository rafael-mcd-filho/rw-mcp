// Registro das tools de ESCRITA (criação, edição, exclusão, duplicação),
// MÍDIA, PÚBLICOS e TARGETING. Mantido fora do server.ts para não inchá-lo.
//
// POLÍTICA DE CONFIRMAÇÃO (trava):
//   - Criar objetos PAUSED/inertes (campanha, conjunto, criativo, anúncio,
//     vídeo, imagem, público, duplicação) NÃO pede confirmação — não gasta nada
//     e é reversível. A segurança fica na ATIVAÇÃO.
//   - Ações que gastam ou destroem (set_status ACTIVE, schedule_budget_increase,
//     update_object, delete_object, swap_url_tags) exigem confirm=true; sem ele,
//     o tool só devolve um preview e não altera nada.
//   - Criação em lote oferece dry_run=true para revisar o plano antes.

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
 * Trava de confirmação para ações de risco. Quando confirm != true, devolve o
 * preview da ação e sinaliza para o handler interromper (nada é alterado).
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

  // ─── Targeting: busca (read-only) ─────────────────────────────────────────────
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

  // ─── Criação (PAUSED/inerte — sem trava) ──────────────────────────────────────
  server.tool(
    "create_campaign",
    "Cria uma campanha (sempre PAUSED — sem custo até ativar). Para OUTCOME_LEADS sem orçamento de campanha (ABO), o flag is_adset_budget_sharing_enabled=false é aplicado automaticamente. Definir daily_budget/lifetime_budget aqui = CBO.",
    {
      ...ACCOUNT_SCHEMA,
      name: z.string().describe("Nome da campanha."),
      objective: z
        .string()
        .describe("Objetivo (ex: OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS)."),
      status: STATUS_ENUM.optional().describe("Padrão PAUSED. Ative depois com set_status."),
      special_ad_categories: z
        .array(z.string())
        .optional()
        .describe("Categorias especiais (ex: ['HOUSING','EMPLOYMENT','CREDIT']). Padrão []."),
      buying_type: z.string().optional().describe("AUCTION (padrão) ou RESERVED."),
      daily_budget: z.number().optional().describe("Orçamento diário em CENTAVOS (2000 = R$20). Define CBO."),
      lifetime_budget: z.number().optional().describe("Orçamento total em CENTAVOS. Define CBO."),
      bid_strategy: z.string().optional().describe("Só com CBO. Padrão LOWEST_COST_WITHOUT_CAP."),
    },
    async (args) => {
      try {
        return json(
          await client.createCampaign({
            name: args.name as string,
            objective: args.objective as string,
            accountId: accountIdFrom(args),
            status: args.status as string | undefined,
            specialAdCategories: args.special_ad_categories as string[] | undefined,
            buyingType: args.buying_type as string | undefined,
            dailyBudget: args.daily_budget as number | undefined,
            lifetimeBudget: args.lifetime_budget as number | undefined,
            bidStrategy: args.bid_strategy as string | undefined,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_adset",
    "Cria um conjunto de anúncios (sempre PAUSED). bid_strategy default LOWEST_COST_WITHOUT_CAP. Se instagram_positions tiver explore_home, 'explore' é adicionado automaticamente. Para conversão no site passe promoted_object={pixel_id, custom_event_type} e destination_type=WEBSITE. Para vários conjuntos parecidos, prefira create_adsets_batch.",
    {
      ...ACCOUNT_SCHEMA,
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
        return json(await client.createAdSet(adsetParamsFrom(args, accountIdFrom(args))));
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_creative",
    "Cria um criativo. Para vídeo, se o video_data não tiver image_hash/image_url, o thumbnail é buscado automaticamente do vídeo. O display link fica em call_to_action.value.link_caption. ATENÇÃO: object_story_spec + asset_feed_spec juntos (ex: WhatsApp addon) pode falhar com erro 3 se o app não tiver capability de Marketing Partner.",
    {
      ...ACCOUNT_SCHEMA,
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
        return json(
          await client.createAdCreative({
            accountId: accountIdFrom(args),
            name: args.name as string,
            objectStorySpec: args.object_story_spec as Record<string, unknown> | undefined,
            assetFeedSpec: args.asset_feed_spec as Record<string, unknown> | undefined,
            instagramUserId: args.instagram_user_id as string | undefined,
            urlTags: args.url_tags as string | undefined,
            degreesOfFreedomSpec: args.degrees_of_freedom_spec as Record<string, unknown> | undefined,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  server.tool(
    "create_ad",
    "Cria um anúncio (sempre PAUSED) ligando um conjunto a um criativo existente.",
    {
      ...ACCOUNT_SCHEMA,
      name: z.string().describe("Nome do anúncio."),
      adset_id: z.string().describe("ID do conjunto."),
      creative_id: z.string().describe("ID do criativo (de create_creative)."),
      conversion_domain: z.string().optional().describe("Domínio de conversão (ex: 'plugguest.com.br')."),
      degrees_of_freedom_spec: z.record(z.unknown()).optional().describe("OPT_OUT de creative features."),
      status: STATUS_ENUM.optional().describe("Padrão PAUSED."),
    },
    async (args) => {
      try {
        return json(
          await client.createAd({
            accountId: accountIdFrom(args),
            name: args.name as string,
            adsetId: args.adset_id as string,
            creativeId: args.creative_id as string,
            conversionDomain: args.conversion_domain as string | undefined,
            degreesOfFreedomSpec: args.degrees_of_freedom_spec as Record<string, unknown> | undefined,
            status: args.status as string | undefined,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Criação em lote (#1) ─────────────────────────────────────────────────────
  server.tool(
    "create_adsets_batch",
    "Cria VÁRIOS conjuntos de uma vez a partir de um template (base) + lista de variações — ideal para dividir por idade, geo, público, etc. Se creative_id for passado, cria também um anúncio por conjunto. Use dry_run=true para revisar o plano antes de criar. Não interrompe no erro: reporta sucesso/falha por item. Tudo PAUSED.",
    {
      ...ACCOUNT_SCHEMA,
      campaign_id: z.string().describe("ID da campanha mãe."),
      base: z
        .record(z.unknown())
        .describe(
          "Campos compartilhados por todos os conjuntos: optimization_goal, billing_event, bid_strategy, daily_budget (centavos), targeting (base), promoted_object, destination_type, attribution_spec, status."
        ),
      variations: z
        .array(z.record(z.unknown()))
        .describe(
          "Lista de variações. Cada item precisa de 'name' e pode sobrescrever qualquer campo do base. Para mudar idade: {name:'18-24', targeting:{age_min:18,age_max:24}} (o targeting é mesclado com o do base)."
        ),
      creative_id: z
        .string()
        .optional()
        .describe("Se passado, cria um anúncio por conjunto usando este criativo."),
      ad_name_prefix: z.string().optional().describe("Prefixo do nome dos anúncios (padrão usa o nome do conjunto)."),
      dry_run: z.boolean().optional().describe("true = só devolve o plano resolvido, sem criar nada."),
    },
    async (args) => {
      try {
        const accountId = accountIdFrom(args);
        const campaignId = args.campaign_id as string;
        const base = (args.base ?? {}) as Record<string, unknown>;
        const variations = (args.variations ?? []) as Array<Record<string, unknown>>;
        const creativeId = args.creative_id as string | undefined;
        const adPrefix = args.ad_name_prefix as string | undefined;

        if (!variations.length) return toolError("variations vazio: passe ao menos um conjunto.");

        // Resolve cada conjunto: base + variação (targeting é mesclado).
        const planned = variations.map((v, i) => {
          if (!v["name"]) throw new Error(`variação ${i + 1} sem 'name'.`);
          const merged: Record<string, unknown> = { ...base, ...v };
          merged["targeting"] = {
            ...((base["targeting"] as Record<string, unknown>) ?? {}),
            ...((v["targeting"] as Record<string, unknown>) ?? {}),
          };
          merged["campaign_id"] = campaignId;
          return merged;
        });

        if (args.dry_run === true) {
          return json({
            status: "DRY_RUN",
            campaign_id: campaignId,
            total_conjuntos: planned.length,
            cria_anuncios: !!creativeId,
            plano: planned,
          });
        }

        const results: Array<Record<string, unknown>> = [];
        for (const cfg of planned) {
          const name = cfg["name"] as string;
          try {
            const adset = await client.createAdSet(adsetParamsFrom(cfg, accountId));
            const item: Record<string, unknown> = { name, adset_id: adset.id };
            if (creativeId) {
              const ad = await client.createAd({
                accountId,
                name: adPrefix ? `${adPrefix} | ${name}` : name,
                adsetId: adset.id,
                creativeId,
              });
              item["ad_id"] = ad.id;
            }
            results.push(item);
          } catch (e) {
            results.push({ name, error: (e as Error).message });
          }
        }

        const ok = results.filter((r) => !r["error"]).length;
        return json({
          status: "OK",
          campaign_id: campaignId,
          criados: ok,
          falhas: results.length - ok,
          resultados: results,
        });
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Mídia (upload — inerte, sem trava) ───────────────────────────────────────
  server.tool(
    "create_video",
    "Envia um vídeo para a conta a partir de uma URL (a Meta baixa o arquivo). Retorna o video_id para usar no criativo (o thumbnail é resolvido automaticamente ao criar o criativo).",
    {
      ...ACCOUNT_SCHEMA,
      file_url: z.string().describe("URL pública do arquivo de vídeo (.mp4 etc)."),
      name: z.string().optional().describe("Nome interno do vídeo."),
      title: z.string().optional().describe("Título do vídeo."),
      description: z.string().optional().describe("Descrição do vídeo."),
    },
    async (args) => {
      try {
        return json(
          await client.createVideo({
            accountId: accountIdFrom(args),
            fileUrl: args.file_url as string,
            name: args.name as string | undefined,
            title: args.title as string | undefined,
            description: args.description as string | undefined,
          })
        );
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
      url: z.string().describe("URL pública da imagem (.jpg/.png/.webp)."),
      name: z.string().optional().describe("Nome interno da imagem."),
    },
    async (args) => {
      try {
        return json(
          await client.createImage({
            accountId: accountIdFrom(args),
            url: args.url as string,
            name: args.name as string | undefined,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Públicos (criação — inerte, sem trava) ───────────────────────────────────
  server.tool(
    "create_custom_audience",
    [
      "Cria um público personalizado. Sem `rule` = público vazio (preencher depois ou upload de lista).",
      "Com `rule` = público de regra. NÃO passar subtype — a API infere automaticamente (pixel→WEBSITE, ig_business→IG_BUSINESS). Passar subtype com rule causa erro.",
      "",
      "ESTRUTURA da rule (JSON em string). Vários critérios em OR = vários objetos em `rules`,",
      "mas SOMENTE da mesma fonte (IG+IG ou pixel+pixel). Misturar pixel+IG no mesmo público NÃO",
      "é suportado — para cruzar site+Insta, crie 2 públicos e combine no conjunto de anúncios. `id` vai numérico.",
      '{"inclusions":{"operator":"or","rules":[{"event_sources":[{"type":"<pixel|ig_business>","id":<ID>}],"retention_seconds":<seg>,"filter":{...}}]}}',
      "",
      "EVENTOS INSTAGRAM (type=ig_business, filter event eq <value>) — literais universais:",
      "- ig_business_profile_all = interagiu com a conta profissional",
      "- ig_business_profile_visit = visitou o perfil",
      "- ig_business_profile_engaged = interagiu com qualquer post/anúncio",
      "- ig_business_profile_user_messaged = enviou mensagem",
      "- ig_business_profile_ad_saved = salvou post/anúncio",
      "- INSTAGRAM_PROFILE_FOLLOW = começou a seguir (MAIÚSCULO; usar retention_seconds 0)",
      "",
      "EVENTOS PIXEL/SITE (type=pixel):",
      '- evento padrão: filter {"field":"event","operator":"eq","value":"Lead"} (ou Purchase/InitiateCheckout/ViewContent)',
      '- todos os visitantes: filter {"field":"url","operator":"i_contains","value":""} + adicionar "template":"ALL_VISITORS" no objeto da regra (NÃO é event=PageView)',
      "",
      "retention_seconds: 7D=604800 15D=1296000 30D=2592000 60D=5184000 90D=7776000 180D=15552000 365D=31536000.",
      "Os IDs (pixel, ig_business) são por conta: pegue com get_custom_audience num público existente ou list_pixels.",
      "Dúvida sobre algum literal? Inspecione um público real com get_custom_audience e copie a rule.",
    ].join("\n"),
    {
      ...ACCOUNT_SCHEMA,
      name: z.string().describe("Nome do público."),
      subtype: z.string().optional().describe("Padrão CUSTOM. Outros: WEBSITE, ENGAGEMENT, etc."),
      description: z.string().optional().describe("Descrição."),
      customer_file_source: z
        .string()
        .optional()
        .describe("Origem dos dados (ex: USER_PROVIDED_ONLY) quando for upload de lista."),
      rule: z
        .string()
        .optional()
        .describe(
          'Regra de segmentação em JSON (string). Ex pixel/Lead 180D: {"inclusions":{"operator":"or","rules":[{"event_sources":[{"type":"pixel","id":959959936733237}],"retention_seconds":15552000,"filter":{"operator":"and","filters":[{"field":"event","operator":"eq","value":"Lead"}]}}]}}. Ex IG visitou perfil 90D: {"inclusions":{"operator":"or","rules":[{"event_sources":[{"type":"ig_business","id":7216187821753505}],"retention_seconds":7776000,"filter":{"operator":"and","filters":[{"field":"event","operator":"eq","value":"ig_business_profile_visit"}]}}]}}. Combinar = mais objetos em rules (mesma fonte). Ver dicionário de eventos na descrição do tool; copie literais de um público real com get_custom_audience.'
        ),
      prefill: z
        .boolean()
        .optional()
        .describe("Se true, inclui pessoas que já cumpriram a regra no passado (retroativo)."),
      retention_days: z
        .number()
        .optional()
        .describe("Janela de retenção em dias (regras simples; em regras flexíveis a janela vem do retention_seconds dentro da rule)."),
    },
    async (args) => {
      try {
        let parsedRule: Record<string, unknown> | undefined;
        if (args.rule !== undefined) {
          try {
            parsedRule = JSON.parse(args.rule as string);
          } catch {
            return toolError("Parâmetro `rule` inválido: não é um JSON válido.");
          }
        }
        return json(
          await client.createCustomAudience({
            accountId: accountIdFrom(args),
            name: args.name as string,
            subtype: args.subtype as string | undefined,
            description: args.description as string | undefined,
            customerFileSource: args.customer_file_source as string | undefined,
            rule: parsedRule,
            prefill: args.prefill as boolean | undefined,
            retentionDays: args.retention_days as number | undefined,
          })
        );
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
      name: z.string().describe("Nome do lookalike."),
      source_audience_id: z.string().describe("ID do público de origem."),
      spec: z.record(z.unknown()).describe("Spec do lookalike (ex: {country:'BR', ratio:0.01})."),
    },
    async (args) => {
      try {
        return json(
          await client.createLookalike({
            accountId: accountIdFrom(args),
            name: args.name as string,
            sourceAudienceId: args.source_audience_id as string,
            spec: args.spec as Record<string, unknown>,
          })
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ─── Duplicação (cópia PAUSED — sem trava) ────────────────────────────────────
  server.tool(
    "duplicate_object",
    "Duplica uma campanha, conjunto ou anúncio (cópia sempre PAUSED). Para campanha, deep_copy=true copia também conjuntos e anúncios.",
    {
      id: z.string().describe("ID do objeto a duplicar."),
      object_type: z.enum(["campaign", "adset", "ad"]).describe("Tipo do objeto."),
      deep_copy: z.boolean().optional().describe("Só para campanha: copia conjuntos e anúncios também."),
    },
    async (args) => {
      try {
        return json(
          await client.duplicateObject(
            args.id as string,
            args.object_type as "campaign" | "adset" | "ad",
            { deepCopy: args.deep_copy as boolean | undefined }
          )
        );
      } catch (e) {
        return toolError((e as Error).message);
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // AÇÕES DE RISCO (gastam ou destroem) — exigem confirm=true
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    "update_object",
    "Edita campos de uma campanha, conjunto ou anúncio pelo ID (name, daily_budget em centavos, lifetime_budget, targeting, bid_amount, etc). Para apenas mudar status prefira set_status. Exige confirm=true.",
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

  server.tool(
    "set_status",
    "Muda o status de uma campanha/conjunto/anúncio (ACTIVE, PAUSED, ARCHIVED). Ao ATIVAR uma campanha, ativa em cascata todos os conjuntos e anúncios dentro dela. Exige confirm=true.",
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

  server.tool(
    "swap_url_tags",
    "Troca os url_tags (UTMs) de um anúncio. Como criativos são imutáveis, recria o criativo com os UTMs novos (reusando o post original) e aponta o anúncio para ele. Mexe num anúncio existente — exige confirm=true.",
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

  server.tool(
    "schedule_budget_increase",
    "Programa um aumento de orçamento num conjunto durante um período (a 'Programação do orçamento' da interface). budget_value em CENTAVOS. ABSOLUTE = orçamento alvo no período; MULTIPLIER = fator sobre o orçamento base. Afeta gasto — exige confirm=true.",
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
        const p = {
          timeStart: toUnix(args.time_start as string | number),
          timeEnd: toUnix(args.time_end as string | number),
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
}

/** Monta os params de createAdSet a partir de um objeto de args/config. */
function adsetParamsFrom(a: Record<string, unknown>, accountId?: string) {
  return {
    accountId,
    name: a["name"] as string,
    campaignId: a["campaign_id"] as string,
    optimizationGoal: a["optimization_goal"] as string,
    billingEvent: a["billing_event"] as string | undefined,
    bidStrategy: a["bid_strategy"] as string | undefined,
    dailyBudget: a["daily_budget"] as number | undefined,
    lifetimeBudget: a["lifetime_budget"] as number | undefined,
    bidAmount: a["bid_amount"] as number | undefined,
    targeting: (a["targeting"] ?? {}) as Record<string, unknown>,
    promotedObject: a["promoted_object"] as Record<string, unknown> | undefined,
    destinationType: a["destination_type"] as string | undefined,
    attributionSpec: a["attribution_spec"] as unknown[] | undefined,
    startTime: a["start_time"] as string | undefined,
    endTime: a["end_time"] as string | undefined,
    status: a["status"] as string | undefined,
  };
}
