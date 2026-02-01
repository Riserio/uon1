

# Plano: Fechar automaticamente o popup de suporte Hinova no robô MGF

## Resumo do Problema
O popup de suporte do Hinova aparece durante a execução do robô MGF. Este popup pergunta "quantos minutos gostaria de liberar o usuário para o suporte" e possui dois botões: **"Liberar"** e **"Fechar"**. O robô precisa clicar automaticamente em "Fechar" quando este popup aparecer.

## Análise Técnica

### Popup Identificado
- Texto: "Informe quantos minutos gostaria de liberar o usuário da Hinova para o suporte"
- Dropdown: "Quanto tempo?"
- Botões: "Liberar" (não clicar) e "Fechar" (clicar para fechar)

### Situação Atual
O robô já possui uma função `fecharPopups()` que busca botões com texto "Fechar", mas:
1. Esta função só é chamada durante login e navegação inicial
2. O popup de suporte pode aparecer a qualquer momento (durante configuração de filtros, espera do download, etc.)
3. Há uma espera de 20 segundos após seleção de layout onde popups não são verificados

## Solução Proposta

### 1. Adicionar seletores específicos para o popup de suporte
Incluir seletores mais específicos para capturar o popup de suporte Hinova:
- Botões que contêm texto "Fechar" próximo a texto sobre "suporte"
- Seletores para caixas de diálogo com dropdown de tempo

### 2. Chamar `fecharPopups` em pontos estratégicos adicionais

| Local no Código | Linha Aproximada | Contexto |
|-----------------|------------------|----------|
| `configurarFiltros` - início | ~1564 | Antes de configurar checkboxes |
| `configurarFiltros` - após checkboxes | ~1673 | Após configurar Centro de Custo |
| `configurarFiltros` - durante espera layout | ~1685 | Durante os 20s de espera |
| `selecionarFormaExibicaoEmExcel` - início | ~1714 | Antes de selecionar Excel |
| `gerarEBaixarRelatorio` - antes do clique | ~1989 | Antes de clicar no botão Gerar |

### 3. Criar sistema de verificação contínua durante esperas longas
Implementar uma função que verifica e fecha popups periodicamente durante operações que demoram:

```javascript
async function aguardarComFecharPopups(page, tempoMs, intervaloMs = 3000) {
  const inicio = Date.now();
  while (Date.now() - inicio < tempoMs) {
    await fecharPopups(page, 2); // Verificação rápida
    await page.waitForTimeout(Math.min(intervaloMs, tempoMs - (Date.now() - inicio)));
  }
}
```

### 4. Adicionar lógica específica para popup de suporte no fallback JavaScript
Expandir a busca JavaScript para identificar especificamente o popup de suporte:

```javascript
// Buscar por popup com texto sobre suporte e clicar em Fechar
const suporteElements = document.querySelectorAll('div, td, span, p');
for (const el of suporteElements) {
  const text = (el.textContent || '').toLowerCase();
  if (text.includes('suporte') || text.includes('liberar o usuário')) {
    const container = el.closest('div, table, form');
    if (container) {
      const fecharBtn = container.querySelector('button, input[type="button"], a');
      for (const btn of container.querySelectorAll('button, input[type="button"], a')) {
        const btnText = (btn.textContent || btn.value || '').toLowerCase();
        if (btnText === 'fechar' || btnText.includes('fechar')) {
          btn.click();
          fechou = true;
          break;
        }
      }
    }
    if (fechou) break;
  }
}
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `scripts/robo-mgf-hinova.cjs` | Adicionar seletores, nova função de espera, e chamadas em pontos estratégicos |

## Detalhes da Implementação

### Modificação 1: Expandir lista de seletores (linhas 500-528)
Adicionar seletores específicos para o popup de suporte do Hinova.

### Modificação 2: Adicionar busca específica de popup de suporte no fallback JS (linhas 545-582)
Incluir lógica para identificar popups com texto "suporte" ou "liberar o usuário" e fechar.

### Modificação 3: Criar função `aguardarComFecharPopups` (após linha 588)
Nova função utilitária para esperas longas com verificação periódica de popups.

### Modificação 4: Substituir esperas longas pela nova função
- Linha ~1673: Após configurar Centro de Custo
- Linha ~1685: Espera de 20s após seleção de layout (mais crítico)
- Linha ~1695: Após configuração de filtros

### Modificação 5: Adicionar chamadas em `gerarEBaixarRelatorio` (linhas 1857+)
Chamar `fecharPopups` antes do clique no botão Gerar.

## Benefícios
- O popup de suporte será fechado automaticamente em qualquer momento da execução
- Esperas longas terão verificações periódicas de popups
- O robô não ficará travado aguardando interação manual
- Mantém consistência com os padrões de resiliência já estabelecidos

