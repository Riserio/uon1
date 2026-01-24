
# Plano: Corrigir Filtros e Parser para Relatório Hinova

## Problema Identificado

### 1. Download de 628 MB vs 17 MB esperado
Os logs mostram que o arquivo baixado automaticamente é **37x maior** que o download manual com filtros corretos. Isso indica que os **filtros não estão sendo aplicados** no portal Hinova.

### 2. Formato do Arquivo
O "Excel" do Hinova é na verdade **HTML disfarçado com extensão .xls**:

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"...>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>SGA - RELATORIO DE BOLETOS</title>
</head>
<body>
<table>
    <tr><td>Data Pagamento</td><td>Data Vencimento Original</td>...</tr>
    <tr><td>08/01/2026</td><td>20/01/2026</td>...</tr>
</table>
```

A biblioteca `xlsx` não processa HTML corretamente, causando o erro "Cannot create a string longer than 0x1fffffe8 characters".

---

## Solução em Duas Partes

### Parte 1: Validar e Debugar Aplicação de Filtros

**Problema:** Os filtros podem não estar sendo aplicados porque:
- Os seletores CSS não correspondem aos campos reais do portal
- O portal usa iframes que não estão sendo processados
- Eventos JavaScript do portal não são disparados corretamente

**Solução:**
1. Salvar screenshot e HTML da página de filtros ANTES de clicar em "Gerar"
2. Adicionar logs detalhados do estado de cada filtro após configuração
3. Validar tamanho do arquivo e alertar se for muito grande

```javascript
// Antes de clicar em Gerar, salvar debug dos filtros
await saveDebugInfo(page, context, 'Pre-download: verificar filtros');

// Validar estado dos filtros configurados
const estadoFiltros = await page.evaluate(() => {
  const resultado = {};
  
  // Verificar datas
  const inputs = document.querySelectorAll('input[type="text"]');
  for (const input of inputs) {
    if (input.value) {
      resultado[input.name || input.id || 'input'] = input.value;
    }
  }
  
  // Verificar checkboxes de Situação
  const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
  resultado.checkboxesMarcados = Array.from(checkboxes).map(cb => cb.value || cb.id);
  
  // Verificar selects
  const selects = document.querySelectorAll('select');
  for (const select of selects) {
    if (select.selectedIndex >= 0) {
      resultado[select.name || 'select'] = select.options[select.selectedIndex]?.text;
    }
  }
  
  return resultado;
});

log(`Estado dos filtros: ${JSON.stringify(estadoFiltros, null, 2)}`, LOG_LEVELS.DEBUG);
```

### Parte 2: Criar Parser HTML para o Relatório

**Problema:** A biblioteca `xlsx` não processa HTML. Precisamos de um parser específico.

**Solução:** Criar função `processarHtmlRelatorio()` que:
1. Detecta se o arquivo é HTML ou Excel binário
2. Usa regex/parsing simples para extrair dados das tabelas HTML
3. Mapeia as colunas para o formato esperado pelo webhook

```javascript
function processarHtmlRelatorio(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Detectar se é HTML
  if (!content.includes('<html') && !content.includes('<table')) {
    // É Excel binário - usar xlsx
    return processarExcel(filePath);
  }
  
  log('Arquivo detectado como HTML - usando parser HTML', LOG_LEVELS.INFO);
  
  const dados = [];
  
  // Regex para extrair linhas de dados (<tr> com dados)
  const rowRegex = /<tr[^>]*ondblclick[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  
  while ((match = rowRegex.exec(content)) !== null) {
    const rowHtml = match[1];
    
    // Extrair células
    const cells = [];
    const cellRegex = /<td[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/td>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      // Limpar HTML e extrair texto
      let text = cellMatch[1]
        .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1') // Extrair texto de links
        .replace(/<[^>]*>/g, '') // Remover tags HTML
        .replace(/&nbsp;/g, ' ')
        .trim();
      cells.push(text);
    }
    
    if (cells.length >= 10) {
      dados.push({
        'Data Pagamento': parseExcelDate(cells[0]),
        'Data Vencimento Original': parseExcelDate(cells[1]),
        'Dia Vencimento Veiculo': parseInt(cells[2]) || null,
        'Regional Boleto': cells[3],
        'Cooperativa': cells[4],
        'Voluntário': cells[5],
        'Nome': cells[6],
        'Placas': cells[7],
        'Valor': parseMoneyValue(cells[8]),
        'Data Vencimento': parseExcelDate(cells[9]),
        'Qtde Dias em Atraso Vencimento Original': parseInt(cells[10]) || null,
        'Situacao': cells[11],
      });
    }
  }
  
  return dados;
}
```

---

## Mudanças Técnicas

| Arquivo | Alteração |
|---------|-----------|
| `scripts/robo-cobranca-hinova.cjs` | Adicionar `processarHtmlRelatorio()`, debug de filtros pré-download, validação de tamanho |

### Ordem de Implementação

1. **Debug de filtros** - Salvar screenshot/HTML antes do download para análise
2. **Validação de tamanho** - Alertar se arquivo > 50 MB (indica filtros não aplicados)
3. **Parser HTML** - Detectar formato e usar parser apropriado
4. **Logs de progresso** - Manter o monitoramento de % do download

---

## Fluxo de Processamento

```text
┌─────────────────────────────────────────────────────────────┐
│                    DOWNLOAD INICIADO                         │
├─────────────────────────────────────────────────────────────┤
│ 1. Configurar filtros (datas, situação ABERTO, etc)         │
│ 2. Salvar debug (screenshot + HTML) dos filtros             │
│ 3. Clicar em Gerar Relatório                                 │
│ 4. Monitorar progresso do download (% em disco)              │
│ 5. Validar tamanho (alertar se > 50 MB)                      │
├─────────────────────────────────────────────────────────────┤
│                 PROCESSAR ARQUIVO                            │
├─────────────────────────────────────────────────────────────┤
│ 6. Detectar formato (HTML vs Excel binário)                  │
│    ├─ HTML? → processarHtmlRelatorio()                       │
│    └─ Excel? → processarExcel() (xlsx)                       │
│ 7. Mapear colunas para formato padrão                        │
│ 8. Enviar para webhook em lotes (com % de importação)        │
└─────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

```text
[FILTROS] Estado dos filtros: {
  "dt_vencimento_original_ini": "01/01/2026",
  "dt_vencimento_original_fim": "31/01/2026",
  "checkboxesMarcados": ["ABERTO"],
  "boletos_anteriores": "NÃO POSSUI"
}
[FILTROS] 🔍 Debug salvo para análise
[DOWNLOAD] ⬇️ Download 25% (4.5 MB / 17 MB)
[DOWNLOAD] ⬇️ Download 50% (8.5 MB / 17 MB)
[DOWNLOAD] ⬇️ Download 100% (17 MB / 17 MB)
[DOWNLOAD] ✅ Arquivo salvo: Cobranca_24012026.xlsx (17 MB)
[PROCESSAMENTO] Arquivo detectado como HTML - usando parser HTML
[PROCESSAMENTO] ⏳ Processamento: 25% (1250/5000 linhas)
[PROCESSAMENTO] ⏳ Processamento: 50% (2500/5000 linhas)
[PROCESSAMENTO] ✅ Processamento concluído: 5000 registros válidos
[WEBHOOK] 📤 Importação 50% (2500/5000)
[WEBHOOK] 📤 Importação 100% (5000/5000)
[WEBHOOK] ✅ Dados enviados com sucesso
```
