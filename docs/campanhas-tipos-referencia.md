# Tipos de campanha Meta Ads — receita de configuração por objetivo

> Referência de "como montar corretamente cada tipo de campanha" no rw-mcp.
> Cada seção traz a combinação certa de `objective` (campanha) + `optimization_goal`
> + `destination_type` + `promoted_object` + targeting/criativo, com os padrões
> da operação (Plugue/RW) e os **pontos de decisão** que o gestor escolhe por campanha.
>
> **Fluxo padrão obrigatório:** antes de criar qualquer campanha, montar o checklist
> abaixo do tipo correspondente, mostrar TODOS os campos preenchidos para validação
> humana, e só criar (tudo PAUSED) após aprovado. Para conjuntos em lote, usar
> `meta_create_adsets_batch` com `dry_run=true` primeiro.
>
> **Limite duro da API — rascunho não existe:** a Marketing API só cria anúncio
> *publicado porém pausado* (status PAUSED), nunca rascunho de verdade. Campos que a
> Meta trava depois de "postado" (mesmo pausado) — hoje conhecido: o **banner de
> WhatsApp no perfil** — NÃO podem ser adicionados a um anúncio criado pela API.
> Regra de divisão de trabalho: campanha **sem** esses campos = automatizo 100%
> (tudo PAUSED); campanha **com** banner de WhatsApp = eu crio campanha + conjunto,
> o gestor cria o anúncio+criativo no Gerenciador como rascunho (liga o banner) e publica.
>
> Legenda: ✅ = valor fixo do padrão · 🔧 = ponto de decisão (gestor escolhe por campanha)
> · ⚠️ = pegadinha técnica confirmada.

---

## PERFIL / SEGUIDORES (tráfego para o perfil do Instagram)

Objetivo de negócio: crescer seguidores / visitas ao perfil. No Gerenciador, no
conjunto isso aparece como **Local da conversão → "Instagram ou Facebook"** +
**Meta de desempenho → "Maximizar o número de visitas ao perfil do Instagram"**.

Referência viva: conta **GBella Bijoux** (`act_1187356753324157`), conjunto
`JP | Mulheres | IG | Trafego Perfil | Excl. Seguidores` (ACTIVE, funcionando).

### Campanha (`meta_create_campaign`)
| Campo | Valor | |
|---|---|---|
| `objective` | `OUTCOME_TRAFFIC` | ✅ |
| `special_ad_categories` | `[]` (bijoux/varejo não é categoria especial) | ✅ |
| estratégia de orçamento | ABO (orçamento no conjunto) por padrão | 🔧 CBO se preferir |

### Conjunto (`meta_create_adset`)
| Campo | Valor | |
|---|---|---|
| `optimization_goal` | `PROFILE_VISIT` | ✅ ⚠️ |
| `destination_type` | `INSTAGRAM_PROFILE` | ✅ ⚠️ **nunca `WEBSITE`** — senão a Meta assume "Site" como local da conversão |
| `promoted_object` | **omitir** (perfil não usa pixel) | ✅ |
| `billing_event` | `IMPRESSIONS` | ✅ |
| `bid_strategy` | `LOWEST_COST_WITHOUT_CAP` | ✅ (default do MCP) |
| `daily_budget` | em centavos | 🔧 |

### Targeting (dentro de `targeting`)
| Campo | Valor | |
|---|---|---|
| `geo_locations` | cidade-alvo (ex.: João Pessoa) | 🔧 |
| **Expandir localização** (`geo_locations` "alcançar mais pessoas") | **desmarcado** — não incluir nenhum flag de expansão de geo | ✅ |
| `age_min` / `age_max` | faixa do público | 🔧 (GBella usa 24–50) |
| `genders` | `[2]` (mulheres) para bijoux | 🔧 |
| `targeting_automation.advantage_audience` | `0` | ✅ (Advantage+ público **desativado**) |
| `targeting_automation.individual_setting` | `{ age: 0, gender: 0, geo: 0 }` | ✅ trava as 3 "sugestões" de expansão: `age`=Advantage idade, `gender`=Advantage gênero, **`geo`=a "Expandir localização" (Alcançar pessoas além das cidades/regiões)**. `0`=desmarcado, `1`=expande. Confirmado: todos os conjuntos da conta usam `geo:0`, mesmo com Advantage+ público ligado. |
| `targeting_relaxation_types` | `{ lookalike: 0, custom_audience: 0 }` | ✅ (sem expansão de público) |
| `excluded_custom_audiences` | público **SEGUIDORES** (não anunciar pra quem já segue) | ✅ |
| `publisher_platforms` | `["instagram"]` | ✅ (perfil de IG; incluir `facebook` só se quiser Página do FB junto) |
| `instagram_positions` | `["stream","story","reels","explore_home","profile_feed","ig_search"]` | ✅ ⚠️ com `explore_home` o MCP injeta `explore` automaticamente |
| `device_platforms` | `["mobile","desktop"]` | 🔧 |
| **Gasto em posicionamentos excluídos** | **deixar desmarcado** (padrão) — em Tráfego/Perfil fica off por padrão; nenhum campo de API precisa ser enviado | ✅ |

