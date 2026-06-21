// Benchmarks do mercado brasileiro (2026), convertidos das tabelas de
// `ratos/ads-ratos-main/references/benchmarks-br.md` para regras tipadas.
// Fonte canônica = aquele markdown; revisar esta tabela a cada ~3 meses.
//
// Modelo de faixa: 3 cortes ascendentes + direção.
//   lower_is_better  (custo): [excMax, bomMax, atenMax]
//     v<=cuts[0] EXCELENTE · <=cuts[1] BOM · <=cuts[2] ATENCAO · senão CRITICO
//   higher_is_better (qualidade): [critMax, atenMax, bomMax]
//     v<=cuts[0] CRITICO · <=cuts[1] ATENCAO · <=cuts[2] BOM · senão EXCELENTE

import type {
  BenchmarkNiche,
  BenchmarkResult,
  ClassifyContext,
  PerformanceLevel,
} from "./types.js";

type Direction = "higher_is_better" | "lower_is_better";

interface Band {
  direction: Direction;
  cuts: [number, number, number];
  reference: string;
}

const LABELS: Record<string, string> = {
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  cpl: "Custo por resultado",
  taxa_conversao: "Taxa de conversão",
  roas: "ROAS",
  frequencia: "Frequência",
  quality_score: "Quality Score",
  impression_share: "Parcela de impressões",
};

// ─── Faixas gerais por plataforma/objetivo ───────────────────────────────────

const BANDS: Record<string, Band> = {
  // Meta — CTR por objetivo
  "meta:ctr:trafego": { direction: "higher_is_better", cuts: [0.8, 1.2, 2.0], reference: "0,8–2,0%" },
  "meta:ctr:leads": { direction: "higher_is_better", cuts: [1.2, 2.0, 3.2], reference: "1,2–3,2%" },
  "meta:ctr:vendas": { direction: "higher_is_better", cuts: [0.8, 1.5, 2.5], reference: "0,8–2,5%" },
  "meta:ctr:default": { direction: "higher_is_better", cuts: [0.8, 1.2, 2.0], reference: "0,8–2,0%" },
  // Meta — CPC por objetivo
  "meta:cpc:trafego": { direction: "lower_is_better", cuts: [0.7, 1.8, 3.5], reference: "R$0,70–3,50" },
  "meta:cpc:leads": { direction: "lower_is_better", cuts: [2.0, 5.0, 10.0], reference: "R$2–10" },
  "meta:cpc:default": { direction: "lower_is_better", cuts: [1.0, 3.0, 6.0], reference: "R$1–6" },
  // Meta — CPM / CPL / taxa conv / ROAS / frequência
  "meta:cpm:default": { direction: "lower_is_better", cuts: [10, 25, 45], reference: "R$10–45" },
  "meta:cpl:default": { direction: "lower_is_better", cuts: [20, 60, 120], reference: "R$20–120" },
  "meta:taxa_conversao:default": { direction: "higher_is_better", cuts: [3, 5, 10], reference: "3–10%" },
  "meta:roas:default": { direction: "higher_is_better", cuts: [1.2, 2.0, 3.5], reference: "1,2–3,5" },
  "meta:frequencia:default": { direction: "lower_is_better", cuts: [2.5, 3.0, 5.0], reference: "até 2,5 (prospecção)" },

  // Google — Search
  "google:ctr:default": { direction: "higher_is_better", cuts: [3.0, 5.0, 8.0], reference: "3–8% (Search)" },
  "google:cpc:default": { direction: "lower_is_better", cuts: [2.0, 6.0, 12.0], reference: "R$2–12" },
  "google:cpl:default": { direction: "lower_is_better", cuts: [35, 90, 180], reference: "R$35–180" },
  "google:taxa_conversao:default": { direction: "higher_is_better", cuts: [3.0, 5.0, 8.0], reference: "3–8%" },
  "google:quality_score:default": { direction: "higher_is_better", cuts: [4, 5, 7], reference: "QS 4–8+" },
  "google:impression_share:default": { direction: "higher_is_better", cuts: [20, 40, 70], reference: "20–70%" },
};

// ─── Overrides por nicho (Meta) — derivados das faixas "bom" do md ───────────
// Cada entrada é a faixa BOA [lo, hi]; os 4 níveis são derivados ao redor dela.
// `franquias` não existe no md — estimativa operacional (captação de investidor,
// ticket alto, tolera CPL maior).

interface NicheGood {
  cpl?: [number, number];
  ctr?: [number, number];
  cpc?: [number, number];
}

const NICHE_GOOD: Partial<Record<BenchmarkNiche, NicheGood>> = {
  ecommerce_moda: { cpl: [10, 25], ctr: [1.5, 2.5], cpc: [0.7, 1.8] },
  ecommerce_tech: { cpl: [20, 50], ctr: [1.0, 2.0], cpc: [1.2, 3.0] },
  infoprodutos: { cpl: [8, 25], ctr: [1.8, 3.5], cpc: [0.6, 1.8] },
  saas_b2b: { cpl: [60, 180], ctr: [0.7, 1.5], cpc: [3.0, 9.0] },
  servicos_locais: { cpl: [20, 70], ctr: [1.2, 2.5], cpc: [1.0, 3.5] },
  imoveis: { cpl: [40, 120], ctr: [0.8, 1.8], cpc: [2.0, 6.0] },
  saude_estetica: { cpl: [20, 70], ctr: [1.2, 2.5], cpc: [1.0, 4.0] },
  educacao: { cpl: [10, 35], ctr: [1.5, 3.0], cpc: [0.8, 2.5] },
  financeiro: { cpl: [60, 180], ctr: [0.6, 1.3], cpc: [3.5, 12.0] },
  alimentacao_delivery: { cpl: [8, 25], ctr: [1.8, 3.0], cpc: [0.6, 1.8] },
  franquias: { cpl: [40, 120], ctr: [0.8, 1.8], cpc: [2.0, 6.0] },
};

