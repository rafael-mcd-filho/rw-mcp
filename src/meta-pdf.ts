// Template HTML A4 dedicado ao relatório Meta Ads.
// Gera 4 páginas: Resumo+Funil+Campanhas, Conjuntos de Anúncio, Anúncios, Demográficos.

import type { Insight } from "./meta-api.js";
import { aggregate } from "./report.js";
import { detectCategory } from "./objectives.js";
import { BASE_REPORT_CSS, escapeHtml } from "./pdf-components.js";
import { moneyBR, intBR, pctBR } from "./format.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const esc = escapeHtml;
const toNum = (v: unknown): number => parseFloat(String(v ?? "0").replace(",", ".")) || 0;
const toInt = (v: unknown): number => parseInt(String(v ?? "0"), 10) || 0;
function money(n: number) { return n > 0 ? moneyBR(n) : "R$ 0"; }
function cpa(gasto: number, result: number) { return result > 0 ? money(gasto / result) : "—"; }

// ─── Interfaces públicas ───────────────────────────────────────────────────────

export interface MetaAdsetRow {
  nome: string;
  campanha: string;
  headlineLabel: string;
  resultado: number;
  custo_resultado: number;
  gasto: number;
  cliques: number;
  impressoes: number;
  alcance: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequencia: number;
}

export interface MetaAdRow {
  ad_id?: string;
  nome: string;
  conjunto: string;
  campanha: string;
  headlineLabel: string;
  resultado: number;
  custo_resultado: number;
  gasto: number;
  cliques: number;
  impressoes: number;
  alcance: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequencia: number;
}

export interface MetaDemographicRow {
  segmento: string;
  impressoes: number;
  alcance: number;
  cliques: number;
  gasto: number;
  ctr: number;
}

export interface MetaDemographics {
  por_genero: MetaDemographicRow[];
  por_faixa_etaria: MetaDemographicRow[];
}

export interface MetaFunil {
  alcance: number;
  cliques: number;
  cliques_link: number;
  meta_label: string;
  meta_valor: number;
}

// ─── Processadores de dados ────────────────────────────────────────────────────

export function processMetaAdsets(rows: Insight[]): MetaAdsetRow[] {
  return rows
    .map((r) => {
      const config = detectCategory(r.campaign_name ?? "", r.objective);
      const agg = aggregate([r], config);
      return {
        nome: r.adset_name ?? "(sem nome)",
        campanha: r.campaign_name ?? "—",
        headlineLabel: config.headlineLabel,
        resultado: agg.totalConversoes,
        custo_resultado: agg.cpa,
        gasto: agg.totalSpend,
        cliques: agg.totalClicks,
        impressoes: agg.totalImpressions,
        alcance: agg.totalReach,
        ctr: agg.avgCTR,
        cpc: agg.avgCPC,
        cpm: agg.avgCPM,
        frequencia: agg.avgFrequency,
      };
    })
    .sort((a, b) => b.gasto - a.gasto);
}

export function processMetaAds(rows: Insight[]): MetaAdRow[] {
  return rows
    .map((r) => {
      const config = detectCategory(r.campaign_name ?? "", r.objective);
      const agg = aggregate([r], config);
      return {
        ad_id: r.ad_id,
        nome: r.ad_name ?? "(sem nome)",
        conjunto: r.adset_name ?? "—",
        campanha: r.campaign_name ?? "—",
        headlineLabel: config.headlineLabel,
        resultado: agg.totalConversoes,
        custo_resultado: agg.cpa,
        gasto: agg.totalSpend,
        cliques: agg.totalClicks,
        impressoes: agg.totalImpressions,
        alcance: agg.totalReach,
        ctr: agg.avgCTR,
        cpc: agg.avgCPC,
        cpm: agg.avgCPM,
        frequencia: agg.avgFrequency,
      };
    })
    .sort((a, b) => b.gasto - a.gasto);
}

const GENDER_LABEL: Record<string, string> = {
  male: "Masculino",
  female: "Feminino",
  unknown: "Desconhecido",
};

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "desconhecido"];