### Criativo (`meta_create_creative`)
| Campo | Valor | |
|---|---|---|
| `object_story_spec.link_data.call_to_action.type` | `VIEW_INSTAGRAM_PROFILE` | ✅ (CTA "Acessar o perfil do Instagram") |
| `object_story_spec.link_data.link` | `http://instagram.com/<usuario>` | ✅ |
| `object_story_spec.page_id` / `instagram_user_id` | da conta (ver `meta_get_account_assets`) | ✅ |
| **Aprimoramentos de criativo** (Advantage+/essenciais, inclui **Música**) | **todos desativados** → `disable_creative_enhancements: true` | ✅ (chaves reais de música = `audio` e `music_generation`; o booleano desliga todas de uma vez — confirmado lendo criativo real do Beco) |
| **Anúncios com vários anunciantes** | `multi_advertiser_ads: false` (OPT_OUT) ou `true` (OPT_IN) | 🔧 ⚠️ se omitir, a Meta auto-inscreve desde ago/2024 — **sempre passar explícito** |
| **Banner "Receber mensagens do WhatsApp" no perfil** | **NÃO reproduzível pela Marketing API pública** — ligar no Gerenciador | 🔧 ⚠️ **Investigado a fundo (teste controlado GBella Bijoux, jul/2026, 2 anúncios no mesmo conjunto ON×OFF):** (1) `profile_card` DESCARTADO — os dois criativos são byte-a-byte idênticos (ambos `profile_card:OPT_IN`), banner difere. (2) O banner NÃO está em campo nenhum do criativo (object_story_spec, ~82 creative_features, asset_feed_spec, etc.). (3) Fingerprint achado via `meta_get_object` no ad: o anúncio COM banner tem `tracking_specs` com `{"action.type":["whatsapp"],"page":[...]}` e um `effective_object_story_id` (post dark) diferente; o SEM banner não tem tracking_specs. O post dark é ilegível (`#100 Missing permissions`). (4) Experimento de escrita (`asset_feed_spec` com CTAs VIEW_INSTAGRAM_PROFILE+WHATSAPP_MESSAGE) → a Meta **descartou os call_to_actions** e o ad falhou validação. **Conclusão:** o banner é assado no post dark por mecanismo interno do Gerenciador que a API pública não expõe. **Pré-requisito de negócio:** Página com WhatsApp conectado. **Ação:** ligar no Gerenciador (1 clique) quando o cliente pedir; automatizar todo o resto. Reavaliar se a Meta abrir o campo na API. |

### Anúncio (`meta_create_ad`)
Liga conjunto + criativo. Nada especial além do padrão (PAUSED na criação).

### Exemplo de `targeting` completo (base do preset)
```json
{
  "age_min": 24,
  "age_max": 50,
  "genders": [2],
  "geo_locations": {
    "cities": [{ "key": "256863", "name": "João Pessoa", "country": "BR" }],
    "location_types": ["home", "recent"]
  },
  "excluded_custom_audiences": [{ "id": "<ID_PUBLICO_SEGUIDORES>" }],
  "targeting_automation": {
    "advantage_audience": 0,
    "individual_setting": { "age": 0, "gender": 0, "geo": 0 }
  },
  "targeting_relaxation_types": { "lookalike": 0, "custom_audience": 0 },
  "publisher_platforms": ["instagram"],
  "instagram_positions": ["stream","story","reels","explore_home","profile_feed","ig_search"],
  "device_platforms": ["mobile","desktop"]
}
```

### Pendências a confirmar (pós-deploy)
- `destination_type = INSTAGRAM_PROFILE` está confirmado pela documentação oficial
  da Meta + pelo CTA `VIEW_INSTAGRAM_PROFILE` do criativo da GBella, mas **ainda não
  foi lido empiricamente** do conjunto real (a leitura `meta_list_adsets` só passou a
  trazer `destination_type` num fix ainda não publicado). Reconfirmar lendo o conjunto
  `52568172022963` depois do deploy.

