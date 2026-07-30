// Registro das tools de inteligência (diagnóstico e auditoria). Mantido fora do
// server.ts para não inchá-lo. Resolve cliente → IDs + contexto, busca por canal,
// monta snapshots e roda o motor de inteligência.

import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MetaAdsClient } from "../meta-api.js";
import { buildAccountReport } from "../report.js";
import {
  googleAdsConfigured,
  getGoogleAdsAccountReport,
  getGoogleAdsKeywords,
  getGoogleAdsSearchTerms,
  getGoogleAdsAdGroups,
  getGoogleAdsAds,
  getGoogleAdsConversionActions,
  getGoogleAdsPerformanceBreakdowns,
  getGoogleAdsAuctionInsights,
} from "../google-ads-api.js";
import { findClient, clientsConfigured, clientContexto, type ClientRecord } from "../clients-db.js";
import { resolveNiche } from "../intelligence/niche.js";
import { googleSnapshot, metaSnapshot } from "../intelligence/snapshot.js";
import { auditBusinessProfile, buildAnalysis } from "../intelligence/audit.js";
import type { AccountSnapshot } from "../intelligence/quality-gates.js";
import { renderAnalysisHtml } from "../intelligence/intelligence-pdf.js";
import { googleBusinessConfigured } from "../google-business-api.js";
import { buildGoogleBusinessProfileReport } from "../google-business-report.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function toolError(msg: string) {
  return { content: [{ type: "text" as const, text: msg }] };
}

const onlyDigits = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  return String(v).replace(/-/g, "").trim() || undefined;
};
const scalar = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
};

interface IntelArgs {
  nome_cliente?: string;
  client_name?: string;
  nomeCliente?: string;
  cliente?: string;
  client?: string;
  meta_account_id?: string | number;
  id_conta_meta_ads?: string | number;
  google_customer_id?: string | number;
  id_conta_google?: string | number;
  contexto_cliente?: string;
  nicho?: string;
  since?: string;
  until?: string;
  start_date?: string;
  end_date?: string;
  date_preset?: string;
  preset?: string;
  incluir_meta?: boolean;
  incluir_google?: boolean;
  incluir_perfil_google?: boolean;
}

const INTEL_SCHEMA = {
  nome_cliente: z.string().optional().describe("Nome do cliente na base. Resolve IDs Meta/Google e o contexto automaticamente."),
  client_name: z.string().optional().describe("Nome de exibição quando os IDs Meta/Google forem informados diretamente, sem cadastro na base."),
  meta_account_id: z.union([z.string(), z.number()]).optional().describe("ID da conta Meta Ads (se não usar nome_cliente)."),
  google_customer_id: z.union([z.string(), z.number()]).optional().describe("ID da conta Google Ads, sem traços (se não usar nome_cliente)."),
  contexto_cliente: z.string().optional().describe("Texto livre com nicho + sobre a empresa. Sobrescreve o da base."),
  nicho: z.string().optional().describe("Força o nicho do benchmark (alimentacao_delivery, franquias, saude_estetica, servicos_locais, imoveis, educacao, infoprodutos, ecommerce_moda, ecommerce_tech, saas_b2b, financeiro, geral)."),
  since: z.string().optional().describe("Data início YYYY-MM-DD."),
  until: z.string().optional().describe("Data fim YYYY-MM-DD."),
  date_preset: z.string().optional().describe("Alternativa a since/until (ex.: last_7d, last_30d)."),
  incluir_meta: z.boolean().optional().describe("Se false, não busca Meta. Padrão: true (se houver ID)."),
  incluir_google: z.boolean().optional().describe("Se false, não busca Google. Padrão: true (se houver ID)."),
  incluir_perfil_google: z.boolean().optional().describe("Se false, não audita o Perfil da Empresa. Padrão: true quando houver perfil com o mesmo nome do cliente."),
  formato: z.enum(["pdf", "html"]).optional().describe("'pdf' gera PDF para entrega (padrão ao informar este campo); 'html' gera dashboard navegável. Omita para retornar JSON."),
};

