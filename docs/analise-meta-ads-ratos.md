# Analise da pasta meta-ads-ratos-main

## Escopo

Esta analise olha a pasta `meta-ads-ratos-main` como fonte de ideias para o
`rw-mcp`.

Fica fora do escopo por enquanto:

- subir campanhas
- editar campanhas
- deletar campanhas
- duplicar campanhas
- trocar url_tags
- fluxos de criacao de criativo/ad/adset/campaign

O foco aqui e apenas leitura, metricas, diagnostico e melhorias de relatorio.

## Arquivos analisados

- `SKILL.md`
- `README.md`
- `aprendizados.md`
- `contas.yaml`
- `references/api-reference.md`
- `scripts/read.py`
- `scripts/insights.py`
- `scripts/dataset.py`
- `scripts/targeting.py`
- `scripts/lib/__init__.py`
- `scripts/lib/pagination.py`

## O que realmente interessa para nosso projeto

### 1. Insights mais completos

O `scripts/insights.py` e a parte mais importante para o MCP.

Hoje o `rw-mcp` ja busca:

- `spend`
- `impressions`
- `clicks`
- `cpc`
- `cpm`
- `cpp`
- `ctr`
- `reach`
- `actions`
- `video_thruplay_watched_actions`

A pasta ratos mostra campos e parametros que devemos incorporar:

- `frequency`
- `cost_per_action_type`
- `action_values`
- `purchase_roas`
- `cost_per_conversion`
- `quality_ranking`
- `engagement_rate_ranking`
- `conversion_rate_ranking`
- metricas de video:
  - `video_avg_time_watched_actions`
  - `video_p25_watched_actions`
  - `video_p50_watched_actions`
  - `video_p75_watched_actions`
  - `video_p100_watched_actions`

Isso melhora especialmente os modelos:

- `awareness/rec`: frequencia, ThruPlay, video quartis, CPM
- `sales`: action_values, purchase_roas, compra/pixel
- `engagement`: post_engagement, ranking de engajamento
- `lead/messages`: cost_per_action_type mais transparente

### 2. Parametros de insights que faltam no MCP

O `scripts/insights.py` aceita parametros que nosso MCP ainda nao expoe bem:

- `breakdowns`
- `action_breakdowns`
- `action_report_time`
- `action_attribution_windows`
- `use_account_attribution_setting`
- `use_unified_attribution_setting`
- `filtering`
- `sort`
- `default_summary`
- `time_ranges`
- `async report`

Prioridade recomendada:

1. `breakdowns`
2. `action_breakdowns`
3. `action_attribution_windows`
4. `default_summary`
5. `filtering`
6. `async report`

O async report so vale depois, para consultas pesadas.

### 3. Regra critica de leitura

O `SKILL.md` traz uma regra muito boa:

> Nunca assumir origem de dados. Ao mostrar insights no nivel da conta, sempre quebrar por campanha antes de atribuir resultados a uma campanha especifica.

Isso deve virar regra interna do `rw-mcp`.

Aplicacao pratica:

- PDF da conta deve sempre usar `level=campaign` para distribuir resultado.
- Nao dizer que um resultado pertence a uma campanha se ele veio apenas de insight da conta.
- Ao usar dados agregados, declarar que e total da conta.

### 4. Pos-processamento de actions

O `insights.py` remove action types redundantes por prefixo:

- `omni_`
- `onsite_web_app_`
- `onsite_web_`
- `onsite_app_`
- `web_app_in_store_`
- `offsite_conversion.fb_pixel_`

Essa ideia e boa, mas precisa de cuidado.

Para nosso MCP, o melhor caminho e:

- manter `actionsDisponiveis` completo para auditoria
- criar uma versao normalizada para leitura e PDF
- nunca apagar o bruto antes de salvar/retornar quando o usuario pedir transparencia

Isso evita duplicidade visual sem perder rastreabilidade.

### 5. Pixel/Dataset diagnostics

O `scripts/dataset.py` tem uma parte muito util:

- listar pixels da conta
- ver detalhes de pixel
- consultar eventos por periodo
- diagnosticar saude do pixel
- classificar como `HEALTHY`, `DEGRADED` ou `UNHEALTHY`
- verificar:
  - `last_fired_time`
  - horas desde ultimo evento
  - `is_unavailable`
  - automatic matching
  - eventos dos ultimos 7 dias
  - first party cookie status
  - data use setting

Isso e muito relevante para relatorios de `sales`, `lead` e qualquer campanha com pixel.

Sugestao de ferramentas futuras no MCP:

- `list_pixels`
- `get_pixel`
- `get_pixel_events`
- `get_pixel_diagnostics`

Sugestao de bloco futuro no PDF:

- "Saude do pixel e fontes de conversao"
- "Eventos recebidos nos ultimos 7 dias"
- "Ultimo disparo"
- "Riscos de mensuracao"

### 6. Breakdowns para relatorio

O arquivo `references/api-reference.md` lista breakdowns que podemos usar em relatorios:

- `age`
- `gender`
- `country`
- `region`
- `publisher_platform`
- `platform_position`
- `device_platform`
- `impression_device`
- `frequency_value`
- horarios agregados

Prioridade para PDF:

1. `publisher_platform` / `platform_position`
2. `device_platform`
3. `age` / `gender`
4. `region`

Isso pode virar pagina ou bloco de "onde a verba performou melhor".

### 7. Leitura de estrutura da conta

O `read.py` e util por expor leituras que o MCP ja tem parcialmente, mas pode ampliar:

- campanhas
- adsets
- ads
- creatives
- previews
- images/videos
- activities
- custom audiences
- lookalike audiences

Para analise e relatorio, os mais relevantes sao:

- `adsets-by-campaign`: detalhar performance por conjunto
- `ads-by-campaign` e `ads-by-adset`: detalhar criativos/anuncios
- `creative`: nome, url_tags, link_url, object_story_spec, CTA
- `activities`: historico de alteracoes da conta
- `custom-audiences` e `lookalike-audiences`: leitura de audiencias usadas

Nao precisamos importar tudo agora. O primeiro ganho e adicionar adsets e ads ao PDF quando o modelo especifico pedir.

### 8. Targeting como diagnostico

O `targeting.py` tem funcoes de:

- buscar interesses
- buscar geolocalizacoes
- validar targeting spec
- estimar alcance
- estimar entrega
- descrever targeting em linguagem humana

Nao e prioridade para o relatorio mensal, mas pode virar um modulo de auditoria:

- "publico estimado"
- "segmentacao valida"
- "descricao do publico"
- "risco de publico muito estreito"

Isso e mais util para diagnostico e planejamento do que para o PDF padrao.

## O que nao vamos trazer agora

Nao vale trazer para o `rw-mcp` nesta fase:

- criacao de campanha
- criacao de adset
- criacao de ad
- criacao de creative
- upload de imagem/video
- update de status/orcamento
- delete
- duplicacao
- swap de url_tags
- regras de ativacao de campanha

Essas partes sao operacionais e fogem do nosso objetivo atual, que e relatorio, analise e leitura.

## O que ja temos parecido no rw-mcp

O projeto atual ja cobre:

- listar contas
- listar campanhas
- listar adsets
- listar ads
- buscar insights por conta/campanha/adset/ad
- detectar objetivo por nome/objective
- consolidar relatorio por campanha
- gerar PDF

O que falta e profundidade:

- mais campos de insights
- mais parametros de segmentacao
- pixel diagnostics
- action types normalizados
- breakdowns para leitura de publico/plataforma
- comparativos mais ricos
- dados por adset/ad no PDF

## Priorizacao recomendada

### Fase 1 - Melhorar insights base

Adicionar ao `meta-api.ts`:

- `frequency`
- `cost_per_action_type`
- `action_values`
- `purchase_roas`
- rankings de qualidade
- metricas de video

Adicionar parametros opcionais:

- `actionBreakdowns`
- `actionAttributionWindows`
- `actionReportTime`
- `defaultSummary`

### Fase 2 - Normalizacao de actions

Criar camada de normalizacao:

- action type bruto
- action type canonico
- valor
- custo por action
- categoria de leitura

Isso ajuda a evitar duplicidade entre `lead`, `onsite_web_lead`, `offsite_conversion.fb_pixel_lead`, etc.

### Fase 3 - Pixel diagnostics

Criar ferramentas MCP:

- `list_pixels`
- `get_pixel_events`
- `get_pixel_diagnostics`

Integrar no PDF de `sales` e `lead`.

### Fase 4 - Breakdowns de relatorio

Adicionar consultas por:

- posicionamento
- plataforma
- dispositivo
- idade/genero
- regiao

Usar nos PDFs especificos, principalmente `awareness`, `messages` e `lead`.

### Fase 5 - Adsets, ads e creatives no PDF

Para modelos especificos:

- `lead`: tabela por adset + campanhas/formularios
- `messages`: tabela por adset/ad + custo por conversa
- `awareness`: alcance/frequencia/CPM por campanha e posicionamento
- `profile`: visitas/cliques e segmentacao
- `sales`: pixel, eventos, ROAS, compras e funil

## Decisao

A pasta `meta-ads-ratos-main` nao deve ser copiada para dentro do projeto.

Ela deve servir como referencia para ampliar o `rw-mcp` em tres frentes:

1. insights mais completos
2. diagnostico de pixel/dataset
3. leitura segmentada por breakdowns

O foco deve continuar sendo analise e relatorio, nao operacao de campanha.

## Status de implementacao

Implementado no `rw-mcp`:

- campos de insights ampliados em `src/meta-api.ts`
- suporte a breakdowns, action breakdowns, atribuicao, filtros, sort e summary
- paginacao real em consultas de insights
- normalizacao de actions em `src/action-normalizer.ts`
- agregacao de actions normalizadas, cost_per_action_type, action_values, ROAS, frequencia e rankings em `src/report.ts`
- tools de pixel somente leitura:
  - `list_pixels`
  - `get_pixel`
  - `get_pixel_events`
  - `get_pixel_diagnostics`
- PDF `mixed` exibindo frequencia e ROAS quando disponivel

Nao implementado de proposito:

- criar pixel
- compartilhar/descompartilhar pixel
- criar/editar/deletar campanhas
- duplicar campanhas
- trocar url_tags
