// Quality Gates — regras de decisão que funcionam SEM meta de CPA manual.
// Cada gate avalia o snapshot da conta e devolve:
//   - 1 check (PASS/ATENCAO/FAIL/DADOS_INSUFICIENTES) para o Health Score;
//   - 0..N alertas (um por entidade problemática) para o plano de ação.

import type {
  Alert,
  BenchmarkNiche,
  Channel,
  HealthCheck,
  Platform,
} from "./types.js";
import { classifyMetric } from "./benchmarks.js";

export interface GateCampaign {
  id: string;
  nome: string;
  parent?: string; // entidade pai (campanha do conjunto, conjunto/grupo do anúncio)
  gasto: number;
  conversoes: number;
  cliques: number;
  impressoes: number;
  ctr: number; // %
  cpc_medio: number;
  custo_por_conversao: number;
  frequencia?: number;
  parcela_impressoes?: number | null; // Google, %, null = N/A
  status?: string;
}

export interface GateItem {
  termo: string;
  gasto: number;
  conversoes: number;
  quality_score?: number | null;
}

export interface AccountSnapshot {
  channel: Channel;
  platform: Platform;
  niche?: BenchmarkNiche;
  objective?: string;
  month?: number;
  resumo: {
    gasto: number;
    conversoes: number;
    cliques: number;
    impressoes: number;
    ctr: number;
    cpc_medio: number;
    custo_por_conversao: number;
    cpm?: number;
    taxa_conversao?: number; // % — conversões / cliques
    frequencia?: number; // Meta — média ponderada por impressões
    impression_share?: number | null;
    quality_score_medio?: number | null;
  };
  campanhas: GateCampaign[];
  conjuntos?: GateCampaign[]; // Meta: conjuntos (adsets) · Google: grupos de anúncios
  anuncios?: GateCampaign[]; // anúncios individuais (Meta ads / Google RSAs)
  keywords?: GateItem[];
  termos?: GateItem[];
  pixelEventosRecentes?: boolean | null; // Meta; null = desconhecido
}

