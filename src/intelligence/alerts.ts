// Priorização de alertas por impacto. Ordem: severidade (peso) primeiro,
// depois maior impacto estimado em R$, depois quem tem número de impacto.

import { SEVERITY_WEIGHT, type Alert } from "./types.js";

const STATUS_RANK: Record<Alert["status"], number> = {
  FAIL: 2,
  ATENCAO: 1,
  PASS: 0,
  DADOS_INSUFICIENTES: 0,
};

export function prioritizeAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sev = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (sev !== 0) return sev;
    const st = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    if (st !== 0) return st;
    return (b.impactEstimate ?? 0) - (a.impactEstimate ?? 0);
  });
}

const SEVERITY_ICON: Record<Alert["severity"], string> = {
  CRITICO: "🔴",
  ALTO: "🟠",
  MEDIO: "🟡",
  BAIXO: "🔵",
};

/** Linha curta de alerta para a mensagem de WhatsApp. */
export function alertLine(a: Alert): string {
  return `${SEVERITY_ICON[a.severity]} ${a.evidence} → ${a.recommendation}`;
}
