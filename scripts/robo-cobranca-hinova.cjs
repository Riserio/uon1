#!/usr/bin/env node
/**
 * IMPORTANTE: O script marca automaticamente o checkbox "TODOS" na seção Cooperativa
 * para garantir que todos os dados sejam incluídos no relatório.
 */

/**
 * Robô de Automação - Cobrança Hinova (Node.js)
 * ==============================================
 * 
 * REQUISITOS:
 * -----------
 * npm install playwright axios xlsx
 * npx playwright install chromium
 * 
 * CONFIGURAÇÃO:
 * -------------
 * Edite as variáveis abaixo ou use variáveis de ambiente.
 * 
 * EXECUÇÃO:
 * ---------
 * node robo-cobranca-hinova.js
 */

const { chromium } = require('playwright');
const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const readline = require('readline');

// ============================================
// CONFIGURAÇÃO - EDITE AQUI OU USE ENV VARS
// ============================================

// Função para derivar URL do relatório a partir da URL de login
function deriveRelatorioUrl(loginUrl) {
  try {
    const url = new URL(loginUrl);
    // Extrai o caminho base (ex: /sga/sgav4_valecar/v5/ -> /sga/sgav4_valecar/)
    const pathParts = url.pathname.split('/');
    // Remove 'v5', 'login.php' ou 'Principal' e reconstrói
    const basePathParts = pathParts.filter(p => 
      p && !p.includes('login') && !p.includes('Principal') && p !== 'v5'
    );
    const basePath = '/' + basePathParts.join('/');
    return `${url.origin}${basePath}/relatorio/relatorioBoleto.php`;
  } catch (e) {
    // Fallback para URL padrão se parsing falhar
    return 'https://eris.hinova.com.br/sga/sgav4_valecar/relatorio/relatorioBoleto.php';
  }
}

const HINOVA_URL = process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php';

const CONFIG = {
  HINOVA_URL: HINOVA_URL,
  // URL do relatório derivada dinamicamente da URL de login
  HINOVA_RELATORIO_URL: process.env.HINOVA_RELATORIO_URL || deriveRelatorioUrl(HINOVA_URL),
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',

  // Alguns ambientes exigem o código do cliente e/ou o perfil/layout selecionado no login.
  // Mantém compatibilidade com o valor antigo (2363), mas permite sobrescrever por ENV.
  HINOVA_CODIGO_CLIENTE: process.env.HINOVA_CODIGO_CLIENTE || '2363',
  HINOVA_LAYOUT: process.env.HINOVA_LAYOUT || 'BI - VANGARD COBRANÇA',
  
  // URL do webhook
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  
  // Identificador da corretora - CONFIGURE VIA VARIÁVEL DE AMBIENTE
  CORRETORA_ID: process.env.CORRETORA_ID || '',
  
  // ID da execução (vindo do banco via GitHub Actions)
  EXECUCAO_ID: process.env.EXECUCAO_ID || '',
  
  // GitHub Actions run info
  GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || '',
  GITHUB_RUN_URL: process.env.GITHUB_RUN_URL || '',
  
  // Diretório base para downloads
  DOWNLOAD_BASE_DIR: process.env.DOWNLOAD_DIR || './downloads',
  
  // Diretório para debug (screenshots e HTML)
  DEBUG_DIR: process.env.DEBUG_DIR || './debug',
};

// ============================================
// LOGIN: helpers (mantidos próximos ao topo por reutilização)
// ============================================
function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

async function trySelectHinovaLayout(page) {
  const desired = normalizeText(CONFIG.HINOVA_LAYOUT);
  if (!desired) return false;

  // 1) Tentar select tradicional
  try {
    const select = page
      .locator(
        'select[name*="layout" i], select[id*="layout" i], select[name*="sistema" i], select[id*="sistema" i], select[name*="perfil" i], select[id*="perfil" i]'
      )
      .first();

    if (await select.isVisible().catch(() => false)) {
      const optionTexts = await select.locator('option').allTextContents().catch(() => []);
      const idx = optionTexts.findIndex((t) => {
        const nt = normalizeText(t);
        return nt.includes('vangard') || nt.includes(desired);
      });

      if (idx >= 0) {
        const option = select.locator('option').nth(idx);
        const value = (await option.getAttribute('value').catch(() => null)) ?? optionTexts[idx];
        await select.selectOption(value).catch(() => null);
        log(`Layout selecionado via <select>: ${optionTexts[idx]}`, LOG_LEVELS.DEBUG);
        return true;
      }
    }
  } catch {}

  // 2) Tentar input (autocomplete/datalist)
  try {
    const input = page
      .locator(
        'input[placeholder*="Sistema" i], input[placeholder*="Layout" i], input[placeholder*="Perfil" i], input[placeholder*="Relat" i], input[placeholder*="Empresa" i]'
      )
      .first();
    if (await input.isVisible().catch(() => false)) {
      await input.click({ force: true }).catch(() => null);
      await input.fill(CONFIG.HINOVA_LAYOUT).catch(() => null);
      await input.press('Enter').catch(() => null);
      log(`Layout preenchido via input: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.DEBUG);
      return true;
    }
  } catch {}

  // 3) Fallback removed — filling arbitrary inputs caused "Usuário Alteração" field
  //    to be incorrectly filled with VANGARD. Only select/autocomplete strategies are safe.

  return false;
}

// ============================================
// CONSTANTES DE TIMEOUT E CONTROLE
// ============================================
const TIMEOUTS = {
  PAGE_LOAD: 90000,              // 90s para carregar página
  LOGIN_RETRY_WAIT: 5000,        // Reduzido de 8s → 5s entre tentativas de login
  DOWNLOAD_EVENT: 3 * 60000,     // 3 min para evento de download
  DOWNLOAD_TOTAL: 25 * 60000,    // Reduzido de 40 min → 25 min total para download
  DOWNLOAD_SAVE: 25 * 60000,     // Reduzido de 40 min → 25 min para salvar arquivo
  DOWNLOAD_IDLE: 25 * 60000,     // Reduzido de 40 min → 25 min sem receber bytes -> abortar
  DOWNLOAD_HARD: 30 * 60000,     // Reduzido de 55 min → 30 min limite rígido
  POPUP_CLOSE: 800,              // 800ms para fechar popup
  FILE_PROGRESS_INTERVAL: 5000,  // 5s entre logs de progresso do arquivo
};

const LIMITS = {
  MAX_LOGIN_RETRIES: 5,          // Reduzido de 20 → 5
  MAX_DOWNLOAD_RETRIES: 3,
  MAX_POPUP_CLOSE_ATTEMPTS: 10,
  MAX_LOOP_ITERATIONS: 100,      // Limite para evitar loops infinitos
  MIN_FILE_SIZE_BYTES: 100,      // Tamanho mínimo para arquivo válido
};

// ============================================
// SISTEMA DE LOGS PADRONIZADO
// ============================================
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG',
  SUCCESS: 'SUCCESS',
};

let currentStep = 'INIT';

// ============================================
// UTIL: Promise com timeout (evita hangs)
// ============================================
async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function log(message, level = LOG_LEVELS.INFO) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${currentStep}]`;
  
  switch (level) {
    case LOG_LEVELS.ERROR:
      console.error(`${prefix} ❌ ${message}`);
      break;
    case LOG_LEVELS.WARN:
      console.warn(`${prefix} ⚠️ ${message}`);
      break;
    case LOG_LEVELS.SUCCESS:
      console.log(`${prefix} ✅ ${message}`);
      break;
    case LOG_LEVELS.DEBUG:
      console.log(`${prefix} 🔍 ${message}`);
      break;
    default:
      console.log(`${prefix} ${message}`);
  }
}

// ============================================
// UTIL: Progresso de download/upload
// ============================================
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx++;
  }
  return `${v.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

/**
 * Monitor de progresso de arquivo em disco
 * O Playwright salva arquivos progressivamente, então podemos monitorar o tamanho
 * para exibir percentual mesmo durante download.saveAs()
 */
function monitorFileProgress(filePath, expectedSize = 0, intervalMs = TIMEOUTS.FILE_PROGRESS_INTERVAL) {
  const startTime = Date.now();
  let lastLoggedPercent = -1;
  let lastSize = 0;
  
  const interval = setInterval(() => {
    // Tentar arquivo parcial (.crdownload, .part, .download) ou o próprio arquivo
    const possiblePaths = [
      filePath,
      filePath + '.crdownload',
      filePath + '.part',
      filePath + '.download',
    ];
    
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          const size = fs.statSync(p).size;
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const speed = size / Math.max(1, elapsed);
          
          // Evitar log repetido se tamanho não mudou
          if (size === lastSize && elapsed > 10) continue;
          lastSize = size;
          
          if (expectedSize > 0) {
            const pct = Math.min(100, Math.floor((size / expectedSize) * 100));
            // Log a cada +5% ou a cada intervalo se ainda não logou
            if (pct >= lastLoggedPercent + 5 || lastLoggedPercent === -1) {
              lastLoggedPercent = pct;
              // Barra de progresso visual
              const barSize = 20;
              const filled = Math.round((pct / 100) * barSize);
              const empty = barSize - filled;
              const bar = '█'.repeat(filled) + '░'.repeat(empty);
              log(`   ⬇️ Download [${bar}] ${pct}% (${formatBytes(size)} / ${formatBytes(expectedSize)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
            }
          } else {
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            log(`   ⬇️ Download: ${formatBytes(size)} recebidos • ${formatBytes(speed)}/s (${minutes}m ${seconds}s)`, LOG_LEVELS.INFO);
          }
          return; // Encontrou o arquivo, sair do loop
        }
      } catch {
        // Arquivo pode estar sendo escrito, ignorar erro
      }
    }
  }, intervalMs);
  
  // Retorna função para parar o monitor
  return () => {
    clearInterval(interval);
  };
}

async function buildCookieHeader(context, url) {
  try {
    const cookies = await context.cookies(url);
    if (!cookies || cookies.length === 0) return '';
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

function pickHeadersForHttpReplay(headers = {}) {
  // Reaproveitar apenas headers úteis/seguros para replay do request
  const allow = [
    'user-agent',
    'accept',
    'accept-language',
    'referer',
    'origin',
    'content-type',
  ];
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = String(k || '').toLowerCase();
    if (allow.includes(key) && v) out[key] = v;
  }
  // Evitar gzip/br por segurança em binário (não é obrigatório, mas reduz surpresas)
  out['accept-encoding'] = 'identity';
  return out;
}

/**
 * Download via HTTP stream puro com pipeline (backpressure) e progress logging.
 * - Não carrega o arquivo em memória
 * - Usa pipeline (stream/promises) para controlar backpressure
 * - highWaterMark de 8MB no WriteStream
 * - timeout: 0 no axios (controlado por idle/hard timers)
 * - Loga progresso em MB ou % via content-length
 * - Salva em arquivo temporário e renomeia ao final
 */
async function downloadViaAxiosStream({
  url,
  method = 'GET',
  headers = {},
  data,
  filePath,
  expectedBytes = 0,
  idleTimeoutMs = TIMEOUTS.DOWNLOAD_IDLE,
  hardTimeoutMs = TIMEOUTS.DOWNLOAD_HARD,
}) {
  if (!url) throw new Error('URL de download vazia');
  if (!filePath) throw new Error('filePath vazio');

  const startedAt = Date.now();
  const abortController = new AbortController();
  const tempFilePath = filePath + '.tmp';

  // ===== TIMERS DE CONTROLE =====
  let hardTimer = null;
  if (hardTimeoutMs && hardTimeoutMs > 0) {
    hardTimer = setTimeout(() => {
      abortController.abort(new Error(`Timeout rígido de download (${Math.round(hardTimeoutMs / 60000)} min)`));
    }, hardTimeoutMs);
  }

  let idleTimer = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeoutMs && idleTimeoutMs > 0) {
      idleTimer = setTimeout(() => {
        abortController.abort(new Error(`Download travado (sem bytes por ${Math.round(idleTimeoutMs / 60000)} min)`));
      }, idleTimeoutMs);
    }
  };
  resetIdleTimer();

  // ===== VARIÁVEIS DE PROGRESSO =====
  let receivedBytes = 0;
  let lastLoggedPercent = -1;
  let lastLoggedAt = 0;

  const logProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastLoggedAt < 15000) return; // no máximo a cada 15s
    lastLoggedAt = now;

    const elapsedSec = Math.max(1, Math.floor((now - startedAt) / 1000));
    const speed = receivedBytes / elapsedSec;

    if (expectedBytes > 0) {
      const pct = Math.min(100, Math.floor((receivedBytes / expectedBytes) * 100));
      if (!force && pct < lastLoggedPercent + 5) return; // log a cada +5%
      lastLoggedPercent = pct;
      // Barra de progresso visual
      const barSize = 20;
      const filled = Math.round((pct / 100) * barSize);
      const empty = barSize - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      log(`   ⬇️ Download [${bar}] ${pct}% (${formatBytes(receivedBytes)} / ${formatBytes(expectedBytes)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
    } else {
      log(`   ⬇️ Download: ${formatBytes(receivedBytes)} recebidos • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
    }
  };

  // ===== LIMPAR TIMERS =====
  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    idleTimer = null;
    hardTimer = null;
  };

  try {
    // ===== INICIAR REQUEST =====
    log(`Iniciando download HTTP stream: ${method} ${url.substring(0, 80)}...`, LOG_LEVELS.DEBUG);
    
    const response = await axios({
      url,
      method,
      headers,
      data,
      responseType: 'stream',
      maxRedirects: 10,
      timeout: 0, // SEM timeout do axios - controlado por idle/hard
      signal: abortController.signal,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    // ===== EXTRAIR TAMANHO DO HEADER =====
    const contentLengthHeader = response.headers?.['content-length'];
    const responseLen = parseInt(contentLengthHeader || '0', 10);
    if (!expectedBytes && responseLen > 0) expectedBytes = responseLen;

    if (expectedBytes > 0) {
      log(`Tamanho esperado: ${formatBytes(expectedBytes)}`, LOG_LEVELS.DEBUG);
    } else {
      log(`Tamanho desconhecido (streaming sem content-length)`, LOG_LEVELS.DEBUG);
    }

    // ===== CRIAR WRITE STREAM COM HIGH WATER MARK =====
    const writeStream = fs.createWriteStream(tempFilePath, {
      highWaterMark: 8 * 1024 * 1024, // 8MB buffer
    });

    // ===== TRANSFORM STREAM PARA MONITORAR PROGRESSO =====
    const progressTransform = new Transform({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        resetIdleTimer();
        logProgress(false);
        callback(null, chunk);
      },
      highWaterMark: 8 * 1024 * 1024, // 8MB buffer
    });

    // ===== EXECUTAR PIPELINE COM BACKPRESSURE =====
    await pipeline(
      response.data,
      progressTransform,
      writeStream
    );

    // ===== LOG FINAL DE PROGRESSO =====
    logProgress(true);
    clearTimers();

    // ===== VALIDAR ARQUIVO TEMPORÁRIO =====
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('FALHA: Arquivo temporário não existe após streaming HTTP');
    }
    const stats = fs.statSync(tempFilePath);
    if (stats.size <= 0) {
      throw new Error(`FALHA: Arquivo temporário vazio (${stats.size} bytes)`);
    }

    // ===== RENOMEAR PARA ARQUIVO FINAL =====
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath); // Remover arquivo existente
    }
    fs.renameSync(tempFilePath, filePath);

    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    log(`Download HTTP concluído: ${formatBytes(stats.size)} em ${elapsedSec}s`, LOG_LEVELS.SUCCESS);

    return { filePath, size: stats.size };

  } catch (error) {
    clearTimers();
    
    // Limpar arquivo temporário em caso de erro
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        log(`Arquivo temporário removido após erro`, LOG_LEVELS.DEBUG);
      }
    } catch {}
    
    throw error;
  }
}

function setStep(step) {
  currentStep = step;
  log(`Iniciando etapa: ${step}`);
}

// Notificar progresso da etapa via webhook (para atualizar UI em tempo real)
async function notificarProgresso(dados) {
  if (!CONFIG.WEBHOOK_URL || !CONFIG.CORRETORA_ID) return;
  
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.WEBHOOK_SECRET) headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;
    
    await axios.post(CONFIG.WEBHOOK_URL, {
      update_progress: true,
      corretora_id: CONFIG.CORRETORA_ID,
      execucao_id: CONFIG.EXECUCAO_ID || null,
      github_run_id: CONFIG.GITHUB_RUN_ID || null,
      ...dados,
    }, { headers, timeout: 15000 });
  } catch (e) {
    // Silenciar erros de progresso para não atrapalhar o fluxo
  }
}

// ============================================
// GESTÃO DE DIRETÓRIOS
// ============================================
function getDownloadDirectory() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  const dirPath = path.join(CONFIG.DOWNLOAD_BASE_DIR, String(year), month);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log(`Diretório criado: ${dirPath}`, LOG_LEVELS.DEBUG);
  }
  
  return dirPath;
}

function getDebugDirectory() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const dirPath = path.join(CONFIG.DEBUG_DIR, dateStr);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  return dirPath;
}

function generateSemanticFilename(tipoRelatorio, periodoInicio, periodoFim) {
  // Formato simples: DDMMYYYY.xlsx (apenas data do dia)
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  
  return `Cobranca_${day}${month}${year}.xlsx`;
}

// ============================================
// SALVAMENTO DE DIAGNÓSTICO
// ============================================
async function saveDebugInfo(page, context, errorMessage = null) {
  const debugDir = getDebugDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  try {
    // Screenshot
    const screenshotPath = path.join(debugDir, `screenshot_${currentStep}_${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Screenshot salvo: ${screenshotPath}`, LOG_LEVELS.DEBUG);
    
    // HTML da página
    const htmlPath = path.join(debugDir, `page_${currentStep}_${timestamp}.html`);
    const html = await page.content().catch(() => 'Erro ao obter HTML');
    fs.writeFileSync(htmlPath, html);
    log(`HTML salvo: ${htmlPath}`, LOG_LEVELS.DEBUG);
    
    // URL atual
    const urlPath = path.join(debugDir, `url_${currentStep}_${timestamp}.txt`);
    const urlInfo = `URL: ${page.url()}\nTimestamp: ${new Date().toISOString()}\nStep: ${currentStep}\nError: ${errorMessage || 'N/A'}`;
    fs.writeFileSync(urlPath, urlInfo);
    
    // Listar todas as páginas abertas
    const pages = context.pages();
    log(`Páginas abertas: ${pages.length}`, LOG_LEVELS.DEBUG);
    pages.forEach((p, i) => {
      log(`  Página ${i}: ${p.url()}`, LOG_LEVELS.DEBUG);
    });
    
  } catch (e) {
    log(`Erro ao salvar debug info: ${e.message}`, LOG_LEVELS.WARN);
  }
}

// ============================================
// VALIDAÇÃO DE ARQUIVO (BINÁRIO PURO)
// ============================================
// Constante para validação de tamanho (indica que filtros não foram aplicados)
const MAX_EXPECTED_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Magic bytes para detecção de tipo de arquivo
const FILE_SIGNATURES = {
  // Excel XLSX (ZIP com magic bytes PK)
  XLSX: [0x50, 0x4B, 0x03, 0x04],
  // Excel XLS (BIFF8)
  XLS: [0xD0, 0xCF, 0x11, 0xE0],
  // HTML (diversos)
  HTML_DOCTYPE: [0x3C, 0x21, 0x44, 0x4F], // <!DO
  HTML_TAG: [0x3C, 0x68, 0x74, 0x6D],     // <htm
  HTML_TAG_UPPER: [0x3C, 0x48, 0x54, 0x4D], // <HTM
};

/**
 * Detecta tipo de arquivo via magic bytes (header binário)
 * NÃO usa text(), toString() ou utf8 - leitura 100% binária
 */
function detectFileType(filePath) {
  try {
    // Ler primeiros 16 bytes como buffer binário puro
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    
    // Verificar magic bytes em ordem de probabilidade
    const matchesSignature = (signature) => {
      for (let i = 0; i < signature.length; i++) {
        if (buffer[i] !== signature[i]) return false;
      }
      return true;
    };
    
    if (matchesSignature(FILE_SIGNATURES.XLSX)) {
      return { type: 'xlsx', binary: true };
    }
    
    if (matchesSignature(FILE_SIGNATURES.XLS)) {
      return { type: 'xls', binary: true };
    }
    
    if (matchesSignature(FILE_SIGNATURES.HTML_DOCTYPE) ||
        matchesSignature(FILE_SIGNATURES.HTML_TAG) ||
        matchesSignature(FILE_SIGNATURES.HTML_TAG_UPPER)) {
      return { type: 'html', binary: false };
    }
    
    // Verificar se começa com < (possível HTML/XML)
    if (buffer[0] === 0x3C) {
      return { type: 'html', binary: false };
    }
    
    // Fallback: considerar binário desconhecido
    return { type: 'unknown', binary: true };
  } catch (e) {
    log(`Erro ao detectar tipo de arquivo: ${e.message}`, LOG_LEVELS.WARN);
    return { type: 'unknown', binary: true };
  }
}

/**
 * Validação de arquivo baseada em tamanho, magic bytes e conteúdo
 * DETECTA HTML de erro do portal e marca como inválido para retry
 */