export function processMetaDemographics(rows: Insight[]): MetaDemographics {
  const byGender: Record<string, MetaDemographicRow> = {};
  const byAge: Record<string, MetaDemographicRow> = {};

  for (const r of rows) {
    const imp = toInt(r.impressions);
    const alc = toInt(r.reach ?? "0");
    const clk = toInt(r.clicks);
    const gas = toNum(r.spend);

    if (r.gender) {
      const key = GENDER_LABEL[r.gender] ?? r.gender;
      if (!byGender[key]) byGender[key] = { segmento: key, impressoes: 0, alcance: 0, cliques: 0, gasto: 0, ctr: 0 };
      byGender[key].impressoes += imp;
      byGender[key].alcance += alc;
      byGender[key].cliques += clk;
      byGender[key].gasto += gas;
    }

    if (r.age) {
      const key = r.age;
      if (!byAge[key]) byAge[key] = { segmento: key, impressoes: 0, alcance: 0, cliques: 0, gasto: 0, ctr: 0 };
      byAge[key].impressoes += imp;
      byAge[key].alcance += alc;
      byAge[key].cliques += clk;
      byAge[key].gasto += gas;
    }
  }

  for (const row of [...Object.values(byGender), ...Object.values(byAge)]) {
    row.ctr = row.impressoes > 0 ? (row.cliques / row.impressoes) * 100 : 0;
    row.gasto = Math.round(row.gasto * 100) / 100;
  }

  const gOrder = ["Feminino", "Masculino", "Desconhecido"];
  const por_genero = gOrder.map((k) => byGender[k]).filter((x): x is MetaDemographicRow => !!x && x.impressoes > 0);
  const por_faixa_etaria = AGE_ORDER
    .map((k) => byAge[k])
    .filter((x): x is MetaDemographicRow => !!x && x.impressoes > 0);

  return { por_genero, por_faixa_etaria };
}

export function buildMetaFunil(
  campaigns: ReturnType<typeof processMetaAdsets>[number][],
  accountRows: Insight[]
): MetaFunil {
  const totalAlcance = accountRows.reduce((s, r) => s + toInt(r.reach ?? "0"), 0);
  const totalCliques = accountRows.reduce((s, r) => s + toInt(r.clicks), 0);
  const totalLink = accountRows.reduce((s, r) => s + toInt(r.inline_link_clicks ?? "0"), 0);

  // Determina meta principal pela categoria de maior gasto
  const byCategory: Record<string, { label: string; valor: number; gasto: number }> = {};
  for (const c of campaigns) {
    const k = c.headlineLabel;
    if (!byCategory[k]) byCategory[k] = { label: k, valor: 0, gasto: 0 };
    byCategory[k].valor += c.resultado;
    byCategory[k].gasto += c.gasto;
  }
  const dominant = Object.values(byCategory).sort((a, b) => b.gasto - a.gasto)[0];

  return {
    alcance: totalAlcance,
    cliques: totalCliques,
    cliques_link: totalLink,
    meta_label: dominant?.label ?? "Conversões",
    meta_valor: dominant?.valor ?? 0,
  };
}

// ─── CSS adicional ─────────────────────────────────────────────────────────────