---

## ALCANCE / RECONHECIMENTO (awareness)

Objetivo de negócio: aparecer para o máximo de gente (topo de funil, conteúdo).
Referência viva: **GBella Bijoux** (`act_1187356753324157`), conjunto
`JP | Mulheres | IG | Conteudo` (REACH, funcionando) — valores confirmados lendo o conjunto real.

### Campanha (`meta_create_campaign`)
| Campo | Valor | |
|---|---|---|
| `objective` | `OUTCOME_AWARENESS` | ✅ |

### Conjunto (`meta_create_adset`)
| Campo | Valor | |
|---|---|---|
| **Meta de desempenho** (`optimization_goal`) | `REACH` (Maximizar alcance) · `IMPRESSIONS` (Maximizar impressões) · `AD_RECALL_LIFT` (Maximizar lembrança) | 🔧 as 3 opções da tela; GBella usa REACH |
| `billing_event` | `IMPRESSIONS` | ✅ |
| **Meta de custo por resultado** | vazio = `bid_strategy=LOWEST_COST_WITHOUT_CAP`; com meta = `bid_strategy=COST_CAP` + `bid_amount` (centavos) | 🔧 GBella está sem meta (LOWEST_COST) |
| **Controle de frequência** (`frequency_control_specs`) | `[{event:"IMPRESSIONS", interval_days:N, max_frequency:M, type:"CAP"|"TARGET"}]` — **`CAP`=Limite** (máx. M/N dias), **`TARGET`=Alvo** (frequência média). GBella: `[{event:"IMPRESSIONS",interval_days:7,max_frequency:2,type:"CAP"}]` | 🔧 |
| `daily_budget` | centavos | 🔧 (GBella 732 = R$7,32/dia) |

### Targeting
Mesma base do padrão de Perfil (Advantage off, exclusões, `publisher_platforms:["instagram"]`,
`instagram_positions` completos). Aqui GBella NÃO exclui SEGUIDORES (é topo aberto por conteúdo). 🔧

### Criativo / Anúncio
Criativo normal de conteúdo (imagem/vídeo). Mesmos padrões de aprimoramento
(`disable_creative_enhancements:true`, `multi_advertiser_ads` a decidir). Sem banner de perfil aqui.

### Destino de mensagem no anúncio (opcional) — ✅ TESTADO E FUNCIONA VIA API
Numa campanha de Alcance dá pra adicionar um **destino de mensagem** ("Adicionar um destino"
→ Apps de mensagens) que manda quem clica pro **Instagram Direct** ou **WhatsApp**. Confirmado
por teste PAUSED real (GBella Bijoux, jul/2026): **o conjunto continua `REACH`, SEM precisar de
`destination_type` nem `promoted_object`** — o destino é só um `call_to_action` no criativo
(`object_story_spec.link_data`). O MCP já faz isso hoje (object_story_spec é campo livre no `meta_create_creative`).

- **Instagram Direct** ("Enviar mensagem no Instagram"):
  `call_to_action: { type: "INSTAGRAM_MESSAGE", value: { app_destination: "INSTAGRAM_DIRECT" } }`,
  `link: "https://instagram.com/<usuario>"`.
- **WhatsApp** ("Enviar mensagem no WhatsApp"):
  `call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } }`,
  `link: "https://api.whatsapp.com/send"` (usa o número de WhatsApp conectado à Página).
- `link_data.name` = **Título** (ex.: "Fale com uma consultora"); `link_data.message` = **Texto principal**.
- ⚠️ Diferente do banner de perfil (esse NÃO é API): o destino de mensagem no anúncio é
  `call_to_action` padrão e é aceito de primeira, inclusive em conjunto `REACH`.
- Multi-destino (Instagram + WhatsApp juntos, com o usuário escolhendo) não foi testado — o teste
  cobriu cada um isolado. Se precisar dos dois no mesmo anúncio, validar à parte.

> **Variante em produção:** Beco Mágico "OFERTA CHOPP — ALCANCE" usa
> `optimization_goal=IMPRESSIONS` (não REACH). As duas são válidas — REACH prioriza pessoas
> únicas, IMPRESSIONS prioriza volume de exibições. Confirmar com o gestor qual usar por campanha.

---

## CONVERSAS / WHATSAPP (mensagens)

Objetivo de negócio: fazer a pessoa **iniciar conversa no WhatsApp** (Direct/Messenger também
possíveis). ✅ **Testado via API (GBella Bijoux, jul/2026, PAUSED) — Lead e Engajamento.**

