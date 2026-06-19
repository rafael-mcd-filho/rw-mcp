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

/** Caminhos comuns do Chromium/Chrome/Edge no Linux (VPS) e Windows (local). */
const BROWSER_CANDIDATES = [
  process.env.META_BROWSER_PATH,
  // Linux (VPS / aaPanel)
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  // Windows (máquina local)
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

/**
 * Endpoint de um Chrome hospedado (Browserless). Aceita a URL completa em
 * BROWSERLESS_WS_ENDPOINT ou monta a partir de BROWSERLESS_TOKEN.
 */
function browserlessEndpoint(): string | undefined {
  if (process.env.BROWSERLESS_WS_ENDPOINT) return process.env.BROWSERLESS_WS_ENDPOINT;
  const token = process.env.BROWSERLESS_TOKEN;
  if (token) return `wss://production-sfo.browserless.io/chromium?token=${token}`;
  return undefined;
}

/** Sobe o navegador certo conforme o ambiente. */
async function launchBrowser(): Promise<Browser> {
  // Serverless (Vercel): conecta num Chrome hospedado (Browserless), porque o
  // Chromium nativo do Vercel não tem as libs do sistema (libnss3).
  if (isServerless()) {
    const ws = browserlessEndpoint();
    if (!ws) {
      throw new Error(
        "Geração de PDF na nuvem precisa do Browserless. Defina BROWSERLESS_TOKEN " +
          "(ou BROWSERLESS_WS_ENDPOINT) nas variáveis do Vercel."
      );
    }
    return puppeteer.connect({ browserWSEndpoint: ws });
  }

  // Local: usa o Chrome/Edge instalado na máquina.
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

export interface PdfPageCheck {
  page: number;
  overflow: boolean;
  textLength: number;
  visibleElements: number;
  brokenImages: number;
}

export interface PdfQaResult {
  ok: boolean;
  pageCount: number;
  checks: PdfPageCheck[];
  problems: string[];
}

/** Páginas com pouco conteúdo aparente (heurística de "página vazia"). */
function blankPages(metrics: PdfPageCheck[]): number[] {
  return metrics
    .filter((m) => m.textLength < 40 || m.visibleElements < 8)
    .map((m) => m.page);
}

/**
 * Abre a página, mede cada folha A4 e entrega ao callback.
 *
 * `hardFailOverflow` (padrão true) lança erro quando o conteúdo estoura a
 * folha — esse é um defeito real de layout que corromperia o PDF. Páginas
 * aparentemente vazias e imagens quebradas viram apenas `console.warn` aqui;
 * a checagem dura desses casos fica nas tools `qa_*`, que recebem as métricas
 * e decidem `ok`/`problems` sem abortar a geração.
 */
async function withPage<T>(
  data: PdfReportModel,
  fn: (page: Page, pageCount: number, checks: PdfPageCheck[]) => Promise<T>,
  opts: { hardFailOverflow?: boolean } = {}
): Promise<T> {
  const hardFailOverflow = opts.hardFailOverflow ?? true;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1190, height: 1684, deviceScaleFactor: 1 });
    // 'domcontentloaded' em vez de 'networkidle0': o Browserless mantém a
    // conexão CDP aberta, então networkidle nunca zera e trava o setContent.
    await page.setContent(renderHtml(data), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    // Espera as fontes (Inter) carregarem, com teto de 4s para não travar.
    await page
      .evaluate(async () => {
        await Promise.race([
          (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      })
      .catch(() => {});
    await page
      .waitForFunction("window.__READY__ === true", { timeout: 10000 })
      .catch(() => {});

    const metrics = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".page")].map((el, i) => ({
        page: i + 1,
        overflow: el.scrollHeight - el.clientHeight > 2,
        textLength: (el.innerText ?? "").trim().length,
        visibleElements: [...el.querySelectorAll<HTMLElement>("*")].filter((child) => {
          const style = window.getComputedStyle(child);
          const rect = child.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        }).length,
        brokenImages: [...el.querySelectorAll<HTMLImageElement>("img")].filter(
          (img) => !img.complete || img.naturalWidth === 0
        ).length,
      }))
    );
    const overflow = metrics.filter((m) => m.overflow);
    if (overflow.length && hardFailOverflow) {
      throw new Error(
        `Conteúdo excedeu a folha A4 nas páginas: ${overflow
          .map((m) => m.page)
          .join(", ")}`
      );
    }

    const blank = blankPages(metrics);
    if (blank.length) {
      console.warn(
        `[pdf] páginas aparentemente vazias ou incompletas: ${blank.join(", ")}`
      );
    }

    const brokenImages = metrics.filter((m) => m.brokenImages > 0);
    if (brokenImages.length) {
      console.warn(
        `[pdf] imagens quebradas nas páginas: ${brokenImages
          .map((m) => m.page)
          .join(", ")}`
      );
    }

    return await fn(page, metrics.length || 1, metrics);
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

/**
 * Roda a mesma montagem do PDF e devolve um laudo de QA visual sem salvar
 * arquivo nem abortar. Diferente do caminho de render, aqui nada lança: o
 * resultado reporta `ok` + a lista de `problems` (overflow, páginas vazias,
 * imagens quebradas) para inspeção antes do primeiro envio.
 */
export async function qaReportPdf(data: PdfReportModel): Promise<PdfQaResult> {
  return withPage(
    data,
    async (_page, pageCount, checks) => {
      const problems: string[] = [];

      const overflow = checks.filter((c) => c.overflow).map((c) => c.page);
      if (overflow.length) {
        problems.push(`Conteúdo excedeu a folha A4 nas páginas: ${overflow.join(", ")}`);
      }

      const blank = blankPages(checks);
      if (blank.length) {
        problems.push(`Páginas aparentemente vazias ou incompletas: ${blank.join(", ")}`);
      }

      const broken = checks.filter((c) => c.brokenImages > 0).map((c) => c.page);
      if (broken.length) {
        problems.push(`Imagens quebradas nas páginas: ${broken.join(", ")}`);
      }

      return { ok: problems.length === 0, pageCount, checks, problems };
    },
    { hardFailOverflow: false }
  );
}

export interface GeneratedPdf {
  pdfPath: string;
  previewPath: string;
  pageCount: number;
}

/** Gera PDF a partir de HTML bruto em memória (serverless/Vercel). */
export async function renderHtmlPdf(html: string): Promise<{ pdf: Buffer; pageCount: number }> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1190, height: 1684, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page
      .evaluate(async () => {
        await Promise.race([
          (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      })
      .catch(() => {});
    await page
      .waitForFunction("window.__READY__ === true", { timeout: 10000 })
      .catch(() => {});
    const pageCount = await page.evaluate(
      () => document.querySelectorAll(".page").length || 1
    );
    const pdf = Buffer.from(await page.pdf(PDF_OPTS));
    return { pdf, pageCount };
  } finally {
    await browser.close();
  }
}

/** Salva HTML bruto em PDF + PNG de prévia em disco (uso local). */
export async function saveHtmlPdf(html: string, clienteSlug: string): Promise<GeneratedPdf> {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `relatorio-${slugify(clienteSlug)}-${stamp}`;
  const dir = outputDir();
  const pdfPath = join(dir, `${base}.pdf`);
  const previewPath = join(dir, `${base}-preview.png`);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1190, height: 1684, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page
      .evaluate(async () => {
        await Promise.race([
          (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      })
      .catch(() => {});
    const pageCount = await page.evaluate(
      () => document.querySelectorAll(".page").length || 1
    );
    await page.pdf({ ...PDF_OPTS, path: pdfPath });
    await page.screenshot({ path: previewPath, fullPage: true });
    return { pdfPath, previewPath, pageCount };
  } finally {
    await browser.close();
  }
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
