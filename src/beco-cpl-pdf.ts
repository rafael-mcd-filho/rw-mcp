// Relatório de CPL e estimativa de investimento — Beco Mágico (todas as unidades)
// Dados fixos: 01/06/2026 a 18/06/2026, excluindo 12/06/2026 (17 dias ativos)

import { BASE_REPORT_CSS } from "./pdf-components.js";
import { moneyBR } from "./format.js";

interface UnidadeRow {
  nome: string;
  gasto: number;
  leads: number;
  cpl: number;
  cplScalado: number; // +35%
  investimento120k: number; // cplScalado × 712
  roi: number;        // 120000 / investimento120k
}

const LEADS_PARA_120K = 712; // 120000 / 168.75 (3 pessoas × R$75 × 0.75 de presença)
const RECEITA_POR_LEAD = 168.75;

const UNIDADES: UnidadeRow[] = (() => {
  const raw = [
    { nome: "João Pessoa", gasto: 1579.42, leads: 283 },
    { nome: "Manaus",      gasto: 1034.33, leads: 159 },
    { nome: "Goiânia",     gasto: 1611.63, leads: 238 },
    { nome: "Natal",       gasto: 1370.20, leads: 140 },
    { nome: "Recife",      gasto: 1493.32, leads: 129 },
  ];
  return raw.map(u => {
    const cpl = u.gasto / u.leads;
    const cplScalado = cpl * 1.35;
    const investimento120k = Math.round(cplScalado * LEADS_PARA_120K);
    return { ...u, cpl, cplScalado, investimento120k, roi: Math.round(120000 / investimento120k * 10) / 10 };
  });
})();

const TOTAL_GASTO  = UNIDADES.reduce((s, u) => s + u.gasto, 0);
const TOTAL_LEADS  = UNIDADES.reduce((s, u) => s + u.leads, 0);
const CPL_MEDIO    = TOTAL_GASTO / TOTAL_LEADS;
const RECEITA_EST  = TOTAL_LEADS * RECEITA_POR_LEAD;
const INVEST_TOTAL = UNIDADES.reduce((s, u) => s + u.investimento120k, 0);

function pct(n: number) { return n.toFixed(0) + "%"; }
function x(n: number)   { return n.toFixed(1) + "×"; }
function cplBadge(cpl: number): string {
  if (cpl < 7)   return `<span class="badge badge-green">Ótimo</span>`;
  if (cpl < 10)  return `<span class="badge badge-amber">Médio</span>`;
  return               `<span class="badge badge-red">Alto CPL</span>`;
}

const CPL_MAX = Math.max(...UNIDADES.map(u => u.cpl));

function barWidth(cpl: number) {
  return Math.max(6, Math.round((cpl / CPL_MAX) * 100));
}

