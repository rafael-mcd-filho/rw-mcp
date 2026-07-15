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

const TOPIC_TYPE_ENUM = z.enum(["STANDARD", "EVENT", "OFFER"]);

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
}