const META_PDF_CSS = `
.funnel-wrap { margin: 12px 0 10px; display: flex; flex-direction: column; gap: 3px; align-items: center; }
.funnel-step {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 10px 20px; border-radius: 3px; text-align: center; color: #fff;
  position: relative;
}
.funnel-step strong { font-size: 18px; font-weight: 850; line-height: 1; }
.funnel-step span { font-size: 9.5px; margin-top: 3px; opacity: .9; }
.funnel-step-1 { width:100%; background:#1A53F0; clip-path: polygon(0 0, 100% 0, 96% 100%, 4% 100%); }
.funnel-step-2 { width:100%; background:#1748d4; clip-path: polygon(4% 0, 96% 0, 92% 100%, 8% 100%); }
.funnel-step-3 { width:100%; background:#133db8; clip-path: polygon(8% 0, 92% 0, 88% 100%, 12% 100%); }
.funnel-step-4 { width:100%; background:#0B2A6B; clip-path: polygon(12% 0, 88% 0, 84% 100%, 16% 100%); }
.funnel-pct { font-size: 8px; color: #6b7280; text-align: center; margin: 1px 0; }
.m-section-title { font-size: 11px; font-weight: 750; color: #101216; margin: 12px 0 5px; text-transform: uppercase; letter-spacing: .5px; }
.m-section-rule { border: none; border-top: 1px solid #e5e7eb; margin: 0 0 7px; }
.note-row { font-size: 9px; color: #6b7280; font-style: italic; margin-top: 4px; }
.demog-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px; }
.demog-block h4 { font-size: 10px; text-transform: uppercase; color: #667085; margin: 0 0 6px; font-weight: 750; letter-spacing: .4px; }
.demog-table { width: 100%; border-collapse: collapse; font-size: 9px; }
.demog-table th { padding: 5px 5px; text-align: left; color: #6b7280; font-size: 8px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; background: #f8fafc; font-weight: 700; }
.demog-table th.num, .demog-table td.num { text-align: right; }
.demog-table td { padding: 5px 5px; border-bottom: 1px solid #eef0f4; color: #252b36; font-variant-numeric: tabular-nums; }
.demog-bar-track { height: 5px; background: #eceff3; border-radius: 999px; overflow: hidden; margin-top: 3px; }
.demog-bar-fill  { height: 100%; border-radius: 999px; background: linear-gradient(90deg,#1A53F0,#0B2A6B); }
`;

// ─── Layout helpers ────────────────────────────────────────────────────────────

