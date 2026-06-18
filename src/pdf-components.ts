export interface KpiCard {
  label: string;
  value: string;
  note: string;
  tone: "red" | "black";
}

export interface MetricCard {
  label: string;
  value: string;
  tone?: "red" | "black";
}

export interface TableColumn<T> {
  label: string;
  value: (row: T) => string;
  align?: "left" | "right";
}

export interface BarItem {
  label: string;
  value: number;
  valueLabel: string;
  note?: string;
  negative?: boolean;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderKpiGrid(cards: KpiCard[]): string {
  return `<div class="kpi-grid">${cards
    .map(
      (card) => `<div class="kpi ${card.tone}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
        <small>${escapeHtml(card.note)}</small>
      </div>`
    )
    .join("")}</div>`;
}

export function renderMetricGrid(cards: MetricCard[]): string {
  return `<div class="metric-grid">${cards
    .map(
      (card) => `<div class="metric ${card.tone === "red" ? "red" : ""}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
      </div>`
    )
    .join("")}</div>`;
}

export function renderTable<T>(
  rows: T[],
  columns: TableColumn<T>[],
  compact = false
): string {
  const empty = rows.length
    ? ""
    : `<tr><td colspan="${columns.length}">Sem dados para exibir no periodo.</td></tr>`;

  return `<table class="table ${compact ? "compact-table" : ""}">
    <thead>
      <tr>${columns
        .map(
          (column) =>
            `<th class="${column.align === "right" ? "num" : ""}">${escapeHtml(
              column.label
            )}</th>`
        )
        .join("")}</tr>
    </thead>
    <tbody>
      ${empty ||
      rows
        .map(
          (row) => `<tr>${columns
            .map(
              (column) =>
                `<td class="${column.align === "right" ? "num" : ""}">${column.value(
                  row
                )}</td>`
            )
            .join("")}</tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

export function renderBars(items: BarItem[]): string {
  const max = Math.max(...items.map((item) => item.value), 0);
  return `<div class="bars">${items
    .map((item) => {
      const width = max > 0 ? Math.max(4, Math.round((item.value / max) * 100)) : 4;
      return `<div class="bar-row">
        <div class="bar-label">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.valueLabel)}</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${item.negative ? "negative" : ""}" style="width:${width}%"></div>
        </div>
        ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
      </div>`;
    })
    .join("")}</div>`;
}

export function renderInsightList(items: string[]): string {
  return `<div class="insight-list">${items
    .map(
      (item) => `<div class="insight">
        <span class="dot"></span>
        <span>${escapeHtml(item)}</span>
      </div>`
    )
    .join("")}</div>`;
}

export const BASE_REPORT_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f2f4f7;
  color: #16181d;
  font-family: Inter, Arial, Helvetica, sans-serif;
  letter-spacing: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  width: 210mm;
  height: 297mm;
  padding: 18mm 16mm;
  margin: 0 auto;
  background: #fff;
  break-after: page;
  page-break-after: always;
  position: relative;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; }
