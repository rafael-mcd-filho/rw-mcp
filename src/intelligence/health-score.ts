// Health Score 0–100 (nota A–F) a partir dos checks dos quality gates.
// Honestidade mecânica: checks com DADOS_INSUFICIENTES ficam FORA do
// denominador — não contam a favor nem contra. A nota nunca é inflada por
// algo que ainda não conseguimos medir.

import {
  SEVERITY_WEIGHT,
  STATUS_POINTS,
  type HealthCheck,
  type HealthScore,
} from "./types.js";

function gradeFor(score: number): HealthScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function computeHealthScore(checks: HealthCheck[]): HealthScore {
  const avaliaveis = checks.filter((c) => c.status !== "DADOS_INSUFICIENTES");
  const insuficientes = checks.filter((c) => c.status === "DADOS_INSUFICIENTES").map((c) => c.id);

  if (!avaliaveis.length) {
    return { score: 0, grade: "F", checks, insuficientes };
  }

  let obtidos = 0;
  let possiveis = 0;
  for (const c of avaliaveis) {
    const peso = SEVERITY_WEIGHT[c.severity];
    possiveis += peso;
    obtidos += peso * STATUS_POINTS[c.status as keyof typeof STATUS_POINTS];
  }

  const score = possiveis > 0 ? Math.round((obtidos / possiveis) * 100) : 0;
  return { score, grade: gradeFor(score), checks, insuficientes };
}

export const GRADE_MEANING: Record<HealthScore["grade"], string> = {
  A: "Excelente — manter e escalar",
  B: "Bom — otimizações pontuais",
  C: "Atenção — problemas significativos",
  D: "Ruim — ação urgente necessária",
  F: "Crítico — parar e reestruturar",
};