**Padrão de objetivo (confirmado nas contas + Meta 2026):** o padrão é **Engajamento**. Sob
Leads também funciona (variante de maior intenção). **Vendas fica FORA** do nosso escopo — só
compensa com Conversions API do WhatsApp madura, que não temos. Ver [[meta-whatsapp-profile-banner-limite]]
não confundir: aquele é o banner no perfil; ESTE é o anúncio de conversa em si.

### Descoberta-chave
**Lead e Engajamento têm o CONJUNTO IDÊNTICO** — a única diferença é o `objective` da campanha:

| Campo | Engajamento | Lead |
|---|---|---|
| Campanha `objective` | `OUTCOME_ENGAGEMENT` | `OUTCOME_LEADS` |
| Conjunto `optimization_goal` | `CONVERSATIONS` | `CONVERSATIONS` (mesmo!) |
| Conjunto `destination_type` | `WHATSAPP` | `WHATSAPP` |
| Conjunto `promoted_object` | `{page_id}` (a Meta completa `smart_pse_enabled:false`) | `{page_id}` |
| Conjunto `billing_event` | `IMPRESSIONS` | `IMPRESSIONS` |

⚠️ **Não existe otimização "de lead" pra conversa:** testei `QUALITY_LEAD`, `LEAD_GENERATION`,
`QUALITY_CALL` sob `OUTCOME_LEADS`+`WHATSAPP` — **todas recusadas**. `CONVERSATIONS` é a única
válida nos dois. (`LEAD_GENERATION` é de formulário instantâneo, não mensagem, e exige a Página
aceitar os Termos de Cadastro.) Ou seja: o que muda entre Lead e Engajamento é como a Meta
**classifica/otimiza a entrega** pelo objetivo, não a mecânica do conjunto.

### Criativo (`meta_create_creative`)
Mesmo CTA de mensagem do destino de Alcance:
`call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } }`,
`link: "https://api.whatsapp.com/send"`, `link_data.name` = título, `link_data.message` = texto.
(Para Instagram Direct em vez de WhatsApp: `INSTAGRAM_MESSAGE` / `INSTAGRAM_DIRECT`, e o conjunto
usaria `destination_type` correspondente.)

### Automação
✅ Totalmente automatizável pelo MCP hoje (nada trava, diferente do banner). `promoted_object` e
`destination_type` já são aceitos pelo `meta_create_adset`.

---

## LEAD via SITE/PIXEL (conversão)

Objetivo de negócio: gerar leads no site, medidos pelo pixel. Referência viva:
**Beco Mágico João Pessoa** (`act_714929380905651`), campanha `[FUNDO] Lead - Remarketing`,
conjunto `[Engajados 180D] [M/F] [20/55]` — valores confirmados lendo o conjunto real.

### Campanha (`meta_create_campaign`)
| Campo | Valor | |
|---|---|---|
| `objective` | `OUTCOME_LEADS` | ✅ (sem CBO, o MCP já aplica `is_adset_budget_sharing_enabled=false`) |

### Conjunto (`meta_create_adset`)
| Campo da tela | Valor | |
|---|---|---|
| Local da conversão: **Site** | `destination_type: WEBSITE` | ✅ |
| Meta: **Maximizar leads** | `optimization_goal: OFFSITE_CONVERSIONS` | ✅ |
| Conjunto de dados (pixel) | `promoted_object.pixel_id: 959959936733237` (**"BM - João Pessoa"** — o CERTO, não o `1152329512893185`) | ✅ ⚠️ ver [[feedback-meta-pixel-selection]] |
| Evento de conversão | `promoted_object.custom_event_type: "LEAD"` | ✅ |
| `billing_event` | `IMPRESSIONS` | ✅ |
| Idade 20-55 + Advantage off | `targeting` age + `targeting_automation.individual_setting` | ✅/🔧 |
| Exclusão de leads | `excluded_custom_audiences: [{id do "[PG] - [PIXEL] - [LEAD] - 180D"}]` | ✅ |

`promoted_object` completo aceito: `{pixel_id, custom_event_type:"LEAD"}` (a Meta completa `smart_pse_enabled:false`).

### Criativo / Anúncio
Destino Site: `object_story_spec.link_data` (ou `video_data`) com
`call_to_action: { type: "LEARN_MORE", value: { link: "<url>", link_caption: "<link de exibição>" } }`.
O `link_caption` = "Link de exibição" da tela.