.topline {
  position: absolute;
  inset: 0 0 auto 0;
  height: 6mm;
  background: linear-gradient(90deg, #1A53F0 0%, #1A53F0 44%, #0B2A6B 44%, #0B2A6B 100%);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.brand img { width: 152px; height: 56px; object-fit: contain; }
.brand-fallback {
  width: 152px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 1px solid #e5e7eb;
  color: #1A53F0;
  font-size: 15px;
  font-weight: 850;
}
.brand-text strong { display: block; font-size: 13px; text-transform: uppercase; color: #1A53F0; }
.brand-text span { display: block; margin-top: 2px; font-size: 11px; color: #5f6673; }
.period { font-size: 11px; color: #5f6673; text-align: right; line-height: 1.35; }
.period strong { color: #101216; }
h1 { margin: 14px 0 8px; max-width: 680px; font-size: 36px; line-height: 1.02; font-weight: 850; color: #101216; }
h2 { margin: 0 0 10px; font-size: 20px; line-height: 1.16; color: #101216; }
h3 { margin: 0 0 7px; font-size: 13px; color: #101216; }
p { margin: 0; font-size: 12px; line-height: 1.45; color: #3b414c; }
.lead { max-width: 680px; font-size: 13.5px; color: #303641; }
.hero { margin-top: 4px; padding: 17px 0 15px; border-bottom: 1px solid #e6e8ed; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0 13px; }
.kpi { min-height: 92px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fbfcfe; }
.kpi.red { border-top: 4px solid #1A53F0; }
.kpi.black { border-top: 4px solid #0B2A6B; }
.kpi span { display: block; font-size: 10px; color: #667085; text-transform: uppercase; font-weight: 750; }
.kpi strong { display: block; margin-top: 9px; font-size: 22px; line-height: 1; color: #101216; white-space: nowrap; }
.kpi small { display: block; margin-top: 8px; font-size: 10px; line-height: 1.3; color: #6b7280; }
.section { margin-top: 16px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin-top: 11px; }
.panel { border: 1px solid #e5e7eb; border-radius: 8px; padding: 13px; background: #fff; }
.panel.dark { background: #0B2A6B; color: #fff; border: 0; }
.panel.dark h2, .panel.dark h3, .panel.dark p { color: #fff; }
.panel.dark p { opacity: 0.86; }
.table { width: 100%; border-collapse: collapse; margin-top: 9px; font-size: 10.3px; }
.table th { padding: 8px 7px; text-align: left; font-size: 9px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; background: #f8fafc; }
.table th.num, .table td.num { text-align: right; }
.table td { padding: 8px 7px; border-bottom: 1px solid #eef0f4; vertical-align: top; color: #252b36; font-variant-numeric: tabular-nums; }
.table td strong { display: block; font-size: 10.7px; color: #101216; }
.table td span { display: block; margin-top: 3px; font-size: 8.7px; color: #6b7280; line-height: 1.25; max-width: 250px; }
.compact-table { font-size: 8.6px; }
.compact-table th, .compact-table td { padding: 5.6px 4.8px; }
.bars { display: grid; gap: 9px; margin-top: 9px; }
.bar-row { display: grid; gap: 5px; }
.bar-label { display: flex; justify-content: space-between; gap: 10px; font-size: 10.5px; color: #454b56; }
.bar-label span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-label strong { white-space: nowrap; color: #101216; }
.bar-track { height: 8px; background: #eceff3; border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #1A53F0, #0B2A6B); }
.bar-fill.negative { background: #1A53F0; }
.bar-row small { color: #69707d; font-size: 9px; }
.metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 11px; }
.metric { padding: 9px; border-radius: 8px; background: #f7f8fa; border: 1px solid #e7eaf0; min-height: 61px; }
.metric span { display: block; font-size: 9px; color: #69707d; text-transform: uppercase; font-weight: 750; }
.metric strong { display: block; margin-top: 6px; font-size: 14px; color: #111827; white-space: nowrap; }
.metric.red strong { color: #1440C9; }
.note { margin-top: 9px; padding: 9px 11px; border-left: 3px solid #1A53F0; background: #eef3ff; color: #3b414c; font-size: 10.6px; line-height: 1.4; }
.insight-list { display: grid; gap: 8px; margin-top: 9px; }
.insight { display: grid; grid-template-columns: 18px 1fr; gap: 7px; font-size: 11px; line-height: 1.34; color: #3b414c; }
.dot { width: 8px; height: 8px; margin-top: 4px; border-radius: 50%; background: #1A53F0; }
.footer {
  position: absolute;
  left: 16mm;
  right: 16mm;
  bottom: 10mm;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: #8a92a0;
  font-size: 9px;
  border-top: 1px solid #edf0f5;
  padding-top: 7px;
}
.footer span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compact-page { padding-top: 16mm; }
.compact-page h2 { font-size: 18px; margin-bottom: 8px; }
.compact-page p { font-size: 11px; line-height: 1.36; }
.compact-page .section { margin-top: 11px; }
.compact-page .panel { padding: 10px; }
.compact-page .table { margin-top: 6px; }
.compact-page .compact-table { font-size: 7.7px; }
.compact-page .compact-table th, .compact-page .compact-table td { padding: 4.2px 4px; }
.compact-page .bars { gap: 6px; }
.compact-page .bar-row { gap: 3px; }
.compact-page .bar-label { font-size: 9.2px; }
.compact-page .bar-row small { font-size: 8px; }
.compact-page .insight-list { gap: 5px; margin-top: 6px; }
.compact-page .insight { font-size: 9.4px; line-height: 1.24; }
`;