function pageHeader(cliente: string, periodo: string, tipo: string): string {
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
      </div>
    </header>`;
}

function pageFooter(cliente: string, periodo: string, page: number, total: number): string {
  const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `<div class="footer">
    <span>Plugue Marketing Solutions · ${esc(cliente)} · ${esc(periodo)}</span>
    <span>Gerado em ${now} · Página ${page}/${total}</span>
  </div>`;
}

function sectionTitle(t: string): string {
  return `<p class="m-section-title">${esc(t)}</p><hr class="m-section-rule">`;
}

// ─── Página 1: KPI + Funil + Campanhas ────────────────────────────────────────

type CampaignRow = {
  nome: string; categoria: string; headlineLabel: string; costLabel: string;
  categoriaLabel: string; gasto: number; resultado: number; custo: number;
  cliques: number; impressoes: number; alcance: number; ctr: number;
  cpc: number; cpm: number; frequencia: number;
};

function deltaChipMeta(pct: number | null, dir: "higher" | "lower" | "neutral"): string {
  if (pct == null) return `<span style="color:#9ca3af;font-weight:700">novo</span>`;
  const rounded = Math.round(pct);
  if (rounded === 0) return `<span style="color:#6b7280;font-weight:700">→ 0%</span>`;
  const up = pct > 0;
  let color = "#6b7280";
  if (dir !== "neutral") color = (dir === "lower" ? !up : up) ? "#16a34a" : "#dc2626";
  return `<span style="color:${color};font-weight:700">${up ? "↑" : "↓"} ${Math.abs(rounded)}%</span>`;
}

function metaExecSummary(totais: { gasto: number }, funil: MetaFunil, c?: MetaReportComparison): string {
  const base = `<strong>Resumo do período:</strong> ${money(totais.gasto)} · ${intBR(funil.meta_valor)} ${esc(funil.meta_label.toLowerCase())}${funil.meta_valor > 0 ? ` · CPA ${cpa(totais.gasto, funil.meta_valor)}` : ""}`;
  const vs = c
    ? `<div style="margin-top:4px;font-size:10.3px;color:#5f6673">vs período anterior (${esc(c.periodo_anterior)}): resultados ${deltaChipMeta(c.resultado.pct, "higher")} · CPA ${deltaChipMeta(c.cpa.pct, "lower")} · CTR ${deltaChipMeta(c.ctr.pct, "higher")} · investimento ${deltaChipMeta(c.investimento.pct, "neutral")}</div>`
    : "";
  return `<div style="margin:12px 0 2px;padding:10px 13px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:11px;color:#303641;line-height:1.45">${base}${vs}</div>`;
}

function page1(
  cliente: string,
  periodo: string,
  totais: { gasto: number; totalImpressions: number; totalReach: number; totalCliques: number; avgCTR: number; avgCPM: number; avgFrequency: number },
  campanhas: CampaignRow[],
  funil: MetaFunil,
  leitura: string[],
  comparacao?: MetaReportComparison
): string {
  const totalGasto = totais.gasto;

  // 6 KPIs
  const kpis = [
    { label: "Investimento", value: money(totalGasto), note: `${campanhas.filter(c => c.gasto > 0).length} campanhas com entrega`, tone: "red" },
    { label: "Alcance", value: intBR(totais.totalReach), note: `Freq. média: ${(totais.avgFrequency).toFixed(2).replace(".", ",")}`, tone: "black" },
    { label: "Impressões", value: intBR(totais.totalImpressions), note: `CPM: ${money(totais.avgCPM)}`, tone: "red" },
    { label: "Cliques", value: intBR(totais.totalCliques), note: `CTR: ${pctBR(totais.avgCTR)}`, tone: "black" },
    { label: "Cliques no link", value: intBR(funil.cliques_link), note: funil.cliques_link > 0 ? `${Math.round((funil.cliques_link / Math.max(funil.cliques, 1)) * 100)}% dos cliques` : "—", tone: "red" },
    { label: funil.meta_label, value: intBR(funil.meta_valor), note: funil.meta_valor > 0 ? `CPA: ${cpa(totalGasto, funil.meta_valor)}` : "—", tone: "black" },
  ];

  const kpiHtml = `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 8px">${
    kpis.map((k, i) => `<div class="kpi ${k.tone}">
      <span>${esc(k.label)}</span>
      <strong>${esc(k.value)}</strong>
      <small>${esc(k.note)}</small>
    </div>`).join("")
  }</div>`;

  // Funil
  function funnelPct(num: number, den: number) {
    if (!den || !num) return "";
    return `${Math.round((num / den) * 100)}% do passo anterior`;
  }

  const funilHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:8px 0 10px">
      <div>
        ${sectionTitle("Funil de Alcance")}
        <div class="funnel-wrap">
          <div class="funnel-step funnel-step-1">
            <strong>${intBR(funil.alcance)}</strong>
            <span>Alcance Total</span>
          </div>
          <div class="funnel-step funnel-step-2">
            <strong>${intBR(funil.cliques)}</strong>
            <span>Total de Cliques</span>
          </div>
          ${funil.cliques_link > 0 ? `
          <div class="funnel-step funnel-step-3">
            <strong>${intBR(funil.cliques_link)}</strong>
            <span>Cliques no Link</span>
          </div>` : ""}
          ${funil.meta_valor > 0 ? `
          <div class="funnel-step funnel-step-4">
            <strong>${intBR(funil.meta_valor)}</strong>
            <span>${esc(funil.meta_label)}</span>
          </div>` : ""}
        </div>
      </div>
      <div>
        ${sectionTitle("Leitura Executiva")}
        <div class="insight-list">${leitura.slice(0, 4).map(l =>
          `<div class="insight"><span class="dot"></span><span>${esc(l)}</span></div>`).join("")}
        </div>
      </div>
    </div>`;

  // Campanhas table
  const campRows = campanhas.slice(0, 10).map(c => `<tr>
    <td><strong>${esc(c.nome)}</strong><span>${esc(c.categoriaLabel)}</span></td>
    <td class="num">${money(c.gasto)}</td>
    <td><strong>${intBR(c.resultado)}</strong><span>${esc(c.headlineLabel)}</span></td>
    <td class="num">${c.resultado > 0 ? money(c.custo) : "—"}</td>
    <td class="num">${pctBR(c.ctr)}</td>
    <td class="num">${money(c.cpc)}</td>
    <td class="num">${money(c.cpm)}</td>
    <td class="num">${intBR(c.alcance)}</td>
  </tr>`).join("");

  const campTable = `<table class="table compact-table">
    <thead><tr>
      <th>Campanha / Objetivo</th>
      <th class="num">Investimento</th>
      <th class="num">Resultado</th>
      <th class="num">Custo/Res.</th>
      <th class="num">CTR</th>
      <th class="num">CPC</th>
      <th class="num">CPM</th>
      <th class="num">Alcance</th>
    </tr></thead>
    <tbody>${campRows || '<tr><td colspan="8">Sem campanhas com entrega no período.</td></tr>'}</tbody>
  </table>`;

  return `<div class="page compact-page">
    ${pageHeader(cliente, periodo, "Relatório Meta Ads")}
    ${metaExecSummary(totais, funil, comparacao)}
    ${kpiHtml}
    ${funilHtml}
    <div class="section">
      ${sectionTitle("Campanhas em Destaque")}
      ${campTable}
      ${campanhas.length > 10 ? `<p class="note-row">Exibindo as 10 campanhas de maior investimento (${campanhas.length} no total).</p>` : ""}
    </div>
    ${pageFooter(cliente, periodo, 1, 4)}
  </div>`;
}