### ⚠️ "Complementos para navegador → WhatsApp" (botão de WhatsApp no anúncio de site)
Investigado a fundo (Beco JP, jul/2026, diff anúncio COM × cópia SEM):
- **É um campo REAL do criativo** (diferente do banner de perfil): `asset_feed_spec: { message_extensions: [{ type: "whatsapp" }] }`. Tirar o add-on remove o `asset_feed_spec` inteiro.
- **MAS a API dá erro `#3` "Application does not have the capability"** ao criar com esse campo — testado nos DOIS apps (token de usuário E app do MCP em produção). É uma **capability de Marketing Partner** que nenhum app tem. O Gerenciador tem (por isso os anúncios reais têm o add-on).
- **Conclusão:** por ora, esse add-on é **só-Gerenciador**. Diferente do banner de perfil, aqui é editável em anúncio existente (dá pra duplicar e ligar/desligar) — não exige rascunho. **Divisão:** MCP cria a campanha de Lead 100% (pixel, evento, exclusões, site); o gestor liga o botão de WhatsApp nos anúncios pelo Gerenciador. Poderia destravar via API se o app obtiver a capability de Marketing Partner da Meta (processo de aprovação, não código).

### Pendente
- "Gasto em posicionamentos excluídos" (Meta força opt-in em campanhas de Lead) — campo de API ainda não mapeado; investigar quando for relevante.

---

## ENGAJAMENTO (dois subtipos)

Ambos usam `objective: OUTCOME_ENGAGEMENT` e terminam com `destination_type: ON_POST`
(engajamento acontece NO anúncio, não num destino externo). ⚠️ **A diferença crítica é COMO
setar o `ON_POST`** — muda por causa do `optimization_goal`. Valores confirmados lendo os
conjuntos reais do Beco Mágico JP (`act_714929380905651`), jul/2026.

### A) Engajamento no anúncio — POST_ENGAGEMENT (comentário/curtida/compartilhar)
Referência: campanha `[AQUECIDOS] LAL + RMKT`, conjunto `LAL + RMKT - [M/F] [20/55]`.
Resultado medido em **"Engajamentos com..."**.

| Campo | Valor | |
|---|---|---|
| `optimization_goal` | `POST_ENGAGEMENT` | ✅ |
| `destination_type` | `ON_POST` — **setar DIRETO no `create_adset`** | ✅ ⚠️ sem ele a Meta assume destino Site e **todo `create_ad` falha**. Ver [[meta-post-engagement-promoted-object]] |
| `billing_event` | `IMPRESSIONS` | ✅ |
| `promoted_object` | nenhum | ✅ |
| Estrutura | 1 conjunto reaproveitando os melhores anúncios em público **LAL + RMKT** (quente), excluindo `[PG]-[PIXEL]-[LEAD]-180D` | 🔧 |

### B) Engajamento ThruPlay — THRUPLAY (visualização de vídeo)
Referência: campanha `[TOPO] Teste de Criativo e Público`, vários conjuntos `THRUPLAY`.
Resultado medido em **"ThruPlays"** (vídeo assistido até ~15s/completo).

| Campo | Valor | |
|---|---|---|
| `optimization_goal` | `THRUPLAY` | ✅ |
| `destination_type` | `ON_POST` — **NÃO passar no `create_adset`** (a Meta rejeita: "meta de desempenho incompatível"). Criar o conjunto SEM e aplicar `ON_POST` via `meta_update_object` DEPOIS | ✅ ⚠️ pegadinha oposta à do POST_ENGAGEMENT. Ver [[beco-magico-joao-pessoa-estrutura]] |
| `billing_event` | `IMPRESSIONS` | ✅ |
| Estrutura | **1 vídeo isolado por conjunto** (cada um roda igual, orçamento próprio), público **aberto** (broad + exclusão de leads) | 🔧 |
| Criativo | `video_data`; CTA pode ser `LEARN_MORE` + link do site (o anúncio otimiza ThruPlay, mas o botão leva ao site) | 🔧 |

> ⚠️ Criar anúncio em conjunto de engajamento com criativo de post: ver a pegadinha de
> `video_data` vs `link_data`/`photo_data` sintético em [[meta-conversations-adset-creative-limite]].

---

## Cobertura

Os 5 tipos acima cobrem todo o repertório ativo da operação: **Perfil, Alcance,
Conversas, Lead via site/pixel e Engajamento** (no anúncio + ThruPlay). O **Lead nativo /
formulário instantâneo (`LEAD_GENERATION`) fica FORA de escopo** — não é usado nas contas.

Para adicionar um tipo novo no futuro: sempre com exemplo real de conta e valores
**confirmados por leitura** (não de cabeça), no mesmo formato ✅/🔧/⚠️.
