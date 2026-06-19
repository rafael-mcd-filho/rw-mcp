> Referência canônica dos benchmarks codificados em `src/intelligence/benchmarks.ts`.
> Origem: ratos/ads-ratos-main (removido). Revisar a cada ~3 meses.

# Benchmarks de Tráfego Pago — Mercado Brasileiro (2026)

Fontes-base: WordStream/LocaliQ 2025-2026, Google Ads Help, GA4 Help, RD Station, Superads/benchmarks Brasil, referências operacionais de mercado brasileiro.

Atualizados em junho/2026.

Estes benchmarks devem ser usados como **régua operacional de diagnóstico**, não como verdade absoluta. O Claude DEVE usar estes parâmetros para classificar métricas automaticamente e gerar alertas quando valores estiverem fora do esperado, sempre considerando objetivo da campanha, nicho, sazonalidade e métrica principal do negócio.

---

## Classificação de performance

| Nível | Cor | Significado |
|---|---|---|
| EXCELENTE | verde | Acima do benchmark superior |
| BOM | azul | Dentro do esperado |
| ATENÇÃO | amarelo | Abaixo do esperado, precisa otimizar |
| CRÍTICO | vermelho | Muito abaixo do esperado, exige ação prioritária |

---

## Regras gerais de interpretação

1. O Claude deve identificar primeiro a **plataforma**: Meta Ads, Google Ads ou GA4.
2. Depois deve identificar o **objetivo da campanha**: tráfego, leads, vendas, remarketing, Search, Performance Max, Display ou YouTube.
3. Em seguida deve identificar o **nicho do cliente**, quando disponível.
4. O benchmark por nicho deve ser usado principalmente para **CPL, CTR e CPC em Meta Ads**.
5. A métrica principal do objetivo deve ter prioridade:
   - Campanha de tráfego: CTR, CPC, CPM e qualidade do tráfego.
   - Campanha de leads: CPL, taxa de conversão, CTR e CPC.
   - Campanha de vendas/e-commerce: ROAS, CPA, taxa de conversão e ticket médio.
   - Remarketing: ROAS, frequência, CPA e saturação.
   - Google Search: CTR, CPC, CPA/CPL, taxa de conversão, Quality Score e Impression Share.
   - Landing page/GA4: taxa de conversão, bounce rate, tempo médio/engajamento e páginas por sessão.
6. O Claude NÃO deve gerar alerta grave com base em apenas uma métrica isolada, exceto quando houver problema técnico evidente, como tracking quebrado, EMQ crítico, deduplicação baixa, Quality Score muito baixo ou ausência de conversões.
7. Em meses sazonais de alta competição, o Claude deve aumentar a tolerância para CPC e CPM antes de classificar a conta como crítica.

---

# Meta Ads — Benchmarks BR 2026

## Métricas gerais

| Métrica | CRÍTICO | ATENÇÃO | BOM | EXCELENTE |
|---|---:|---:|---:|---:|
| CTR (tráfego) | < 0,8% | 0,8-1,2% | 1,2-2,0% | > 2,0% |
| CTR (leads) | < 1,2% | 1,2-2,0% | 2,0-3,2% | > 3,2% |
| CTR (vendas) | < 0,8% | 0,8-1,5% | 1,5-2,5% | > 2,5% |
| CPC (tráfego) | > R$3,50 | R$1,80-3,50 | R$0,70-1,80 | < R$0,70 |
| CPC (leads) | > R$10,00 | R$5,00-10,00 | R$2,00-5,00 | < R$2,00 |
| CPM | > R$45,00 | R$25,00-45,00 | R$10,00-25,00 | < R$10,00 |
| CPL geral | > R$120,00 | R$60,00-120,00 | R$20,00-60,00 | < R$20,00 |
| Taxa conversão (leads) | < 3% | 3-5% | 5-10% | > 10% |
| ROAS (e-commerce) | < 1,2 | 1,2-2,0 | 2,0-3,5 | > 3,5 |
| ROAS (retargeting) | < 2,0 | 2,0-3,5 | 3,5-5,0 | > 5,0 |
| ROAS (Advantage+) | < 1,8 | 1,8-3,0 | 3,0-5,0 | > 5,0 |

---