function periodOf(a: IntelArgs) {
  const since = a.since ?? a.start_date;
  const until = a.until ?? a.end_date;
  const preset = a.date_preset ?? a.preset;
  const label = since && until ? `${since} a ${until}` : preset ?? "últimos 30 dias";
  const month = until ? Number(until.slice(5, 7)) : new Date().getMonth() + 1;
  return { since, until, preset, label, month: Number.isFinite(month) ? month : undefined };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function resolvedPeriods(a: IntelArgs): {
  current: { since?: string; until?: string; preset?: string };
  previous?: { since: string; until: string };
  baseline28?: { since: string; until: string };
} {
  const current = periodOf(a);
  let since = current.since;
  let until = current.until;
  if (!since || !until) {
    const presetDays: Record<string, number> = {
      last_7d: 7,
      last_14d: 14,
      last_28d: 28,
      last_30d: 30,
      last_90d: 90,
      yesterday: 1,
    };
    const days = presetDays[current.preset ?? ""];
    if (days) {
      const end = new Date();
      if (current.preset === "yesterday") end.setUTCDate(end.getUTCDate() - 1);
      until = isoDate(end);
      since = addDays(until, -(days - 1));
    }
  }
  if (!since || !until) {
    return { current: { since: current.since, until: current.until, preset: current.preset } };
  }
  const duration = Math.max(
    1,
    Math.round((new Date(`${until}T12:00:00Z`).getTime() - new Date(`${since}T12:00:00Z`).getTime()) / 86_400_000) + 1
  );
  return {
    current: { since, until, preset: undefined },
    previous: {
      since: addDays(since, -duration),
      until: addDays(since, -1),
    },
    baseline28: {
      since: addDays(until, -27),
      until,
    },
  };
}

function businessPeriod(a: IntelArgs): { since: string; until: string } {
  const exact = periodOf(a);
  if (exact.since && exact.until) return { since: exact.since, until: exact.until };
  const days = exact.preset === "last_7d" ? 7 : exact.preset === "last_14d" ? 14 : 30;
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    since: start.toISOString().slice(0, 10),
    until: end.toISOString().slice(0, 10),
  };
}

async function resolveClient(a: IntelArgs): Promise<{
  cliente: string;
  metaId?: string;
  googleId?: string;
  contexto?: string;
  record?: ClientRecord;
}> {
  const nome = scalar(a.nome_cliente ?? a.nomeCliente ?? a.cliente ?? a.client);
  const displayName = scalar(a.client_name);
  let record: ClientRecord | undefined;
  if (nome && clientsConfigured()) {
    record = await findClient(nome);
    if (!record) throw new Error(`Cliente "${nome}" não encontrado na base.`);
  }
  const metaId = scalar(a.meta_account_id ?? a.id_conta_meta_ads) ?? record?.id_conta_meta_ads;
  const googleId = onlyDigits(a.google_customer_id ?? a.id_conta_google ?? record?.id_conta_google);
  const contexto =
    scalar(a.contexto_cliente) ??
    clientContexto(record) ??
    record?.nome_cliente ??
    displayName ??
    nome;
  return {
    cliente: record?.nome_cliente ?? displayName ?? nome ?? "Cliente",
    metaId: metaId || undefined,
    googleId: googleId || undefined,
    contexto,
    record,
  };
}

