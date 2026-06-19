# Relatorios Google Ads e integrados

## Estado implementado

O MCP agora tem tres camadas de relatorio alem das consultas brutas:

- `get_google_ads_account_report`: relatorio executivo de Google Ads com resumo, campanhas, leitura, oportunidades, notas metodologicas e `mensagem`.
- `get_google_ads_account_comparison`: comparativo de periodo do Google Ads com variacoes no resumo e por campanha.
- `get_client_performance_report`: relatorio integrado por cliente, juntando Meta Ads e Google Ads quando os dois IDs existem.
- `get_client_performance_comparison`: comparativo integrado entre dois periodos.

Tambem existem PDFs:

- `generate_google_report_pdf`
- `generate_google_comparison_report_pdf`
- `generate_integrated_report_pdf`
- `generate_integrated_comparison_report_pdf`

E tools de QA visual (ocultas por padrao — exponha com `EXPOSE_QA_TOOLS=1`):

- `qa_google_report_pdf`
- `qa_google_comparison_report_pdf`
- `qa_integrated_report_pdf`
- `qa_integrated_comparison_report_pdf`

## Google Ads - periodo unico

Entrada minima:

```json
{
  "customer_id": "1234567890",
  "since": "2026-06-01",
  "until": "2026-06-17",
  "client_name": "Cliente"
}
```

Saida principal:

- `resumo`: investimento, impressoes, cliques, conversoes, CTR, CPC medio e CPA.
- `campanhas`: metricas por campanha.
- `keywords`: amostra de keywords ordenadas por gasto, quando habilitada.
- `termos_pesquisa`: termos reais ordenados por gasto, quando habilitados.
- `leitura_executiva`: leitura curta do periodo.
- `oportunidades`: proximos passos.
- `notas_metodologicas`: ressalvas sobre conversoes e fonte.
- `mensagem`: texto pronto para envio.

Detalhes de busca (keywords e termos de pesquisa) ficam **ligados por padrao**
nas tools executivas e de PDF, mas **desligados por padrao** em
`get_google_ads_account_report` (que e a leitura rapida — evita 2 chamadas GAQL
extras quando so se quer os numeros). Para liga-los explicitamente:

```json
{
  "incluir_keywords": true,
  "incluir_termos_pesquisa": true,
  "limit_keywords": 10,
  "limit_search_terms": 10
}
```

## Google Ads - comparativo

Entrada minima:

```json
{
  "customer_id": "1234567890",
  "since": "2026-06-01",
  "until": "2026-06-17",
  "compare_since": "2026-05-15",
  "compare_until": "2026-05-31",
  "client_name": "Cliente"
}
```

O comparativo calcula:

- investimento;
- conversoes;
- CPA;
- cliques;
- impressoes;
- CPC medio;
- CTR em pontos percentuais;
- variacao por campanha casando por `campaign.id`.

O PDF comparativo usa:

```json
{
  "customer_id": "1234567890",
  "since": "2026-06-01",
  "until": "2026-06-17",
  "compare_since": "2026-05-15",
  "compare_until": "2026-05-31"
}
```

via `generate_google_comparison_report_pdf`.

## Relatorio integrado

Entrada por nome de cliente:

```json
{
  "nome_cliente": "Cliente",
  "since": "2026-06-01",
  "until": "2026-06-17"
}
```

Entrada por IDs:

```json
{
  "client_name": "Cliente",
  "meta_account_id": "act_123",
  "google_customer_id": "1234567890",
  "since": "2026-06-01",
  "until": "2026-06-17"
}
```

Regra de leitura:

- investimento total pode ser somado entre canais;
- resultados de Meta e conversoes de Google ficam separados;
- o relatorio nao soma conversas, leads, alcance e conversoes Google como se fossem uma unica conversao;
- deduplicacao e qualidade comercial dependem de CRM ou outra fonte externa.

O comparativo integrado usa os mesmos campos do relatorio integrado, mais:

```json
{
  "compare_since": "2026-05-15",
  "compare_until": "2026-05-31"
}
```

Use `get_client_performance_comparison` para JSON/mensagem e
`generate_integrated_comparison_report_pdf` para PDF.

## QA visual

No **caminho de render** (as tools `generate_*`), a geracao do PDF:

- **falha** quando o conteudo estoura a folha A4 (defeito real de layout);
- apenas **avisa** (`console.warn`) em paginas aparentemente vazias ou imagens
  quebradas — nao bloqueia a entrega de contas com pouco volume.

As tools `qa_*` (opt-in via `EXPOSE_QA_TOOLS=1`) executam a mesma montagem com
dados reais das APIs e **nao abortam**: retornam um laudo para inspecao:

- `ok` (true quando nao ha problemas);
- `pageCount`;
- `problems` (lista de overflow / paginas vazias / imagens quebradas);
- `checks`: metricas por pagina (`textLength`, `visibleElements`, `brokenImages`, `overflow`).

Use as tools de QA antes de enviar o primeiro PDF de um novo cliente ou periodo com muita campanha.

## Segurança

Credenciais devem ficar em variaveis de ambiente. Scripts locais usam:

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`

Se alguma credencial real ja ficou aberta em arquivo local, rotacione no provedor correspondente antes de usar em producao.
