// Renderiza o relatório em HTML paginado e gera PDF + PNG de prévia usando
// Chrome/Edge instalado no sistema (via puppeteer-core).

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import type { PdfReportModel } from "./report.js";
import { renderPdfHtml } from "./pdf-template.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Caminhos comuns do Chrome/Edge no Windows (Edge existe em todo Win11). */
const BROWSER_CANDIDATES = [
  process.env.META_BROWSER_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  join(homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findBrowser(): string {
  for (const path of BROWSER_CANDIDATES) {
    if (path && existsSync(path)) return path;
  }
  throw new Error(
    "Não encontrei o Chrome nem o Edge. Defina META_BROWSER_PATH com o caminho do executável."
  );
}

function templatePath(): string {
  return process.env.META_REPORT_TEMPLATE ?? "";
}

function outputDir(): string {
  const dir =
    process.env.META_REPORT_OUTPUT_DIR ??
    join(homedir(), "Documents", "Relatorios-Meta");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

export interface GeneratedPdf {
  pdfPath: string;
  previewPath: string;
  pageCount: number;
}

function renderHtml(data: PdfReportModel): string {
  const customTemplate = templatePath();
  if (!customTemplate) return renderPdfHtml(data);

  const template = readFileSync(customTemplate, "utf-8");
  return template.replace(
    "</head>",
    `<script>window.__DATA__ = ${JSON.stringify(data)};</script></head>`
  );
}

/** Gera o PDF e retorna os caminhos dos arquivos salvos. */
export async function generatePdf(
  data: PdfReportModel,
  clienteSlug: string
): Promise<GeneratedPdf> {
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `relatorio-${slugify(clienteSlug)}-${stamp}`;
  const pdfPath = join(
    outputDir(),
    `${baseName}.pdf`
  );
  const previewPath = join(
    outputDir(),
    `${baseName}-preview.png`
  );
  const html = renderHtml(data);

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1190,
      height: 1684,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    // Espera o template sinalizar que terminou.
    await page
      .waitForFunction("window.__READY__ === true", { timeout: 10000 })
      .catch(() => {
        /* Mantem compatibilidade com templates customizados antigos. */
      });

    const pageMetrics = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".page")].map((element, index) => ({
        page: index + 1,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflow: element.scrollHeight - element.clientHeight > 2,
      }))
    );
    const overflowPages = pageMetrics.filter((metric) => metric.overflow);
    if (overflowPages.length) {
      throw new Error(
        `Conteúdo excedeu a folha A4 nas páginas: ${overflowPages
          .map((metric) => metric.page)
          .join(", ")}`
      );
    }

    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    await page.screenshot({ path: previewPath, fullPage: true });

    return {
      pdfPath,
      previewPath,
      pageCount: pageMetrics.length || 1,
    };
  } finally {
    await browser.close();
  }
}
