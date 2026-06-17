import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PdfReportModel } from "./report.js";
import {
  BASE_REPORT_CSS,
  escapeHtml,
  renderBars,
  renderInsightList,
  renderKpiGrid,
  renderMetricGrid,
  renderTable,
  type BarItem,
  type MetricCard,
  type TableColumn,
} from "./pdf-components.js";

const here = dirname(fileURLToPath(import.meta.url));

const moneyBR = (n: number): string =>
  "R$ " +
  (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const intBR = (n: number): string =>
  (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const pctBR = (n: number): string =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";

type CampaignRow = PdfReportModel["campanhas"][number];
type ObjectiveRow = PdfReportModel["objetivos"][number];

function logoDataUri(): string | null {
  const candidates = [
    process.env.META_REPORT_LOGO,
    join(here, "..", "..", "assets", "logo-lima-soares-vermelho.png"),
    join(here, "..", "assets", "logo-lima-soares-vermelho.png"),
  ].filter(Boolean) as string[];

  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) return null;

  const encoded = readFileSync(path).toString("base64");
  return `data:image/png;base64,${encoded}`;
}

function renderHeader(model: PdfReportModel, logo: string | null): string {
  const logoMarkup = logo
    ? `<img src="${logo}" alt="Logo" />`
    : `<div class="brand-fallback">LS</div>`;

  return `<header>
    <div class="brand">
      ${logoMarkup}
      <div class="brand-text">
        <strong>Check-in</strong>
        <span>Relatório de performance</span>
      </div>
    </div>
    <div class="period">
      <strong>${escapeHtml(model.meta.clientName)}</strong><br />
      ${escapeHtml(model.meta.periodLabel)}<br />
      ${escapeHtml(model.meta.channels.join(" e "))}
    </div>
  </header>`;
}

function renderFooter(model: PdfReportModel, page: number, total: number): string {
  return `<div class="footer">
    <span>${escapeHtml(model.meta.sourceLabel)}</span>
    <span>${page} / ${total}</span>
  </div>`;
}

function renderPage(
  model: PdfReportModel,
  page: number,
  total: number,
  body: string,
  compact = false,
  logo: string | null
): string {
  return `<section class="page ${compact ? "compact-page" : ""}" data-page="${page}">
    <div class="topline"></div>
    ${renderHeader(model, logo)}
    ${body}
    ${renderFooter(model, page, total)}
  </section>`;
}

function campaignColumns(compact = false): TableColumn<CampaignRow>[] {
  return [
    {
      label: "Campanha",
      value: (row) =>
        `<strong>${escapeHtml(row.nome)}</strong><span>${escapeHtml(
          row.categoriaLabel
        )}</span>`,
    },
    {
      label: "Resultado",
      value: (row) => escapeHtml(row.headlineLabel),
    },
    {
      label: "Qtd.",
      align: "right",
      value: (row) => intBR(row.resultado),
    },
    {
      label: "Custo/result.",
      align: "right",
      value: (row) => (row.resultado > 0 ? moneyBR(row.custo) : "-"),
    },
    {
      label: compact ? "Invest." : "Valor usado",
      align: "right",
      value: (row) => moneyBR(row.gasto),
    },
    {
      label: "Cliques",
      align: "right",
      value: (row) => intBR(row.cliques),
    },
    {
      label: "CTR",
      align: "right",
      value: (row) => pctBR(row.ctr),
    },
  ];
}

function objectiveColumns(): TableColumn<ObjectiveRow>[] {
  return [
    {
      label: "Objetivo",
      value: (row) =>
        `<strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(
          `${row.campaignsCount} campanha${row.campaignsCount === 1 ? "" : "s"}`
        )}</span>`,
    },
    {
      label: "Invest.",
      align: "right",
      value: (row) => moneyBR(row.gasto),
    },
    {
      label: "Resultado",
      align: "right",
      value: (row) => intBR(row.resultado),
    },
    {
      label: "Custo/result.",
      align: "right",
      value: (row) => (row.resultado > 0 ? moneyBR(row.custo) : "-"),
    },
    {
      label: "Cliques",
      align: "right",
      value: (row) => intBR(row.cliques),
    },
    {
      label: "CTR",
      align: "right",
      value: (row) => pctBR(row.ctr),
    },
  ];
}

function pageOne(model: PdfReportModel, logo: string | null): string {
  const objectiveTable = renderTable(model.objetivos, objectiveColumns());
  const campaigns = model.campanhas.slice(0, 4);
  const topCampaigns = renderTable(campaigns, campaignColumns(true), true);
  const acquisitionText =
    model.resumo.leituraExecutiva[0] ??
    "Sem volume suficiente para leitura executiva de aquisição.";
  const presenceText =
    model.resumo.leituraExecutiva[1] ??
    "Objetivos de apoio devem ser lidos separadamente para evitar mistura de métricas.";

  return renderPage(
    model,
    1,
    3,
    `<div class="hero">
      <h1>Check-in de performance</h1>
      <p class="lead">Leitura consolidada das campanhas de Meta Ads no período, com objetivos separados por tipo de resultado, investimento e custo por ação.</p>
    </div>
    ${renderKpiGrid(model.resumo.kpis)}
    <section class="section">
      <h2>Resumo por objetivo</h2>
      ${objectiveTable}
      <div class="note">${escapeHtml(model.notasMetodologicas[0])}</div>
    </section>
    <section class="section">
      <h2>Campanhas e métricas principais</h2>
      ${topCampaigns}
    </section>
    <div class="two-col">
      <div class="panel dark">
        <h3>Leitura de aquisição</h3>
        <p>${escapeHtml(acquisitionText)}</p>
      </div>
      <div class="panel dark">
        <h3>Leitura de presença</h3>
        <p>${escapeHtml(presenceText)}</p>
      </div>
    </div>`,
    false,
    logo
  );
}

function pageTwo(model: PdfReportModel, logo: string | null): string {
  const main = model.objetivoPrincipal;
  const campaigns = main
    ? model.campanhas.filter((campaign) => campaign.categoria === main.category)
    : model.campanhas;
  const topCampaigns = campaigns.slice(0, 7);

  const metricCards: MetricCard[] = main
    ? [
        { label: main.headlineLabel, value: intBR(main.resultado), tone: "red" },
        { label: "Investimento", value: moneyBR(main.gasto) },
        {
          label: main.costLabel,
          value: main.resultado > 0 ? moneyBR(main.custo) : "-",
          tone: "red",
        },
        { label: "CPC médio", value: moneyBR(main.cpc) },
        { label: "CTR", value: pctBR(main.ctr) },
        { label: "Frequência", value: main.frequencia > 0 ? main.frequencia.toFixed(2) : "-" },
        { label: "CPM", value: moneyBR(main.cpm) },
        { label: "Cliques", value: intBR(main.cliques) },
        main.roas > 0
          ? { label: "ROAS", value: main.roas.toFixed(2), tone: "red" }
          : { label: "Alcance", value: intBR(main.alcance) },
      ]
    : [];

  const resultBars: BarItem[] = topCampaigns.map((campaign) => ({
    label: campaign.nome,
    value: campaign.resultado,
    valueLabel: intBR(campaign.resultado),
    note: `${moneyBR(campaign.gasto)} investidos`,
  }));

  const costBars: BarItem[] = topCampaigns
    .filter((campaign) => campaign.resultado > 0)
    .map((campaign) => ({
      label: campaign.nome,
      value: campaign.custo,
      valueLabel: moneyBR(campaign.custo),
      note: `${intBR(campaign.resultado)} resultados`,
      negative: true,
    }));

  const title = main ? main.label : "Objetivo principal";
  const paragraph = main
    ? `${main.label} foi o principal recorte do período por investimento. A leitura abaixo separa volume, custo e eficiência das campanhas desse objetivo.`
    : "Sem objetivo dominante no período analisado.";

  return renderPage(
    model,
    2,
    3,
    `<section class="section">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(paragraph)}</p>
      ${renderMetricGrid(metricCards)}
    </section>
    <section class="section">
      <h2>Campanhas do objetivo principal</h2>
      ${renderTable(topCampaigns, campaignColumns(), true)}
    </section>
    <div class="two-col">
      <div class="panel">
        <h3>Resultado por campanha</h3>
        ${renderBars(resultBars)}
      </div>
      <div class="panel">
        <h3>Custo por resultado</h3>
        ${renderBars(costBars)}
      </div>
    </div>
    <div class="note">${escapeHtml(model.notasMetodologicas[1])}</div>`,
    false,
    logo
  );
}

function pageThree(model: PdfReportModel, logo: string | null): string {
  const dailyBars: BarItem[] = model.serieDiaria.slice(-6).map((day) => ({
    label: day.data,
    value: day.gasto,
    valueLabel: moneyBR(day.gasto),
    note: `${intBR(day.resultados)} resultados de conversão`,
  }));

  const objectiveBars: BarItem[] = model.objetivos.slice(0, 5).map((objective) => ({
    label: objective.label,
    value: objective.gasto,
    valueLabel: moneyBR(objective.gasto),
    note: `${intBR(objective.resultado)} em ${objective.headlineLabel.toLowerCase()}`,
  }));

  return renderPage(
    model,
    3,
    3,
    `<section class="section">
      <h2>Fechamento tático</h2>
      <p>Resumo compacto para orientar ajustes de verba, leitura de fonte e próximos passos do período seguinte.</p>
    </section>
    <div class="two-col">
      <div class="panel">
        <h3>Evolução diária</h3>
        ${renderBars(dailyBars)}
      </div>
      <div class="panel">
        <h3>Investimento por objetivo</h3>
        ${renderBars(objectiveBars)}
      </div>
    </div>
    <div class="two-col">
      <div class="panel">
        <h3>Próximos passos</h3>
        ${renderInsightList(model.proximosPassos)}
      </div>
      <div class="panel">
        <h3>Notas de leitura</h3>
        ${renderInsightList(model.notasMetodologicas)}
      </div>
    </div>
    <div class="note">${escapeHtml(model.notasMetodologicas[2])}</div>`,
    true,
    logo
  );
}

export function renderPdfHtml(model: PdfReportModel): string {
  const logo = logoDataUri();
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.cliente)} - relatório</title>
  <style>${BASE_REPORT_CSS}</style>
</head>
<body>
  ${pageOne(model, logo)}
  ${pageTwo(model, logo)}
  ${pageThree(model, logo)}
  <script>window.__READY__ = true;</script>
</body>
</html>`;
}
