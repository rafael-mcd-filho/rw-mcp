// Renderiza o template HTML preenchido com os dados do relatório e gera um PDF
// usando o Chrome/Edge já instalado no sistema (via puppeteer-core).

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

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
  if (process.env.META_REPORT_TEMPLATE) return process.env.META_REPORT_TEMPLATE;
  // dist/src/pdf.js → ../../templates/relatorio.html
  return join(here, "..", "..", "templates", "relatorio.html");
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

/** Gera o PDF e retorna o caminho do arquivo salvo. */
export async function generatePdf(
  data: unknown,
  clienteSlug: string
): Promise<string> {
  const template = readFileSync(templatePath(), "utf-8");

  // Injeta os dados antes do </head> para o script do template consumir.
  const html = template.replace(
    "</head>",
    `<script>window.__DATA__ = ${JSON.stringify(data)};</script></head>`
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = join(
    outputDir(),
    `relatorio-${slugify(clienteSlug)}-${stamp}.pdf`
  );

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    // Espera o template sinalizar que terminou (gráfico renderizado).
    await page
      .waitForFunction("window.__READY__ === true", { timeout: 10000 })
      .catch(() => {
        /* segue mesmo sem o sinal, melhor um PDF parcial que erro */
      });

    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
  } finally {
    await browser.close();
  }

  return outPath;
}
