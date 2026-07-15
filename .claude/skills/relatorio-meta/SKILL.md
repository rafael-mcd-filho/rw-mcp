---
name: relatorio-meta
description: >-
  Gera relatórios e análises de campanhas do Meta Ads usando o MCP meta-ads.
  Use quando o usuário pedir "como foi a conta", "relatório da semana",
  "desempenho das campanhas", "compara com o período anterior", "quantos leads",
  análise de CPL/CPA/CTR, ou qualquer leitura de resultados de anúncios da Meta.
---

# Relatório Meta Ads

Camada de análise sobre o MCP `meta-ads`. O MCP traz os dados já agregados; esta
skill define **como interpretar, comparar e apresentar** do jeito do cliente.

## Fluxo

1. **Identifique a conta.** Se o usuário não deixar claro qual cliente, chame
   `meta_list_ad_accounts` e confirme. Cada cliente tem um `account_id` (veja
   Benchmarks abaixo). Passe `account_id` em todas as chamadas.
2. **Defina o período.** "ontem" → `date_preset: yesterday`; "essa semana" →
   `this_week_mon_today`; "últimos 7 dias" → `last_7d`. Datas específicas → `since`/`until`.
3. **Escolha o tool:**
   - Visão geral da conta → `meta_get_account_report` (todas as campanhas de uma vez).
   - Uma campanha específica → `meta_get_campaign_report`.
   - Comparar dois períodos → `meta_get_campaign_report` com `compare_since`/`compare_until`.
4. **Narre com julgamento.** Não despeje os números crus: aplique os benchmarks,
   destaque o que mudou e aponte 1–2 pontos de atenção. Seja objetivo.

## Como ler cada objetivo (tags no nome da campanha)

| Tag | O que importa | Métrica de custo |
|-----|---------------|------------------|
| `[MSG]` | Conversas iniciadas (WhatsApp) | CPA por conversa |
| `[LEAD]` | Leads de formulário | CPL |
| `[PERFIL]` | Visitas ao perfil | Custo por visita |
| `[VENDA]` | Compras (ou conversas, se não houver pixel) | CPA |
| `[REC]` | Alcance + ThruPlay | CPR / custo por ThruPlay |
| `[ENG]` | Engajamentos | Custo por engajamento |

O MCP já detecta isso sozinho. Combos como `[ENG] [WHATS]` viram conversa (WhatsApp).

## Benchmarks por cliente (AJUSTE conforme a realidade de cada conta)

> Estes valores são pontos de partida observados. Atualize com as metas reais.

### Padrão (use se o cliente não tiver benchmark próprio)
- **CPL (formulário):** bom ≤ R$ 7 · ok ≤ R$ 15 · alto > R$ 15
- **CPA conversa (WhatsApp):** bom ≤ R$ 4,50 · ok ≤ R$ 8 · alto > R$ 8
- **CTR:** abaixo do esperado < 1% · ok 1–3% · ótimo > 3%
- **CPC:** baixo < R$ 1 · médio R$ 1–3 · alto > R$ 3
- **Frequência:** saudável < 2 · atenção 2–3 · saturando > 3

### Contas conhecidas
- **Meggashoes** — `account_id: 364442698159815` — foco WhatsApp; sem pixel de compra.
- **DGUETS** — `account_id: 1153243643313739` — mix de lead (form) + reconhecimento + perfil.

## Estilo de saída

- Comece pela campanha de maior investimento.
- Use o formato do MCP (mensagem estilo WhatsApp) como base.
- Sempre que comparar períodos, destaque variações relevantes (> ±15%).
- Feche com **1 a 3 observações acionáveis** — sem encher de jargão.
- Valores em R$ no padrão pt-BR (vírgula decimal).

## Limitações a serem honestas

- "Ganho de seguidores" não vem da API de Ads — em `[PERFIL]` usamos visitas (cliques).
- Campanhas sem entrega no período não aparecem no relatório da conta.
