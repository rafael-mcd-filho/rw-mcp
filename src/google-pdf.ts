// Template HTML A4 dedicado ao relatório Google Ads.
// Substitui o PdfReportModel (modelo genérico do Meta) por um layout específico
// que inclui grupos de anúncio, keywords detalhadas, ações de conversão e demográficos.

import { moneyBR, intBR, pctBR, dateBR } from "./format.js";
import { BASE_REPORT_CSS, escapeHtml } from "./pdf-components.js";
import type { GoogleAdsEnhancedReport } from "./google-report.js";
import type { GAdGroup, GDayData, GConversionAction, GDemographics } from "./google-ads-api.js";

// ─── Formatadores de coluna ───────────────────────────────────────────────────

function esc(v: unknown): string {
  return escapeHtml(v);
}

function money(n: number): string {
  return n > 0 ? moneyBR(n) : "R$ 0";
}

function pct(n: number): string {
  return pctBR(n);
}

function int(n: number): string {
  return intBR(n);
}

function cpa(gasto: number, conv: number): string {
  return conv > 0 ? money(gasto / conv) : "—";
}

// ─── CSS adicional do Google PDF ──────────────────────────────────────────────

const GOOGLE_PDF_CSS = `
.g-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 8.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .4px;
}
.badge-ativo  { background: #dcfce7; color: #15803d; }
.badge-pausado { background: #fef3c7; color: #92400e; }
.badge-removido { background: #fee2e2; color: #b91c1c; }
.badge-match-exact { background: #eff6ff; color: #1d4ed8; }
.badge-match-phrase { background: #faf5ff; color: #7e22ce; }
.badge-match-broad { background: #fefce8; color: #854d0e; }
.badge-match-other { background: #f1f5f9; color: #475569; }
.qs-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
}
.qs-hi  { background: #dcfce7; color: #15803d; }
.qs-mid { background: #fef3c7; color: #92400e; }
.qs-lo  { background: #fee2e2; color: #b91c1c; }
.demog-section { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin-top: 10px; }
.demog-block h4 { font-size: 10px; text-transform: uppercase; color: #667085; margin: 0 0 8px; font-weight: 750; letter-spacing: .4px; }
.demog-table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.demog-table th { padding: 5px 6px; text-align: left; color: #6b7280; font-size: 8.5px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; background: #f8fafc; font-weight: 700; }
.demog-table th.num, .demog-table td.num { text-align: right; }
.demog-table td { padding: 5px 6px; border-bottom: 1px solid #eef0f4; color: #252b36; font-variant-numeric: tabular-nums; }
.conv-table { width: 100%; border-collapse: collapse; font-size: 9.6px; }
.conv-table th { padding: 6px 7px; text-align: left; font-size: 8.5px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; background: #f8fafc; font-weight: 700; }
.conv-table th.num, .conv-table td.num { text-align: right; }
.conv-table td { padding: 6px 7px; border-bottom: 1px solid #eef0f4; color: #252b36; font-variant-numeric: tabular-nums; }
.conv-bar-wrap { display: flex; align-items: center; gap: 8px; }
.conv-bar-track { flex: 1; height: 7px; background: #eceff3; border-radius: 999px; overflow: hidden; }
.conv-bar-fill  { height: 100%; border-radius: 999px; background: linear-gradient(90deg,#1A53F0,#0B2A6B); }
.g-section-title { font-size: 12px; font-weight: 750; color: #101216; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .5px; }
.g-section-rule { border: none; border-top: 1px solid #e5e7eb; margin: 0 0 8px; }
.note-row { font-size: 9px; color: #6b7280; font-style: italic; margin-top: 5px; }
.g-page2-body { height: 250mm; overflow: hidden; }
`;

// ─── Layout helpers ───────────────────────────────────────────────────────────

function header(
  cliente: string,
  periodo: string,
  tipo: string,
  nicho?: string
): string {
  const nichoTag = nicho ? `<span>Nicho: ${esc(nicho)}</span>` : "";
  return `
    <div class="topline"></div>
    <header>
      <div class="brand">
        <div class="brand-text">
          <strong>Plugue</strong>
          <span>Marketing Solutions</span>
        </div>
      </div>
      <div class="period">
        <strong>${esc(tipo)}</strong><br>
        <span>${esc(cliente)}</span><br>
        <span>${esc(periodo)}</span>
        ${nichoTag}
      </div>
    </header>`;
}

