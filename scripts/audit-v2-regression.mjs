import assert from "node:assert/strict";
import { buildAnalysis } from "../dist/src/intelligence/audit.js";

function baseSnapshot(platform, campaigns) {
  const gasto = campaigns.reduce((sum, item) => sum + item.gasto, 0);
  const impressoes = campaigns.reduce((sum, item) => sum + item.impressoes, 0);
  const cliques = campaigns.reduce((sum, item) => sum + item.cliques, 0);
  const conversoes = campaigns.reduce((sum, item) => sum + item.conversoes, 0);
  const resultado = campaigns.reduce((sum, item) => sum + item.primary_result, 0);
  return {
    channel: platform,
    platform,
    niche: "servicos_locais",
    objective: campaigns[0]?.objective ?? "lead_form",
    objective_label: campaigns[0]?.objective_label ?? "Teste",
    month: 7,
    resumo: {
      gasto,
      conversoes,
      cliques,
      impressoes,
      ctr: impressoes ? (cliques / impressoes) * 100 : 0,
      cpc_medio: cliques ? gasto / cliques : 0,
      custo_por_conversao: conversoes ? gasto / conversoes : null,
      primary_result: resultado,
      primary_result_label: campaigns[0]?.primary_result_label ?? "Resultados",
      cost_per_result: resultado ? gasto / resultado : null,
      cpm: impressoes ? (gasto / impressoes) * 1000 : 0,
      taxa_conversao: cliques ? (conversoes / cliques) * 100 : 0,
    },
    campanhas: campaigns,
  };
}

function campaign(overrides) {
  return {
    id: "1",
    nome: "Campanha",
    objective: "lead_form",
    objective_label: "Leads",
    primary_result_label: "Leads",
    primary_result: 0,
    cost_per_result: null,
    is_conversion_objective: true,
    gasto: 0,
    conversoes: 0,
    cliques: 0,
    impressoes: 0,
    ctr: 0,
    cpc_medio: 0,
    custo_por_conversao: null,
    cpm: 0,
    ...overrides,
  };
}

const awareness = baseSnapshot("meta", [
  campaign({
    nome: "Alcance e ThruPlay",
    objective: "awareness",
    objective_label: "Reconhecimento",
    primary_result_label: "Alcance",
    primary_result: 12_910,
    cost_per_result: 84.12 / 12_910,
    is_conversion_objective: false,
    gasto: 84.12,
    impressoes: 15_000,
    cliques: 50,
    ctr: 0.33,
    cpc_medio: 1.68,
    cpm: 5.61,
    alcance: 12_910,
    frequencia: 1.16,
  }),
]);
const awarenessResult = buildAnalysis({
  cliente: "Teste",
  periodo: "7 dias",
  nicho: "Serviços locais",
  nicho_confianca: "alta",
  snapshots: [awareness],
});
assert.equal(awarenessResult.gasto_sob_risco, 0, "alcance não pode virar gasto sob risco por zero conversões");
assert.equal(awarenessResult.canais[0].campanhas[0].veredito, "MANTER");
assert.equal(awarenessResult.canais[0].campanhas[0].custo_por_resultado > 0, true);

const smallLead = baseSnapshot("meta", [
  campaign({ gasto: 12, impressoes: 200, cliques: 2, cpm: 60 }),
]);
const smallLeadResult = buildAnalysis({
  cliente: "Teste",
  periodo: "7 dias",
  nicho: "Serviços locais",
  nicho_confianca: "alta",
  snapshots: [smallLead],
});
assert.equal(smallLeadResult.canais[0].campanhas[0].veredito, "OBSERVAR");
assert.equal(smallLeadResult.gasto_sob_risco, 0, "amostra pequena não pode ser chamada de risco");

const google = baseSnapshot("google", [
  campaign({
    nome: "Pesquisa",
    gasto: 100,
    impressoes: 1_000,
    cliques: 50,
    conversoes: 5,
    primary_result: 5,
    cost_per_result: 20,
    custo_por_conversao: 20,
    ctr: 5,
    cpc_medio: 2,
    cpm: 100,
  }),
]);
google.resumo.impression_share = 35;
google.resumo.is_perdida_orcamento = 15;
google.resumo.is_perdida_rank = 50;
google.termos = [{ termo: "termo teste", gasto: 45, conversoes: 0, cliques: 12, impressoes: 200, relevancia: "indeterminada" }];
google.keywords = [{ termo: "keyword teste", gasto: 45, conversoes: 0, cliques: 12, impressoes: 200, quality_score: 5 }];
google.conversionActions = [{
  nome: "Page view",
  conversoes: 5,
  todas_conversoes: 5,
  primaria: true,
  incluir_em_conversoes: true,
  categoria: "PAGE_VIEW",
}];
const googleResult = buildAnalysis({
  cliente: "Teste",
  periodo: "7 dias",
  nicho: "Serviços locais",
  nicho_confianca: "alta",
  snapshots: [google],
});
assert.equal(googleResult.gasto_sob_risco, 45, "termo e keyword não podem ser somados duas vezes");
assert.ok(googleResult.canais[0].alertas.some(alert => alert.id === "conversion-health:micro"));
assert.ok(googleResult.canais[0].alertas.some(alert => alert.id === "google-visibility"));

