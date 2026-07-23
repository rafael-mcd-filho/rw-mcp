// Gera src/referencia-content.ts a partir da doc markdown, para o conteúdo entrar
// no bundle compilado (serverless não garante ler .md cru do disco em runtime).
// Roda ANTES do tsc (ver package.json build). A doc .md continua sendo a fonte única.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const srcDoc = join(root, "docs", "meta-ads-campanhas-referencia.md");
const outTs = join(root, "src", "referencia-content.ts");

const md = readFileSync(srcDoc, "utf-8");
// Escapa para caber num template literal: barra invertida, crase e ${.
const esc = md
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const ts =
  `// GERADO por scripts/gen-referencia.mjs — NÃO editar à mão.\n` +
  `// Fonte: docs/meta-ads-campanhas-referencia.md (edite lá e rode 'npm run build').\n` +
  `export const META_ADS_REFERENCIA = \`${esc}\`;\n`;

writeFileSync(outTs, ts, "utf-8");
console.log(`referencia-content.ts gerado (${md.length} chars da doc Meta Ads).`);
