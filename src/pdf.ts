// Renderiza o relatório em HTML paginado e gera o PDF.
// Funciona em dois ambientes:
//   - Local: usa o Chrome/Edge instalado e salva PDF + PNG no disco.
//   - Serverless (Vercel): usa @sparticuz/chromium e retorna o PDF em Buffer.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import type { PdfReportModel } from "./report.js";
import { renderPdfHtml } from "./pdf-template.js";

const isServerless = (): boolean =>
  Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

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

// Pack remoto do Chromium (binário + libs como libnss3) baixado em runtime.
// Evita os problemas de bundling/libs do Vercel. Pode ser sobrescrito por env.
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

/** Sobe o navegador certo conforme o ambiente. */
async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: chromium.headless,
      defaultViewport: { width: 1190, height: 1684, deviceScaleFactor: 1 },
    });
  }
  return puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
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

function renderHtml(data: PdfReportModel): string {
  const custom = process.env.META_REPORT_TEMPLATE;
  if (custom) {
    const template = readFileSync(custom, "utf-8");
    return template.replace(
      "</head>",
      `<script>window.__DATA__ = ${JSON.stringify(data)};</script></head>`
    );
  }
  return renderPdfHtml(data);
}

/** Abre a página, valida estouro de A4 e entrega ao callback. */
async function withPage<T>(
  data: PdfReportModel,
  fn: (page: Page, pageCount: number) => Promise<T>
): Promise<T> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1190, height: 1684, deviceScaleFactor: 1 });
    await page.setContent(renderHtml(data), {
      waitUntil: "networkidle0",
      timeout: 45000,
    });
    // Garante que as fontes (Inter) carregaram antes de renderizar o PDF.
    await page.evaluate(async () => {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts
        .ready;
    }).catch(() => {});
    await page
      .waitForFunction("window.__READY__ === true", { timeout: 10000 })
      .catch(() => {});

    const metrics = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".page")].map((el, i) => ({
        page: i + 1,
        overflow: el.scrollHeight - el.clientHeight > 2,
      }))
    );
    const overflow = metrics.filter((m) => m.overflow);
    if (overflow.length) {
      throw new Error(
        `Conteúdo excedeu a folha A4 nas páginas: ${overflow
          .map((m) => m.page)
          .join(", ")}`
      );
    }

    return await fn(page, metrics.length || 1);
  } finally {
    await browser.close();
  }
}

const PDF_OPTS = {
  format: "A4" as const,
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
};

/** Gera o PDF em memória (Buffer) — usado no serverless / envio por WhatsApp. */
export async function renderReportPdf(
  data: PdfReportModel
): Promise<{ pdf: Buffer; pageCount: number }> {
  return withPage(data, async (page, pageCount) => {
    const pdf = Buffer.from(await page.pdf(PDF_OPTS));
    return { pdf, pageCount };
  });
}

export interface GeneratedPdf {
  pdfPath: string;
  previewPath: string;
  pageCount: number;
}

/** Gera o PDF + PNG de prévia salvos em disco — usado localmente. */
export async function generatePdf(
  data: PdfReportModel,
  clienteSlug: string
): Promise<GeneratedPdf> {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `relatorio-${slugify(clienteSlug)}-${stamp}`;
  const dir = outputDir();
  const pdfPath = join(dir, `${base}.pdf`);
  const previewPath = join(dir, `${base}-preview.png`);

  return withPage(data, async (page, pageCount) => {
    await page.pdf({ ...PDF_OPTS, path: pdfPath });
    await page.screenshot({ path: previewPath, fullPage: true });
    return { pdfPath, previewPath, pageCount };
  });
}