function validateDownloadedFile(filePath, contentType = '') {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Arquivo não existe', isErrorPage: false };
  }
  
  const stats = fs.statSync(filePath);
  
  if (stats.size < LIMITS.MIN_FILE_SIZE_BYTES) {
    return { valid: false, error: `Arquivo muito pequeno: ${stats.size} bytes`, isErrorPage: false };
  }
  
  // Verificar se tamanho indica filtros não aplicados
  if (stats.size > MAX_EXPECTED_FILE_SIZE) {
    log(`⚠️ ATENÇÃO: Arquivo muito grande (${formatBytes(stats.size)}) - pode indicar filtros não aplicados`, LOG_LEVELS.WARN);
  }
  
  // Detectar tipo via magic bytes (binário)
  const fileType = detectFileType(filePath);
  
  // Validação baseada em content-type do header (se disponível)
  const contentTypeLower = String(contentType).toLowerCase();
  const isExcelContentType = contentTypeLower.includes('excel') || 
                             contentTypeLower.includes('spreadsheet') ||
                             contentTypeLower.includes('vnd.ms-excel');
  
  log(`Tipo detectado: ${fileType.type} (content-type: ${contentType || 'não informado'})`, LOG_LEVELS.DEBUG);
  
  // Para HTML - verificar se é página de erro ou relatório válido
  if (fileType.type === 'html') {
    // Ler primeiros 10KB para verificar se é erro
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(10240, stats.size));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    
    const content = buffer.toString('utf-8').toLowerCase();
    
    // Detectar páginas de erro HTTP 500 ou mensagens de erro do portal
    const isErrorPage = content.includes('internal server error') ||
                        content.includes('500 internal') ||
                        content.includes('erro interno') ||
                        content.includes('error 500') ||
                        content.includes('exception') ||
                        content.includes('fatal error') ||
                        content.includes('erro ao gerar') ||
                        content.includes('tempo esgotado') ||
                        content.includes('timeout') ||
                        (content.includes('<html') && !content.includes('<table') && !content.includes('<tr'));
    
    if (isErrorPage) {
      log(`❌ Arquivo HTML é uma página de ERRO do portal`, LOG_LEVELS.ERROR);
      return {
        valid: false,
        error: 'Página de erro do portal detectada - o relatório não foi gerado corretamente',
        isErrorPage: true,
        size: stats.size,
        fileType: 'html',
      };
    }
    
    // Verificar se tem estrutura de tabela (relatório válido)
    const hasTableStructure = content.includes('<table') && content.includes('<tr');
    
    if (!hasTableStructure) {
      log(`⚠️ HTML sem estrutura de tabela detectado`, LOG_LEVELS.WARN);
      // Se arquivo é pequeno e sem tabela, provavelmente é erro
      if (stats.size < 50 * 1024) { // menos de 50KB
        return {
          valid: false,
          error: 'HTML sem dados de relatório detectado',
          isErrorPage: true,
          size: stats.size,
          fileType: 'html',
        };
      }
    }
    
    log(`Arquivo detectado como HTML disfarçado de Excel (com tabelas)`, LOG_LEVELS.INFO);
    return {
      valid: true,
      size: stats.size,
      isHtml: true,
      fileType: fileType.type,
      isErrorPage: false,
    };
  }
  
  // Para Excel binário real (XLSX/XLS)
  if (fileType.type === 'xlsx' || fileType.type === 'xls') {
    return {
      valid: true,
      size: stats.size,
      isHtml: false,
      fileType: fileType.type,
      isErrorPage: false,
    };
  }
  
  // Para tipo desconhecido, aceitar se content-type indica Excel
  if (fileType.type === 'unknown' && isExcelContentType) {
    log(`Tipo desconhecido mas content-type indica Excel - aceitando`, LOG_LEVELS.WARN);
    return {
      valid: true,
      size: stats.size,
      isHtml: false,
      fileType: 'unknown',
      isErrorPage: false,
    };
  }
  
  // Aceitar arquivos > 1KB mesmo sem detecção clara
  if (stats.size > 1024) {
    log(`Arquivo de ${formatBytes(stats.size)} aceito sem detecção de tipo`, LOG_LEVELS.WARN);
    return {
      valid: true,
      size: stats.size,
      isHtml: false,
      fileType: fileType.type,
      isErrorPage: false,
    };
  }
  
  return { valid: false, error: `Tipo de arquivo não reconhecido: ${fileType.type}`, isErrorPage: false };
}

// ============================================
// GESTÃO DE PÁGINAS EXTRAS
// ============================================
async function closeExtraPages(context, mainPage) {
  const pages = context.pages();
  let closed = 0;
  
  for (const p of pages) {
    if (p !== mainPage) {
      try {
        await p.close();
        closed++;
      } catch (e) {
        log(`Erro ao fechar página extra: ${e.message}`, LOG_LEVELS.WARN);
      }
    }
  }
  
  if (closed > 0) {
    log(`Fechadas ${closed} página(s) extra(s)`, LOG_LEVELS.DEBUG);
  }
  
  return closed;
}

// ============================================
// FECHAR POPUPS/MODAIS
// ============================================
async function fecharPopups(page, maxTentativas = LIMITS.MAX_POPUP_CLOSE_ATTEMPTS) {
  let popupFechado = true;
  let tentativas = 0;
  
  while (popupFechado && tentativas < maxTentativas) {
    popupFechado = false;
    tentativas++;
    
    if (tentativas > maxTentativas) {
      log(`Limite de tentativas de fechar popup atingido (${maxTentativas})`, LOG_LEVELS.WARN);
      break;
    }
    
    try {
      await page.waitForTimeout(TIMEOUTS.POPUP_CLOSE);
      
      const seletoresFechar = [
        'button:has-text("Fechar")',
        'a:has-text("Fechar")',
        '.btn:has-text("Fechar")',
        'input[value="Fechar"]',
        'input[type="button"][value="Fechar"]',
        'button:has-text("Continuar e Fechar")',
        'a:has-text("Continuar e Fechar")',
        'button:has-text("Continuar")',
        'button:has-text("OK")',
        '.btn:has-text("OK")',
        '.modal.show button.close',
        '.modal.show .btn-close',
        '.modal.show [data-dismiss="modal"]',
        '.modal button.close',
        '.modal .btn-close',
        '.modal .close',
        'button.close',
        '.close',
        '[data-dismiss="modal"]',
        '[data-bs-dismiss="modal"]',
        '[aria-label="Close"]',
        '.modal-header button',
        '.swal2-confirm',
        '.swal2-close',
        '.bootbox .btn-primary',
        '.bootbox .btn-default',
      ];
      
      for (const seletor of seletoresFechar) {
        try {
          const botoes = await page.$$(seletor);
          for (const botao of botoes) {
            const isVisible = await botao.isVisible().catch(() => false);
            if (isVisible) {
              log(`Popup detectado - fechando via: ${seletor}`, LOG_LEVELS.DEBUG);
              await botao.click({ force: true }).catch(() => {});
              await page.waitForTimeout(1000);
              popupFechado = true;
              break;
            }
          }
          if (popupFechado) break;
        } catch {
          // Continuar tentando
        }
      }
      
      // Fallback via JavaScript
      if (!popupFechado) {
        const fechouViaJS = await page.evaluate(() => {
          let fechou = false;
          
          const allElements = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], .btn');
          for (const el of allElements) {
            const texto = (el.textContent || el.value || '').toLowerCase().trim();
            if (texto === 'fechar' || texto.includes('fechar')) {
              const style = window.getComputedStyle(el);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                el.click();
                fechou = true;
                break;
              }
            }
          }
          
          if (!fechou) {
            const modals = document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"]');
            modals.forEach(modal => {
              const closeBtn = modal.querySelector('.close, button.close, .btn-close, [data-dismiss="modal"]');
              if (closeBtn) {
                closeBtn.click();
                fechou = true;
              }
            });
          }
          
          if (!fechou) {
            const swalClose = document.querySelector('.swal2-close, .swal2-confirm');
            if (swalClose) {
              swalClose.click();
              fechou = true;
            }
          }
          
          const overlays = document.querySelectorAll('.modal-backdrop');
          overlays.forEach(o => o.remove());
          
          return fechou;
        }).catch(() => false);
        
        if (fechouViaJS) {
          popupFechado = true;
          await page.waitForTimeout(1000);
        }
      }
      
    } catch (e) {
      // Silenciar erros
    }
  }
  
  if (tentativas > 1) {
    log(`Verificação de popups concluída (${tentativas} iterações)`, LOG_LEVELS.DEBUG);
  }
}

// ============================================
// SELEÇÃO DE FORMA DE EXIBIÇÃO EXCEL
// ============================================
async function selecionarFormaExibicaoEmExcel(page) {
  log('Selecionando Forma de Exibição: Em Excel', LOG_LEVELS.INFO);
  
  const tryInFrame = async (frame) => {
    try {
      const result = await frame.evaluate(() => {
        const setRadioChecked = (radio) => {
          try {
            if (radio.disabled) return false;
            
            if (radio.name) {
              const siblings = document.querySelectorAll(`input[type="radio"][name="${radio.name}"]`);
              siblings.forEach(r => {
                if (r !== radio && r.checked) {
                  r.checked = false;
                  r.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
            }
            
            radio.checked = true;
            radio.dispatchEvent(new Event('click', { bubbles: true }));
            radio.dispatchEvent(new Event('input', { bubbles: true }));
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            
            const form = radio.closest('form');
            if (form) {
              form.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            return true;
          } catch (e) {
            return false;
          }
        };

        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        
        // Estratégia 1: Buscar por texto próximo
        for (const radio of radios) {
          const containers = [
            radio.closest('tr'),
            radio.closest('td'),
            radio.closest('label'),
            radio.closest('div'),
            radio.parentElement,
            radio.closest('font'),
            radio.closest('p'),
          ].filter(Boolean);
          
          for (const container of containers) {
            const text = (container.textContent || '').toLowerCase();
            
            if (/\bem\s*excel\b/i.test(text) || (text.includes('excel') && text.includes('em'))) {
              if (setRadioChecked(radio)) {
                return { success: true, method: 'nearText', radioValue: radio.value };
              }
            }
          }
        }
        
        // Estratégia 2: Buscar pelo valor do radio
        for (const radio of radios) {
          const value = (radio.value || '').toLowerCase();
          const name = (radio.name || '').toLowerCase();
          
          if (value.includes('excel') || name.includes('excel') || value === 'xls' || value === 'xlsx') {
            if (setRadioChecked(radio)) {
              return { success: true, method: 'value', radioValue: radio.value };
            }
          }
        }
        
        // Estratégia 3: Buscar texto "Em Excel" na página
        const textElements = document.querySelectorAll('td, span, label, font, div, p, b, strong');
        for (const el of textElements) {
          const text = (el.textContent || '').trim();
          
          if (/^Em\s*Excel$/i.test(text) || /\bEm\s*Excel\b/i.test(text)) {
            const tr = el.closest('tr');
            if (tr) {
              const radio = tr.querySelector('input[type="radio"]');
              if (radio && setRadioChecked(radio)) {
                return { success: true, method: 'sameRow', radioValue: radio.value };
              }
            }
            
            const parent = el.parentElement;
            if (parent) {
              const radio = parent.querySelector('input[type="radio"]');
              if (radio && setRadioChecked(radio)) {
                return { success: true, method: 'parent', radioValue: radio.value };
              }
            }
          }
        }
        
        // Estratégia 4: Grupo de forma exibição
        const formaExibicaoRadios = radios.filter(r => {
          const name = (r.name || '').toLowerCase();
          return name.includes('forma') || name.includes('exib') || name.includes('tipo') || name.includes('output');
        });
        
        if (formaExibicaoRadios.length >= 2) {
          const excelRadio = formaExibicaoRadios[1];
          if (setRadioChecked(excelRadio)) {
            return { success: true, method: 'groupSecond', radioValue: excelRadio.value };
          }
        }
        
        return { success: false, totalRadios: radios.length };
      });
      
      if (result.success) {
        log(`Excel selecionado: ${result.method}`, LOG_LEVELS.SUCCESS);
        await page.waitForTimeout(500);
        return true;
      }
      
    } catch (e) {
      log(`Erro na seleção JavaScript: ${e.message}`, LOG_LEVELS.DEBUG);
    }

    return false;
  };

  // Tentar no frame principal
  if (await tryInFrame(page.mainFrame())) {
    return true;
  }

  // Tentar em iframes
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await tryInFrame(frame)) {
      return true;
    }
  }

  log('Não foi possível selecionar a opção Excel', LOG_LEVELS.WARN);
  return false;
}

// ============================================
// SISTEMA DE DOWNLOAD COM EXECUÇÃO IMEDIATA
// ============================================

/**
 * Classe para controlar o estado do download e cancelar watchers
 * O saveAs é executado IMEDIATAMENTE ao capturar o download,
 * SEM aguardar nenhum outro evento de página/popup/response
 */
class DownloadController {
  constructor() {
    this.captured = false;
    this.result = null;
    this.fileResult = null;
    this.error = null;
    this.cleanupFunctions = [];
    this.monitorInterval = null;
    this.startTime = Date.now();
    this.onCompleteCallback = null;
  }
  
  addCleanup(fn) {
    this.cleanupFunctions.push(fn);
  }
  
  setCaptured(result) {
    if (this.captured) return false; // Já foi capturado
    this.captured = true;
    this.result = result;
    log(`Download capturado! Fonte: ${result.source}`, LOG_LEVELS.SUCCESS);
    log(`Cancelando todos os watchers...`, LOG_LEVELS.DEBUG);
    this.cleanup();
    return true;
  }
  
  setFileResult(fileResult) {
    this.fileResult = fileResult;
    // Notificar que o arquivo foi salvo
    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }
  }
  
  setError(error) {
    this.error = error;
    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }
  }
  
  setOnComplete(callback) {
    this.onCompleteCallback = callback;
  }
  
  isCaptured() {
    return this.captured;
  }
  
  isComplete() {
    return this.fileResult !== null || this.error !== null;
  }
  
  getResult() {
    return this.result;
  }
  
  getFileResult() {
    return this.fileResult;
  }
  
  getError() {
    return this.error;
  }
  
  cleanup() {
    // Parar monitor de progresso
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    // Executar todas as funções de cleanup registradas
    for (const fn of this.cleanupFunctions) {
      try {
        fn();
      } catch (e) {
        // Ignorar erros de cleanup
      }
    }
    this.cleanupFunctions = [];
    log(`Cleanup concluído - todos os watchers removidos`, LOG_LEVELS.DEBUG);
  }
  
  startProgressMonitor() {
    this.monitorInterval = setInterval(() => {
      if (this.captured || this.isComplete()) {
        clearInterval(this.monitorInterval);
        return;
      }
      const elapsed = Date.now() - this.startTime;
      const minutos = Math.floor(elapsed / 60000);
      const segundos = Math.floor((elapsed % 60000) / 1000);
      log(`Aguardando download... ${minutos}m ${segundos}s`, LOG_LEVELS.DEBUG);
    }, 30000);
  }
}

/**
 * Verifica se uma resposta HTTP contém um arquivo Excel ou binário de relatório
 */
