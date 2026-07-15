// Registro das tools do Google Business Profile (avaliações + postagens).
// Espelha o padrão de confirmação do Meta/Google Ads write-tools: ações
// PÚBLICAS (responder review, publicar post, deletar) exigem confirm=true.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listBusinessAccounts,
  listBusinessLocations,
  listBusinessReviews,
  replyToBusinessReview,
  deleteBusinessReviewReply,
  listBusinessLocalPosts,
  createBusinessLocalPost,
  deleteBusinessLocalPost,
  getBusinessLocationDetail,
  searchBusinessCategories,
  updateBusinessLocation,
  getBusinessDailyMetrics,
  getBusinessSearchKeywords,
  DAILY_METRICS,
} from "../google-business-api.js";

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

/** Trava de confirmação: sem confirm=true devolve preview e não publica nada. */
function previewGuard(a: Record<string, unknown>, acao: string, detalhe: unknown) {
  if (isConfirmed(a)) return null;
  return json({
    status: "CONFIRMACAO_NECESSARIA",
    acao,
    sera_publicado: detalhe,
    aviso:
      "Nada foi publicado. Essa é uma ação PÚBLICA e visível no Perfil da Empresa no Google. Confirme com o usuário e chame de novo com confirm=true para executar.",
  });
}

const CONFIRM_SCHEMA = {
  confirm: z
    .boolean()
    .optional()
    .describe("Trava de segurança. false/omitido = apenas preview (nada é publicado). true = publica de fato."),
  confirmar: z.boolean().optional().describe("Alias de confirm."),
};

