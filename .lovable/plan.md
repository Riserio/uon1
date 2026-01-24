
# Plano: Corrigir Lógica de Seleção CSV/Tabela Dinâmica

## Problema Identificado

Nos logs, vemos que:

```text
[FILTROS] Selecionando Forma de Exibição: Em Tabela Dinâmica
[FILTROS] ✅ Tabela Dinâmica selecionada: nearText   ← SUCESSO
...
[DOWNLOAD] Usando estratégia Excel/HTML...           ← REVERTEU PARA EXCEL!
[DOWNLOAD] Selecionando Forma de Exibição: Em Excel  ← ANULOU A SELEÇÃO
```

### Causa Raiz

O código seleciona "Tabela Dinâmica" corretamente na etapa FILTROS (linha 2790), mas na etapa DOWNLOAD (linha 2893-2903) ele **verifica novamente o DOM** para decidir qual estratégia usar:

```javascript
const radioTabelaDinamica = await page.evaluate(() => {
  const radios = document.querySelectorAll('input[type="radio"]:checked');
  // Busca por ":checked" mas algo pode ter desmarcado
});

if (radioTabelaDinamica) {
  // CSV via Tabela Dinâmica
} else {
  // FALLBACK: Excel/HTML ← está entrando aqui!
  await selecionarFormaExibicaoEmExcel(page);  // Anula a seleção anterior
}
```

A verificação `:checked` está falhando porque:
1. O portal pode ter resetado a seleção
2. Um iframe diferente contém o radio
3. A seleção não persistiu corretamente

---

## Solução

Usar uma **variável de estado** para rastrear se a Tabela Dinâmica foi selecionada, em vez de verificar o DOM novamente:

```javascript
// Na etapa FILTROS
const usarTabelaDinamica = await selecionarFormaExibicaoTabelaDinamica(page);

// Na etapa DOWNLOAD - usar a variável, não o DOM
if (usarTabelaDinamica) {
  log('Usando estratégia CSV via Tabela Dinâmica...');
  // ... código CSV
} else {
  log('Usando estratégia Excel/HTML...');
  await selecionarFormaExibicaoEmExcel(page);
  // ... código Excel
}
```

---

## Mudanças Técnicas

| Arquivo | Alteração |
|---------|-----------|
| `scripts/robo-cobranca-hinova.cjs` | Remover re-verificação do DOM e usar variável `usarTabelaDinamica` já existente |

### Código Atual (Problemático)

```javascript
// Linha 2790 - Etapa FILTROS
const usarTabelaDinamica = await selecionarFormaExibicaoTabelaDinamica(page);

// ... outras configurações ...

// Linha 2893-2903 - Etapa DOWNLOAD (PROBLEMA!)
const radioTabelaDinamica = await page.evaluate(() => {
  // Re-verifica o DOM - pode falhar!
});

if (radioTabelaDinamica) {
  // CSV
} else {
  // Excel - entra aqui mesmo com seleção correta!
}
```

### Código Corrigido

```javascript
// Linha 2790 - Etapa FILTROS (mantém)
const usarTabelaDinamica = await selecionarFormaExibicaoTabelaDinamica(page);

// ... outras configurações ...

// Etapa DOWNLOAD - usa variável diretamente!
if (usarTabelaDinamica) {
  log('Usando estratégia CSV via Tabela Dinâmica...');
  // Código CSV existente
} else {
  log('Usando estratégia Excel/HTML...');
  await selecionarFormaExibicaoEmExcel(page);
  // Código Excel existente
}
```

---

## Fluxo Corrigido

```text
┌────────────────────────────────────────────────────────────┐
│                     ETAPA: FILTROS                          │
├────────────────────────────────────────────────────────────┤
│ 1. Configurar datas, situação ABERTO, etc                  │
│ 2. Chamar selecionarFormaExibicaoTabelaDinamica()          │
│    └─ Retorna TRUE se sucesso                              │
│ 3. Salvar resultado em usarTabelaDinamica                  │
├────────────────────────────────────────────────────────────┤
│                     ETAPA: DOWNLOAD                         │
├────────────────────────────────────────────────────────────┤
│ 4. if (usarTabelaDinamica) {                               │
│      → Clicar Gerar (abre nova aba)                        │
│      → Aguardar DataTable carregar                         │
│      → Clicar botão CSV                                    │
│      → Baixar e processar CSV                              │
│    } else {                                                 │
│      → Selecionar Excel                                     │
│      → Clicar Gerar                                         │
│      → Baixar e processar XLS/HTML                         │
│    }                                                        │
│ 5. Enviar dados para webhook                               │
└────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado Após Correção

```text
[FILTROS] Selecionando Forma de Exibição: Em Tabela Dinâmica
[FILTROS] ✅ Tabela Dinâmica selecionada: nearText
[FILTROS] ✅ Filtros configurados
[DOWNLOAD] Usando estratégia CSV via Tabela Dinâmica...    ← CORRETO!
[DOWNLOAD] Clicando em Gerar Relatório...
[DOWNLOAD] ✅ Nova aba detectada
[DOWNLOAD] Aguardando DataTable carregar...
[DOWNLOAD] Clicando em CSV...
[DOWNLOAD] ✅ CSV baixado: Cobranca_24012026.csv (17 MB)
[PROCESSAMENTO] ✅ 5000 registros processados
[WEBHOOK] ✅ Dados enviados com sucesso
```
