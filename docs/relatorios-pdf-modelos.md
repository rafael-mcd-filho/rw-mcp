# Relatorios PDF - base visual e arquitetura de modelos

## Escopo

Esta analise considera somente:

- `Modelo-Referencia/base-relatorio-MD.md`
- `Modelo-Referencia/referencia-HTML.html`
- `Modelo-Referencia/gerador-pdf-padrao-JS.js`
- `Modelo-Referencia/Logo Lima Soares & CO - Vermelho.png`
- o gerador atual do projeto `rw-mcp`

A pasta `meta-ads-ratos-main` fica fora desta decisao por enquanto.

## O que deve ser trazido do modelo de referencia

### 1. Folha A4 fixa por pagina

O maior acerto do modelo e tratar cada pagina como uma folha A4 real:

- `@page { size: A4; margin: 0; }`
- `.page` com `width: 210mm`, `height: 297mm` e padding interno fixo
- `break-after: page` e `page-break-after: always`
- `overflow: hidden`
- `preferCSSPageSize: true` no gerador

Isso da previsibilidade de quebra de pagina. O navegador nao decide sozinho onde quebrar uma tabela ou um bloco.

### 2. Sistema visual consistente

Manter como padrao:

- barra superior vermelho/preto em todas as paginas
- fundo externo cinza claro e folha branca
- logo e identidade no cabecalho
- periodo/cliente/canais no canto direito
- rodape fixo com fonte dos dados e numeracao
- raio maximo de 8px
- sem sombras
- sem fundos decorativos
- sem cards dentro de cards

O visual e executivo, limpo e repetivel. Isso e mais importante que criar layouts diferentes demais por tipo de campanha.

### 3. Tokens de design

Devem virar CSS compartilhado:

- cores principais: `#ff2b32`, `#e41f2b`, `#101216`, `#111827`
- textos: `#16181d`, `#3b414c`, `#5f6673`, `#6b7280`, `#8a92a0`
- fundos: `#fbfcfe`, `#f7f8fa`, `#f8fafc`, `#fff7f7`
- bordas: `#e5e7eb`, `#e7eaf0`, `#eef0f4`, `#edf0f5`
- fonte: `Inter, Arial, Helvetica, sans-serif`
- `letter-spacing: 0`
- `font-variant-numeric: tabular-nums` em tabelas e valores comparaveis

### 4. Componentes reutilizaveis

O modelo de referencia ja tem uma biblioteca de componentes. Eles devem virar funcoes/componentes de template, nao HTML copiado manualmente:

- `topline`
- `header`
- `footer`
- `hero`
- `kpi-grid`
- `metric-grid`
- `panel`
- `panel.dark`
- `table`
- `compact-table`
- `note`
- `bars`
- `auction-cards`
- `insight-list`
- `tag`

Esses componentes cobrem quase todos os relatorios futuros. O que muda por objetivo e a ordem, o texto e as metricas.

### 5. Estrutura de 3 paginas

Usar esta logica como base:

1. Resumo executivo
   - hero
   - 4 KPIs principais
   - resumo por objetivo/canal
   - notas metodologicas
   - leitura executiva curta

2. Aprofundamento do objetivo principal
   - titulo do objetivo
   - metric cards
   - tabela principal
   - barras comparativas
   - nota objetiva

3. Fechamento tatico compacto
   - classe `compact-page`
   - tabelas menores
   - comparativos visuais
   - leilao/presenca quando fizer sentido
   - proximos passos

O padrao deve tentar ficar em 3 paginas. A quarta pagina so deve existir quando houver necessidade real.

### 6. Conteudo com metodologia clara

Trazer as regras de conteudo:

- diferenciar conversoes de plataforma, leads de CRM e resultados de campanha
- explicar quando os dados vierem de print, planilha, API ou CRM
- nao expor tokens, IDs internos, caminhos locais ou nomes de clientes antigos
- campanhas de brand/perfil entram como apoio de presenca, nao como aquisicao direta
- notas devem ser curtas e explicar fonte, metodo ou ressalva importante