## Frequência — saturação

| Tipo de campanha | BOM | ATENÇÃO | CRÍTICO |
|---|---:|---:|---:|
| Prospecção / TOF | até 2,5 | > 3,0 | > 5,0 |
| Meio de funil | até 4,0 | > 5,0 | > 8,0 |
| Retargeting / BOF | até 7,0 | > 8,0 | > 12,0 |

### Regra de alerta para frequência

- Frequência alta + CTR estável = observar, sem alerta crítico.
- Frequência alta + CTR em queda = sinal de fadiga.
- Frequência alta + CPC/CPM subindo + ROAS/CPL piorando = alerta crítico.
- Retargeting naturalmente tolera frequência maior que prospecção.

---

## Creative fatigue — fadiga de criativo

| Sinal | Threshold |
|---|---|
| Queda de CTR em 14 dias | > 20% = possível criativo cansado |
| Queda de CTR em 30 dias | > 30% = criativo provavelmente saturado |
| Aumento de CPC com CTR caindo | Sinal forte de perda de atratividade |
| Frequência alta + queda de CTR | Sinal forte de saturação de público/criativo |
| Vida útil média de criativo TOF | 3-4 semanas |
| Vida útil média de criativo BOF | 2-6 semanas, depende do tamanho da audiência |
| Exposições antes de queda relevante | ~4 exposições podem iniciar queda de resposta |

### Regra prática

O Claude deve gerar alerta de fadiga quando pelo menos 2 destes sinais aparecerem juntos:

1. CTR caiu mais de 20% nos últimos 14 dias.
2. CPC subiu mais de 20% no mesmo período.
3. Frequência passou do limite de atenção.
4. CPL/CPA piorou.
5. ROAS caiu.

---

## Event Match Quality — Pixel/CAPI

| Métrica | CRÍTICO | ATENÇÃO | BOM | EXCELENTE |
|---|---:|---:|---:|---:|
| EMQ Score | < 5,0 | n/a | 5,0-8,0 | > 8,0 |
| Taxa de deduplicação | < 80% | 80-90% | 90-95% | > 95% |
| Eventos recebidos | Queda abrupta ou ausência | Oscilação relevante | Estável | Estável e com volume consistente |

### Alertas técnicos

| Situação | Classificação |
|---|---|
| EMQ < 5,0 | CRÍTICO |
| Deduplicação < 80% | CRÍTICO |
| Queda brusca de eventos sem queda proporcional de investimento | CRÍTICO |
| Leads no CRM maiores que eventos no Meta | ATENÇÃO/CRÍTICO |
| Eventos duplicados inflando conversões | CRÍTICO |
| Pixel sem evento principal | CRÍTICO |

---

# Google Ads — Benchmarks BR 2026

## Métricas gerais — Search

| Métrica | CRÍTICO | ATENÇÃO | BOM | EXCELENTE |
|---|---:|---:|---:|---:|
| CTR (Search) | < 3,0% | 3,0-5,0% | 5,0-8,0% | > 8,0% |
| CPC (Search) | > R$12,00 | R$6,00-12,00 | R$2,00-6,00 | < R$2,00 |
| CPA/CPL (Search) | > R$180,00 | R$90,00-180,00 | R$35,00-90,00 | < R$35,00 |
| Taxa de conversão | < 3,0% | 3,0-5,0% | 5,0-8,0% | > 8,0% |
| Quality Score | < 4 | 4-5 | 6-7 | >= 8 |
| Search Impression Share | < 20% | 20-40% | 40-70% | > 70% |

---

## Quality Score — decomposição

| Componente | BOM | RUIM |
|---|---|---|
| creative_quality / ad relevance | ABOVE_AVERAGE ou AVERAGE | BELOW_AVERAGE |
| post_click_quality / landing page experience | ABOVE_AVERAGE ou AVERAGE | BELOW_AVERAGE |
| search_predicted_ctr / expected CTR | ABOVE_AVERAGE ou AVERAGE | BELOW_AVERAGE |

### Regras para Quality Score

