// Gera HTML paginado (A4) para PDF de Diagnóstico e Auditoria.
// Reutiliza o CSS base dos relatórios (mesma identidade visual Plugue)
// sem depender do PdfReportModel — dados vêm diretamente de DiagnosisResult
// e AuditResult.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_REPORT_CSS, escapeHtml } from "../pdf-components.js";
import type { DiagnosisResult, ChannelDiagnosis } from "./diagnosis.js";
import type { AuditResult, ChannelAudit, CampaignVerdict } from "./audit.js";
import type { Alert, BenchmarkResult } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

function logoDataUri(): string | null {
  const candidates = [
    process.env.META_REPORT_LOGO,
    join(here, "..", "..", "..", "assets", "logo-plugue.png"),
    join(here, "..", "..", "assets", "logo-plugue.png"),
    join(here, "..", "assets", "logo-plugue.png"),
  ].filter(Boolean) as string[];
  const path = candidates.find(existsSync);
  if (!path) return null;
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

const moneyBR = (n: number) =>
  "R$ " + (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatBenchmarkValue(metric: string, value: number): string {
  switch (metric) {
    case "ctr":
    case "taxa_conversao":
    case "impression_share":
      return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
    case "cpc":
    case "cpm":
    case "cpl":
      return moneyBR(value);
    case "roas":
      return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "x";
    case "frequencia":
      return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "x";
    case "quality_score":
      return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "/10";
    default:
      return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
}

const GRADE_COLOR: Record<string, string> = {
  A: "#16a34a", B: "#2563eb", C: "#d97706", D: "#ea580c", F: "#dc2626",
};

const LEVEL_COLOR: Record<string, string> = {
  EXCELENTE: "#16a34a", BOM: "#22c55e", ATENCAO: "#d97706", CRITICO: "#dc2626",
};
const LEVEL_EMOJI: Record<string, string> = {
  EXCELENTE: "✅", BOM: "🟢", ATENCAO: "⚠️", CRITICO: "🔴",
};

const SEV_COLOR: Record<string, string> = {
  CRITICO: "#dc2626", ALTO: "#ea580c", MEDIO: "#d97706", BAIXO: "#9ca3af",
};

const VERDICT_COLOR: Record<string, string> = {
  MANTER: "#16a34a", OTIMIZAR: "#d97706", PAUSAR: "#dc2626", SEM_ENTREGA: "#9ca3af",
};

const INTEL_CSS = `
.health-card {
  display: flex; align-items: center; gap: 20px;
  padding: 14px 18px; background: #f8fafc;
  border-radius: 10px; border: 1px solid #e5e7eb; margin: 10px 0 14px;
}
.score-num { font-size: 54px; font-weight: 900; line-height: 1; }
.score-sub { font-size: 15px; font-weight: 600; color: #6b7280; }
.grade-badge {
  display: inline-block; color: #fff; font-weight: 700;
  font-size: 12px; padding: 3px 11px; border-radius: 20px;
}
.grade-meaning { margin-top: 5px; font-size: 12px; color: #374151; }
.health-meta { margin-top: 7px; font-size: 10.5px; color: #6b7280; }
.channel-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  color: #1A53F0; letter-spacing: .04em; margin-bottom: 4px;
}
.kpi-grid-intel {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 7px; margin: 8px 0;
}
.kpi-intel {
  border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 9px 10px; background: #fbfcfe;
}
.kpi-intel .ki-label {
  display: block; font-size: 8.5px; text-transform: uppercase;
  font-weight: 750; color: #6b7280;
}
.kpi-intel .ki-value {
  display: block; font-size: 16px; font-weight: 800;
  margin: 5px 0 3px; color: #101216; white-space: nowrap;
}
.kpi-intel .ki-badge {
  display: block; font-size: 9.5px; font-weight: 700;
}
.kpi-intel .ki-ref {
  display: block; font-size: 8.5px; color: #9ca3af; margin-top: 3px;
}
.alerts-list { display: flex; flex-direction: column; gap: 6px; margin-top: 7px; }
.alert-row {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 8px 10px; border-radius: 7px;
  background: #fafafa; border: 1px solid #e5e7eb;
}
.alert-sev {
  flex-shrink: 0; color: #fff; font-size: 7.5px;
  font-weight: 800; text-transform: uppercase;
  padding: 3px 6px; border-radius: 3px; margin-top: 1px;
}
.alert-body { flex: 1; min-width: 0; }
.alert-body strong { display: block; font-size: 10px; color: #111827; }
.alert-body .al-ev { display: block; font-size: 9px; color: #6b7280; margin-top: 2px; }
.alert-body .al-rec { display: block; font-size: 9px; color: #2563eb; margin-top: 1px; font-style: italic; }
.alert-waste { flex-shrink: 0; font-size: 9.5px; font-weight: 800; color: #dc2626; white-space: nowrap; }
.waste-box {
  padding: 11px 15px; background: #fff5f5; border: 1px solid #fecaca;
  border-radius: 8px; margin: 12px 0; display: flex; align-items: center; gap: 14px;
}
.waste-box strong { font-size: 22px; color: #dc2626; }
.waste-box span { font-size: 11px; color: #6b7280; }
.verdict-table th, .verdict-table td { padding: 6px 8px; }
.verd { font-size: 9px; font-weight: 800; }
.action-sec { margin: 11px 0 8px; }
.action-sec h4 {
  font-size: 10px; font-weight: 800; text-transform: uppercase;
  margin: 0 0 4px; padding-bottom: 3px; border-bottom: 1.5px solid #e5e7eb;
}
.action-list { list-style: none; padding: 0; margin: 0; }
.action-list li {
  font-size: 9.5px; padding: 3.5px 0;
  border-bottom: 1px solid #f3f4f6; color: #374151; line-height: 1.3;
}
.insuf-note {
  margin-top: 10px; font-size: 9.5px; color: #6b7280;
  padding: 7px 10px; background: #f9fafb; border-left: 3px solid #d1d5db; border-radius: 0 4px 4px 0;
}
.separator { border: 0; border-top: 1px solid #e5e7eb; margin: 13px 0; }
`;

function renderHeader(
  logo: string | null,
  tipo: string,
  cliente: string,
  periodo: string,
  nicho: string
): string {
  const logoMarkup = logo
    ? `<img src="${logo}" alt="Logo" />`
    : `<div class="brand-fallback">Plugue</div>`;
  return `<header>
    <div class="brand">
      ${logoMarkup}
      <div class="brand-text">
        <strong>Check-in</strong>
        <span>${escapeHtml(tipo)}</span>
      </div>
    </div>
    <div class="period">
      <strong>${escapeHtml(cliente)}</strong><br />
      ${escapeHtml(periodo)}<br />
      Nicho: ${escapeHtml(nicho)}
    </div>
  </header>`;
}

function renderFooter(page: number, total: number): string {
  const now = new Date().toLocaleDateString("pt-BR");
  return `<div class="footer">
    <span>Gerado por Plugue · ${now}</span>
    <span>${page} / ${total}</span>
  </div>`;
}

function renderHealthBlock(
  score: number,
  grade: string,
  gradeSignificado: string,
  gasto: number,
  conversoes: number,
  canal: string
): string {
  const color = GRADE_COLOR[grade] ?? "#6b7280";
  return `<div>
    <div class="channel-label">${escapeHtml(canal)}</div>
    <div class="health-card">
      <div>
        <span class="score-num" style="color:${color}">${score}</span>
        <span class="score-sub">/100</span>
      </div>
      <div>
        <div class="grade-badge" style="background:${color}">Nota ${escapeHtml(grade)}</div>
        <div class="grade-meaning">${escapeHtml(gradeSignificado)}</div>
        <div class="health-meta">${moneyBR(gasto)} investidos · ${(conversoes || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} conversões</div>
      </div>
    </div>
  </div>`;
}

function renderKpis(kpis: BenchmarkResult[]): string {
  if (!kpis.length) return "";
  return `<div>
    <h3>KPIs vs Benchmark do Nicho</h3>
    <div class="kpi-grid-intel">
      ${kpis.map((k) => {
        const val = formatBenchmarkValue(k.metric, k.value);
        const color = LEVEL_COLOR[k.level] ?? "#6b7280";
        const emoji = LEVEL_EMOJI[k.level] ?? "";
        return `<div class="kpi-intel">
          <span class="ki-label">${escapeHtml(k.label)}</span>
          <span class="ki-value">${escapeHtml(val)}</span>
          <span class="ki-badge" style="color:${color}">${emoji} ${escapeHtml(k.level)}</span>
          <span class="ki-ref">Ref: ${escapeHtml(k.reference)}</span>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function renderAlerts(alerts: Alert[], max = 8): string {
  const visible = alerts.filter((a) => a.status !== "PASS").slice(0, max);
  if (!visible.length) {
    return `<p style="color:#16a34a;font-size:11px">✅ Nenhum alerta crítico no período.</p>`;
  }
  return `<div>
    <h3>Alertas Prioritários</h3>
    <div class="alerts-list">
      ${visible.map((a) => {
        const sc = SEV_COLOR[a.severity] ?? "#9ca3af";
        const waste = a.impactEstimate
          ? `<div class="alert-waste">${moneyBR(a.impactEstimate)}</div>`
          : "";
        return `<div class="alert-row">
          <div class="alert-sev" style="background:${sc}">${escapeHtml(a.severity)}</div>
          <div class="alert-body">
            <strong>${escapeHtml(a.title)}</strong>
            <span class="al-ev">${escapeHtml(a.evidence)}</span>
            <span class="al-rec">→ ${escapeHtml(a.recommendation)}</span>
          </div>
          ${waste}
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function renderWasteBox(desperdicio: number): string {
  if (!desperdicio) return "";
  return `<div class="waste-box">
    <strong>${moneyBR(desperdicio)}</strong>
    <span>Desperdício estimado no período</span>
  </div>`;
}

function renderInsufNote(insuf: string[]): string {
  if (!insuf.length) return "";
  return `<div class="insuf-note">
    ℹ️ Checks sem dados suficientes (não entram na nota): ${escapeHtml(insuf.join(", "))}.
  </div>`;
}

// ─── Diagnóstico ──────────────────────────────────────────────────────────────

export function renderDiagnosisHtml(result: DiagnosisResult): string {
  const logo = logoDataUri();
  const CANAL_LABEL: Record<string, string> = {
    meta: "Meta Ads", google: "Google Ads", integrated: "Integrado",
  };

  const canal = result.canais[0] as ChannelDiagnosis | undefined;
  const totalInsuf = [...new Set(result.canais.flatMap((c) => c.checks_insuficientes))];
  const page1Body = `
    ${renderHealthBlock(
      canal?.score ?? 0,
      canal?.grade ?? "F",
      canal?.grade_significado ?? "",
      canal?.gasto ?? 0,
      canal?.conversoes ?? 0,
      CANAL_LABEL[canal?.channel ?? ""] ?? "Google Ads"
    )}
    ${renderKpis(canal?.kpis ?? [])}
    <hr class="separator" />
    ${renderAlerts(result.alertas, 8)}
    ${renderWasteBox(result.desperdicio_estimado)}
    ${renderInsufNote(totalInsuf)}
  `;

  return wrapDocument(
    logo,
    "Diagnóstico",
    result.cliente,
    result.periodo,
    result.nicho,
    [page1Body]
  );
}

// ─── Auditoria ────────────────────────────────────────────────────────────────

export function renderAuditHtml(result: AuditResult): string {
  const logo = logoDataUri();
  const CANAL_LABEL: Record<string, string> = {
    meta: "Meta Ads", google: "Google Ads", integrated: "Integrado",
  };

  const canal = result.canais[0] as ChannelAudit | undefined;
  const totalInsuf = [...new Set(result.canais.flatMap((c) => c.checks_insuficientes))];

  const page1Body = `
    ${renderHealthBlock(
      canal?.score ?? 0,
      canal?.grade ?? "F",
      canal?.grade_significado ?? "",
      0,
      0,
      CANAL_LABEL[canal?.channel ?? ""] ?? "Google Ads"
    )}
    ${renderKpis(canal?.kpis ?? [])}
    <hr class="separator" />
    ${renderAlerts(canal?.alertas ?? [], 6)}
    ${renderWasteBox(result.desperdicio_estimado)}
  `;

  const page2Body = `
    ${renderCampaignVerdicts(canal?.campanhas ?? [])}
    <hr class="separator" />
    ${renderWasteByCategory(result.desperdicio_por_categoria)}
    <hr class="separator" />
    ${renderActionPlan(result.plano_de_acao)}
    ${renderInsufNote(totalInsuf)}
  `;

  return wrapDocument(
    logo,
    "Auditoria",
    result.cliente,
    result.periodo,
    result.nicho,
    [page1Body, page2Body]
  );
}

function renderCampaignVerdicts(campanhas: CampaignVerdict[]): string {
  if (!campanhas.length) return "";
  const rows = campanhas.slice(0, 15).map((c) => {
    const color = VERDICT_COLOR[c.veredito] ?? "#6b7280";
    const cpa = c.custo_por_conversao > 0 ? moneyBR(c.custo_por_conversao) : "—";
    return `<tr>
      <td><strong>${escapeHtml(c.nome)}</strong><span>${escapeHtml(c.motivo)}</span></td>
      <td class="num">${moneyBR(c.gasto)}</td>
      <td class="num">${c.conversoes.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
      <td class="num">${cpa}</td>
      <td class="num"><span class="verd" style="color:${color}">${escapeHtml(c.veredito)}</span></td>
    </tr>`;
  });

  return `<div>
    <h3>Veredito por Campanha</h3>
    <table class="table compact-table verdict-table">
      <thead>
        <tr>
          <th>Campanha</th>
          <th class="num">Gasto</th>
          <th class="num">Conv.</th>
          <th class="num">CPA</th>
          <th class="num">Veredito</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  </div>`;
}

function renderWasteByCategory(cats: Record<string, number>): string {
  const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "";
  const max = entries[0]![1];
  const bars = entries.map(([cat, val]) => {
    const w = max > 0 ? Math.max(6, Math.round((val / max) * 100)) : 6;
    return `<div class="bar-row">
      <div class="bar-label">
        <span>${escapeHtml(cat)}</span>
        <strong>${moneyBR(val)}</strong>
      </div>
      <div class="bar-track">
        <div class="bar-fill negative" style="width:${w}%"></div>
      </div>
    </div>`;
  }).join("");
  return `<div>
    <h3>Desperdício por Categoria</h3>
    <div class="bars">${bars}</div>
  </div>`;
}

function renderActionPlan(plan: { urgente: string[]; esta_semana: string[]; este_mes: string[] }): string {
  const sections: Array<{ title: string; color: string; items: string[] }> = [
    { title: "🔴 Urgente — Fazer hoje", color: "#dc2626", items: plan.urgente },
    { title: "🟠 Esta semana", color: "#ea580c", items: plan.esta_semana },
    { title: "🟡 Este mês", color: "#d97706", items: plan.este_mes },
  ];
  const rendered = sections
    .filter((s) => s.items.length)
    .map((s) => `<div class="action-sec">
      <h4 style="color:${s.color}">${escapeHtml(s.title)}</h4>
      <ul class="action-list">
        ${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}
      </ul>
    </div>`)
    .join("");
  if (!rendered) return "";
  return `<div><h3>Plano de Ação</h3>${rendered}</div>`;
}

// ─── Wrapper HTML completo ────────────────────────────────────────────────────

function wrapDocument(
  logo: string | null,
  tipo: string,
  cliente: string,
  periodo: string,
  nicho: string,
  pages: string[]
): string {
  const total = pages.length;
  const pagesHtml = pages
    .map(
      (body, i) => `<section class="page compact-page" data-page="${i + 1}">
        <div class="topline"></div>
        ${renderHeader(logo, tipo, cliente, periodo, nicho)}
        ${body}
        ${renderFooter(i + 1, total)}
      </section>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(tipo)} — ${escapeHtml(cliente)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
${BASE_REPORT_CSS}
${INTEL_CSS}
</style>
</head>
<body>
${pagesHtml}
<script>window.__READY__ = true;</script>
</body>
</html>`;
}