console.log("audit-v2: 7 assertions passed");

if (process.argv.includes("--render")) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { renderAnalysisHtml } = await import("../dist/src/intelligence/intelligence-pdf.js");
  const { renderHtmlPdf } = await import("../dist/src/pdf.js");

  awareness.previous = { gasto: 82, conversoes: 0, cliques: 65, impressoes: 14_300, ctr: 0.45, cpc: 1.26, cpm: 5.73, taxa_conversao: 0, resultado: 12_400, custo_por_resultado: 0.0066 };
  awareness.baseline28 = { gasto: 330, conversoes: 0, cliques: 260, impressoes: 58_000, ctr: 0.45, cpc: 1.27, cpm: 5.69, taxa_conversao: 0, resultado: 50_000, custo_por_resultado: 0.0066 };
  awareness.anuncios = Array.from({ length: 8 }, (_, index) => campaign({
    id: `ad-${index}`,
    nome: `Criativo vídeo ${index + 1}`,
    parent: "Alcance e ThruPlay",
    objective: "video",
    objective_label: "Visualizações de vídeo",
    primary_result_label: "ThruPlays",
    primary_result: 500 - index * 30,
    cost_per_result: 0.06 + index * 0.01,
    is_conversion_objective: false,
    gasto: 30 - index,
    impressoes: 4_000 - index * 100,
    cliques: 35 - index,
    ctr: 0.8,
    cpc_medio: 0.9,
    cpm: 7,
    video_starts: 2_000,
    video_25: 600 - index * 20,
    video_50: 350,
    video_75: 220,
    video_100: 130 - index * 5,
    thruplays: 500 - index * 30,
    avg_watch_time: 8.5,
    rankings: { quality: "AVERAGE", engagementRate: index === 0 ? "BELOW_AVERAGE_35" : "AVERAGE", conversionRate: "UNKNOWN" },
  }));
  google.previous = { gasto: 115, conversoes: 13, cliques: 70, impressoes: 900, ctr: 7.78, cpc: 1.64, cpm: 127.78, taxa_conversao: 18.57, resultado: 13, custo_por_resultado: 8.85 };
  google.baseline28 = { gasto: 430, conversoes: 55, cliques: 290, impressoes: 3_700, ctr: 7.84, cpc: 1.48, cpm: 116.22, taxa_conversao: 18.97, resultado: 55, custo_por_resultado: 7.82 };
  google.resumo.pct_impressoes_topo = 74.06;
  google.resumo.pct_impressoes_topo_absoluto = 28.22;
  google.resumo.parcela_impressoes_topo = 24.1;
  google.segments = ["MOBILE", "DESKTOP", "MONDAY", "TUESDAY", "8h", "9h", "SEARCH", "SEARCH_PARTNERS", "Fortaleza", "Natal"].map((segmento, index) => ({
    dimensao: index < 2 ? "dispositivo" : index < 4 ? "dia_semana" : index < 6 ? "hora" : index < 8 ? "rede" : "localizacao",
    segmento,
    gasto: 40 - index * 2,
    impressoes: 500 - index * 15,
    cliques: 30 - index,
    conversoes: index % 3 === 0 ? 0 : 3,
    ctr: 6.1,
    cpc: 1.2,
    taxa_conversao: 10,
    cpa: index % 3 === 0 ? null : 12,
  }));
  google.auctionInsights = [{
    dominio: "concorrente.com.br",
    parcela_impressoes: 42,
    sobreposicao: 35,
    acima_da_posicao: 58,
    topo: 80,
    topo_absoluto: 30,
    superacao: 25,
  }];

  const fixture = buildAnalysis({
    cliente: "Batista Rastreamento",
    periodo: "2026-07-23 a 2026-07-29",
    nicho: "Serviços locais",
    nicho_confianca: "alta",
    snapshots: [awareness, google],
  });
  fixture.perfil_google = {
    score: 85, grade: "B", grade_significado: "Bom - otimizações pontuais",
    visualizacoes: 43, busca: 27, maps: 16, rotas: 22, ligacoes: 0,
    cliques_site: 4, avaliacoes: 289, nota_media: 4.9, novas_avaliacoes: 1,
    taxa_resposta: 13.5,
    alertas: [{ title: "Baixa resposta às avaliações", severity: "ALTO", evidence: "Taxa de resposta 13,5%.", recommendation: "Responder avaliações positivas e negativas." }],
  };
  const html = renderAnalysisHtml(fixture);
  const rendered = await renderHtmlPdf(html);
  const dir = path.join(process.cwd(), "tmp", "pdfs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "auditoria-v2-fixture.html"), html);
  const target = path.join(dir, "auditoria-v2-fixture.pdf");
  fs.writeFileSync(target, rendered.pdf);
  console.log(`audit-v2 fixture: ${rendered.pageCount} pages -> ${target}`);
}
