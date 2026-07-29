import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./pdf-components.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface ReportHeaderOptions {
  category: string;
  description: string;
  client: string;
  period: string;
  detail?: string;
  logo?: string | null;
}

export interface ReportFooterOptions {
  sourceLabel: string;
  page: number;
  total: number;
  generatedAt?: string;
}

/**
 * Resolve a marca usada por todos os PDFs.
 *
 * REPORT_LOGO é o nome preferido. META_REPORT_LOGO continua aceito para não
 * quebrar as instalações que já personalizavam a marca por essa variável.
 */
export function reportLogoDataUri(): string | null {
  const candidates = [
    process.env.REPORT_LOGO,
    process.env.META_REPORT_LOGO,
    join(here, "..", "..", "assets", "logo-plugue.png"),
    join(here, "..", "assets", "logo-plugue.png"),
  ].filter(Boolean) as string[];

  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) return null;

  const encoded = readFileSync(path).toString("base64");
  return `data:image/png;base64,${encoded}`;
}

export function renderReportHeader(options: ReportHeaderOptions): string {
  const logo = options.logo === undefined ? reportLogoDataUri() : options.logo;
  const logoMarkup = logo
    ? `<img src="${logo}" alt="Plugue Marketing Solutions" />`
    : `<div class="brand-fallback">Plugue</div>`;
  const detail = options.detail
    ? `<span>${escapeHtml(options.detail)}</span>`
    : "";

  return `<header class="report-header">
    <div class="brand">${logoMarkup}</div>
    <div class="document-identity">
      <strong>${escapeHtml(options.category)}</strong>
      <span>${escapeHtml(options.description)}</span>
    </div>
    <div class="period">
      <strong>${escapeHtml(options.client)}</strong>
      <span>${escapeHtml(options.period)}</span>
      ${detail}
    </div>
  </header>`;
}

export function renderReportFooter(options: ReportFooterOptions): string {
  const generatedAt = options.generatedAt
    ? `<span class="footer-generated">${escapeHtml(options.generatedAt)}</span>`
    : "";

  return `<div class="footer">
    <span class="footer-source">${escapeHtml(options.sourceLabel)}</span>
    ${generatedAt}
    <span class="footer-page">${options.page} / ${options.total}</span>
  </div>`;
}