// ─── Página 2: Conjuntos de Anúncio ───────────────────────────────────────────

function page2(cliente: string, periodo: string, adsets: MetaAdsetRow[]): string {
  const rows = adsets.slice(0, 20).map(a => `<tr>
    <td><strong>${esc(a.nome)}</strong><span>${esc(a.campanha)}</span></td>
    <td class="num">${money(a.gasto)}</td>
    <td><strong>${intBR(a.resultado)}</strong><span>${esc(a.headlineLabel)}</span></td>
    <td class="num">${a.resultado > 0 ? money(a.custo_resultado) : "—"}</td>
    <td class="num">${pctBR(a.ctr)}</td>
    <td class="num">${money(a.cpc)}</td>
    <td class="num">${money(a.cpm)}</td>
    <td class="num">${intBR(a.alcance)}</td>
    <td class="num">${intBR(a.impressoes)}</td>
    <td class="num">${intBR(a.cliques)}</td>
  </tr>`).join("");

  const table = `<table class="table compact-table">
    <thead><tr>
      <th>Conjunto / Campanha</th>
      <th class="num">Invest.</th>
      <th class="num">Resultado</th>
      <th class="num">Custo/Res.</th>
      <th class="num">CTR</th>
      <th class="num">CPC</th>
      <th class="num">CPM</th>
      <th class="num">Alcance</th>
      <th class="num">Impressões</th>
      <th class="num">Cliques</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="10">Sem conjuntos de anúncio no período.</td></tr>'}</tbody>
  </table>`;

  return `<div class="page compact-page">
    ${pageHeader(cliente, periodo, "Meta Ads · Conjuntos de Anúncio")}
    <div class="section" style="margin-top:6px">
      ${sectionTitle("Conjuntos de Anúncio em Destaque")}
      ${table}
      ${adsets.length > 20 ? `<p class="note-row">Exibindo os 20 conjuntos de maior investimento (${adsets.length} no total).</p>` : ""}
    </div>
    <div class="note" style="margin-top:14px;font-size:9.5px">
      <strong>Leitura:</strong> Cada conjunto de anúncio agrupa audiência, posicionamento e orçamento. Compare CPC e CPM para identificar quais públicos são mais eficientes. O "Custo/Resultado" reflete o objetivo da campanha pai.
    </div>
    ${pageFooter(cliente, periodo, 2, 4)}
  </div>`;
}

// ─── Página 3: Anúncios ───────────────────────────────────────────────────────

