
# Plano: Exibir Percentual de Download e Importação

## Diagnóstico do Problema

Os logs mostram o seguinte fluxo:

```text
[globalDownload] ⬇️ Baixando via HTTP stream...
[3 min depois] ⚠️ HTTP stream falhou (canceled) — usando saveAs
[Fallback] ⏳ Download em progresso... Xm Ys (sem percentual)
```

### Por que o percentual não aparece?

1. **HTTP Stream via Axios falha**: O portal Hinova provavelmente bloqueia requisições "replay" do axios (autenticação de sessão, verificação de referer, ou cookie session binding)

2. **Fallback para Playwright saveAs**: O método `download.saveAs()` do Playwright é uma "caixa preta" - não expõe quantos bytes foram recebidos, apenas retorna quando termina

3. **Cancelamento após 3 min**: O idle timeout (3 min sem bytes) está abortando o axios antes que o portal comece a transmitir

## Solução Proposta

### Estratégia 1: Monitorar Tamanho do Arquivo Parcial

O Playwright salva o arquivo progressivamente. Podemos monitorar o **tamanho do arquivo em disco** durante o `saveAs()` e calcular o percentual baseado no `Content-Length` (se disponível) ou mostrar bytes recebidos.

```javascript
// Durante o saveAs, monitorar arquivo parcial
let progressInterval = setInterval(() => {
  const tempPath = filePath + '.crdownload'; // ou o próprio filePath
  if (fs.existsSync(tempPath)) {
    const currentSize = fs.statSync(tempPath).size;
    if (expectedSize > 0) {
      const pct = Math.min(100, Math.floor((currentSize / expectedSize) * 100));
      log(`⬇️ Download ${pct}% (${formatBytes(currentSize)} / ${formatBytes(expectedSize)})`);
    } else {
      log(`⬇️ Download ${formatBytes(currentSize)} recebidos`);
    }
  }
}, 10000);
```

### Estratégia 2: Obter Content-Length do Header de Download

O objeto `download` do Playwright tem acesso aos headers. Podemos extrair o `content-length` para saber o tamanho total esperado.

### Estratégia 3: Aumentar Idle Timeout do Axios

O portal pode demorar a começar a transmitir. Aumentar de 3 min para 5 min pode permitir que o HTTP stream funcione.

## Mudanças Técnicas

### 1. Novo Helper: `monitorFileProgress`

Cria um monitor que verifica o tamanho do arquivo a cada 10 segundos e exibe progresso.

```javascript
function monitorFileProgress(filePath, expectedSize = 0, intervalMs = 10000) {
  const startTime = Date.now();
  let lastLoggedPercent = -1;
  
  const interval = setInterval(() => {
    // Tentar arquivo parcial (.crdownload, .part, .download) ou o próprio arquivo
    const possiblePaths = [
      filePath,
      filePath + '.crdownload',
      filePath + '.part',
      filePath + '.download',
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const size = fs.statSync(p).size;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const speed = size / Math.max(1, elapsed);
        
        if (expectedSize > 0) {
          const pct = Math.min(100, Math.floor((size / expectedSize) * 100));
          if (pct >= lastLoggedPercent + 5) { // Log a cada +5%
            lastLoggedPercent = pct;
            log(`⬇️ Download ${pct}% (${formatBytes(size)} / ${formatBytes(expectedSize)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.DEBUG);
          }
        } else {
          log(`⬇️ Download ${formatBytes(size)} recebidos • ${formatBytes(speed)}/s (${Math.floor(elapsed/60)}m ${elapsed%60}s)`, LOG_LEVELS.DEBUG);
        }
        break;
      }
    }
  }, intervalMs);
  
  return () => clearInterval(interval);
}
```

### 2. Atualizar `processarDownloadImediato`

Extrair `Content-Length` do download e usar o novo monitor.

```javascript
async function processarDownloadImediato(download, downloadDir, semanticName) {
  const filePath = path.join(downloadDir, semanticName);
  
  // Tentar obter tamanho esperado dos headers
  let expectedSize = 0;
  try {
    const request = download.request?.();
    const response = await request?.response?.();
    const headers = response?.headers?.() || {};
    expectedSize = parseInt(headers['content-length'] || '0', 10);
    if (expectedSize > 0) {
      log(`Tamanho esperado: ${formatBytes(expectedSize)}`, LOG_LEVELS.DEBUG);
    }
  } catch (e) {
    // Ignorar - monitoramento funcionará sem expectedSize
  }
  
  // Iniciar monitor de progresso do arquivo
  const stopMonitor = monitorFileProgress(filePath, expectedSize, 10000);
  
  try {
    await download.saveAs(filePath);
  } finally {
    stopMonitor();
  }
  
  // ... validação e logs de sucesso
}
```

### 3. Aumentar Idle Timeout do Axios

De 3 min para 5 min para dar mais tempo ao portal iniciar a transmissão.

```javascript
const TIMEOUTS = {
  // ...
  DOWNLOAD_IDLE: 5 * 60000,   // 5 min sem receber bytes -> abortar
};
```

### 4. Progresso na Importação (Webhook)

Atualizar `enviarWebhook` para exibir porcentagem a cada lote enviado.

```javascript
// Já implementado, mas garantir que os logs estão corretos
log(`📤 Importação ${Math.round((i + batch.length) / total * 100)}% (${i + batch.length}/${total} registros)`, LOG_LEVELS.DEBUG);
```

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `scripts/robo-cobranca-hinova.cjs` | Adicionar `monitorFileProgress`, atualizar `processarDownloadImediato`, aumentar `DOWNLOAD_IDLE` para 5 min |

## Resultado Esperado

```text
[DOWNLOAD] ✅ Download capturado
[DOWNLOAD] Salvando arquivo: relatorio.xls -> ...Cobranca_...xlsx
[DOWNLOAD] Tamanho esperado: 2.5 MB
[DOWNLOAD] ⬇️ Download 0% (0 B / 2.5 MB) • 0 B/s
[DOWNLOAD] ⬇️ Download 5% (128 KB / 2.5 MB) • 12.8 KB/s
[DOWNLOAD] ⬇️ Download 15% (384 KB / 2.5 MB) • 19.2 KB/s
...
[DOWNLOAD] ⬇️ Download 100% (2.5 MB / 2.5 MB) • 15.4 KB/s
[DOWNLOAD] ✅ Arquivo salvo com sucesso (2.5 MB)
[PROCESSAMENTO] Processando Excel...
[WEBHOOK] 📤 Importação 25% (1000/4000 registros)
[WEBHOOK] 📤 Importação 50% (2000/4000 registros)
[WEBHOOK] 📤 Importação 75% (3000/4000 registros)
[WEBHOOK] 📤 Importação 100% (4000/4000 registros)
[WEBHOOK] ✅ Dados enviados com sucesso
```
