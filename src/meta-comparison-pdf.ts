import { BASE_REPORT_CSS, escapeHtml } from "./pdf-components.js";
import { reportLogoDataUri, renderReportFooter, renderReportHeader } from "./pdf-brand.js";
import { moneyBR, intBR, pctBR } from "./format.js";

interface CampaignRow {
  nome: string;
  headlineLabel: string;
  gasto: number;
  resultado: number;
  custo: number;
  ctr: number;
}

export interface MetaAccountComparisonData {
  cliente: string;
  periodo_atual: string;
  periodo_anterior: string;
  atual: { gasto: number; resultados: number; ctr: number; campanhas: CampaignRow[] };
  anterior: { gasto: number; resultados: number; ctr: number; campanhas: CampaignRow[] };
}

const esc = escapeHtml;
const delta = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;
const deltaText = (current: number, previous: number) => {
  const value = delta(current, previous);
  if (value == null) return "Sem base anterior";
  return `${value >= 0 ? "↑" : "↓"} ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

export function renderMetaComparisonHtml(data: MetaAccountComparisonData): string {
  const logo = reportLogoDataUri();
  const campaigns = [...data.atual.campanhas].sort((a, b) => b.gasto - a.gasto).slice(0, 12);
  const rows = campaigns.map((campaign) => {
    const previous = data.anterior.campanhas.find(item => item.nome === campaign.nome);
    return `<tr>
      <td><strong>${esc(campaign.nome)}</strong><span>${esc(campaign.headlineLabel)}</span></td>
      <td class="num">${moneyBR(campaign.gasto)}</td>
      <td class="num">${moneyBR(previous?.gasto ?? 0)}</td>
      <td class="num">${deltaText(campaign.gasto, previous?.gasto ?? 0)}</td>
      <td class="num">${intBR(campaign.resultado)}</td>
      <td class="num">${intBR(previous?.resultado ?? 0)}</td>
      <td class="num">${campaign.resultado > 0 ? moneyBR(campaign.custo) : "—"}</td>
    </tr>`;
  }).join("");
  const header = renderReportHeader({
    category: "META ADS",
    description: "Comparativo de performance",
    client: data.cliente,
    period: `${data.periodo_atual} vs ${data.periodo_anterior}`,
    detail: "Evolução entre períodos",
    logo,
  });
  const footer = renderReportFooter({
    sourceLabel: `Plugue Marketing Solutions · ${data.cliente}`,
    generatedAt: `Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    page: 1, total: 1,
  });
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>${esc(data.cliente)} - Comparativo Meta</title>
  <style>${BASE_REPORT_CSS}</style></head><body>
  <div class="page compact-page">
    ${header}
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0">
      <div class="kpi red"><span>Investimento atual</span><strong>${moneyBR(data.atual.gasto)}</strong><small>${deltaText(data.atual.gasto, data.anterior.gasto)} vs anterior</small></div>
      <div class="kpi black"><span>Resultados atuais</span><strong>${intBR(data.atual.resultados)}</strong><small>${deltaText(data.atual.resultados, data.anterior.resultados)} vs anterior</small></div>
      <div class="kpi red"><span>CTR atual</span><strong>${pctBR(data.atual.ctr)}</strong><small>${deltaText(data.atual.ctr, data.anterior.ctr)} vs anterior</small></div>
      <div class="kpi black"><span>Investimento anterior</span><strong>${moneyBR(data.anterior.gasto)}</strong><small>${esc(data.periodo_anterior)}</small></div>
      <div class="kpi red"><span>Resultados anteriores</span><strong>${intBR(data.anterior.resultados)}</strong><small>Base de comparação</small></div>
      <div class="kpi black"><span>CTR anterior</span><strong>${pctBR(data.anterior.ctr)}</strong><small>Base de comparação</small></div>
    </div>
    <div class="section">
      <h3>Comparativo por campanha</h3>
      <table class="table compact-table">
        <thead><tr><th>Campanha</th><th class="num">Invest. atual</th><th class="num">Anterior</th><th class="num">Variação</th><th class="num">Resultados</th><th class="num">Anterior</th><th class="num">Custo/Res.</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7">Sem campanhas no período atual.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="note" style="margin-top:12px"><strong>Leitura:</strong> resultados e custos respeitam o objetivo detectado em cada campanha Meta.</div>
    ${footer}
  </div><script>window.__READY__=true;</script></body></html>`;
}
