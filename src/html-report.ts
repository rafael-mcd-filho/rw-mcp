// Renderiza um PdfReportModel como dashboard HTML autocontido (sem CDN),
// responsivo, com a paleta Plugue. Alternativa de TELA ao PDF de entrega —
// reaproveita exatamente o mesmo modelo de dados, sem duplicar regra de negócio.

import type { PdfReportModel } from "./report.js";

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const moneyBR = (n: number): string =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intBR = (n: number): string => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pctBR = (n: number): string =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

function kpiCards(model: PdfReportModel): string {
  return model.resumo.kpis
    .map(
      (k) => `
      <div class="kpi ${k.tone === "red" ? "accent" : ""}">
        <span class="kpi-label">${esc(k.label)}</span>
        <strong class="kpi-value">${esc(k.value)}</strong>
        <small class="kpi-note">${esc(k.note)}</small>
      </div>`
    )
    .join("");
}

function objectivesTable(model: PdfReportModel): string {
  if (!model.objetivos.length) return "";
  const rows = model.objetivos
    .map(
      (o) => `
      <tr>
        <td><strong>${esc(o.label)}</strong></td>
        <td>${moneyBR(o.gasto)}</td>
        <td>${intBR(o.resultado)}</td>
        <td>${o.resultado > 0 ? moneyBR(o.custo) : "—"}</td>
        <td>${pctBR(o.ctr)}</td>
        <td>${moneyBR(o.cpc)}</td>
      </tr>`
    )
    .join("");
  return `
    <section class="card">
      <h2>Resumo por canal/objetivo</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Canal/objetivo</th><th>Invest.</th><th>Result.</th><th>Custo/result.</th><th>CTR</th><th>CPC</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
}

function campaignsTable(model: PdfReportModel): string {
  if (!model.campanhas.length) return "";
  const rows = model.campanhas
    .slice(0, 30)
    .map(
      (c) => `
      <tr>
        <td><strong>${esc(c.nome)}</strong><span class="muted">${esc(c.categoriaLabel)}</span></td>
        <td>${moneyBR(c.gasto)}</td>
        <td>${intBR(c.resultado)}</td>
        <td>${c.resultado > 0 ? moneyBR(c.custo) : "—"}</td>
        <td>${intBR(c.cliques)}</td>
        <td>${pctBR(c.ctr)}</td>
      </tr>`
    )
    .join("");
  return `
    <section class="card">
      <h2>Campanhas</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Campanha</th><th>Gasto</th><th>Result.</th><th>Custo/result.</th><th>Cliques</th><th>CTR</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
}

function dailyBars(model: PdfReportModel): string {
  if (!model.serieDiaria.length) return "";
  const max = Math.max(...model.serieDiaria.map((d) => d.gasto), 1);
  const bars = model.serieDiaria
    .map((d) => {
      const w = Math.max(2, Math.round((d.gasto / max) * 100));
      return `
      <div class="bar-row">
        <span class="bar-date">${esc(d.data)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div>
        <span class="bar-val">${moneyBR(d.gasto)} · ${intBR(d.resultados)} result.</span>
      </div>`;
    })
    .join("");
  return `<section class="card"><h2>Evolução diária</h2><div class="bars">${bars}</div></section>`;
}

function list(title: string, items: string[]): string {
  if (!items.length) return "";
  return `<section class="card"><h2>${esc(title)}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>`;
}

export function renderReportHtml(model: PdfReportModel): string {
  const canais = model.meta.channels.join(" · ");
  return `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório — ${esc(model.cliente)} — ${esc(model.periodo)}</title>
<style>
  :root{--bg:#f4f6fb;--card:#fff;--text:#0f172a;--muted:#64748b;--border:#e2e8f0;--accent:#1d4ed8;--accent2:#2563eb;--radius:12px}
  [data-theme="dark"]{--bg:#0b1220;--card:#121a2b;--text:#e2e8f0;--muted:#94a3b8;--border:#1e293b}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;padding:24px}
  .wrap{max-width:1100px;margin:0 auto}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid var(--accent);padding-bottom:16px;margin-bottom:20px}
  h1{font-size:1.5rem;font-weight:800}
  .meta{color:var(--muted);font-size:.85rem;margin-top:4px}
  .toggle{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:6px 12px;color:var(--text);cursor:pointer;font-size:.8rem}
  .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:20px}
  .kpi{background:var(--card);border:1px solid var(--border);border-top:4px solid var(--border);border-radius:var(--radius);padding:16px}
  .kpi.accent{border-top-color:var(--accent)}
  .kpi-label{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700}
  .kpi-value{display:block;font-size:1.6rem;margin-top:8px}
  .kpi-note{display:block;font-size:.75rem;color:var(--muted);margin-top:6px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:16px}
  .card h2{font-size:1.05rem;margin-bottom:12px}
  .table-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:.85rem;font-variant-numeric:tabular-nums}
  th{text-align:left;font-size:.7rem;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);padding:8px}
  td{padding:9px 8px;border-bottom:1px solid var(--border);vertical-align:top}
  td .muted{display:block;font-size:.7rem;color:var(--muted)}
  ul{padding-left:18px}li{margin:4px 0}
  .bars{display:grid;gap:8px}
  .bar-row{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center;font-size:.78rem}
  .bar-date{color:var(--muted)}
  .bar-track{height:9px;background:var(--border);border-radius:999px;overflow:hidden}
  .bar-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:999px}
  .bar-val{color:var(--muted);white-space:nowrap}
  footer{color:var(--muted);font-size:.75rem;border-top:1px solid var(--border);padding-top:12px;margin-top:8px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>${esc(model.cliente)}</h1>
      <div class="meta">${esc(model.periodo)} · ${esc(canais)} · gerado em ${esc(model.geradoEm)}</div>
    </div>
    <button class="toggle" onclick="document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'">☀ / ☾</button>
  </header>
  <div class="kpi-grid">${kpiCards(model)}</div>
  ${list("Leitura executiva", model.resumo.leituraExecutiva)}
  ${objectivesTable(model)}
  ${campaignsTable(model)}
  ${dailyBars(model)}
  ${list("Próximos passos", model.proximosPassos)}
  ${list("Notas metodológicas", model.notasMetodologicas)}
  <footer>${esc(model.meta.sourceLabel)} · Relatório gerado pelo rw-mcp (Plugue Marketing Solutions)</footer>
</div>
</body>
</html>`;
}
