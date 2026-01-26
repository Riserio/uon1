
# Plano: Correção da Seleção de Layout e Filtros na Automação Hinova

## Status: ✅ IMPLEMENTADO

---

## Objetivo
Garantir que o script de automação Hinova selecione corretamente o layout **"BI - VANGARD COBRANÇA"** na seção **"Dados Visualizados"**, e documentar todos os filtros que estão sendo aplicados.

---

## Problema Identificado

Com base na imagem compartilhada e nos logs, o layout está localizado na seção **"Dados Visualizados"** com:
- **Label:** "Layout:"
- **Opções:** "--- SELECIONE ---", "BI - VANGARD COBRANÇA", "CHATBOT", "POS VENDA COBRANÇA"

O script anterior buscava por atributos `name` ou `id` contendo "layout", "visualiza" ou "dados", mas não encontrava o seletor correto.

---

## Alterações Implementadas

### 1. ✅ Nova Lógica de Seleção do Layout (4 Estratégias)

**Arquivo:** `scripts/robo-cobranca-hinova.cjs`

**Estratégias de busca (em ordem de prioridade):**

1. **LABEL_LAYOUT** - Buscar TD/Label com texto exato "Layout:" e selecionar o `<select>` na mesma linha
2. **SECAO_DADOS_VISUALIZADOS** - Localizar a seção "Dados Visualizados" e encontrar o select com a opção BI-Vangard
3. **VARREDURA_OPCOES** - Iterar todos os selects da página buscando a opção "BI - VANGARD COBRANÇA"
4. **FALLBACK_NAME_ID** - Busca por atributos `name`/`id` contendo "layout"

### 2. ✅ Seleção de Layout OBRIGATÓRIA

Se o layout "BI - VANGARD COBRANÇA" não puder ser selecionado, o script agora:
- Lança erro crítico
- Salva screenshot de diagnóstico com todas as opções encontradas
- Lista todos os selects e suas opções
- **NÃO prossegue com o download**

### 3. ✅ Sumário Visual de Filtros Antes do Download

Antes de gerar o relatório, o script exibe:

```
══════════════════════════════════════════════════════════════
📋 SUMÁRIO DE FILTROS APLICADOS
══════════════════════════════════════════════════════════════
   ✅ Data Vencimento Original: 01/01/2026 a 31/01/2026
   ✅ Layout: BI - VANGARD COBRANÇA
   ✅ Cooperativa - TODOS: MARCADO
   ✅ Forma Exibição: Em Excel
   ℹ️ Boletos Anteriores: NÃO POSSUI (configurado)
   ℹ️ Referência: VENCIMENTO ORIGINAL (configurado)
══════════════════════════════════════════════════════════════
```

---

## Resumo dos Filtros Aplicados

| Filtro | Comportamento | Obrigatório | Validação |
|--------|--------------|-------------|-----------|
| **Data Vencimento Original** | Preenche 01/MM/AAAA a DD/MM/AAAA (mês atual) | ✅ Sim | ❌ Erro se falhar |
| **Layout** | Seleciona "BI - VANGARD COBRANÇA" | ✅ Sim | ❌ Erro se falhar |
| **Cooperativa** | Marca checkbox "TODOS" | ⚠️ Warning | ⚠️ Aviso se falhar |
| **Situação Boleto** | Marca: ABERTO, BAIXADO, etc. Desmarca: CANCELADO | ⚠️ Warning | ⚠️ Aviso se falhar |
| **Forma de Exibição** | Seleciona "Em Excel" | ✅ Sim | Sempre aplica |
| **Boletos Anteriores** | Seleciona "NÃO POSSUI" | ℹ️ Opcional | Não bloqueia |
| **Referência** | Seleciona "VENCIMENTO ORIGINAL" | ℹ️ Opcional | Não bloqueia |

---

## Resultado Esperado

Após estas mudanças:
1. ✅ O layout "BI - VANGARD COBRANÇA" será selecionado corretamente
2. ✅ O relatório terá todas as colunas preenchidas (incluindo Cooperativa)
3. ✅ Se qualquer filtro obrigatório falhar, o script aborta com erro claro
4. ✅ Logs detalhados mostrarão o estado de cada filtro antes do download
5. ✅ Screenshot de diagnóstico salvo para análise

---

## Próximos Passos

Execute o script localmente ou via GitHub Actions para validar:
```bash
node scripts/robo-cobranca-hinova.cjs
```

Verifique:
1. O log deve mostrar "✅ Layout selecionado com sucesso!"
2. O sumário deve mostrar todos os filtros como ✅
3. O arquivo Excel deve ter a coluna "Cooperativa" preenchida
