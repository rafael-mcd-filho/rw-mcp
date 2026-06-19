# Planejamento Claude — Upgrade de inteligência do rw-mcp (versão final)

> Plano definitivo, consolidado depois de três rodadas de análise da pasta
> `ratos`, do `planjemento-codex.md` e das restrições reais do gestor.
> Documento-irmão do `planjemento-codex.md` — os dois convergem; este é o que
> guia a implementação.

Data: 2026-06-19.

---

## 1. Em uma frase

Transformar o `rw-mcp` de **gerador de relatório** em **assistente de gestão de
tráfego**: além do relatório que já entrega, ganhar **diagnóstico rápido** e
**auditoria profunda**, com métricas classificadas por **benchmark brasileiro
por nicho**, alertas com evidência numérica e impacto em R$, e saída em **PDF
(entrega) ou HTML (análise)** — tudo **sem exigir meta de CPA** por cliente.

## 2. Princípio

O `ratos` é uma *skill* (prompts + Python + referências que o modelo lê). O
`rw-mcp` é **código TypeScript determinístico**, que roda inclusive sem o modelo
(automação n8n → WhatsApp). Por isso **não copiamos o ratos, traduzimos**: o que
nele é instrução pro modelo vira **código** (pra automação funcionar sozinha). A
inteligência mora numa pasta nova `src/intelligence/`, separada da coleta. PDF
continua a entrega principal; HTML é opção a partir do **mesmo modelo de dados**.

## 3. Estado atual (resumo)

Já temos: APIs Meta e Google, base de clientes (n8n), relatório por
campanha/conta, relatório executivo Google, comparativo de período, relatório e
comparativo **integrado** Meta+Google, série diária, mensagem de WhatsApp e PDF
A4 (local + Vercel Blob). Falta a camada que vira **classificação → alerta →
prioridade → recomendação → health score → diagnóstico → auditoria**.

---

## 4. A questão do CPA — resolvida (não bloqueia nada)

O gestor não fornece/mantém meta de CPA. Isso **não** impede a inteligência. Das
4 kill rules, só "3x a meta" precisa de meta manual; as outras funcionam:

| Kill rule | Depende de | Veredito |
|---|---|---|
| Frequência tóxica (Meta) | frequência (já temos) | ✅ funciona |
| Gasto sem nenhuma conversão | gasto + conversões | ✅ funciona |
| CTR morto | benchmark do **nicho** | ✅ com o campo de contexto |
| "3x a meta de CPA" | meta manual | ⛔ substituída |

**Substituições viáveis do CPA-alvo:**
1. **CPA de referência da conta** — mediana/média ponderada das campanhas que
   convertem; campanhas fora da curva são comparadas com esse valor. Rótulo
   honesto: "vs CPA médio da conta", nunca "vs meta".
2. **Gasto sem conversão** — campanha gastou parcela relevante e teve 0 conversões.
3. **Benchmark do nicho** — faixas de mercado, com cautela, sem tratar como meta.
4. **Custo por resultado por objetivo** — respeita a categoria já detectada no
   Meta (lead / mensagem / venda / perfil / awareness) e a conversão configurada
   no Google. (Reusa `objectives.ts`.)

## 5. Campo de contexto do cliente (único insumo novo)

Um campo novo no webhook n8n — `contexto_cliente` (texto livre): nicho + uma
frase sobre a empresa.

```ts
interface ClientRecord {
  nome_cliente: string;
  id_conta_meta_ads: string;
  id_conta_google: string;
  id_grupo_cliente: string;
  contexto_cliente?: string; // novo, opcional
}
```

Exemplos:
- *"Franqueadora de food service. Busca investidores para abrir franquias. Ticket alto, decisão consultiva."*
- *"Clínica de estética local. Foco em agendamento por WhatsApp."*
- *"E-commerce de moda feminina. Venda direta no site + remarketing."*

Destrava: nicho aproximado → benchmark do segmento; leitura mais inteligente;
explica por que um CPL alto pode ser normal em ticket alto. **Não** entram
campos numéricos (`cpa_alvo`, `roas_alvo`, `ticket`, `margem`) — cortados.

