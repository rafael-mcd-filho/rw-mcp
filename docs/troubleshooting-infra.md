# Troubleshooting de infraestrutura

Notas de incidentes reais de configuração/deploy (não bugs de código) — pra não repetir o mesmo debug do zero da próxima vez.

## MinIO: env vars corretas + deploy novo, mas `list_minio_files` falha com "The specified bucket is not valid"

**Sintoma:** `list_minio_files` (e qualquer `minio_key` em `meta_create_image`/`meta_create_video`) retorna `The specified bucket is not valid`, mesmo com:
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` presentes no ambiente **Production** da Vercel (`vercel env ls`);
- um deploy novo feito **depois** de adicionar/editar essas vars, já aliasado no domínio de produção (`vercel inspect <deployment>` mostra `rw-mcp.vercel.app` nos aliases);
- as mesmas credenciais testadas **direto contra o MinIO**, fora da Vercel (script Node com `@aws-sdk/client-s3`, sem passar pelo servidor), funcionando perfeitamente.

**Causa:** os valores foram digitados/colados manualmente no dashboard da Vercel em algum momento anterior e provavelmente carregavam um artefato de colagem (espaço ou quebra de linha invisível). `vercel env ls` só mostra "Encrypted"/"Sensitive" — nunca o valor real — então não dá pra auditar visualmente se o valor gravado está "sujo". Não existe outro jeito de confirmar exceto recriar.

**Fix:**

```bash
# apaga as 4 vars de Production
for v in MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_BUCKET; do
  npx -y vercel@latest env rm "$v" production --yes
done

# recria com valor limpo — o pipe evita qualquer artefato de terminal/clipboard
printf '%s' "https://s3.rwsolucoesdigitais.com" | npx -y vercel@latest env add MINIO_ENDPOINT production
printf '%s' "<access-key>"                       | npx -y vercel@latest env add MINIO_ACCESS_KEY production
printf '%s' "<secret-key>"                       | npx -y vercel@latest env add MINIO_SECRET_KEY production
printf '%s' "metaads"                            | npx -y vercel@latest env add MINIO_BUCKET production

# redeploy pra pegar os valores frescos
npx -y vercel@latest --prod --yes
```

**Lição geral:** se uma env var "parece certa" (existe, foi deployada) mas o comportamento em produção não bate com o mesmo valor testado manualmente, suspeitar de corrupção silenciosa no valor gravado antes de investigar cache de deploy, CDN ou o conector MCP. Apagar e recriar via CLI com `printf | vercel env add` é mais rápido e mais conclusivo do que tentar auditar um valor que a própria Vercel não deixa reler.

`npx -y vercel@latest` funciona sem instalação prévia — a CLI já vem autenticada no ambiente onde isso foi resolvido (não precisa de login manual).

## Meta Ads: `THRUPLAY` (OUTCOME_AWARENESS) aceita criar sem `promoted_object`, mas trava depois

Criar um ad set com `optimization_goal: THRUPLAY` **sem** `promoted_object` não dá erro nenhum na hora — a API deixa criar normalmente. O problema aparece depois: no Ads Manager, o campo "Página do Facebook" do conjunto fica em branco e **não dá pra editar** (mesmo sintoma de campo travado, só que sem a API avisar na criação).

**Fix:** incluir `promoted_object: {page_id: "..."}` já na chamada de criação do ad set, mesmo quando a API aceitaria sem. Se o conjunto já foi criado sem isso, não tem update que resolva — precisa apagar os anúncios, apagar o conjunto e recriar do zero (os criativos em si não precisam ser recriados, só os ad sets e os ads).