- Quality Score >= 8 = EXCELENTE.
- Quality Score entre 6 e 7 = BOM.
- Quality Score entre 4 e 5 = ATENÇÃO.
- Quality Score < 4 = CRÍTICO.
- Se qualquer componente estiver como BELOW_AVERAGE, o Claude deve apontar a causa provável:
  - Ad relevance ruim = problema de correspondência entre palavra-chave, anúncio e intenção.
  - Landing page experience ruim = problema de página, velocidade, conteúdo, UX ou promessa.
  - Expected CTR ruim = problema de atratividade do anúncio ou intenção fraca da palavra-chave.

---

## Benchmarks por tipo de campanha — Google Ads

| Tipo | CTR esperado | CPA/CPL esperado | ROAS esperado |
|---|---:|---:|---:|
| Search (marca) | > 10% | < R$25 | > 8,0 |
| Search (genérica) | 5-8% | R$35-90 | 2,0-4,0 |
| Performance Max | 1-3% | varia por evento | 2,0-5,0 |
| Display | 0,3-0,8% | R$60-180 | 0,5-2,0 |
| YouTube (views) | VTR 15-35% | R$0,25-1,55/view | n/a |

### Observações por tipo

- Search de marca deve ter CTR muito superior a campanhas genéricas.
- Search genérica pode ter CPC maior, mas precisa compensar com qualidade da intenção.
- Performance Max deve ser avaliada principalmente por conversões, CPA, ROAS e qualidade dos termos/canais.
- Display não deve ser julgado com a mesma régua de Search.
- YouTube deve priorizar CPV, VTR, retenção e impacto assistido, não apenas clique direto.

---

# GA4 — Benchmarks BR 2026

## Landing pages de anúncios

| Métrica | CRÍTICO | ATENÇÃO | BOM | EXCELENTE |
|---|---:|---:|---:|---:|
| Bounce rate (GA4) | > 75% | 60-75% | 40-60% | < 40% |
| Tempo médio / engajamento na página | < 15s | 15-30s | 30-60s | > 60s |
| Taxa conversão (sessão → lead) | < 2% | 2-5% | 5-10% | > 10% |
| Páginas por sessão | < 1,2 | 1,2-1,5 | 1,5-2,5 | > 2,5 |

### Observação importante sobre bounce rate no GA4

No GA4, bounce rate não deve ser interpretado como no Universal Analytics. Ele representa o inverso da taxa de sessões engajadas. Uma sessão engajada normalmente envolve tempo mínimo de engajamento, evento-chave/conversão ou múltiplas visualizações de página/tela.

### Regra de diagnóstico da landing page

| Sinal | Diagnóstico provável |
|---|---|
| CTR bom + taxa de conversão baixa | Página, oferta ou formulário com problema |
| CPC bom + CPL alto | Conversão ruim na página ou público pouco qualificado |
| Bounce alto + tempo baixo | Tráfego desalinhado ou página fraca |
| Tempo bom + conversão baixa | Oferta, CTA ou formulário precisam melhorar |
| Muitas sessões + poucos leads | Problema de proposta, formulário, velocidade ou tracking |

---

# Benchmarks por nicho — Meta Ads BR 2026

| Nicho | CPL bom | CTR bom | CPC bom |
|---|---:|---:|---:|
| E-commerce (moda) | R$10-25 | 1,5-2,5% | R$0,70-1,80 |
| E-commerce (tech) | R$20-50 | 1,0-2,0% | R$1,20-3,00 |
| Infoprodutos | R$8-25 | 1,8-3,5% | R$0,60-1,80 |
| SaaS B2B | R$60-180 | 0,7-1,5% | R$3,00-9,00 |
| Serviços locais | R$20-70 | 1,2-2,5% | R$1,00-3,50 |
| Imóveis | R$40-120 | 0,8-1,8% | R$2,00-6,00 |
| Saúde/estética | R$20-70 | 1,2-2,5% | R$1,00-4,00 |
| Educação | R$10-35 | 1,5-3,0% | R$0,80-2,50 |
| Financeiro | R$60-180 | 0,6-1,3% | R$3,50-12,00 |
| Alimentação/delivery | R$8-25 | 1,8-3,0% | R$0,60-1,80 |

### Como usar os benchmarks por nicho