/** Busca os canais pedidos e devolve os snapshots + avisos de falha por canal. */
async function buildSnapshots(
  a: IntelArgs,
  metaClient: MetaAdsClient
): Promise<{ cliente: string; periodo: string; nicho: ReturnType<typeof resolveNiche>; snapshots: AccountSnapshot[]; avisos: string[] }> {
  const { cliente, metaId, googleId, contexto, record } = await resolveClient(a);
  const { since, until, preset, label, month } = periodOf(a);
  const periods = resolvedPeriods(a);
  // Preferência: nicho forçado no argumento → nicho da IA (n8n) → contexto livre.
  const niche = resolveNiche(scalar(a.nicho) ?? record?.nicho, contexto);

  const wantsMeta = (a.incluir_meta ?? true) && !!metaId;
  const wantsGoogle = (a.incluir_google ?? true) && !!googleId && googleAdsConfigured();
  const snapshots: AccountSnapshot[] = [];
  const avisos: string[] = [];

  if (wantsMeta && metaId) {
    try {
      const [
        rows, adsetRows, adRows,
        previousRows, previousAdRows, baselineRows,
      ] = await Promise.all([
        metaClient.getInsights({ level: "campaign", since, until, datePreset: preset, accountId: metaId }),
        metaClient.getInsights({ level: "adset", since, until, datePreset: preset, accountId: metaId }).catch(() => []),
        metaClient.getInsights({ level: "ad", since, until, datePreset: preset, accountId: metaId }).catch(() => []),
        periods.previous
          ? metaClient.getInsights({ level: "campaign", since: periods.previous.since, until: periods.previous.until, accountId: metaId }).catch(() => [])
          : Promise.resolve([]),
        periods.previous
          ? metaClient.getInsights({ level: "ad", since: periods.previous.since, until: periods.previous.until, accountId: metaId }).catch(() => [])
          : Promise.resolve([]),
        periods.baseline28
          ? metaClient.getInsights({ level: "campaign", since: periods.baseline28.since, until: periods.baseline28.until, accountId: metaId }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const account = buildAccountReport(rows, label);
      const previousAccount = previousRows.length
        ? buildAccountReport(previousRows, `${periods.previous?.since} a ${periods.previous?.until}`)
        : undefined;
      const baselineAccount = baselineRows.length
        ? buildAccountReport(baselineRows, `${periods.baseline28?.since} a ${periods.baseline28?.until}`)
        : undefined;
      snapshots.push(metaSnapshot(account as Parameters<typeof metaSnapshot>[0], {
        niche: niche.niche,
        month,
        rawCampaigns: rows,
        adsets: adsetRows,
        ads: adRows,
        previousAccount: previousAccount as Parameters<typeof metaSnapshot>[1]["previousAccount"],
        previousCampaigns: previousRows,
        previousAds: previousAdRows,
        baselineAccount: baselineAccount as Parameters<typeof metaSnapshot>[1]["baselineAccount"],
        baselineCampaigns: baselineRows,
      }));
    } catch (e) {
      avisos.push(`Meta Ads falhou: ${(e as Error).message}`);
    }
  }

  if (wantsGoogle && googleId) {
    try {
      const [
        report, keywords, searchTerms, adGroups, ads,
        previousReport, baselineReport, conversionActions, segments, auctionInsights,
      ] = await Promise.all([
        getGoogleAdsAccountReport(googleId, since, until, preset),
        getGoogleAdsKeywords(googleId, since, until, preset, 25).catch(() => []),
        getGoogleAdsSearchTerms(googleId, since, until, preset, 100).catch(() => []),
        getGoogleAdsAdGroups(googleId, since, until, preset).catch(() => []),
        getGoogleAdsAds(googleId, since, until, preset).catch(() => []),
        periods.previous
          ? getGoogleAdsAccountReport(googleId, periods.previous.since, periods.previous.until).catch(() => undefined)
          : Promise.resolve(undefined),
        periods.baseline28
          ? getGoogleAdsAccountReport(googleId, periods.baseline28.since, periods.baseline28.until).catch(() => undefined)
          : Promise.resolve(undefined),
        getGoogleAdsConversionActions(googleId, since, until, preset).catch(() => []),
        getGoogleAdsPerformanceBreakdowns(googleId, since, until, preset).catch(() => []),
        getGoogleAdsAuctionInsights(googleId, since, until, preset).catch(() => []),
      ]);
      snapshots.push(googleSnapshot(report, {
        keywords,
        searchTerms,
        adGroups,
        ads,
        previousReport,
        baselineReport,
        conversionActions,
        segments,
        auctionInsights,
        businessContext: [cliente, contexto, niche.label].filter(Boolean).join(" "),
        niche: niche.niche,
        month,
      }));
    } catch (e) {
      avisos.push(`Google Ads falhou: ${(e as Error).message}`);
    }
  }

  if (!snapshots.length) {
    throw new Error(
      "Não foi possível montar a análise: informe nome_cliente com IDs cadastrados, ou meta_account_id / google_customer_id. " +
        (avisos.length ? `Detalhe: ${avisos.join("; ")}` : "")
    );
  }

  return { cliente, periodo: label, nicho: niche, snapshots, avisos };
}

function formatoFrom(args: { formato?: string }): "pdf" | "html" | "json" {
  if (args.formato === "html") return "html";
  if (args.formato === "pdf") return "pdf";
  return "json";
}

async function renderIntelPdfResponse(
  html: string,
  slug: string,
  formato: "pdf" | "html",
  avisos: string[]
) {
  const cleanSlug = slug
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .toLowerCase().slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  const avisosSuffix = avisos.length ? `\n\nAvisos: ${avisos.join("; ")}` : "";

  if (formato === "html") {
    if (process.env.VERCEL) {
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) return toolError("Falta BLOB_READ_WRITE_TOKEN para armazenar o HTML.");
      const { put } = await import("@vercel/blob");
      const name = `${cleanSlug}-${stamp}.html`;
      const result = await put(`relatorios/${name}`, html, {
        access: "public", token: blobToken,
        contentType: "text/html; charset=utf-8", addRandomSuffix: true,
      });
      return { content: [{ type: "text" as const, text: `HTML gerado:\n${result.url}${avisosSuffix}` }] };
    }
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "reports");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${cleanSlug}-${stamp}.html`);
    writeFileSync(filePath, html, "utf8");
    return { content: [{ type: "text" as const, text: `HTML gerado:\n${filePath}${avisosSuffix}` }] };
  }

  // PDF
  const pdfLib = await import("../pdf.js");
  if (process.env.VERCEL) {
    const { pdf, pageCount } = await pdfLib.renderHtmlPdf(html);
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return toolError(
        `PDF renderizado (${pageCount} pgs, ${Math.round(pdf.length / 1024)} KB), mas falta BLOB_READ_WRITE_TOKEN.`
      );
    }
    const { put } = await import("@vercel/blob");
    const result = await put(`relatorios/${cleanSlug}-${stamp}.pdf`, pdf, {
      access: "public", token: blobToken, contentType: "application/pdf", addRandomSuffix: true,
    });
    return {
      content: [{ type: "text" as const, text: `PDF gerado (${pageCount} pgs):\n${result.url}${avisosSuffix}` }],
    };
  }
  const result = await pdfLib.saveHtmlPdf(html, cleanSlug);
  const publicBase = process.env.PUBLIC_BASE_URL;
  const where = publicBase
    ? `${publicBase.replace(/\/$/, "")}/files/${basename(result.pdfPath)}`
    : result.pdfPath;
  return {
    content: [{
      type: "text" as const,
      text: `PDF gerado (${result.pageCount} pgs):\n${where}${avisosSuffix}`,
    }],
  };
}

export function registerIntelligenceTools(server: McpServer, metaClient: MetaAdsClient): void {
  // Diagnóstico e auditoria foram unificados num único produto "Análise".
  // Cadência (ping diário vs revisão profunda) é resolvida pelo formato de saída,
  // não por escolher entre tools: formato=json devolve um resumo curto (campo
  // 'mensagem', ideal p/ WhatsApp/n8n), pdf/html entregam o documento completo.
  const runAnalysis = async (args: IntelArgs) => {
    try {
      const { cliente, periodo, nicho, snapshots, avisos } = await buildSnapshots(args, metaClient);
      const result = buildAnalysis({
        cliente, periodo, nicho: nicho.label, nicho_confianca: nicho.confidence, snapshots,
      });
      if ((args.incluir_perfil_google ?? true) && googleBusinessConfigured()) {
        const range = businessPeriod(args);
        const profile = await buildGoogleBusinessProfileReport(cliente, range.since, range.until).catch(() => undefined);
        if (profile) {
          result.perfil_google = auditBusinessProfile(profile);
          result.mensagem +=
            `\n\n*Perfil da Empresa* — Health Score ${result.perfil_google.score}/100 (${result.perfil_google.grade})` +
            `\n${result.perfil_google.visualizacoes.toLocaleString("pt-BR")} visualizações · ` +
            `${result.perfil_google.rotas.toLocaleString("pt-BR")} rotas · nota ${result.perfil_google.nota_media.toFixed(1).replace(".", ",")}.`;
        }
      }
      const fmt = formatoFrom(args as { formato?: string });
      if (fmt !== "json") {
        const html = renderAnalysisHtml(result);
        return renderIntelPdfResponse(html, `analise-${cliente}`, fmt, avisos);
      }
      return json(
        avisos.length
          ? { ...result, _avisos: avisos, _nicho_evidencia: nicho.evidence }
          : { ...result, _nicho_evidencia: nicho.evidence }
      );
    } catch (e) {
      return toolError((e as Error).message);
    }
  };

  server.tool(
    "get_client_analysis",
    `Auditoria e diagnóstico V2 orientados ao objetivo: score geral e seis dimensões por canal, cobertura/confiança, comparação com período anterior e média de 28 dias, saturação e criativos Meta, visibilidade/Ad Rank/Quality Score/conversões/segmentações Google, gasto sob risco deduplicado, Perfil da Empresa quando encontrado e plano de ação. formato: omita para JSON, 'pdf' para entrega ou 'html' para dashboard.`,
    INTEL_SCHEMA,
    (args) => runAnalysis(args as IntelArgs)
  );

  // Aliases legados — mantidos só por compatibilidade com automações/n8n que ainda
  // chamam estes nomes. Agora ambos retornam a Análise completa unificada.
  const DEPRECATED =
    `[DEPRECADO — use get_client_analysis] Mantido por compatibilidade; retorna a Análise completa unificada (diagnóstico + auditoria).`;
  server.tool("get_client_diagnosis", DEPRECATED, INTEL_SCHEMA, (args) => runAnalysis(args as IntelArgs));
  server.tool("get_client_audit", DEPRECATED, INTEL_SCHEMA, (args) => runAnalysis(args as IntelArgs));
}