/** Deriva uma Band a partir da faixa "boa" [lo, hi] de um nicho. */
function bandFromGood(metric: string, good: [number, number]): Band {
  const [lo, hi] = good;
  if (metric === "ctr") {
    // higher_is_better: crítico < lo*0.66, atenção até lo, bom até hi, exc acima
    return {
      direction: "higher_is_better",
      cuts: [round1(lo * 0.66), lo, hi],
      reference: `${fmt(lo)}–${fmt(hi)}%`,
    };
  }
  // custo (cpl/cpc): lower_is_better — exc < lo, bom até hi, atenção até 2x, crít acima
  return {
    direction: "lower_is_better",
    cuts: [lo, hi, round1(hi * 2)],
    reference: `R$${fmt(lo)}–${fmt(hi)}`,
  };
}

// ─── Sazonalidade BR ──────────────────────────────────────────────────────────

const SEASONALITY: Record<number, { fator: string; nota: string } | undefined> = {
  1: { fator: "-10% a -30%", nota: "início de ano, menor competição" },
  2: { fator: "-5% a -20%", nota: "Carnaval, demanda variável" },
  5: { fator: "+10% a +25%", nota: "Dia das Mães, pico de varejo" },
  6: { fator: "+10% a +20%", nota: "Dia dos Namorados, pico de consumo" },
  8: { fator: "+5% a +15%", nota: "Dia dos Pais" },
  9: { fator: "+5% a +15%", nota: "pré-Black Friday" },
  10: { fator: "+5% a +15%", nota: "pré-Black Friday" },
  11: { fator: "+30% a +50%", nota: "Black Friday, maior pico do ano" },
  12: { fator: "+20% a +35%", nota: "Natal, segundo maior pico" },
};

export function seasonalityNote(month?: number): string | undefined {
  if (!month) return undefined;
  const s = SEASONALITY[month];
  if (!s) return undefined;
  return `sazonalidade (${s.fator}): ${s.nota}`;
}

const COST_METRICS = new Set(["cpc", "cpm", "cpl", "frequencia"]);

// ─── Classificação ────────────────────────────────────────────────────────────

function resolveBand(metric: string, ctx: ClassifyContext): Band | undefined {
  // Override por nicho para CPL/CTR/CPC no Meta
  if (ctx.platform === "meta" && ctx.niche && ctx.niche !== "geral") {
    const good = NICHE_GOOD[ctx.niche];
    if (good) {
      if (metric === "cpl" && good.cpl) return bandFromGood("cpl", good.cpl);
      if (metric === "ctr" && good.ctr) return bandFromGood("ctr", good.ctr);
      if (metric === "cpc" && good.cpc) return bandFromGood("cpc", good.cpc);
    }
  }
  const obj = ctx.objective ?? "default";
  return (
    BANDS[`${ctx.platform}:${metric}:${obj}`] ??
    BANDS[`${ctx.platform}:${metric}:default`]
  );
}

function levelFor(value: number, band: Band): PerformanceLevel {
  const [a, b, c] = band.cuts;
  if (band.direction === "lower_is_better") {
    if (value <= a) return "EXCELENTE";
    if (value <= b) return "BOM";
    if (value <= c) return "ATENCAO";
    return "CRITICO";
  }
  if (value <= a) return "CRITICO";
  if (value <= b) return "ATENCAO";
  if (value <= c) return "BOM";
  return "EXCELENTE";
}

/**
 * Classifica uma métrica contra o benchmark do contexto.
 * `metric`: ctr | cpc | cpm | cpl | taxa_conversao | roas | frequencia |
 *           quality_score | impression_share.
 * Devolve undefined se não houver faixa aplicável (ex.: métrica sem régua).
 */
export function classifyMetric(
  metric: string,
  value: number,
  ctx: ClassifyContext
): BenchmarkResult | undefined {
  const band = resolveBand(metric, ctx);
  if (!band) return undefined;

  const level = levelFor(value, band);
  const label = LABELS[metric] ?? metric;
  const season = COST_METRICS.has(metric) ? seasonalityNote(ctx.month) : undefined;

  let rationale = `${label} ${formatValue(metric, value)} → ${level} (faixa ${band.reference}).`;
  if (season && (level === "ATENCAO" || level === "CRITICO")) {
    rationale += ` Atenção à ${season} antes de alarmar custo.`;
  }

  return { metric, value, level, label, reference: band.reference, rationale };
}

// ─── helpers de formatação ────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
function formatValue(metric: string, v: number): string {
  if (metric === "ctr" || metric === "taxa_conversao" || metric === "impression_share") {
    return `${fmt(v)}%`;
  }
  if (metric === "roas" || metric === "frequencia" || metric === "quality_score") {
    return fmt(v);
  }
  return `R$ ${fmt(v)}`;
}
