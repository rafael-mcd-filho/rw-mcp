import type {
  GAccountReport,
  GCampaign,
  GDayData,
  GKeyword,
  GSearchTerm,
} from "./google-ads-api.js";
import type {
  PdfCampaignRow,
  PdfObjectiveSummary,
  PdfReportModel,
} from "./report.js";
import { round2, moneyBR, intBR, pctBR, dateBR, sortKeyFromBR } from "./format.js";
import { classifyMetric } from "./intelligence/benchmarks.js";
import type { BenchmarkNiche, BenchmarkResult } from "./intelligence/types.js";

function fmtDeltaPercent(value: number | null): string {
  if (value == null) return "novo";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function fmtDeltaPp(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} p.p.`;
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return round2(((current - previous) / previous) * 100);
}

function numericShare(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function bySpendDesc<T extends { gasto: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.gasto - a.gasto);
}

function bestKeyword(keywords: GKeyword[] = []): GKeyword | undefined {
  return [...keywords]
    .filter((k) => k.conversoes > 0)
    .sort((a, b) => a.custo_por_conversao - b.custo_por_conversao)[0];
}

function wasteKeyword(keywords: GKeyword[] = []): GKeyword | undefined {
  return bySpendDesc(keywords).find((k) => k.gasto > 0 && k.conversoes === 0);
}

function wasteSearchTerm(searchTerms: GSearchTerm[] = []): GSearchTerm | undefined {
  return bySpendDesc(searchTerms).find((t) => t.gasto > 0 && t.conversoes === 0);
}

export interface GoogleReportOptions {
  clientName?: string;
  keywords?: GKeyword[];
  searchTerms?: GSearchTerm[];
  /** Nicho do benchmark; quando presente, classifica os KPIs do resumo. */
  niche?: BenchmarkNiche;
  /** Mês (1-12) para a sazonalidade; default = mês atual. */
  month?: number;
}

export interface GoogleAdsEnhancedReport extends GAccountReport {
  canal: "Google Ads";
  cliente?: string;
  leitura_executiva: string[];
  oportunidades: string[];
  notas_metodologicas: string[];
  keywords?: GKeyword[];
  termos_pesquisa?: GSearchTerm[];
  analise_benchmark?: BenchmarkResult[];
  mensagem: string;
}

/** Classifica os KPIs do resumo de uma conta Google contra o benchmark do nicho. */
function classifyGoogleKpis(report: GAccountReport, niche: BenchmarkNiche, month: number): BenchmarkResult[] {
  const ctx = { platform: "google" as const, objective: "default", niche, month };
  const out: BenchmarkResult[] = [];
  const push = (r?: BenchmarkResult) => { if (r) out.push(r); };
  push(classifyMetric("ctr", report.resumo.ctr, ctx));
  push(classifyMetric("cpc", report.resumo.cpc_medio, ctx));
  if (report.resumo.conversoes > 0) push(classifyMetric("cpl", report.resumo.custo_por_conversao, ctx));
  return out;
}

export interface MetricComparison {
  atual: number;
  anterior: number;
  variacao_absoluta: number;
  variacao_percentual: number | null;
  label: string;
}

export interface CampaignComparison {
  id: string;
  nome: string;
  status: "manteve_entrega" | "nova_no_periodo" | "sem_entrega_atual";
  atual: GCampaign | null;
  anterior: GCampaign | null;
  variacoes: {
    gasto: MetricComparison;
    conversoes: MetricComparison;
    custo_por_conversao: MetricComparison;
    cliques: MetricComparison;
    ctr_pp: number;
    ctr_label: string;
  };
}

export interface GoogleAdsComparisonReport {
  canal: "Google Ads";
  cliente?: string;
  atual: GoogleAdsEnhancedReport;
  anterior: GoogleAdsEnhancedReport;
  variacoes: {
    resumo: {
      gasto_total: MetricComparison;
      conversoes: MetricComparison;
      custo_por_conversao: MetricComparison;
      cliques: MetricComparison;
      impressoes: MetricComparison;
      cpc_medio: MetricComparison;
      ctr_pp: number;
      ctr_label: string;
    };
    campanhas: CampaignComparison[];
  };
  leitura_executiva: string[];
  oportunidades: string[];
  notas_metodologicas: string[];
  mensagem: string;
}

function metricComparison(current: number, previous: number): MetricComparison {
  const diff = round2(current - previous);
  const pct = pctChange(current, previous);
  return {
    atual: round2(current),
    anterior: round2(previous),
    variacao_absoluta: diff,
    variacao_percentual: pct,
    label: fmtDeltaPercent(pct),
  };
}

function buildGoogleRead(report: GAccountReport, options: GoogleReportOptions = {}): string[] {
  const lines: string[] = [];
  const campaigns = bySpendDesc(report.campanhas).filter((c) => c.gasto > 0);
  const top = campaigns[0];
  const totalSpend = report.resumo.gasto_total;

  if (top) {
    lines.push(
      `${top.nome} concentrou ${numericShare(top.gasto, totalSpend)}% do investimento em Google Ads, com ${intBR(top.conversoes)} conversões e CPA de ${moneyBR(top.custo_por_conversao)}.`
    );
  }

  const withConversions = campaigns.filter((c) => c.conversoes > 0);
  if (withConversions.length) {
    const best = [...withConversions].sort(
      (a, b) => a.custo_por_conversao - b.custo_por_conversao
    )[0];
    lines.push(
      `Melhor eficiência registrada em ${best.nome}: ${intBR(best.conversoes)} conversões com CPA de ${moneyBR(best.custo_por_conversao)}.`
    );
  }

  const keyword = bestKeyword(options.keywords);
  if (keyword) {
    lines.push(
      `Keyword com melhor eficiência: "${keyword.keyword}" em ${keyword.campanha}, com ${intBR(keyword.conversoes)} conversões e CPA de ${moneyBR(keyword.custo_por_conversao)}.`
    );
  }

  if (!lines.length) {
    lines.push("Não houve entrega suficiente para uma leitura consolidada do Google Ads no período.");
  }

  return lines;
}

function buildGoogleOpportunities(report: GAccountReport, options: GoogleReportOptions = {}): string[] {
  const campaigns = bySpendDesc(report.campanhas).filter((c) => c.gasto > 0);
  const totalSpend = report.resumo.gasto_total;
  const items: string[] = [];

  const noConversion = campaigns.find(
    (c) => c.conversoes === 0 && c.gasto >= Math.max(20, totalSpend * 0.05)
  );
  if (noConversion) {
    items.push(
      `Revisar ${noConversion.nome}: ${moneyBR(noConversion.gasto)} investidos sem conversão registrada.`
    );
  }

  const withConversions = campaigns.filter((c) => c.conversoes > 0);
  if (withConversions.length) {
    const best = [...withConversions].sort(
      (a, b) => a.custo_por_conversao - b.custo_por_conversao
    )[0];
    items.push(
      `Proteger verba de ${best.nome}: melhor CPA do período (${moneyBR(best.custo_por_conversao)}).`
    );
  }

  const lowCtr = campaigns.find((c) => c.ctr > 0 && c.ctr < 1 && c.gasto >= totalSpend * 0.1);
  if (lowCtr) {
    items.push(
      `Testar novos anúncios ou termos em ${lowCtr.nome}: CTR de ${pctBR(lowCtr.ctr)} abaixo do esperado.`
    );
  }

  const avgCpc = report.resumo.cpc_medio;
  const highCpc = campaigns.find(
    (c) => avgCpc > 0 && c.cpc_medio >= avgCpc * 1.8 && c.gasto >= totalSpend * 0.05
  );
  if (highCpc) {
    items.push(
      `Checar lances e termos de ${highCpc.nome}: CPC médio de ${moneyBR(highCpc.cpc_medio)} acima da média da conta.`
    );
  }

  const kwWaste = wasteKeyword(options.keywords);
  if (kwWaste) {
    items.push(
      `Revisar keyword "${kwWaste.keyword}" (${kwWaste.campanha}): ${moneyBR(kwWaste.gasto)} gastos sem conversão.`
    );
  }

  const termWaste = wasteSearchTerm(options.searchTerms);
  if (termWaste) {
    items.push(
      `Avaliar negativar ou ajustar termo "${termWaste.termo}": ${moneyBR(termWaste.gasto)} sem conversão.`
    );
  }

  if (!items.length) {
    items.push("Manter acompanhamento por campanha e redistribuir verba conforme CPA e volume de conversões.");
  }

  return items.slice(0, 4);
}

function buildGoogleMessage(report: GoogleAdsEnhancedReport): string {
  const name = report.cliente ?? report.conta_id;
  const lines = [
    `*Relatório Google Ads - ${name}*`,
    `Período: ${report.periodo}`,
    "",
    `- Investimento: ${moneyBR(report.resumo.gasto_total)}`,
    `- Conversões: ${intBR(report.resumo.conversoes)}`,
    `- CPA médio: ${report.resumo.conversoes > 0 ? moneyBR(report.resumo.custo_por_conversao) : "-"}`,
    `- Cliques: ${intBR(report.resumo.cliques)}`,
    `- CTR médio: ${pctBR(report.resumo.ctr)}`,
    `- CPC médio: ${moneyBR(report.resumo.cpc_medio)}`,
    `- Impressões: ${intBR(report.resumo.impressoes)}`,
  ];

  const topCampaigns = bySpendDesc(report.campanhas)
    .filter((c) => c.gasto > 0)
    .slice(0, 5);

  if (topCampaigns.length) {
    lines.push("", "*Campanhas principais*");
    for (const c of topCampaigns) {
      const cpa = c.conversoes > 0 ? moneyBR(c.custo_por_conversao) : "-";
      lines.push(
        `- ${c.nome}: ${moneyBR(c.gasto)} | ${intBR(c.conversoes)} conv. | CPA ${cpa} | CTR ${pctBR(c.ctr)}`
      );
    }
  }

  if (report.keywords?.length) {
    lines.push("", "*Keywords em destaque*");
    for (const k of report.keywords.slice(0, 3)) {
      const cpa = k.conversoes > 0 ? moneyBR(k.custo_por_conversao) : "-";
      lines.push(
        `- ${k.keyword}: ${moneyBR(k.gasto)} | ${intBR(k.conversoes)} conv. | CPA ${cpa}`
      );
    }
  }

  if (report.termos_pesquisa?.length) {
    lines.push("", "*Termos de pesquisa*");
    for (const t of report.termos_pesquisa.slice(0, 3)) {
      lines.push(
        `- ${t.termo}: ${moneyBR(t.gasto)} | ${intBR(t.cliques)} cliques | ${intBR(t.conversoes)} conv.`
      );
    }
  }

  if (report.analise_benchmark?.length) {
    lines.push("", "*Benchmark*", report.analise_benchmark.map((b) => `${b.label}: ${b.level}`).join(" · "));
  }

  lines.push("", "*Leitura*", ...report.leitura_executiva.map((line) => `- ${line}`));

  return lines.join("\n");
}

export function buildGoogleAdsReport(
  report: GAccountReport,
  options: GoogleReportOptions = {}
): GoogleAdsEnhancedReport {
  const base: GoogleAdsEnhancedReport = {
    ...report,
    canal: "Google Ads",
    cliente: options.clientName,
    leitura_executiva: buildGoogleRead(report, options),
    oportunidades: buildGoogleOpportunities(report, options),
    notas_metodologicas: [
      "Conversões são as ações configuradas na conta Google Ads; valide se representam lead, venda ou outro evento.",
      "CPA, CPC e CTR são métricas de mídia e não confirmam qualificação comercial sem CRM.",
      "Keywords e termos de pesquisa são amostras ordenadas por gasto quando incluídos no relatório.",
    ],
    keywords: options.keywords?.slice(0, 10),
    termos_pesquisa: options.searchTerms?.slice(0, 10),
    analise_benchmark: options.niche
      ? classifyGoogleKpis(report, options.niche, options.month ?? new Date().getMonth() + 1)
      : undefined,
    mensagem: "",
  };
  return { ...base, mensagem: buildGoogleMessage(base) };
}

function emptyCampaign(id: string, name: string): GCampaign {
  return {
    id,
    nome: name,
    status: "",
    tipo: "",
    gasto: 0,
    impressoes: 0,
    cliques: 0,
    conversoes: 0,
    ctr: 0,
    cpc_medio: 0,
    custo_por_conversao: 0,
    parcela_impressoes: "N/A",
  };
}

function compareCampaigns(
  current: GCampaign[],
  previous: GCampaign[]
): CampaignComparison[] {
  const byId = new Map<string, { atual?: GCampaign; anterior?: GCampaign }>();
  for (const c of current) {
    byId.set(c.id, { ...(byId.get(c.id) ?? {}), atual: c });
  }
  for (const c of previous) {
    byId.set(c.id, { ...(byId.get(c.id) ?? {}), anterior: c });
  }

  return [...byId.entries()]
    .map(([id, pair]) => {
      const name = pair.atual?.nome ?? pair.anterior?.nome ?? id;
      const atual = pair.atual ?? emptyCampaign(id, name);
      const anterior = pair.anterior ?? emptyCampaign(id, name);
      const status: CampaignComparison["status"] =
        atual.gasto > 0 && anterior.gasto === 0
          ? "nova_no_periodo"
          : atual.gasto === 0 && anterior.gasto > 0
            ? "sem_entrega_atual"
            : "manteve_entrega";
      const ctrPp = round2(atual.ctr - anterior.ctr);
      return {
        id,
        nome: name,
        status,
        atual: pair.atual ?? null,
        anterior: pair.anterior ?? null,
        variacoes: {
          gasto: metricComparison(atual.gasto, anterior.gasto),
          conversoes: metricComparison(atual.conversoes, anterior.conversoes),
          custo_por_conversao: metricComparison(
            atual.custo_por_conversao,
            anterior.custo_por_conversao
          ),
          cliques: metricComparison(atual.cliques, anterior.cliques),
          ctr_pp: ctrPp,
          ctr_label: fmtDeltaPp(ctrPp),
        },
      };
    })
    .sort((a, b) => {
      const spendA = (a.atual?.gasto ?? 0) + (a.anterior?.gasto ?? 0);
      const spendB = (b.atual?.gasto ?? 0) + (b.anterior?.gasto ?? 0);
      return spendB - spendA;
    });
}

function buildComparisonRead(report: GoogleAdsComparisonReport): string[] {
  const v = report.variacoes.resumo;
  const lines: string[] = [];
  lines.push(
    `O investimento ficou em ${moneyBR(v.gasto_total.atual)} (${v.gasto_total.label} vs. período anterior), com ${intBR(v.conversoes.atual)} conversões (${v.conversoes.label}).`
  );
  lines.push(
    `O CPA médio ficou em ${moneyBR(v.custo_por_conversao.atual)} (${v.custo_por_conversao.label}) e o CTR variou ${v.ctr_label}.`
  );

  const worseCpa = report.variacoes.campanhas.find((c) => {
    const pct = c.variacoes.custo_por_conversao.variacao_percentual;
    return (c.atual?.conversoes ?? 0) > 0 && pct != null && pct >= 25;
  });
  if (worseCpa) {
    lines.push(
      `${worseCpa.nome} puxou atenção por alta de CPA (${worseCpa.variacoes.custo_por_conversao.label}).`
    );
  }

  return lines;
}

function buildComparisonOpportunities(report: GoogleAdsComparisonReport): string[] {
  const items: string[] = [];
  const falling = report.variacoes.campanhas.find(
    (c) =>
      (c.atual?.gasto ?? 0) > 0 &&
      (c.variacoes.conversoes.variacao_percentual ?? 0) <= -20
  );
  if (falling) {
    items.push(
      `Investigar ${falling.nome}: conversões caíram ${falling.variacoes.conversoes.label} no comparativo.`
    );
  }

  const newSpendNoConv = report.variacoes.campanhas.find(
    (c) => c.status === "nova_no_periodo" && (c.atual?.gasto ?? 0) > 0 && (c.atual?.conversoes ?? 0) === 0
  );
  if (newSpendNoConv) {
    items.push(
      `Acompanhar ${newSpendNoConv.nome}: entrou no período atual com gasto, mas ainda sem conversões.`
    );
  }

  const best = report.variacoes.campanhas
    .filter((c) => (c.atual?.conversoes ?? 0) > 0)
    .sort(
      (a, b) =>
        (a.atual?.custo_por_conversao ?? Number.POSITIVE_INFINITY) -
        (b.atual?.custo_por_conversao ?? Number.POSITIVE_INFINITY)
    )[0];
  if (best?.atual) {
    items.push(
      `Preservar ${best.nome}: melhor CPA atual (${moneyBR(best.atual.custo_por_conversao)}).`
    );
  }

  if (!items.length) {
    items.push("Usar o comparativo para redistribuir verba entre campanhas com melhor CPA e maior estabilidade de conversões.");
  }
  return items.slice(0, 4);
}

function buildGoogleComparisonMessage(report: GoogleAdsComparisonReport): string {
  const name = report.cliente ?? report.atual.conta_id;
  const v = report.variacoes.resumo;
  const lines = [
    `*Comparativo Google Ads - ${name}*`,
    `Atual: ${report.atual.periodo}`,
    `Anterior: ${report.anterior.periodo}`,
    "",
    `- Investimento: ${moneyBR(v.gasto_total.atual)} (${v.gasto_total.label})`,
    `- Conversões: ${intBR(v.conversoes.atual)} (${v.conversoes.label})`,
    `- CPA médio: ${moneyBR(v.custo_por_conversao.atual)} (${v.custo_por_conversao.label})`,
    `- Cliques: ${intBR(v.cliques.atual)} (${v.cliques.label})`,
    `- CTR médio: ${pctBR(report.atual.resumo.ctr)} (${v.ctr_label})`,
    `- CPC médio: ${moneyBR(v.cpc_medio.atual)} (${v.cpc_medio.label})`,
  ];

  const top = report.variacoes.campanhas
    .filter((c) => (c.atual?.gasto ?? 0) + (c.anterior?.gasto ?? 0) > 0)
    .slice(0, 5);

  if (top.length) {
    lines.push("", "*Campanhas no comparativo*");
    for (const c of top) {
      lines.push(
        `- ${c.nome}: gasto ${c.variacoes.gasto.label} | conv. ${c.variacoes.conversoes.label} | CPA ${c.variacoes.custo_por_conversao.label}`
      );
    }
  }

  lines.push("", "*Leitura*", ...report.leitura_executiva.map((line) => `- ${line}`));
  lines.push("", "*Próximos passos*", ...report.oportunidades.map((line) => `- ${line}`));
  return lines.join("\n");
}

export function buildGoogleAdsComparison(
  current: GAccountReport,
  previous: GAccountReport,
  options: GoogleReportOptions = {}
): GoogleAdsComparisonReport {
  const atual = buildGoogleAdsReport(current, options);
  const anterior = buildGoogleAdsReport(previous, { clientName: options.clientName });
  const ctrPp = round2(atual.resumo.ctr - anterior.resumo.ctr);

  const base: GoogleAdsComparisonReport = {
    canal: "Google Ads",
    cliente: options.clientName,
    atual,
    anterior,
    variacoes: {
      resumo: {
        gasto_total: metricComparison(atual.resumo.gasto_total, anterior.resumo.gasto_total),
        conversoes: metricComparison(atual.resumo.conversoes, anterior.resumo.conversoes),
        custo_por_conversao: metricComparison(
          atual.resumo.custo_por_conversao,
          anterior.resumo.custo_por_conversao
        ),
        cliques: metricComparison(atual.resumo.cliques, anterior.resumo.cliques),
        impressoes: metricComparison(atual.resumo.impressoes, anterior.resumo.impressoes),
        cpc_medio: metricComparison(atual.resumo.cpc_medio, anterior.resumo.cpc_medio),
        ctr_pp: ctrPp,
        ctr_label: fmtDeltaPp(ctrPp),
      },
      campanhas: compareCampaigns(atual.campanhas, anterior.campanhas),
    },
    leitura_executiva: [],
    oportunidades: [],
    notas_metodologicas: [
      "Comparativo usa as mesmas configurações de conversão da conta Google Ads em ambos os períodos.",
      "Variação de CPA deve ser lida junto com volume; baixa conversão pode distorcer percentuais.",
      "CTR varia em pontos percentuais; as demais variações principais usam percentual relativo.",
    ],
    mensagem: "",
  };

  const withRead = {
    ...base,
    leitura_executiva: buildComparisonRead(base),
    oportunidades: buildComparisonOpportunities(base),
  };
  return { ...withRead, mensagem: buildGoogleComparisonMessage(withRead) };
}

function googleCampaignToPdfRow(campaign: GCampaign): PdfCampaignRow {
  const cpm =
    campaign.impressoes > 0 ? round2((campaign.gasto / campaign.impressoes) * 1000) : 0;
  return {
    nome: campaign.nome || "(sem nome)",
    categoria: "google_ads",
    headlineLabel: "Conversões",
    costLabel: "CPA médio",
    categoriaLabel: "Google Ads",
    primaryMetric: "conversion",
    gasto: campaign.gasto,
    resultado: campaign.conversoes,
    custo: campaign.custo_por_conversao,
    cliques: campaign.cliques,
    impressoes: campaign.impressoes,
    alcance: 0,
    ctr: campaign.ctr,
    cpc: campaign.cpc_medio,
    cpm,
    frequencia: 0,
    thruplay: 0,
    valorConversao: 0,
    roas: 0,
  };
}

function googleObjective(report: GoogleAdsEnhancedReport): PdfObjectiveSummary {
  const cpm =
    report.resumo.impressoes > 0
      ? round2((report.resumo.gasto_total / report.resumo.impressoes) * 1000)
      : 0;
  return {
    category: "google_ads",
    label: "Google Ads",
    headlineLabel: "Conversões",
    costLabel: "CPA médio",
    primaryMetric: "conversion",
    campaignsCount: report.campanhas.filter((c) => c.gasto > 0).length,
    gasto: report.resumo.gasto_total,
    resultado: report.resumo.conversoes,
    custo: report.resumo.custo_por_conversao,
    cliques: report.resumo.cliques,
    impressoes: report.resumo.impressoes,
    alcance: 0,
    ctr: report.resumo.ctr,
    cpc: report.resumo.cpc_medio,
    cpm,
    frequencia: 0,
    valorConversao: 0,
    roas: 0,
  };
}

export function buildGooglePdfModel(
  report: GoogleAdsEnhancedReport,
  dailyRows: GDayData[] = []
): PdfReportModel {
  const campaigns = bySpendDesc(report.campanhas).map(googleCampaignToPdfRow);
  const objective = googleObjective(report);
  return {
    kind: "google",
    cliente: report.cliente ?? `Google Ads ${report.conta_id}`,
    periodo: report.periodo,
    geradoEm: new Date().toLocaleString("pt-BR"),
    meta: {
      clientName: report.cliente ?? report.conta_id,
      periodLabel: report.periodo,
      channels: ["Google Ads"],
      sourceLabel: "Fonte: API Google Ads",
    },
    resumo: {
      gastoTotal: report.resumo.gasto_total,
      leads: 0,
      conversas: 0,
      kpis: [
        {
          label: "Investimento total",
          value: moneyBR(report.resumo.gasto_total),
          note: `${campaigns.length} campanhas com entrega`,
          tone: "red",
        },
        {
          label: "Conversões",
          value: intBR(report.resumo.conversoes),
          note:
            report.resumo.conversoes > 0
              ? `CPA médio: ${moneyBR(report.resumo.custo_por_conversao)}`
              : "Sem conversões registradas",
          tone: "black",
        },
        {
          label: "Cliques",
          value: intBR(report.resumo.cliques),
          note: `CPC médio: ${moneyBR(report.resumo.cpc_medio)}`,
          tone: "red",
        },
        {
          label: "CTR",
          value: pctBR(report.resumo.ctr),
          note: `${intBR(report.resumo.impressoes)} impressões`,
          tone: "black",
        },
      ],
      leituraExecutiva: report.leitura_executiva,
    },
    objetivoPrincipal: objective,
    objetivos: [objective],
    campanhas: campaigns,
    serieDiaria: dailyRows.map((d) => ({
      data: dateBR(d.data),
      gasto: d.gasto,
      resultados: d.conversoes,
    })),
    notasMetodologicas: report.notas_metodologicas,
    proximosPassos: report.oportunidades,
  };
}

function googleComparisonCampaignToPdfRow(item: CampaignComparison): PdfCampaignRow {
  const atual = item.atual ?? emptyCampaign(item.id, item.nome);
  const cpm =
    atual.impressoes > 0 ? round2((atual.gasto / atual.impressoes) * 1000) : 0;
  return {
    nome: item.nome,
    categoria: "google_comparison",
    headlineLabel: "Conversões atuais",
    costLabel: "CPA atual",
    categoriaLabel: `Google Ads | gasto ${item.variacoes.gasto.label} | conv. ${item.variacoes.conversoes.label}`,
    primaryMetric: "conversion",
    gasto: atual.gasto,
    resultado: atual.conversoes,
    custo: atual.custo_por_conversao,
    cliques: atual.cliques,
    impressoes: atual.impressoes,
    alcance: 0,
    ctr: atual.ctr,
    cpc: atual.cpc_medio,
    cpm,
    frequencia: 0,
    thruplay: 0,
    valorConversao: 0,
    roas: 0,
  };
}

function googleComparisonObjective(
  report: GoogleAdsEnhancedReport,
  label: string,
  category: string
): PdfObjectiveSummary {
  const cpm =
    report.resumo.impressoes > 0
      ? round2((report.resumo.gasto_total / report.resumo.impressoes) * 1000)
      : 0;
  return {
    category,
    label,
    headlineLabel: "Conversões",
    costLabel: "CPA médio",
    primaryMetric: "conversion",
    campaignsCount: report.campanhas.filter((c) => c.gasto > 0).length,
    gasto: report.resumo.gasto_total,
    resultado: report.resumo.conversoes,
    custo: report.resumo.custo_por_conversao,
    cliques: report.resumo.cliques,
    impressoes: report.resumo.impressoes,
    alcance: 0,
    ctr: report.resumo.ctr,
    cpc: report.resumo.cpc_medio,
    cpm,
    frequencia: 0,
    valorConversao: 0,
    roas: 0,
  };
}

export function buildGoogleComparisonPdfModel(
  report: GoogleAdsComparisonReport
): PdfReportModel {
  const objectives = [
    googleComparisonObjective(report.atual, "Período atual", "google_current"),
    googleComparisonObjective(report.anterior, "Período anterior", "google_previous"),
  ];
  const campaigns = report.variacoes.campanhas
    .filter((c) => (c.atual?.gasto ?? 0) + (c.anterior?.gasto ?? 0) > 0)
    .slice(0, 10)
    .map(googleComparisonCampaignToPdfRow);
  const v = report.variacoes.resumo;

  return {
    kind: "google_comparison",
    cliente: report.cliente ?? `Google Ads ${report.atual.conta_id}`,
    periodo: `${report.atual.periodo} vs ${report.anterior.periodo}`,
    geradoEm: new Date().toLocaleString("pt-BR"),
    meta: {
      clientName: report.cliente ?? report.atual.conta_id,
      periodLabel: `${report.atual.periodo} vs ${report.anterior.periodo}`,
      channels: ["Google Ads"],
      sourceLabel: "Fonte: API Google Ads",
    },
    resumo: {
      gastoTotal: report.atual.resumo.gasto_total,
      leads: 0,
      conversas: 0,
      kpis: [
        {
          label: "Investimento",
          value: moneyBR(v.gasto_total.atual),
          note: `${v.gasto_total.label} vs período anterior`,
          tone: "red",
        },
        {
          label: "Conversões",
          value: intBR(v.conversoes.atual),
          note: `${v.conversoes.label} vs período anterior`,
          tone: "black",
        },
        {
          label: "CPA médio",
          value: moneyBR(v.custo_por_conversao.atual),
          note: `${v.custo_por_conversao.label} vs período anterior`,
          tone: "red",
        },
        {
          label: "CTR",
          value: pctBR(report.atual.resumo.ctr),
          note: v.ctr_label,
          tone: "black",
        },
      ],
      leituraExecutiva: report.leitura_executiva,
    },
    objetivoPrincipal: objectives[0],
    objetivos: objectives,
    campanhas: campaigns,
    serieDiaria: [
      {
        data: "Anterior",
        gasto: report.anterior.resumo.gasto_total,
        resultados: report.anterior.resumo.conversoes,
      },
      {
        data: "Atual",
        gasto: report.atual.resumo.gasto_total,
        resultados: report.atual.resumo.conversoes,
      },
    ],
    notasMetodologicas: report.notas_metodologicas,
    proximosPassos: report.oportunidades,
  };
}

export interface MetaAccountReportLike {
  periodo: string;
  totais: { gasto: number; por_categoria: Record<string, number> };
  campanhas: PdfCampaignRow[];
  mensagem: string;
}

export interface DailyPoint {
  data: string;
  gasto: number;
  resultados: number;
}

export interface IntegratedReport {
  tipo: "integrated";
  cliente: string;
  periodo: string;
  canais: {
    meta_ads?: MetaAccountReportLike;
    google_ads?: GoogleAdsEnhancedReport;
  };
  totais: {
    investimento_total: number;
    investimento_meta: number;
    investimento_google: number;
    resultados_meta_plataforma: number;
    conversoes_google: number;
  };
  leitura_executiva: string[];
  oportunidades: string[];
  notas_metodologicas: string[];
  mensagem: string;
}

export interface IntegratedComparisonReport {
  tipo: "integrated_comparison";
  cliente: string;
  atual: IntegratedReport;
  anterior: IntegratedReport;
  variacoes: {
    investimento_total: MetricComparison;
    investimento_meta: MetricComparison;
    investimento_google: MetricComparison;
    resultados_meta_plataforma: MetricComparison;
    conversoes_google: MetricComparison;
  };
  leitura_executiva: string[];
  oportunidades: string[];
  notas_metodologicas: string[];
  mensagem: string;
}

function metaPlatformResults(report?: MetaAccountReportLike): number {
  if (!report) return 0;
  return round2(
    (report.totais.por_categoria.lead_form ?? 0) +
      (report.totais.por_categoria.messages ?? 0) +
      (report.totais.por_categoria.sales ?? 0)
  );
}

function buildIntegratedMessage(report: IntegratedReport): string {
  const lines = [
    `*Check-in de performance — ${report.cliente}*`,
    `Período: ${report.periodo}`,
    "",
    `💰 *Investimento total: ${moneyBR(report.totais.investimento_total)}*`,
  ];

  const meta = report.canais.meta_ads;
  if (meta && report.totais.investimento_meta > 0) {
    const totalCliques = meta.campanhas.reduce((s, c) => s + (c.cliques ?? 0), 0);
    const totalImpressoes = meta.campanhas.reduce((s, c) => s + (c.impressoes ?? 0), 0);
    const avgCTR = totalImpressoes > 0 ? (totalCliques / totalImpressoes) * 100 : 0;
    const leadsForm = meta.totais.por_categoria["lead_form"] ?? 0;
    const conversas = meta.totais.por_categoria["messages"] ?? 0;
    const gastoLeads = meta.campanhas.filter(c => c.categoria === "lead_form").reduce((s, c) => s + c.gasto, 0);
    const gastoConv = meta.campanhas.filter(c => c.categoria === "messages").reduce((s, c) => s + c.gasto, 0);
    lines.push("", `📱 *Meta Ads — ${moneyBR(report.totais.investimento_meta)}*`);
    if (leadsForm > 0) lines.push(`- Leads: ${intBR(leadsForm)} · CPL médio: ${moneyBR(gastoLeads / leadsForm)}`);
    if (conversas > 0) lines.push(`- Conversas: ${intBR(conversas)} · Custo/conversa: ${moneyBR(gastoConv / conversas)}`);
    lines.push(`- Impressões: ${intBR(totalImpressoes)} · CTR: ${pctBR(avgCTR)}`);
  }

  const google = report.canais.google_ads;
  if (google && report.totais.investimento_google > 0) {
    lines.push("", `🔍 *Google Ads — ${moneyBR(report.totais.investimento_google)}*`);
    if (google.resumo.conversoes > 0) {
      lines.push(`- Conversões: ${intBR(google.resumo.conversoes)} · CPA: ${moneyBR(google.resumo.custo_por_conversao)}`);
    }
    lines.push(`- Cliques: ${intBR(google.resumo.cliques)} · CTR: ${pctBR(google.resumo.ctr)} · CPC: ${moneyBR(google.resumo.cpc_medio)}`);
  }

  return lines.join("\n");
}

export function buildIntegratedReport(input: {
  clientName: string;
  periodLabel: string;
  metaReport?: MetaAccountReportLike;
  googleReport?: GoogleAdsEnhancedReport;
}): IntegratedReport {
  const investimentoMeta = input.metaReport?.totais.gasto ?? 0;
  const investimentoGoogle = input.googleReport?.resumo.gasto_total ?? 0;
  const investimentoTotal = round2(investimentoMeta + investimentoGoogle);
  const resultadosMeta = metaPlatformResults(input.metaReport);
  const conversoesGoogle = input.googleReport?.resumo.conversoes ?? 0;
  const leitura: string[] = [];
  const oportunidades: string[] = [];

  if (input.metaReport && input.googleReport) {
    leitura.push(
      `Meta Ads representou ${numericShare(investimentoMeta, investimentoTotal)}% do investimento e Google Ads ${numericShare(investimentoGoogle, investimentoTotal)}%.`
    );
  }
  if (input.metaReport) {
    leitura.push(
      `Meta Ads entregou ${intBR(resultadosMeta)} resultados de plataforma em campanhas de conversão/mensagem/venda.`
    );
  }
  if (input.googleReport) {
    leitura.push(
      `Google Ads registrou ${intBR(conversoesGoogle)} conversões com CPA médio de ${moneyBR(input.googleReport.resumo.custo_por_conversao)}.`
    );
    oportunidades.push(...input.googleReport.oportunidades.slice(0, 2));
  }

  const metaNoResult = input.metaReport?.campanhas.find(
    (c) => c.gasto >= Math.max(20, investimentoMeta * 0.05) && c.resultado === 0
  );
  if (metaNoResult) {
    oportunidades.push(
      `Revisar ${metaNoResult.nome} em Meta Ads: gasto relevante sem resultado no período.`
    );
  }
  if (!oportunidades.length) {
    oportunidades.push(
      "Manter leitura separada por canal e cruzar com CRM para decidir redistribuição de verba."
    );
  }

  const base: IntegratedReport = {
    tipo: "integrated",
    cliente: input.clientName,
    periodo: input.periodLabel,
    canais: {
      meta_ads: input.metaReport,
      google_ads: input.googleReport,
    },
    totais: {
      investimento_total: investimentoTotal,
      investimento_meta: round2(investimentoMeta),
      investimento_google: round2(investimentoGoogle),
      resultados_meta_plataforma: resultadosMeta,
      conversoes_google: round2(conversoesGoogle),
    },
    leitura_executiva: leitura.length
      ? leitura
      : ["Não houve dados suficientes nos canais solicitados para leitura integrada."],
    oportunidades: oportunidades.slice(0, 4),
    notas_metodologicas: [
      "Investimento pode ser somado entre canais; resultados não devem ser somados como uma única conversão sem deduplicação ou CRM.",
      "Meta Ads usa resultados conforme objetivo da campanha; Google Ads usa conversões configuradas na conta.",
      "Relatório integrado é uma leitura de mídia. Qualidade comercial depende de CRM ou fonte externa.",
    ],
    mensagem: "",
  };

  return { ...base, mensagem: buildIntegratedMessage(base) };
}

function buildIntegratedComparisonMessage(report: IntegratedComparisonReport): string {
  const v = report.variacoes;
  const lines = [
    `*Comparativo integrado - ${report.cliente}*`,
    `Atual: ${report.atual.periodo}`,
    `Anterior: ${report.anterior.periodo}`,
    "",
    `- Investimento total: ${moneyBR(v.investimento_total.atual)} (${v.investimento_total.label})`,
    `- Meta Ads: ${moneyBR(v.investimento_meta.atual)} (${v.investimento_meta.label}) | resultados ${intBR(v.resultados_meta_plataforma.atual)} (${v.resultados_meta_plataforma.label})`,
    `- Google Ads: ${moneyBR(v.investimento_google.atual)} (${v.investimento_google.label}) | conversões ${intBR(v.conversoes_google.atual)} (${v.conversoes_google.label})`,
    "",
    "*Leitura integrada*",
    ...report.leitura_executiva.map((line) => `- ${line}`),
    "",
    "*Próximos passos*",
    ...report.oportunidades.map((line) => `- ${line}`),
  ];
  return lines.join("\n");
}

export function buildIntegratedComparisonReport(input: {
  current: IntegratedReport;
  previous: IntegratedReport;
}): IntegratedComparisonReport {
  const current = input.current;
  const previous = input.previous;
  const variacoes = {
    investimento_total: metricComparison(
      current.totais.investimento_total,
      previous.totais.investimento_total
    ),
    investimento_meta: metricComparison(
      current.totais.investimento_meta,
      previous.totais.investimento_meta
    ),
    investimento_google: metricComparison(
      current.totais.investimento_google,
      previous.totais.investimento_google
    ),
    resultados_meta_plataforma: metricComparison(
      current.totais.resultados_meta_plataforma,
      previous.totais.resultados_meta_plataforma
    ),
    conversoes_google: metricComparison(
      current.totais.conversoes_google,
      previous.totais.conversoes_google
    ),
  };

  const leitura = [
    `O investimento total ficou em ${moneyBR(variacoes.investimento_total.atual)} (${variacoes.investimento_total.label} vs período anterior).`,
    `Meta Ads entregou ${intBR(variacoes.resultados_meta_plataforma.atual)} resultados de plataforma (${variacoes.resultados_meta_plataforma.label}); Google Ads registrou ${intBR(variacoes.conversoes_google.atual)} conversões (${variacoes.conversoes_google.label}).`,
  ];

  const oportunidades: string[] = [];
  if ((variacoes.conversoes_google.variacao_percentual ?? 0) < -15) {
    oportunidades.push("Investigar queda de conversões no Google Ads antes de ampliar verba.");
  }
  if ((variacoes.resultados_meta_plataforma.variacao_percentual ?? 0) < -15) {
    oportunidades.push("Revisar campanhas Meta com queda de resultados no período atual.");
  }
  if ((variacoes.investimento_total.variacao_percentual ?? 0) > 20) {
    oportunidades.push("Conferir se o aumento de investimento veio acompanhado de ganho proporcional de resultados.");
  }
  oportunidades.push(...current.oportunidades.slice(0, 2));

  const base: IntegratedComparisonReport = {
    tipo: "integrated_comparison",
    cliente: current.cliente,
    atual: current,
    anterior: previous,
    variacoes,
    leitura_executiva: leitura,
    oportunidades: [...new Set(oportunidades)].slice(0, 4),
    notas_metodologicas: [
      "Comparativo integrado mantém resultados Meta e conversões Google separados.",
      "Variações percentuais podem distorcer quando o período anterior teve baixo volume.",
      "Deduplicação entre canais depende de CRM ou fonte externa.",
    ],
    mensagem: "",
  };

  return { ...base, mensagem: buildIntegratedComparisonMessage(base) };
}

function channelObjective(input: {
  category: string;
  label: string;
  headlineLabel: string;
  costLabel: string;
  campaigns: PdfCampaignRow[];
  result: number;
  spend: number;
}): PdfObjectiveSummary {
  const cliques = input.campaigns.reduce((s, c) => s + c.cliques, 0);
  const impressoes = input.campaigns.reduce((s, c) => s + c.impressoes, 0);
  const cpm = impressoes > 0 ? round2((input.spend / impressoes) * 1000) : 0;
  return {
    category: input.category,
    label: input.label,
    headlineLabel: input.headlineLabel,
    costLabel: input.costLabel,
    primaryMetric: "conversion",
    campaignsCount: input.campaigns.filter((c) => c.gasto > 0).length,
    gasto: round2(input.spend),
    resultado: round2(input.result),
    custo: input.result > 0 ? round2(input.spend / input.result) : 0,
    cliques,
    impressoes,
    alcance: input.campaigns.reduce((s, c) => s + c.alcance, 0),
    ctr: impressoes > 0 ? round2((cliques / impressoes) * 100) : 0,
    cpc: cliques > 0 ? round2(input.spend / cliques) : 0,
    cpm,
    frequencia: 0,
    valorConversao: 0,
    roas: 0,
  };
}

export function buildIntegratedPdfModel(input: {
  report: IntegratedReport;
  metaDaily?: DailyPoint[];
  googleDaily?: GDayData[];
}): PdfReportModel {
  const metaCampaigns =
    input.report.canais.meta_ads?.campanhas.map((c) => ({
      ...c,
      categoria: "meta_ads",
      categoriaLabel: `Meta Ads - ${c.categoriaLabel}`,
    })) ?? [];
  const googleCampaigns =
    input.report.canais.google_ads?.campanhas.map(googleCampaignToPdfRow) ?? [];
  const campaigns = bySpendDesc([...metaCampaigns, ...googleCampaigns]);
  const objectives: PdfObjectiveSummary[] = [];

  if (input.report.canais.meta_ads) {
    objectives.push(
      channelObjective({
        category: "meta_ads",
        label: "Meta Ads",
        headlineLabel: "Resultados Meta",
        costLabel: "Custo por resultado Meta",
        campaigns: metaCampaigns,
        result: input.report.totais.resultados_meta_plataforma,
        spend: input.report.totais.investimento_meta,
      })
    );
  }
  if (input.report.canais.google_ads) {
    objectives.push(googleObjective(input.report.canais.google_ads));
  }
  objectives.sort((a, b) => b.gasto - a.gasto);

  const byDay = new Map<string, { data: string; gasto: number; resultados: number }>();
  for (const day of input.metaDaily ?? []) {
    const current = byDay.get(day.data) ?? { data: day.data, gasto: 0, resultados: 0 };
    current.gasto += day.gasto;
    current.resultados += day.resultados;
    byDay.set(day.data, current);
  }
  for (const day of input.googleDaily ?? []) {
    const label = dateBR(day.data);
    const current = byDay.get(label) ?? { data: label, gasto: 0, resultados: 0 };
    current.gasto += day.gasto;
    current.resultados += day.conversoes;
    byDay.set(label, current);
  }

  return {
    kind: "integrated",
    cliente: input.report.cliente,
    periodo: input.report.periodo,
    geradoEm: new Date().toLocaleString("pt-BR"),
    meta: {
      clientName: input.report.cliente,
      periodLabel: input.report.periodo,
      channels: [
        ...(input.report.canais.meta_ads ? ["Meta Ads"] : []),
        ...(input.report.canais.google_ads ? ["Google Ads"] : []),
      ],
      sourceLabel: "Fontes: APIs Meta Ads e Google Ads",
    },
    resumo: {
      gastoTotal: input.report.totais.investimento_total,
      leads: input.report.totais.resultados_meta_plataforma,
      conversas: 0,
      kpis: [
        {
          label: "Investimento total",
          value: moneyBR(input.report.totais.investimento_total),
          note: "Soma de mídia dos canais incluídos",
          tone: "red",
        },
        {
          label: "Meta Ads",
          value: moneyBR(input.report.totais.investimento_meta),
          note: `${intBR(input.report.totais.resultados_meta_plataforma)} resultados de plataforma`,
          tone: "black",
        },
        {
          label: "Google Ads",
          value: moneyBR(input.report.totais.investimento_google),
          note: `${intBR(input.report.totais.conversoes_google)} conversões`,
          tone: "red",
        },
        {
          label: "Canais",
          value: String(objectives.length),
          note: "Resultados lidos separadamente",
          tone: "black",
        },
      ],
      leituraExecutiva: input.report.leitura_executiva,
    },
    objetivoPrincipal: objectives[0] ?? null,
    objetivos: objectives,
    campanhas: campaigns,
    serieDiaria: [...byDay.values()]
      .sort((a, b) => sortKeyFromBR(a.data).localeCompare(sortKeyFromBR(b.data)))
      .map((d) => ({
        data: d.data,
        gasto: round2(d.gasto),
        resultados: round2(d.resultados),
      })),
    notasMetodologicas: input.report.notas_metodologicas,
    proximosPassos: input.report.oportunidades,
  };
}

export function buildIntegratedComparisonPdfModel(
  report: IntegratedComparisonReport
): PdfReportModel {
  const currentMetaCampaigns =
    report.atual.canais.meta_ads?.campanhas.map((c) => ({
      ...c,
      categoria: "meta_ads",
      categoriaLabel: `Meta atual - ${c.categoriaLabel}`,
    })) ?? [];
  const currentGoogleCampaigns =
    report.atual.canais.google_ads?.campanhas.map(googleCampaignToPdfRow) ?? [];
  const campaigns = bySpendDesc([...currentMetaCampaigns, ...currentGoogleCampaigns]).slice(0, 10);

  const objectives: PdfObjectiveSummary[] = [];
  if (report.atual.canais.meta_ads) {
    objectives.push(
      channelObjective({
        category: "meta_current",
        label: "Meta Ads atual",
        headlineLabel: "Resultados Meta",
        costLabel: "Custo por resultado Meta",
        campaigns: currentMetaCampaigns,
        result: report.atual.totais.resultados_meta_plataforma,
        spend: report.atual.totais.investimento_meta,
      })
    );
  }
  if (report.anterior.canais.meta_ads) {
    const previousMetaCampaigns = report.anterior.canais.meta_ads.campanhas;
    objectives.push(
      channelObjective({
        category: "meta_previous",
        label: "Meta Ads anterior",
        headlineLabel: "Resultados Meta",
        costLabel: "Custo por resultado Meta",
        campaigns: previousMetaCampaigns,
        result: report.anterior.totais.resultados_meta_plataforma,
        spend: report.anterior.totais.investimento_meta,
      })
    );
  }
  if (report.atual.canais.google_ads) {
    objectives.push({
      ...googleObjective(report.atual.canais.google_ads),
      category: "google_current",
      label: "Google Ads atual",
    });
  }
  if (report.anterior.canais.google_ads) {
    objectives.push({
      ...googleObjective(report.anterior.canais.google_ads),
      category: "google_previous",
      label: "Google Ads anterior",
    });
  }

  const v = report.variacoes;
  return {
    kind: "integrated_comparison",
    cliente: report.cliente,
    periodo: `${report.atual.periodo} vs ${report.anterior.periodo}`,
    geradoEm: new Date().toLocaleString("pt-BR"),
    meta: {
      clientName: report.cliente,
      periodLabel: `${report.atual.periodo} vs ${report.anterior.periodo}`,
      channels: ["Meta Ads", "Google Ads"],
      sourceLabel: "Fontes: APIs Meta Ads e Google Ads",
    },
    resumo: {
      gastoTotal: report.atual.totais.investimento_total,
      leads: report.atual.totais.resultados_meta_plataforma,
      conversas: 0,
      kpis: [
        {
          label: "Investimento total",
          value: moneyBR(v.investimento_total.atual),
          note: `${v.investimento_total.label} vs anterior`,
          tone: "red",
        },
        {
          label: "Resultados Meta",
          value: intBR(v.resultados_meta_plataforma.atual),
          note: `${v.resultados_meta_plataforma.label} vs anterior`,
          tone: "black",
        },
        {
          label: "Conversões Google",
          value: intBR(v.conversoes_google.atual),
          note: `${v.conversoes_google.label} vs anterior`,
          tone: "red",
        },
        {
          label: "Canais",
          value: "2",
          note: "Resultados não deduplicados",
          tone: "black",
        },
      ],
      leituraExecutiva: report.leitura_executiva,
    },
    objetivoPrincipal: objectives[0] ?? null,
    objetivos: objectives,
    campanhas: campaigns,
    serieDiaria: [
      {
        data: "Anterior",
        gasto: report.anterior.totais.investimento_total,
        resultados:
          report.anterior.totais.resultados_meta_plataforma +
          report.anterior.totais.conversoes_google,
      },
      {
        data: "Atual",
        gasto: report.atual.totais.investimento_total,
        resultados:
          report.atual.totais.resultados_meta_plataforma +
          report.atual.totais.conversoes_google,
      },
    ],
    notasMetodologicas: report.notas_metodologicas,
    proximosPassos: report.oportunidades,
  };
}