function renderTopCriativo(t?: TopCriativo): string {
  if (!t) return "";
  const img = t.preview
    ? `<img src="${t.preview}" alt="Criativo" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0" />`
    : `<div style="width:96px;height:96px;border-radius:8px;border:1px solid #e5e7eb;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;text-align:center;flex-shrink:0">sem<br/>preview</div>`;
  return `<div style="display:flex;gap:14px;align-items:center;padding:12px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px">
    ${img}
    <div style="min-width:0">
      <div style="font-size:10px;font-weight:700;color:#1A53F0;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Top criativo do período</div>
      <div style="font-size:13px;font-weight:800;color:#101216;margin-bottom:2px">${esc(t.nome)}</div>
      <div style="font-size:10px;color:#6b7280;margin-bottom:5px">${esc(t.conjunto)}</div>
      <div style="font-size:10.5px;color:#303641">${intBR(t.resultado)} ${esc(t.headlineLabel.toLowerCase())} · ${money(t.gasto)} · ${t.resultado > 0 ? `custo ${money(t.custo_resultado)}` : "sem conversões"} · CTR ${pctBR(t.ctr)}</div>
    </div>
  </div>`;
}

function page3(cliente: string, periodo: string, ads: MetaAdRow[], topCriativo?: TopCriativo): string {
  const rows = ads.slice(0, 18).map(a => `<tr>
    <td><strong>${esc(a.nome)}</strong><span>${esc(a.conjunto)}</span></td>
    <td class="num">${money(a.gasto)}</td>
    <td><strong>${intBR(a.resultado)}</strong><span>${esc(a.headlineLabel)}</span></td>
    <td class="num">${a.resultado > 0 ? money(a.custo_resultado) : "—"}</td>
    <td class="num">${intBR(a.alcance)}</td>
    <td class="num">${intBR(a.impressoes)}</td>
    <td class="num">${pctBR(a.ctr)}</td>
    <td class="num">${money(a.cpc)}</td>
    <td class="num">${money(a.cpm)}</td>
    <td class="num">${a.frequencia.toFixed(2).replace(".", ",")}</td>
  </tr>`).join("");

  const table = `<table class="table compact-table">
    <thead><tr>
      <th>Anúncio / Conjunto</th>
      <th class="num">Invest.</th>
      <th class="num">Resultado</th>
      <th class="num">Custo/Res.</th>
      <th class="num">Alcance</th>
      <th class="num">Impressões</th>
      <th class="num">CTR</th>
      <th class="num">CPC</th>
      <th class="num">CPM</th>
      <th class="num">Freq.</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="10">Sem anúncios com entrega no período.</td></tr>'}</tbody>
  </table>`;

  return `<div class="page compact-page">
    ${pageHeader(cliente, periodo, "Meta Ads · Anúncios")}
    ${renderTopCriativo(topCriativo)}
    <div class="section" style="margin-top:6px">
      ${sectionTitle("Anúncios em Destaque")}
      ${table}
      ${ads.length > 18 ? `<p class="note-row">Exibindo os 18 anúncios de maior investimento (${ads.length} no total).</p>` : ""}
    </div>
    <div class="note" style="margin-top:14px;font-size:9.5px">
      <strong>Frequência:</strong> Acima de 3,0 pode indicar fadiga criativa — considere rotacionar os criativos. Anúncios com CTR alto e CPM baixo são candidatos a maior orçamento.
    </div>
    ${pageFooter(cliente, periodo, 3, 4)}
  </div>`;
}

// ─── Página 4: Demográficos + Próximos passos ─────────────────────────────────

