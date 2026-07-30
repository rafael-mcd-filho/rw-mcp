// PDF da Auditoria V2 - objetivo, amostra, tendência, seis dimensões e ação.

import { BASE_REPORT_CSS, escapeHtml } from "../pdf-components.js";
import { reportLogoDataUri, renderReportFooter, renderReportHeader } from "../pdf-brand.js";
import type { DiagnosisResult } from "./diagnosis.js";
import type { AnalysisResult, CampaignVerdict, ChannelAudit } from "./audit.js";
import type { LayerAnalysis } from "./layers.js";
import type { Alert, AuditGrade, BenchmarkResult, DimensionScore } from "./types.js";

const moneyBR = (value: number) =>
  "R$ " + (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberBR = (value: number) => (value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pctBR = (value?: number | null) =>
  value == null ? "N/A" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const gradeColor = (grade: AuditGrade) =>
  ({ A: "#16a34a", B: "#22c55e", C: "#d97706", D: "#ea580c", F: "#dc2626", "N/A": "#64748b" })[grade];
const levelColor = (level: string) =>
  ({ EXCELENTE: "#16a34a", BOM: "#22c55e", ATENCAO: "#d97706", CRITICO: "#dc2626" } as Record<string, string>)[level] ?? "#64748b";
const channelLabel = (channel: string) => channel === "meta" ? "Meta Ads" : channel === "google" ? "Google Ads" : "Integrado";

const CSS = `
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; font-family: Inter, Arial, sans-serif; color: #16181d; }
.page {
  width: 210mm; height: 297mm; box-sizing: border-box; position: relative;
  padding: 28mm 16mm 14mm; break-after: auto; page-break-after: auto;
  break-inside: avoid-page; page-break-inside: avoid; overflow: hidden; background: #fff;
}
.page + .page { break-before: page; page-break-before: always; }
.topline { position: absolute; top: 0; left: 0; width: 100%; height: 6mm; background: linear-gradient(90deg,#2358f5 44%,#102e6c 44%); }
.header-overlay { position: absolute; top: 28mm; left: 16mm; right: 16mm; z-index: 5; background: #fff; }
.header-overlay .report-header { margin-bottom: 0; }
.header-space { height: 72px; }
h2 { font-size: 15px; margin: 12px 0 7px; }
h3 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .35px; margin: 12px 0 6px; }
h4 { margin: 0 0 4px; font-size: 10px; }
.score-card { display: grid; grid-template-columns: 130px 1fr; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid #dce2ea; border-radius: 10px; background: #f8fafc; }
.score-main { font-size: 46px; font-weight: 900; line-height: .95; }
.score-main small { font-size: 14px; color: #667085; }
.pill { display: inline-block; border-radius: 20px; padding: 4px 11px; color: #fff; font-weight: 800; font-size: 10px; }
.score-title { font-size: 15px; font-weight: 800; margin-top: 6px; }
.muted { color: #667085; font-size: 9.5px; line-height: 1.35; }
.grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 8px 0; }
.grid.two { grid-template-columns: repeat(2,1fr); }
.metric { min-height: 68px; box-sizing: border-box; border: 1px solid #dce2ea; border-top: 4px solid #2358f5; border-radius: 8px; padding: 9px 10px; background: #fafbfd; }
.metric.navy { border-top-color: #102e6c; }
.metric.orange { border-top-color: #d97706; }
.metric.red { border-top-color: #dc2626; }
.metric.green { border-top-color: #16a34a; }
.metric span { display: block; font-size: 8px; font-weight: 800; color: #667085; text-transform: uppercase; }
.metric strong { display: block; font-size: 20px; line-height: 1.15; margin: 5px 0 2px; }
.metric small { display: block; font-size: 8.5px; color: #667085; line-height: 1.25; }
.dimension-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; }
.dimension { border: 1px solid #dce2ea; border-radius: 8px; padding: 8px 9px; background: #fff; }
.dimension-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.dimension-head strong { font-size: 11px; }
.dimension-score { font-size: 18px !important; }
.bar { height: 5px; margin: 6px 0; background: #e6eaf0; border-radius: 10px; overflow: hidden; }
.bar div { height: 100%; }
.dimension small { color: #667085; font-size: 7.8px; line-height: 1.25; display: block; }
.table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
.table th { background: #f1f4f8; color: #667085; font-size: 7.5px; text-transform: uppercase; text-align: left; padding: 5px 6px; }
.table td { padding: 6px; border-bottom: 1px solid #e3e7ed; vertical-align: top; overflow-wrap: anywhere; }
.table td.num, .table th.num { text-align: right; }
.table td strong { display: block; font-size: 9px; }
.table td span { display: block; color: #667085; font-size: 7.8px; margin-top: 2px; }
.alert { display: grid; grid-template-columns: 52px 1fr auto; gap: 8px; padding: 8px 9px; margin-bottom: 6px; border: 1px solid #dce2ea; border-radius: 7px; background: #fafbfd; align-items: start; }
.sev { color: white; border-radius: 3px; padding: 3px 4px; font-size: 7px; font-weight: 900; text-align: center; }
.alert strong { display: block; font-size: 9px; }
.alert p { margin: 2px 0 0; font-size: 8px; line-height: 1.3; color: #475467; }
.risk { white-space: nowrap; color: #dc2626; font-size: 8px; font-weight: 800; }
.note { margin: 8px 0; padding: 8px 10px; border-left: 3px solid #2358f5; background: #eef3ff; font-size: 8.5px; line-height: 1.35; color: #344054; }
.risk-box { display: flex; align-items: baseline; gap: 14px; padding: 10px 12px; border: 1px solid #fecaca; border-radius: 8px; background: #fff5f5; }
.risk-box strong { color: #dc2626; font-size: 22px; }
.risk-box span { color: #667085; font-size: 9px; }
.trend-up-good { color: #16a34a; font-weight: 800; }
.trend-down-good { color: #16a34a; font-weight: 800; }
.trend-bad { color: #dc2626; font-weight: 800; }
.trend-neutral { color: #667085; }
.section-card { border: 1px solid #dce2ea; border-radius: 8px; padding: 9px; margin-bottom: 8px; }
.rank { font-size: 7.5px; color: #667085; }
.action { border-left: 4px solid #2358f5; padding: 7px 10px; margin-bottom: 6px; background: #f7f9fc; font-size: 8.5px; line-height: 1.3; }
.footer-method { font-size: 7.5px; color: #667085; line-height: 1.35; }
`;

function header(logo: string | null, type: string, result: AnalysisResult): string {
  return renderReportHeader({
    category: "Inteligência de mídia",
    description: type,
    client: result.cliente,
    period: result.periodo,
    detail: `Nicho: ${result.nicho}`,
    logo,
  });
}

function footer(page: number, total: number): string {
  return renderReportFooter({
    sourceLabel: "Plugue Marketing Solutions · Auditoria V2",
    generatedAt: `Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    page,
    total,
  });
}

function scoreCard(
  label: string,
  score: number | null,
  grade: AuditGrade,
  meaning: string,
  meta: string
): string {
  const color = gradeColor(grade);
  return `<div class="score-card">
    <div class="score-main" style="color:${color}">${score == null ? "N/A" : score}<small>${score == null ? "" : "/100"}</small></div>
    <div><span class="pill" style="background:${color}">Nota ${escapeHtml(grade)}</span>
      <div class="score-title">${escapeHtml(label)}</div>
      <div class="muted">${escapeHtml(meaning)}</div>
      <div class="muted">${escapeHtml(meta)}</div>
    </div>
  </div>`;
}

function metric(label: string, value: string, note: string, tone = ""): string {
  return `<div class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function renderDimensions(dimensions: DimensionScore[]): string {
  return `<div class="dimension-grid">${dimensions.map(item => {
    const color = gradeColor(item.grade);
    return `<div class="dimension">
      <div class="dimension-head"><strong>${escapeHtml(item.label)}</strong><strong class="dimension-score" style="color:${color}">${item.score == null ? "N/A" : item.score}</strong></div>
      <div class="bar"><div style="width:${item.score ?? 0}%;background:${color}"></div></div>
      <small>Cobertura ${item.coverage}% · confiança ${item.confidence}%</small>
      <small>${escapeHtml(item.summary)}</small>
    </div>`;
  }).join("")}</div>`;
}

function renderKpis(kpis: BenchmarkResult[]): string {
  if (!kpis.length) return `<div class="note">Nenhum KPI possui amostra e referência suficientes para classificação.</div>`;
  return `<div class="grid">${kpis.slice(0, 6).map(item =>
    metric(item.label, formatBenchmark(item), `${item.level} · ${item.reference}`, item.level === "CRITICO" ? "red" : item.level === "ATENCAO" ? "orange" : item.level === "EXCELENTE" ? "green" : "navy")
  ).join("")}</div>`;
}

function formatBenchmark(item: BenchmarkResult): string {
  if (["ctr", "taxa_conversao", "impression_share", "result_rate", "video_completion_rate", "landing_rate"].includes(item.metric)) return pctBR(item.value);
  if (item.metric === "frequencia") return `${numberBR(item.value)}x`;
  if (item.metric === "roas") return `${numberBR(item.value)}x`;
  return moneyBR(item.value);
}

function renderAlerts(alerts: Alert[], max = 6): string {
  const rows = alerts.filter(alert => alert.status !== "PASS").slice(0, max);
  if (!rows.length) return `<div class="note">Sem alertas relevantes nos dados avaliados.</div>`;
  return rows.map(alert => {
    const color = alert.severity === "CRITICO" ? "#dc2626" : alert.severity === "ALTO" ? "#ea580c" : alert.severity === "MEDIO" ? "#d97706" : "#64748b";
    return `<div class="alert">
      <span class="sev" style="background:${color}">${escapeHtml(alert.severity)}</span>
      <div><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.evidence)}</p><p style="color:#2358f5">${escapeHtml(alert.recommendation)}</p></div>
      <span class="risk">${alert.riskEstimate ? `${moneyBR(alert.riskEstimate)} sob risco` : ""}</span>
    </div>`;
  }).join("");
}

function renderTrend(channel: ChannelAudit): string {
  const rows = channel.tendencias.map(item => {
    const deltaText = (value?: number | null, direction = item.direction) => {
      if (value == null) return `<span class="trend-neutral">N/A</span>`;
      const good = direction === "neutral" || (direction === "higher_better" ? value >= 0 : value <= 0);
      return `<span class="${good ? "trend-up-good" : "trend-bad"}">${value > 0 ? "+" : ""}${numberBR(value)}%</span>`;
    };
    const format = item.label.includes("Custo") || item.label === "Investimento" || item.label === "CPC"
      ? (value?: number) => value == null ? "N/A" : moneyBR(value)
      : (value?: number) => value == null ? "N/A" : numberBR(value);
    return `<tr><td><strong>${escapeHtml(item.label)}</strong></td><td class="num">${format(item.current)}</td><td class="num">${format(item.previous)}</td><td class="num">${deltaText(item.delta_previous)}</td><td class="num">${format(item.baseline28)}</td><td class="num">${deltaText(item.delta_baseline)}</td></tr>`;
  }).join("");
  return `<table class="table"><thead><tr><th>Métrica</th><th class="num">Atual</th><th class="num">Anterior</th><th class="num">Variação</th><th class="num">Média 28d</th><th class="num">Vs. 28d</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCampaigns(campaigns: CampaignVerdict[]): string {
  const colors: Record<string, string> = {
    MANTER: "#16a34a", OTIMIZAR: "#d97706", INVESTIGAR: "#dc2626", OBSERVAR: "#64748b", SEM_ENTREGA: "#94a3b8",
  };
  const rows = campaigns.slice(0, 12).map(campaign => `<tr>
    <td style="width:38%"><strong>${escapeHtml(campaign.nome)}</strong><span>${escapeHtml(campaign.objetivo)}</span></td>
    <td class="num">${moneyBR(campaign.gasto)}</td>
    <td class="num">${numberBR(campaign.resultado)}<span>${escapeHtml(campaign.resultado_label)}</span></td>
    <td class="num">${campaign.custo_por_resultado == null ? "N/A" : moneyBR(campaign.custo_por_resultado)}</td>
    <td class="num"><strong style="color:${colors[campaign.veredito]}">${campaign.veredito}</strong><span>${escapeHtml(campaign.motivo)}</span></td>
  </tr>`).join("");
  return `<table class="table"><thead><tr><th>Campanha / objetivo</th><th class="num">Gasto</th><th class="num">Resultado</th><th class="num">Custo/res.</th><th class="num">Leitura</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLayerSummary(layers: LayerAnalysis[]): string {
  if (!layers.length) return "";
  return `<div class="grid">${layers.slice(0, 3).map(layer => {
    const problems = (layer.contagem_niveis.CRITICO ?? 0) + (layer.contagem_niveis.ATENCAO ?? 0);
    return metric(layer.label, String(layer.avaliados), `${problems} ponto(s) de atenção · ${layer.total} entidades`, problems ? "orange" : "green");
  }).join("")}</div>`;
}

function renderMetaCreative(channel: ChannelAudit): string {
  const ads = (channel.snapshot.anuncios ?? [])
    .filter(ad => ad.gasto > 0)
    .sort((a, b) => b.gasto - a.gasto)
    .slice(0, 8);
  if (!ads.length) return "";
  const rows = ads.map(ad => {
    const hook = ad.video_starts ? ((ad.video_25 ?? 0) / ad.video_starts) * 100 : null;
    const completion = ad.video_25 ? ((ad.video_100 ?? 0) / ad.video_25) * 100 : null;
    const thruRate = ad.impressoes ? ((ad.thruplays ?? 0) / ad.impressoes) * 100 : null;
    const ranks = [ad.rankings?.quality, ad.rankings?.engagementRate, ad.rankings?.conversionRate].filter(Boolean).join(" / ") || "N/A";
    return `<tr>
      <td><strong>${escapeHtml(ad.nome)}</strong><span>${escapeHtml(ad.parent ?? "")}${ad.avg_watch_time ? ` · tempo médio ${numberBR(ad.avg_watch_time)}s` : ""}</span></td>
      <td class="num">${moneyBR(ad.gasto)}</td><td class="num">${pctBR(hook)}</td><td class="num">${pctBR(completion)}</td>
      <td class="num">${pctBR(thruRate)}</td><td class="num">${ad.thruplays ? moneyBR(ad.gasto / ad.thruplays) : "N/A"}</td>
      <td><span class="rank">${escapeHtml(ranks)}</span></td>
    </tr>`;
  }).join("");
  return `<h3>Diagnóstico dos criativos</h3>
    <div class="note"><strong>Hook</strong> aproxima quantas reproduções chegaram a 25%; <strong>conclusão</strong> mede 100% entre quem chegou a 25%. Os rankings da Meta são pistas diagnósticas, não metas isoladas.</div>
    <table class="table"><thead><tr><th>Criativo</th><th class="num">Gasto</th><th class="num">Hook</th><th class="num">Conclusão</th><th class="num">ThruPlay rate</th><th class="num">Custo TP</th><th>Rankings</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderGoogleDiagnostics(channel: ChannelAudit): string[] {
  const summary = channel.snapshot.resumo;
  const actions = channel.snapshot.conversionActions ?? [];
  const keywords = (channel.snapshot.keywords ?? []).filter(keyword => keyword.quality_score != null).slice(0, 8);
  const auctions = channel.snapshot.auctionInsights ?? [];
  const actionsTable = actions.length ? `<table class="table"><thead><tr><th>Ação</th><th>Categoria/origem</th><th class="num">Conversões</th><th class="num">Primária?</th><th>Contagem / atribuição</th></tr></thead><tbody>
    ${actions.slice(0, 10).map(action => `<tr><td><strong>${escapeHtml(action.nome)}</strong></td><td>${escapeHtml([action.categoria, action.origem].filter(Boolean).join(" · ") || "N/A")}</td><td class="num">${numberBR(action.conversoes)}</td><td class="num">${action.primaria || action.incluir_em_conversoes ? "Sim" : "Não"}</td><td>${escapeHtml([action.contagem, action.modelo_atribuicao].filter(Boolean).join(" · ") || "N/A")}</td></tr>`).join("")}
  </tbody></table>` : `<div class="note">As ações de conversão não retornaram metadados suficientes. O CPA deve ser tratado como preliminar.</div>`;
  const qsTable = keywords.length ? `<table class="table"><thead><tr><th>Keyword</th><th class="num">QS</th><th>CTR esperado</th><th>Relevância</th><th>Página</th></tr></thead><tbody>
    ${keywords.map(keyword => `<tr><td><strong>${escapeHtml(keyword.termo)}</strong></td><td class="num">${keyword.quality_score}/10</td><td>${escapeHtml(keyword.ctr_esperado ?? "N/A")}</td><td>${escapeHtml(keyword.relevancia_anuncio ?? "N/A")}</td><td>${escapeHtml(keyword.experiencia_pagina ?? "N/A")}</td></tr>`).join("")}
  </tbody></table>` : `<div class="note">Sem componentes de Quality Score disponíveis no período.</div>`;
  const auctionTable = auctions.length ? `<table class="table"><thead><tr><th>Concorrente</th><th class="num">Parcela</th><th class="num">Sobreposição</th><th class="num">Acima</th><th class="num">Topo</th><th class="num">Topo abs.</th><th class="num">Superação</th></tr></thead><tbody>
    ${auctions.slice(0, 8).map(item => `<tr><td><strong>${escapeHtml(item.dominio)}</strong></td><td class="num">${pctBR(item.parcela_impressoes)}</td><td class="num">${pctBR(item.sobreposicao)}</td><td class="num">${pctBR(item.acima_da_posicao)}</td><td class="num">${pctBR(item.topo)}</td><td class="num">${pctBR(item.topo_absoluto)}</td><td class="num">${pctBR(item.superacao)}</td></tr>`).join("")}
  </tbody></table>` : `<div class="note">Auction Insights não foi disponibilizado pela API para esta conta/período. A ausência desta tabela não reduz o score.</div>`;
  const visibility = `<h3>Visibilidade na Rede de Pesquisa</h3>
    <div class="grid">${metric("Parcela de impressões", pctBR(summary.impression_share), "Demanda elegível capturada")}
    ${metric("Perdida por orçamento", pctBR(summary.is_perdida_orcamento), "Limitação de orçamento", "navy")}
    ${metric("Perdida por Ad Rank", pctBR(summary.is_perdida_rank), "Lance, concorrência, contexto e qualidade", "orange")}
    ${metric("Presença no topo", pctBR(summary.pct_impressoes_topo), "Entre as impressões que ocorreram", "navy")}
    ${metric("Topo absoluto", pctBR(summary.pct_impressoes_topo_absoluto), "Primeiro anúncio pago", "navy")}
    ${metric("Parcela do topo", pctBR(summary.parcela_impressoes_topo), "Topo capturado entre oportunidades", "navy")}</div>
    <div class="note">Parcela capturada e parcelas perdidas usam a mesma base de elegibilidade. Já presença no topo e topo absoluto são subconjuntos das impressões que aconteceram e podem se sobrepor; por isso não devem somar 100%.</div>
    <h3>Funil disponível no Google Ads</h3>
    <div class="grid">${metric("Impressões", numberBR(summary.impressoes), "Anúncios exibidos")}
    ${metric("Cliques", numberBR(summary.cliques), `CTR ${pctBR(summary.ctr)}`, "navy")}
    ${metric("Conversões", numberBR(summary.conversoes), `Taxa ${pctBR(summary.taxa_conversao)}`)}</div>
    <h3>Saúde das conversões</h3>${actionsTable}`;
  const quality = `<h3>Quality Score por keyword</h3>${qsTable}
    <div class="note">O diagnóstico abre CTR esperado, relevância do anúncio e experiência da página por keyword. Não existe “Quality Score médio” na nota da conta.</div>
    <h3>Auction Insights</h3>${auctionTable}
    <div class="footer-method">Quality Score é diagnóstico. O número 1-10 não é usado diretamente no leilão e não entra isoladamente no score da conta.</div>`;
  return [visibility, quality];
}

function renderSegments(channel: ChannelAudit): string[] {
  const segments = channel.snapshot.segments ?? [];
  if (!segments.length) return [];
  const dimensions = ["dispositivo", "dia_semana", "hora", "rede", "localizacao"] as const;
  const blocks = dimensions.map(dimension => {
    const rows = segments.filter(row => row.dimensao === dimension).sort((a, b) => b.gasto - a.gasto).slice(0, 4);
    if (!rows.length) return "";
    return `<div class="section-card"><h4>${escapeHtml(dimension.replace("_", " "))}</h4><table class="table"><thead><tr><th>Segmento</th><th class="num">Gasto</th><th class="num">CTR</th><th class="num">Conv.</th><th class="num">CVR</th><th class="num">CPA</th></tr></thead><tbody>
      ${rows.map(row => `<tr><td><strong>${escapeHtml(row.segmento)}</strong></td><td class="num">${moneyBR(row.gasto)}</td><td class="num">${pctBR(row.ctr)}</td><td class="num">${numberBR(row.conversoes)}</td><td class="num">${pctBR(row.taxa_conversao)}</td><td class="num">${row.cpa == null ? "N/A" : moneyBR(row.cpa)}</td></tr>`).join("")}
    </tbody></table></div>`;
  }).filter(Boolean);
  if (!blocks.length) return [];
  return [
    blocks.slice(0, 3).join(""),
    blocks.slice(3).join(""),
  ].filter(Boolean);
}

function renderProfile(result: AnalysisResult): string {
  const profile = result.perfil_google;
  if (!profile) return "";
  const alerts: Alert[] = profile.alertas.map((alert, index) => ({
    id: `profile-${index}`, title: alert.title, severity: alert.severity,
    status: alert.severity === "BAIXO" ? "ATENCAO" : "FAIL", channel: "google",
    category: "Perfil da Empresa", dimension: "saturacao_oportunidade",
    evidence: alert.evidence, recommendation: alert.recommendation,
  }));
  return `${scoreCard("Perfil da Empresa", profile.score, profile.grade, profile.grade_significado, "Score separado da mídia paga")}
    <div class="grid">${metric("Visualizações", numberBR(profile.visualizacoes), `${numberBR(profile.busca)} Busca · ${numberBR(profile.maps)} Maps`)}
    ${metric("Rotas", numberBR(profile.rotas), "Intenção de visita", "navy")}
    ${metric("Ligações", numberBR(profile.ligacoes), "Cliques para ligar")}
    ${metric("Visitas ao site", numberBR(profile.cliques_site), "Cliques originados no perfil", "navy")}
    ${metric("Avaliações", numberBR(profile.avaliacoes), `${numberBR(profile.novas_avaliacoes)} novas`)}
    ${metric("Reputação", profile.nota_media.toFixed(1).replace(".", ","), `Taxa de resposta ${numberBR(profile.taxa_resposta)}%`, "navy")}</div>
    <h3>Alertas do perfil</h3>${renderAlerts(alerts, 6)}
    <div class="note">O Perfil da Empresa complementa a leitura de presença local, mas não altera o score de Meta ou Google Ads.</div>`;
}

function renderActionPlan(result: AnalysisResult): string {
  const groups = [
    ["Urgente - fazer hoje", result.plano_de_acao.urgente, "#dc2626"],
    ["Esta semana", result.plano_de_acao.esta_semana, "#ea580c"],
    ["Este mês", result.plano_de_acao.este_mes, "#d97706"],
  ] as const;
  return groups.map(([title, items, color]) => items.length ? `<h3 style="color:${color}">${title}</h3>${items.slice(0, 7).map(item => `<div class="action" style="border-color:${color}">${escapeHtml(item)}</div>`).join("")}` : "").join("");
}

function wrap(result: AnalysisResult, title: string, bodies: string[]): string {
  const logo = reportLogoDataUri();
  const pages = bodies.map((body, index) => `<section class="page"><div class="topline"></div><div class="header-overlay">${header(logo, title, result)}</div><div class="header-space"></div>${body}${footer(index + 1, bodies.length)}</section>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(result.cliente)} - ${escapeHtml(title)}</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');${BASE_REPORT_CSS}${CSS}</style></head><body data-isolated-pdf-pages="true">${pages}<script>window.__READY__=true;</script></body></html>`;
}

export function renderAnalysisHtml(result: AnalysisResult): string {
  const mediaSpend = result.canais.reduce((sum, channel) => sum + channel.gasto, 0);
  const channelCards = result.canais.map((channel, index) =>
    metric(
      channelLabel(channel.channel),
      channel.score == null ? "N/A" : `${channel.score}/100`,
      `Nota ${channel.grade} · confiança ${channel.confidence}% · ${moneyBR(channel.gasto)}`,
      index % 2 ? "navy" : ""
    )
  ).join("");
  const pages: string[] = [
    `${scoreCard("Score geral da mídia paga", result.score_geral, result.grade_geral, result.grade_geral_significado, `${moneyBR(mediaSpend)} investidos · cobertura ${result.coverage}% · confiança ${result.confidence}%`)}
     <div class="grid">${channelCards}${result.perfil_google ? metric("Perfil da Empresa", `${result.perfil_google.score}/100`, `Nota ${result.perfil_google.grade} · score separado`, "navy") : ""}</div>
     <h3>Como ler esta auditoria</h3>
     <div class="note">Cada campanha é avaliada conforme seu objetivo. Checks sem amostra suficiente não reduzem a nota. O histórico da própria conta tem prioridade sobre benchmarks externos. “Gasto sob risco” indica exposição que merece investigação - não desperdício confirmado.</div>
     <h3>Principais prioridades</h3>${renderAlerts(result.canais.flatMap(channel => channel.alertas), 5)}
     ${result.gasto_sob_risco > 0 ? `<div class="risk-box"><strong>${moneyBR(result.gasto_sob_risco)}</strong><span>gasto sob risco no período, deduplicado por canal e entidade</span></div>` : ""}`,
  ];

  for (const channel of result.canais) {
    pages.push(`${scoreCard(channelLabel(channel.channel), channel.score, channel.grade, channel.grade_significado, `Objetivo predominante: ${channel.objetivo_predominante} · cobertura ${channel.coverage}% · confiança ${channel.confidence}%`)}
      <div class="grid">${metric("Investimento", moneyBR(channel.gasto), "Período atual")}
      ${metric(channel.resultado_label, numberBR(channel.resultado_principal), "Resultado conforme o objetivo", "navy")}
      ${metric("Custo por resultado", channel.custo_por_resultado == null ? "N/A" : moneyBR(channel.custo_por_resultado), "Nunca exibido como CPA quando não se aplica")}
      </div><h3>Score por dimensão</h3>${renderDimensions(channel.dimensoes)}
      <h3>KPIs com referência aplicável</h3>${renderKpis(channel.kpis)}
      ${channel.gasto_sob_risco > 0 ? `<div class="risk-box"><strong>${moneyBR(channel.gasto_sob_risco)}</strong><span>sob risco neste canal; sujeito a confirmação por amostra e contexto</span></div>` : ""}`);

    pages.push(`<h3>Tendência: atual vs. anterior vs. 28 dias</h3>${renderTrend(channel)}
      <h3>Leitura por campanha</h3>${renderCampaigns(channel.campanhas)}
      <h3>Cobertura por camada</h3>${renderLayerSummary(channel.layers)}
      <div class="note">INVESTIGAR e OBSERVAR substituem decisões precipitadas. A auditoria não recomenda pausar automaticamente apenas por zero conversões.</div>`);

    pages.push(`<h3>Alertas e ações - ${channelLabel(channel.channel)}</h3>${renderAlerts(channel.alertas, 9)}
      <h3>Dados não avaliados</h3><div class="note">${channel.checks_insuficientes.length ? escapeHtml(channel.checks_insuficientes.join(", ")) : "Todos os checks previstos para os dados disponíveis foram avaliados."}</div>`);

    if (channel.platform === "meta") {
      const creative = renderMetaCreative(channel);
      if (creative) pages.push(creative);
    } else {
      pages.push(...renderGoogleDiagnostics(channel));
      const segmentPages = renderSegments(channel);
      for (const segmentPage of segmentPages) {
        pages.push(`<h3>Oportunidades por segmentação</h3>${segmentPage}<div class="note">Recortes com pouco volume devem ser observados por mais tempo antes de qualquer exclusão ou ajuste de lance.</div>`);
      }
    }
  }

  if (result.perfil_google) pages.push(renderProfile(result));
  pages.push(`${renderActionPlan(result)}
    <h3>Metodologia</h3>
    <div class="footer-method">Motor V2: objetivo → KPI principal → amostra mínima → histórico da conta → benchmark aplicável → tendência → diagnóstico → ação → score. O score geral considera apenas canais de mídia e pondera a confiança. Quality Score e rankings da Meta são diagnósticos, não metas isoladas. Termos de pesquisa são a camada usada para estimar risco; keywords não são somadas novamente.</div>`);

  const channelTitle = [
    result.canais.some(channel => channel.channel === "meta") ? "Meta" : "",
    result.canais.some(channel => channel.channel === "google") ? "Google" : "",
  ].filter(Boolean).join(" e ");
  return wrap(result, `Auditoria ${channelTitle || "Digital"}`, pages);
}

/** Compatibilidade: a auditoria e o diagnóstico usam o mesmo produto V2. */
export const renderAuditHtml = renderAnalysisHtml;

/** Compatibilidade de tipos legados; a tool pública já usa renderAnalysisHtml. */
export function renderDiagnosisHtml(result: DiagnosisResult): string {
  const pseudo = result as unknown as AnalysisResult;
  return renderAnalysisHtml(pseudo);
}