function isExcelResponse(response) {
  try {
    if (!response) return false;
    const status = response.status();
    if (status < 200 || status >= 400) return false;
    
    const headers = response.headers() || {};
    const contentType = String(headers['content-type'] || '').toLowerCase();
    const contentDisposition = String(headers['content-disposition'] || '').toLowerCase();
    const url = String(response.url?.() || '').toLowerCase();
    const contentLength = parseInt(headers['content-length'] || '0', 10);
    
    // Verificar Content-Type Excel específico
    if (contentType.includes('spreadsheet') || 
        contentType.includes('excel') || 
        contentType.includes('vnd.ms-excel') ||
        contentType.includes('vnd.openxmlformats-officedocument.spreadsheetml')) {
      return true;
    }
    
    // Verificar Content-Disposition com extensão Excel
    if (contentDisposition.includes('.xlsx') || contentDisposition.includes('.xls')) {
      return true;
    }
    
    // Verificar extensão na URL
    if (url.includes('.xlsx') || url.includes('.xls')) {
      return true;
    }
    
    // Verificar octet-stream com attachment (potencial download)
    if (contentType.includes('octet-stream') && contentDisposition.includes('attachment')) {
      // Se tem extensão xls ou tamanho significativo, provavelmente é o arquivo
      if (contentDisposition.includes('xls') || contentLength > 1000) {
        return true;
      }
    }
    
    // Verificar application/download ou force-download
    if (contentType.includes('download') || contentType.includes('force-download')) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Watcher HTTP: Intercepta respostas HTTP que contêm Excel
 * 
 * ATENÇÃO: Este é um FALLBACK - só executa se:
 * 1. Nenhum evento de download foi capturado via Playwright
 * 2. E não houve criação de arquivo pelo browser
 * 
 * Se download foi capturado via Playwright, este watcher é IGNORADO
 * (controller.isCaptured() retorna true e o handler retorna imediatamente)
 */
function criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onResponse = async (response) => {
    // REGRA: Se download já foi capturado via Playwright, NÃO executar HTTP stream
    if (controller.isCaptured()) return;
    
    if (isExcelResponse(response)) {
      const headers = response.headers() || {};
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const contentDisposition = String(headers['content-disposition'] || '');
      
      // Extrair nome do arquivo do header, se disponível
      let fileName = semanticName;
      const fileNameMatch = contentDisposition.match(/filename[*]?=["']?([^"';\n]+)/i);
      if (fileNameMatch) {
        log(`Arquivo detectado via HTTP: ${fileNameMatch[1]}`, LOG_LEVELS.DEBUG);
      }
      
      // Verificar novamente se alguém capturou enquanto processávamos
      if (controller.isCaptured()) {
        log(`Download já capturado via Playwright - ignorando HTTP stream`, LOG_LEVELS.DEBUG);
        return;
      }
      
      // ===== MARCAR COMO CAPTURADO =====
      const wasCaptured = controller.setCaptured({ 
        type: 'httpResponse', 
        response, 
        source: 'httpStream' 
      });
      
      if (!wasCaptured) return;
      
      log(`✅ Download capturado via HTTP stream (fallback)`, LOG_LEVELS.SUCCESS);
      if (contentLength > 0) {
        log(`Tamanho esperado: ${(contentLength / 1024).toFixed(2)} KB`, LOG_LEVELS.DEBUG);
      }
      
      try {
        const filePath = path.join(downloadDir, semanticName);
        const startTime = Date.now();

        // ===== PASSO 2: Replay via HTTP stream (Node) com progresso percentual =====
        // Motivo: Playwright response.body()/download.saveAs() não expõem progresso e podem ser cancelados.
        log(`⬇️ Baixando via HTTP stream (com progresso)...`, LOG_LEVELS.INFO);

        const request = response.request?.();
        const url = response.url?.();
        const method = request?.method?.() || 'GET';
        const requestHeaders = pickHeadersForHttpReplay(request?.headers?.() || {});
        const cookieHeader = await buildCookieHeader(context, url);
        if (cookieHeader) requestHeaders['cookie'] = cookieHeader;

        const postData = request?.postData?.();
        const result = await downloadViaAxiosStream({
          url,
          method,
          headers: requestHeaders,
          data: method !== 'GET' ? postData : undefined,
          filePath,
          expectedBytes: contentLength,
          idleTimeoutMs: TIMEOUTS.DOWNLOAD_IDLE,
          hardTimeoutMs: TIMEOUTS.DOWNLOAD_HARD,
        });

        const downloadTime = Math.floor((Date.now() - startTime) / 1000);
        log(`✅ Download HTTP concluído em ${downloadTime}s (${formatBytes(result.size)})`, LOG_LEVELS.SUCCESS);
        
        // ===== PASSO 4: Validação síncrona (binária) =====
        if (!fs.existsSync(filePath)) {
          throw new Error('FALHA: Arquivo não existe após salvamento HTTP');
        }
        
        const stats = fs.statSync(filePath);
        const contentTypeHeader = String(headers['content-type'] || '');

        // Verificar se tamanho bate com content-length (se informado)
        if (contentLength > 0 && stats.size !== contentLength) {
          log(`⚠️ Tamanho difere: esperado ${contentLength}, recebido ${stats.size}`, LOG_LEVELS.WARN);
        }

        // ===== PASSO 5: Log de sucesso =====
        log(`✅ Arquivo salvo com sucesso: ${semanticName} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
        log(`✅ Etapa DOWNLOAD concluída via HTTP Stream`, LOG_LEVELS.SUCCESS);
        
        controller.setFileResult({ filePath, size: stats.size, contentType: contentTypeHeader });
      } catch (e) {
        log(`❌ Erro ao salvar via HTTP: ${e.message}`, LOG_LEVELS.ERROR);
        controller.setError(e);
      }
    }
  };
  
  const attachToPage = (page) => {
    if (!page || pagesAttached.has(page)) return;
    pagesAttached.add(page);
    page.on('response', onResponse);
  };
  
  const onNewPage = (page) => {
    if (controller.isCaptured()) return;
    attachToPage(page);
  };
  
  // Anexar a todas as páginas existentes
  for (const p of context.pages()) {
    attachToPage(p);
  }
  
  // Monitorar novas páginas
  context.on('page', onNewPage);
  
  // Registrar cleanup
  controller.addCleanup(() => {
    try { context.removeListener('page', onNewPage); } catch {}
    for (const p of pagesAttached) {
      try { p.removeListener('response', onResponse); } catch {}
    }
  });
}

/**
 * Processa um objeto Download do Playwright IMEDIATAMENTE
 * 
 * FLUXO TERMINAL COM PROGRESSO:
 * 1. Log: "Download capturado"
 * 2. Tenta extrair Content-Length dos headers para calcular %
 * 3. Inicia monitor de progresso do arquivo em disco
 * 4. download.saveAs(filePath) - SEM TIMEOUT RÍGIDO (aguarda conclusão)
 * 5. Validação síncrona: fs.existsSync() + stats.size > 0
 * 6. Log: "Arquivo salvo com sucesso" com nome e tamanho
 * 
 * NOTA: Removido timeout para permitir downloads grandes do portal lento.
 */
async function processarDownloadImediato(download, downloadDir, semanticName) {
  const filePath = path.join(downloadDir, semanticName);
  const suggestedName = download.suggestedFilename?.() || 'download.xlsx';

  // ===== PASSO 1: Tentar obter tamanho esperado dos headers =====
  let expectedSize = 0;
  try {
    const request = download.request?.();
    if (request) {
      const response = await request.response?.();
      if (response) {
        const headers = response.headers?.() || {};
        expectedSize = parseInt(headers['content-length'] || '0', 10);
      }
    }
  } catch (e) {
    // Ignorar - monitoramento funcionará sem expectedSize
  }

  // ===== PASSO 2: Log de captura com tamanho =====
  if (expectedSize > 0) {
    log(`Download capturado - Tamanho: ${formatBytes(expectedSize)}`, LOG_LEVELS.SUCCESS);
  } else {
    log(`Download capturado - Tamanho: desconhecido (streaming)`, LOG_LEVELS.SUCCESS);
  }

  log(`Salvando: ${suggestedName} -> ${filePath}`, LOG_LEVELS.INFO);

  log(`Aguardando transmissão do portal (saveAs)...`, LOG_LEVELS.DEBUG);
  log(`⏳ O portal pode demorar vários minutos para gerar o relatório...`, LOG_LEVELS.INFO);

  // ===== PASSO 3: Iniciar monitor de progresso do arquivo em disco =====
  const stopMonitor = monitorFileProgress(filePath, expectedSize);
  const startTime = Date.now();

  // Heartbeat para mostrar que o processo ainda está ativo (reduzido para 15s)
  const HEARTBEAT_INTERVAL = 15000; // 15 segundos
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    // Verificar se arquivo começou a ser criado
    const possiblePaths = [filePath, filePath + '.crdownload', filePath + '.part'];
    let fileSize = 0;
    let foundPath = null;
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          fileSize = fs.statSync(p).size;
          foundPath = p;
          break;
        }
      } catch {}
    }
    
    if (fileSize > 0) {
      const speed = fileSize / Math.max(1, elapsed);
      if (expectedSize > 0) {
        const pct = Math.min(100, Math.floor((fileSize / expectedSize) * 100));
        // Barra de progresso visual
        const barSize = 20;
        const filled = Math.round((pct / 100) * barSize);
        const empty = barSize - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        log(`⏳ Download [${bar}] ${pct}% (${formatBytes(fileSize)} / ${formatBytes(expectedSize)}) • ${formatBytes(speed)}/s (${minutes}m ${seconds}s)`, LOG_LEVELS.INFO);
      } else {
        log(`⏳ Recebendo dados... ${formatBytes(fileSize)} • ${formatBytes(speed)}/s (${minutes}m ${seconds}s)`, LOG_LEVELS.INFO);
      }
    } else {
      log(`⏳ Aguardando servidor Hinova gerar relatório... (${minutes}m ${seconds}s)`, LOG_LEVELS.INFO);
    }
  }, HEARTBEAT_INTERVAL);

  let timeoutId = null;
  
  try {
    // Promise de timeout explícito para evitar cancelamento inesperado
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout de ${Math.floor(TIMEOUTS.DOWNLOAD_HARD / 60000)} minutos atingido aguardando download do portal`));
      }, TIMEOUTS.DOWNLOAD_HARD);
    });
    
    const savePromise = download.saveAs(filePath);
    
    // Usar Promise.race para permitir timeout controlado
    // O primeiro a resolver/rejeitar ganha
    await Promise.race([savePromise, timeoutPromise]);
    
    // Se chegou aqui, saveAs completou com sucesso
    // Cancelar o timeout
    if (timeoutId) clearTimeout(timeoutId);
    
  } catch (err) {
    // Garantir limpeza do timeout em caso de erro
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  } finally {
    clearInterval(heartbeatInterval);
    stopMonitor();
  }

  // ===== PASSO 4: Validação síncrona =====
  if (!fs.existsSync(filePath)) {
    throw new Error('FALHA: Arquivo não existe após saveAs');
  }
  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`FALHA: Arquivo vazio (${stats.size} bytes)`);
  }

  // Verificar se tamanho bate com content-length (se informado)
  if (expectedSize > 0 && stats.size !== expectedSize) {
    log(`⚠️ Tamanho difere: esperado ${formatBytes(expectedSize)}, recebido ${formatBytes(stats.size)}`, LOG_LEVELS.WARN);
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log(`Download concluído em ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`, LOG_LEVELS.SUCCESS);
  log(`Arquivo salvo com sucesso: ${semanticName} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
  log(`✅ Etapa DOWNLOAD concluída`, LOG_LEVELS.SUCCESS);
  return { filePath, size: stats.size };
}

/**
 * Watcher 2: Captura eventos de download global
 * 
 * REGRA OBRIGATÓRIA: Quando download é capturado via Playwright:
 * → USAR APENAS download.saveAs()
 * → NÃO executar HTTP stream
 * → NÃO fazer GET manual
 * → NÃO reutilizar URL geraRelatorioBoleto.php
 */
function criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    
    const filename = download.suggestedFilename?.() || '';
    log(`✅ Download CAPTURADO via Playwright (globalDownload): ${filename}`, LOG_LEVELS.SUCCESS);
    
    // Marcar como capturado ANTES de qualquer processamento
    const wasCaptured = controller.setCaptured({ 
      type: 'download', 
      download, 
      source: 'globalDownload' 
    });
    
    if (!wasCaptured) return; // Outro watcher já capturou
    
    try {
      // REGRA: Download capturado via Playwright = usar APENAS saveAs
      // NÃO tentar HTTP stream, NÃO fazer GET manual
      log(`📥 Usando download.saveAs() - PRIORIDADE TOTAL para download do browser`, LOG_LEVELS.INFO);
      const result = await processarDownloadImediato(download, downloadDir, semanticName);
      controller.setFileResult(result);
    } catch (e) {
      log(`Erro ao salvar download via saveAs: ${e.message}`, LOG_LEVELS.ERROR);
      controller.setError(e);
    }
  };
  
  const attachToPage = (page) => {
    if (!page || pagesAttached.has(page)) return;
    pagesAttached.add(page);
    page.on('download', onDownload);
  };
  
  const onNewPage = (page) => {
    if (controller.isCaptured()) return;
    log(`Watcher Download: nova página detectada`, LOG_LEVELS.DEBUG);
    attachToPage(page);
  };
  
  // Anexar a todas as páginas existentes
  for (const p of context.pages()) {
    attachToPage(p);
  }
  
  // Monitorar novas páginas
  context.on('page', onNewPage);
  
  // Registrar cleanup
  controller.addCleanup(() => {
    try { context.removeListener('page', onNewPage); } catch {}
    for (const p of pagesAttached) {
      try { p.removeListener('download', onDownload); } catch {}
    }
  });
}

/**
 * Watcher 3: Evento de download da página principal
 * 
 * REGRA OBRIGATÓRIA: Quando download é capturado via Playwright:
 * → USAR APENAS download.saveAs()
 * → NÃO executar HTTP stream
 * → NÃO fazer GET manual
 */
function criarWatcherDownloadPaginaPrincipal(context, page, controller, downloadDir, semanticName) {
  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    
    const filename = download.suggestedFilename?.() || '';
    log(`✅ Download CAPTURADO via Playwright (mainPage): ${filename}`, LOG_LEVELS.SUCCESS);
    
    // Marcar como capturado ANTES de qualquer processamento
    const wasCaptured = controller.setCaptured({ 
      type: 'download', 
      download, 
      source: 'mainPage' 
    });
    
    if (!wasCaptured) return; // Outro watcher já capturou
    
    try {
      // REGRA: Download capturado via Playwright = usar APENAS saveAs
      // NÃO tentar HTTP stream, NÃO fazer GET manual
      log(`📥 Usando download.saveAs() - PRIORIDADE TOTAL para download do browser`, LOG_LEVELS.INFO);
      const result = await processarDownloadImediato(download, downloadDir, semanticName);
      controller.setFileResult(result);
    } catch (e) {
      log(`Erro ao salvar download via saveAs: ${e.message}`, LOG_LEVELS.ERROR);
      controller.setError(e);
    }
  };
  
  page.on('download', onDownload);
  
  // Registrar cleanup
  controller.addCleanup(() => {
    try { page.removeListener('download', onDownload); } catch {}
  });
}

/**
 * Watcher 4: Monitora novas abas (popup) e captura downloads delas
 * 
 * COMPORTAMENTO TERMINAL:
 * - Se já capturou download, fecha novas abas silenciosamente
 * - Ao capturar download, aguarda finalização do download e salva/copia para o destino
 * - NÃO aguarda carregamento de página após captura
 * - NÃO executa lógica adicional após o arquivo estar salvo
 */
function criarWatcherNovaAba(context, mainPage, controller, downloadDir, semanticName) {
  const processarNovaAba = async (newPage) => {
    // Se já capturou, apenas fechar a nova aba silenciosamente - SEM ESPERA
    if (controller.isCaptured()) {
      try { await newPage.close(); } catch {}
      return;
    }
    
    try {
      log(`Nova aba detectada: configurando listener de download...`, LOG_LEVELS.DEBUG);
      
      // Handler de download na nova aba - USAR APENAS saveAs
      const onNewPageDownload = async (download) => {
        if (controller.isCaptured()) return;
        
        const filename = download.suggestedFilename?.() || '';
        log(`✅ Download CAPTURADO via Playwright (newTab): ${filename}`, LOG_LEVELS.SUCCESS);
        
        const wasCaptured = controller.setCaptured({ 
          type: 'download', 
          download, 
          source: 'newTab', 
          newPage 
        });
        
        if (!wasCaptured) return;
        
        try {
          // REGRA: Download capturado via Playwright = usar APENAS saveAs
          // NÃO tentar HTTP stream, NÃO fazer GET manual
          log(`📥 Usando download.saveAs() - PRIORIDADE TOTAL para download do browser`, LOG_LEVELS.INFO);
          const result = await processarDownloadImediato(download, downloadDir, semanticName);
          controller.setFileResult(result);
          
          // Fechar aba após salvar (sem esperar)
          newPage.close().catch(() => {});
        } catch (e) {
          log(`Erro ao salvar download via saveAs: ${e.message}`, LOG_LEVELS.ERROR);
          controller.setError(e);
        }
      };
      
      newPage.on('download', onNewPageDownload);
      
      // Aguardar carregamento com timeout curto - MAS parar IMEDIATAMENTE se capturou
      let loadCompleted = false;
      const loadTimeout = setTimeout(() => { loadCompleted = true; }, 10000);
      
      const checkCaptured = setInterval(() => {
        if (controller.isCaptured()) {
          clearTimeout(loadTimeout);
          clearInterval(checkCaptured);
          loadCompleted = true;
        }
      }, 50);
      
      // Tentar carregar página (com timeout curto)
      await Promise.race([
        newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }),
        new Promise(resolve => setTimeout(resolve, 8000)),
      ]).catch(() => {});
      
      clearTimeout(loadTimeout);
      clearInterval(checkCaptured);
      
      // Se já capturou durante o carregamento, NÃO fazer mais nada
      if (controller.isCaptured()) {
        try { newPage.removeListener('download', onNewPageDownload); } catch {}
        return;
      }
      
      // Procurar e clicar em botões de download APENAS se ainda não capturou
      const seletoresDownload = [
        'a[href*=".xlsx"]', 'a[href*=".xls"]',
        'a:has-text("Baixar")', 'button:has-text("Baixar")',
      ];
      
      for (const seletor of seletoresDownload) {
        if (controller.isCaptured()) break;
        const el = await newPage.$(seletor).catch(() => null);
        if (el && (await el.isVisible().catch(() => false))) {
          await el.click({ timeout: 3000 }).catch(() => {});
          break;
        }
      }
      
      // Cleanup do listener
      controller.addCleanup(() => {
        try { newPage.removeListener('download', onNewPageDownload); } catch {}
      });
      
    } catch (err) {
      // Ignorar erros - não afetar o fluxo principal
    }
  };
  
  const onNewPage = (newPage) => {
    if (newPage !== mainPage) {
      processarNovaAba(newPage);
    }
  };
  
  context.on('page', onNewPage);
  
  // Registrar cleanup
  controller.addCleanup(() => {
    try { context.removeListener('page', onNewPage); } catch {}
  });
}

/**
 * Inicia todos os watchers e aguarda o primeiro download válido
 * 
 * PRIORIDADE OBRIGATÓRIA (conforme regras do usuário):
 * 1. Download Playwright (globalDownload, mainPage, newTab) → PRIORIDADE TOTAL → usa APENAS saveAs()
 * 2. HTTP Stream → APENAS se nenhum download foi capturado via Playwright E não houve criação de arquivo
 * 
 * REGRA: Se download é capturado via Playwright:
 * → NÃO executar HTTP stream
 * → NÃO fazer GET manual
 * → USAR APENAS download.saveAs()
 */
async function aguardarDownloadHibrido(context, page, downloadDir, semanticName, timeoutMs) {
  log(`Iniciando captura de download...`, LOG_LEVELS.INFO);
  log(`Arquivo destino: ${path.join(downloadDir, semanticName)}`, LOG_LEVELS.DEBUG);
  log(`PRIORIDADE: Download Playwright (saveAs) > HTTP Stream (fallback)`, LOG_LEVELS.DEBUG);
  
  const controller = new DownloadController();
  
  // ORDEM CRÍTICA: Watchers de Download do Playwright PRIMEIRO (prioridade total)
  // O primeiro que capturar bloqueia os demais via controller.isCaptured()
  criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName);         // 1º - Download global
  criarWatcherDownloadPaginaPrincipal(context, page, controller, downloadDir, semanticName); // 2º - Página principal  
  criarWatcherNovaAba(context, page, controller, downloadDir, semanticName);          // 3º - Nova aba/popup
  criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName);           // 4º - HTTP Stream (FALLBACK)
  
  // Iniciar monitor de progresso
  controller.startProgressMonitor();
  
  // Aguardar arquivo salvo ou timeout - RESOLVE IMEDIATAMENTE após arquivo ser salvo
  return new Promise((resolve) => {
    let resolved = false;
    
    const doResolve = (result) => {
      if (resolved) return;
      resolved = true;
      controller.cleanup();
      resolve(result);
    };
    
    // Callback para quando arquivo for salvo - RESOLUÇÃO IMEDIATA
    controller.setOnComplete(() => {
      if (controller.getError()) {
        doResolve({ success: false, error: controller.getError() });
      } else if (controller.getFileResult()) {
        const fileResult = controller.getFileResult();
        doResolve({ 
          success: true, 
          filePath: fileResult.filePath, 
          size: fileResult.size,
          source: controller.getResult()?.source 
        });
      }
    });
    
    // Timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        log(`Timeout de ${timeoutMs / 60000} min - nenhum download capturado`, LOG_LEVELS.WARN);
        doResolve({ success: false, error: new Error('Timeout - nenhum download capturado') });
      }
    }, timeoutMs);
    
    // Registrar cleanup do timeout
    controller.addCleanup(() => {
      clearTimeout(timeoutId);
    });
  });
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function getDateRange() {
  const hoje = new Date();
  const diaAtual = hoje.getDate();
  
  const formatDate = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };
  
  const formatMesReferencia = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  
  const periodos = [];
  
  // Se estamos nos primeiros 5 dias do mês, atualizar relatório do mês anterior
  if (diaAtual <= 5) {
    const primeiroDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    periodos.push({
      inicio: formatDate(primeiroDiaMesAnterior),
      fim: formatDate(ultimoDiaMesAnterior),
      mesReferencia: formatMesReferencia(primeiroDiaMesAnterior),
      modo: 'atualizar_anterior',
    });
  }
  
  // Mês atual (sempre)
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  periodos.push({
    inicio: formatDate(primeiroDia),
    fim: formatDate(ultimoDia),
    mesReferencia: formatMesReferencia(primeiroDia),
    modo: 'substituir',
  });
  
  return periodos;
}

// ============================================
// CONFIGURAÇÃO DE FILTROS - SITUAÇÃO BOLETO
// ============================================


/**
 * Situações de boleto que DEVEM estar marcadas (padrão)
 * Baseado na configuração do usuário - CANCELADO excluído
 */
const SITUACOES_DESEJADAS = [
  'ABERTO',
  'ABERTO MIGRADO',
  'BAIXADO',
  'BAIXADO C/ PENDÊNCIA',
  'BAIXADOS MIGRADOS',
];

/**
 * Situações de boleto que DEVEM estar desmarcadas
 */
const SITUACOES_EXCLUIDAS = [
  'CANCELADO',
];

/**
 * Configura APENAS os checkboxes de "Situação Boleto"
 * - Marca as situações desejadas
 * - Desmarca CANCELADO
 * - NÃO toca nos outros checkboxes da página
 */
async function configurarCheckboxesSituacaoBoleto(page, maxTentativas = 3) {
  const stepAnterior = currentStep;
  setStep('FILTROS_SITUACAO');
  
  log('📋 Configurando checkboxes de Situação Boleto...', LOG_LEVELS.INFO);
  log(`   ✓ Marcar: ${SITUACOES_DESEJADAS.join(', ')}`, LOG_LEVELS.INFO);
  log(`   ✗ Desmarcar: ${SITUACOES_EXCLUIDAS.join(', ')}`, LOG_LEVELS.INFO);
  
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    // Executar configuração no navegador
    const resultado = await page.evaluate(({ marcar, desmarcar }) => {
      const resultados = {
        marcados: [],
        desmarcados: [],
        erros: [],
        naoEncontrados: [],
        encontrados: [],
      };
      
      // Função para normalizar texto (remover acentos, uppercase)
      const normalizar = (texto) => {
        return (texto || '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      // ESTRATÉGIA: Procurar a SEÇÃO "Situação Boleto" e trabalhar apenas dentro dela
      // O portal Hinova usa estrutura: table > tr com label "Situação Boleto" e checkboxes
      
      // Primeiro, encontrar TODOS os TDs/TRs que contêm texto "SITUAÇÃO BOLETO" ou similar
      const allTds = document.querySelectorAll('td, th, div');
      let situacaoBoletoContainer = null;
      
      for (const td of allTds) {
        const texto = normalizar(td.textContent || '');
        if (texto.includes('SITUACAO BOLETO') || texto === 'SITUACAO' || (texto.includes('SITUACAO') && !texto.includes('ASSOCIADO'))) {
          // Encontrar o container pai que provavelmente contém os checkboxes
          const tr = td.closest('tr');
          const table = td.closest('table');
          if (tr || table) {
            situacaoBoletoContainer = tr || table;
            resultados.encontrados.push(`Container encontrado: ${td.textContent?.trim().substring(0, 50)}`);
            break;
          }
        }
      }
      
      // Se não encontrou container específico, procurar por labels com texto das situações
      const situacoesParaMarcar = [...marcar, ...desmarcar];
      const checkboxesEncontrados = new Map();
      
      // Método 1: Procurar por texto exato nas TDs (o Hinova geralmente tem estrutura: TD com checkbox + texto)
      for (const situacao of situacoesParaMarcar) {
        const sitNorm = normalizar(situacao);
        
        // Procurar em todas as TDs
        for (const td of document.querySelectorAll('td')) {
          const tdText = normalizar(td.textContent || '');
          
          // Verificar se a TD contém exatamente esse texto de situação
          if (tdText === sitNorm || tdText.includes(sitNorm)) {
            const cb = td.querySelector('input[type="checkbox"]');
            if (cb) {
              checkboxesEncontrados.set(situacao, cb);
              break;
            }
            
            // Verificar TDs irmãs (checkbox pode estar em outra coluna)
            const tr = td.closest('tr');
            if (tr) {
              const cbInRow = tr.querySelector('input[type="checkbox"]');
              if (cbInRow && !Array.from(checkboxesEncontrados.values()).includes(cbInRow)) {
                // Verificar se não é um checkbox já mapeado
                let jaUsado = false;
                for (const [key, val] of checkboxesEncontrados) {
                  if (val === cbInRow) { jaUsado = true; break; }
                }
                if (!jaUsado) {
                  checkboxesEncontrados.set(situacao, cbInRow);
                  break;
                }
              }
            }
          }
        }
      }
      
      // Método 2: Procurar por value do checkbox que corresponda à situação
      if (checkboxesEncontrados.size < situacoesParaMarcar.length) {
        const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
        for (const cb of allCheckboxes) {
          const cbValue = normalizar(cb.value || '');
          const cbName = normalizar(cb.name || '');
          const cbId = normalizar(cb.id || '');
          
          for (const situacao of situacoesParaMarcar) {
            if (checkboxesEncontrados.has(situacao)) continue;
            
            const sitNorm = normalizar(situacao);
            
            if (cbValue.includes(sitNorm) || sitNorm.includes(cbValue) ||
                cbName.includes(sitNorm) || cbId.includes(sitNorm)) {
              checkboxesEncontrados.set(situacao, cb);
            }
          }
        }
      }
      
      // Método 3: Procurar pela label pai do checkbox
      if (checkboxesEncontrados.size < situacoesParaMarcar.length) {
        const allLabels = document.querySelectorAll('label');
        for (const label of allLabels) {
          const labelText = normalizar(label.textContent || '');
          
          for (const situacao of situacoesParaMarcar) {
            if (checkboxesEncontrados.has(situacao)) continue;
            
            const sitNorm = normalizar(situacao);
            
            if (labelText.includes(sitNorm) || sitNorm.includes(labelText)) {
              const cb = label.querySelector('input[type="checkbox"]');
              if (cb) {
                checkboxesEncontrados.set(situacao, cb);
              }
            }
          }
        }
      }
      
      resultados.encontrados.push(`Checkboxes mapeados: ${checkboxesEncontrados.size}/${situacoesParaMarcar.length}`);
      
      // Aplicar configurações
      for (const situacao of marcar) {
        const cb = checkboxesEncontrados.get(situacao);
        if (cb) {
          if (!cb.checked) {
            cb.click();
            resultados.marcados.push(situacao);
          } else {
            resultados.marcados.push(`${situacao} (já marcado)`);
          }
        } else {
          resultados.naoEncontrados.push(situacao);
        }
      }
      
      for (const situacao of desmarcar) {
        const cb = checkboxesEncontrados.get(situacao);
        if (cb) {
          if (cb.checked) {
            cb.click();
            resultados.desmarcados.push(situacao);
          } else {
            resultados.desmarcados.push(`${situacao} (já desmarcado)`);
          }
        } else {
          resultados.naoEncontrados.push(`${situacao} (para desmarcar)`);
        }
      }
      
      return resultados;
    }, { marcar: SITUACOES_DESEJADAS, desmarcar: SITUACOES_EXCLUIDAS });
    
    // Aguardar estabilização
    await page.waitForTimeout(500);
    
    // Logar resultados
    log(`📋 Tentativa ${tentativa}/${maxTentativas}:`, LOG_LEVELS.INFO);
    if (resultado.encontrados.length > 0) {
      resultado.encontrados.forEach(e => log(`   🔍 ${e}`, LOG_LEVELS.DEBUG));
    }
    if (resultado.marcados.length > 0) {
      log(`   ✅ Marcados: ${resultado.marcados.join(', ')}`, LOG_LEVELS.SUCCESS);
    }
    if (resultado.desmarcados.length > 0) {
      log(`   ❌ Desmarcados: ${resultado.desmarcados.join(', ')}`, LOG_LEVELS.SUCCESS);
    }
    if (resultado.naoEncontrados.length > 0) {
      log(`   ⚠️ Não encontrados: ${resultado.naoEncontrados.join(', ')}`, LOG_LEVELS.WARN);
    }
    
    // Se encontrou pelo menos alguns checkboxes, considerar sucesso
    if (resultado.marcados.length > 0 || resultado.desmarcados.length > 0) {
      log(`✅ Situação Boleto configurada`, LOG_LEVELS.SUCCESS);
      currentStep = stepAnterior;
      return true;
    }
    
    if (tentativa < maxTentativas) {
      log(`⚠️ Configuração incompleta, tentando novamente...`, LOG_LEVELS.WARN);
      await page.waitForTimeout(1000);
    }
  }
  
  // Se chegou aqui, não encontrou nenhum checkbox
  log(`⚠️ Nenhum checkbox de Situação Boleto encontrado após ${maxTentativas} tentativas`, LOG_LEVELS.WARN);
  log(`Continuando mesmo assim - verifique os filtros no screenshot de debug`, LOG_LEVELS.WARN);
  currentStep = stepAnterior;
  return true; // Não bloquear, mas avisar
}

// Mapeamento de colunas - EXPANDIDO para capturar todas as variações do portal Hinova
const COLUMN_MAP = {
  // Data Pagamento
  "DATA PAGAMENTO": "Data Pagamento",
  "DATA DE PAGAMENTO": "Data Pagamento",
  
  // Data Vencimento Original
  "DATA VENCIMENTO ORIGINAL": "Data Vencimento Original",
  "DATA DE VENCIMENTO ORIGINAL": "Data Vencimento Original",
  "VENCIMENTO ORIGINAL": "Data Vencimento Original",
  
  // ===== CAMPO CRÍTICO: Dia Vencimento Veículo =====
  "DIA VENCIMENTO VEICULO": "Dia Vencimento Veiculo",
  "DIA VENCIMENTO VEÍCULO": "Dia Vencimento Veiculo",
  "DIA VENC VEICULO": "Dia Vencimento Veiculo",
  "DIA VENC. VEICULO": "Dia Vencimento Veiculo",
  "DIA VENC. VEÍCULO": "Dia Vencimento Veiculo",
  "VENCIMENTO VEICULO": "Dia Vencimento Veiculo",
  "VENCIMENTO VEÍCULO": "Dia Vencimento Veiculo",
  "VENCIMENTO DO VEICULO": "Dia Vencimento Veiculo",
  "VENCIMENTO DO VEÍCULO": "Dia Vencimento Veiculo",
  "DIA DE VENCIMENTO": "Dia Vencimento Veiculo",
  "DIA DE VENCIMENTO VEICULO": "Dia Vencimento Veiculo",
  "DIA DE VENCIMENTO VEÍCULO": "Dia Vencimento Veiculo",
  
  // Regional
  "REGIONAL BOLETO": "Regional Boleto",
  "REGIONAL DO BOLETO": "Regional Boleto",
  "REGIONAL": "Regional Boleto",
  
  // Cooperativa
  "COOPERATIVA": "Cooperativa",
  
  // Voluntário
  "VOLUNTÁRIO": "Voluntário",
  "VOLUNTARIO": "Voluntário",
  
  // Nome
  "NOME": "Nome",
  
  // Placas
  "PLACAS": "Placas",
  "PLACA": "Placas",
  
  // Valor
  "VALOR": "Valor",
  "VALOR BOLETO": "Valor",
  
  // Data Vencimento
  "DATA VENCIMENTO": "Data Vencimento",
  "DATA DE VENCIMENTO": "Data Vencimento",
  "VENCIMENTO": "Data Vencimento",
  
  // ===== CAMPO CRÍTICO: Dias em Atraso =====
  "QTDE DIAS EM ATRASO VENCIMENTO ORIGINAL": "Qtde Dias em Atraso Vencimento Original",
  "QTDE DIAS ATRASO VENCIMENTO ORIGINAL": "Qtde Dias em Atraso Vencimento Original",
  "QTDE. DIAS EM ATRASO VENCIMENTO ORIGINAL": "Qtde Dias em Atraso Vencimento Original",
  "QTDE. DIAS ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "QTD DIAS EM ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "QTD DIAS ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "DIAS EM ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "DIAS ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "DIAS DE ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "QUANTIDADE DIAS ATRASO": "Qtde Dias em Atraso Vencimento Original",
  
  // Situação
  "SITUACAO": "Situacao",
  "SITUAÇÃO": "Situacao",
  "SITUAÇÃO BOLETO": "Situacao",
  "SITUACAO BOLETO": "Situacao",
};

function normalizeHeader(header) {
  return String(header).trim().toUpperCase().replace(/\s+/g, ' ');
}

function parseExcelDate(value) {
  if (!value) return null;
  
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const month = String(date.m).padStart(2, '0');
      const day = String(date.d).padStart(2, '0');
      return `${date.y}-${month}-${day}`;
    }
  }
  
  const strValue = String(value).trim();
  
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(strValue)) {
    const [day, month, year] = strValue.split('/');
    return `${year}-${month}-${day}`;
  }
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
    return strValue;
  }
  
  return null;
}

function parseMoneyValue(value) {
  if (!value) return 0;
  const strValue = String(value).trim();
  const cleanValue = strValue
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parser HTML para relatório Hinova (que disfarça HTML como .xls)
 * Usa leitura em STREAMING para evitar o limite de ~512MB de strings do JavaScript.
 * O portal gera HTML com tabelas ao invés de Excel binário.
 */
async function processarHtmlRelatorioStream(filePath) {
  setStep('PROCESSAMENTO_HTML');
  log(`Processando arquivo HTML via streaming: ${filePath}`, LOG_LEVELS.INFO);
  
  const startTime = Date.now();
  const fileSize = fs.statSync(filePath).size;
  log(`📂 Tamanho do arquivo: ${(fileSize / 1024 / 1024).toFixed(2)} MB`, LOG_LEVELS.DEBUG);
  
  const readline = require('readline');
  
  const dados = [];
  let headersEncontrados = [];
  let headerMapping = [];
  let headerRowIndex = -1;
  let currentRowIndex = 0;
  let lastProgressLog = 0;
  let bytesProcessed = 0;
  
  // Diagnóstico: guardar as primeiras linhas para análise
  const sampleRows = [];
  const MAX_SAMPLE_ROWS = 30;
  
  // Buffer para acumular linhas até termos um <tr>...</tr> completo
  let buffer = '';
  let insideRow = false;
  
  // Criar stream de leitura
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 64 * 1024 }), // 64KB chunks
    crlfDelay: Infinity,
  });
  
  // Função para detectar se uma linha é cabeçalho
  const isHeaderRow = (cells) => {
    const rowText = cells.join(' ').toUpperCase();
    // Precisa ter NOME e pelo menos um dos outros campos esperados
    const hasNome = rowText.includes('NOME');
    const hasOther = rowText.includes('PLACA') || 
                     rowText.includes('VALOR') || 
                     rowText.includes('VENCIMENTO') ||
                     rowText.includes('SITUACAO') ||
                     rowText.includes('SITUAÇÃO') ||
                     rowText.includes('VOLUNTARIO') ||
                     rowText.includes('VOLUNTÁRIO') ||
                     rowText.includes('COOPERATIVA') ||
                     rowText.includes('REGIONAL');
    return hasNome && hasOther;
  };
  
  // Função para processar uma linha <tr>...</tr> completa
  const processRow = (rowHtml) => {
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      let text = cellMatch[1]
        .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
        .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#\d+;/g, '')
        .trim();
      cells.push(text);
    }
    
    if (cells.length === 0) return;
    
    currentRowIndex++;
    
    // Salvar amostra das primeiras linhas para diagnóstico
    if (sampleRows.length < MAX_SAMPLE_ROWS) {
      sampleRows.push({ index: currentRowIndex, cells: cells.slice(0, 5) });
    }
    
    // EXPANDIDO: Detectar cabeçalho nas primeiras 500 linhas (antes era 10)
    if (headerRowIndex === -1 && currentRowIndex <= 500) {
      if (isHeaderRow(cells)) {
        headerRowIndex = currentRowIndex;
        headersEncontrados = cells.map(h => normalizeHeader(h));
        log(`🎯 Cabeçalho detectado na linha ${currentRowIndex}: ${cells.length} colunas`, LOG_LEVELS.SUCCESS);
        log(`📋 Cabeçalhos: ${cells.slice(0, 8).join(' | ')}...`, LOG_LEVELS.DEBUG);
        
        // Mapear cabeçalhos para nomes padronizados
        for (let i = 0; i < headersEncontrados.length; i++) {
          const normalized = headersEncontrados[i];
          let mappedName = null;
          
          if (COLUMN_MAP[normalized]) {
            mappedName = COLUMN_MAP[normalized];
          } else {
            for (const [key, value] of Object.entries(COLUMN_MAP)) {
              if (normalized.includes(key) || key.includes(normalized)) {
                mappedName = value;
                break;
              }
            }
          }
          headerMapping.push(mappedName);
        }
        log(`Mapeamento: ${headerMapping.filter(Boolean).length} colunas reconhecidas`, LOG_LEVELS.DEBUG);
        return;
      }
    }
    
    // Log se não encontrou cabeçalho após 500 linhas
    if (headerRowIndex === -1 && currentRowIndex === 501) {
      log(`⚠️ Cabeçalho NÃO encontrado nas primeiras 500 linhas!`, LOG_LEVELS.WARN);
      log(`📊 Amostra das primeiras ${sampleRows.length} linhas:`, LOG_LEVELS.DEBUG);
      sampleRows.slice(0, 10).forEach(row => {
        log(`   Linha ${row.index}: ${row.cells.join(' | ')}`, LOG_LEVELS.DEBUG);
      });
    }
    
    // Pular linhas antes do cabeçalho
    if (headerRowIndex === -1 || currentRowIndex <= headerRowIndex) return;
    
    // Processar linha de dados
    const rowData = {};
    let temDados = false;
    
    for (let j = 0; j < cells.length && j < headerMapping.length; j++) {
      const mappedHeader = headerMapping[j];
      if (!mappedHeader) continue;
      
      let value = cells[j];
      
      if (mappedHeader.includes('Data')) {
        value = parseExcelDate(value);
      } else if (mappedHeader === 'Valor') {
        value = parseMoneyValue(value);
      } else if (mappedHeader === 'Dia Vencimento Veiculo' || mappedHeader.includes('Dias')) {
        value = parseInt(String(value).replace(/\D/g, '')) || null;
      } else {
        value = value ? String(value).trim() : null;
      }
      
      if (value !== null && value !== '') {
        rowData[mappedHeader] = value;
        temDados = true;
      }
    }
    
    if (temDados && (rowData['Nome'] || rowData['Placas'])) {
      dados.push(rowData);
    }
  };
  
  // Processar linha por linha
  for await (const line of rl) {
    bytesProcessed += Buffer.byteLength(line, 'utf-8') + 1;
    
    // Log de progresso a cada 10%
    const progress = Math.floor((bytesProcessed / fileSize) * 100);
    if (progress >= lastProgressLog + 10) {
      lastProgressLog = progress;
      log(`⏳ Leitura HTML: ${progress}% (${dados.length} registros válidos)`, LOG_LEVELS.DEBUG);
    }
    
    // Acumular no buffer
    buffer += line + '\n';
    
    // Verificar se entramos em uma linha <tr>
    if (!insideRow && buffer.includes('<tr')) {
      insideRow = true;
    }
    
    // Verificar se fechamos a linha </tr>
    if (insideRow && buffer.includes('</tr>')) {
      // Extrair todos os <tr>...</tr> completos do buffer
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let match;
      let lastIndex = 0;
      
      while ((match = trRegex.exec(buffer)) !== null) {
        processRow(match[1]);
        lastIndex = match.index + match[0].length;
      }
      
      // Manter apenas o conteúdo após o último </tr> processado
      buffer = buffer.substring(lastIndex);
      insideRow = buffer.includes('<tr');
    }
    
    // Limitar tamanho do buffer para evitar acúmulo de memória (100KB)
    if (buffer.length > 100 * 1024 && !insideRow) {
      buffer = '';
    }
  }
  
  // Processar qualquer conteúdo restante no buffer
  if (buffer.includes('<tr') && buffer.includes('</tr>')) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = trRegex.exec(buffer)) !== null) {
      processRow(match[1]);
    }
  }
  
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log(`✅ Processamento HTML concluído em ${totalTime}s`, LOG_LEVELS.SUCCESS);
  log(`Registros válidos: ${dados.length} (${currentRowIndex} linhas <tr> processadas)`, LOG_LEVELS.SUCCESS);
  
  // Diagnóstico detalhado se não encontrou dados
  if (dados.length === 0) {
    log(`🔍 DIAGNÓSTICO - Cabeçalho encontrado: ${headerRowIndex > 0 ? 'SIM na linha ' + headerRowIndex : 'NÃO'}`, LOG_LEVELS.WARN);
    
    if (headerRowIndex > 0) {
      log(`📋 Headers mapeados: ${headerMapping.filter(Boolean).join(', ')}`, LOG_LEVELS.DEBUG);
      log(`❌ Possível causa: campos Nome/Placas não estão sendo preenchidos`, LOG_LEVELS.WARN);
    } else {
      log(`❌ Causa: Cabeçalho da tabela não foi detectado!`, LOG_LEVELS.ERROR);
      log(`📊 Amostra das primeiras linhas processadas:`, LOG_LEVELS.DEBUG);
      sampleRows.slice(0, 15).forEach(row => {
        log(`   Linha ${row.index}: ${row.cells.join(' | ').substring(0, 100)}...`, LOG_LEVELS.DEBUG);
      });
    }
  }
  
  return dados;
}

/**
 * Wrapper síncrono para compatibilidade - detecta se deve usar streaming
 */
function processarHtmlRelatorio(filePath) {
  // Verificar tamanho do arquivo
  const fileSize = fs.statSync(filePath).size;
  const MAX_SYNC_SIZE = 400 * 1024 * 1024; // 400MB limite para leitura síncrona
  
  if (fileSize > MAX_SYNC_SIZE) {
    log(`Arquivo muito grande (${(fileSize / 1024 / 1024).toFixed(2)} MB) - usando streaming`, LOG_LEVELS.WARN);
    // Retorna Promise - o chamador deve usar await
    return processarHtmlRelatorioStream(filePath);
  }
  
  // Para arquivos menores, usar método síncrono original (mais rápido)
  setStep('PROCESSAMENTO_HTML');
  log(`Processando arquivo HTML: ${filePath}`, LOG_LEVELS.INFO);
  
  const startTime = Date.now();
  
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    log(`Erro ao ler HTML: ${e.message}`, LOG_LEVELS.ERROR);
    // Fallback para streaming
    return processarHtmlRelatorioStream(filePath);
  }
  
  const dados = [];
  let headersEncontrados = [];
  let lastProgressLog = 0;
  
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let match;
  
  while ((match = rowRegex.exec(content)) !== null) {
    const rowHtml = match[1];
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      let text = cellMatch[1]
        .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
        .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#\d+;/g, '')
        .trim();
      cells.push(text);
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  // Liberar memória do conteúdo original
  content = null;
  
  log(`Total de linhas HTML encontradas: ${rows.length}`, LOG_LEVELS.DEBUG);
  
  if (rows.length === 0) {
    log('Nenhuma linha encontrada no HTML', LOG_LEVELS.WARN);
    return [];
  }
  
  // Função para detectar se uma linha é cabeçalho
  const isHeaderRow = (cells) => {
    const rowText = cells.join(' ').toUpperCase();
    const hasNome = rowText.includes('NOME');
    const hasOther = rowText.includes('PLACA') || 
                     rowText.includes('VALOR') || 
                     rowText.includes('VENCIMENTO') ||
                     rowText.includes('SITUACAO') ||
                     rowText.includes('SITUAÇÃO') ||
                     rowText.includes('VOLUNTARIO') ||
                     rowText.includes('VOLUNTÁRIO') ||
                     rowText.includes('COOPERATIVA') ||
                     rowText.includes('REGIONAL');
    return hasNome && hasOther;
  };

  let headerRowIndex = -1;
  // EXPANDIDO: Buscar cabeçalho nas primeiras 500 linhas (antes era 10)
  for (let i = 0; i < Math.min(rows.length, 500); i++) {
    if (isHeaderRow(rows[i])) {
      headerRowIndex = i;
      headersEncontrados = rows[i].map(h => normalizeHeader(h));
      log(`🎯 Cabeçalho detectado na linha ${i}: ${rows[i].length} colunas`, LOG_LEVELS.SUCCESS);
      log(`📋 Cabeçalhos: ${rows[i].slice(0, 8).join(' | ')}...`, LOG_LEVELS.DEBUG);
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    log('⚠️ Cabeçalho NÃO encontrado nas primeiras 500 linhas!', LOG_LEVELS.WARN);
    log(`📊 Amostra das primeiras linhas:`, LOG_LEVELS.DEBUG);
    rows.slice(0, 10).forEach((row, idx) => {
      log(`   Linha ${idx}: ${row.slice(0, 5).join(' | ')}`, LOG_LEVELS.DEBUG);
    });
    
    // Fallback com índices padrão
    headersEncontrados = [
      'DATA PAGAMENTO', 'DATA VENCIMENTO ORIGINAL', 'DIA VENCIMENTO VEICULO',
      'REGIONAL BOLETO', 'COOPERATIVA', 'VOLUNTARIO', 'NOME', 'PLACAS',
      'VALOR', 'DATA VENCIMENTO', 'QTDE DIAS EM ATRASO VENCIMENTO ORIGINAL', 'SITUACAO',
    ];
    headerRowIndex = 0; // Começa do início
  }
  
  const headerMapping = [];
  for (let i = 0; i < headersEncontrados.length; i++) {
    const normalized = headersEncontrados[i];
    let mappedName = null;
    
    if (COLUMN_MAP[normalized]) {
      mappedName = COLUMN_MAP[normalized];
    } else {
      for (const [key, value] of Object.entries(COLUMN_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          mappedName = value;
          break;
        }
      }
    }
    headerMapping.push(mappedName);
  }
  
  log(`Mapeamento: ${headerMapping.filter(Boolean).length} colunas reconhecidas`, LOG_LEVELS.DEBUG);
  
  const dataStartIndex = headerRowIndex + 1;
  const totalDataRows = rows.length - dataStartIndex;
  
  log(`🔄 Processando ${totalDataRows} registros HTML...`, LOG_LEVELS.INFO);
  
  for (let i = dataStartIndex; i < rows.length; i++) {
    const cells = rows[i];
    const rowData = {};
    let temDados = false;
    
    for (let j = 0; j < cells.length && j < headerMapping.length; j++) {
      const mappedHeader = headerMapping[j];
      if (!mappedHeader) continue;
      
      let value = cells[j];
      
      if (mappedHeader.includes('Data')) {
        value = parseExcelDate(value);
      } else if (mappedHeader === 'Valor') {
        value = parseMoneyValue(value);
      } else if (mappedHeader === 'Dia Vencimento Veiculo' || mappedHeader.includes('Dias')) {
        value = parseInt(String(value).replace(/\D/g, '')) || null;
      } else {
        value = value ? String(value).trim() : null;
      }
      
      if (value !== null && value !== '') {
        rowData[mappedHeader] = value;
        temDados = true;
      }
    }
    
    if (temDados && (rowData['Nome'] || rowData['Placas'])) {
      dados.push(rowData);
    }
    
    const progress = Math.floor(((i - dataStartIndex) / totalDataRows) * 100);
    if (progress >= lastProgressLog + 25) {
      lastProgressLog = progress;
      log(`⏳ Processamento: ${progress}%`, LOG_LEVELS.DEBUG);
    }
  }
  
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log(`✅ Processamento HTML concluído em ${totalTime}s`, LOG_LEVELS.SUCCESS);
  log(`Registros válidos: ${dados.length} de ${totalDataRows}`, LOG_LEVELS.SUCCESS);
  
  return dados;
}

/**
 * Processa arquivo Excel ou HTML (detecta via magic bytes)
 * ASYNC: Pode retornar Promise para arquivos HTML muito grandes (streaming)
 * 
 * IMPORTANTE: Usa detectFileType() baseado em magic bytes, não lê como texto
 */
async function processarArquivo(filePath) {
  // Detectar formato via magic bytes (binário)
  const fileType = detectFileType(filePath);
  
  if (fileType.type === 'html') {
    log(`Formato detectado via magic bytes: HTML disfarçado de Excel`, LOG_LEVELS.INFO);
    // processarHtmlRelatorio pode retornar Promise se usar streaming
    const result = processarHtmlRelatorio(filePath);
    return result instanceof Promise ? await result : result;
  }
  
  log(`Formato detectado via magic bytes: ${fileType.type.toUpperCase()} binário`, LOG_LEVELS.INFO);
  return processarExcel(filePath);
}

function processarExcel(filePath) {
  setStep('PROCESSAMENTO_EXCEL');
  log(`Processando arquivo Excel: ${filePath}`);
  
  const startTime = Date.now();
  
  log(`📂 Lendo arquivo...`, LOG_LEVELS.DEBUG);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  log(`📊 Convertendo para JSON...`, LOG_LEVELS.DEBUG);
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  log(`Total de linhas brutas: ${rawData.length}`, LOG_LEVELS.DEBUG);
  
  if (rawData.length === 0) {
    log('Arquivo Excel vazio!', LOG_LEVELS.WARN);
    return [];
  }
  
  const primeiraLinha = rawData[0];
  const headersOriginais = Object.keys(primeiraLinha);
  log(`Colunas encontradas: ${headersOriginais.length}`, LOG_LEVELS.DEBUG);
  
  // Mapear colunas
  log(`🔄 Mapeando colunas...`, LOG_LEVELS.DEBUG);
  const headerMapping = {};
  for (const header of headersOriginais) {
    const normalized = normalizeHeader(header);
    if (COLUMN_MAP[normalized]) {
      headerMapping[header] = COLUMN_MAP[normalized];
    } else {
      for (const [key, value] of Object.entries(COLUMN_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          headerMapping[header] = value;
          break;
        }
      }
    }
  }
  
  // Processar linhas com progresso
  log(`🔄 Processando ${rawData.length} registros...`, LOG_LEVELS.INFO);
  const dados = [];
  let lastProgressLog = 0;
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowData = {};
    let temDados = false;
    
    for (const [originalHeader, mappedHeader] of Object.entries(headerMapping)) {
      let value = row[originalHeader];
      
      if (mappedHeader.includes('Data')) {
        value = parseExcelDate(value);
      } else if (mappedHeader === 'Valor') {
        value = parseMoneyValue(value);
      } else if (mappedHeader === 'Dia Vencimento Veiculo' || mappedHeader.includes('Dias')) {
        value = parseInt(String(value)) || null;
      } else {
        value = value ? String(value).trim() : null;
      }
      
      if (value !== null && value !== '') {
        rowData[mappedHeader] = value;
        temDados = true;
      }
    }
    
    if (temDados && (rowData['Nome'] || rowData['Placas'])) {
      dados.push(rowData);
    }
    
    // Log de progresso a cada 1000 registros ou 25%
    const progress = Math.floor((i / rawData.length) * 100);
    if (progress >= lastProgressLog + 25) {
      lastProgressLog = progress;
      log(`⏳ Processamento: ${progress}% (${i}/${rawData.length} linhas)`, LOG_LEVELS.DEBUG);
    }
  }
  
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log(`✅ Processamento concluído em ${totalTime}s`, LOG_LEVELS.SUCCESS);
  log(`Registros válidos: ${dados.length} de ${rawData.length}`, LOG_LEVELS.SUCCESS);
  
  return dados;
}

async function enviarWebhook(dados, nomeArquivo, opcoes = {}) {
  setStep('IMPORTACAO');

  const mesReferencia = opcoes.mesReferencia || new Date().toISOString().slice(0, 7);
  const modo = opcoes.modo || 'substituir';
  const headers = { 'Content-Type': 'application/json' };
  if (CONFIG.WEBHOOK_SECRET) headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;

  // Envio em lotes para:
  // - reduzir risco de timeout
  // - permitir progresso percentual de "importação"
  const BATCH_SIZE = parseInt(process.env.WEBHOOK_BATCH_SIZE || '1000', 10);
  const total = dados.length;
  const totalChunks = Math.ceil(total / BATCH_SIZE);
  let importacaoId = null;
  let enviados = 0;

  log('', LOG_LEVELS.INFO);
  log('═'.repeat(50), LOG_LEVELS.INFO);
  log(`📤 INICIANDO IMPORTAÇÃO PARA O SERVIDOR (modo: ${modo})`, LOG_LEVELS.INFO);
  log('═'.repeat(50), LOG_LEVELS.INFO);
  log(`   Total de registros: ${total.toLocaleString()}`, LOG_LEVELS.INFO);
  log(`   Lotes: ${totalChunks} (${BATCH_SIZE} registros cada)`, LOG_LEVELS.INFO);
  log(`   Mês referência: ${mesReferencia}`, LOG_LEVELS.INFO);
  log('', LOG_LEVELS.INFO);

  const startTime = Date.now();

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const chunkIndex = Math.floor(offset / BATCH_SIZE) + 1;
    const batch = dados.slice(offset, offset + BATCH_SIZE);

    const payload = {
      corretora_id: CONFIG.CORRETORA_ID,
      importacao_id: importacaoId,
      execucao_id: CONFIG.EXECUCAO_ID || null,
      github_run_id: CONFIG.GITHUB_RUN_ID || null,
      github_run_url: CONFIG.GITHUB_RUN_URL || null,
      dados: batch,
      nome_arquivo: nomeArquivo,
      mes_referencia: mesReferencia,
      modo: modo,
      total_registros: total,
      chunk_index: chunkIndex,
      chunk_total: totalChunks,
    };

    const pctBefore = Math.floor((enviados / total) * 100);
    log(`   📦 Lote ${chunkIndex}/${totalChunks}: enviando ${batch.length.toLocaleString()} registros...`, LOG_LEVELS.DEBUG);

    try {
      const response = await axios.post(CONFIG.WEBHOOK_URL, payload, {
        headers,
        timeout: 600000, // 10 min por lote
      });

      if (!importacaoId && response.data?.importacao_id) {
        importacaoId = response.data.importacao_id;
        log(`   🆔 Importação ID: ${importacaoId}`, LOG_LEVELS.DEBUG);
      }

      enviados += batch.length;
      const pct = Math.min(100, Math.floor((enviados / total) * 100));
      
      // Log de progresso com barra visual
      const barSize = 20;
      const filled = Math.round((pct / 100) * barSize);
      const empty = barSize - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      
      log(`   [${bar}] ${pct}% (${enviados.toLocaleString()}/${total.toLocaleString()} registros)`, LOG_LEVELS.INFO);
    } catch (error) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      log(`   ❌ Falha no lote ${chunkIndex}/${totalChunks} após ${elapsed}s`, LOG_LEVELS.ERROR);
      log(`      Erro: ${error.response?.status || error.message}`, LOG_LEVELS.ERROR);
      return false;
    }
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log('', LOG_LEVELS.INFO);
  log('═'.repeat(50), LOG_LEVELS.INFO);
  log(`✅ IMPORTAÇÃO CONCLUÍDA COM SUCESSO! (modo: ${modo})`, LOG_LEVELS.SUCCESS);
  log(`   Tempo total: ${totalTime}s`, LOG_LEVELS.SUCCESS);
  log(`   Registros importados: ${enviados.toLocaleString()}`, LOG_LEVELS.SUCCESS);
  log(`   ID da importação: ${importacaoId || 'N/A'}`, LOG_LEVELS.SUCCESS);
  log('═'.repeat(50), LOG_LEVELS.INFO);
  return true;
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================
async function rodarRobo() {
  setStep('VALIDACAO');
  
  if (!CONFIG.HINOVA_USER || !CONFIG.HINOVA_PASS) {
    throw new Error('HINOVA_USER e HINOVA_PASS são obrigatórios');
  }
  if (!CONFIG.WEBHOOK_URL) {
    throw new Error('WEBHOOK_URL é obrigatório');
  }

  log('='.repeat(60));
  log('INICIANDO ROBÔ DE COBRANÇA HINOVA');
  log('='.repeat(60));
  log(`URL Login: ${CONFIG.HINOVA_URL}`, LOG_LEVELS.INFO);
  log(`URL Relatório: ${CONFIG.HINOVA_RELATORIO_URL}`, LOG_LEVELS.INFO);
  log(`Código Cliente: ${CONFIG.HINOVA_CODIGO_CLIENTE}`, LOG_LEVELS.INFO);
  log(`Usuário: ${CONFIG.HINOVA_USER}`, LOG_LEVELS.INFO);
  log(`Layout: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.INFO);
  log(`Corretora ID: ${CONFIG.CORRETORA_ID}`, LOG_LEVELS.INFO);
  if (CONFIG.EXECUCAO_ID) {
    log(`Execução ID: ${CONFIG.EXECUCAO_ID}`, LOG_LEVELS.INFO);
  }
  if (CONFIG.GITHUB_RUN_ID) {
    log(`GitHub Run ID: ${CONFIG.GITHUB_RUN_ID}`, LOG_LEVELS.INFO);
    log(`GitHub Run URL: ${CONFIG.GITHUB_RUN_URL}`, LOG_LEVELS.INFO);
  }
  log('='.repeat(60));
  
  // ============================================
  // NOTIFICAR INÍCIO DA EXECUÇÃO (para sincronização automática)
  // ============================================
  let execucaoId = CONFIG.EXECUCAO_ID;
  
  if (!execucaoId && CONFIG.WEBHOOK_URL && CONFIG.CORRETORA_ID) {
    try {
      log('Notificando início da execução...', LOG_LEVELS.INFO);
      const headers = { 'Content-Type': 'application/json' };
      if (CONFIG.WEBHOOK_SECRET) headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;
      
      const response = await axios.post(CONFIG.WEBHOOK_URL, {
        action: 'start',
        corretora_id: CONFIG.CORRETORA_ID,
        github_run_id: CONFIG.GITHUB_RUN_ID || null,
        github_run_url: CONFIG.GITHUB_RUN_URL || null,
      }, { headers, timeout: 30000 });
      
      if (response.data?.execucao_id) {
        execucaoId = response.data.execucao_id;
        log(`Execução criada: ${execucaoId}`, LOG_LEVELS.SUCCESS);
      }
    } catch (e) {
      log(`Erro ao notificar início: ${e.message}`, LOG_LEVELS.WARN);
      // Continua mesmo sem conseguir notificar
    }
  }
  
  // Atualizar CONFIG com o execucao_id obtido
  if (execucaoId && !CONFIG.EXECUCAO_ID) {
    CONFIG.EXECUCAO_ID = execucaoId;
  }
  
  const periodos = getDateRange();
  const periodoPrincipal = periodos.find(p => p.modo === 'substituir') || periodos[0];
  const { inicio, fim } = periodoPrincipal;
  log(`Períodos a processar: ${periodos.length}`);
  for (const p of periodos) {
    log(`  → ${p.inicio} até ${p.fim} (modo: ${p.modo}, ref: ${p.mesReferencia})`);
  }
  
  let browser = null;
  let context = null;
  let page = null;
  
  try {
    setStep('BROWSER_INIT');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-popup-blocking'],
    });
    
    // Configurar contexto com timeout estendido para suportar downloads longos
    // O portal Hinova pode demorar 30+ minutos para gerar relatórios grandes
    context = await browser.newContext({ 
      acceptDownloads: true,
      // Timeout de navegação padrão estendido
      navigationTimeout: TIMEOUTS.PAGE_LOAD,
    });
    
    // Configurar timeout padrão MODERADO para operações normais (login, navegação)
    // O timeout longo (55min) será aplicado apenas durante o download
    context.setDefaultTimeout(30000); // 30 segundos para operações normais
    context.setDefaultNavigationTimeout(TIMEOUTS.PAGE_LOAD);
    
    page = await context.newPage();
    
    // Timeout moderado para página (será aumentado apenas durante download)
    page.setDefaultTimeout(30000); // 30 segundos
    page.setDefaultNavigationTimeout(TIMEOUTS.PAGE_LOAD);

    // Debug: logar eventos de download (apenas para log, não para captura)
    context.on('download', (d) => {
      try {
        const name = d.suggestedFilename?.() || 'arquivo';
        log(`[DEBUG] Evento download global: ${name}`, LOG_LEVELS.DEBUG);
      } catch {}
    });

    // ============================================
    // ETAPA: LOGIN
    // ============================================
    setStep('LOGIN');
    await notificarProgresso({ etapa_atual: 'LOGIN' });
    
    let navegacaoOk = false;
    for (let tentativa = 1; tentativa <= 3 && !navegacaoOk; tentativa++) {
      try {
        log(`Tentativa ${tentativa} de acessar portal...`);
        await page.goto(CONFIG.HINOVA_URL, { 
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.PAGE_LOAD 
        });
        navegacaoOk = true;
      } catch (e) {
        log(`Erro: ${e.message}`, LOG_LEVELS.WARN);
        if (tentativa === 3) throw e;
        await page.waitForTimeout(5000);
      }
    }
    
    log('Aguardando formulário de login...');
    try {
      await page.waitForSelector('input[placeholder="Usuário"], input[type="password"]', {
        timeout: 30000
      });
      log('Formulário de login carregado', LOG_LEVELS.SUCCESS);
    } catch {
      log('Campos de login não encontrados pelo seletor padrão', LOG_LEVELS.WARN);
    }
    
    await fecharPopups(page);
    
    // Preencher credenciais
    log('Preenchendo credenciais...');
    
    // Preencher código cliente (com timeout curto) — alguns logins exigem
    if (CONFIG.HINOVA_CODIGO_CLIENTE) {
      try {
        await page.fill('input[placeholder=""]', CONFIG.HINOVA_CODIGO_CLIENTE, { timeout: 5000 });
        log('Código cliente preenchido', LOG_LEVELS.DEBUG);
      } catch (e) {
        log('Campo código cliente não encontrado (pode ser opcional)', LOG_LEVELS.DEBUG);
      }
    }
    
    // Preencher usuário (com timeout curto)
    try {
      await page.fill('input[placeholder="Usuário"]', CONFIG.HINOVA_USER, { timeout: 5000 });
      log('Usuário preenchido', LOG_LEVELS.DEBUG);
    } catch (e) {
      log(`Erro ao preencher usuário: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    // Preencher senha (com timeout curto)
    try {
      await page.fill('input[placeholder="Senha"]', CONFIG.HINOVA_PASS, { timeout: 5000 });
      log('Senha preenchida', LOG_LEVELS.DEBUG);
    } catch (e) {
      log(`Erro ao preencher senha: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    // Aguardar um pouco antes do fallback
    await page.waitForTimeout(500);
    
    // Fallback: preencher via JavaScript
    log('Verificando/complementando credenciais via JavaScript...', LOG_LEVELS.DEBUG);
    await page.evaluate(({ codigoCliente, usuario, senha }) => {
      const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])'));
      
      if (allInputs.length >= 3) {
        if (codigoCliente && !allInputs[0].value) {
          allInputs[0].value = codigoCliente;
          allInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        if (!allInputs[1].value || allInputs[1].value === allInputs[1].placeholder) {
          allInputs[1].value = usuario;
          allInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        if (!allInputs[2].value || allInputs[2].value === allInputs[2].placeholder) {
          allInputs[2].value = senha;
          allInputs[2].dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, { codigoCliente: CONFIG.HINOVA_CODIGO_CLIENTE, usuario: CONFIG.HINOVA_USER, senha: CONFIG.HINOVA_PASS });
    
    log('Credenciais preenchidas com sucesso', LOG_LEVELS.SUCCESS);

    // O portal costuma exigir a seleção de um layout/perfil ainda na tela de login.
    // Sem isso, o clique em Entrar mantém o usuário na tela sem mensagem clara.
    const layoutOk = await trySelectHinovaLayout(page);
    if (!layoutOk) {
      log('Campo de layout/perfil não identificado no login (seguindo assim mesmo)', LOG_LEVELS.WARN);
    }
    
    // Dispensar código de autenticação
    const dispensarCodigoAutenticacao = async () => {
      try {
        const selector = 'input[placeholder*="Autenticação"], input[placeholder*="autenticação"]';
        const campoAuth = await page.$(selector);
        if (!campoAuth) return false;
        
        await campoAuth.evaluate((el) => {
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }).catch(() => {});
        
        await campoAuth.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
        await page.click('body', { position: { x: 20, y: 20 }, force: true }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
        
        log('Código de autenticação dispensado', LOG_LEVELS.DEBUG);
        return true;
      } catch (e) {
        return false;
      }
    };
    
    // Clicar no botão Entrar
    let loginSucesso = false;
    
    const isAindaNaLogin = async () => {
      const relatorioVisible = await page.locator('text=Relatório').first().isVisible().catch(() => false);
      if (relatorioVisible) return false;
      
      const esqueceuVisible = await page.locator('text=Esqueci minha senha').first().isVisible().catch(() => false);
      const codigoClienteVisible = await page.locator('text=Código cliente').first().isVisible().catch(() => false);
      if (esqueceuVisible || codigoClienteVisible) return true;
      
      const pwdVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
      const url = page.url?.() || '';
      const urlPareceLogin = /login/i.test(url);
      
      return pwdVisible || urlPareceLogin;
    };
    
    for (let tentativa = 1; tentativa <= LIMITS.MAX_LOGIN_RETRIES; tentativa++) {
      log(`Tentativa ${tentativa}/${LIMITS.MAX_LOGIN_RETRIES} - Clicando em Entrar...`);
      
      try {
        const clicarEntrar = async () => {
          const btnSelector = 'button:has-text("Entrar"), input[value="Entrar"], .btn-primary, button.btn, #btn-login';
          const btnEntrar = await page.$(btnSelector);
          
          if (btnEntrar) {
            await btnEntrar.evaluate((el) => el.click()).catch(() => {});
            await btnEntrar.click({ force: true }).catch(() => {});
          } else {
            await page.click('button:has-text("Entrar")', { force: true, timeout: 1000 }).catch(() => {});
          }
        };
        
        await clicarEntrar();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null),
          page.waitForTimeout(1500),
        ]);
        
        await dispensarCodigoAutenticacao();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => null),
          page.waitForTimeout(1200),
        ]);
        
        await clicarEntrar();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => null),
          page.waitForTimeout(1200),
        ]);
        
        await page.keyboard.press('Enter').catch(() => {});
        
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.LOGIN_RETRY_WAIT }).catch(() => null),
          page.waitForLoadState('networkidle', { timeout: TIMEOUTS.LOGIN_RETRY_WAIT }).catch(() => null),
          page.waitForTimeout(TIMEOUTS.LOGIN_RETRY_WAIT),
        ]);
        
        const aindaNaLogin = await isAindaNaLogin();
        if (!aindaNaLogin) {
          loginSucesso = true;
          log(`Login bem sucedido na tentativa ${tentativa}!`, LOG_LEVELS.SUCCESS);
          break;
        }
        
        const erroMsg = await page.$eval('.alert-danger, .error, .erro, .message-error', (el) => el.textContent).catch(() => null);
        if (erroMsg) {
          log(`Erro detectado: ${String(erroMsg).trim()}`, LOG_LEVELS.WARN);
        }
        
        log(`Tentativa ${tentativa} falhou - ainda na página de login`, LOG_LEVELS.WARN);
        await page.waitForTimeout(600);
      } catch (err) {
        log(`Erro na tentativa ${tentativa}: ${err.message}`, LOG_LEVELS.WARN);
        await page.waitForTimeout(600);
      }
    }
    
    if (!loginSucesso) {
      await saveDebugInfo(page, context, 'Login falhou');
      throw new Error(`Login falhou após ${LIMITS.MAX_LOGIN_RETRIES} tentativas`);
    }
    
    await fecharPopups(page);
    
    // ============================================
    // ETAPA: NAVEGAÇÃO PARA RELATÓRIO
    // ============================================
    setStep('NAVEGACAO_RELATORIO');
    await notificarProgresso({ etapa_atual: 'NAVEGACAO_RELATORIO' });
    
    log('Navegando para Relatório de Boletos...');
    await fecharPopups(page);
    
    await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_LOAD
    });
    
    log('Aguardando carregamento...');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {
      log('DOMContentLoaded timeout - continuando...', LOG_LEVELS.WARN);
    });
    await fecharPopups(page);
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      log('NetworkIdle timeout - continuando...', LOG_LEVELS.WARN);
    });
    
    await fecharPopups(page);
    log('Página de relatório aberta', LOG_LEVELS.SUCCESS);
    
    // ============================================
    // ETAPA: PREENCHIMENTO DE FILTROS
    // ============================================
    setStep('FILTROS');
    await notificarProgresso({ etapa_atual: 'FILTROS' });
    
    log(`Preenchendo Data Vencimento Original: ${inicio} até ${fim}`);
    
    // ============================================
    // PREENCHER "Data Vencimento Original" - CAMPO ESSENCIAL
    // ============================================
    const preencheuDatas = await page.evaluate(({ inicio, fim }) => {
      const resultado = { sucesso: false, detalhes: [] };
      
      // Procurar todas as células/labels que contenham "Data Vencimento Original"
      const todosElementos = document.querySelectorAll('td, th, label, span, div');
      
      for (const elemento of todosElementos) {
        const texto = elemento.textContent?.trim() || '';
        
        // Verificar se é o label "Data Vencimento Original"
        if (texto === 'Data Vencimento Original:' || texto === 'Data Vencimento Original') {
          resultado.detalhes.push(`Label encontrado: "${texto}"`);
          
          // Encontrar a linha (tr) que contém esse label
          const linha = elemento.closest('tr');
          if (!linha) {
            resultado.detalhes.push('Linha (tr) não encontrada, tentando container pai');
            // Fallback: procurar inputs no container pai
            const container = elemento.parentElement;
            const inputs = container?.querySelectorAll('input[type="text"], input:not([type])');
            if (inputs && inputs.length >= 2) {
              inputs[0].value = inicio;
              inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
              inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
              
              inputs[1].value = fim;
              inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
              inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
              
              resultado.sucesso = true;
              resultado.detalhes.push(`Preenchido via container: ${inputs[0].name || 'input1'} e ${inputs[1].name || 'input2'}`);
              return resultado;
            }
            continue;
          }
          
          // Pegar todos os inputs da linha
          const inputs = linha.querySelectorAll('input[type="text"], input:not([type])');
          resultado.detalhes.push(`Inputs na linha: ${inputs.length}`);
          
          if (inputs.length >= 2) {
            // Primeiro input = data início
            inputs[0].value = inicio;
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
            resultado.detalhes.push(`Input início: ${inputs[0].name || inputs[0].id || 'sem_nome'} = ${inicio}`);
            
            // Segundo input = data fim
            inputs[1].value = fim;
            inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
            resultado.detalhes.push(`Input fim: ${inputs[1].name || inputs[1].id || 'sem_nome'} = ${fim}`);
            
            resultado.sucesso = true;
            return resultado;
          } else if (inputs.length === 1) {
            // Pode ter apenas um input com range
            inputs[0].value = inicio;
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            resultado.detalhes.push(`Apenas 1 input encontrado: ${inputs[0].name}`);
          }
        }
      }
      
      // Se não encontrou pelo label exato, tentar por name dos inputs
      if (!resultado.sucesso) {
        resultado.detalhes.push('Tentando fallback por name de input...');
        
        const possiveisNomes = [
          ['dt_vencimento_original_ini', 'dt_vencimento_original_fim'],
          ['vencimento_original_ini', 'vencimento_original_fim'],
          ['dt_venc_original_ini', 'dt_venc_original_fim'],
        ];
        
        for (const [nomeIni, nomeFim] of possiveisNomes) {
          const inputIni = document.querySelector(`input[name="${nomeIni}"], input[name*="${nomeIni}"]`);
          const inputFim = document.querySelector(`input[name="${nomeFim}"], input[name*="${nomeFim}"]`);
          
          if (inputIni && inputFim) {
            inputIni.value = inicio;
            inputIni.dispatchEvent(new Event('input', { bubbles: true }));
            inputIni.dispatchEvent(new Event('change', { bubbles: true }));
            
            inputFim.value = fim;
            inputFim.dispatchEvent(new Event('input', { bubbles: true }));
            inputFim.dispatchEvent(new Event('change', { bubbles: true }));
            
            resultado.sucesso = true;
            resultado.detalhes.push(`Preenchido via name: ${nomeIni} e ${nomeFim}`);
            return resultado;
          }
        }
      }
      
      return resultado;
    }, { inicio, fim });
    
    // Log do resultado
    for (const detalhe of preencheuDatas.detalhes) {
      log(detalhe, LOG_LEVELS.DEBUG);
    }
    
    if (preencheuDatas.sucesso) {
      log(`✅ Data Vencimento Original preenchida: ${inicio} até ${fim}`, LOG_LEVELS.SUCCESS);
    } else {
      log('❌ ERRO CRÍTICO: Não foi possível preencher Data Vencimento Original!', LOG_LEVELS.ERROR);
      await saveDebugInfo(page, context, 'Falha ao preencher Data Vencimento Original');
      throw new Error('Campo Data Vencimento Original não encontrado - verifique a estrutura do formulário');
    }
    
    // Verificar valores preenchidos
    const valoresPreenchidos = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      const comValor = [];
      for (const input of inputs) {
        if (input.value && input.value.includes('/')) {
          comValor.push({ name: input.name || input.id || 'sem_nome', value: input.value });
        }
      }
      return comValor;
    });
    
    log(`Inputs com datas preenchidas: ${JSON.stringify(valoresPreenchidos)}`, LOG_LEVELS.DEBUG);
    
    // Boletos Anteriores: NÃO POSSUI
    log('Configurando Boletos Anteriores: NÃO POSSUI...');
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const parent = select.closest('tr, div, td');
        const parentText = parent?.textContent?.toLowerCase() || '';
        const options = Array.from(select.querySelectorAll('option'));
        
        if (parentText.includes('boletos anteriores') || parentText.includes('boleto anterior')) {
          for (const option of options) {
            const texto = option.textContent?.toUpperCase().trim() || '';
            if (texto === 'NÃO POSSUI' || texto === 'NAO POSSUI') {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
    });
    
    // Referência: VENCIMENTO ORIGINAL
    log('Configurando Referência: VENCIMENTO ORIGINAL...');
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const parent = select.closest('tr, div, td');
        const parentText = parent?.textContent?.toLowerCase() || '';
        const options = Array.from(select.querySelectorAll('option'));
        
        if (parentText.includes('referência') || parentText.includes('referencia')) {
          for (const option of options) {
            const texto = option.textContent?.toUpperCase().trim() || '';
            if (texto === 'VENCIMENTO ORIGINAL' || texto.includes('VENCIMENTO ORIGINAL')) {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
    });
    
    await page.waitForTimeout(1000);
    
    // ============================================
    // LAYOUT - CRÍTICO: DEVE SER "BI - VANGARD COBRANÇA"
    // ============================================
    // Localizado na seção "Dados Visualizados" com label "Layout:"
    // Opções: "--- SELECIONE ---", "BI - VANGARD COBRANÇA", "CHATBOT", "POS VENDA COBRANÇA"
    // SEM O LAYOUT CORRETO, O RELATÓRIO VEM COM COLUNAS VAZIAS (ex: Cooperativa)
    // ============================================
    log('═'.repeat(50), LOG_LEVELS.INFO);
    log('📋 CONFIGURANDO LAYOUT DO RELATÓRIO', LOG_LEVELS.INFO);
    log('═'.repeat(50), LOG_LEVELS.INFO);
    log('   Layout obrigatório: "BI - VANGARD COBRANÇA"', LOG_LEVELS.INFO);
    
    const layoutSelecionado = await page.evaluate(() => {
      const resultado = {
        sucesso: false,
        metodo: null,
        valorSelecionado: null,
        opcoesDisponiveis: [],
        diagnostico: {
          selectsEncontrados: [],
          labelsLayout: [],
          secaoDadosVisualizados: null
        }
      };
      
      const normalizar = (texto) => {
        return (texto || '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      // ========================================
      // ESTRATÉGIA 1: Buscar pelo texto exato "Layout:" adjacente
      // ========================================
      const labels = document.querySelectorAll('td, th, label, span');
      for (const label of labels) {
        const texto = (label.textContent || '').trim();
        const textoNorm = normalizar(texto);
        
        // Buscar exatamente "Layout:" ou "Layout"
        if (textoNorm === 'LAYOUT:' || textoNorm === 'LAYOUT') {
          resultado.diagnostico.labelsLayout.push({
            texto: texto,
            tag: label.tagName
          });
          
          // Procurar select na mesma linha (tr) ou próximo
          const row = label.closest('tr');
          const selectInRow = row?.querySelector('select');
          
          if (selectInRow) {
            // Listar opções
            const opcoes = Array.from(selectInRow.options).map(o => o.text?.trim() || '');
            resultado.opcoesDisponiveis = opcoes;
            
            // Procurar "BI - VANGARD COBRANÇA"
            for (let i = 0; i < selectInRow.options.length; i++) {
              const optText = normalizar(selectInRow.options[i].text || '');
              if (optText.includes('BI') && optText.includes('VANGARD')) {
                selectInRow.selectedIndex = i;
                // Alguns portais dependem de eventos adicionais além do 'change'
                selectInRow.dispatchEvent(new Event('input', { bubbles: true }));
                selectInRow.dispatchEvent(new Event('change', { bubbles: true }));
                resultado.sucesso = true;
                resultado.metodo = 'LABEL_LAYOUT';
                resultado.valorSelecionado = selectInRow.options[i].text?.trim();
                return resultado;
              }
            }
          }
        }
      }
      
      // ========================================
      // ESTRATÉGIA 2: Buscar seção "Dados Visualizados"
      // ========================================
      const secoes = document.querySelectorAll('td, th, div, fieldset, legend');
      for (const secao of secoes) {
        const texto = normalizar(secao.textContent || '');
        
        if (texto.includes('DADOS VISUALIZADOS')) {
          resultado.diagnostico.secaoDadosVisualizados = {
            tag: secao.tagName,
            texto: (secao.textContent || '').substring(0, 100)
          };
          
          // Encontrar o container mais próximo
          const container = secao.closest('table, div, fieldset') || secao.parentElement;
          const selects = container?.querySelectorAll('select') || [];
          
          for (const select of selects) {
            // Listar opções
            const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
            
            // Verificar se tem a opção BI - VANGARD
            for (let i = 0; i < select.options.length; i++) {
              const optText = normalizar(select.options[i].text || '');
              if (optText.includes('BI') && optText.includes('VANGARD')) {
                if (resultado.opcoesDisponiveis.length === 0) {
                  resultado.opcoesDisponiveis = opcoes;
                }
                select.selectedIndex = i;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                resultado.sucesso = true;
                resultado.metodo = 'SECAO_DADOS_VISUALIZADOS';
                resultado.valorSelecionado = select.options[i].text?.trim();
                return resultado;
              }
            }
          }
        }
      }
      
      // ========================================
      // ESTRATÉGIA 3: Varrer TODOS os selects buscando a opção correta
      // ========================================
      const todosSelects = document.querySelectorAll('select');
      for (const select of todosSelects) {
        const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
        
        for (let i = 0; i < select.options.length; i++) {
          const optText = normalizar(select.options[i].text || '');
          // Buscar especificamente "BI - VANGARD COBRANÇA" ou "BI VANGARD COBRANCA"
          if ((optText.includes('BI') && optText.includes('VANGARD')) || 
              optText.includes('BI - VANGARD') ||
              optText.includes('VANGARD COBRANCA')) {
            if (resultado.opcoesDisponiveis.length === 0) {
              resultado.opcoesDisponiveis = opcoes;
            }
            select.selectedIndex = i;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            resultado.sucesso = true;
            resultado.metodo = 'VARREDURA_OPCOES';
            resultado.valorSelecionado = select.options[i].text?.trim();
            return resultado;
          }
        }
        
        // Guardar para diagnóstico: selects que têm opções com textos relevantes
        const temLayoutOuVisualizacao = opcoes.some(o => {
          const norm = normalizar(o);
          return norm.includes('SELECIONE') || norm.includes('CHATBOT') || norm.includes('COBRANCA');
        });
        if (temLayoutOuVisualizacao) {
          resultado.diagnostico.selectsEncontrados.push({
            name: select.name || select.id || 'sem_nome',
            opcoes: opcoes.slice(0, 5)
          });
        }
      }
      
      // ========================================
      // ESTRATÉGIA 4: Fallback por atributos name/id
      // ========================================
      for (const select of todosSelects) {
        const name = (select.name || select.id || '').toLowerCase();
        
        if (name.includes('layout') || name.includes('visualiza') || name.includes('dados')) {
          const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
          if (resultado.opcoesDisponiveis.length === 0) {
            resultado.opcoesDisponiveis = opcoes;
          }
          
          // Tentar selecionar BI - VANGARD
          for (let i = 0; i < select.options.length; i++) {
            const optText = normalizar(select.options[i].text || '');
            if (optText.includes('BI') && optText.includes('VANGARD')) {
              select.selectedIndex = i;
              select.dispatchEvent(new Event('input', { bubbles: true }));
              select.dispatchEvent(new Event('change', { bubbles: true }));
              resultado.sucesso = true;
              resultado.metodo = 'FALLBACK_NAME_ID';
              resultado.valorSelecionado = select.options[i].text?.trim();
              return resultado;
            }
          }
        }
      }
      
      return resultado;
    });
    
    // ========================================
    // VALIDAÇÃO OBRIGATÓRIA DO LAYOUT
    // ========================================
    if (layoutSelecionado.sucesso) {
      log(`✅ Layout selecionado com sucesso!`, LOG_LEVELS.SUCCESS);
      log(`   Método: ${layoutSelecionado.metodo}`, LOG_LEVELS.DEBUG);
      log(`   Valor: "${layoutSelecionado.valorSelecionado}"`, LOG_LEVELS.SUCCESS);
      
      // ========================================
      // AGUARDAR CONFIGURAÇÕES CARREGAREM APÓS LAYOUT (COM DETECÇÃO ROBUSTA)
      // ========================================
      log('⏳ Aguardando configurações do layout carregarem...', LOG_LEVELS.INFO);

      // Tempo base de 20s (o portal carrega campos dinamicamente)
      log('   ⏱️ Aguardando 20 segundos (tempo base)...', LOG_LEVELS.INFO);
      await page.waitForTimeout(20000);

      // Verificar se elementos específicos do layout BI apareceram (tolerante a variações)
      let layoutBICarregado = false;
      const maxTentativasLayout = 4;
      const intervaloExtraLayout = 5000; // 5 segundos extras por tentativa

      const detectarCamposLayoutBI = async () => {
        return await page.evaluate(() => {
          const normalizar = (t) => (t || '')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

          const alvos = [
            // Variações observadas no portal
            'VENCIMENTO DO VEICULO',
            'VENCIMENTO VEICULO',
            'DIA VENCIMENTO VEICULO',
            'DIA DE VENCIMENTO',
            // Campo de atraso (pode aparecer no layout)
            'QTDE DIAS EM ATRASO',
            'DIAS EM ATRASO',
          ];

          const elementos = document.querySelectorAll('td, th, div, span, label');
          for (const el of elementos) {
            const texto = normalizar(el.textContent || '');
            if (!texto) continue;
            if (alvos.some(a => texto.includes(a))) return true;
          }
          return false;
        });
      };

      for (let tentativaLayout = 1; tentativaLayout <= maxTentativasLayout && !layoutBICarregado; tentativaLayout++) {
        const detectado = await detectarCamposLayoutBI();

        if (detectado) {
          log('✅ Campos do layout BI detectados no DOM (layout carregado)!', LOG_LEVELS.SUCCESS);
          layoutBICarregado = true;
          break;
        }

        if (tentativaLayout < maxTentativasLayout) {
          log(`⏳ Layout BI ainda não aparenta estar pronto. Aguardando mais ${intervaloExtraLayout / 1000}s... (tentativa ${tentativaLayout}/${maxTentativasLayout})`, LOG_LEVELS.INFO);
          await page.waitForTimeout(intervaloExtraLayout);
        }
      }

      if (!layoutBICarregado) {
        // Não prosseguir silenciosamente: isso gera importação com colunas críticas vazias
        log('❌ ERRO: Campos do layout BI não foram detectados após a espera.', LOG_LEVELS.ERROR);
        await saveDebugInfo(page, context, 'Layout BI não carregou campos críticos (vencimento/atraso)');
        throw new Error('Layout BI não carregou totalmente (campos de vencimento/atraso não apareceram).');
      }

      log('✅ Tempo de espera para configurações do layout concluído!', LOG_LEVELS.SUCCESS);
    } else {
      // ERRO CRÍTICO - NÃO prosseguir sem o layout correto
      log(`❌ ERRO CRÍTICO: Layout "BI - VANGARD COBRANÇA" não encontrado!`, LOG_LEVELS.ERROR);
      log(`   Opções disponíveis: ${layoutSelecionado.opcoesDisponiveis.join(', ') || 'NENHUMA'}`, LOG_LEVELS.ERROR);
      
      // Diagnóstico detalhado
      if (layoutSelecionado.diagnostico.labelsLayout.length > 0) {
        log(`   Labels "Layout" encontrados: ${JSON.stringify(layoutSelecionado.diagnostico.labelsLayout)}`, LOG_LEVELS.DEBUG);
      }
      if (layoutSelecionado.diagnostico.secaoDadosVisualizados) {
        log(`   Seção "Dados Visualizados": ${JSON.stringify(layoutSelecionado.diagnostico.secaoDadosVisualizados)}`, LOG_LEVELS.DEBUG);
      }
      if (layoutSelecionado.diagnostico.selectsEncontrados.length > 0) {
        log(`   Selects relevantes encontrados:`, LOG_LEVELS.DEBUG);
        layoutSelecionado.diagnostico.selectsEncontrados.forEach(s => {
          log(`      ${s.name}: [${s.opcoes.join(', ')}]`, LOG_LEVELS.DEBUG);
        });
      }
      
      // Salvar debug e abortar
      await saveDebugInfo(page, context, 'Layout BI-VANGARD não encontrado');
      throw new Error('ERRO CRÍTICO: Layout "BI - VANGARD COBRANÇA" não encontrado! Verifique a seção "Dados Visualizados" no portal.');
    }
    
    // Forma de Exibição: Em Excel
    await selecionarFormaExibicaoEmExcel(page);
    
    await page.waitForTimeout(1000);
    
    // ============================================
    // CONFIGURAÇÃO DE CHECKBOXES - SITUAÇÃO BOLETO
    // ============================================
    // Configura apenas os checkboxes da seção "Situação Boleto":
    // - MARCAR: ABERTO, ABERTO MIGRADO, BAIXADO, BAIXADO C/ PENDÊNCIA, BAIXADOS MIGRADOS
    // - DESMARCAR: CANCELADO
    // Outros checkboxes (Regional, Cooperativa, etc) permanecem inalterados
    // ============================================
    try {
      await configurarCheckboxesSituacaoBoleto(page, 3);
    } catch (checkboxError) {
      log(`Erro na configuração de Situação Boleto: ${checkboxError.message}`, LOG_LEVELS.ERROR);
      await saveDebugInfo(page, context, `Situação Boleto: ${checkboxError.message}`);
      throw checkboxError;
    }
    
    // ============================================
    // CONFIGURAÇÃO DE CHECKBOXES - COOPERATIVA: TODOS
    // ============================================
    // CRÍTICO: Marcar o checkbox "TODOS" na seção Cooperativa
    // Se não marcar, o relatório vem com coluna Cooperativa vazia!
    // ============================================
    log('📋 Configurando checkbox "TODOS" em Cooperativa...', LOG_LEVELS.INFO);
    
    const cooperativaTodosMarcado = await page.evaluate(() => {
      const resultado = { 
        sucesso: false, 
        metodo: null, 
        diagnostico: {
          totalCheckboxes: 0,
          checkboxesCooperativa: [],
          tdComCooperativa: [],
          estrutura: ''
        }
      };
      
      const normalizar = (texto) => {
        return (texto || '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      // DIAGNÓSTICO: Listar todos os checkboxes da página
      const todosCheckboxes = document.querySelectorAll('input[type="checkbox"]');
      resultado.diagnostico.totalCheckboxes = todosCheckboxes.length;
      
      // ESTRATÉGIA 1: Procurar TD que contém "Cooperativa:" no início
      const tds = document.querySelectorAll('td');
      for (const td of tds) {
        const textoOriginal = td.textContent || '';
        const texto = normalizar(textoOriginal);
        
        // Verificar se este TD é o label "Cooperativa:"
        if (texto.startsWith('COOPERATIVA:') || texto === 'COOPERATIVA') {
          resultado.diagnostico.tdComCooperativa.push({
            texto: textoOriginal.substring(0, 100),
            tagName: td.tagName
          });
          
          // Procurar os checkboxes DENTRO deste TD ou na mesma linha
          const row = td.closest('tr');
          const container = row || td;
          
          // Listar todos os checkboxes neste container
          const checkboxesNoContainer = container.querySelectorAll('input[type="checkbox"]');
          
          for (const cb of checkboxesNoContainer) {
            // Pegar o label do checkbox
            const label = cb.closest('label');
            const labelText = normalizar(label?.textContent || cb.value || '');
            
            resultado.diagnostico.checkboxesCooperativa.push({
              value: cb.value,
              labelText: labelText,
              checked: cb.checked,
              name: cb.name || cb.id || ''
            });
            
            // Verificar se é o checkbox "TODOS"
            if (labelText === 'TODOS' || labelText.startsWith('TODOS ') || cb.value?.toUpperCase() === 'TODOS') {
              // MARCAR O CHECKBOX
              if (!cb.checked) {
                cb.checked = true;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
                cb.dispatchEvent(new Event('click', { bubbles: true }));
                cb.dispatchEvent(new Event('input', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'TD_COOPERATIVA_TODOS';
              resultado.checkboxMarcado = { value: cb.value, label: labelText };
              return resultado;
            }
          }
          
          // Se não encontrou "TODOS" explícito, marcar O PRIMEIRO checkbox (geralmente é "TODOS")
          if (checkboxesNoContainer.length > 0) {
            const primeiroCheckbox = checkboxesNoContainer[0];
            if (!primeiroCheckbox.checked) {
              primeiroCheckbox.checked = true;
              primeiroCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
              primeiroCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
              primeiroCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
            }
            resultado.sucesso = true;
            resultado.metodo = 'PRIMEIRO_CHECKBOX_COOPERATIVA';
            resultado.checkboxMarcado = { 
              value: primeiroCheckbox.value, 
              label: normalizar(primeiroCheckbox.closest('label')?.textContent || primeiroCheckbox.value || 'primeiro')
            };
            return resultado;
          }
        }
      }
      
      // ESTRATÉGIA 2: Procurar por name/id que contenha "cooperativa"
      for (const cb of todosCheckboxes) {
        const name = (cb.name || cb.id || '').toLowerCase();
        const value = (cb.value || '').toUpperCase();
        
        if (name.includes('cooperativa') || name.includes('coop')) {
          if (value === 'TODOS' || value === '' || value === 'T' || value === '0') {
            if (!cb.checked) {
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              cb.dispatchEvent(new Event('click', { bubbles: true }));
            }
            resultado.sucesso = true;
            resultado.metodo = 'NAME_COOPERATIVA';
            resultado.checkboxMarcado = { name: cb.name, value: cb.value };
            return resultado;
          }
        }
      }
      
      // ESTRATÉGIA 3: Procurar label/span com texto "TODOS" próximo a texto "Cooperativa"
      const labels = document.querySelectorAll('label');
      for (const label of labels) {
        const texto = normalizar(label.textContent || '');
        if (texto === 'TODOS' || texto.startsWith('TODOS ')) {
          // Verificar se está próximo de algo que menciona "Cooperativa"
          const parentRow = label.closest('tr');
          const parentTable = label.closest('table');
          const parentDiv = label.closest('div');
          
          const containerText = normalizar(
            (parentRow?.textContent || '') + 
            (parentTable?.querySelector('tr')?.textContent || '') +
            (parentDiv?.textContent || '')
          );
          
          if (containerText.includes('COOPERATIVA')) {
            const cb = label.querySelector('input[type="checkbox"]') || label.previousElementSibling;
            if (cb && cb.type === 'checkbox') {
              if (!cb.checked) {
                cb.checked = true;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
                cb.dispatchEvent(new Event('click', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'LABEL_TODOS_PROXIMO_COOPERATIVA';
              resultado.checkboxMarcado = { label: texto };
              return resultado;
            }
          }
        }
      }
      
      // Capturar estrutura HTML para diagnóstico
      const tablesHtml = Array.from(document.querySelectorAll('table')).slice(0, 5).map(t => {
        const firstRow = t.querySelector('tr');
        return firstRow?.textContent?.substring(0, 100) || '';
      });
      resultado.diagnostico.estrutura = tablesHtml.join(' | ');
      
      return resultado;
    });
    
    if (cooperativaTodosMarcado.sucesso) {
      log(`✅ Checkbox TODOS em Cooperativa marcado (método: ${cooperativaTodosMarcado.metodo})`, LOG_LEVELS.SUCCESS);
      if (cooperativaTodosMarcado.checkboxMarcado) {
        log(`   Checkbox: ${JSON.stringify(cooperativaTodosMarcado.checkboxMarcado)}`, LOG_LEVELS.DEBUG);
      }
    } else {
      log(`⚠️ Checkbox TODOS em Cooperativa NÃO encontrado!`, LOG_LEVELS.WARN);
      log(`   Diagnóstico:`, LOG_LEVELS.DEBUG);
      log(`   - Total de checkboxes na página: ${cooperativaTodosMarcado.diagnostico.totalCheckboxes}`, LOG_LEVELS.DEBUG);
      log(`   - TDs com "Cooperativa": ${cooperativaTodosMarcado.diagnostico.tdComCooperativa.length}`, LOG_LEVELS.DEBUG);
      if (cooperativaTodosMarcado.diagnostico.tdComCooperativa.length > 0) {
        log(`   - Primeiro TD: ${cooperativaTodosMarcado.diagnostico.tdComCooperativa[0]?.texto}`, LOG_LEVELS.DEBUG);
      }
      log(`   - Checkboxes encontrados na seção: ${cooperativaTodosMarcado.diagnostico.checkboxesCooperativa.length}`, LOG_LEVELS.DEBUG);
      cooperativaTodosMarcado.diagnostico.checkboxesCooperativa.slice(0, 5).forEach((cb, i) => {
        log(`     [${i}] value="${cb.value}" label="${cb.labelText}" checked=${cb.checked}`, LOG_LEVELS.DEBUG);
      });
      log(`   - Estrutura de tabelas: ${cooperativaTodosMarcado.diagnostico.estrutura}`, LOG_LEVELS.DEBUG);
    }
    
    // ============================================
    // CONFIGURAÇÃO DE CHECKBOXES - REGIONAL DO ASSOCIADO: TODOS
    // ============================================
    log('📋 Configurando checkbox "TODOS" em Regional do Associado...', LOG_LEVELS.INFO);
    
    const regionalTodosMarcado = await page.evaluate(() => {
      const resultado = { 
        sucesso: false, 
        metodo: null, 
        diagnostico: {
          checkboxesEncontrados: [],
          tdsEncontrados: []
        }
      };
      
      const normalizar = (texto) => {
        return (texto || '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      // ESTRATÉGIA 1: Procurar TD que contém "Regional:" no início
      const tds = document.querySelectorAll('td, th');
      for (const td of tds) {
        const textoOriginal = td.textContent || '';
        const texto = normalizar(textoOriginal);
        
        // Verificar se este TD é o label "Regional:" (não confundir com Regional do Boleto)
        if (texto.startsWith('REGIONAL:') || texto === 'REGIONAL' || texto.includes('REGIONAL DO ASSOCIADO')) {
          resultado.diagnostico.tdsEncontrados.push(textoOriginal.substring(0, 80));
          
          // Procurar os checkboxes DENTRO deste TD ou na mesma linha
          const row = td.closest('tr');
          const container = row || td;
          
          const checkboxesNoContainer = container.querySelectorAll('input[type="checkbox"]');
          
          for (const cb of checkboxesNoContainer) {
            const label = cb.closest('label');
            const labelText = normalizar(label?.textContent || cb.value || '');
            
            resultado.diagnostico.checkboxesEncontrados.push({
              value: cb.value,
              labelText: labelText,
              checked: cb.checked
            });
            
            // Verificar se é o checkbox "TODOS"
            if (labelText === 'TODOS' || labelText.startsWith('TODOS ') || cb.value?.toUpperCase() === 'TODOS') {
              if (!cb.checked) {
                cb.checked = true;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
                cb.dispatchEvent(new Event('click', { bubbles: true }));
                cb.dispatchEvent(new Event('input', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'TD_REGIONAL_TODOS';
              resultado.checkboxMarcado = { value: cb.value, label: labelText };
              return resultado;
            }
          }
          
          // Se não encontrou "TODOS" explícito, marcar o PRIMEIRO checkbox
          if (checkboxesNoContainer.length > 0) {
            const primeiroCheckbox = checkboxesNoContainer[0];
            if (!primeiroCheckbox.checked) {
              primeiroCheckbox.checked = true;
              primeiroCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
              primeiroCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
              primeiroCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
            }
            resultado.sucesso = true;
            resultado.metodo = 'PRIMEIRO_CHECKBOX_REGIONAL';
            resultado.checkboxMarcado = { 
              value: primeiroCheckbox.value, 
              label: normalizar(primeiroCheckbox.closest('label')?.textContent || primeiroCheckbox.value || 'primeiro')
            };
            return resultado;
          }
        }
      }
      
      // ESTRATÉGIA 2: Procurar seção "Regional do Associado" pelo header
      for (const td of tds) {
        const texto = normalizar(td.textContent || '');
        if (texto.includes('REGIONAL DO ASSOCIADO')) {
          const table = td.closest('table');
          if (table) {
            const allCbs = table.querySelectorAll('input[type="checkbox"]');
            for (const cb of allCbs) {
              const label = cb.closest('label');
              const labelText = normalizar(label?.textContent || cb.value || '');
              
              if (labelText === 'TODOS' || cb.value?.toUpperCase() === 'TODOS') {
                if (!cb.checked) {
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  cb.dispatchEvent(new Event('click', { bubbles: true }));
                }
                resultado.sucesso = true;
                resultado.metodo = 'SECAO_REGIONAL_ASSOCIADO';
                resultado.checkboxMarcado = { value: cb.value, label: labelText };
                return resultado;
              }
            }
            // Marcar primeiro se não encontrou TODOS explícito
            if (allCbs.length > 0 && !resultado.sucesso) {
              const primeiro = allCbs[0];
              if (!primeiro.checked) {
                primeiro.checked = true;
                primeiro.dispatchEvent(new Event('change', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'PRIMEIRO_CHECKBOX_SECAO_REGIONAL';
              return resultado;
            }
          }
        }
      }
      
      return resultado;
    });
    
    if (regionalTodosMarcado.sucesso) {
      log(`✅ Checkbox TODOS em Regional do Associado marcado (método: ${regionalTodosMarcado.metodo})`, LOG_LEVELS.SUCCESS);
      if (regionalTodosMarcado.checkboxMarcado) {
        log(`   Checkbox: ${JSON.stringify(regionalTodosMarcado.checkboxMarcado)}`, LOG_LEVELS.DEBUG);
      }
    } else {
      log(`⚠️ Checkbox TODOS em Regional do Associado NÃO encontrado!`, LOG_LEVELS.WARN);
      log(`   TDs encontrados: ${JSON.stringify(regionalTodosMarcado.diagnostico.tdsEncontrados)}`, LOG_LEVELS.DEBUG);
    }
    
    // ============================================
    // CONFIGURAÇÃO DE CHECKBOXES - SITUAÇÃO DO VEÍCULO: TODOS
    // ============================================
    log('📋 Configurando checkbox "TODOS" em Situação do Veículo...', LOG_LEVELS.INFO);
    
    const situacaoVeiculoTodosMarcado = await page.evaluate(() => {
      const resultado = { 
        sucesso: false, 
        metodo: null, 
        diagnostico: {
          checkboxesEncontrados: [],
          tdsEncontrados: []
        }
      };
      
      const normalizar = (texto) => {
        return (texto || '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      // ESTRATÉGIA 1: Procurar TD que contém "Situação:" ou "Situacao:" (sem ser Situação Boleto)
      const tds = document.querySelectorAll('td, th');
      for (const td of tds) {
        const textoOriginal = td.textContent || '';
        const texto = normalizar(textoOriginal);
        
        // Verificar se este TD é o label "Situação:" dentro da seção de Veículo
        // Evitar confundir com "Situação Boleto"
        if ((texto.startsWith('SITUACAO:') || texto === 'SITUACAO') && !texto.includes('BOLETO')) {
          resultado.diagnostico.tdsEncontrados.push(textoOriginal.substring(0, 80));
          
          // Verificar contexto - deve estar na seção "Situação do Veículo"
          const table = td.closest('table');
          const tableText = normalizar(table?.textContent || '');
          
          // Se a tabela menciona "VEICULO" ou está próxima de seção de veículo
          if (tableText.includes('VEICULO') || tableText.includes('SITUACAO DO VEICULO')) {
            const row = td.closest('tr');
            const container = row || td;
            
            const checkboxesNoContainer = container.querySelectorAll('input[type="checkbox"]');
            
            for (const cb of checkboxesNoContainer) {
              const label = cb.closest('label');
              const labelText = normalizar(label?.textContent || cb.value || '');
              
              resultado.diagnostico.checkboxesEncontrados.push({
                value: cb.value,
                labelText: labelText,
                checked: cb.checked
              });
              
              if (labelText === 'TODOS' || labelText.startsWith('TODOS ') || cb.value?.toUpperCase() === 'TODOS') {
                if (!cb.checked) {
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  cb.dispatchEvent(new Event('click', { bubbles: true }));
                  cb.dispatchEvent(new Event('input', { bubbles: true }));
                }
                resultado.sucesso = true;
                resultado.metodo = 'TD_SITUACAO_VEICULO_TODOS';
                resultado.checkboxMarcado = { value: cb.value, label: labelText };
                return resultado;
              }
            }
            
            // Marcar primeiro se não encontrou TODOS explícito
            if (checkboxesNoContainer.length > 0) {
              const primeiroCheckbox = checkboxesNoContainer[0];
              if (!primeiroCheckbox.checked) {
                primeiroCheckbox.checked = true;
                primeiroCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'PRIMEIRO_CHECKBOX_SITUACAO_VEICULO';
              resultado.checkboxMarcado = { 
                value: primeiroCheckbox.value, 
                label: normalizar(primeiroCheckbox.closest('label')?.textContent || 'primeiro')
              };
              return resultado;
            }
          }
        }
      }
      
      // ESTRATÉGIA 2: Procurar seção "Situação do Veículo" ou "Situacao do Veiculo" pelo header
      for (const td of tds) {
        const texto = normalizar(td.textContent || '');
        if (texto.includes('SITUACAO DO VEICULO') || texto === 'SITUACAO DO VEICULO') {
          const table = td.closest('table');
          if (table) {
            const allCbs = table.querySelectorAll('input[type="checkbox"]');
            for (const cb of allCbs) {
              const label = cb.closest('label');
              const labelText = normalizar(label?.textContent || cb.value || '');
              
              if (labelText === 'TODOS' || cb.value?.toUpperCase() === 'TODOS') {
                if (!cb.checked) {
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  cb.dispatchEvent(new Event('click', { bubbles: true }));
                }
                resultado.sucesso = true;
                resultado.metodo = 'SECAO_SITUACAO_VEICULO';
                resultado.checkboxMarcado = { value: cb.value, label: labelText };
                return resultado;
              }
            }
            // Marcar primeiro se não encontrou TODOS explícito
            if (allCbs.length > 0 && !resultado.sucesso) {
              const primeiro = allCbs[0];
              if (!primeiro.checked) {
                primeiro.checked = true;
                primeiro.dispatchEvent(new Event('change', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'PRIMEIRO_CHECKBOX_SECAO_SITUACAO_VEICULO';
              return resultado;
            }
          }
        }
      }
      
      return resultado;
    });
    
    if (situacaoVeiculoTodosMarcado.sucesso) {
      log(`✅ Checkbox TODOS em Situação do Veículo marcado (método: ${situacaoVeiculoTodosMarcado.metodo})`, LOG_LEVELS.SUCCESS);
      if (situacaoVeiculoTodosMarcado.checkboxMarcado) {
        log(`   Checkbox: ${JSON.stringify(situacaoVeiculoTodosMarcado.checkboxMarcado)}`, LOG_LEVELS.DEBUG);
      }
    } else {
      log(`⚠️ Checkbox TODOS em Situação do Veículo NÃO encontrado!`, LOG_LEVELS.WARN);
      log(`   TDs encontrados: ${JSON.stringify(situacaoVeiculoTodosMarcado.diagnostico.tdsEncontrados)}`, LOG_LEVELS.DEBUG);
    }
    
    // ============================================
    // CONFIGURAÇÃO DE CHECKBOXES - VENCIMENTO DO VEÍCULO: TODOS
    // ============================================
    // CRÍTICO: Esta seção aparece APÓS selecionar o layout "BI - VANGARD COBRANÇA"
    // Contém checkboxes para dias (10, 15, 20, 25, 1, 5, 7, 8, 22, 28, 30, 31) e "TODOS"
    // Label: "Vencimento:" e header: "Vencimento do Veículo"
    // ============================================
    log('📋 Configurando checkbox "TODOS" em Vencimento do Veículo...', LOG_LEVELS.INFO);
    
    const vencimentoVeiculoTodosMarcado = await page.evaluate(() => {
      const resultado = { 
        sucesso: false, 
        metodo: null, 
        diagnostico: {
          checkboxesEncontrados: [],
          tdsEncontrados: [],
          secoesVencimento: []
        }
      };
      
      const normalizar = (texto) => {
        return (texto || '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      // ESTRATÉGIA 1: Procurar seção "Vencimento do Veículo" pelo header azul
      const tds = document.querySelectorAll('td, th');
      for (const td of tds) {
        const textoOriginal = td.textContent || '';
        const texto = normalizar(textoOriginal);
        
        // Procurar pelo header da seção "Vencimento do Veículo"
        if (texto === 'VENCIMENTO DO VEICULO' || texto.includes('VENCIMENTO DO VEICULO')) {
          resultado.diagnostico.secoesVencimento.push({
            texto: textoOriginal.substring(0, 80),
            tagName: td.tagName
          });
          
          // Encontrar a tabela que contém esta seção
          const table = td.closest('table');
          if (table) {
            // Procurar por "Vencimento:" label dentro desta tabela
            const rows = table.querySelectorAll('tr');
            for (const row of rows) {
              const rowText = normalizar(row.textContent || '');
              
              // Encontrar linha que contém "Vencimento:" mas NÃO "VENCIMENTO DO VEICULO" (header)
              if (rowText.includes('VENCIMENTO:') && !rowText.includes('VENCIMENTO DO VEICULO')) {
                const checkboxesNaLinha = row.querySelectorAll('input[type="checkbox"]');
                
                for (const cb of checkboxesNaLinha) {
                  const label = cb.closest('label');
                  const labelText = normalizar(label?.textContent || cb.value || '');
                  
                  resultado.diagnostico.checkboxesEncontrados.push({
                    value: cb.value,
                    labelText: labelText,
                    checked: cb.checked
                  });
                  
                  // Verificar se é o checkbox "TODOS"
                  if (labelText === 'TODOS' || labelText.startsWith('TODOS ') || cb.value?.toUpperCase() === 'TODOS') {
                    if (!cb.checked) {
                      cb.checked = true;
                      cb.dispatchEvent(new Event('change', { bubbles: true }));
                      cb.dispatchEvent(new Event('click', { bubbles: true }));
                      cb.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    resultado.sucesso = true;
                    resultado.metodo = 'SECAO_VENCIMENTO_VEICULO_TODOS';
                    resultado.checkboxMarcado = { value: cb.value, label: labelText };
                    return resultado;
                  }
                }
                
                // Marcar primeiro checkbox se não encontrou "TODOS" explícito
                if (checkboxesNaLinha.length > 0) {
                  const primeiroCheckbox = checkboxesNaLinha[0];
                  if (!primeiroCheckbox.checked) {
                    primeiroCheckbox.checked = true;
                    primeiroCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                    primeiroCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
                  }
                  resultado.sucesso = true;
                  resultado.metodo = 'PRIMEIRO_CHECKBOX_VENCIMENTO_VEICULO';
                  resultado.checkboxMarcado = { 
                    value: primeiroCheckbox.value, 
                    label: normalizar(primeiroCheckbox.closest('label')?.textContent || primeiroCheckbox.value || 'primeiro')
                  };
                  return resultado;
                }
              }
            }
            
            // Se não achou pela linha específica, buscar todos checkboxes na tabela
            const allCbs = table.querySelectorAll('input[type="checkbox"]');
            for (const cb of allCbs) {
              const label = cb.closest('label');
              const labelText = normalizar(label?.textContent || cb.value || '');
              
              if (labelText === 'TODOS' || cb.value?.toUpperCase() === 'TODOS') {
                if (!cb.checked) {
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  cb.dispatchEvent(new Event('click', { bubbles: true }));
                }
                resultado.sucesso = true;
                resultado.metodo = 'TABLE_VENCIMENTO_VEICULO_TODOS';
                resultado.checkboxMarcado = { value: cb.value, label: labelText };
                return resultado;
              }
            }
            
            // Último recurso: marcar primeiro checkbox da tabela
            if (allCbs.length > 0 && !resultado.sucesso) {
              const primeiro = allCbs[0];
              if (!primeiro.checked) {
                primeiro.checked = true;
                primeiro.dispatchEvent(new Event('change', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'PRIMEIRO_CHECKBOX_TABLE_VENCIMENTO';
              return resultado;
            }
          }
        }
      }
      
      // ESTRATÉGIA 2: Procurar por "Vencimento:" label diretamente (sem header)
      for (const td of tds) {
        const textoOriginal = td.textContent || '';
        const texto = normalizar(textoOriginal);
        
        // Procurar TD com "Vencimento:" (não confundir com "Vencimento Original" de datas)
        if ((texto === 'VENCIMENTO:' || texto.startsWith('VENCIMENTO:')) && 
            !texto.includes('ORIGINAL') && !texto.includes('DATA')) {
          resultado.diagnostico.tdsEncontrados.push(textoOriginal.substring(0, 80));
          
          const row = td.closest('tr');
          const table = td.closest('table');
          
          // Verificar se a tabela contém checkboxes de dias (10, 15, 20, etc.)
          const tableText = normalizar(table?.textContent || '');
          const temDias = /\b(10|15|20|25|30|31)\b/.test(tableText);
          
          if (temDias && row) {
            const checkboxesNaLinha = row.querySelectorAll('input[type="checkbox"]');
            
            for (const cb of checkboxesNaLinha) {
              const label = cb.closest('label');
              const labelText = normalizar(label?.textContent || cb.value || '');
              
              if (labelText === 'TODOS' || cb.value?.toUpperCase() === 'TODOS') {
                if (!cb.checked) {
                  cb.checked = true;
                  cb.dispatchEvent(new Event('change', { bubbles: true }));
                  cb.dispatchEvent(new Event('click', { bubbles: true }));
                }
                resultado.sucesso = true;
                resultado.metodo = 'TD_VENCIMENTO_DIAS_TODOS';
                resultado.checkboxMarcado = { value: cb.value, label: labelText };
                return resultado;
              }
            }
            
            if (checkboxesNaLinha.length > 0) {
              const primeiroCheckbox = checkboxesNaLinha[0];
              if (!primeiroCheckbox.checked) {
                primeiroCheckbox.checked = true;
                primeiroCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
              }
              resultado.sucesso = true;
              resultado.metodo = 'PRIMEIRO_CHECKBOX_VENCIMENTO_DIAS';
              resultado.checkboxMarcado = { 
                value: primeiroCheckbox.value, 
                label: normalizar(primeiroCheckbox.closest('label')?.textContent || 'primeiro')
              };
              return resultado;
            }
          }
        }
      }
      
      return resultado;
    });
    
    if (vencimentoVeiculoTodosMarcado.sucesso) {
      log(`✅ Checkbox TODOS em Vencimento do Veículo marcado (método: ${vencimentoVeiculoTodosMarcado.metodo})`, LOG_LEVELS.SUCCESS);
      if (vencimentoVeiculoTodosMarcado.checkboxMarcado) {
        log(`   Checkbox: ${JSON.stringify(vencimentoVeiculoTodosMarcado.checkboxMarcado)}`, LOG_LEVELS.DEBUG);
      }
    } else {
      log(`⚠️ Checkbox TODOS em Vencimento do Veículo NÃO encontrado!`, LOG_LEVELS.WARN);
      log(`   Seções encontradas: ${JSON.stringify(vencimentoVeiculoTodosMarcado.diagnostico.secoesVencimento)}`, LOG_LEVELS.DEBUG);
      log(`   TDs encontrados: ${JSON.stringify(vencimentoVeiculoTodosMarcado.diagnostico.tdsEncontrados)}`, LOG_LEVELS.DEBUG);
    }
    
    // ============================================
    // SUMÁRIO OBRIGATÓRIO DE FILTROS ANTES DE GERAR
    // ============================================
    log('', LOG_LEVELS.INFO);
    log('═'.repeat(60), LOG_LEVELS.INFO);
    log('📋 SUMÁRIO DE FILTROS APLICADOS', LOG_LEVELS.INFO);
    log('═'.repeat(60), LOG_LEVELS.INFO);
    
    // Montar sumário visual
    const filtroDataOk = preencheuDatas.sucesso;
    const filtroLayoutOk = layoutSelecionado.sucesso;
    const filtroCooperativaOk = cooperativaTodosMarcado.sucesso;
    const filtroRegionalOk = regionalTodosMarcado.sucesso;
    const filtroSituacaoVeiculoOk = situacaoVeiculoTodosMarcado.sucesso;
    const filtroVencimentoVeiculoOk = vencimentoVeiculoTodosMarcado.sucesso;
    // Situação Boleto é tratada como warning se não encontrou (não bloqueia)
    const filtroFormaExibicaoOk = true; // Sempre configurado via selecionarFormaExibicaoEmExcel
    
    log(`   ${filtroDataOk ? '✅' : '❌'} Data Vencimento Original: ${filtroDataOk ? `${inicio} a ${fim}` : 'NÃO PREENCHIDA'}`, filtroDataOk ? LOG_LEVELS.SUCCESS : LOG_LEVELS.ERROR);
    log(`   ${filtroLayoutOk ? '✅' : '❌'} Layout: ${filtroLayoutOk ? layoutSelecionado.valorSelecionado : 'NÃO SELECIONADO'}`, filtroLayoutOk ? LOG_LEVELS.SUCCESS : LOG_LEVELS.ERROR);
    log(`   ${filtroCooperativaOk ? '✅' : '⚠️'} Cooperativa - TODOS: ${filtroCooperativaOk ? 'MARCADO' : 'NÃO ENCONTRADO'}`, filtroCooperativaOk ? LOG_LEVELS.SUCCESS : LOG_LEVELS.WARN);
    log(`   ${filtroRegionalOk ? '✅' : '⚠️'} Regional do Associado - TODOS: ${filtroRegionalOk ? 'MARCADO' : 'NÃO ENCONTRADO'}`, filtroRegionalOk ? LOG_LEVELS.SUCCESS : LOG_LEVELS.WARN);
    log(`   ${filtroSituacaoVeiculoOk ? '✅' : '⚠️'} Situação do Veículo - TODOS: ${filtroSituacaoVeiculoOk ? 'MARCADO' : 'NÃO ENCONTRADO'}`, filtroSituacaoVeiculoOk ? LOG_LEVELS.SUCCESS : LOG_LEVELS.WARN);
    log(`   ${filtroVencimentoVeiculoOk ? '✅' : '⚠️'} Vencimento do Veículo - TODOS: ${filtroVencimentoVeiculoOk ? 'MARCADO' : 'NÃO ENCONTRADO'}`, filtroVencimentoVeiculoOk ? LOG_LEVELS.SUCCESS : LOG_LEVELS.WARN);
    log(`   ${filtroFormaExibicaoOk ? '✅' : '❌'} Forma Exibição: Em Excel`, LOG_LEVELS.SUCCESS);
    log(`   ℹ️ Boletos Anteriores: NÃO POSSUI (configurado)`, LOG_LEVELS.INFO);
    log(`   ℹ️ Referência: VENCIMENTO ORIGINAL (configurado)`, LOG_LEVELS.INFO);
    log('═'.repeat(60), LOG_LEVELS.INFO);
    
    // Verificar se filtros obrigatórios estão OK
    if (!filtroDataOk || !filtroLayoutOk) {
      log('❌ ERRO: Filtros obrigatórios não configurados! Abortando...', LOG_LEVELS.ERROR);
      await saveDebugInfo(page, context, 'Filtros obrigatórios não configurados');
      throw new Error('Filtros obrigatórios (Data e Layout) não foram configurados corretamente');
    }
    
    // Warning se Cooperativa não foi marcada
    if (!filtroCooperativaOk) {
      log('⚠️ AVISO: Checkbox "TODOS" em Cooperativa não foi encontrado!', LOG_LEVELS.WARN);
      log('   O relatório pode vir com a coluna Cooperativa vazia.', LOG_LEVELS.WARN);
    }
    
    // ============================================
    // DEBUG: Capturar estado detalhado dos filtros
    // ============================================
    log('Verificando estado dos filtros antes de gerar...', LOG_LEVELS.DEBUG);
    
    const estadoFiltros = await page.evaluate(() => {
      const resultado = {
        inputs: {},
        checkboxes: { marcados: [], desmarcados: [] },
        selects: {},
      };
      
      // Verificar todos os inputs de texto com valor
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      for (const input of inputs) {
        if (input.value && input.value.trim()) {
          const name = input.name || input.id || input.placeholder || 'input_sem_nome';
          resultado.inputs[name] = input.value.trim();
        }
      }
      
      // Verificar checkboxes de Situação Boleto
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto') || sectionText.includes('situação') || sectionText.includes('situacao')) {
          const label = cb.closest('label')?.textContent?.trim() || cb.value || 'checkbox';
          if (cb.checked) {
            resultado.checkboxes.marcados.push(label);
          } else {
            resultado.checkboxes.desmarcados.push(label);
          }
        }
      }
      
      // Verificar selects
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        if (select.selectedIndex >= 0) {
          const name = select.name || select.id || 'select_sem_nome';
          const option = select.options[select.selectedIndex];
          resultado.selects[name] = option?.textContent?.trim() || option?.value || '';
        }
      }
      
      // Verificar radio buttons selecionados
      const radios = document.querySelectorAll('input[type="radio"]:checked');
      resultado.radios = Array.from(radios).map(r => {
        const container = r.closest('tr, label, div');
        return container?.textContent?.trim().substring(0, 50) || r.value;
      });
      
      return resultado;
    });
    
    log(`🔍 Estado dos filtros (detalhado):`, LOG_LEVELS.DEBUG);
    log(`   Inputs: ${JSON.stringify(estadoFiltros.inputs)}`, LOG_LEVELS.DEBUG);
    log(`   Checkboxes marcados: ${estadoFiltros.checkboxes.marcados.join(', ') || 'nenhum'}`, LOG_LEVELS.DEBUG);
    log(`   Checkboxes desmarcados: ${estadoFiltros.checkboxes.desmarcados.join(', ') || 'nenhum'}`, LOG_LEVELS.DEBUG);
    log(`   Selects: ${JSON.stringify(estadoFiltros.selects)}`, LOG_LEVELS.DEBUG);
    log(`   Radios selecionados: ${estadoFiltros.radios.join(', ') || 'nenhum'}`, LOG_LEVELS.DEBUG);
    
    // Salvar screenshot dos filtros para análise
    await saveDebugInfo(page, context, 'Pre-download: estado dos filtros');
    log('🔍 Debug de filtros salvo para análise', LOG_LEVELS.DEBUG);
    
    log('', LOG_LEVELS.INFO);
    log('✅ Todos os filtros obrigatórios configurados com sucesso!', LOG_LEVELS.SUCCESS);
    log('', LOG_LEVELS.INFO);
    
    // ============================================
    // ETAPA: DOWNLOAD (aguarda finalização do download e salva/copia)
    // ============================================
    // Ao capturar um objeto Download válido:
    // 1. download.path() aguarda a finalização do download
    // 2. Copiar arquivo temporário para o caminho final (rápido)
    // 3. Validação síncrona (existsSync + size > 0)
    // 4. Etapa DOWNLOAD finaliza imediatamente após salvar
    // ============================================
    setStep('DOWNLOAD');
    await notificarProgresso({ etapa_atual: 'DOWNLOAD' });
    
    // AUMENTAR timeout apenas durante download (55 minutos)
    log('Aumentando timeout para aguardar download longo...', LOG_LEVELS.DEBUG);
    context.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
    page.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
    
    const downloadDir = getDownloadDirectory();
    log(`Diretório de download: ${downloadDir}`);
    
    let dados = [];
    let nomeArquivoFinal = '';
    let downloadSucesso = false;
    
    for (let tentativaDownload = 1; tentativaDownload <= LIMITS.MAX_DOWNLOAD_RETRIES && !downloadSucesso; tentativaDownload++) {
      log(`Tentativa de download ${tentativaDownload}/${LIMITS.MAX_DOWNLOAD_RETRIES}...`);
      
      try {
        // Garantir seleção de Excel
        await selecionarFormaExibicaoEmExcel(page);
        await page.waitForTimeout(1000);
        
        // Gerar nome semântico ANTES do download
        const semanticName = generateSemanticFilename('Cobranca_Hinova', inicio, fim);
        nomeArquivoFinal = semanticName;
        
        // Iniciar captura híbrida ANTES do clique
        // NOTA: o watcher captura o objeto Download e então aguarda a finalização real
        // do download antes de salvar/copiar para o destino.
        log('Iniciando estratégia híbrida de captura de download...');
        
        // Criar a promessa de captura híbrida (com downloadDir e semanticName)
        const capturaHibridaPromise = aguardarDownloadHibrido(
          context, 
          page, 
          downloadDir, 
          semanticName, 
          TIMEOUTS.DOWNLOAD_TOTAL
        );
        
        // Clicar no botão Gerar
        log('Clicando em Gerar Relatório...');
        
        const clicarGerarEmQualquerFrame = async () => {
          const tentarNoFrame = async (frame) => {
            // Tentar botão por role
            const byRole = frame.getByRole('button', { name: /gerar/i });
            const count = await byRole.count().catch(() => 0);
            for (let i = 0; i < count; i++) {
              const el = byRole.nth(i);
              const visible = await el.isVisible().catch(() => false);
              if (!visible) continue;
              
              const enabled = await el.isEnabled().catch(() => true);
              if (!enabled) continue;
              
              await el.click({ timeout: 15000, force: true });
              return `botão Gerar (frame: ${frame.url() || 'main'})`;
            }
            
            // Tentar inputs
            const inputs = frame.locator('input[type="submit"], input[type="button"], input[type="image"]');
            const ic = await inputs.count().catch(() => 0);
            for (let i = 0; i < ic; i++) {
              const el = inputs.nth(i);
              const visible = await el.isVisible().catch(() => false);
              if (!visible) continue;
              
              const value = (await el.getAttribute('value').catch(() => '')) || '';
              const alt = (await el.getAttribute('alt').catch(() => '')) || '';
              const label = `${value} ${alt}`.toLowerCase();
              if (label.includes('gerar')) {
                await el.click({ timeout: 15000, force: true });
                return `input Gerar (value="${value}")`;
              }
            }
            
            return null;
          };
          
          // Tentar no frame principal primeiro
          const mainClicked = await tentarNoFrame(page.mainFrame());
          if (mainClicked) return mainClicked;
          
          // Tentar em todos os frames
          for (const frame of page.frames()) {
            if (frame === page.mainFrame()) continue;
            const clicked = await tentarNoFrame(frame);
            if (clicked) return clicked;
          }
          
          return null;
        };
        
        const clickInfo = await clicarGerarEmQualquerFrame();
        if (!clickInfo) {
          await saveDebugInfo(page, context, 'Botão Gerar não encontrado');
          throw new Error('Botão "Gerar" não encontrado');
        }
        
        log(`Clicou: ${clickInfo}`, LOG_LEVELS.SUCCESS);
        
        // ===== AGUARDAR RESULTADO - ARQUIVO JÁ ESTÁ SALVO =====
        // A função aguardarDownloadHibrido retorna com o arquivo JÁ SALVO
        // Nenhum await de página, popup, response ou watcher ocorre após a captura
        log(`Aguardando captura híbrida (timeout: ${TIMEOUTS.DOWNLOAD_TOTAL / 60000} min)...`);
        
        const result = await capturaHibridaPromise;
        
        if (!result.success) {
          // Salvar debug antes de lançar erro
          await saveDebugInfo(page, context, result.error?.message || 'Nenhum download capturado');
          throw result.error || new Error('Download falhou - nenhuma estratégia capturou o arquivo');
        }
        
        // ===== ARQUIVO JÁ ESTÁ SALVO - LOGS NA SEQUÊNCIA CORRETA =====
        // Os logs já foram emitidos dentro do watcher:
        // 1. "Download capturado"
        // 2. "Salvando arquivo"
        // 3. "Arquivo salvo com sucesso"
        
        log(`Download finalizado via estratégia: ${result.source}`, LOG_LEVELS.SUCCESS);
        log(`Arquivo: ${result.filePath} (${(result.size / 1024).toFixed(2)} KB)`, LOG_LEVELS.INFO);
        
        // Validar arquivo via magic bytes (não lê como texto)
        const validation = validateDownloadedFile(result.filePath, result.contentType || '');
        if (!validation.valid) {
          throw new Error(`Arquivo inválido: ${validation.error}`);
        }
        
        if (validation.isHtml) {
          log(`Validação OK: HTML disfarçado de Excel (${formatBytes(validation.size)})`, LOG_LEVELS.SUCCESS);
        } else {
          log(`Validação OK: ${validation.fileType.toUpperCase()} (${formatBytes(validation.size)})`, LOG_LEVELS.SUCCESS);
        }
        
        // Processar arquivo (detecta formato automaticamente - async para streaming)
        dados = await processarArquivo(result.filePath);

        // ============================================
        // FALLBACK: Calcular campos críticos se o portal não preencheu
        // (Hinova às vezes exporta colunas vazias mesmo com layout BI)
        // ============================================
        const aplicarFallbacks = (rows) => {
          const DIA_VENC_PADRAO = 'Dia Vencimento Veiculo';
          const DIAS_ATRASO_PADRAO = 'Qtde Dias em Atraso Vencimento Original';

          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);

          const findKey = (row, predicate) => {
            return Object.keys(row).find((k) => predicate(k.toLowerCase())) || null;
          };

          const parseDateToDate = (value) => {
            if (!value) return null;
            const strData = String(value).trim();
            // DD/MM/YYYY
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(strData)) {
              const [d, m, y] = strData.split('/');
              const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
              return isNaN(dt.getTime()) ? null : dt;
            }
            // YYYY-MM-DD (ou YYYY-MM-DDTHH...)
            if (/^\d{4}-\d{2}-\d{2}/.test(strData)) {
              const [y, m, d] = strData.split('T')[0].split('-');
              const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
              return isNaN(dt.getTime()) ? null : dt;
            }
            return null;
          };

          for (const row of rows) {
            // Chaves fonte (tanto com espaço quanto underscore)
            const dataVencKey =
              findKey(row, (k) =>
                (k === 'data vencimento' || k === 'data_vencimento' || k.includes('data vencimento')) &&
                !k.includes('original')
              ) ||
              null;
            const dataVencOrigKey =
              findKey(row, (k) => k.includes('data vencimento original') || k.includes('data_vencimento_original')) ||
              null;
            const dataPagKey =
              findKey(row, (k) => k.includes('data pagamento') || k.includes('data_pagamento')) ||
              null;

            // 1) Dia Vencimento Veículo
            const diaVencKey =
              findKey(row, (k) => k.includes('dia vencimento veiculo') || k.includes('dia_vencimento_veiculo')) ||
              DIA_VENC_PADRAO;

            if (!(diaVencKey in row)) row[diaVencKey] = null;
            const valorDiaVenc = row[diaVencKey];

            if ((valorDiaVenc === null || valorDiaVenc === undefined || String(valorDiaVenc).trim() === '') && (dataVencKey || dataVencOrigKey)) {
              const base = dataVencKey ? row[dataVencKey] : row[dataVencOrigKey];
              const dt = parseDateToDate(base);
              if (dt) {
                const dia = dt.getDate();
                if (dia >= 1 && dia <= 31) row[diaVencKey] = dia;
              }
            }

            // 2) Dias em Atraso
            // IMPORTANTE: o portal às vezes nem exporta essa coluna; então criamos sempre a chave padrão.
            const diasAtrasoKey =
              findKey(row, (k) => k.includes('dias') && k.includes('atraso')) ||
              DIAS_ATRASO_PADRAO;

            if (!(diasAtrasoKey in row)) row[diasAtrasoKey] = null;
            const valorDiasAtraso = row[diasAtrasoKey];

            // Pago => atraso 0
            const temPagamento = !!(dataPagKey && row[dataPagKey] && String(row[dataPagKey]).trim() !== '');
            if (temPagamento) {
              if (valorDiasAtraso === null || valorDiasAtraso === undefined || String(valorDiasAtraso).trim() === '') {
                row[diasAtrasoKey] = 0;
              }
              continue;
            }

            // Não pago => diferença (preferir vencimento original; senão usar vencimento)
            // Se ainda não venceu (data futura), dias em atraso = 0
            if (valorDiasAtraso === null || valorDiasAtraso === undefined || String(valorDiasAtraso).trim() === '') {
              const base = dataVencOrigKey ? row[dataVencOrigKey] : dataVencKey ? row[dataVencKey] : null;
              const dt = parseDateToDate(base);
              if (dt) {
                dt.setHours(0, 0, 0, 0);
                const diffMs = hoje.getTime() - dt.getTime();
                const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                // Se diffDias <= 0, ainda não venceu => atraso = 0
                row[diasAtrasoKey] = diffDias > 0 ? diffDias : 0;
              } else {
                // Sem data de referência, assume 0
                row[diasAtrasoKey] = 0;
              }
            }
          }

          return rows;
        };
        
        // Aplicar fallbacks antes de validar
        dados = aplicarFallbacks(dados);
        log(`✅ Fallbacks aplicados: campos críticos calculados quando vazios`, LOG_LEVELS.SUCCESS);

        // ============================================
        // VALIDAÇÃO: Verificar se os campos agora estão preenchidos
        // (após fallbacks, deve ter pelo menos alguns registros com valores)
        // ============================================
        const validarCamposCriticos = (rows) => {
          const total = Array.isArray(rows) ? rows.length : 0;
          if (!Array.isArray(rows) || total === 0) {
            return { ok: false, total, comDiaVenc: 0, comDiasAtraso: 0, headers: [] };
          }

          const headers = Object.keys(rows[0] || {});
          
          // Buscar chaves dinamicamente (podem variar entre portais)
          const chaveDiaVenc = headers.find(h => 
            h.toLowerCase().includes('dia vencimento veiculo') || 
            h.toLowerCase().includes('dia_vencimento_veiculo')
          );
          const chaveDiasAtraso = headers.find(h => 
            h.toLowerCase().includes('dias') && h.toLowerCase().includes('atraso')
          );

          let comDiaVenc = 0;
          let comDiasAtraso = 0;

          for (const r of rows) {
            if (chaveDiaVenc) {
              const v1 = r?.[chaveDiaVenc];
              if (v1 !== null && v1 !== undefined && String(v1).trim() !== '') comDiaVenc++;
            }
            if (chaveDiasAtraso) {
              const v2 = r?.[chaveDiasAtraso];
              if (v2 !== null && v2 !== undefined && String(v2).trim() !== '') comDiasAtraso++;
            }
          }

          // Critério relaxado: se as colunas existem E temos pelo menos 50% preenchido, OK
          // (após fallbacks, deve ter muito mais que isso)
          const minRequired = Math.max(1, Math.floor(total * 0.1)); // 10% mínimo
          const ok = comDiaVenc >= minRequired || comDiasAtraso >= minRequired;
          return { ok, total, comDiaVenc, comDiasAtraso, headers, chaveDiaVenc, chaveDiasAtraso };
        };

        const valida = validarCamposCriticos(dados);
        log(
          `📊 Validação de colunas BI: total=${valida.total}, comDiaVenc=${valida.comDiaVenc}, comDiasAtraso=${valida.comDiasAtraso}`,
          valida.ok ? LOG_LEVELS.SUCCESS : LOG_LEVELS.WARN
        );

        // Apenas logar warning se colunas estão vazias após fallback, mas não bloquear
        if (!valida.ok && valida.total > 0) {
          log(`⚠️ Poucos registros com colunas BI preenchidas. Headers: ${valida.headers.slice(0, 15).join(' | ')}`, LOG_LEVELS.WARN);
          log(`   Colunas detectadas: DiaVenc="${valida.chaveDiaVenc || 'N/A'}", DiasAtraso="${valida.chaveDiasAtraso || 'N/A'}"`, LOG_LEVELS.WARN);
          // Não bloquear - os fallbacks devem ter calculado, se não calculou é porque faltam dados fonte
        }

        downloadSucesso = true;
        
        // Fechar abas extras (APÓS o download ser salvo com sucesso)
        await closeExtraPages(context, page);
        
      } catch (downloadError) {
        log(`Erro no download (tentativa ${tentativaDownload}): ${downloadError.message}`, LOG_LEVELS.ERROR);
        await saveDebugInfo(page, context, downloadError.message);
        
        if (tentativaDownload < LIMITS.MAX_DOWNLOAD_RETRIES) {
          log('Preparando nova tentativa...', LOG_LEVELS.INFO);
          await page.waitForTimeout(5000);
          await fecharPopups(page);
          await closeExtraPages(context, page);
          
          const urlAtual = page.url();
          if (!urlAtual.includes('relatorioBoleto')) {
            log('Recarregando página de relatório...');
            await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
              waitUntil: 'domcontentloaded',
              timeout: TIMEOUTS.PAGE_LOAD
            });
            await fecharPopups(page);
            await page.waitForTimeout(3000);
            
            // Re-preencher filtros
            const dataInicioInput = await page.$('input[name*="data_inicio"], input[name*="vencimento_inicial"], input[name*="dt_vencimento_original_ini"]');
            if (dataInicioInput) await dataInicioInput.fill(inicio);
            
            const dataFimInput = await page.$('input[name*="data_fim"], input[name*="vencimento_final"], input[name*="dt_vencimento_original_fim"]');
            if (dataFimInput) await dataFimInput.fill(fim);
          }
        }
      }
    }
    
    if (!downloadSucesso) {
      await saveDebugInfo(page, context, 'Download falhou após todas as tentativas');
      throw new Error('Download falhou após todas as tentativas');
    }
    
    log(`Total de registros: ${dados.length}`, LOG_LEVELS.SUCCESS);
    
    if (dados.length === 0) {
      log('Nenhum dado encontrado no Excel!', LOG_LEVELS.WARN);
      await saveDebugInfo(page, context, 'Excel vazio');
      return false;
    }
    
    // ============================================
    // ETAPA: ENVIO PARA WEBHOOK (mês atual)
    // ============================================
    await notificarProgresso({ etapa_atual: 'ENVIANDO' });
    const sucesso = await enviarWebhook(dados, nomeArquivoFinal, {
      mesReferencia: periodoPrincipal.mesReferencia,
      modo: periodoPrincipal.modo,
    });
    
    // ============================================
    // LIMPEZA: REMOVER ARQUIVO TEMPORÁRIO APÓS USO
    // ============================================
    try {
      const downloadFilePath = path.join(downloadDir, nomeArquivoFinal);
      if (fs.existsSync(downloadFilePath)) {
        fs.unlinkSync(downloadFilePath);
        log(`Arquivo temporário removido: ${nomeArquivoFinal}`, LOG_LEVELS.DEBUG);
      }
    } catch (cleanupError) {
      log(`Aviso: não foi possível remover arquivo temporário: ${cleanupError.message}`, LOG_LEVELS.WARN);
    }
    
    // ============================================
    // ETAPA: ATUALIZAR MÊS ANTERIOR (se dia <= 5)
    // ============================================
    const periodoAnterior = periodos.find(p => p.modo === 'atualizar_anterior');
    if (periodoAnterior && sucesso) {
      log('', LOG_LEVELS.INFO);
      log('═'.repeat(60), LOG_LEVELS.INFO);
      log('📅 ATUALIZANDO RELATÓRIO DO MÊS ANTERIOR', LOG_LEVELS.INFO);
      log(`   Período: ${periodoAnterior.inicio} até ${periodoAnterior.fim}`, LOG_LEVELS.INFO);
      log(`   Mês referência: ${periodoAnterior.mesReferencia}`, LOG_LEVELS.INFO);
      log('═'.repeat(60), LOG_LEVELS.INFO);
      
      try {
        setStep('MES_ANTERIOR_NAVEGACAO');
        await notificarProgresso({ etapa_atual: 'ATUALIZANDO_MES_ANTERIOR' });
        
        // Navegar de volta para a página de relatório
        await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUTS.PAGE_LOAD
        });
        await fecharPopups(page);
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await fecharPopups(page);
        
        // Preencher filtros com datas do mês anterior
        setStep('MES_ANTERIOR_FILTROS');
        log(`Preenchendo Data Vencimento Original: ${periodoAnterior.inicio} até ${periodoAnterior.fim}`);
        
        const preencheuDatasAnterior = await page.evaluate(({ inicio, fim }) => {
          const resultado = { sucesso: false };
          const todosElementos = document.querySelectorAll('td, th, label, span, div');
          
          for (const elemento of todosElementos) {
            const texto = elemento.textContent?.trim() || '';
            if (texto === 'Data Vencimento Original:' || texto === 'Data Vencimento Original') {
              const linha = elemento.closest('tr');
              if (linha) {
                const inputs = linha.querySelectorAll('input[type="text"], input:not([type])');
                if (inputs.length >= 2) {
                  inputs[0].value = inicio;
                  inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                  inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
                  inputs[1].value = fim;
                  inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
                  inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
                  resultado.sucesso = true;
                  return resultado;
                }
              }
              const container = elemento.parentElement;
              const inputs = container?.querySelectorAll('input[type="text"], input:not([type])');
              if (inputs && inputs.length >= 2) {
                inputs[0].value = inicio;
                inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
                inputs[1].value = fim;
                inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
                inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
                resultado.sucesso = true;
                return resultado;
              }
            }
          }
          return resultado;
        }, { inicio: periodoAnterior.inicio, fim: periodoAnterior.fim });
        
        if (!preencheuDatasAnterior.sucesso) {
          log('❌ Não foi possível preencher datas do mês anterior - pulando', LOG_LEVELS.WARN);
        } else {
          log(`✅ Datas do mês anterior preenchidas: ${periodoAnterior.inicio} até ${periodoAnterior.fim}`, LOG_LEVELS.SUCCESS);
          
          // Re-configurar filtros (situação, layout, etc.)
          await configurarCheckboxesSituacaoBoleto(page);
          await page.waitForTimeout(1000);
          
          // Gerar relatório e baixar (reutilizar lógica de download existente)
          setStep('MES_ANTERIOR_DOWNLOAD');
          
          // Clicar em Gerar/Excel
          let downloadAnteriorSucesso = false;
          let dadosAnterior = [];
          
          // Tentar gerar o relatório - mesma lógica simplificada
          try {
            const btnGerar = await page.$('input[value*="Gerar"], button:has-text("Gerar"), input[type="submit"][value*="Gerar"]');
            if (btnGerar) {
              // Timeout longo para download
              page.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
              context.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
              
              const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: TIMEOUTS.DOWNLOAD_EVENT }).catch(() => null),
                btnGerar.click({ force: true }),
              ]);
              
              if (download) {
                const nomeArquivoAnterior = `Hinova_MesAnterior_${periodoAnterior.mesReferencia}.xls`;
                const downloadDirAnterior = path.resolve(CONFIG.DOWNLOAD_BASE_DIR, `anterior_${Date.now()}`);
                if (!fs.existsSync(downloadDirAnterior)) fs.mkdirSync(downloadDirAnterior, { recursive: true });
                const filePathAnterior = path.join(downloadDirAnterior, nomeArquivoAnterior);
                
                await download.saveAs(filePathAnterior);
                
                if (fs.existsSync(filePathAnterior) && fs.statSync(filePathAnterior).size > LIMITS.MIN_FILE_SIZE_BYTES) {
                  log(`Download mês anterior: ${formatBytes(fs.statSync(filePathAnterior).size)}`, LOG_LEVELS.SUCCESS);
                  
                  // Parse Excel
                  const workbook = XLSX.readFile(filePathAnterior, { type: 'file', cellDates: true });
                  const sheetName = workbook.SheetNames[0];
                  dadosAnterior = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
                  
                  downloadAnteriorSucesso = dadosAnterior.length > 0;
                  log(`Mês anterior: ${dadosAnterior.length} registros encontrados`, LOG_LEVELS.SUCCESS);
                  
                  // Limpar arquivo temporário
                  try { fs.unlinkSync(filePathAnterior); } catch {}
                  try { fs.rmdirSync(downloadDirAnterior); } catch {}
                }
              }
              
              // Restaurar timeouts
              page.setDefaultTimeout(30000);
              context.setDefaultTimeout(30000);
            }
          } catch (downloadErr) {
            log(`Erro ao baixar mês anterior: ${downloadErr.message}`, LOG_LEVELS.WARN);
            page.setDefaultTimeout(30000);
            context.setDefaultTimeout(30000);
          }
          
          // Enviar dados do mês anterior
          if (downloadAnteriorSucesso && dadosAnterior.length > 0) {
            setStep('MES_ANTERIOR_ENVIO');
            const nomeArquivoAnterior = `Hinova_Boletos_${periodoAnterior.mesReferencia}.json`;
            await enviarWebhook(dadosAnterior, nomeArquivoAnterior, {
              mesReferencia: periodoAnterior.mesReferencia,
              modo: 'atualizar_anterior',
            });
            log('✅ Mês anterior atualizado com sucesso!', LOG_LEVELS.SUCCESS);
          } else {
            log('⚠️ Não foi possível atualizar mês anterior (sem dados ou download falhou)', LOG_LEVELS.WARN);
          }
        }
      } catch (anteriorError) {
        log(`Erro ao atualizar mês anterior: ${anteriorError.message}`, LOG_LEVELS.WARN);
        // Não falhar a execução por causa do mês anterior
      }
    }
    
    return sucesso;
    
  } catch (error) {
    log(`ERRO CRÍTICO: ${error.message}`, LOG_LEVELS.ERROR);
    if (page && context) {
      await saveDebugInfo(page, context, error.message);
    }
    throw error;
    
  } finally {
    // ============================================
    // ENCERRAMENTO LIMPO
    // ============================================
    setStep('ENCERRAMENTO');
    
    try {
      if (context) {
        await closeExtraPages(context, page);
      }
      
      if (browser) {
        await browser.close();
        log('Browser fechado', LOG_LEVELS.SUCCESS);
      }
    } catch (e) {
      log(`Erro ao fechar browser: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    log('='.repeat(60));
    log('ROBÔ FINALIZADO');
    log('='.repeat(60));
  }
}

// ============================================
// NOTIFICAR ERRO VIA WEBHOOK
// ============================================
async function notificarErro(mensagem) {
  if (!CONFIG.WEBHOOK_URL || !CONFIG.CORRETORA_ID) return;
  
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.WEBHOOK_SECRET) headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;
    
    await axios.post(CONFIG.WEBHOOK_URL, {
      action: 'error',
      corretora_id: CONFIG.CORRETORA_ID,
      execucao_id: CONFIG.EXECUCAO_ID || null,
      error_message: mensagem,
    }, { headers, timeout: 30000 });
    
    log('Erro notificado ao servidor', LOG_LEVELS.DEBUG);
  } catch (e) {
    log(`Erro ao notificar falha: ${e.message}`, LOG_LEVELS.WARN);
  }
}

// ============================================
// EXECUÇÃO
// ============================================
rodarRobo()
  .then((sucesso) => {
    if (sucesso) {
      log('Execução concluída com sucesso!', LOG_LEVELS.SUCCESS);
      process.exit(0);
    } else {
      log('Execução concluída com avisos', LOG_LEVELS.WARN);
      notificarErro('Execução concluída com avisos').finally(() => process.exit(1));
    }
  })
  .catch(async (error) => {
    log(`Execução falhou: ${error.message}`, LOG_LEVELS.ERROR);
    await notificarErro(error.message);
    process.exit(1);
  });
