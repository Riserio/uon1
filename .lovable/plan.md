## Contexto (confirmado)

Arquivo único envolvido: `supabase/functions/importar-api-hinova/index.ts` — é ele que gera as importações `API base DD/MM/AAAA` em `cadastro_registros`/`estudo_base_registros` a partir do endpoint `/listar/veiculo` da Hinova, complementado pelo `/listar/associado` (só usado hoje para `cidade`, `estado`, `sexo`, `estado_civil`, `idade`).

O mapeamento das três colunas quebradas está aqui (helper `g()` na linha 458 — busca chave por chave no objeto raiz e depois em `o.veiculo` / `o.associado`):

- `cpf` (linha 544): `g(v, "cpf", "cpf_cnpj", "documento")`
- `regional` (linhas 557 e 587): `g(v, "regional", "nome_regional", "descricao_regional", "regional_nome", "regional_descricao")`
- `cooperativa` (linhas 558 e 586): idem com aliases de cooperativa

`nome`, `placa`, `cidade`, `estado`, `situacao` continuam sendo lidas do mesmo `v` e continuam preenchidas em produção — ou seja, o payload de `/listar/veiculo` continua chegando. O que mudou é que **essas três colunas específicas deixaram de vir dentro do objeto do veículo** (ou passaram a vir só na resposta de `/listar/associado`, ou com nomes que não estão na lista de aliases). É uma hipótese consistente com o corte temporal 10/07 → 13/07.

Diagnóstico não 100% confirmado: não temos como reproduzir a chamada crua aqui. Por isso o plano trata a causa provável **e** deixa evidência salva para confirmar/ajustar sem novo deploy.

## Mudança (escopo mínimo, só mapeamento)

Editar apenas `supabase/functions/importar-api-hinova/index.ts`, seção da importação de base (aprox. linhas 470–600). Nada fora disso.

1. **Enriquecer `assocMap` com `cpf`, `cooperativa` e `regional`** vindos de `/listar/associado`, aceitando os mesmos aliases usados no veículo mais aliases típicos do endpoint de associado:
   - CPF: `cpf`, `cpf_cnpj`, `cpf_associado`, `documento`, `numero_documento`, `nr_cpf`.
   - Cooperativa: `cooperativa`, `nome_cooperativa`, `descricao_cooperativa`, `cooperativa_nome`, `cooperativa_descricao`, `associacao`, `nome_associacao`, `descricao_associacao`.
   - Regional: `regional`, `nome_regional`, `descricao_regional`, `regional_nome`, `regional_descricao`, `regional_associado`.
   - Aplicar `nomeDe(...)` em cooperativa/regional (mantém compatibilidade com objeto `{codigo, descricao}`).

2. **Lookup tolerante a variações** — introduzir um helper local `pick(obj, ...keys)` que normaliza chave por `key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")` e testa contra as chaves do objeto normalizadas do mesmo jeito. Isso cobre variações reais que já vimos noutros pontos da API (`CPF/CNPJ`, `CPF do Associado`, `Associação`, acentos, camelCase, snake_case). Usar esse helper nas leituras dessas três colunas tanto no veículo quanto no associado.

3. **Fallback no map do cadastro/estudo de base** — para cada linha, se o campo vier vazio do `v`, cair para o valor guardado no `assocMap` (mesmo padrão que hoje já é usado para `cidade`/`estado`):
   ```
   cpf: pickCpf(v) || assocC?.cpf || null,
   cooperativa: nomeDe(pickCoop(v)) || assocC?.cooperativa || null,
   regional: nomeDe(pickReg(v)) || assocC?.regional || null,
   ```
   Aplicar nos dois mapeadores (`cadastro` e `eb`).

4. **Evidência para confirmar hipótese sem novo deploy** — a função já mantém `assocDebug.amostra_keys` com as chaves cruas do primeiro associado. Estender para também guardar `veicDebug.amostra_keys` (chaves do primeiro veículo) e incluir os dois no JSON de resposta atual (`assocDebug` já é logado internamente; expor `veicDebug` do mesmo jeito). Assim a próxima chamada da função mostra exatamente que nomes a API está devolvendo hoje e a gente confirma quais aliases faltavam.

Nada mais é tocado: sem migrations, sem mudar RLS, sem reprocessar importações antigas, sem alterar Cobrança/MGF/Eventos.

## Deploy

- Redeployar só `importar-api-hinova`.
- Não roda migration, não roda db push.
- Depois do deploy, forçar uma importação de base de qualquer associação e conferir em `cadastro_registros` (importação nova `API base DD/MM/AAAA`) se `cpf`, `cooperativa` e `regional` voltaram a preencher — e, se ainda houver campo vazio, ler `veicDebug.amostra_keys` / `assocDebug.amostra_keys` da resposta para ampliar aliases.

## Resposta ao usuário ao fim

Reportar: arquivo alterado (`supabase/functions/importar-api-hinova/index.ts`), causa (Hinova deixou de mandar essas 3 chaves dentro do objeto do veículo — o parser só olhava o veículo, e o associado só era consultado para cidade/estado/demografia), diff resumido (helper de lookup normalizado + aliases ampliados + fallback via `assocMap` para CPF/coop/regional + amostra de chaves na resposta para diagnóstico contínuo). Deixar registrado que registros antigos (13/07 em diante) continuam NULL — o novo mapeamento passa a valer para as próximas importações; não vamos reescrever dados já gravados.