Importante: o HTML de referencia contem exemplos de IDs de contas e datas antigas em rodapes. Esses textos nao devem ser copiados. O rodape precisa ser gerado por componente seguro.

### 7. QA visual obrigatorio

O fluxo ideal:

1. gerar HTML
2. gerar PDF
3. gerar PNG de previa
4. verificar via script se alguma `.page` tem `scrollHeight > clientHeight`
5. revisar visualmente a previa

O modelo de referencia renderizou em 3 paginas A4 sem overflow. Esse criterio deve virar teste de qualidade do nosso gerador.

## Limites do gerador atual

O template antigo em `templates/relatorio.html` funcionava para um PDF simples, mas era mais proximo de uma pagina de dashboard do que de um relatorio executivo paginado.

Principais limites:

- nao usa `.page` A4 fixa
- depende da margem do Puppeteer, nao de layout de folha controlado por CSS
- nao tem cabecalho e rodape por pagina
- usa Chart.js por CDN, o que deixa a renderizacao dependente de rede
- nao tem modelos diferentes por objetivo
- nao gera previa PNG no fluxo principal
- ainda nao tem validacao automatica de overflow por pagina

O caminho certo e preservar a coleta/agregacao atual, mas trocar a camada de apresentacao por um sistema de templates.

## Arquitetura recomendada

### Estrutura de arquivos sugerida

```text
src/
  report.ts
  objectives.ts
  pdf.ts
  pdf-model.ts
  pdf-template.ts
  pdf-components.ts
  pdf-templates/
    mixed.ts
    lead.ts
    messages.ts
    awareness.ts
    profile.ts
    sales.ts
    engagement.ts
templates/
  pdf/
    base.css
assets/
  logo.png
docs/
  relatorios-pdf-modelos.md
```

### Separacao de responsabilidades

- `report.ts`: agregacao numerica e regra de negocio
- `objectives.ts`: classificacao de campanha e metrica principal por objetivo
- `pdf-model.ts`: transforma dados brutos em um modelo neutro para PDF
- `pdf-components.ts`: componentes HTML reutilizaveis
- `pdf-template.ts`: shell A4, CSS, assets e montagem final
- `pdf-templates/*.ts`: ordem das secoes por tipo de relatorio
- `pdf.ts`: renderizacao Chrome/Edge, PDF, PNG e validacao visual

### Modelo de dados recomendado

```ts
type ReportKind =
  | "mixed"
  | "lead"
  | "messages"
  | "awareness"
  | "profile"
  | "sales"
  | "engagement";

interface PdfReportModel {
  kind: ReportKind;
  meta: {
    clientName: string;
    periodLabel: string;
    dateStart: string;
    dateEnd: string;
    channels: string[];
    sourceLabel: string;
    generatedAt: string;
  };
  summary: {
    kpis: KpiCard[];
    executiveRead: string[];
  };
  objectives: ObjectiveBlock[];
  campaigns: CampaignRow[];
  adsets?: AdsetRow[];
  dailySeries?: DailyPoint[];
  tacticalNotes: string[];
  nextSteps: string[];
}
```

O template nao deve calcular metricas importantes. Ele so deve formatar dados ja prontos.

## Selecao automatica de modelo

Regra sugerida:

1. Se o usuario pedir explicitamente um tipo, usar esse tipo.
2. Se so houver uma categoria relevante no periodo, usar o modelo dela.
3. Se uma categoria concentrar a maior parte do investimento ou resultado, usar o modelo dela como pagina 2 e tratar as outras como apoio.
4. Se houver varios objetivos relevantes, usar `mixed`.

Categorias:

- `lead`: formularios e leads de site
- `messages`: WhatsApp/mensagens
- `awareness`: reconhecimento, alcance, autoridade e ThruPlay
- `profile`: visitas ao perfil
- `sales`: vendas/conversoes
- `engagement`: engajamento
- `mixed`: conta com varios objetivos no mesmo periodo

## Modelos por objetivo

### Lead

Foco:

- leads
- CPL
- investimento
- CTR
- CPC
- taxa de conversao quando disponivel

Pagina 2 deve destacar campanhas/conjuntos de lead, CPL por grupo e volume de leads. Pagina 3 deve trazer leitura de qualidade, fonte dos leads e proximos passos.

### Messages

Foco:

- conversas iniciadas
- CPA por conversa
- investimento
- CTR
- CPC
- campanhas ou conjuntos que geraram mais conversas

Notas metodologicas devem deixar claro que conversa iniciada na plataforma nao e necessariamente venda ou atendimento concluido.

### Awareness / REC

Foco:

- alcance
- impressoes
- frequencia
- CPM
- ThruPlay quando existir
- custo por pessoa alcancada

Este modelo precisa usar mais barras de presenca, comparativos e notas de saturacao. Deve evitar tratar alcance como aquisicao direta.

### Profile

Foco:

- visitas/cliques para perfil
- custo por visita
- alcance
- frequencia
- CTR

Precisa deixar claro que ganho de seguidores nao vem da API de Ads. Se houver dados externos de seguidores, entrar como fonte separada.

### Sales

Foco:

- compras/conversoes
- CPA
- receita/ROAS quando houver dado
- investimento
- campanhas de remarketing e aquisicao

Para ficar completo, o MCP deve buscar tambem `action_values`, `purchase_roas` e possivelmente eventos de pixel. Enquanto isso nao existir, o modelo de vendas deve indicar quando esta usando conversa como proxy.

### Engagement

Foco:

- engajamentos
- custo por engajamento
- CPM
- CTR
- alcance
- campanhas/conteudos com maior resposta

Deve ser tratado como presenca e prova de interesse, nao como conversao final.

### Mixed

Foco:

- resumo da conta
- objetivos agrupados
- objetivo dominante
- objetivos de apoio
- leitura executiva do mix

Este deve ser o primeiro modelo a implementar, porque substitui o PDF atual sem exigir todos os aprofundamentos por objetivo.

## Ordem recomendada de implementacao

1. Criar `base.css` com os tokens e componentes do modelo de referencia.
2. Criar componentes HTML reutilizaveis.
3. Atualizar `pdf.ts` para:
   - usar `preferCSSPageSize: true`
   - usar margem zero
   - gerar PNG de previa
   - validar overflow das paginas
4. Implementar o modelo `mixed` usando os dados que o MCP ja possui hoje.
5. Implementar `messages`, `lead`, `awareness`, `profile`, `sales` e `engagement` nesta ordem.
6. Expandir a coleta de dados para adsets, ads, breakdowns e metricas de venda quando cada modelo pedir.

## Cuidados antes de codar

- Nao copiar o HTML de referencia inteiro como template final.
- Nao deixar textos fixos de cliente, medico, datas antigas ou IDs.
- Nao depender de CDN para renderizar PDF.
- Nao usar emojis como elemento visual principal no PDF.
- Nao deixar o template decidir sozinho o que e KPI principal.
- Nao misturar dado de plataforma com CRM sem rotulo claro.
- Nao prometer venda, lead qualificado ou seguidor quando a API so mostra clique, visita ou conversa.

## Decisao inicial

A base visual do `Modelo-Referencia` deve virar o design system dos PDFs do projeto. A implementacao deve ser componentizada e orientada por `ReportKind`, com um modelo `mixed` primeiro e templates especificos por objetivo depois.

Esse caminho aproveita o que o modelo tem de melhor - pagina A4 previsivel, ritmo visual, componentes e hierarquia - sem prender o projeto a um HTML estatico de cliente antigo.
