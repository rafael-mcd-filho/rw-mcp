// Health Score V2: score por seis dimensões, cobertura e confiança.
// Checks sem dados ficam fora da nota e são mostrados como cobertura faltante.

import {
  SEVERITY_WEIGHT,
  STATUS_POINTS,
  type AuditDimension,
  type AuditGrade,
  type DimensionScore,
  type HealthCheck,
  type HealthScore,
} from "./types.js";

const DIMENSIONS: Array<{ id: AuditDimension; label: string; weight: number }> = [
  { id: "mensuracao", label: "Mensuração", weight: 1.25 },
  { id: "resultado", label: "Resultado", weight: 1.4 },
  { id: "eficiencia", label: "Eficiência", weight: 1 },
  { id: "entrega", label: "Entrega", weight: 1 },
  { id: "competitividade_qualidade", label: "Competitividade e qualidade", weight: 0.9 },
  { id: "saturacao_oportunidade", label: "Saturação e oportunidade", weight: 0.85 },
];

function gradeFor(score: number | null): AuditGrade {
  if (score == null) return "N/A";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function dimensionScore(
  dimension: AuditDimension,
  label: string,
  checks: HealthCheck[]
): DimensionScore {
  const all = checks.filter(c => c.dimension === dimension);
  const evaluated = all.filter(c => c.status !== "DADOS_INSUFICIENTES");
  if (!evaluated.length) {
    return {
      dimension,
      label,
      score: null,
      grade: "N/A",
      coverage: 0,
      confidence: 0,
      checks_avaliados: 0,
      checks_totais: all.length,
      summary: "Dados insuficientes para avaliar esta dimensão.",
    };
  }

  let earned = 0;
  let possible = 0;
  let confidenceWeight = 0;
  for (const item of evaluated) {
    const weight = SEVERITY_WEIGHT[item.severity] * (item.weight ?? 1);
    possible += weight;
    earned += weight * STATUS_POINTS[item.status as keyof typeof STATUS_POINTS];
    confidenceWeight += (item.confidence ?? 1) * weight;
  }
  const score = possible > 0 ? Math.round((earned / possible) * 100) : null;
  const coverage = all.length ? Math.round((evaluated.length / all.length) * 100) : 0;
  const confidence = possible > 0 ? Math.round((confidenceWeight / possible) * 100) : 0;
  const failed = evaluated.filter(c => c.status === "FAIL").length;
  const attention = evaluated.filter(c => c.status === "ATENCAO").length;
  const summary = failed
    ? `${failed} problema(s) relevante(s) e ${attention} ponto(s) de atenção.`
    : attention
    ? `${attention} ponto(s) de atenção; sem falha crítica nesta dimensão.`
    : "Sem problema relevante nos dados avaliados.";

  return {
    dimension,
    label,
    score,
    grade: gradeFor(score),
    coverage,
    confidence,
    checks_avaliados: evaluated.length,
    checks_totais: all.length,
    summary,
  };
}

export function computeHealthScore(checks: HealthCheck[]): HealthScore {
  const dimensions = DIMENSIONS.map(item => dimensionScore(item.id, item.label, checks));
  const available = dimensions
    .map(dimension => ({
      dimension,
      weight: DIMENSIONS.find(item => item.id === dimension.dimension)?.weight ?? 1,
    }))
    .filter(item => item.dimension.score != null);
  const denominator = available.reduce((sum, item) => sum + item.weight, 0);
  const score = denominator
    ? Math.round(available.reduce((sum, item) => sum + (item.dimension.score as number) * item.weight, 0) / denominator)
    : null;
  const coverage = dimensions.length
    ? Math.round(dimensions.reduce((sum, item) => sum + item.coverage, 0) / dimensions.length)
    : 0;
  const confidence = available.length
    ? Math.round(available.reduce((sum, item) => sum + item.dimension.confidence, 0) / available.length)
    : 0;

  return {
    score,
    grade: gradeFor(score),
    checks,
    insuficientes: checks.filter(c => c.status === "DADOS_INSUFICIENTES").map(c => c.id),
    coverage,
    confidence,
    dimensions,
  };
}

export const GRADE_MEANING: Record<AuditGrade, string> = {
  A: "Excelente - manter e escalar com controle",
  B: "Bom - otimizações pontuais",
  C: "Atenção - há oportunidades relevantes",
  D: "Ruim - exige plano de correção",
  F: "Crítico - reestruturar antes de escalar",
  "N/A": "Não avaliado - dados insuficientes",
};
