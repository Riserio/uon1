
# Plano: Corrigir Download Hinova - Usar saveAs Diretamente com Timeout Estendido

## Diagnóstico do Problema

O script captura o evento de download corretamente (`Download capturado! Fonte: globalDownload`), mas trava na função `processarDownloadImediato` ao tentar salvar o arquivo. O problema específico:

1. O `download.path()` aguarda o Playwright baixar o arquivo completo para um diretório temporário
2. O portal Hinova é extremamente lento para transmitir o arquivo Excel
3. O timeout de 3 minutos para `DOWNLOAD_SAVE` não é suficiente

## Solução Proposta

Usar `download.saveAs()` diretamente **sem** chamar `download.path()` primeiro. O `saveAs()` do Playwright já aguarda internamente a conclusão do download e salva diretamente no destino final - eliminando a etapa intermediária.

## Mudanças Técnicas

### 1. Simplificar `processarDownloadImediato`

```javascript
async function processarDownloadImediato(download, downloadDir, semanticName) {
  const filePath = path.join(downloadDir, semanticName);
  const suggestedName = download.suggestedFilename?.() || 'arquivo';
  
  log(`Download capturado`, LOG_LEVELS.SUCCESS);
  log(`Salvando arquivo: ${suggestedName} -> ${filePath}`, LOG_LEVELS.INFO);
  
  // Usar saveAs diretamente - timeout de 10 minutos para arquivos grandes
  await withTimeout(
    download.saveAs(filePath),
    TIMEOUTS.DOWNLOAD_TOTAL, // 10 minutos
    `Timeout salvando arquivo (${TIMEOUTS.DOWNLOAD_TOTAL / 60000} min)`
  );
  
  // Validação síncrona
  if (!fs.existsSync(filePath)) {
    throw new Error('FALHA: Arquivo não existe após saveAs');
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`FALHA: Arquivo vazio (${stats.size} bytes)`);
  }
  
  const sizeKB = (stats.size / 1024).toFixed(2);
  log(`Arquivo salvo com sucesso: ${semanticName} (${sizeKB} KB)`, LOG_LEVELS.SUCCESS);
  
  return { filePath, size: stats.size };
}
```

### 2. Atualizar Timeouts

```javascript
const TIMEOUTS = {
  // ...outros
  DOWNLOAD_TOTAL: 10 * 60000, // 10 min para download total (usado no saveAs)
  DOWNLOAD_SAVE: 10 * 60000,  // 10 min também (para consistência)
};
```

### 3. Adicionar Logs de Progresso Durante saveAs

Para evitar que o usuário pense que o script travou, adicionar feedback periódico enquanto o saveAs está em progresso.

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `scripts/robo-cobranca-hinova.cjs` | Simplificar `processarDownloadImediato` para usar apenas `saveAs()` com timeout de 10 min |

## Fluxo Esperado Após a Correção

```text
[DOWNLOAD] Download capturado! Fonte: globalDownload
[DOWNLOAD] Salvando arquivo: relatorio.xls -> downloads/2026/01/Cobranca_...xlsx
[DOWNLOAD] Aguardando transmissão do portal... 1m
[DOWNLOAD] Aguardando transmissão do portal... 2m
...
[DOWNLOAD] Arquivo salvo com sucesso: Cobranca_...xlsx (X.XX KB)
[DOWNLOAD] Etapa DOWNLOAD concluída
[PROCESSAMENTO] Processando arquivo...
[WEBHOOK] Enviando dados...
```

## Benefícios

1. Elimina a etapa intermediária de `download.path()`
2. Permite timeout de 10 minutos para transmissões lentas do portal
3. Mantém feedback visual durante a espera
4. Código mais simples e direto