1. Se o nicho estiver disponível, o Claude deve comparar CPL, CTR e CPC com a tabela de nicho.
2. Se o nicho não estiver disponível, usar a tabela geral da plataforma.
3. Se a campanha for de conversão/vendas, priorizar ROAS, CPA e taxa de conversão.
4. Para nichos de ticket alto, CPL maior pode ser aceitável.
5. Para negócios locais, avaliar também volume absoluto de contatos e qualidade comercial dos leads.

---

# Sazonalidade — padrão brasileiro 2026

| Período | Efeito esperado no CPM/CPC | Motivo |
|---|---:|---|
| Janeiro | -10% a -30% | Início de ano, menor competição |
| Fevereiro / Carnaval | -5% a -20% | Menor investimento e variação de demanda |
| Março-Abril | Estável | Retomada do mercado |
| Maio / Dia das Mães | +10% a +25% | Pico de varejo e e-commerce |
| Junho / Dia dos Namorados | +10% a +20% | Pico de consumo |
| Julho | Estável | Meio do ano, boa janela de otimização |
| Agosto / Dia dos Pais | +5% a +15% | Pico moderado |
| Setembro-Outubro | +5% a +15% | Pré-Black Friday |
| Novembro / Black Friday | +30% a +50% | Maior pico competitivo do ano |
| Dezembro / Natal | +20% a +35% | Segundo maior pico do ano |

## Regra de sazonalidade

O Claude deve ajustar expectativas de CPC, CPM, CPA e CPL nos meses de pico.

Um CPC, CPM ou CPA alto em novembro ou dezembro pode ser normal pela competição, desde que CTR, taxa de conversão, volume de vendas e ROAS continuem saudáveis.

### Regra prática

- CPM alto isolado em mês sazonal = não gerar alerta crítico.
- CPM alto + CTR bom + ROAS bom = campanha saudável.
- CPM alto + CTR baixo + CPA/CPL alto = alerta real.
- CPC alto + taxa de conversão alta = pode ser aceitável.
- CPC alto + taxa de conversão baixa = problema de intenção, público, criativo ou página.

---

# Regras automáticas de alerta

## Alertas CRÍTICOS

O Claude deve gerar alerta crítico quando encontrar qualquer uma das situações abaixo:

| Situação | Diagnóstico |
|---|---|
| CPL/CPA em CRÍTICO + taxa de conversão baixa | Problema forte de conversão, público ou oferta |
| ROAS abaixo do ponto de equilíbrio | Campanha pode estar gerando prejuízo |
| CTR crítico + CPC alto | Criativo/anúncio pouco atrativo ou público desalinhado |
| CPM muito alto + CTR baixo | Leilão caro e baixa resposta |
| Frequência crítica + queda de CTR | Fadiga de criativo/público |
| Quality Score < 4 | Estrutura de Google Search precisa de revisão |
| EMQ < 5 ou deduplicação < 80% | Tracking técnico comprometido |
| Conversões zeradas com investimento relevante | Possível problema técnico ou oferta desalinhada |
| Queda abrupta de eventos no Meta/GA4 | Possível falha de pixel, tag, GTM ou CAPI |

---

## Alertas de ATENÇÃO

O Claude deve gerar alerta de atenção quando encontrar:

| Situação | Diagnóstico |
|---|---|
| Métrica em atenção por 3-7 dias | Monitorar e otimizar |
| CTR em atenção, mas CPL bom | Criativo pode melhorar, mas campanha ainda funciona |
| CPC em atenção, mas conversão boa | Custo pode ser aceitável |
| CPM em atenção em mês sazonal | Normal, avaliar junto com CTR e conversão |
| Landing page com conversão em atenção | Melhorar oferta, formulário, CTA ou velocidade |
| Quality Score 4-5 | Revisar anúncio, palavra-chave e página |
| Frequência em atenção | Preparar novos criativos ou ampliar público |

---

# Diagnósticos combinados

## Meta Ads

| Combinação | Interpretação |
|---|---|
| CTR baixo + CPC alto | Criativo fraco ou público desalinhado |
| CTR bom + CPL alto | Página, formulário, oferta ou qualidade do clique ruins |
| CPM alto + CTR bom | Mercado competitivo, mas anúncio responde bem |
| CPM alto + CTR baixo | Problema de leilão e criativo |
| Frequência alta + CTR caindo | Fadiga de criativo |
| ROAS baixo + CTR bom | Problema de oferta, preço, checkout, site ou público |
| Leads baratos + baixa qualidade comercial | Otimização para volume, não para qualidade |

