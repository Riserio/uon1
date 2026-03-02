
# Plano: Atualizar Relatório do Mês Anterior nos Primeiros 5 Dias

## Contexto do Problema
Hoje o robô de cobrança busca boletos apenas do mês corrente (dia 1 até último dia). Porém, boletos de fevereiro podem ser pagos até ~dia 5 de março. Sem atualizar o relatório de fevereiro, os números de inadimplência ficam inflados.

## Solução

### 1. Modificar `getDateRange()` no script do robô (`scripts/robo-cobranca-hinova.cjs`)
- Se o dia atual for **<= 5**, retornar **duas** faixas de datas: mês anterior + mês atual
- A função passará a retornar um array de períodos em vez de um único período

### 2. Executar o robô duas vezes quando dia <= 5
- Na função principal `rodarRobo()`, quando estivermos nos primeiros 5 dias do mês:
  - **Primeira execução**: Buscar dados do mês anterior (01/MM-1 até último dia do mês anterior), enviando `mes_referencia` do mês anterior
  - **Segunda execução**: Buscar dados do mês atual normalmente
- Cada execução faz login, aplica filtros, baixa e envia separadamente

### 3. Modificar o webhook (`supabase/functions/webhook-cobranca-hinova/index.ts`) para suportar **atualização** do mês anterior
- Adicionar um campo `modo` no payload: `"substituir"` (padrão atual) ou `"atualizar_anterior"`
- Quando `modo = "atualizar_anterior"`:
  - Buscar a importação existente do mês anterior (em vez de desativá-la)
  - Deletar os boletos existentes dessa importação e inserir os novos dados atualizados
  - Manter essa importação como `ativo = false` (a do mês atual é a ativa)
  - Isso garante que o dashboard do mês anterior reflita pagamentos feitos nos primeiros dias do novo mês

### 4. Ajustar `gerar-resumo-cobranca` (Edge Function)
- Sem alteração necessária: o resumo já usa apenas a importação `ativo = true`, que será a do mês corrente. O mês anterior fica com seus dados atualizados para consulta histórica.

## Detalhes Técnicos

```text
Fluxo atual (dia 10 de março):
  Robot → getDateRange() → 01/03 a 31/03 → webhook (substitui tudo)

Novo fluxo (dia 3 de março):
  Robot → getDateRange() → [
    { inicio: 01/02, fim: 28/02, modo: "atualizar_anterior" },  ← atualiza fev
    { inicio: 01/03, fim: 31/03, modo: "substituir" }            ← cria mar normal
  ]
  
Novo fluxo (dia 10 de março):
  Robot → getDateRange() → [
    { inicio: 01/03, fim: 31/03, modo: "substituir" }            ← só março
  ]
```

### Arquivos a alterar
1. **`scripts/robo-cobranca-hinova.cjs`** — `getDateRange()` retorna array de períodos; `rodarRobo()` itera por cada período fazendo filtro/download/envio
2. **`supabase/functions/webhook-cobranca-hinova/index.ts`** — suporte a `modo: "atualizar_anterior"` que busca importação existente do mês anterior e atualiza seus boletos (delete + insert)
