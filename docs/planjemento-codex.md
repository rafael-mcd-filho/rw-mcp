# Planejamento Codex - upgrade de inteligencia do RW MCP

Documento revisado apos leitura do `planejamento-claude.md`, da pasta `ratos`
e da estrutura atual do `rw-mcp`.

Data: 2026-06-19.

## Decisao principal

Vamos prosseguir com uma camada de inteligencia para o `rw-mcp`, mas sem criar
dependencia de CPA manual, metas numericas por cliente ou historico/aprendizados
nesta fase.

O caminho viavel agora e:

- usar o que ja temos de Meta Ads, Google Ads, relatorios, comparativos e PDF;
- adicionar um campo opcional `contexto_cliente` no webhook;
- derivar nicho e contexto desse texto;
- usar benchmarks brasileiros estruturados;
- adaptar quality gates para regras que funcionam sem CPA alvo;
- criar health score parcial e honesto;
- criar modos novos de diagnostico e auditoria;
- manter PDF como entrega principal;
- adicionar HTML como formato opcional depois.

## O que o planejamento-claude trouxe de melhor

O `planejamento-claude.md` acertou em quatro ajustes importantes ao plano
original:

1. **CPA manual nao e bloqueador.**
   A unica regra inviavel e "CPA maior que 3x a meta do cliente", porque essa
   meta nao existe de forma confiavel. O resto ainda funciona com dados da conta:
   gasto sem conversao, frequencia alta, CTR abaixo do benchmark, keywords/termos
   caros sem conversao, Quality Score baixo e impression share baixo.

2. **Contexto livre e melhor que metas estruturadas agora.**
   Em vez de pedir `cpa_alvo`, `roas_alvo`, `ticket_medio` e `margem`, vamos pedir
   apenas `contexto_cliente`, um texto livre vindo do webhook.

3. **Health score precisa ser parcial e honesto.**
   Checks que ainda nao temos dados suficientes para calcular nao devem derrubar
   nem inflar nota. Eles entram como `DADOS_INSUFICIENTES`.

4. **Historico/aprendizados ficam adiados.**
   A ideia e boa, mas nao e prioridade agora. O foco desta fase e analise,
   priorizacao e entrega.

## Estado atual do projeto

O `rw-mcp` ja tem a base mais dificil:

- Meta Ads:
  - contas, campanhas, conjuntos e anuncios;
  - insights em nivel de conta/campanha/adset/ad;
  - breakdowns;
  - action breakdowns;
  - janelas de atribuicao;
  - filtros e sort;
  - frequencia;
  - cost_per_action_type;
  - action_values;
  - purchase_roas;
  - rankings;
  - metricas de video.

- Pixel / dataset:
  - listagem de pixels;
  - detalhes;
  - eventos por periodo;
  - diagnostico de saude.

- Google Ads:
  - contas;
  - campanhas;
  - keywords;
  - termos de pesquisa;
  - grupos de anuncios;
  - serie diaria;
  - horario;
  - Keyword Planner;
  - relatorio executivo;
  - comparativo de periodo.

- Integrado Meta + Google:
  - resolve cliente por nome;
  - junta Meta e Google quando os dois IDs existem;
  - mantem resultados separados por canal;
  - gera relatorio integrado;
  - gera comparativo integrado.

- PDF:
  - A4 paginado;
  - componentes reutilizaveis;
  - validacao de overflow;
  - previa local;
  - Vercel Blob quando configurado;
  - QA visual opcional.

O que falta nao e coleta basica. Falta a camada que transforma metricas em:

- classificacao;
- alerta;
- prioridade;
- recomendacao;
- health score;
- diagnostico;
- auditoria.

## Campo novo no webhook

Adicionar ao retorno do webhook n8n:

```ts
interface ClientRecord {
  nome_cliente: string;
  id_conta_meta_ads: string;
  id_conta_google: string;
  id_grupo_cliente: string;
  contexto_cliente?: string;
}
```

Exemplos de `contexto_cliente`:

```text
Franqueadora de food service. Busca investidores para abrir franquias. Ticket alto e ciclo de decisao consultivo.
```

```text
Clinica de estetica local. Foco em agendamentos pelo WhatsApp e campanhas de procedimento facial.
```

```text
E-commerce de moda feminina. Foco em venda direta no site e remarketing.
```

O campo destrava:

