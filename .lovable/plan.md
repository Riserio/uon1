

# Corrigir Placas Duplicadas no Kanban de Gestão Associação

## Problema Identificado

As placas aparecem repetidas porque:
1. **A consulta do Kanban não filtra pela importação ativa** — busca eventos de TODAS as importações (ativas e inativas), mas cada importação cria registros novos para as mesmas placas
2. **Exemplo real:** A placa FHL4969 tem 15 registros no banco, espalhados por diferentes importações. No status "ABERTO APP" existem 1.442 registros mas apenas 53 placas únicas

## Solução

Adicionar o filtro `sga_importacoes.ativo = true` na consulta do Kanban, garantindo que apenas os eventos da importação mais recente (ativa) sejam exibidos.

### Alteração necessária

**Arquivo:** `src/components/gestao-associacao/GestaoAssociacaoKanban.tsx`

Na função `fetchAllBatched`, adicionar `.eq('sga_importacoes.ativo', true)` à query, logo após o `.in('situacao_evento', activeStatusNames)`. Isso filtra os eventos apenas da importação ativa de cada associação.

### Detalhes Técnicos

```text
Query atual (simplificada):
  sga_eventos
    -> JOIN sga_importacoes (inner)
    -> WHERE situacao_evento IN (...)
    -> WHERE corretora_id = X   (se filtrado)

Query corrigida:
  sga_eventos
    -> JOIN sga_importacoes (inner)
    -> WHERE sga_importacoes.ativo = true    <-- NOVO
    -> WHERE situacao_evento IN (...)
    -> WHERE corretora_id = X   (se filtrado)
```

Essa mesma correção deve ser verificada em outros componentes que consultam `sga_eventos` com join de importações (como o SGADashboard/SGATabela), mas o foco principal é o Kanban onde o problema é visível.