function page4(
  cliente: string,
  periodo: string,
  demographics: MetaDemographics,
  proximosPassos: string[],
  notas: string[]
): string {
  function demoTable(rows: MetaDemographicRow[], label: string) {
    const maxImp = Math.max(...rows.map(r => r.impressoes), 1);
    const html = rows.map(r => {
      const barW = Math.max(2, Math.round((r.impressoes / maxImp) * 100));
      return `<tr>
        <td>${esc(r.segmento)}</td>
        <td class="num">${intBR(r.impressoes)}</td>
        <td class="num">${intBR(r.alcance)}</td>
        <td class="num">${intBR(r.cliques)}</td>
        <td class="num">${pctBR(r.ctr)}</td>
        <td class="num">${money(r.gasto)}</td>
        <td style="width:80px;padding:3px 5px">
          <div class="demog-bar-track"><div class="demog-bar-fill" style="width:${barW}%"></div></div>
        </td>
      </tr>`;
    }).join("");
    return `<div class="demog-block">
      <h4>${esc(label)}</h4>
      <table class="demog-table">
        <thead><tr>
          <th>${label === "Gênero" ? "Gênero" : "Faixa Etária"}</th>
          <th class="num">Impres.</th>
          <th class="num">Alcance</th>
          <th class="num">Cliques</th>
          <th class="num">CTR</th>
          <th class="num">Invest.</th>
          <th>Share</th>
        </tr></thead>
        <tbody>${html || `<tr><td colspan="7">Sem dados de ${label.toLowerCase()}.</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  const hasDemo = demographics.por_genero.length > 0 || demographics.por_faixa_etaria.length > 0;

  const demoSection = hasDemo
    ? `<div class="demog-wrap">
        ${demoTable(demographics.por_genero, "Gênero")}
        ${demoTable(demographics.por_faixa_etaria, "Faixa Etária")}
      </div>`
    : `<p style="font-size:10px;color:#6b7280;margin-top:8px">Não há dados demográficos para o período. Verifique se a conta tem entrega suficiente ou se o breakdown está disponível.</p>`;

  const stepsSection = proximosPassos.length
    ? `<div class="section">
        ${sectionTitle("Próximos Passos")}
        <div class="insight-list">${proximosPassos.map(s =>
          `<div class="insight"><span class="dot"></span><span>${esc(s)}</span></div>`).join("")}
        </div>
      </div>`
    : "";

  const notasSection = notas.length
    ? `<div style="margin-top:10px">${notas.map(n =>
        `<p style="font-size:8.5px;color:#6b7280;margin-bottom:3px">· ${esc(n)}</p>`).join("")}
      </div>`
    : "";

  return `<div class="page compact-page">
    ${pageHeader(cliente, periodo, "Meta Ads · Demográficos")}
    <div class="section" style="margin-top:6px">
      ${sectionTitle("Impressões e Alcance por Segmento")}
      ${demoSection}
    </div>
    ${notasSection}
    ${pageFooter(cliente, periodo, 4, 4)}
  </div>`;
}

// ─── API pública ───────────────────────────────────────────────────────────────

export interface MetaReportComparison {
  periodo_anterior: string;
  resultado: { atual: number; anterior: number; pct: number | null };
  cpa: { atual: number; anterior: number; pct: number | null };
  ctr: { atual: number; anterior: number; pct: number | null };
  investimento: { atual: number; anterior: number; pct: number | null };
}

export interface TopCriativo {
  nome: string;
  conjunto: string;
  headlineLabel: string;
  resultado: number;
  custo_resultado: number;
  gasto: number;
  ctr: number;
  preview: string | null; // data URI (base64) ou null
}

export interface MetaPdfParams {
  cliente: string;
  periodo: string;
  comparacao?: MetaReportComparison;
  topCriativo?: TopCriativo;
  campanhas: CampaignRow[];
  totais: {
    gasto: number;
    totalImpressions: number;
    totalReach: number;
    totalCliques: number;
    avgCTR: number;
    avgCPM: number;
    avgFrequency: number;
  };
  leitura: string[];
  proximosPassos: string[];
  notas: string[];
  adsets: MetaAdsetRow[];
  ads: MetaAdRow[];
  demographics: MetaDemographics;
  funil: MetaFunil;
}

export function renderMetaReportHtml(p: MetaPdfParams): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Meta Ads · ${esc(p.cliente)} · ${esc(p.periodo)}</title>
<style>
${BASE_REPORT_CSS}
${META_PDF_CSS}
</style>
</head>
<body>
${page1(p.cliente, p.periodo, p.totais, p.campanhas, p.funil, p.leitura, p.comparacao)}
${page2(p.cliente, p.periodo, p.adsets)}
${page3(p.cliente, p.periodo, p.ads, p.topCriativo)}
${page4(p.cliente, p.periodo, p.demographics, p.proximosPassos, p.notas)}
<script>window.__READY__ = true;</script>
</body>
</html>`;
}
