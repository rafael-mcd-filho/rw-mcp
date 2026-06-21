import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PdfReportModel } from "./report.js";
import { moneyBR, intBR, pctBR } from "./format.js";
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

type CampaignRow = PdfReportModel["campanhas"][number];
type ObjectiveRow = PdfReportModel["objetivos"][number];

function logoDataUri(): string | null {
  const candidates = [
    process.env.META_REPORT_LOGO,
    join(here, "..", "..", "assets", "logo-plugue.png"),
    join(here, "..", "assets", "logo-plugue.png"),
  ].filter(Boolean) as string[];

  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) return null;

  const encoded = readFileSync(path).toString("base64");
  return `data:image/png;base64,${encoded}`;
}

function renderHeader(model: PdfReportModel, logo: string | null): string {
  const logoMarkup = logo
    ? `<img src="${logo}" alt="Logo" />`
    : `<div class="brand-fallback">Plugue</div>`;

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

function pageOne(model: PdfReportModel, logo: string | null, total: number): string {
  const objectiveTable = renderTable(model.objetivos, objectiveColumns());
  const campaigns = model.campanhas.slice(0, 4);
  const topCampaigns = renderTable(campaigns, campaignColumns(true), true);
  const channels = model.meta.channels.join(" e ");
  const acquisitionText =
    model.resumo.leituraExecutiva[0] ??
    "Sem volume suficiente para leitura executiva de aquisição.";
  const presenceText =
    model.resumo.leituraExecutiva[1] ??
    "Canais e objetivos devem ser lidos separadamente para evitar mistura de métricas.";

  return renderPage(
    model,
    1,
    total,
    `<div class="hero">
      <h1>Check-in de performance</h1>
      <p class="lead">Leitura consolidada das campanhas de ${escapeHtml(channels)} no período, com resultados separados por canal, investimento e custo por ação.</p>
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
        <h3>Leitura complementar</h3>
        <p>${escapeHtml(presenceText)}</p>
      </div>
    </div>`,
    false,
    logo
  );
}

import type { PdfObjectiveSummary, PdfCampaignRow } from "./report.js";

function renderChannelPage(
  model: PdfReportModel,
  pageNum: number,
  total: number,
  objective: PdfObjectiveSummary | null,
  channelCampaigns: PdfCampaignRow[],
  logo: string | null
): string {
  const topCampaigns = channelCampaigns.slice(0, 5);

  const metricCards: MetricCard[] = objective
    ? [
        { label: objective.headlineLabel, value: intBR(objective.resultado), tone: "red" },
        { label: "Investimento", value: moneyBR(objective.gasto) },
        {
          label: objective.costLabel,
          value: objective.resultado > 0 ? moneyBR(objective.custo) : "-",
          tone: "red",
        },
        { label: "CPC médio", value: moneyBR(objective.cpc) },
        { label: "CTR", value: pctBR(objective.ctr) },
        { label: "Frequência", value: objective.frequencia > 0 ? objective.frequencia.toFixed(2) : "-" },
        { label: "CPM", value: moneyBR(objective.cpm) },
        { label: "Cliques", value: intBR(objective.cliques) },
        objective.roas > 0
          ? { label: "ROAS", value: objective.roas.toFixed(2), tone: "red" }
          : { label: "Alcance", value: intBR(objective.alcance) },
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

  const title = objective ? objective.label : "Canal";
  const paragraph = objective
    ? `${objective.label} — leitura detalhada de volume, custo e eficiência das campanhas no período.`
    : "Sem dados disponíveis para este canal no período.";

  return renderPage(
    model,
    pageNum,
    total,
    `<div class="p2-body">
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(paragraph)}</p>
      ${renderMetricGrid(metricCards)}
    </section>
    <section class="section">
      <h2>Campanhas do canal</h2>
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
    <div class="note">${escapeHtml(model.notasMetodologicas[1])}</div>
    </div>`,
    false,
    logo
  );
}

function pageTactical(model: PdfReportModel, logo: string | null, pageNum: number, total: number): string {
  const dailyBars: BarItem[] = model.serieDiaria.slice(-6).map((day) => ({
    label: day.data,
    value: day.gasto,
    valueLabel: moneyBR(day.gasto),
    note: `${intBR(day.resultados)} resultados`,
  }));

  const objectiveBars: BarItem[] = model.objetivos.slice(0, 5).map((objective) => ({
    label: objective.label,
    value: objective.gasto,
    valueLabel: moneyBR(objective.gasto),
    note: `${intBR(objective.resultado)} em ${objective.headlineLabel.toLowerCase()}`,
  }));

  return renderPage(
    model,
    pageNum,
    total,
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

  let pages: string;
  if (model.kind === "integrated") {
    // 4 páginas: resumo → Meta → Google → fechamento tático
    const metaObjective = model.objetivos.find((o) => o.category === "meta_ads") ?? null;
    const googleObjective = model.objetivos.find((o) => o.category === "google_ads") ?? null;
    const metaCampaigns = model.campanhas.filter((c) => c.categoria === "meta_ads");
    const googleCampaigns = model.campanhas.filter((c) => c.categoria === "google_ads");
    const hasGoogle = googleObjective !== null;
    const hasMeta = metaObjective !== null;
    const total = 2 + (hasMeta ? 1 : 0) + (hasGoogle ? 1 : 0);
    let pageNum = 1;
    pages = [
      pageOne(model, logo, total),
      ...(hasMeta ? [renderChannelPage(model, ++pageNum, total, metaObjective, metaCampaigns, logo)] : []),
      ...(hasGoogle ? [renderChannelPage(model, ++pageNum, total, googleObjective, googleCampaigns, logo)] : []),
      pageTactical(model, logo, ++pageNum, total),
    ].join("\n");
  } else {
    // Layout padrão 3 páginas
    const main = model.objetivoPrincipal;
    const channelCampaigns = main
      ? model.campanhas.filter((c) => c.categoria === main.category)
      : model.campanhas;
    pages = [
      pageOne(model, logo, 3),
      renderChannelPage(model, 2, 3, main, channelCampaigns, logo),
      pageTactical(model, logo, 3, 3),
    ].join("\n");
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.cliente)} - relatório</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
  <style>${BASE_REPORT_CSS}</style>
</head>
<body>
  ${pages}
  <script>window.__READY__ = true;</script>
</body>
</html>`;
}

/**
 * Monta o HTML completo do relatório integrado com todas as páginas dos dois canais.
 * @param model   Modelo de resumo consolidado (página 1 + fechamento)
 * @param googleFragment  Divs de página do Google (de renderGooglePagesFragment)
 * @param metaFragment    Divs de página do Meta (de renderMetaPagesFragment)
 * @param extraCss        CSS adicional dos renderers individuais (GOOGLE_PDF_CSS + META_PDF_CSS)
 */
export function renderIntegratedFullHtml(
  model: PdfReportModel,
  googleFragment: string,
  metaFragment: string,
  extraCss: string
): string {
  const logo = logoDataUri();
  const summary = pageOne(model, logo, 1);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.cliente)} - relatório combinado</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
  <style>${BASE_REPORT_CSS}${extraCss}</style>
</head>
<body>
  ${summary}
  ${googleFragment}
  ${metaFragment}
  <script>window.__READY__ = true;</script>
</body>
</html>`;
}