### Normalização de nicho — `src/intelligence/niche.ts`

```ts
normalizeNiche(contexto_cliente?: string): {
  niche: BenchmarkNiche;            // balde
  confidence: "alta" | "media" | "baixa";
  evidence: string[];               // palavras que levaram ao balde
}
```

Baldes: `alimentacao_delivery`, `franquias`, `saude_estetica`,
`servicos_locais`, `imoveis`, `educacao`, `infoprodutos`, `ecommerce_moda`,
`ecommerce_tech`, `saas_b2b`, `financeiro`, `geral` (fallback).

Regra: reconheceu → benchmark específico; não reconheceu → `geral`; **sempre
mostra o nicho usado** na saída, para correção num toque.

---

## 6. Benchmarks — `src/intelligence/benchmarks.ts`

Converter `ratos/.../benchmarks-br.md` em regras tipadas.

```ts
type PerformanceLevel = "EXCELENTE" | "BOM" | "ATENCAO" | "CRITICO";

interface BenchmarkResult {
  level: PerformanceLevel;
  label: string;       // "CPC médio"
  reference: string;   // "benchmark alimentação: R$0,60–1,80"
  rationale: string;   // por que caiu nesse nível
}

function classifyMetric(metric, value, ctx): BenchmarkResult
```

Aplica em CTR, CPC, CPM, CPL/CPA, ROAS, frequência, taxa de conversão, Quality
Score e impression share, considerando **plataforma + objetivo + nicho +
sazonalidade**. Gera badge no PDF/HTML, alimenta o health score e justifica
alertas com número.

**Regra de ouro (mantida do ratos):** métrica ruim isolada não é campanha ruim.
Alerta grave só quando combina com piora de negócio ou é falha técnica evidente.

Sazonalidade BR (`seasonalityFactor(mês)`) suaviza alerta de custo em pico
(junho, novembro/Black Friday). Markdown = doc canônico; tabela em código
revisada a cada ~3 meses.

## 7. Quality Gates — `src/intelligence/quality-gates.ts`

Gates v1 (todos funcionam sem CPA alvo):

| Gate | Canal | Severidade |
|---|---|---|
| Gasto sem conversão | Meta/Google | CRÍTICO |
| CPA fora da curva (vs CPA médio da conta) | Meta/Google | ALTO |
| CTR abaixo do benchmark do nicho | Meta/Google | ALTO |
| Frequência alta | Meta | ALTO/CRÍTICO |
| Termo/keyword caro sem conversão | Google | ALTO |
| Quality Score baixo (< 4) | Google | ALTO |
| Impression share baixo (< 20%) | Google | MÉDIO |
| Campanha ativa sem impressões | Meta/Google | MÉDIO |
| Pixel sem evento recente | Meta | ALTO/CRÍTICO (se houver pixel) |

Adiados (precisam de dados/decisão futura): 3x CPA alvo, ROAS vs equilíbrio,
qualidade comercial do lead, dedup pixel/CAPI real, learning phase, RSA
strength, criativo vencedor por asset.

### Contrato de alerta — `src/intelligence/alerts.ts`

```ts
interface Alert {
  id: string;
  title: string;
  severity: "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";
  status: "FAIL" | "ATENCAO" | "PASS" | "DADOS_INSUFICIENTES";
  channel: "meta" | "google" | "integrated";
  category: string;
  entityName?: string;       // campanha/keyword/termo
  evidence: string;          // número específico, sempre
  recommendation: string;    // ação concreta
  impactEstimate?: number;   // R$ quando aplicável
}
```

Alertas sempre com número. Priorizados por impacto financeiro (maior economia
primeiro). Hierarquia de leitura: tracking quebrado → gasto sem conversão → CPA
fora da curva → piora vs período anterior → desperdício em termos → frequência →
CTR/CPC/CPM fora do benchmark → oportunidade de escala.

## 8. Health Score — `src/intelligence/health-score.ts`