interface GateOutcome {
  check: HealthCheck;
  alerts: Alert[];
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const moneyBR = (n: number): string =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctBR = (n: number): string =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

/** Mediana do custo por conversão das campanhas que realmente convertem. */
function refCpa(campanhas: GateCampaign[]): number | null {
  const cpas = campanhas
    .filter((c) => c.conversoes > 0 && c.custo_por_conversao > 0)
    .map((c) => c.custo_por_conversao)
    .sort((a, b) => a - b);
  if (!cpas.length) return null;
  const mid = Math.floor(cpas.length / 2);
  return cpas.length % 2 ? cpas[mid] : round2((cpas[mid - 1] + cpas[mid]) / 2);
}

// ─── Gates ────────────────────────────────────────────────────────────────────

function gateGastoSemConversao(s: AccountSnapshot): GateOutcome {
  const threshold = Math.max(20, s.resumo.gasto * 0.05);
  const offenders = s.campanhas.filter((c) => c.gasto >= threshold && c.conversoes === 0);
  const alerts: Alert[] = offenders.map((c) => ({
    id: `gasto-sem-conversao:${c.id}`,
    title: "Gasto sem conversão",
    severity: "CRITICO",
    status: "FAIL",
    channel: s.channel,
    category: "Desperdício",
    entityName: c.nome,
    evidence: `${c.nome} gastou ${moneyBR(c.gasto)} e teve 0 conversões no período.`,
    recommendation: "Pausar ou revisar tracking/oferta antes de seguir investindo.",
    impactEstimate: round2(c.gasto),
  }));
  return {
    check: { id: "gasto-sem-conversao", category: "Desperdício", severity: "CRITICO", status: offenders.length ? "FAIL" : "PASS" },
    alerts,
  };
}

function gateCpaForaDaCurva(s: AccountSnapshot): GateOutcome {
  const ref = refCpa(s.campanhas);
  if (ref == null) {
    return { check: { id: "cpa-fora-da-curva", category: "Eficiência", severity: "ALTO", status: "DADOS_INSUFICIENTES", detail: "nenhuma campanha com conversão para referência" }, alerts: [] };
  }
  const offenders = s.campanhas.filter(
    (c) => c.conversoes > 0 && c.custo_por_conversao >= ref * 2.5 && c.custo_por_conversao >= 10
  );
  const alerts: Alert[] = offenders.map((c) => ({
    id: `cpa-fora-da-curva:${c.id}`,
    title: "CPA fora da curva",
    severity: "ALTO",
    status: "FAIL",
    channel: s.channel,
    category: "Eficiência",
    entityName: c.nome,
    evidence: `${c.nome} tem CPA de ${moneyBR(c.custo_por_conversao)}, ${round2(c.custo_por_conversao / ref)}x o CPA médio da conta (${moneyBR(ref)}).`,
    recommendation: "Revisar lances, público/termos ou criativo desta campanha.",
  }));
  return {
    check: { id: "cpa-fora-da-curva", category: "Eficiência", severity: "ALTO", status: offenders.length ? "FAIL" : "PASS", detail: `CPA de referência da conta: ${moneyBR(ref)}` },
    alerts,
  };
}

function gateCtrBenchmark(s: AccountSnapshot): GateOutcome {
  const res = classifyMetric("ctr", s.resumo.ctr, {
    platform: s.platform,
    objective: s.objective,
    niche: s.niche,
    month: s.month,
  });
  if (!res) {
    return { check: { id: "ctr-benchmark", category: "Eficiência", severity: "ALTO", status: "DADOS_INSUFICIENTES" }, alerts: [] };
  }
  const status = res.level === "CRITICO" ? "FAIL" : res.level === "ATENCAO" ? "ATENCAO" : "PASS";
  const alerts: Alert[] =
    status === "PASS"
      ? []
      : [{
          id: "ctr-benchmark",
          title: "CTR abaixo do benchmark",
          severity: "ALTO",
          status,
          channel: s.channel,
          category: "Eficiência",
          evidence: `CTR da conta ${pctBR(s.resumo.ctr)} — ${res.level} (faixa ${res.reference}).`,
          recommendation: "Testar novos criativos/anúncios ou revisar a correspondência anúncio↔público/termo.",
        }];
  return { check: { id: "ctr-benchmark", category: "Eficiência", severity: "ALTO", status, detail: res.rationale }, alerts };
}

function gateFrequencia(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "meta") {
    return { check: { id: "frequencia", category: "Público", severity: "CRITICO", status: "DADOS_INSUFICIENTES", detail: "frequência só existe no Meta" }, alerts: [] };
  }
  const comFreq = s.campanhas.filter((c) => typeof c.frequencia === "number" && c.frequencia > 0);
  if (!comFreq.length) {
    return { check: { id: "frequencia", category: "Público", severity: "CRITICO", status: "DADOS_INSUFICIENTES" }, alerts: [] };
  }
  const criticas = comFreq.filter((c) => (c.frequencia ?? 0) >= 5.0 && c.gasto >= s.resumo.gasto * 0.1);
  const atencao = comFreq.filter((c) => (c.frequencia ?? 0) >= 3.0 && (c.frequencia ?? 0) < 5.0 && c.gasto >= s.resumo.gasto * 0.1);
  const status = criticas.length ? "FAIL" : atencao.length ? "ATENCAO" : "PASS";
  const alerts: Alert[] = [...criticas, ...atencao].map((c) => ({
    id: `frequencia:${c.id}`,
    title: "Frequência alta (saturação de público)",
    severity: (c.frequencia ?? 0) >= 5.0 ? "CRITICO" : "ALTO",
    status: (c.frequencia ?? 0) >= 5.0 ? "FAIL" : "ATENCAO",
    channel: s.channel,
    category: "Público",
    entityName: c.nome,
    evidence: `${c.nome} com frequência ${round2(c.frequencia ?? 0)} (limite saudável: 3,0 prospecção).`,
    recommendation: "Renovar criativo ou ampliar/trocar o público.",
  }));
  return { check: { id: "frequencia", category: "Público", severity: "CRITICO", status }, alerts };
}

function gateItensCaros(s: AccountSnapshot, items: GateItem[] | undefined, kind: "termo" | "keyword"): GateOutcome {
  const id = kind === "termo" ? "termo-caro-sem-conversao" : "keyword-cara-sem-conversao";
  const cat = "Desperdício";
  if (!items || !items.length) {
    return { check: { id, category: cat, severity: "ALTO", status: "DADOS_INSUFICIENTES" }, alerts: [] };
  }
  const wasted = items.filter((i) => i.gasto > 0 && i.conversoes === 0);
  const totalWaste = round2(wasted.reduce((acc, i) => acc + i.gasto, 0));
  const share = s.resumo.gasto > 0 ? totalWaste / s.resumo.gasto : 0;
  const status = share >= 0.2 ? "FAIL" : share >= 0.1 ? "ATENCAO" : "PASS";
  const top = [...wasted].sort((a, b) => b.gasto - a.gasto)[0];
  const alerts: Alert[] =
    status === "PASS" || !top
      ? []
      : [{
          id,
          title: kind === "termo" ? "Termos de pesquisa sem conversão" : "Keywords sem conversão",
          severity: "ALTO",
          status,
          channel: s.channel,
          category: cat,
          entityName: top.termo,
          evidence: `${moneyBR(totalWaste)} (${pctBR(share * 100)} do gasto) em ${kind === "termo" ? "termos" : "keywords"} sem conversão. Maior: "${top.termo}" (${moneyBR(top.gasto)}).`,
          recommendation: kind === "termo" ? "Negativar os termos irrelevantes (correspondência frase/exata)." : "Pausar ou ajustar lance/correspondência das keywords improdutivas.",
          impactEstimate: totalWaste,
        }];
  return { check: { id, category: cat, severity: "ALTO", status }, alerts };
}