---

## Google Ads

| Combinação | Interpretação |
|---|---|
| CTR baixo + Quality Score baixo | Anúncio e palavra-chave desalinhados |
| CTR bom + conversão baixa | Landing page ou oferta problemática |
| CPC alto + Impression Share baixo | Leilão competitivo e orçamento/lance insuficiente |
| CPA alto + taxa de conversão boa | CPC ou ticket/margem precisam ser avaliados |
| CPA alto + taxa de conversão baixa | Problema de intenção, página ou palavra-chave |
| Search marca com CTR baixo | Problema grave de estrutura, anúncio ou busca de marca |
| Search genérica com muitos termos irrelevantes | Necessário negativar termos |

---

## GA4 / Landing Page

| Combinação | Interpretação |
|---|---|
| Bounce alto + tempo baixo | Tráfego desqualificado ou página desalinhada |
| Tempo alto + conversão baixa | Interesse existe, mas oferta/CTA/formulário falha |
| Conversão baixa + formulário longo | Reduzir fricção |
| Conversão baixa + mobile ruim | Priorizar otimização mobile |
| Muitos cliques + poucas sessões | Possível problema de carregamento, UTMs ou tracking |
| GA4 sem conversões + Meta/Google com conversões | Revisar eventos, tags e atribuição |

---

# Como usar estes benchmarks

1. Ler o nicho do cliente no `contas.yaml` ou perguntar ao usuário.
2. Identificar a plataforma e o objetivo da campanha.
3. Cruzar métricas reais com a tabela correta.
4. Classificar cada métrica como EXCELENTE, BOM, ATENÇÃO ou CRÍTICO.
5. Gerar alertas apenas para métricas em ATENÇÃO ou CRÍTICO.
6. Antes de alarmar, considerar:
   - Sazonalidade.
   - Nicho.
   - Ticket médio.
   - Margem.
   - Objetivo da campanha.
   - Volume de dados.
   - Janela de conversão.
7. Priorizar alertas que afetam métrica de negócio:
   - CPL.
   - CPA.
   - ROAS.
   - Taxa de conversão.
   - Receita.
   - Lucro.
8. Nunca avaliar uma campanha apenas por CPM ou CPC isolado.
9. Em e-commerce, sempre comparar ROAS real com ROAS de equilíbrio.
10. Em geração de leads, sempre comparar CPL com qualidade comercial e taxa de fechamento.

---

# Regra final para o Claude

O Claude deve usar os benchmarks como referência para diagnóstico e priorização, mas deve evitar conclusões automáticas sem contexto.

A classificação correta deve seguir esta ordem:

1. Objetivo da campanha.
2. Métrica principal do objetivo.
3. Nicho.
4. Sazonalidade.
5. Volume de dados.
6. Qualidade técnica do tracking.
7. Impacto real no negócio.

## Regra de ouro

**Métrica ruim isolada não significa campanha ruim. Métrica ruim combinada com piora no resultado de negócio exige ação.**

---

# Fontes e observações

## Fontes-base consultadas

- WordStream / LocaliQ — benchmarks de Google Ads 2026.
- WordStream — benchmarks de Facebook/Meta Ads 2025.
- Google Ads Help — Quality Score, componentes e interpretação.
- Google Analytics Help — conceito de bounce rate e sessões engajadas no GA4.
- RD Station — benchmarks brasileiros de landing pages e conversão.
- Superads / bases de mercado — referências de CPM e CPC Meta Ads Brasil.
- Benchmarks operacionais de mercado brasileiro para adaptação por nicho.

## Observação de confiabilidade

Alguns benchmarks globais foram adaptados para o mercado brasileiro, pois nem todas as fontes públicas disponibilizam recortes completos por país, nicho, objetivo e moeda.

Por isso, os valores acima devem ser tratados como **parâmetros operacionais de análise**, e não como metas fixas universais.

Recomendação: revisar estes benchmarks a cada 3 meses ou sempre que houver grande mudança de mercado, plataforma, câmbio ou sazonalidade.
