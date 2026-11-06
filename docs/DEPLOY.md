# Como publicar mudanças no UONI

O backend (banco + edge functions) é **Lovable Cloud**. Não existe chave de
acesso do Supabase disponível para o GitHub — por isso o GitHub **não publica**
nada sozinho. O código entra pelo GitHub (PR → main); o Lovable sincroniza; a
publicação é feita conforme o tipo de mudança:

| Mudou… | Como vai para produção | Custo |
|---|---|---|
| `supabase/functions/<nome>` (edge function) | Mensagem curta ao agente do Lovable: "Somente DEPLOY … publique `<nome>` …" (o run do GitHub Actions *Edge functions — checagem* já traz a mensagem pronta e a lista de funções) | ~1 crédito por mensagem (agrupe várias funções numa só) |
| `drizzle/migrations/*.sql` (banco) | Aplicar o SQL no banco (via Lovable: "aplique a migração X sem modificações", ou SQL direto pelo conector do Lovable). Escreva migrations **idempotentes**. | 0–1 crédito |
| `src/` (telas) | **Publish** do projeto no Lovable | — |

## Regras

- Código só pelo GitHub — não pedir ao agente do Lovable para escrever código.
- Na mensagem de deploy, sempre: confirmar o commit sincronizado, "não altere
  arquivos", "se houver erro de tipo, me diga em vez de corrigir".
- O workflow `.github/workflows/edge-functions-check.yml` roda `deno check` nas
  funções alteradas em todo PR. Erro de tipo ali = o Lovable vai recusar a
  publicação; corrija no PR antes do merge.
- Depois de publicar, valide chamando a função (ex.: relatório em modo
  "gerar sem enviar") antes de considerar resolvido.

## Histórico

Até 06/11/2026 existia um workflow `deploy-supabase-functions.yml` que tentava
`supabase functions deploy`. Ele **nunca publicou nada**: o secret
`SUPABASE_ACCESS_TOKEN` nunca existiu, e até 15/10 o erro era escondido
(`|| echo FALHOU`), deixando o run verde. Todas as publicações reais sempre
foram feitas pelo agente do Lovable.