function accountIdFrom(a: Record<string, unknown>): string {
  const raw = a["account_id"] ?? a["accountId"];
  if (raw == null) throw new Error("Parâmetro obrigatório: account_id.");
  const id = String(raw).replace(/^accounts\//, "").trim();
  if (!id) throw new Error("Parâmetro obrigatório: account_id.");
  return id;
}

function locationIdFrom(a: Record<string, unknown>): string {
  const raw = a["location_id"] ?? a["locationId"];
  if (raw == null) throw new Error("Parâmetro obrigatório: location_id.");
  const id = String(raw).replace(/^locations\//, "").trim();
  if (!id) throw new Error("Parâmetro obrigatório: location_id.");
  return id;
}

function reviewIdFrom(a: Record<string, unknown>): string {
  const raw = a["review_id"] ?? a["reviewId"];
  if (raw == null) throw new Error("Parâmetro obrigatório: review_id.");
  const id = String(raw).replace(/^.*\/reviews\//, "").trim();
  if (!id) throw new Error("Parâmetro obrigatório: review_id.");
  return id;
}

function postIdFrom(a: Record<string, unknown>): string {
  const raw = a["post_id"] ?? a["postId"];
  if (raw == null) throw new Error("Parâmetro obrigatório: post_id.");
  const id = String(raw).replace(/^.*\/localPosts\//, "").trim();
  if (!id) throw new Error("Parâmetro obrigatório: post_id.");
  return id;
}

const ACCOUNT_SCHEMA = {
  account_id: z.union([z.string(), z.number()]).describe("ID da conta Business Profile (ver list_google_business_accounts)."),
  accountId: z.union([z.string(), z.number()]).optional().describe("Alias de account_id."),
};

const LOCATION_SCHEMA = {
  ...ACCOUNT_SCHEMA,
  location_id: z.union([z.string(), z.number()]).describe("ID do local/perfil (ver list_google_business_locations)."),
  locationId: z.union([z.string(), z.number()]).optional().describe("Alias de location_id."),
};

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function formatReview(r: {
  reviewId: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}) {
  return {
    review_id: r.reviewId,
    autor: r.reviewer?.displayName ?? null,
    nota: r.starRating ? STAR_MAP[r.starRating] ?? null : null,
    comentario: r.comment ?? null,
    criado_em: r.createTime ?? null,
    atualizado_em: r.updateTime ?? null,
    respondido: !!r.reviewReply?.comment,
    resposta: r.reviewReply?.comment ?? null,
    resposta_em: r.reviewReply?.updateTime ?? null,
  };
}

const CALL_TO_ACTION_ENUM = z.enum(["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"]);
const TOPIC_TYPE_ENUM = z.enum(["STANDARD", "EVENT", "OFFER"]);

function parseDateStr(label: string, s: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`${label} deve estar no formato AAAA-MM-DD.`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseTimeStr(label: string, s: string): { hours: number; minutes: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`${label} deve estar no formato HH:MM.`);
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

export function registerGoogleBusinessTools(server: McpServer): void {
  server.tool(
    "list_google_business_accounts",
    "Lista as contas do Google Business Profile acessíveis pelo token autorizado.",
    {},
    async () => {
      try {
        return json(await listBusinessAccounts());
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "list_google_business_locations",
    "Lista os locais (perfis de empresa/estabelecimentos) de uma conta Google Business Profile.",
    { ...ACCOUNT_SCHEMA },
    async (args) => {
      try {
        const accountId = accountIdFrom(args as Record<string, unknown>);
        return json(await listBusinessLocations(accountId));
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "list_google_business_reviews",
    "Lista as avaliações (reviews) de um local do Google Business Profile, com nota, comentário e se já foi respondida.",
    {
      ...LOCATION_SCHEMA,
      apenas_sem_resposta: z.boolean().optional().describe("Se true, retorna só avaliações ainda sem resposta."),
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);
        let reviews = await listBusinessReviews(accountId, locationId);
        if (a["apenas_sem_resposta"] === true) {
          reviews = reviews.filter((r) => !r.reviewReply?.comment);
        }
        return json(reviews.map(formatReview));
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "reply_google_business_review",
    "Responde (ou substitui a resposta existente de) uma avaliação no Google Business Profile. AÇÃO PÚBLICA — exige confirm=true.",
    {
      ...LOCATION_SCHEMA,
      review_id: z.string().describe("ID da avaliação (ver list_google_business_reviews)."),
      reviewId: z.string().optional().describe("Alias de review_id."),
      comment: z.string().min(1).describe("Texto da resposta."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);
        const reviewId = reviewIdFrom(a);
        const comment = String(a["comment"] ?? "").trim();
        if (!comment) return toolError("Parâmetro obrigatório: comment.");

        const guard = previewGuard(a, "responder_avaliacao", { account_id: accountId, location_id: locationId, review_id: reviewId, comment });
        if (guard) return guard;

        return json(await replyToBusinessReview(accountId, locationId, reviewId, comment));
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "delete_google_business_review_reply",
    "Remove a resposta publicada numa avaliação do Google Business Profile. AÇÃO PÚBLICA/IRREVERSÍVEL — exige confirm=true.",
    {
      ...LOCATION_SCHEMA,
      review_id: z.string().describe("ID da avaliação."),
      reviewId: z.string().optional().describe("Alias de review_id."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);
        const reviewId = reviewIdFrom(a);

        const guard = previewGuard(a, "deletar_resposta_avaliacao", { account_id: accountId, location_id: locationId, review_id: reviewId });
        if (guard) return guard;

        await deleteBusinessReviewReply(accountId, locationId, reviewId);
        return json({ status: "ok", review_id: reviewId });
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "list_google_business_posts",
    "Lista as postagens (local posts) publicadas no perfil do Google Business Profile.",
    { ...LOCATION_SCHEMA },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);
        return json(await listBusinessLocalPosts(accountId, locationId));
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "create_google_business_post",
    "Publica uma nova postagem (local post) no Perfil da Empresa no Google. Tipos: STANDARD (atualização simples, texto + imagem opcional), EVENT (com data/hora de início e fim), OFFER (evento + cupom/link de resgate — Google trata oferta como um evento com desconto). ALERT não é suportado (era exclusivo de avisos COVID-19 e o Google desativou a criação de novos). AÇÃO PÚBLICA — exige confirm=true.",
    {
      ...LOCATION_SCHEMA,
      topic_type: TOPIC_TYPE_ENUM.optional().describe("STANDARD (padrão), EVENT ou OFFER."),
      summary: z.string().min(1).describe("Texto da postagem."),
      call_to_action_type: CALL_TO_ACTION_ENUM.optional().describe("Tipo de botão de ação (opcional)."),
      call_to_action_url: z.string().url().optional().describe("URL do botão de ação (obrigatório se call_to_action_type != CALL)."),
      image_url: z.string().url().optional().describe("URL pública de uma imagem para a postagem (opcional)."),
      event_title: z.string().optional().describe("Obrigatório se topic_type=EVENT ou OFFER."),
      event_start_date: z.string().optional().describe("AAAA-MM-DD. Obrigatório se topic_type=EVENT ou OFFER."),
      event_start_time: z.string().optional().describe("HH:MM (24h). Opcional — evento sem hora marcada se omitido."),
      event_end_date: z.string().optional().describe("AAAA-MM-DD. Obrigatório se topic_type=EVENT ou OFFER."),
      event_end_time: z.string().optional().describe("HH:MM (24h). Opcional."),
      coupon_code: z.string().optional().describe("Só OFFER: código do cupom."),
      redeem_online_url: z.string().url().optional().describe("Só OFFER: link pra resgatar a oferta online."),
      terms_conditions: z.string().optional().describe("Só OFFER: termos e condições da oferta."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);
        const summary = String(a["summary"] ?? "").trim();
        if (!summary) return toolError("Parâmetro obrigatório: summary.");

        const topicType = (a["topic_type"] as string | undefined) ?? "STANDARD";
        const ctaType = a["call_to_action_type"] as string | undefined;
        const ctaUrl = a["call_to_action_url"] as string | undefined;
        const imageUrl = a["image_url"] as string | undefined;

        const post: Record<string, unknown> = { summary, topicType };
        if (ctaType) post.callToAction = { actionType: ctaType, ...(ctaUrl ? { url: ctaUrl } : {}) };
        if (imageUrl) post.media = [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }];

        if (topicType === "EVENT" || topicType === "OFFER") {
          const title = a["event_title"] as string | undefined;
          const startDate = a["event_start_date"] as string | undefined;
          const endDate = a["event_end_date"] as string | undefined;
          if (!title || !startDate || !endDate) {
            return toolError("EVENT/OFFER exigem event_title, event_start_date e event_end_date.");
          }
          post.event = {
            title,
            schedule: {
              startDate: parseDateStr("event_start_date", startDate),
              endDate: parseDateStr("event_end_date", endDate),
              ...(a["event_start_time"] ? { startTime: parseTimeStr("event_start_time", a["event_start_time"] as string) } : {}),
              ...(a["event_end_time"] ? { endTime: parseTimeStr("event_end_time", a["event_end_time"] as string) } : {}),
            },
          };
        }

        if (topicType === "OFFER") {
          const couponCode = a["coupon_code"] as string | undefined;
          const redeemOnlineUrl = a["redeem_online_url"] as string | undefined;
          const termsConditions = a["terms_conditions"] as string | undefined;
          if (couponCode || redeemOnlineUrl || termsConditions) {
            post.offer = {
              ...(couponCode ? { couponCode } : {}),
              ...(redeemOnlineUrl ? { redeemOnlineUrl } : {}),
              ...(termsConditions ? { termsConditions } : {}),
            };
          }
        }

        const guard = previewGuard(a, "criar_postagem", { account_id: accountId, location_id: locationId, ...post });
        if (guard) return guard;

        return json(await createBusinessLocalPost(accountId, locationId, post));
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "delete_google_business_post",
    "Remove uma postagem publicada no Perfil da Empresa no Google. AÇÃO PÚBLICA/IRREVERSÍVEL — exige confirm=true.",
    {
      ...LOCATION_SCHEMA,
      post_id: z.string().describe("ID da postagem (ver list_google_business_posts)."),
      postId: z.string().optional().describe("Alias de post_id."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);
        const postId = postIdFrom(a);

        const guard = previewGuard(a, "deletar_postagem", { account_id: accountId, location_id: locationId, post_id: postId });
        if (guard) return guard;

        await deleteBusinessLocalPost(accountId, locationId, postId);
        return json({ status: "ok", post_id: postId });
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  // ─── Performance + diagnóstico ─────────────────────────────────────────────

  server.tool(
    "get_google_business_performance",
    "Métricas de desempenho do perfil (Business Profile Performance API): impressões (Maps/Busca, desktop/mobile), cliques no site, cliques em 'ligar', pedidos de rota, conversas iniciadas. Padrão: últimos 90 dias, só totais.",
    {
      ...LOCATION_SCHEMA,
      since: z.string().optional().describe("Data inicial AAAA-MM-DD. Padrão: 90 dias atrás."),
      until: z.string().optional().describe("Data final AAAA-MM-DD. Padrão: hoje."),
      incluir_serie_diaria: z.boolean().optional().describe("Se true, inclui os pontos diários além do total. Padrão false."),
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const locationId = locationIdFrom(a);
        const { since, until } = defaultRange90d(a);

        const series = await getBusinessDailyMetrics(locationId, DAILY_METRICS, since, until);
        const incluirSerie = a["incluir_serie_diaria"] === true;

        return json({
          location_id: locationId,
          periodo: { desde: since, ate: until },
          metricas: series.map((s) => ({
            metrica: s.metric,
            total: s.points.reduce((sum, p) => sum + p.value, 0),
            ...(incluirSerie ? { serie_diaria: s.points } : {}),
          })),
        });
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "search_google_business_categories",
    "Busca categorias oficiais do Google (por nome, em português) — usar antes de update_google_business_profile pra descobrir o ID exato de uma categoria (formato categories/gcid:...).",
    {
      query: z.string().min(2).describe("Termo de busca, ex: 'agência de marketing', 'barbearia', 'ótica'."),
      region_code: z.string().optional().describe("Padrão BR."),
      language_code: z.string().optional().describe("Padrão pt."),
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const query = String(a["query"] ?? "").trim();
        if (!query) return toolError("Parâmetro obrigatório: query.");
        const region = (a["region_code"] as string | undefined) ?? "BR";
        const lang = (a["language_code"] as string | undefined) ?? "pt";
        return json(await searchBusinessCategories(query, region, lang));
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "update_google_business_profile",
    "Atualiza descrição e/ou categorias adicionais de um Perfil da Empresa no Google. IMPORTANTE: additional_category_ids SUBSTITUI a lista inteira de categorias adicionais (não soma) — confira as atuais em get_google_business_profile_health antes de chamar se quiser preservar alguma. Use search_google_business_categories pra achar os IDs. AÇÃO PÚBLICA — exige confirm=true.",
    {
      ...LOCATION_SCHEMA,
      description: z.string().max(750).optional().describe("Nova descrição do perfil (até 750 caracteres). Evite URLs, telefone ou linguagem promocional — o Google rejeita/oculta descrições assim."),
      additional_category_ids: z
        .array(z.string())
        .optional()
        .describe("Lista de categorias adicionais, formato 'categories/gcid:xxx' (ver search_google_business_categories). Substitui a lista atual inteira."),
      ...CONFIRM_SCHEMA,
    },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);
        const description = a["description"] as string | undefined;
        const additionalIds = a["additional_category_ids"] as string[] | undefined;

        if (!description && !additionalIds) {
          return toolError("Informe ao menos um de: description, additional_category_ids.");
        }

        const patch: Record<string, unknown> = {};
        const mask: string[] = [];

        if (description) {
          patch.profile = { description };
          mask.push("profile.description");
        }

        if (additionalIds) {
          const current = await getBusinessLocationDetail(locationId);
          const primary = current.categories?.primaryCategory;
          if (!primary) return toolError("Não foi possível ler a categoria primária atual — aplique manualmente pra não perdê-la.");
          patch.categories = {
            primaryCategory: { name: primary.name },
            additionalCategories: additionalIds.map((id) => ({ name: id.startsWith("categories/") ? id : `categories/${id}` })),
          };
          mask.push("categories");
        }

        const guard = previewGuard(a, "atualizar_perfil", { account_id: accountId, location_id: locationId, ...patch });
        if (guard) return guard;

        return json(await updateBusinessLocation(locationId, patch, mask));
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );

  server.tool(
    "get_google_business_profile_health",
    "Diagnóstico completo de 1 perfil do Google Business: completude do cadastro (categoria, descrição, horário), taxa de resposta a avaliações, cadência de postagens e métricas de performance dos últimos 90 dias — com uma lista de pontos de melhoria priorizados. Combina várias chamadas (mais lento que as tools individuais).",
    { ...LOCATION_SCHEMA },
    async (args) => {
      try {
        const a = args as Record<string, unknown>;
        const accountId = accountIdFrom(a);
        const locationId = locationIdFrom(a);

        const [detail, reviews, posts] = await Promise.all([
          getBusinessLocationDetail(locationId),
          listBusinessReviews(accountId, locationId),
          listBusinessLocalPosts(accountId, locationId),
        ]);

        const { since, until } = defaultRange90d({});
        let metrics: Awaited<ReturnType<typeof getBusinessDailyMetrics>> = [];
        try {
          metrics = await getBusinessDailyMetrics(locationId, DAILY_METRICS, since, until);
        } catch {
          // segue sem métricas — local pode ser muito novo ou sem dado suficiente
        }

        let keywords: Awaited<ReturnType<typeof getBusinessSearchKeywords>> = [];
        try {
          const now = new Date();
          const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          const past = new Date(now.getFullYear(), now.getMonth() - 6, 1);
          const startMonth = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}`;
          keywords = await getBusinessSearchKeywords(locationId, startMonth, endMonth);
        } catch {
          // idem
        }

        const metricTotal = (name: string) => metrics.find((m) => m.metric === name)?.points.reduce((s, p) => s + p.value, 0) ?? 0;
        const totalImpressoes =
          metricTotal("BUSINESS_IMPRESSIONS_DESKTOP_MAPS") +
          metricTotal("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") +
          metricTotal("BUSINESS_IMPRESSIONS_MOBILE_MAPS") +
          metricTotal("BUSINESS_IMPRESSIONS_MOBILE_SEARCH");
        const cliquesSite = metricTotal("WEBSITE_CLICKS");
        const cliquesLigar = metricTotal("CALL_CLICKS");
        const conversas = metricTotal("BUSINESS_CONVERSATIONS");
        const pedidosRota = metricTotal("BUSINESS_DIRECTION_REQUESTS");

        const totalReviews = reviews.length;
        const semResposta = reviews.filter((r) => !r.reviewReply?.comment).length;
        const taxaResposta = totalReviews > 0 ? Math.round(((totalReviews - semResposta) / totalReviews) * 1000) / 10 : null;

        const descricao = detail.profile?.description ?? "";
        const qtdCategoriasAdicionais = detail.categories?.additionalCategories?.length ?? 0;
        const verificado = !!detail.metadata?.hasVoiceOfMerchant;

        const posts_ordenados = [...posts].sort(
          (x, y) => new Date((y as { createTime?: string }).createTime ?? 0).getTime() - new Date((x as { createTime?: string }).createTime ?? 0).getTime()
        );
        const ultimoPost = posts_ordenados[0] as { createTime?: string } | undefined;
        const diasDesdeUltimoPost = ultimoPost?.createTime
          ? Math.round((Date.now() - new Date(ultimoPost.createTime).getTime()) / 86_400_000)
          : null;

        type Ponto = { prioridade: "alta" | "media"; achado: string };
        const pontos: Ponto[] = [];

        if (!verificado) {
          pontos.push({ prioridade: "alta", achado: "Perfil sem hasVoiceOfMerchant (não aparenta estar totalmente verificado) — pode limitar edição via API." });
        }
        if (descricao.length < 100) {
          pontos.push({ prioridade: "alta", achado: `Descrição do perfil muito curta (${descricao.length} de até 750 caracteres) — pouco conteúdo pra converter quem visita.` });
        }
        if (totalImpressoes > 0 && cliquesSite + cliquesLigar + conversas === 0) {
          pontos.push({ prioridade: "alta", achado: `${totalImpressoes} impressões em 90 dias sem nenhum clique de conversão (site/ligação/mensagem) — só ${pedidosRota} pedidos de rota.` });
        }
        if (totalReviews > 0 && semResposta > 0) {
          pontos.push({
            prioridade: semResposta / totalReviews > 0.5 ? "alta" : "media",
            achado: `${semResposta} de ${totalReviews} avaliações sem resposta (${(100 - (taxaResposta ?? 0)).toFixed(1)}% pendente).`,
          });
        }
        if (qtdCategoriasAdicionais === 0) {
          pontos.push({ prioridade: "media", achado: "Nenhuma categoria adicional cadastrada — só a primária, o que limita em quantas buscas o perfil aparece." });
        }
        if (keywords.length > 0 && keywords.length <= 3) {
          pontos.push({ prioridade: "media", achado: `Pouquíssimo volume de busca orgânica captado nos últimos 6 meses (${keywords.length} termo(s)) — SEO local fraco.` });
        }
        if (posts.length === 0) {
          pontos.push({ prioridade: "media", achado: "Nenhuma postagem no perfil — Google prioriza perfis ativos no ranking local." });
        } else if (diasDesdeUltimoPost != null && diasDesdeUltimoPost > 30) {
          pontos.push({ prioridade: "media", achado: `Último post há ${diasDesdeUltimoPost} dias — cadência de postagem baixa.` });
        }

        pontos.sort((x, y) => (x.prioridade === y.prioridade ? 0 : x.prioridade === "alta" ? -1 : 1));

        return json({
          location_id: locationId,
          titulo: detail.title,
          completude: {
            verificado,
            categoria_primaria: detail.categories?.primaryCategory?.displayName ?? null,
            categorias_adicionais: detail.categories?.additionalCategories?.map((c) => c.displayName) ?? [],
            descricao_chars: descricao.length,
            tem_horario: !!detail.regularHours?.periods?.length,
            tem_site: !!detail.websiteUri,
            tem_telefone: !!detail.phoneNumbers,
          },
          avaliacoes: { total: totalReviews, sem_resposta: semResposta, taxa_resposta_pct: taxaResposta },
          postagens: { total: posts.length, dias_desde_ultimo_post: diasDesdeUltimoPost },
          performance_90d: {
            periodo: { desde: since, ate: until },
            impressoes_totais: totalImpressoes,
            cliques_site: cliquesSite,
            cliques_ligar: cliquesLigar,
            conversas_iniciadas: conversas,
            pedidos_de_rota: pedidosRota,
          },
          termos_de_busca_6m: keywords.slice(0, 15),
          pontos_de_melhoria: pontos,
        });
      } catch (e) {
        return toolError(String(e instanceof Error ? e.message : e));
      }
    }
  );
}

function defaultRange90d(a: Record<string, unknown>): { since: string; until: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const until = (a["until"] as string | undefined) ?? iso(new Date());
  let since = a["since"] as string | undefined;
  if (!since) {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    since = iso(d);
  }
  return { since, until };
}
