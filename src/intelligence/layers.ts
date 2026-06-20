// Análise por camada — classifica cada entidade (campanha, conjunto/grupo,
// anúncio) contra o benchmark do nicho e destaca apenas os outliers. Evita
// despejar todas as entidades: por camada, mostra os piores ofensores (com
// gasto relevante) + um destaque positivo para escalar.
//
// Reutiliza o mesmo motor de benchmark do nível de conta — `classifyMetric` é
// agnóstico de camada, então a mesma régua vale para qualquer entidade.

import { classifyMetric } from "./benchmarks.js";
import type { GateCampaign } from "./quality-gates.js";
import type { BenchmarkResult, ClassifyContext, PerformanceLevel } from "./types.js";

export type LayerKind = "campanha" | "conjunto" | "grupo" | "anuncio" | "keyword";

export interface EntityFinding {
  id: string;
  nome: string;
  parent?: string;
  gasto: number;
  conversoes: number;
  pior_nivel: PerformanceLevel;
  kpis: BenchmarkResult[];
  problemas: string[];
}

export interface LayerAnalysis {
  layer: LayerKind;
  label: string;
  total: number; // entidades no período
  avaliados: number; // entidades com gasto relevante que entraram na análise
  contagem_niveis: Record<string, number>; // pior nível → contagem
  outliers: EntityFinding[]; // piores ofensores (limitado)
  destaque?: EntityFinding; // melhor performer p/ escalar
}

const SEVERITY_ORDER: Record<PerformanceLevel, number> = {
  CRITICO: 0,
  ATENCAO: 1,
  BOM: 2,
  EXCELENTE: 3,
};

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function fmtVal(k: BenchmarkResult): string {
  if (k.metric === "ctr" || k.metric === "taxa_conversao" || k.metric === "impression_share") {
    return `${k.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }
  if (k.metric === "frequencia") return k.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (k.metric === "quality_score") return `${k.value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}/10`;
  return `R$ ${k.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Classifica os KPIs de uma entidade individual (mesma régua do nível de conta). */
function entityKpis(e: GateCampaign, ctx: ClassifyContext): BenchmarkResult[] {
  const out: BenchmarkResult[] = [];
  const push = (r?: BenchmarkResult) => { if (r) out.push(r); };
  const cpm = e.impressoes > 0 ? round2((e.gasto / e.impressoes) * 1000) : undefined;
  const taxa = e.cliques > 0 ? round2((e.conversoes / e.cliques) * 100) : undefined;

  push(classifyMetric("ctr", e.ctr, ctx));
  push(classifyMetric("cpc", e.cpc_medio, ctx));
  if (cpm != null) push(classifyMetric("cpm", cpm, ctx));
  if (e.conversoes > 0) push(classifyMetric("cpl", e.custo_por_conversao, ctx));
  if (e.conversoes > 0 && taxa != null) push(classifyMetric("taxa_conversao", taxa, ctx));
  if (ctx.platform === "meta" && e.frequencia != null) push(classifyMetric("frequencia", e.frequencia, ctx));
  return out;
}

function worstLevel(kpis: BenchmarkResult[]): PerformanceLevel {
  let worst: PerformanceLevel = "EXCELENTE";
  for (const k of kpis) {
    if (SEVERITY_ORDER[k.level] < SEVERITY_ORDER[worst]) worst = k.level;
  }
  return worst;
}

export function classifyEntity(e: GateCampaign, ctx: ClassifyContext): EntityFinding {
  const kpis = entityKpis(e, ctx);
  const pior = worstLevel(kpis);
  const problemas = kpis
    .filter((k) => k.level === "CRITICO" || k.level === "ATENCAO")
    .map((k) => `${k.label} ${k.level === "CRITICO" ? "crítico" : "em atenção"} (${fmtVal(k)})`);
  if (e.conversoes === 0 && e.gasto > 0) problemas.unshift("sem conversões no período");
  return {
    id: e.id,
    nome: e.nome,
    parent: e.parent,
    gasto: round2(e.gasto),
    conversoes: round2(e.conversoes),
    pior_nivel: pior,
    kpis,
    problemas,
  };
}

/**
 * Analisa uma camada inteira: classifica cada entidade relevante, conta por
 * nível e devolve os piores ofensores + um destaque positivo. Devolve null se
 * não houver entidades.
 */
export function analyzeLayer(
  entities: GateCampaign[] | undefined,
  layer: LayerKind,
  label: string,
  ctx: ClassifyContext,
  contaGasto: number
): LayerAnalysis | null {
  if (!entities || !entities.length) return null;

  // Corta ruído: só entidades com gasto material entram (>= 3% da conta ou R$20).
  const minGasto = Math.max(20, contaGasto * 0.03);
  const relevantes = entities.filter((e) => e.gasto >= minGasto);
  const base = relevantes.length ? relevantes : entities;
  const findings = base.map((e) => classifyEntity(e, ctx));

  const contagem: Record<string, number> = {};
  for (const f of findings) contagem[f.pior_nivel] = (contagem[f.pior_nivel] ?? 0) + 1;

  const outliers = findings
    .filter((f) => f.pior_nivel === "CRITICO" || f.pior_nivel === "ATENCAO" || f.problemas.length > 0)
    .sort((a, b) => {
      const sev = SEVERITY_ORDER[a.pior_nivel] - SEVERITY_ORDER[b.pior_nivel];
      return sev !== 0 ? sev : b.gasto - a.gasto;
    })
    .slice(0, 4);

  const destaque = findings
    .filter((f) => (f.pior_nivel === "BOM" || f.pior_nivel === "EXCELENTE") && f.conversoes > 0)
    .sort((a, b) => b.conversoes - a.conversoes)[0];

  return {
    layer,
    label,
    total: entities.length,
    avaliados: findings.length,
    contagem_niveis: contagem,
    outliers,
    destaque,
  };
}