```
score = pontos_obtidos / pontos_possiveis * 100
severidade: CRITICO 5.0 | ALTO 3.0 | MEDIO 1.5 | BAIXO 0.5
status: PASS 100% | ATENCAO 50% | FAIL 0% | DADOS_INSUFICIENTES = fora do denominador
nota: 90-100 A | 75-89 B | 60-74 C | 40-59 D | <40 F
```

**Honestidade mecânica:** checks sem dados (`DADOS_INSUFICIENTES`) não contam
nem a favor nem contra — saem do denominador e aparecem listados. A nota nunca é
inflada por checks que não conseguimos medir ainda.

## 9. Modos de trabalho

| Modo | Pergunta | Tool | Profundidade | Cadência |
|---|---|---|---|---|
| **Relatório** (existe, ganha inteligência) | Como foi o período? | `get_*_report` + `generate_*_pdf` | executivo | entrega ao cliente |
| **Diagnóstico** (novo) | O que precisa da minha atenção agora? | `get_client_diagnosis` | rápido | diário/semanal |
| **Auditoria** (novo) | A conta está saudável? Onde perco dinheiro? | `get_client_audit` | profundo | mensal/pré-reunião |
| **Dashboard HTML** (novo) | Quero navegar/explorar | `generate_client_dashboard_html` | navegável | revisão interna |

## 10. Estrutura de arquivos

```text
src/
  intelligence/
    types.ts
    niche.ts            # normalizeNiche (confidence + evidence)
    benchmarks.ts       # classifyMetric + sazonalidade
    alerts.ts           # contrato + priorização
    quality-gates.ts    # gates viáveis sem CPA alvo
    health-score.ts     # score parcial honesto
    diagnosis.ts        # monta o diagnóstico
    audit.ts            # monta a auditoria (núcleo)
  view-model.ts         # ReportViewModel compartilhado PDF/HTML
  html-components.ts
  html-template.ts      # dashboard HTML, marca Plugue
  server-tools/
    meta-tools.ts
    google-tools.ts
    integrated-tools.ts
    intelligence-tools.ts
  report.ts · google-report.ts · format.ts · clients-db.ts  # já existem
  server.ts             # fino, só registra os server-tools
```

## 11. Roadmap (0 → 7)

| Fase | Entrega | Insumo do gestor | Aceite |
|---|---|---|---|
| **0** | Limpeza: bound nos limits; padronizar `google_customer_id`; quebrar `server.ts` em `server-tools/` | nenhum | build passa; nenhuma tool atual quebra |
| **1** | `contexto_cliente` no webhook + `niche.ts` | add 1 campo no n8n | infere nicho; sem contexto usa `geral`; nicho visível |
| **2** | `benchmarks.ts` + `classifyMetric` plugado em todos os relatórios + sazonalidade | — | KPIs com nível + justificativa numérica |
| **3** | `alerts.ts` + `quality-gates.ts` + `health-score.ts` + desperdício R$ | — | score + nota; alertas com evidência; checks sem dado marcados |
| **4** | Modo **Diagnóstico** (`get_client_diagnosis`) | — | responde "o que precisa de atenção?" curto e acionável |
| **5** | Modo **Auditoria** núcleo (`get_client_audit`) | — | leitura profunda; separa real de insuficiente; plano de ação |
| **6** | **Relatório com inteligência** (badges + score + alertas no PDF atual) | — | PDF continua executivo; QA passa |
| **7** | **HTML opcional** (`formato: html`) | — | abre local; sem CDN obrigatória; mesmo modelo |
| adiado | checks profundos (novas APIs) · metas · histórico/aprendizados | decisão futura | — |

Da Fase 0 à 7, **nenhum dado que o gestor não consiga fornecer** é necessário.
Fases 2–3 rodam mesmo sem contexto (régua geral). O único insumo novo é
`contexto_cliente`.

## 12. Como usar no dia a dia