- identificacao aproximada do nicho;
- escolha de benchmark mais adequado;
- leitura mais inteligente em relatorios;
- contexto para explicar por que um CPL/CPA aparentemente alto pode ser normal
  em negocios de ticket alto;
- linguagem mais alinhada ao cliente.

O campo nao precisa ser perfeito. O sistema deve mostrar o nicho inferido na
saida para correcao manual quando necessario.

## Normalizacao de nicho

Criar `src/intelligence/niche.ts`.

Entrada:

```ts
normalizeNiche(contexto_cliente?: string): {
  niche: BenchmarkNiche;
  confidence: "alta" | "media" | "baixa";
  evidence: string[];
}
```

Baldes iniciais:

- `alimentacao_delivery`;
- `franquias`;
- `saude_estetica`;
- `servicos_locais`;
- `imoveis`;
- `educacao`;
- `infoprodutos`;
- `ecommerce_moda`;
- `ecommerce_tech`;
- `saas_b2b`;
- `financeiro`;
- `geral`.

Regra:

- se reconhecer o nicho, usa benchmark especifico;
- se nao reconhecer, usa benchmark geral;
- sempre exibe o nicho usado.

## CPA sem meta manual

Nao vamos usar `cpa_alvo` nesta fase.

Substituicoes viaveis:

1. **CPA de referencia da conta**
   - calcular mediana ou media ponderada das campanhas que converteram;
   - comparar campanhas fora da curva contra esse valor;
   - rotulo honesto: "vs CPA medio da conta", nao "vs meta".

2. **Gasto sem conversao**
   - campanha gastou percentual relevante da verba e teve zero conversoes;
   - nao precisa de meta manual.

3. **CPA/CPA Google por benchmark geral**
   - usar faixas de mercado quando fizer sentido;
   - com cautela, sem tratar como meta rigida.

4. **Custo por resultado por objetivo**
   - para Meta, respeitar categoria: lead, mensagem, venda, perfil, awareness;
   - para Google, conversao configurada na conta.

Conclusao: conseguimos implementar diagnostico, auditoria, health score e gates
sem pedir CPA alvo para cada cliente.

## Quality gates viaveis agora

Criar `src/intelligence/quality-gates.ts`.

Gates v1:

| Gate | Canal | Severidade | Funciona sem CPA alvo? |
|---|---|---:|---|
| Gasto sem conversao | Meta/Google | CRITICO | sim |
| CPA fora da curva vs conta | Meta/Google | ALTO | sim |
| CTR abaixo do benchmark | Meta/Google | ALTO | sim |
| Frequencia alta | Meta | ALTO/CRITICO | sim |
| Termo caro sem conversao | Google | ALTO | sim |
| Keyword cara sem conversao | Google | ALTO | sim |
| Quality Score baixo | Google | ALTO | sim |
| Impression share baixo | Google | MEDIO | sim |
| Campanha ativa sem impressoes | Meta/Google | MEDIO | sim |
| Pixel sem evento recente | Meta | ALTO/CRITICO | sim, quando pixel existir |

Gates adiados:

- 3x CPA alvo do cliente;
- ROAS vs ponto de equilibrio;
- qualidade comercial de lead;
- deduplicacao real pixel/CAPI se a API nao retornar dados suficientes;
- learning phase detalhada;
- RSA strength;
- criativo vencedor por asset.

Contrato dos alertas:

```ts
interface Alert {
  id: string;
  title: string;
  severity: "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";
  status: "FAIL" | "ATENCAO" | "PASS" | "DADOS_INSUFICIENTES";
  channel: "meta" | "google" | "integrated";
  category: string;
  entityName?: string;
  evidence: string;
  recommendation: string;
  impactEstimate?: number;
}
```

Alertas devem sempre ter numero especifico. Nada de recomendacao vaga.

## Benchmarks

Criar `src/intelligence/benchmarks.ts`.

Fonte inicial:

- `ratos/ads-ratos-main/references/benchmarks-br.md`;
- ajustes conservadores para o que conseguimos medir hoje.

Metricas v1:

- Meta:
  - CTR;
  - CPC;
  - CPM;
  - CPL/CPA de plataforma;
  - frequencia;
  - ROAS quando existir;
  - ranking de qualidade quando existir.

- Google:
  - CTR Search;
  - CPC;
  - CPA/CPL;
  - taxa de conversao;
  - Quality Score;
  - Search Impression Share;
  - termos/keywords sem conversao.