function footer(cliente: string, periodo: string, page: number, total: number): string {
  const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `
    <div class="footer">
      <span>Plugue Marketing Solutions · ${esc(cliente)} · ${esc(periodo)}</span>
      <span>Gerado em ${now} · Página ${page}/${total}</span>
    </div>`;
}

function sectionTitle(title: string): string {
  return `<p class="g-section-title">${esc(title)}</p><hr class="g-section-rule">`;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function statusBadge(status: string): string {
  const s = (status ?? "").toUpperCase();
  if (s === "ENABLED" || s === "ATIVO") return `<span class="g-badge badge-ativo">Ativo</span>`;
  if (s === "PAUSED" || s === "PAUSADO") return `<span class="g-badge badge-pausado">Pausado</span>`;
  return `<span class="g-badge badge-removido">${esc(status || "?")}</span>`;
}

function matchBadge(tipo: string): string {
  const t = (tipo ?? "").toUpperCase();
  if (t === "EXACT") return `<span class="g-badge badge-match-exact">Exata</span>`;
  if (t === "PHRASE") return `<span class="g-badge badge-match-phrase">Frase</span>`;
  if (t === "BROAD") return `<span class="g-badge badge-match-broad">Ampla</span>`;
  return `<span class="g-badge badge-match-other">${esc(tipo || "?")}</span>`;
}

function qsPill(qs: number | null): string {
  if (!qs) return "—";
  const cls = qs >= 7 ? "qs-hi" : qs >= 4 ? "qs-mid" : "qs-lo";
  return `<span class="qs-pill ${cls}">${qs}</span>`;
}

// ─── Página 1: Resumo + Campanhas ─────────────────────────────────────────────

function page1(report: GoogleAdsEnhancedReport): string {
  const r = report.resumo;
  const nicho = (report.analise_benchmark?.length
    ? report.analise_benchmark.map((b) => `${b.label}: ${b.level}`).join(" · ")
    : undefined
  );

  // KPI cards (6)
  const kpis = [
    { label: "Investimento", value: money(r.gasto_total), note: `${int(report.campanhas.filter(c => c.gasto > 0).length)} campanhas com entrega` },
    { label: "Conversões", value: int(r.conversoes), note: r.conversoes > 0 ? `CPA médio: ${money(r.custo_por_conversao)}` : "Sem conversões" },
    { label: "Cliques", value: int(r.cliques), note: `CPC médio: ${money(r.cpc_medio)}` },
    { label: "Impressões", value: int(r.impressoes), note: `CPM: ${r.impressoes > 0 ? money((r.gasto_total / r.impressoes) * 1000) : "—"}` },
    { label: "CTR médio", value: pct(r.ctr), note: r.impressoes > 0 ? `${int(r.impressoes)} impressões` : "—" },
    { label: "CPA médio", value: r.conversoes > 0 ? money(r.custo_por_conversao) : "—", note: r.conversoes > 0 ? `${int(r.conversoes)} conversões` : "Sem conversões" },
  ];

  const kpiHtml = `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0 10px">${kpis.map((k, i) => `
    <div class="kpi ${i % 2 === 0 ? "red" : "black"}">
      <span>${esc(k.label)}</span>
      <strong>${esc(k.value)}</strong>
      <small>${esc(k.note)}</small>
    </div>`).join("")}</div>`;

  // Benchmark row
  const benchRow = nicho
    ? `<div class="note" style="margin-bottom:10px;font-size:9.6px"><strong>Benchmark:</strong> ${esc(nicho)}</div>`
    : "";

  // Leitura executiva
  const leitura = report.leitura_executiva.length
    ? `${sectionTitle("Leitura Executiva")}<div class="insight-list">${report.leitura_executiva.map(l =>
        `<div class="insight"><span class="dot"></span><span>${esc(l)}</span></div>`).join("")}</div>`
    : "";

  // Campanhas table
  const camps = [...report.campanhas].sort((a, b) => b.gasto - a.gasto);
  const campRows = camps.slice(0, 10).map(c => `<tr>
    <td><strong>${esc(c.nome)}</strong><span>${esc(c.tipo || "")}</span></td>
    <td class="num">${money(c.gasto)}</td>
    <td class="num">${int(c.conversoes)}</td>
    <td class="num">${cpa(c.gasto, c.conversoes)}</td>
    <td class="num">${pct(c.ctr)}</td>
    <td class="num">${money(c.cpc_medio)}</td>
    <td>${statusBadge(c.status)}</td>
  </tr>`).join("");

  const campTable = `<table class="table compact-table">
    <thead><tr>
      <th>Campanha</th>
      <th class="num">Investimento</th>
      <th class="num">Conv.</th>
      <th class="num">CPA</th>
      <th class="num">CTR</th>
      <th class="num">CPC</th>
      <th>Status</th>
    </tr></thead>
    <tbody>${campRows || '<tr><td colspan="7">Sem campanhas com entrega no período.</td></tr>'}</tbody>
  </table>`;

  return `<div class="page compact-page">
    ${header(report.cliente ?? "Cliente", report.periodo, "Relatório Google Ads")}
    ${kpiHtml}
    ${benchRow}
    ${leitura}
    <div class="section">
      ${sectionTitle("Campanhas")}
      ${campTable}
      ${camps.length > 10 ? `<p class="note-row">Exibindo as 10 campanhas de maior investimento (${camps.length} no total).</p>` : ""}
    </div>
    ${footer(report.cliente ?? "Cliente", report.periodo, 1, 3)}
  </div>`;
}

// ─── Página 2: Grupos de Anúncio + Keywords + Search Terms ────────────────────

function page2(report: GoogleAdsEnhancedReport, adGroups: GAdGroup[]): string {
  // Ad groups table
  const agRows = [...adGroups].sort((a, b) => b.gasto - a.gasto).slice(0, 12).map(g => `<tr>
    <td><strong>${esc(g.nome)}</strong><span>${esc(g.campanha)}</span></td>
    <td class="num">${money(g.gasto)}</td>
    <td class="num">${int(g.conversoes)}</td>
    <td class="num">${cpa(g.gasto, g.conversoes)}</td>
    <td class="num">${pct(g.ctr)}</td>
    <td class="num">${money(g.cpc_medio)}</td>
    <td>${statusBadge(g.status)}</td>
  </tr>`).join("");

  const agTable = `<table class="table compact-table">
    <thead><tr>
      <th>Grupo de Anúncio / Campanha</th>
      <th class="num">Invest.</th>
      <th class="num">Conv.</th>
      <th class="num">CPA</th>
      <th class="num">CTR</th>
      <th class="num">CPC</th>
      <th>Status</th>
    </tr></thead>
    <tbody>${agRows || '<tr><td colspan="7">Sem grupos de anúncio no período.</td></tr>'}</tbody>
  </table>`;

  // Keywords table
  const kwRows = (report.keywords ?? []).slice(0, 12).map(k => `<tr>
    <td><strong>${esc(k.keyword)}</strong><span>${esc(k.campanha)}</span></td>
    <td>${matchBadge(k.correspondencia)}</td>
    <td class="num">${money(k.gasto)}</td>
    <td class="num">${int(k.conversoes)}</td>
    <td class="num">${cpa(k.gasto, k.conversoes)}</td>
    <td class="num">${pct(k.ctr)}</td>
    <td class="num">${qsPill(k.quality_score)}</td>
  </tr>`).join("");

  const kwTable = `<table class="table compact-table">
    <thead><tr>
      <th>Keyword / Campanha</th>
      <th>Corresp.</th>
      <th class="num">Invest.</th>
      <th class="num">Conv.</th>
      <th class="num">CPA</th>
      <th class="num">CTR</th>
      <th class="num">QS</th>
    </tr></thead>
    <tbody>${kwRows || '<tr><td colspan="7">Sem keywords no período.</td></tr>'}</tbody>
  </table>`;

  // Search terms section (top by gasto)
  const terms = (report.termos_pesquisa ?? []).sort((a, b) => b.gasto - a.gasto);
  const wasteTerms = terms.filter(t => t.gasto > 0 && t.conversoes === 0).slice(0, 5);
  const goodTerms  = terms.filter(t => t.conversoes > 0).sort((a, b) => (a.gasto / a.conversoes) - (b.gasto / b.conversoes)).slice(0, 5);

  function termBlock(rows: typeof terms, title: string, emptyMsg: string) {
    const html = rows.map(t => `<tr>
      <td><strong>${esc(t.termo)}</strong><span>${esc(t.campanha)}</span></td>
      <td class="num">${money(t.gasto)}</td>
      <td class="num">${int(t.cliques)}</td>
      <td class="num">${int(t.conversoes)}</td>
    </tr>`).join("");
    return `<div>
      <p class="g-section-title" style="font-size:10px;margin:10px 0 4px">${esc(title)}</p>
      <table class="table compact-table">
        <thead><tr>
          <th>Termo / Campanha</th>
          <th class="num">Invest.</th>
          <th class="num">Cliques</th>
          <th class="num">Conv.</th>
        </tr></thead>
        <tbody>${html || `<tr><td colspan="4">${esc(emptyMsg)}</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  const termsSection = (terms.length > 0)
    ? `<div class="section">${sectionTitle("Termos de Pesquisa (amostra)")}<div class="two-col" style="margin-top:6px">
        ${termBlock(wasteTerms, "Maior gasto sem conversão", "Sem termos com gasto e sem conversão.")}
        ${termBlock(goodTerms, "Melhor CPA", "Sem termos com conversão.")}
      </div></div>`
    : "";

  return `<div class="page compact-page">
    <div class="g-page2-body">
    ${header(report.cliente ?? "Cliente", report.periodo, "Google Ads · Grupos e Keywords")}
    <div class="section">
      ${sectionTitle("Grupos de Anúncio")}
      ${agTable}
      ${adGroups.length > 12 ? `<p class="note-row">Exibindo os 12 grupos de maior investimento (${adGroups.length} no total).</p>` : ""}
    </div>
    <div class="section">
      ${sectionTitle("Palavras-chave")}
      ${kwTable}
      ${(report.keywords?.length ?? 0) > 12 ? `<p class="note-row">Exibindo as 12 keywords de maior investimento.</p>` : ""}
    </div>
    ${termsSection}
    </div>
    ${footer(report.cliente ?? "Cliente", report.periodo, 2, 3)}
  </div>`;
}

// ─── Página 3: Ações de Conversão + Demográficos + Próximos Passos ────────────

function page3(
  report: GoogleAdsEnhancedReport,
  convActions: GConversionAction[],
  demographics: GDemographics,
): string {
  // Conversion actions
  const maxConv = Math.max(...convActions.map(c => c.todas_conversoes), 1);
  const convRows = convActions.slice(0, 15).map(c => {
    const barW = Math.max(2, Math.round((c.todas_conversoes / maxConv) * 100));
    return `<tr>
      <td>${esc(c.nome)}</td>
      <td class="num">${int(c.todas_conversoes)}</td>
      <td class="num">${int(c.conversoes)}</td>
      <td style="width:120px;padding:4px 7px">
        <div class="conv-bar-wrap">
          <div class="conv-bar-track"><div class="conv-bar-fill" style="width:${barW}%"></div></div>
        </div>
      </td>
    </tr>`;
  }).join("");

  const convSection = convActions.length
    ? `<div class="section">
        ${sectionTitle("Ações de Conversão")}
        <table class="conv-table">
          <thead><tr>
            <th>Ação de Conversão</th>
            <th class="num">Total conv.</th>
            <th class="num">Conv. (modeladas)</th>
            <th style="width:120px">Participação</th>
          </tr></thead>
          <tbody>${convRows}</tbody>
        </table>
        <p class="note-row">Total inclui conversões diretas e atribuídas por modelo. Modeladas = sem todas_conversoes.</p>
      </div>`
    : `<div class="section">${sectionTitle("Ações de Conversão")}<p style="font-size:10px;color:#6b7280">Não há dados de ações de conversão para o período selecionado.</p></div>`;

  // Demographics
  function demogTable(rows: typeof demographics.por_genero, label: string) {
    const total = rows.reduce((s, r) => s + r.impressoes, 0);
    const html = rows.map(r => `<tr>
      <td>${esc(r.segmento)}</td>
      <td class="num">${int(r.impressoes)}</td>
      <td class="num">${total > 0 ? `${Math.round((r.impressoes / total) * 100)}%` : "—"}</td>
      <td class="num">${int(r.conversoes)}</td>
      <td class="num">${cpa(r.gasto, r.conversoes)}</td>
    </tr>`).join("");
    return `<div class="demog-block">
      <h4>${esc(label)}</h4>
      <table class="demog-table">
        <thead><tr>
          <th>${label === "Gênero" ? "Gênero" : "Faixa Etária"}</th>
          <th class="num">Impres.</th>
          <th class="num">%</th>
          <th class="num">Conv.</th>
          <th class="num">CPA</th>
        </tr></thead>
        <tbody>${html || '<tr><td colspan="5">Sem dados demográficos.</td></tr>'}</tbody>
      </table>
    </div>`;
  }

  const hasDemo = demographics.por_genero.length > 0 || demographics.por_faixa_etaria.length > 0;
  const demoSection = `<div class="section">
    ${sectionTitle("Distribuição Demográfica")}
    ${hasDemo
      ? `<div class="demog-section">
          ${demogTable(demographics.por_genero, "Gênero")}
          ${demogTable(demographics.por_faixa_etaria, "Faixa Etária")}
        </div>`
      : `<p style="font-size:10px;color:#6b7280">Não há dados demográficos para o período selecionado. Verifique se a segmentação por gênero/idade está ativa nas campanhas.</p>`}
  </div>`;

  // Next steps
  const steps = report.oportunidades;
  const stepsSection = steps.length
    ? `<div class="section">
        ${sectionTitle("Próximos Passos")}
        <div class="insight-list">${steps.map(s =>
          `<div class="insight"><span class="dot"></span><span>${esc(s)}</span></div>`).join("")}
        </div>
      </div>`
    : "";

  // Notes
  const notes = report.notas_metodologicas;
  const notesSection = notes.length
    ? `<div class="section" style="margin-top:12px">
        <p class="g-section-title" style="font-size:9px;margin-bottom:4px">Notas Metodológicas</p>
        ${notes.map(n => `<p style="font-size:8.5px;color:#6b7280;margin-bottom:3px">· ${esc(n)}</p>`).join("")}
      </div>`
    : "";

  return `<div class="page compact-page">
    ${header(report.cliente ?? "Cliente", report.periodo, "Google Ads · Conversões e Demográficos")}
    ${convSection}
    ${demoSection}
    ${stepsSection}
    ${notesSection}
    ${footer(report.cliente ?? "Cliente", report.periodo, 3, 3)}
  </div>`;
}

// ─── API pública ──────────────────────────────────────────────────────────────

export interface GooglePdfOptions {
  adGroups?: GAdGroup[];
  conversionActions?: GConversionAction[];
  demographics?: GDemographics;
  dailyRows?: GDayData[];
}

export function renderGoogleReportHtml(
  report: GoogleAdsEnhancedReport,
  opts: GooglePdfOptions = {}
): string {
  const adGroups = opts.adGroups ?? [];
  const convActions = opts.conversionActions ?? [];
  const demographics = opts.demographics ?? { por_genero: [], por_faixa_etaria: [] };

  const p1 = page1(report);
  const p2 = page2(report, adGroups);
  const p3 = page3(report, convActions, demographics);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google Ads · ${escapeHtml(report.cliente ?? "Cliente")} · ${escapeHtml(report.periodo)}</title>
<style>
${BASE_REPORT_CSS}
${GOOGLE_PDF_CSS}
</style>
</head>
<body>
${p1}
${p2}
${p3}
<script>window.__READY__ = true;</script>
</body>
</html>`;
}