**Não há comandos com barra para digitar.** O `rw-mcp` é um MCP: você fala em
português natural e o Claude escolhe a tool certa. Os "modos" estão nos nomes das
tools e são disparados pela sua frase ("diagnóstico", "auditoria", "relatório",
"dashboard"). Se um dia quiser a ergonomia de `/diagnostico` literal, dá pra
adicionar uma skill fina por cima — mas não é necessário, e a automação n8n usa
as mesmas tools sem precisar disso.

| Você diz | Roda | Volta |
|---|---|---|
| "Faz um diagnóstico do Beco Mágico Brasil dos últimos 7 dias" | `get_client_diagnosis` | Health Score + top alertas + desperdício + mensagem pronta |
| "Como tá o Batista essa semana vs a passada?" | `get_client_diagnosis` (com comparativo) | score + deltas + o que piorou |
| "Faz a auditoria mensal do cliente X com Meta e Google" | `get_client_audit` | checks por categoria + desperdício R$ + plano priorizado |
| "Gera o relatório integrado em PDF do cliente X (30 dias)" | relatório + PDF (com score/badges) | PDF executivo + mensagem |
| "Me dá um dashboard HTML do cliente X pra revisar antes da reunião" | `generate_client_dashboard_html` | link/arquivo navegável |

### Exemplos de saída

Diagnóstico (mensagem curta):
```
🩺 Diagnóstico — Beco Mágico Brasil · Google Ads · últimos 7 dias
Health Score: 68/100 (C)  · nicho: franquias

🔴 R$ 81 na campanha CONCORRENTES sem 1 conversão (CPA da conta: R$54)
🟡 CTR 5,9% = BOM p/ franquias, mas keyword "franquia de alimentação"
   gastou R$74 e 0 conversão → avaliar negativar
🔵 "abrir um negócio" puxando CPA R$26 (melhor da conta) → proteger verba

Desperdício estimado: ~R$ 155/semana
```

Auditoria (estrutura): resumo executivo → kill rules no topo → KPIs
classificados vs benchmark → checks por categoria com PASS/ATENÇÃO/FAIL →
desperdício total em R$ → plano de ação (urgente/semana/mês).

## 13. Impacto na rotina

- Hoje o relatório diz **o que aconteceu**. A partir da Fase 2 diz **se está bom
  ou ruim** sem você decorar a régua de cada nicho.
- Fases 4–5 dão um **check diário de 30s** (score + alertas) e uma **auditoria
  mensal** que já chega com "R$X de desperdício e o que pausar".
- Com 60+ clientes, é o que permite entregar análise de qualidade sênior em todos
  sem virar gargalo manual. O MCP deixa de ser prestação de contas e vira
  consultoria.

## 14. Fora do escopo agora

Metas numéricas por cliente; histórico/aprendizados; criar/editar/pausar/duplicar
campanha; mexer em orçamento; upload de criativo; scripts Python do ratos; GA4
antes de Meta/Google amadurecerem; kill rule literal de 3x CPA alvo.

## 15. Revisão final

- O plano se sustenta: aproveita o mais valioso do rw-mcp (coleta real,
  relatórios, PDF, integrado) e usa o ratos só como **referência de produto**.
- A restrição de CPA **não** bloqueia: nicho (contexto) + CPA derivado da conta
  cobrem o que a meta manual daria.
- Honestidade preservada: Health Score parcial com `DADOS_INSUFICIENTES` fora do
  denominador; benchmarks em 2 lugares (revisar a cada 3 meses); normalizador de
  nicho pode errar (mitigado: nicho visível e sobrescrevível).
- Ordem segura: **Fase 0 primeiro** (invisível ao cliente, derruba risco), nunca
  empilhar inteligência no `server.ts` atual sem quebrá-lo antes.
- Convergência com o Codex: os dois planos chegaram ao mesmo desenho por caminhos
  independentes — bom sinal de que a rota é sólida.

Essa é a rota final: contexto livre opcional, benchmarks, gates viáveis, health
score honesto, diagnóstico, auditoria e PDF/HTML do mesmo modelo. Entrega valor
cedo e não vira um sistema pesado demais antes de provar o ganho na rotina.
