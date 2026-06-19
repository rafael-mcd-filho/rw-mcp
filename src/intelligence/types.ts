// Tipos compartilhados da camada de inteligência (benchmarks, gates, score,
// diagnóstico e auditoria). Sem dependências de runtime — só contratos.

export type Platform = "meta" | "google";
export type Channel = "meta" | "google" | "integrated";

export type PerformanceLevel = "EXCELENTE" | "BOM" | "ATENCAO" | "CRITICO";
export type Severity = "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";
export type CheckStatus = "PASS" | "ATENCAO" | "FAIL" | "DADOS_INSUFICIENTES";

export type BenchmarkNiche =
  | "alimentacao_delivery"
  | "franquias"
  | "saude_estetica"
  | "servicos_locais"
  | "imoveis"
  | "educacao"
  | "infoprodutos"
  | "ecommerce_moda"
  | "ecommerce_tech"
  | "saas_b2b"
  | "financeiro"
  | "geral";

/** Resultado da inferência de nicho a partir do texto livre de contexto. */
export interface NicheResult {
  niche: BenchmarkNiche;
  label: string;
  confidence: "alta" | "media" | "baixa";
  evidence: string[];
}

/** Classificação de uma métrica contra o benchmark do nicho/objetivo. */
export interface BenchmarkResult {
  metric: string;
  value: number;
  level: PerformanceLevel;
  label: string;
  reference: string;
  rationale: string;
}

/** Alerta priorizável — contrato único para diagnóstico, auditoria e relatório. */
export interface Alert {
  id: string;
  title: string;
  severity: Severity;
  status: CheckStatus;
  channel: Channel;
  category: string;
  entityName?: string;
  evidence: string;
  recommendation: string;
  impactEstimate?: number;
}

/** Check individual do Health Score. */
export interface HealthCheck {
  id: string;
  category: string;
  severity: Severity;
  status: CheckStatus;
  detail?: string;
}

/** Resultado do Health Score: nota + checks + transparência do que faltou. */
export interface HealthScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: HealthCheck[];
  insuficientes: string[];
}

/** Contexto usado para classificar — plataforma, objetivo, nicho e mês. */
export interface ClassifyContext {
  platform: Platform;
  objective?: string;
  niche?: BenchmarkNiche;
  month?: number; // 1-12, para sazonalidade
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICO: 5.0,
  ALTO: 3.0,
  MEDIO: 1.5,
  BAIXO: 0.5,
};

export const STATUS_POINTS: Record<Exclude<CheckStatus, "DADOS_INSUFICIENTES">, number> = {
  PASS: 1.0,
  ATENCAO: 0.5,
  FAIL: 0.0,
};