export function renderBecoCplHtml(): string {
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const cplRows = UNIDADES.map(u => `
    <tr>
      <td><strong>${u.nome}</strong></td>
      <td class="num">${moneyBR(u.gasto)}</td>
      <td class="num">${u.leads}</td>
      <td class="num"><strong>${moneyBR(u.cpl)}</strong></td>
      <td>
        <div class="bar-inline">
          <div class="bar-inline-fill" style="width:${barWidth(u.cpl)}%"></div>
        </div>
      </td>
      <td>${cplBadge(u.cpl)}</td>
    </tr>`).join("");

  const investRows = UNIDADES.map(u => `
    <tr>
      <td><strong>${u.nome}</strong></td>
      <td class="num">${moneyBR(u.cpl)}</td>
      <td class="num"><strong>${moneyBR(u.cplScalado)}</strong></td>
      <td class="num">${LEADS_PARA_120K}</td>
      <td class="num invest-value"><strong>${moneyBR(u.investimento120k)}</strong></td>
      <td class="num roi-value">${x(u.roi)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório CPL — Beco Mágico — Junho 2026</title>
<style>
${BASE_REPORT_CSS}
.badge { display: inline-block; padding: 2px 7px; border-radius: 99px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-amber { background: #fef9c3; color: #713f12; }
.badge-red   { background: #fee2e2; color: #991b1b; }
.bar-inline { width: 100%; height: 8px; background: #eceff3; border-radius: 999px; overflow: hidden; }
.bar-inline-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #1A53F0, #0B2A6B); }
.table td.invest-value strong { color: #1440C9; font-size: 11px; }
.table td.roi-value { color: #166534; font-weight: 700; }
.model-box { background: #f0f4ff; border-left: 4px solid #1A53F0; border-radius: 0 8px 8px 0; padding: 13px 15px; margin-bottom: 14px; }
.model-box h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #1440C9; letter-spacing: 0.05em; }
.model-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.model-step { background: #fff; border-radius: 6px; padding: 9px; text-align: center; border: 1px solid #dbe4ff; }
.model-step span { display: block; font-size: 8.5px; color: #6b7280; margin-bottom: 4px; }
.model-step strong { display: block; font-size: 13px; color: #1440C9; }
.model-step small { display: block; font-size: 8px; color: #9ca3af; margin-top: 2px; }
.scale-box { background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 11px 14px; margin-bottom: 14px; font-size: 10.5px; line-height: 1.5; color: #3b414c; }
.scale-box strong { color: #92400e; }
.rec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.rec-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 11px 13px; }
.rec-card.best  { border-left: 3px solid #16a34a; }
.rec-card.watch { border-left: 3px solid #dc2626; }
.rec-card h3 { margin: 0 0 5px; font-size: 9px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
.rec-card p { font-size: 10.5px; line-height: 1.4; color: #374151; }
.rec-card .rec-value { font-size: 14px; font-weight: 700; color: #101216; margin: 3px 0 4px; }
</style>
</head>
<body>

<!-- ───────────────── PÁGINA 1 ───────────────── -->
<div class="page">
  <div class="topline"></div>
  <header>
    <div class="brand">
      <div class="brand-fallback">Plugue</div>
      <div class="brand-text">
        <strong>Beco Mágico</strong>
        <span>Análise de CPL — Todas as Unidades</span>
      </div>
    </div>
    <div class="period">
      Gerado em <strong>${hoje}</strong><br>
      01/06 a 18/06/2026 · sem dia 12<br>
      <strong>17 dias ativos · Meta Ads</strong>
    </div>
  </header>

  <div class="hero">
    <h1>CPL por Unidade<br>Junho 2026</h1>
    <p class="lead">Custo médio por lead (reserva) de cada unidade no período analisado, excluindo o dia 12 de junho. Base para estimativa de investimento necessário para meta de faturamento de R$ 120.000 por unidade.</p>
  </div>

  <div class="kpi-grid" style="margin-top:16px">
    <div class="kpi red">
      <span>Investimento Total</span>
      <strong>${moneyBR(TOTAL_GASTO)}</strong>
      <small>5 unidades · 17 dias</small>
    </div>
    <div class="kpi black">
      <span>Total de Leads</span>
      <strong>${TOTAL_LEADS}</strong>
      <small>reservas geradas</small>
    </div>
    <div class="kpi red">
      <span>CPL Médio Geral</span>
      <strong>${moneyBR(CPL_MEDIO)}</strong>
      <small>ponderado por gasto</small>
    </div>
    <div class="kpi black">
      <span>Receita Estimada</span>
      <strong>${moneyBR(RECEITA_EST)}</strong>
      <small>@ R$168,75 / lead</small>
    </div>
  </div>

  <div class="section">
    <h2>Custo por lead por unidade</h2>
    <table class="table">
      <thead>
        <tr>
          <th>Unidade</th>
          <th class="num">Gasto</th>
          <th class="num">Leads</th>
          <th class="num">CPL</th>
          <th>Comparativo</th>
          <th>Eficiência</th>
        </tr>
      </thead>
      <tbody>
        ${cplRows}
        <tr style="background:#f8fafc; font-weight:700">
          <td><strong>Total geral</strong></td>
          <td class="num"><strong>${moneyBR(TOTAL_GASTO)}</strong></td>
          <td class="num"><strong>${TOTAL_LEADS}</strong></td>
          <td class="num"><strong>${moneyBR(CPL_MEDIO)}</strong></td>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="note" style="margin-top:16px">
    <strong>Como interpretar o CPL:</strong> cada lead corresponde a uma reserva. Quanto menor o CPL, mais barato é cada reserva gerada pelo tráfego pago. A variação entre unidades reflete diferenças de público, criativos, histórico de pixel e maturidade das campanhas.
  </div>

  <footer>
    <span>Beco Mágico · Análise de CPL · Junho 2026 · Meta Ads · Plugue Marketing Solutions</span>
    <span>1 / 2</span>
  </footer>
</div>

<!-- ───────────────── PÁGINA 2 ───────────────── -->
<div class="page compact-page">
  <div class="topline"></div>
  <header>
    <div class="brand">
      <div class="brand-fallback">Plugue</div>
      <div class="brand-text">
        <strong>Beco Mágico</strong>
        <span>Estimativa de Investimento — Meta R$ 120.000</span>
      </div>
    </div>
    <div class="period">
      01/06 a 18/06/2026 · sem dia 12<br>
      <strong>17 dias ativos · Meta Ads</strong>
    </div>
  </header>

  <div class="model-box">
    <h3>Modelo de Receita</h3>
    <div class="model-steps">
      <div class="model-step">
        <span>1 lead =</span>
        <strong>1 reserva</strong>
        <small>via formulário</small>
      </div>
      <div class="model-step">
        <span>1 reserva =</span>
        <strong>3 pessoas</strong>
        <small>ticket R$ 75 / pessoa</small>
      </div>
      <div class="model-step">
        <span>No-show de</span>
        <strong>25%</strong>
        <small>das reservas</small>
      </div>
      <div class="model-step">
        <span>Receita líquida =</span>
        <strong>R$ 168,75</strong>
        <small>por lead efetivo</small>
      </div>
    </div>
  </div>

  <div class="scale-box">
    <strong>Ajuste de escala (+35% no CPL):</strong> ao aumentar o investimento ~4× para atingir a meta, o CPL tende a subir em função do esgotamento de público, aumento de frequência e competição no leilão. Utilizamos +35% como fator conservador. A tabela abaixo usa o <strong>CPL escalado</strong> para a estimativa.
  </div>

  <h2>Estimativa de investimento para faturar R$ 120.000 / unidade</h2>
  <table class="table">
    <thead>
      <tr>
        <th>Unidade</th>
        <th class="num">CPL atual</th>
        <th class="num">CPL escalado (+35%)</th>
        <th class="num">Leads necessários</th>
        <th class="num">Investimento estimado</th>
        <th class="num">ROI implícito</th>
      </tr>
    </thead>
    <tbody>
      ${investRows}
      <tr style="background:#f8fafc; font-weight:700">
        <td><strong>Total (5 unidades)</strong></td>
        <td class="num">${moneyBR(CPL_MEDIO)}</td>
        <td class="num"><strong>${moneyBR(CPL_MEDIO * 1.35)}</strong></td>
        <td class="num">${LEADS_PARA_120K * 5}</td>
        <td class="num invest-value"><strong>${moneyBR(INVEST_TOTAL)}</strong></td>
        <td class="num roi-value">${x(120000 / (INVEST_TOTAL / 5))}</td>
      </tr>
    </tbody>
  </table>

  <div class="rec-grid">
    <div class="rec-card best">
      <h3>Melhor custo-benefício</h3>
      <div class="rec-value">João Pessoa — R$ 5,58 CPL atual</div>
      <p>Estimativa de R$ 5.361 para gerar R$ 120k. Prioridade máxima para escalar. Testar novos públicos lookalike e aumentar orçamento em 20–30% por semana.</p>
    </div>
    <div class="rec-card best">
      <h3>Alta eficiência</h3>
      <div class="rec-value">Manaus e Goiânia — R$ 6,51 / R$ 6,77</div>
      <p>ROI entre 18–19×. Escalar com cautela monitorando frequência. Criativo novo a cada 2 semanas evita fadiga e mantém o CPL estável.</p>
    </div>
    <div class="rec-card watch">
      <h3>Atenção — CPL elevado</h3>
      <div class="rec-value">Natal — R$ 9,79 · Recife — R$ 11,58</div>
      <p>Antes de escalar, auditar criativos, segmentações e exclusão de públicos. Recife em especial deve ser otimizado antes de qualquer aumento de verba.</p>
    </div>
    <div class="rec-card">
      <h3>Observação metodológica</h3>
      <div class="rec-value" style="font-size:12px; color:#6b7280">CPL de escala é estimativa</div>
      <p>O fator +35% é conservador. Recomenda-se escalar gradualmente (+20–30%/semana) e recalibrar o CPL observado a cada ciclo antes de ajustar a projeção.</p>
    </div>
  </div>

  <footer>
    <span>Beco Mágico · Estimativa de Investimento · Junho 2026 · Meta Ads · Plugue Marketing Solutions</span>
    <span>2 / 2</span>
  </footer>
</div>

</body>
</html>`;
}
