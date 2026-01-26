
# Plano: Correção da Seleção de Layout e Filtros na Automação Hinova

## Objetivo
Garantir que o script de automação Hinova selecione corretamente o layout **"BI - VANGARD COBRANÇA"** na seção **"Dados Visualizados"**, e documentar todos os filtros que estão sendo aplicados.

---

## Problema Identificado

Com base na imagem compartilhada e nos logs, o layout está localizado na seção **"Dados Visualizados"** com:
- **Label:** "Layout:"
- **Opções:** "--- SELECIONE ---", "BI - VANGARD COBRANÇA", "CHATBOT", "POS VENDA COBRANÇA"

O script atual busca por atributos `name` ou `id` contendo "layout", "visualiza" ou "dados", mas pode não estar encontrando o seletor correto.

---

## Alterações Planejadas

### 1. Reformular Lógica de Seleção do Layout

**Arquivo:** `scripts/robo-cobranca-hinova.cjs`

**Estratégias de busca (em ordem de prioridade):**

1. **Buscar pelo texto exato "Layout:"** - Encontrar um `<td>` ou `<label>` contendo "Layout:" e selecionar o `<select>` adjacente
2. **Buscar na seção "Dados Visualizados"** - Localizar a seção por texto e encontrar o primeiro `<select>` dentro dela
3. **Buscar por opções do select** - Iterar todos os selects e verificar se contém a opção "BI - VANGARD COBRANÇA"
4. **Fallback por atributos** - Manter a busca atual por `name`/`id`

```text
┌─────────────────────────────────────────────────┐
│            Lógica de Seleção Layout             │
├─────────────────────────────────────────────────┤
│ 1. Buscar TD/Label com texto "Layout:"          │
│    └─> Pegar <select> na mesma linha/container  │
│                                                 │
│ 2. Buscar seção "Dados Visualizados"            │
│    └─> Pegar primeiro <select> dentro           │
│                                                 │
│ 3. Iterar todos os <select>                     │
│    └─> Verificar se opção "BI - VANGARD" existe │
│                                                 │
│ 4. Fallback: name/id contém "layout"            │
└─────────────────────────────────────────────────┘
```

### 2. Tornar Seleção de Layout OBRIGATÓRIA

Se o layout "BI - VANGARD COBRANÇA" não puder ser selecionado, o script deve:
- Lançar erro crítico
- Salvar screenshot de diagnóstico
- Listar todos os selects encontrados e suas opções
- **NÃO prosseguir com o download**

### 3. Adicionar Diagnóstico Completo de Filtros

Antes de gerar o relatório, o script deve logar:

| Filtro | Status | Valor |
|--------|--------|-------|
| Data Vencimento Original | ✅/❌ | 01/01/2026 a 31/01/2026 |
| Layout | ✅/❌ | BI - VANGARD COBRANÇA |
| Cooperativa | ✅/❌ | TODOS |
| Situação Boleto | ✅/❌ | ABERTO, BAIXADO, etc. |
| Forma Exibição | ✅/❌ | Em Excel |
| Boletos Anteriores | ✅/❌ | NÃO POSSUI |
| Referência | ✅/❌ | VENCIMENTO ORIGINAL |

---

## Detalhes Técnicos

### Código da Nova Lógica de Layout

```javascript
// ESTRATÉGIA 1: Buscar pelo texto "Layout:" adjacente
const labels = document.querySelectorAll('td, th, label, span');
for (const label of labels) {
  const texto = (label.textContent || '').trim();
  // Buscar exatamente "Layout:" ou "Layout"
  if (texto === 'Layout:' || texto === 'Layout') {
    // Procurar select na mesma linha (tr) ou próximo
    const row = label.closest('tr');
    const selectInRow = row?.querySelector('select');
    if (selectInRow) {
      // Encontrou! Selecionar "BI - VANGARD COBRANÇA"
      for (let i = 0; i < selectInRow.options.length; i++) {
        const optText = selectInRow.options[i].text.toUpperCase();
        if (optText.includes('BI') && optText.includes('VANGARD')) {
          selectInRow.selectedIndex = i;
          selectInRow.dispatchEvent(new Event('change', { bubbles: true }));
          return { sucesso: true, metodo: 'LABEL_LAYOUT', valor: optText };
        }
      }
    }
  }
}

// ESTRATÉGIA 2: Buscar seção "Dados Visualizados"
const secoes = document.querySelectorAll('td, th, div');
for (const secao of secoes) {
  const texto = (secao.textContent || '').toUpperCase();
  if (texto.includes('DADOS VISUALIZADOS')) {
    // Encontrar o select mais próximo
    const container = secao.closest('table, div, fieldset');
    const selects = container?.querySelectorAll('select') || [];
    for (const select of selects) {
      for (let i = 0; i < select.options.length; i++) {
        const optText = select.options[i].text.toUpperCase();
        if (optText.includes('BI') && optText.includes('VANGARD')) {
          select.selectedIndex = i;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { sucesso: true, metodo: 'SECAO_DADOS_VISUALIZADOS', valor: optText };
        }
      }
    }
  }
}

// ESTRATÉGIA 3: Varrer todos os selects buscando a opção correta
const todosSelects = document.querySelectorAll('select');
for (const select of todosSelects) {
  for (let i = 0; i < select.options.length; i++) {
    const optText = (select.options[i].text || '').toUpperCase();
    if (optText.includes('BI') && optText.includes('VANGARD') && optText.includes('COBRANCA')) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { sucesso: true, metodo: 'VARREDURA_OPCOES', valor: optText };
    }
  }
}
```

### Validação Obrigatória Após Seleção

```javascript
if (!layoutSelecionado.sucesso) {
  // Lançar erro crítico - NÃO gerar relatório sem layout correto
  const erro = `ERRO CRÍTICO: Layout "BI - VANGARD COBRANÇA" não encontrado!`;
  log(erro, LOG_LEVELS.ERROR);
  
  // Diagnóstico: listar todos os selects e opções
  const diagnostico = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('select')).map(s => ({
      name: s.name || s.id || 'sem-nome',
      opcoes: Array.from(s.options).map(o => o.text)
    }));
  });
  log(`Selects encontrados: ${JSON.stringify(diagnostico)}`, LOG_LEVELS.DEBUG);
  
  await saveDebugInfo(page, context, 'Layout não encontrado');
  throw new Error(erro);
}
```

---

## Resumo dos Filtros Aplicados

| Filtro | Comportamento | Obrigatório |
|--------|--------------|-------------|
| **Data Vencimento Original** | Preenche 01/MM/AAAA a DD/MM/AAAA (mês atual) | ✅ Sim |
| **Layout** | Seleciona "BI - VANGARD COBRANÇA" | ✅ Sim |
| **Cooperativa** | Marca checkbox "TODOS" | ✅ Sim |
| **Situação Boleto** | Marca: ABERTO, BAIXADO, etc. Desmarca: CANCELADO | ✅ Sim |
| **Forma de Exibição** | Seleciona "Em Excel" | ✅ Sim |
| **Boletos Anteriores** | Seleciona "NÃO POSSUI" | ⚠️ Opcional |
| **Referência** | Seleciona "VENCIMENTO ORIGINAL" | ⚠️ Opcional |

---

## Resultado Esperado

Após implementar estas mudanças:
1. O layout "BI - VANGARD COBRANÇA" será selecionado corretamente
2. O relatório terá todas as colunas preenchidas (incluindo Cooperativa)
3. Se qualquer filtro obrigatório falhar, o script aborta com erro claro
4. Logs detalhados mostrarão o estado de cada filtro antes do download