Tipos:

```ts
type PerformanceLevel = "EXCELENTE" | "BOM" | "ATENCAO" | "CRITICO";

interface BenchmarkResult {
  level: PerformanceLevel;
  label: string;
  reference: string;
  rationale: string;
}
```

Regra importante:

- metrica ruim isolada nao deve gerar alerta grave;
- alerta grave exige combinacao com resultado ruim, piora de negocio ou falha
  tecnica evidente.

## Health score

Criar `src/intelligence/health-score.ts`.

Score:

```text
score = pontos_obtidos / pontos_possiveis * 100
```

Pesos:

- CRITICO: 5.0;
- ALTO: 3.0;
- MEDIO: 1.5;
- BAIXO: 0.5.

Status:

- PASS: 100%;
- ATENCAO: 50%;
- FAIL: 0%;
- DADOS_INSUFICIENTES: nao entra no denominador.

Notas:

- 90-100: A;
- 75-89: B;
- 60-74: C;
- 40-59: D;
- abaixo de 40: F.

V1 deve ser honesta:

- calcula so o que temos dados;
- lista checks sem dados como `DADOS_INSUFICIENTES`;
- nao promete auditoria tecnica completa quando ainda nao temos API suficiente.

## Modos de trabalho

### Relatorio

Ja existe.

Melhorias:

- benchmark nos KPIs principais;
- 3 a 5 proximos passos priorizados;
- health score resumido;
- bloco de alertas prioritarios;
- manter linguagem executiva.

Nao deve virar auditoria.

### Diagnostico

Nova tool:

- `get_client_diagnosis`

Pergunta que responde:

```text
O que precisa da minha atencao agora?
```

Saida:

- cliente;
- periodo;
- contexto/nicho inferido;
- health score;
- top alertas;
- desperdicio estimado;
- principais oportunidades;
- mensagem pronta.

Profundidade:

- rapida;
- objetiva;
- ideal para rotina diaria/semanal.

### Auditoria

Nova tool:

- `get_client_audit`

Pergunta que responde:

```text
A conta esta saudavel? Onde estamos perdendo dinheiro?
```

Saida:

- checks completos;
- health score por canal;
- benchmarks;
- tracking/pixel quando possivel;
- Meta por campanhas/adsets/breakdowns quando util;
- Google por campanhas/keywords/search terms;
- plano de acao priorizado.

Profundidade:

- mais chamadas;
- mais detalhe;
- uso mensal ou pre-reuniao.

### HTML

Nova tool futura:

- `generate_client_dashboard_html`

Usar o mesmo modelo de dados do PDF/relatorio.

PDF continua a entrega principal.
HTML vira revisao interna/navegavel.

## Estrutura sugerida

```text
src/
  intelligence/
    types.ts
    niche.ts
    benchmarks.ts
    alerts.ts
    quality-gates.ts
    health-score.ts
    diagnosis.ts
    audit.ts
  view-model.ts
  html-components.ts
  html-template.ts
  server-tools/
    meta-tools.ts
    google-tools.ts
    integrated-tools.ts
    intelligence-tools.ts
```

Objetivo:

- nao empilhar mais codigo em `server.ts`;
- manter coleta separada de inteligencia;
- manter PDF/HTML sem regra de negocio duplicada.

## Roadmap revisado

### Fase 0 - Limpeza antes de crescer

Tarefas:

- limitar `limit_keywords`, `limit_search_terms` e similares;
- alinhar descricoes de defaults;
- reduzir ambiguidade de `account_id`;
- extrair tools Google/integradas de `server.ts`;
- manter build passando.

Aceite:

- nenhuma tool atual quebra;
- schemas e docs ficam coerentes;
- `server.ts` fica mais sustentavel.

### Fase 1 - Contexto do cliente

Tarefas:

- adicionar `contexto_cliente` em `ClientRecord`;
- atualizar docs do webhook;
- criar `niche.ts`;
- mostrar nicho inferido na saida.

Insumo necessario do usuario:

- apenas adicionar um campo texto no n8n/webhook.

Aceite:

- se vier contexto, o MCP infere nicho;
- se nao vier, usa `geral`;
- relatorio/diagnostico mostram qual nicho foi usado.

### Fase 2 - Benchmarks estruturados

Tarefas:

- criar `benchmarks.ts`;
- converter benchmarks do `ratos`;
- implementar `classifyMetric`;
- aplicar em Meta, Google e integrado;
- considerar sazonalidade de forma conservadora.

Aceite:

- KPIs retornam nivel e justificativa;
- alertas nao nascem de metrica isolada sem contexto;
- relatorio fica mais preciso sem ficar tecnico demais.

### Fase 3 - Quality gates + health score

Tarefas:

- criar contrato de alerta;
- implementar gates viaveis sem CPA alvo;
- calcular desperdicio estimado;
- criar health score parcial;
- listar checks insuficientes.

Aceite:

- score e grade aparecem;
- alertas tem evidencia numerica;
- gates dependentes de dados ausentes nao sao fingidos.

### Fase 4 - Diagnostico rapido

Tarefas:

- criar `get_client_diagnosis`;
- usar periodo atual e comparativo quando informado;
- retornar top alertas e mensagem pronta;
- priorizar por severidade e impacto.

Aceite:

- responde em formato curto;
- mostra o que fazer primeiro;
- funciona com Meta, Google ou integrado.

### Fase 5 - Auditoria nucleo

Tarefas:

- criar `get_client_audit`;
- buscar dados extras de Meta/Google;
- incluir pixel quando houver;
- incluir keywords/search terms;
- incluir breakdowns principais;
- separar checks por categoria.

Aceite:

- retorna leitura profunda;
- diferencia dados reais de dados insuficientes;
- gera plano de acao priorizado.

### Fase 6 - Relatorio com inteligencia

Tarefas:

- adicionar health score resumido;
- adicionar benchmarks nos KPIs;
- adicionar alertas prioritarios;
- preservar PDF executivo.

Aceite:

- PDF continua limpo;
- cliente entende o resultado;
- gestor enxerga prioridade.

### Fase 7 - HTML opcional

Tarefas:

- criar template HTML com marca Plugue;
- usar mesmo modelo de dados;
- incluir tabelas maiores;
- incluir alertas e score;
- salvar local ou publicar quando houver storage.

Aceite:

- HTML abre localmente;
- nao depende de CDN obrigatoria;
- nao duplica regra de negocio.

## O que fica fora agora

Fora do escopo desta etapa:

- metas numericas por cliente;
- historico/aprendizados;
- edicao/criacao/pausa de campanhas;
- alteracao de orcamento;
- upload de criativo;
- scripts Python do `ratos`;
- GA4 antes de amadurecer Meta/Google;
- kill rule literal de 3x CPA alvo.

## Com o que conseguimos prosseguir

Podemos prosseguir com:

1. Fase 0 imediatamente, sem depender de n8n.
2. Fase 1 assim que o webhook puder trazer `contexto_cliente`.
3. Fases 2 e 3 mesmo sem contexto, usando benchmark geral.
4. Diagnostico e auditoria com dados atuais.
5. PDF mais inteligente depois que alertas e score estiverem estaveis.

O unico insumo novo recomendado e `contexto_cliente`.
Todo o resto pode ser derivado dos dados que o MCP ja coleta.

## Impacto no uso

Antes:

```text
Gera relatorio dos ultimos 30 dias.
```

Depois:

```text
Faz diagnostico do cliente X nos ultimos 7 dias.
```

```text
Faz auditoria mensal do cliente X com Meta e Google.
```

```text
Gera PDF integrado com health score e principais alertas.
```

Na pratica:

- menos tempo interpretando numero bruto;
- mais clareza do que precisa de atencao;
- alertas com evidencia numerica;
- benchmark por nicho quando houver contexto;
- menos dependencia de memoria manual;
- relatorios mais fortes;
- auditorias mais consistentes.

## Revisao final

O plano revisado e melhor que o plano inicial porque remove dependencias
operacionais dificeis:

- nao exige CPA alvo;
- nao exige metas numericas;
- nao exige historico;
- nao exige contexto perfeito;
- nao copia a arquitetura do `ratos`.

O upgrade agora fica pragmatico:

- contexto livre opcional;
- benchmarks;
- gates viaveis;
- health score honesto;
- diagnostico;
- auditoria;
- PDF/HTML a partir do mesmo modelo.

Essa e a rota mais segura para transformar o MCP em uma ferramenta real de
gestao de trafego, sem criar um sistema pesado demais antes de validar o ganho
no dia a dia.