function gateQualityScore(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "google" || s.resumo.quality_score_medio == null) {
    return { check: { id: "quality-score", category: "Keywords", severity: "ALTO", status: "DADOS_INSUFICIENTES" }, alerts: [] };
  }
  const qs = s.resumo.quality_score_medio;
  const status = qs < 4 ? "FAIL" : qs < 6 ? "ATENCAO" : "PASS";
  const alerts: Alert[] =
    status === "PASS"
      ? []
      : [{
          id: "quality-score",
          title: "Quality Score baixo",
          severity: "ALTO",
          status,
          channel: s.channel,
          category: "Keywords",
          evidence: `Quality Score médio ${round2(qs)} (bom: ≥ 6).`,
          recommendation: "Revisar relevância anúncio↔keyword e a experiência da página de destino.",
        }];
  return { check: { id: "quality-score", category: "Keywords", severity: "ALTO", status }, alerts };
}

function gateImpressionShare(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "google" || s.resumo.impression_share == null) {
    return { check: { id: "impression-share", category: "Estrutura", severity: "MEDIO", status: "DADOS_INSUFICIENTES" }, alerts: [] };
  }
  const is = s.resumo.impression_share;
  const status = is < 20 ? "FAIL" : is < 40 ? "ATENCAO" : "PASS";
  const alerts: Alert[] =
    status === "PASS"
      ? []
      : [{
          id: "impression-share",
          title: "Parcela de impressões baixa",
          severity: "MEDIO",
          status,
          channel: s.channel,
          category: "Estrutura",
          evidence: `Parcela de impressões ${pctBR(is)} (bom: ≥ 40%).`,
          recommendation: "Avaliar aumento de orçamento/lance ou melhora de Quality Score.",
        }];
  return { check: { id: "impression-share", category: "Estrutura", severity: "MEDIO", status }, alerts };
}

function gateCampanhaSemImpressoes(s: AccountSnapshot): GateOutcome {
  const offenders = s.campanhas.filter(
    (c) => c.impressoes === 0 && (c.status ? /ENABLED|ACTIVE/i.test(c.status) : false)
  );
  const alerts: Alert[] = offenders.map((c) => ({
    id: `campanha-travada:${c.id}`,
    title: "Campanha ativa sem impressões",
    severity: "MEDIO",
    status: "FAIL",
    channel: s.channel,
    category: "Estrutura",
    entityName: c.nome,
    evidence: `${c.nome} está ativa mas com 0 impressões no período.`,
    recommendation: "Investigar orçamento, lance, aprovação ou segmentação.",
  }));
  return {
    check: { id: "campanha-travada", category: "Estrutura", severity: "MEDIO", status: offenders.length ? "FAIL" : "PASS" },
    alerts,
  };
}

function gatePixel(s: AccountSnapshot): GateOutcome {
  if (s.platform !== "meta" || s.pixelEventosRecentes == null) {
    return { check: { id: "pixel-evento-recente", category: "Tracking", severity: "ALTO", status: "DADOS_INSUFICIENTES" }, alerts: [] };
  }
  const ok = s.pixelEventosRecentes;
  return {
    check: { id: "pixel-evento-recente", category: "Tracking", severity: "ALTO", status: ok ? "PASS" : "FAIL" },
    alerts: ok
      ? []
      : [{
          id: "pixel-evento-recente",
          title: "Pixel sem eventos recentes",
          severity: "ALTO",
          status: "FAIL",
          channel: s.channel,
          category: "Tracking",
          evidence: "O pixel não registrou eventos recentes — risco de tracking quebrado.",
          recommendation: "Verificar pixel/CAPI, GTM e disparo do evento principal.",
        }],
  };
}

/** Roda todos os gates aplicáveis e devolve checks (nota) + alertas (ação). */
export function runQualityGates(s: AccountSnapshot): { checks: HealthCheck[]; alerts: Alert[] } {
  const outcomes: GateOutcome[] = [
    gateGastoSemConversao(s),
    gateCpaForaDaCurva(s),
    gateCtrBenchmark(s),
    gateFrequencia(s),
    gateItensCaros(s, s.termos, "termo"),
    gateItensCaros(s, s.keywords, "keyword"),
    gateQualityScore(s),
    gateImpressionShare(s),
    gateCampanhaSemImpressoes(s),
    gatePixel(s),
  ];
  return {
    checks: outcomes.map((o) => o.check),
    alerts: outcomes.flatMap((o) => o.alerts),
  };
}

/** Soma o desperdício estimado dos alertas (impactEstimate). */
export function totalWaste(alerts: Alert[]): number {
  return round2(alerts.reduce((acc, a) => acc + (a.impactEstimate ?? 0), 0));
}
