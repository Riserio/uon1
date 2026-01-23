
# Plano de Correção: Salvamento do Excel no Robô Hinova

## Objetivo
Garantir que o arquivo Excel baixado seja corretamente salvo no disco e que as informações sejam atualizadas no sistema.

---

## Problemas Identificados

### 1. Falta de `await download.path()` Antes do `saveAs`
A função `processarDownloadImediato` não aguarda o arquivo temporário do Playwright estar disponível antes de executar `saveAs`.

### 2. Validação Insuficiente Após Salvamento
A verificação atual usa apenas `fs.existsSync` e `fs.statSync`, mas não garante que o arquivo foi completamente escrito (flush completo).

### 3. Potencial Erro Silencioso no `saveAs`
Se o diretório não existe ou há problemas de permissão, o erro pode ser mascarado.

### 4. Falta de Retry no `saveAs`
Se o arquivo temporário ainda não está disponível, deveria haver retry com backoff.

---

## Alterações Propostas

### Alteração 1: Refatorar `processarDownloadImediato`
Adicionar `await download.path()` ANTES do `saveAs` para garantir que o arquivo temporário existe.

```javascript
async function processarDownloadImediato(download, downloadDir, semanticName, source) {
  const filePath = path.join(downloadDir, semanticName);
  const suggestedName = download.suggestedFilename?.() || 'download.xlsx';
  
  log(`Download capturado: ${suggestedName}`, LOG_LEVELS.SUCCESS);
  
  // CRÍTICO: Aguardar arquivo temporário existir
  log(`Aguardando arquivo temporário...`, LOG_LEVELS.DEBUG);
  const tempPath = await download.path();
  
  if (!tempPath) {
    throw new Error('FALHA: Arquivo temporário não disponível');
  }
  log(`Arquivo temporário: ${tempPath}`, LOG_LEVELS.DEBUG);
  
  // Garantir diretório existe
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
    log(`Diretório criado: ${downloadDir}`, LOG_LEVELS.DEBUG);
  }
  
  log(`Salvando arquivo: ${filePath}`, LOG_LEVELS.INFO);
  await download.saveAs(filePath);
  
  // Validação síncrona ROBUSTA
  if (!fs.existsSync(filePath)) {
    throw new Error(`FALHA: Arquivo não existe após saveAs: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`FALHA: Arquivo vazio (${stats.size} bytes)`);
  }
  
  const sizeKB = (stats.size / 1024).toFixed(2);
  log(`✅ Arquivo salvo com sucesso: ${semanticName} (${sizeKB} KB)`, LOG_LEVELS.SUCCESS);
  log(`✅ Etapa DOWNLOAD concluída`, LOG_LEVELS.SUCCESS);
  
  return { filePath, size: stats.size, source };
}
```

### Alteração 2: Adicionar Fallback de Cópia Manual
Se `saveAs` falhar, tentar copiar o arquivo temporário manualmente.

```javascript
// Dentro de processarDownloadImediato
try {
  await download.saveAs(filePath);
} catch (saveError) {
  log(`saveAs falhou: ${saveError.message}, tentando cópia manual...`, LOG_LEVELS.WARN);
  
  // Fallback: cópia manual do arquivo temporário
  const tempPath = await download.path();
  if (tempPath && fs.existsSync(tempPath)) {
    fs.copyFileSync(tempPath, filePath);
    log(`Arquivo copiado manualmente de ${tempPath}`, LOG_LEVELS.DEBUG);
  } else {
    throw new Error(`FALHA: Não foi possível salvar arquivo: ${saveError.message}`);
  }
}
```

### Alteração 3: Melhorar Logging no Watcher HTTP
Adicionar mais contexto quando o watcher HTTP captura a resposta.

```javascript
// Dentro de criarWatcherRespostaHTTP, no bloco que salva via fs.writeFileSync
log(`Salvando arquivo via HTTP...`, LOG_LEVELS.INFO);
log(`Content-Type: ${response.headers()['content-type']}`, LOG_LEVELS.DEBUG);
log(`Content-Length: ${response.headers()['content-length'] || 'N/A'}`, LOG_LEVELS.DEBUG);

const buf = await response.body();
log(`Buffer size: ${buf.length} bytes`, LOG_LEVELS.DEBUG);

fs.writeFileSync(filePath, buf);
```

### Alteração 4: Adicionar Verificação de Integridade do Excel
Após salvar, tentar abrir o arquivo com XLSX para validar integridade.

```javascript
// Adicionar após a validação de tamanho
try {
  const workbook = XLSX.readFile(filePath);
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel sem planilhas');
  }
  log(`Excel válido: ${workbook.SheetNames.length} planilha(s)`, LOG_LEVELS.DEBUG);
} catch (xlsxError) {
  throw new Error(`FALHA: Excel corrompido - ${xlsxError.message}`);
}
```

### Alteração 5: Log do Caminho Absoluto
Garantir que o caminho do arquivo seja absoluto e logado claramente.

```javascript
const absolutePath = path.resolve(filePath);
log(`Caminho absoluto: ${absolutePath}`, LOG_LEVELS.DEBUG);
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `scripts/robo-cobranca-hinova.cjs` | Refatorar `processarDownloadImediato` com `download.path()`, fallback de cópia, e validação robusta |

---

## Resumo das Alterações

1. **Adicionar `await download.path()`** antes de `saveAs` (crítico)
2. **Fallback de cópia manual** se `saveAs` falhar
3. **Garantir diretório existe** antes de salvar
4. **Validar integridade do Excel** após salvar
5. **Logs detalhados** com caminhos absolutos

---

## Resultado Esperado

Após as alterações:
- O arquivo Excel será corretamente salvo no diretório `./downloads/YYYY/MM/`
- Os logs mostrarão claramente cada etapa do salvamento
- Erros serão propagados corretamente, não mascarados
- O processamento do Excel e envio ao webhook funcionarão normalmente
