
# Plano: Filtros Configuráveis para Automação Hinova

## Resumo Executivo
Adicionar uma seção de **"Filtros do Relatório"** na tela de configuração da Automação Hinova, permitindo que cada associação defina exatamente quais filtros aplicar durante a extração.

## Situação Atual

### Filtros Hardcoded no Script
O robô atualmente usa valores **fixos** para os seguintes filtros:

| Filtro | Valor Atual | Configurável? |
|--------|-------------|---------------|
| Data Vencimento Original | Mês atual (01/MM/YYYY - último dia) | Não |
| Situação Boleto | TODOS os checkboxes marcados | Não |
| Boletos Anteriores | NÃO POSSUI | Não |
| Referência | VENCIMENTO ORIGINAL | Não |
| Layout | BI - Vangard Cobrança | Sim (já existe) |
| Forma de Exibição | Em Excel | Não |

---

## Proposta de Solução

### 1. Novos Campos na Tabela de Configuração
Adicionar colunas para armazenar as preferências de filtros:

```text
┌─────────────────────────────────────────────────────────────┐
│  NOVOS CAMPOS: cobranca_automacao_config                   │
├─────────────────────────────────────────────────────────────┤
│ filtro_periodo_tipo      TEXT   - 'mes_atual', 'customizado'│
│ filtro_data_inicio       DATE   - Data inicial (se custom)  │
│ filtro_data_fim          DATE   - Data final (se custom)    │
│ filtro_situacoes         JSONB  - ['ABERTO', 'BAIXADO', ...] │
│ filtro_boletos_anteriores TEXT  - 'nao_possui', 'possui', ..│
│ filtro_referencia        TEXT   - 'vencimento_original', ...│
│ filtro_regionais         JSONB  - ['Regional SP', ...]      │
│ filtro_cooperativas      JSONB  - ['Cooperativa X', ...]    │
└─────────────────────────────────────────────────────────────┘
```

### 2. Interface de Configuração
Nova aba/seção "Filtros do Relatório" com:

```text
┌─────────────────────────────────────────────────────────────┐
│  FILTROS DO RELATÓRIO                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📅 Período de Vencimento Original                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ (●) Mês atual                                        │   │
│  │ (○) Período customizado                              │   │
│  │     De: [__/__/____]  Até: [__/__/____]              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  📋 Situação do Boleto                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [x] ABERTO     [x] BAIXADO    [ ] CANCELADO          │   │
│  │ [ ] VENCIDO    [ ] PROTESTADO [ ] RENEGOCIADO        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  📦 Boletos Anteriores                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [Dropdown: NÃO POSSUI / POSSUI / TODOS ▼]            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  🎯 Referência                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [Dropdown: VENCIMENTO ORIGINAL / DATA PAGAMENTO ▼]   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ℹ️ Filtros regionais e por cooperativa dependem do        │
│     portal Hinova e serão marcados automaticamente.        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Exibição dos Filtros Ativos
Card resumo mostrando os filtros configurados:

```text
┌─────────────────────────────────────────────────────────────┐
│  🔍 FILTROS ATIVOS                                          │
├─────────────────────────────────────────────────────────────┤
│ • Período: Mês atual (01/01/2026 - 31/01/2026)              │
│ • Situações: ABERTO, BAIXADO                                │
│ • Boletos Anteriores: NÃO POSSUI                            │
│ • Referência: VENCIMENTO ORIGINAL                           │
│ • Layout: BI - Vangard Cobrança                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Alterações Técnicas

### Banco de Dados (Migração)
```sql
ALTER TABLE public.cobranca_automacao_config
ADD COLUMN IF NOT EXISTS filtro_periodo_tipo text DEFAULT 'mes_atual',
ADD COLUMN IF NOT EXISTS filtro_data_inicio date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS filtro_data_fim date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS filtro_situacoes jsonb DEFAULT '["ABERTO"]'::jsonb,
ADD COLUMN IF NOT EXISTS filtro_boletos_anteriores text DEFAULT 'nao_possui',
ADD COLUMN IF NOT EXISTS filtro_referencia text DEFAULT 'vencimento_original';
```

### Arquivos a Modificar

1. **`src/components/cobranca/CobrancaAutomacaoConfig.tsx`**
   - Adicionar nova seção "Filtros do Relatório"
   - Campos para período (radio + date pickers)
   - Checkboxes para situações de boleto
   - Dropdowns para boletos anteriores e referência
   - Card de resumo com filtros ativos

2. **`scripts/robo-cobranca-hinova.cjs`**
   - Receber configurações de filtros via ENV ou webhook
   - Aplicar situações específicas ao invés de marcar TODOS
   - Usar datas customizadas quando configurado
   - Aplicar valores corretos nos dropdowns

3. **`supabase/functions/executar-cobranca-hinova/index.ts`**
   - Buscar configurações de filtros da tabela
   - Passar filtros como variáveis de ambiente para o script

### Tipagem TypeScript
```typescript
interface FiltrosRelatorio {
  periodo_tipo: 'mes_atual' | 'customizado';
  data_inicio?: string;
  data_fim?: string;
  situacoes: string[]; // ['ABERTO', 'BAIXADO', etc]
  boletos_anteriores: 'nao_possui' | 'possui' | 'todos';
  referencia: 'vencimento_original' | 'data_pagamento';
}
```

---

## Lista de Situações de Boleto (Hinova)
Com base no portal, as opções típicas são:
- ABERTO
- BAIXADO  
- CANCELADO
- VENCIDO
- PROTESTADO
- RENEGOCIADO
- EM CARTÓRIO

---

## Sequência de Implementação

1. **Migração do banco** - Adicionar novas colunas
2. **Atualizar interface** - CobrancaAutomacaoConfig.tsx com seção de filtros
3. **Atualizar Edge Function** - Passar filtros para o script
4. **Atualizar script** - Aplicar filtros configuráveis

---

## Resultado Esperado
- Usuário pode escolher quais situações de boleto filtrar
- Usuário pode definir período customizado
- Filtros são exibidos de forma clara na interface
- Script aplica exatamente os filtros configurados
- Redução drástica no tamanho dos arquivos baixados (apenas dados relevantes)
