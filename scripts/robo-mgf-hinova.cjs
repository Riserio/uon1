#!/usr/bin/env node
/**
 * Robô de Automação - MGF Hinova (Lançamentos Financeiros)
 * ========================================================
 * 
 * CÓPIA IDÊNTICA DO ROBÔ DE COBRANÇA, ALTERANDO APENAS:
 * - URL do relatório (MGF)
 * - Seleção de Centro de Custo (apenas EVENTOS)
 * - Layout BI VANGARD FINANCEIROS EVENTOS
 * - Range de datas (01/01/2000 até hoje)
 * - Nome do arquivo (MGF)
 * 
 * REQUISITOS:
 * -----------
 * npm install playwright axios xlsx
 * npx playwright install chromium
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
// CONFIGURAÇÃO - IDÊNTICA À COBRANÇA
// ============================================

// URL de LOGIN: usar variável de ambiente ou default
const HINOVA_LOGIN_URL = process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php';

// Centros de Custo permitidos (EXATAMENTE esses)
const CENTROS_CUSTO_PERMITIDOS = [
  'EVENTOS',
  'EVENTOS NAO PROVISIONADO',
  'EVENTOS RATEAVEIS',
];

// Função para derivar URL do relatório MGF a partir da URL de login
function deriveMGFRelatorioUrl(loginUrl) {
  try {
    const url = new URL(loginUrl);
    // Extrai o caminho base (ex: /sga/sgav4_asspas/v5/login.php -> /sga/sgav4_asspas/)
    const pathParts = url.pathname.split('/').filter(p => 
      p && !p.includes('login') && !p.includes('Principal') && p !== 'v5'
    );
    const basePath = '/' + pathParts.join('/');
    return `${url.origin}${basePath}/v5/Sgfrelatorio/lancamento`;
  } catch (e) {
    // Fallback
    return 'https://sga.hinova.com.br/sga/sgav4_asspas/v5/Sgfrelatorio/lancamento';
  }
}

const CONFIG = {
  // URL de login (dinâmica - vem da variável de ambiente)
  HINOVA_URL: HINOVA_LOGIN_URL,
  // URL do relatório MGF derivada dinamicamente da URL de login
  HINOVA_RELATORIO_URL: process.env.HINOVA_RELATORIO_URL || deriveMGFRelatorioUrl(HINOVA_LOGIN_URL),
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  HINOVA_CODIGO_CLIENTE: process.env.HINOVA_CODIGO_CLIENTE || '2363',
  HINOVA_LAYOUT: process.env.HINOVA_LAYOUT || 'BI VANGARD FINANCEIROS EVENTOS',
  
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  
  CORRETORA_ID: process.env.CORRETORA_ID || '',
  EXECUCAO_ID: process.env.EXECUCAO_ID || '',
  GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || '',
  GITHUB_RUN_URL: process.env.GITHUB_RUN_URL || '',
  
  DOWNLOAD_BASE_DIR: process.env.DOWNLOAD_DIR || './downloads',
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

// ============================================
// SELEÇÃO DE LAYOUT/SISTEMA NA TELA DE LOGIN
// (Idêntico ao robô de Cobrança)
// ============================================
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

  // 3) Fallback: se houver 4+ inputs visíveis, preencher o último (o replay mostra um campo extra de layout)
  try {
    const ok = await page
      .evaluate(({ layout }) => {
        const isVisible = (el) => {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };

        const inputs = Array.from(
          document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])')
        ).filter(isVisible);

        if (inputs.length < 4) return false;

        // Preferir o último input vazio (muito comum ser o campo de layout)
        const candidate = [...inputs].reverse().find((i) => !i.value);
        if (!candidate) return false;
        candidate.value = layout;
        candidate.dispatchEvent(new Event('input', { bubbles: true }));
        candidate.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, { layout: CONFIG.HINOVA_LAYOUT })
      .catch(() => false);

    if (ok) {
      log(`Layout preenchido via fallback (último input): ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.DEBUG);
      return true;
    }
  } catch {}

  return false;
}

// ============================================
// CONSTANTES DE TIMEOUT E CONTROLE
// ============================================
const TIMEOUTS = {
  PAGE_LOAD: 90000,
  LOGIN_RETRY_WAIT: 8000,
  DOWNLOAD_EVENT: 3 * 60000,
  DOWNLOAD_TOTAL: 55 * 60000,   // 55 min - servidor MGF leva 30-40 min para gerar relatório de 255MB
  DOWNLOAD_SAVE: 55 * 60000,
  DOWNLOAD_IDLE: 55 * 60000,
  DOWNLOAD_HARD: 55 * 60000,
  POPUP_CLOSE: 800,
  FILE_PROGRESS_INTERVAL: 5000,
};

const LIMITS = {
  MAX_LOGIN_RETRIES: 20,
  MAX_DOWNLOAD_RETRIES: 1,       // Sem retries - relatório de 255MB consome todo o tempo do GitHub Actions (60 min)
  MAX_POPUP_CLOSE_ATTEMPTS: 10,
  MAX_LOOP_ITERATIONS: 100,
  MIN_FILE_SIZE_BYTES: 100,
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

function monitorFileProgress(filePath, expectedSize = 0, intervalMs = TIMEOUTS.FILE_PROGRESS_INTERVAL) {
  const startTime = Date.now();
  let lastLoggedPercent = -1;
  let lastSize = 0;
  
  const interval = setInterval(() => {
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
          
          if (size === lastSize && elapsed > 10) continue;
          lastSize = size;
          
          if (expectedSize > 0) {
            const pct = Math.min(100, Math.floor((size / expectedSize) * 100));
            if (pct >= lastLoggedPercent + 5 || lastLoggedPercent === -1) {
              lastLoggedPercent = pct;
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
          return;
        }
      } catch {
        // Arquivo pode estar sendo escrito
      }
    }
  }, intervalMs);
  
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
  out['accept-encoding'] = 'identity';
  return out;
}

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

  let receivedBytes = 0;
  let lastLoggedPercent = -1;
  let lastLoggedAt = 0;

  const logProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastLoggedAt < 15000) return;
    lastLoggedAt = now;

    const elapsedSec = Math.max(1, Math.floor((now - startedAt) / 1000));
    const speed = receivedBytes / elapsedSec;

    if (expectedBytes > 0) {
      const pct = Math.min(100, Math.floor((receivedBytes / expectedBytes) * 100));
      if (!force && pct < lastLoggedPercent + 5) return;
      lastLoggedPercent = pct;
      const barSize = 20;
      const filled = Math.round((pct / 100) * barSize);
      const empty = barSize - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      log(`   ⬇️ Download [${bar}] ${pct}% (${formatBytes(receivedBytes)} / ${formatBytes(expectedBytes)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
    } else {
      log(`   ⬇️ Download: ${formatBytes(receivedBytes)} recebidos • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
    }
  };

  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    idleTimer = null;
    hardTimer = null;
  };

  try {
    log(`Iniciando download HTTP stream: ${method} ${url.substring(0, 80)}...`, LOG_LEVELS.DEBUG);
    
    const response = await axios({
      url,
      method,
      headers,
      data,
      responseType: 'stream',
      maxRedirects: 10,
      timeout: 0,
      signal: abortController.signal,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const contentLengthHeader = response.headers?.['content-length'];
    const responseLen = parseInt(contentLengthHeader || '0', 10);
    if (!expectedBytes && responseLen > 0) expectedBytes = responseLen;

    if (expectedBytes > 0) {
      log(`Tamanho esperado: ${formatBytes(expectedBytes)}`, LOG_LEVELS.DEBUG);
    } else {
      log(`Tamanho desconhecido (streaming sem content-length)`, LOG_LEVELS.DEBUG);
    }

    const writeStream = fs.createWriteStream(tempFilePath, {
      highWaterMark: 8 * 1024 * 1024,
    });

    const progressTransform = new Transform({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        resetIdleTimer();
        logProgress(false);
        callback(null, chunk);
      },
      highWaterMark: 8 * 1024 * 1024,
    });

    await pipeline(
      response.data,
      progressTransform,
      writeStream
    );

    logProgress(true);
    clearTimers();

    if (!fs.existsSync(tempFilePath)) {
      throw new Error('FALHA: Arquivo temporário não existe após streaming HTTP');
    }
    const stats = fs.statSync(tempFilePath);
    if (stats.size <= 0) {
      throw new Error(`FALHA: Arquivo temporário vazio (${stats.size} bytes)`);
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFilePath, filePath);

    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    log(`Download HTTP concluído: ${formatBytes(stats.size)} em ${elapsedSec}s`, LOG_LEVELS.SUCCESS);

    return { filePath, size: stats.size };

  } catch (error) {
    clearTimers();
    
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

function generateSemanticFilename() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  
  return `MGF_${day}${month}${year}.xlsx`;
}

// ============================================
// SALVAMENTO DE DIAGNÓSTICO
// ============================================
async function saveDebugInfo(page, context, errorMessage = null) {
  const debugDir = getDebugDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  try {
    const screenshotPath = path.join(debugDir, `screenshot_${currentStep}_${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Screenshot salvo: ${screenshotPath}`, LOG_LEVELS.DEBUG);
    
    const htmlPath = path.join(debugDir, `page_${currentStep}_${timestamp}.html`);
    const html = await page.content().catch(() => 'Erro ao obter HTML');
    fs.writeFileSync(htmlPath, html);
    log(`HTML salvo: ${htmlPath}`, LOG_LEVELS.DEBUG);
    
    const urlPath = path.join(debugDir, `url_${currentStep}_${timestamp}.txt`);
    const urlInfo = `URL: ${page.url()}\nTimestamp: ${new Date().toISOString()}\nStep: ${currentStep}\nError: ${errorMessage || 'N/A'}`;
    fs.writeFileSync(urlPath, urlInfo);
    
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
const MAX_EXPECTED_FILE_SIZE = 50 * 1024 * 1024;

const FILE_SIGNATURES = {
  XLSX: [0x50, 0x4B, 0x03, 0x04],
  XLS: [0xD0, 0xCF, 0x11, 0xE0],
  HTML_DOCTYPE: [0x3C, 0x21, 0x44, 0x4F],
  HTML_TAG: [0x3C, 0x68, 0x74, 0x6D],
  HTML_TAG_UPPER: [0x3C, 0x48, 0x54, 0x4D],
};

function detectFileType(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    
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
    
    if (buffer[0] === 0x3C) {
      return { type: 'html', binary: false };
    }
    
    return { type: 'unknown', binary: true };
  } catch (e) {
    log(`Erro ao detectar tipo de arquivo: ${e.message}`, LOG_LEVELS.WARN);
    return { type: 'unknown', binary: true };
  }
}

function validateDownloadedFile(filePath, contentType = '') {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Arquivo não existe', isErrorPage: false };
  }
  
  const stats = fs.statSync(filePath);
  
  if (stats.size < LIMITS.MIN_FILE_SIZE_BYTES) {
    return { valid: false, error: `Arquivo muito pequeno: ${stats.size} bytes`, isErrorPage: false };
  }
  
  if (stats.size > MAX_EXPECTED_FILE_SIZE) {
    log(`⚠️ ATENÇÃO: Arquivo muito grande (${formatBytes(stats.size)}) - pode indicar filtros não aplicados`, LOG_LEVELS.WARN);
  }
  
  const fileType = detectFileType(filePath);
  
  const contentTypeLower = String(contentType).toLowerCase();
  const isExcelContentType = contentTypeLower.includes('excel') || 
                             contentTypeLower.includes('spreadsheet') ||
                             contentTypeLower.includes('vnd.ms-excel');
  
  log(`Tipo detectado: ${fileType.type} (content-type: ${contentType || 'não informado'})`, LOG_LEVELS.DEBUG);
  
  if (fileType.type === 'html') {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(10240, stats.size));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    
    const content = buffer.toString('utf-8').toLowerCase();
    
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
    
    const hasTableStructure = content.includes('<table') && content.includes('<tr');
    
    if (!hasTableStructure) {
      log(`⚠️ HTML sem estrutura de tabela detectado`, LOG_LEVELS.WARN);
      if (stats.size < 50 * 1024) {
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
  
  if (fileType.type === 'xlsx' || fileType.type === 'xls') {
    return {
      valid: true,
      size: stats.size,
      isHtml: false,
      fileType: fileType.type,
      isErrorPage: false,
    };
  }
  
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
      
      // Detectar popup de suporte e fechar via ESC/CSS (sem clicar em botões)
      const popupSuporte = await page.evaluate(() => {
        const normalizar = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const modais = document.querySelectorAll('.modal, .modal-dialog, [role="dialog"], .popup, .overlay');
        
        for (const modal of modais) {
          const texto = normalizar(modal.textContent || '');
          if (texto.includes('suporte') || texto.includes('quanto tempo') || texto.includes('liberar')) {
            // Fechar via CSS para não disparar navegação
            modal.style.display = 'none';
            const backdrop = document.querySelector('.modal-backdrop, .overlay-backdrop');
            if (backdrop) backdrop.remove();
            return true;
          }
        }
        return false;
      }).catch(() => false);
      
      if (popupSuporte) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
        log('Popup de suporte fechado via ESC/CSS', LOG_LEVELS.DEBUG);
        popupFechado = true;
        continue;
      }
      
      // Seletores para fechar popups (IDÊNTICO AO COBRANÇA - inclui "Fechar")
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
      
      // Fallback via JavaScript - NÃO clicar em "Fechar", apenas remover modais via CSS
      if (!popupFechado) {
        const fechouViaJS = await page.evaluate(() => {
          let fechou = false;
          
          // NÃO clicar em "Fechar" - apenas fechar via close buttons ou remoção de CSS
          const modals = document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"]');
          modals.forEach(modal => {
            // Tentar apenas o X de fechar, não o botão "Fechar"
            const closeBtn = modal.querySelector('.close, button.close, .btn-close, [data-dismiss="modal"]:not(:has-text("Fechar"))');
            if (closeBtn) {
              closeBtn.click();
              fechou = true;
            } else {
              // Se não tem X, remover via CSS
              modal.style.display = 'none';
              fechou = true;
            }
          });
          
          if (!fechou) {
            const swalClose = document.querySelector('.swal2-close, .swal2-confirm');
            if (swalClose) {
              swalClose.click();
              fechou = true;
            }
          }
          
          // Remover backdrops
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
        
        for (const radio of radios) {
          const value = (radio.value || '').toLowerCase();
          const name = (radio.name || '').toLowerCase();
          
          if (value.includes('excel') || name.includes('excel') || value === 'xls' || value === 'xlsx') {
            if (setRadioChecked(radio)) {
              return { success: true, method: 'value', radioValue: radio.value };
            }
          }
        }
        
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

  if (await tryInFrame(page.mainFrame())) {
    return true;
  }

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
    if (this.captured) return false;
    this.captured = true;
    this.result = result;
    log(`Download capturado! Fonte: ${result.source}`, LOG_LEVELS.SUCCESS);
    log(`Cancelando todos os watchers...`, LOG_LEVELS.DEBUG);
    this.cleanup();
    return true;
  }
  
  setFileResult(fileResult) {
    this.fileResult = fileResult;
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
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
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
    let lastWebhookUpdate = 0;
    const WEBHOOK_INTERVAL = 60000; // Notificar DB a cada 60s
    
    this.monitorInterval = setInterval(async () => {
      if (this.captured || this.isComplete()) {
        clearInterval(this.monitorInterval);
        return;
      }
      const elapsed = Date.now() - this.startTime;
      const minutos = Math.floor(elapsed / 60000);
      const segundos = Math.floor((elapsed % 60000) / 1000);
      
      // Estimar progresso: servidor leva ~35min para gerar 255MB
      const estimatedServerTime = 35 * 60000;
      const progressPct = Math.min(95, Math.floor((elapsed / estimatedServerTime) * 100));
      
      log(`⏳ Aguardando servidor gerar relatório... ${minutos}m ${segundos}s (~${progressPct}%)`, LOG_LEVELS.INFO);
      
      // Notificar DB periodicamente para a UI mostrar progresso em tempo real
      if (Date.now() - lastWebhookUpdate >= WEBHOOK_INTERVAL) {
        lastWebhookUpdate = Date.now();
        notificarProgresso({
          etapa_atual: 'aguardando_geracao',
          progresso_download: progressPct,
          mensagem: `Servidor gerando relatório... ${minutos}m ${segundos}s`,
        }).catch(() => {});
      }
    }, 30000);
  }
}

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
    
    if (contentType.includes('spreadsheet') || 
        contentType.includes('excel') || 
        contentType.includes('vnd.ms-excel') ||
        contentType.includes('vnd.openxmlformats-officedocument.spreadsheetml')) {
      return true;
    }
    
    if (contentDisposition.includes('.xlsx') || contentDisposition.includes('.xls')) {
      return true;
    }
    
    if (url.includes('.xlsx') || url.includes('.xls')) {
      return true;
    }
    
    if (contentType.includes('octet-stream') && contentDisposition.includes('attachment')) {
      if (contentDisposition.includes('xls') || contentLength > 1000) {
        return true;
      }
    }
    
    if (contentType.includes('download') || contentType.includes('force-download')) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

function criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onResponse = async (response) => {
    if (controller.isCaptured()) return;
    
    if (isExcelResponse(response)) {
      const headers = response.headers() || {};
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const contentDisposition = String(headers['content-disposition'] || '');
      
      let fileName = semanticName;
      const fileNameMatch = contentDisposition.match(/filename[*]?=["']?([^"';\n]+)/i);
      if (fileNameMatch) {
        log(`Arquivo detectado via HTTP: ${fileNameMatch[1]}`, LOG_LEVELS.DEBUG);
      }
      
      if (controller.isCaptured()) {
        log(`Download já capturado via Playwright - ignorando HTTP stream`, LOG_LEVELS.DEBUG);
        return;
      }
      
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
        
        if (!fs.existsSync(filePath)) {
          throw new Error('FALHA: Arquivo não existe após salvamento HTTP');
        }
        
        const stats = fs.statSync(filePath);
        const contentTypeHeader = String(headers['content-type'] || '');

        if (contentLength > 0 && stats.size !== contentLength) {
          log(`⚠️ Tamanho difere: esperado ${contentLength}, recebido ${stats.size}`, LOG_LEVELS.WARN);
        }

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
  
  for (const p of context.pages()) {
    attachToPage(p);
  }
  
  context.on('page', onNewPage);
  
  controller.addCleanup(() => {
    try { context.removeListener('page', onNewPage); } catch {}
    for (const p of pagesAttached) {
      try { p.removeListener('response', onResponse); } catch {}
    }
  });
}

async function processarDownloadImediato(download, downloadDir, semanticName) {
  const filePath = path.join(downloadDir, semanticName);
  const suggestedName = download.suggestedFilename?.() || 'download.xlsx';

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
    // Ignorar
  }

  if (expectedSize > 0) {
    log(`Download capturado - Tamanho: ${formatBytes(expectedSize)}`, LOG_LEVELS.SUCCESS);
  } else {
    log(`Download capturado - Tamanho: desconhecido (streaming)`, LOG_LEVELS.SUCCESS);
  }

  log(`Salvando: ${suggestedName} -> ${filePath}`, LOG_LEVELS.INFO);

  log(`Aguardando transmissão do portal (saveAs)...`, LOG_LEVELS.DEBUG);
  log(`⏳ O portal pode demorar vários minutos para gerar o relatório...`, LOG_LEVELS.INFO);

  const stopMonitor = monitorFileProgress(filePath, expectedSize);
  const startTime = Date.now();

  const HEARTBEAT_INTERVAL = 15000;
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
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
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout de ${Math.floor(TIMEOUTS.DOWNLOAD_HARD / 60000)} minutos atingido aguardando download do portal`));
      }, TIMEOUTS.DOWNLOAD_HARD);
    });
    
    const savePromise = download.saveAs(filePath);
    
    await Promise.race([savePromise, timeoutPromise]);
    
    if (timeoutId) clearTimeout(timeoutId);
    
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  } finally {
    clearInterval(heartbeatInterval);
    stopMonitor();
  }

  if (!fs.existsSync(filePath)) {
    throw new Error('FALHA: Arquivo não existe após saveAs');
  }
  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`FALHA: Arquivo vazio (${stats.size} bytes)`);
  }

  if (expectedSize > 0 && stats.size !== expectedSize) {
    log(`⚠️ Tamanho difere: esperado ${formatBytes(expectedSize)}, recebido ${formatBytes(stats.size)}`, LOG_LEVELS.WARN);
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log(`Download concluído em ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`, LOG_LEVELS.SUCCESS);
  log(`Arquivo salvo com sucesso: ${semanticName} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
  log(`✅ Etapa DOWNLOAD concluída`, LOG_LEVELS.SUCCESS);
  return { filePath, size: stats.size };
}

function criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    
    const filename = download.suggestedFilename?.() || '';
    log(`✅ Download CAPTURADO via Playwright (globalDownload): ${filename}`, LOG_LEVELS.SUCCESS);
    
    const wasCaptured = controller.setCaptured({ 
      type: 'download', 
      download, 
      source: 'globalDownload' 
    });
    
    if (!wasCaptured) return;
    
    try {
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
  
  for (const p of context.pages()) {
    attachToPage(p);
  }
  
  context.on('page', onNewPage);
  
  controller.addCleanup(() => {
    try { context.removeListener('page', onNewPage); } catch {}
    for (const p of pagesAttached) {
      try { p.removeListener('download', onDownload); } catch {}
    }
  });
}

function criarWatcherDownloadPaginaPrincipal(context, page, controller, downloadDir, semanticName) {
  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    
    const filename = download.suggestedFilename?.() || '';
    log(`✅ Download CAPTURADO via Playwright (mainPage): ${filename}`, LOG_LEVELS.SUCCESS);
    
    const wasCaptured = controller.setCaptured({ 
      type: 'download', 
      download, 
      source: 'mainPage' 
    });
    
    if (!wasCaptured) return;
    
    try {
      log(`📥 Usando download.saveAs() - PRIORIDADE TOTAL para download do browser`, LOG_LEVELS.INFO);
      const result = await processarDownloadImediato(download, downloadDir, semanticName);
      controller.setFileResult(result);
    } catch (e) {
      log(`Erro ao salvar download via saveAs: ${e.message}`, LOG_LEVELS.ERROR);
      controller.setError(e);
    }
  };
  
  page.on('download', onDownload);
  
  controller.addCleanup(() => {
    try { page.removeListener('download', onDownload); } catch {}
  });
}

function criarWatcherNovaAba(context, mainPage, controller, downloadDir, semanticName) {
  const processarNovaAba = async (newPage) => {
    if (controller.isCaptured()) {
      try { await newPage.close(); } catch {}
      return;
    }
    
    try {
      log(`Nova aba detectada: configurando listener de download...`, LOG_LEVELS.DEBUG);
      
      let downloadFiredInTab = false;
      
      const onNewPageDownload = async (download) => {
        if (controller.isCaptured()) return;
        downloadFiredInTab = true;
        
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
          log(`📥 Usando download.saveAs() - PRIORIDADE TOTAL para download do browser`, LOG_LEVELS.INFO);
          const result = await processarDownloadImediato(download, downloadDir, semanticName);
          controller.setFileResult(result);
          
          newPage.close().catch(() => {});
        } catch (e) {
          log(`Erro ao salvar download via saveAs: ${e.message}`, LOG_LEVELS.ERROR);
          controller.setError(e);
        }
      };
      
      newPage.on('download', onNewPageDownload);
      
      let loadCompleted = false;
      const loadTimeout = setTimeout(() => { loadCompleted = true; }, 10000);
      
      const checkCaptured = setInterval(() => {
        if (controller.isCaptured()) {
          clearTimeout(loadTimeout);
          clearInterval(checkCaptured);
          loadCompleted = true;
        }
      }, 50);
      
      // Pre-polling: aguardar carregamento e procurar botões de download
      // Isolado em try/catch próprio para que o polling inline SEMPRE execute
      try {
        await Promise.race([
          newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }),
          new Promise(resolve => setTimeout(resolve, 8000)),
        ]).catch(() => {});
        
        clearTimeout(loadTimeout);
        clearInterval(checkCaptured);
        
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
      } catch (preErr) {
        log(`Erro pre-polling (ignorado, polling inline continuará): ${preErr.message}`, LOG_LEVELS.WARN);
        clearTimeout(loadTimeout);
        clearInterval(checkCaptured);
      }
      
      // =============================================
      // FALLBACK: Polling contínuo de conteúdo inline
      // O portal MGF pode levar muitos minutos para
      // gerar o relatório na nova aba. Verificamos
      // periodicamente (a cada 15s) se a aba contém
      // uma tabela HTML grande (relatório renderizado).
      // =============================================
      if (!controller.isCaptured() && !downloadFiredInTab) {
        const INLINE_POLL_INTERVAL = 15000; // 15 segundos
        const INLINE_POLL_MAX = TIMEOUTS.DOWNLOAD_HARD; // mesmo timeout do download
        const inlinePollStart = Date.now();
        
        log(`Iniciando polling de conteúdo inline na nova aba (a cada ${INLINE_POLL_INTERVAL / 1000}s, max ${Math.floor(INLINE_POLL_MAX / 60000)} min)...`, LOG_LEVELS.INFO);
        
        // Primeira verificação após 5s
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        while (!controller.isCaptured() && (Date.now() - inlinePollStart) < INLINE_POLL_MAX) {
          try {
            // Verificar se a aba ainda existe
            if (newPage.isClosed()) {
              log(`Nova aba foi fechada - parando polling inline`, LOG_LEVELS.DEBUG);
              break;
            }
            
            const pageContent = await newPage.content().catch(() => '');
            
            if (pageContent.length > 5000 && 
                (pageContent.includes('<table') || pageContent.includes('<TABLE')) &&
                (pageContent.includes('<tr') || pageContent.includes('<TR'))) {
              
              log(`📄 Nova aba contém tabela HTML grande (${(pageContent.length / 1024).toFixed(1)} KB) - capturando como relatório inline`, LOG_LEVELS.SUCCESS);
              
              const filePath = path.join(downloadDir, semanticName);
              fs.writeFileSync(filePath, pageContent, 'utf-8');
              
              const stats = fs.statSync(filePath);
              log(`✅ Conteúdo da aba salvo como arquivo: ${semanticName} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
              
              const wasCaptured = controller.setCaptured({
                type: 'inlineContent',
                source: 'newTabInline',
              });
              
              if (wasCaptured) {
                controller.setFileResult({ filePath, size: stats.size, contentType: 'text/html' });
                newPage.close().catch(() => {});
              }
              break;
            } else {
              const elapsed = Math.floor((Date.now() - inlinePollStart) / 1000);
              const mins = Math.floor(elapsed / 60);
              const secs = elapsed % 60;
              const tabUrl = await newPage.url().catch(() => 'unknown');
              log(`⏳ Polling inline: URL=${tabUrl}, ${pageContent.length} chars (sem tabela ainda) - ${mins}m ${secs}s`, LOG_LEVELS.DEBUG);
              if (pageContent.length > 1000) {
                log(`⏳ Polling inline: conteúdo parcial detectado (${pageContent.length} chars, threshold=5000)`, LOG_LEVELS.DEBUG);
              }
            }
          } catch (e) {
            log(`Erro ao verificar conteúdo inline da aba: ${e.message}`, LOG_LEVELS.WARN);
          }
          
          // Aguardar antes do próximo poll
          await new Promise(resolve => setTimeout(resolve, INLINE_POLL_INTERVAL));
        }
      }
      
      controller.addCleanup(() => {
        try { newPage.removeListener('download', onNewPageDownload); } catch {}
      });
      
    } catch (err) {
      log(`Erro no processamento da nova aba: ${err.message}`, LOG_LEVELS.ERROR);
    }
  };
  
  const onNewPage = (newPage) => {
    if (newPage !== mainPage) {
      processarNovaAba(newPage);
    }
  };
  
  context.on('page', onNewPage);
  
  controller.addCleanup(() => {
    try { context.removeListener('page', onNewPage); } catch {}
  });
}

async function aguardarDownloadHibrido(context, page, downloadDir, semanticName, timeoutMs) {
  log(`Iniciando captura de download...`, LOG_LEVELS.INFO);
  log(`Arquivo destino: ${path.join(downloadDir, semanticName)}`, LOG_LEVELS.DEBUG);
  log(`PRIORIDADE: Download Playwright (saveAs) > HTTP Stream (fallback)`, LOG_LEVELS.DEBUG);
  
  const controller = new DownloadController();
  
  criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName);
  criarWatcherDownloadPaginaPrincipal(context, page, controller, downloadDir, semanticName);
  criarWatcherNovaAba(context, page, controller, downloadDir, semanticName);
  criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName);
  
  controller.startProgressMonitor();
  
  return new Promise((resolve) => {
    let resolved = false;
    
    const doResolve = (result) => {
      if (resolved) return;
      resolved = true;
      controller.cleanup();
      resolve(result);
    };
    
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
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        log(`Timeout de ${timeoutMs / 60000} min - nenhum download capturado`, LOG_LEVELS.WARN);
        doResolve({ success: false, error: new Error('Timeout - nenhum download capturado') });
      }
    }, timeoutMs);
    
    controller.addCleanup(() => {
      clearTimeout(timeoutId);
    });
  });
}

// ============================================
// FUNÇÕES AUXILIARES - MGF
// ============================================
// MGF: NÃO PREENCHE PERÍODO - deixar em branco

// ============================================
// MAPEAMENTO DE COLUNAS MGF
// ============================================
// PASSTHROUGH MODE: O robô envia TODAS as colunas do relatório para o webhook.
// O webhook (webhook-mgf-hinova) possui o COLUMN_MAP completo e faz o mapeamento correto.
// Isso garante que campos como Protocolo Evento, Associado, Placa, Cooperativa etc. não se percam.
const PASSTHROUGH_MODE = true;

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

async function processarHtmlRelatorioStream(filePath) {
  setStep('PROCESSAMENTO_HTML');
  log(`Processando arquivo HTML via streaming: ${filePath}`, LOG_LEVELS.INFO);
  
  const startTime = Date.now();
  const fileSize = fs.statSync(filePath).size;
  log(`📂 Tamanho do arquivo: ${(fileSize / 1024 / 1024).toFixed(2)} MB`, LOG_LEVELS.DEBUG);
  
  const dados = [];
  let headersEncontrados = [];
  let headerMapping = [];
  let headerRowIndex = -1;
  let currentRowIndex = 0;
  let lastProgressLog = 0;
  let bytesProcessed = 0;
  
  const sampleRows = [];
  const MAX_SAMPLE_ROWS = 30;
  
  let buffer = '';
  let insideRow = false;
  
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 64 * 1024 }),
    crlfDelay: Infinity,
  });
  
  const isHeaderRow = (cells) => {
    const rowText = cells.join(' ').toUpperCase();
    const hasData = rowText.includes('DATA');
    const hasOther = rowText.includes('VALOR') || 
                     rowText.includes('CENTRO') || 
                     rowText.includes('DEPARTAMENTO') ||
                     rowText.includes('DESCRICAO') ||
                     rowText.includes('DESCRIÇÃO') ||
                     rowText.includes('HISTORICO') ||
                     rowText.includes('HISTÓRICO');
    return hasData && hasOther;
  };
  
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
    
    if (sampleRows.length < MAX_SAMPLE_ROWS) {
      sampleRows.push({ index: currentRowIndex, cells: cells.slice(0, 5) });
    }
    
    if (headerRowIndex === -1 && currentRowIndex <= 500) {
      if (isHeaderRow(cells)) {
        headerRowIndex = currentRowIndex;
        headersEncontrados = cells.map(h => h.trim());
        log(`🎯 Cabeçalho detectado na linha ${currentRowIndex}: ${cells.length} colunas`, LOG_LEVELS.SUCCESS);
        log(`📋 Cabeçalhos: ${cells.slice(0, 8).join(' | ')}...`, LOG_LEVELS.DEBUG);
        
        // PASSTHROUGH: usar nome original do cabeçalho como chave
        // O webhook já possui o COLUMN_MAP completo para mapeamento
        for (let i = 0; i < headersEncontrados.length; i++) {
          headerMapping.push(headersEncontrados[i] || null);
        }
        log(`Passthrough: ${headerMapping.filter(Boolean).length} colunas serão enviadas ao webhook`, LOG_LEVELS.DEBUG);
        return;
      }
    }
    
    if (headerRowIndex === -1 && currentRowIndex === 501) {
      log(`⚠️ Cabeçalho NÃO encontrado nas primeiras 500 linhas!`, LOG_LEVELS.WARN);
      log(`📊 Amostra das primeiras ${sampleRows.length} linhas:`, LOG_LEVELS.DEBUG);
      sampleRows.slice(0, 10).forEach(row => {
        log(`   Linha ${row.index}: ${row.cells.join(' | ')}`, LOG_LEVELS.DEBUG);
      });
    }
    
    if (headerRowIndex === -1 || currentRowIndex <= headerRowIndex) return;
    
    const rowData = {};
    let temDados = false;
    
    // PASSTHROUGH: enviar todas as colunas com nome original como chave
    for (let j = 0; j < cells.length && j < headerMapping.length; j++) {
      const headerName = headerMapping[j];
      if (!headerName) continue;
      
      let value = cells[j];
      value = value ? String(value).trim() : null;
      
      if (value !== null && value !== '') {
        rowData[headerName] = value;
        temDados = true;
      }
    }
    
    if (temDados) {
      dados.push(rowData);
    }
  };
  
  for await (const line of rl) {
    bytesProcessed += Buffer.byteLength(line, 'utf-8') + 1;
    
    const progress = Math.floor((bytesProcessed / fileSize) * 100);
    if (progress >= lastProgressLog + 10) {
      lastProgressLog = progress;
      log(`⏳ Leitura HTML: ${progress}% (${dados.length} registros válidos)`, LOG_LEVELS.DEBUG);
    }
    
    buffer += line + '\n';
    
    if (!insideRow && buffer.includes('<tr')) {
      insideRow = true;
    }
    
    if (insideRow && buffer.includes('</tr>')) {
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let match;
      let lastIndex = 0;
      
      while ((match = trRegex.exec(buffer)) !== null) {
        processRow(match[1]);
        lastIndex = match.index + match[0].length;
      }
      
      buffer = buffer.substring(lastIndex);
      insideRow = buffer.includes('<tr');
    }
    
    if (buffer.length > 100 * 1024 && !insideRow) {
      buffer = '';
    }
  }
  
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
  
  if (dados.length === 0) {
    log(`🔍 DIAGNÓSTICO - Cabeçalho encontrado: ${headerRowIndex > 0 ? 'SIM na linha ' + headerRowIndex : 'NÃO'}`, LOG_LEVELS.WARN);
    
    if (headerRowIndex > 0) {
      log(`📋 Headers mapeados: ${headerMapping.filter(Boolean).join(', ')}`, LOG_LEVELS.DEBUG);
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

function processarHtmlRelatorio(filePath) {
  const fileSize = fs.statSync(filePath).size;
  const MAX_SYNC_SIZE = 400 * 1024 * 1024;
  
  if (fileSize > MAX_SYNC_SIZE) {
    log(`Arquivo muito grande (${(fileSize / 1024 / 1024).toFixed(2)} MB) - usando streaming`, LOG_LEVELS.WARN);
    return processarHtmlRelatorioStream(filePath);
  }
  
  setStep('PROCESSAMENTO_HTML');
  log(`Processando arquivo HTML: ${filePath}`, LOG_LEVELS.INFO);
  
  const startTime = Date.now();
  
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    log(`Erro ao ler HTML: ${e.message}`, LOG_LEVELS.ERROR);
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
  
  content = null;
  
  log(`Total de linhas HTML encontradas: ${rows.length}`, LOG_LEVELS.DEBUG);
  
  if (rows.length === 0) {
    log('Nenhuma linha encontrada no HTML', LOG_LEVELS.WARN);
    return [];
  }
  
  const isHeaderRow = (cells) => {
    const rowText = cells.join(' ').toUpperCase();
    const hasData = rowText.includes('DATA');
    const hasOther = rowText.includes('VALOR') || 
                     rowText.includes('CENTRO') || 
                     rowText.includes('DEPARTAMENTO') ||
                     rowText.includes('DESCRICAO') ||
                     rowText.includes('DESCRIÇÃO') ||
                     rowText.includes('HISTORICO') ||
                     rowText.includes('HISTÓRICO');
    return hasData && hasOther;
  };

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 500); i++) {
    if (isHeaderRow(rows[i])) {
      headerRowIndex = i;
      headersEncontrados = rows[headerRowIndex].map(h => h.trim());
      log(`🎯 Cabeçalho detectado na linha ${headerRowIndex}: ${rows[headerRowIndex].length} colunas`, LOG_LEVELS.SUCCESS);
      log(`📋 Cabeçalhos: ${rows[headerRowIndex].slice(0, 8).join(' | ')}...`, LOG_LEVELS.DEBUG);
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    log('⚠️ Cabeçalho NÃO encontrado nas primeiras 500 linhas!', LOG_LEVELS.WARN);
    log(`📊 Amostra das primeiras linhas:`, LOG_LEVELS.DEBUG);
    rows.slice(0, 10).forEach((row, idx) => {
      log(`   Linha ${idx}: ${row.slice(0, 5).join(' | ')}`, LOG_LEVELS.DEBUG);
    });
    
    headersEncontrados = [
      'DATA', 'CENTRO DE CUSTO', 'DEPARTAMENTO', 'DESCRICAO',
      'VALOR', 'TIPO', 'DOCUMENTO', 'HISTORICO',
    ];
    headerRowIndex = 0;
  }
  
  // PASSTHROUGH: usar nome original do cabeçalho
  const headerMapping = headersEncontrados.map(h => h || null);
  log(`Passthrough: ${headerMapping.filter(Boolean).length} colunas serão enviadas ao webhook`, LOG_LEVELS.DEBUG);
  
  const dataStartIndex = headerRowIndex + 1;
  const totalDataRows = rows.length - dataStartIndex;
  
  log(`🔄 Processando ${totalDataRows} registros HTML...`, LOG_LEVELS.INFO);
  
  for (let i = dataStartIndex; i < rows.length; i++) {
    const cells = rows[i];
    const rowData = {};
    let temDados = false;
    
    // PASSTHROUGH: enviar todas as colunas com nome original
    for (let j = 0; j < cells.length && j < headerMapping.length; j++) {
      const headerName = headerMapping[j];
      if (!headerName) continue;
      
      let value = cells[j];
      value = value ? String(value).trim() : null;
      
      if (value !== null && value !== '') {
        rowData[headerName] = value;
        temDados = true;
      }
    }
    
    if (temDados) {
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

async function processarArquivo(filePath) {
  const fileType = detectFileType(filePath);
  
  if (fileType.type === 'html') {
    log(`Formato detectado via magic bytes: HTML disfarçado de Excel`, LOG_LEVELS.INFO);
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
  
  // PASSTHROUGH: enviar TODAS as colunas com nome original para o webhook
  // O webhook possui o COLUMN_MAP completo e faz o mapeamento correto
  log(`🔄 Passthrough: ${headersOriginais.length} colunas serão enviadas ao webhook`, LOG_LEVELS.DEBUG);
  log(`📋 Colunas: ${headersOriginais.slice(0, 8).join(' | ')}...`, LOG_LEVELS.DEBUG);
  
  log(`🔄 Processando ${rawData.length} registros...`, LOG_LEVELS.INFO);
  const dados = [];
  let lastProgressLog = 0;
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowData = {};
    let temDados = false;
    
    for (const header of headersOriginais) {
      let value = row[header];
      value = value !== undefined && value !== null && value !== '' ? String(value).trim() : null;
      
      if (value !== null && value !== '') {
        rowData[header] = value;
        temDados = true;
      }
    }
    
    if (temDados) {
      dados.push(rowData);
    }
    
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

async function enviarWebhook(dados, nomeArquivo) {
  setStep('IMPORTACAO');
  
  await notificarProgresso({
    etapa_atual: 'importacao',
    mensagem: `Enviando ${dados.length.toLocaleString()} registros para o servidor...`,
  });

  const mesReferencia = new Date().toISOString().slice(0, 7);
  const headers = { 'Content-Type': 'application/json' };
  if (CONFIG.WEBHOOK_SECRET) headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;

  const BATCH_SIZE = parseInt(process.env.WEBHOOK_BATCH_SIZE || '1000', 10);
  const total = dados.length;
  const totalChunks = Math.ceil(total / BATCH_SIZE);
  let importacaoId = null;
  let enviados = 0;

  log('', LOG_LEVELS.INFO);
  log('═'.repeat(50), LOG_LEVELS.INFO);
  log('📤 INICIANDO IMPORTAÇÃO PARA O SERVIDOR', LOG_LEVELS.INFO);
  log('═'.repeat(50), LOG_LEVELS.INFO);
  log(`   Total de registros: ${total.toLocaleString()}`, LOG_LEVELS.INFO);
  log(`   Lotes: ${totalChunks} (${BATCH_SIZE} registros cada)`, LOG_LEVELS.INFO);
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
      total_registros: total,
      chunk_index: chunkIndex,
      chunk_total: totalChunks,
    };

    const pctBefore = Math.floor((enviados / total) * 100);
    log(`   📦 Lote ${chunkIndex}/${totalChunks}: enviando ${batch.length.toLocaleString()} registros...`, LOG_LEVELS.DEBUG);

    try {
      const response = await axios.post(CONFIG.WEBHOOK_URL, payload, {
        headers,
        timeout: 600000,
      });

      if (!importacaoId && response.data?.importacao_id) {
        importacaoId = response.data.importacao_id;
        log(`   🆔 Importação ID: ${importacaoId}`, LOG_LEVELS.DEBUG);
      }

      enviados += batch.length;
      const pct = Math.min(100, Math.floor((enviados / total) * 100));
      
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
  log(`✅ IMPORTAÇÃO CONCLUÍDA COM SUCESSO!`, LOG_LEVELS.SUCCESS);
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
  log('INICIANDO ROBÔ MGF HINOVA (Lançamentos Financeiros)');
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
  // NOTIFICAR INÍCIO DA EXECUÇÃO
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
    }
  }
  
  if (execucaoId && !CONFIG.EXECUCAO_ID) {
    CONFIG.EXECUCAO_ID = execucaoId;
  }
  
  // MGF: NÃO PREENCHE PERÍODO - deixar em branco
  
  let browser = null;
  let context = null;
  let page = null;
  
  try {
    setStep('BROWSER_INIT');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-popup-blocking'],
    });
    
    context = await browser.newContext({ 
      acceptDownloads: true,
      navigationTimeout: TIMEOUTS.PAGE_LOAD,
    });
    
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(TIMEOUTS.PAGE_LOAD);
    
    page = await context.newPage();
    
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(TIMEOUTS.PAGE_LOAD);

    context.on('download', (d) => {
      try {
        const name = d.suggestedFilename?.() || 'arquivo';
        log(`[DEBUG] Evento download global: ${name}`, LOG_LEVELS.DEBUG);
      } catch {}
    });

    // ============================================
    // ETAPA: LOGIN (IDÊNTICO À COBRANÇA)
    // ============================================
    setStep('LOGIN');
    
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
    await page.waitForTimeout(3000);
    
    try {
      await page.waitForSelector('input[placeholder="Usuário"], input[type="password"]', {
        timeout: 30000
      });
      log('Formulário de login carregado', LOG_LEVELS.SUCCESS);
    } catch {
      log('Campos de login não encontrados pelo seletor padrão', LOG_LEVELS.WARN);
    }
    
    await fecharPopups(page);
    
    log('Preenchendo credenciais...');
    
    if (CONFIG.HINOVA_CODIGO_CLIENTE) {
      try {
        await page.fill('input[placeholder=""]', CONFIG.HINOVA_CODIGO_CLIENTE, { timeout: 5000 });
        log('Código cliente preenchido', LOG_LEVELS.DEBUG);
      } catch (e) {
        log('Campo código cliente não encontrado (pode ser opcional)', LOG_LEVELS.DEBUG);
      }
    }
    
    try {
      await page.fill('input[placeholder="Usuário"]', CONFIG.HINOVA_USER, { timeout: 5000 });
      log('Usuário preenchido', LOG_LEVELS.DEBUG);
    } catch (e) {
      log(`Erro ao preencher usuário: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    try {
      await page.fill('input[placeholder="Senha"]', CONFIG.HINOVA_PASS, { timeout: 5000 });
      log('Senha preenchida', LOG_LEVELS.DEBUG);
    } catch (e) {
      log(`Erro ao preencher senha: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    await page.waitForTimeout(500);
    
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

    // Selecionar layout/sistema na tela de login (IDÊNTICO AO COBRANÇA)
    const layoutOk = await trySelectHinovaLayout(page);
    if (!layoutOk) {
      log('Campo de layout/perfil não identificado no login (seguindo assim mesmo)', LOG_LEVELS.WARN);
    }
    
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
    // ETAPA: NAVEGAÇÃO PARA RELATÓRIO MGF
    // ============================================
    setStep('NAVEGACAO_RELATORIO');
    
    log('Navegando para Relatório de Lançamentos MGF...');
    await fecharPopups(page);
    
    await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_LOAD
    });
    
    log('Aguardando carregamento...');
    await page.waitForTimeout(5000);
    await fecharPopups(page);
    
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {
      log('NetworkIdle timeout - continuando...', LOG_LEVELS.WARN);
    });
    
    await fecharPopups(page);
    log('Página de relatório aberta', LOG_LEVELS.SUCCESS);
    
    // ============================================
    // ETAPA: CONFIGURAÇÃO DE FILTROS MGF
    // MGF: NÃO PREENCHE PERÍODO - deixar em branco
    // ============================================
    setStep('FILTROS');
    
    log('MGF: Período NÃO será preenchido (configuração padrão do portal)', LOG_LEVELS.INFO);
    
    // Aguardar a página carregar completamente
    log('⏳ Aguardando página carregar completamente...', LOG_LEVELS.INFO);
    await page.waitForTimeout(5000);
    
    // Scroll para baixo para garantir que a seção "Dados Visualizados" carregue
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    
    // Aguardar selects aparecerem (até 30s)
    const MAX_TENTATIVAS_LAYOUT = 15;
    let selectsEncontrados = false;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_LAYOUT; tentativa++) {
      const qtdSelects = await page.evaluate(() => document.querySelectorAll('select').length);
      if (qtdSelects > 0) {
        log(`   ✅ ${qtdSelects} select(s) encontrado(s) na tentativa ${tentativa}`, LOG_LEVELS.SUCCESS);
        selectsEncontrados = true;
        break;
      }
      log(`   Tentativa ${tentativa}/${MAX_TENTATIVAS_LAYOUT} - nenhum select encontrado, aguardando 2s...`, LOG_LEVELS.DEBUG);
      await page.waitForTimeout(2000);
    }
    
    if (!selectsEncontrados) {
      log('⚠️ Nenhum select encontrado após todas as tentativas', LOG_LEVELS.WARN);
      // Debug: listar elementos da página
      const debugInfo = await page.evaluate(() => {
        return {
          title: document.title,
          url: location.href,
          bodyLength: document.body?.innerHTML?.length || 0,
          iframes: document.querySelectorAll('iframe').length,
          selects: document.querySelectorAll('select').length,
          inputs: document.querySelectorAll('input').length,
          textoRelevante: document.body?.textContent?.includes('Dados Visualizados') || document.body?.textContent?.includes('DADOS VISUALIZADOS'),
          textoLayout: document.body?.textContent?.includes('layout') || document.body?.textContent?.includes('Layout'),
        };
      });
      log(`   Debug página: ${JSON.stringify(debugInfo)}`, LOG_LEVELS.DEBUG);
      await page.waitForTimeout(5000);
    }
    
    // ============================================
    // LAYOUT - PADRÃO ROBUSTO (4 ESTRATÉGIAS) - IGUAL COBRANÇA
    // ============================================
    log('═'.repeat(50), LOG_LEVELS.INFO);
    log('📋 CONFIGURANDO LAYOUT DO RELATÓRIO', LOG_LEVELS.INFO);
    log('═'.repeat(50), LOG_LEVELS.INFO);
    log(`   Layout obrigatório: "${CONFIG.HINOVA_LAYOUT}"`, LOG_LEVELS.INFO);
    
    const layoutSelecionado = await page.evaluate(({ layoutDesejado }) => {
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
      
      // Função para tentar selecionar VANGARD em um select
      const tentarSelecionarVangard = (select, metodo) => {
        const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
        if (resultado.opcoesDisponiveis.length === 0) {
          resultado.opcoesDisponiveis = opcoes;
        }
        
        for (let i = 0; i < select.options.length; i++) {
          const optText = normalizar(select.options[i].text || '');
          if (optText.includes('VANGARD')) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            resultado.sucesso = true;
            resultado.metodo = metodo;
            resultado.valorSelecionado = select.options[i].text?.trim();
            return true;
          }
        }
        return false;
      };
      
      // ========================================
      // ESTRATÉGIA 1: Buscar label "Layout:" ou "Selecione o layout"
      // ========================================
      const labels = document.querySelectorAll('td, th, label, span, div');
      for (const label of labels) {
        const texto = (label.textContent || '').trim();
        const textoNorm = normalizar(texto);
        
        if (textoNorm === 'LAYOUT:' || textoNorm === 'LAYOUT' || 
            textoNorm.includes('SELECIONE O LAYOUT') || textoNorm.includes('LAYOUT DO RELATORIO')) {
          resultado.diagnostico.labelsLayout.push({ texto: texto.substring(0, 80), tag: label.tagName });
          
          // Procurar select na mesma linha (tr) ou próximo
          const row = label.closest('tr');
          const selectInRow = row?.querySelector('select');
          if (selectInRow && tentarSelecionarVangard(selectInRow, 'LABEL_LAYOUT')) {
            return resultado;
          }
          
          // Tentar parent
          const parent = label.parentElement;
          const selectInParent = parent?.querySelector('select');
          if (selectInParent && tentarSelecionarVangard(selectInParent, 'LABEL_LAYOUT_PARENT')) {
            return resultado;
          }
        }
      }
      
      // ========================================
      // ESTRATÉGIA 2: Buscar seção "Dados Visualizados"
      // ========================================
      const secoes = document.querySelectorAll('td, th, div, fieldset, legend, a');
      for (const secao of secoes) {
        const texto = normalizar(secao.textContent || '');
        
        if (texto.includes('DADOS VISUALIZADOS')) {
          resultado.diagnostico.secaoDadosVisualizados = {
            tag: secao.tagName,
            texto: (secao.textContent || '').substring(0, 100)
          };
          
          const container = secao.closest('table, div, fieldset') || secao.parentElement;
          const selects = container?.querySelectorAll('select') || [];
          
          for (const select of selects) {
            if (tentarSelecionarVangard(select, 'SECAO_DADOS_VISUALIZADOS')) {
              return resultado;
            }
          }
        }
      }
      
      // ========================================
      // ESTRATÉGIA 3: Varrer TODOS os selects
      // ========================================
      const todosSelects = document.querySelectorAll('select');
      for (const select of todosSelects) {
        if (tentarSelecionarVangard(select, 'VARREDURA_OPCOES')) {
          return resultado;
        }
        
        // Guardar para diagnóstico
        const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
        const temRelevante = opcoes.some(o => {
          const norm = normalizar(o);
          return norm.includes('SELECIONE') || norm.includes('VANGARD') || norm.includes('FINANCEIRO');
        });
        if (temRelevante) {
          resultado.diagnostico.selectsEncontrados.push({
            name: select.name || select.id || 'sem_nome',
            opcoes: opcoes.slice(0, 10)
          });
        }
      }
      
      // ========================================
      // ESTRATÉGIA 4: Fallback por atributos name/id
      // ========================================
      for (const select of todosSelects) {
        const name = (select.name || select.id || '').toLowerCase();
        if (name.includes('layout') || name.includes('visualiza') || name.includes('dados')) {
          if (resultado.opcoesDisponiveis.length === 0) {
            resultado.opcoesDisponiveis = Array.from(select.options).map(o => o.text?.trim() || '');
          }
          if (tentarSelecionarVangard(select, 'FALLBACK_NAME_ID')) {
            return resultado;
          }
        }
      }
      
      // Coletar todos os selects para diagnóstico se nenhum encontrado
      if (resultado.diagnostico.selectsEncontrados.length === 0) {
        for (const select of todosSelects) {
          const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
          resultado.diagnostico.selectsEncontrados.push({
            name: select.name || select.id || 'sem_nome',
            opcoes: opcoes.slice(0, 10)
          });
        }
      }
      
      return resultado;
    }, { layoutDesejado: CONFIG.HINOVA_LAYOUT });
    
    if (layoutSelecionado.sucesso) {
      log(`✅ Layout selecionado com sucesso!`, LOG_LEVELS.SUCCESS);
      log(`   Método: ${layoutSelecionado.metodo}`, LOG_LEVELS.DEBUG);
      log(`   Valor: "${layoutSelecionado.valorSelecionado}"`, LOG_LEVELS.SUCCESS);
      
      log('⏳ Aguardando configurações do layout carregarem...', LOG_LEVELS.INFO);
      await page.waitForTimeout(10000);
    } else {
      log(`❌ ERRO CRÍTICO: Layout "${CONFIG.HINOVA_LAYOUT}" não encontrado!`, LOG_LEVELS.ERROR);
      log(`   Opções disponíveis: ${layoutSelecionado.opcoesDisponiveis.join(', ') || 'NENHUMA'}`, LOG_LEVELS.ERROR);
      if (layoutSelecionado.diagnostico.labelsLayout.length > 0) {
        log(`   Labels encontrados: ${JSON.stringify(layoutSelecionado.diagnostico.labelsLayout)}`, LOG_LEVELS.DEBUG);
      }
      if (layoutSelecionado.diagnostico.secaoDadosVisualizados) {
        log(`   Seção "Dados Visualizados": ${JSON.stringify(layoutSelecionado.diagnostico.secaoDadosVisualizados)}`, LOG_LEVELS.DEBUG);
      }
      if (layoutSelecionado.diagnostico.selectsEncontrados.length > 0) {
        log(`   Selects encontrados: ${JSON.stringify(layoutSelecionado.diagnostico.selectsEncontrados)}`, LOG_LEVELS.DEBUG);
      }
      await saveDebugInfo(page, context, 'Layout BI-VANGARD não encontrado');
      throw new Error(`ERRO CRÍTICO: Layout "${CONFIG.HINOVA_LAYOUT}" não encontrado! Verifique a seção de layout no portal.`);
    }
    
    await page.waitForTimeout(1000);
    // COM VALIDAÇÃO ROBUSTA (3 TENTATIVAS) - PADRÃO COBRANÇA
    // EVENTOS, EVENTOS NAO PROVISIONADO, EVENTOS RATEAVEIS
    // ============================================
    log('═'.repeat(50), LOG_LEVELS.INFO);
    log('📋 CONFIGURANDO CENTRO DE CUSTO / DEPARTAMENTO', LOG_LEVELS.INFO);
    log('═'.repeat(50), LOG_LEVELS.INFO);
    log('   Marcar APENAS: EVENTOS, EVENTOS NAO PROVISIONADO, EVENTOS RATEAVEIS', LOG_LEVELS.INFO);
    
    // PASSO 1: Expandir a seção colapsável "CENTRO CUSTO" na página do relatório
    log('   🔍 Procurando seção colapsável "CENTRO CUSTO" para expandir...', LOG_LEVELS.INFO);
    
    // A seção é um accordion/colapsável com header contendo exatamente "CENTRO CUSTO"
    // Não confundir com o item de menu "4.12) Departamento / Centro de Custo"
    const expandiuCentroCusto = await page.evaluate(() => {
      // Estratégia 1: Procurar headers de accordion/seções colapsáveis
      // Esses são tipicamente elementos com ícones de seta (▼/▶) e texto em negrito
      const candidatos = document.querySelectorAll(
        'a[data-toggle], a[data-bs-toggle], [data-toggle="collapse"], [data-bs-toggle="collapse"], ' +
        '.panel-heading a, .card-header a, .accordion-toggle, ' +
        'a.collapsed, a[aria-expanded], ' +
        'h3 a, h4 a, h5 a, ' +
        // Headers genéricos que podem ser clicáveis
        '.panel-heading, .card-header, .accordion-header'
      );
      
      for (const el of candidatos) {
        const texto = (el.textContent || '').toUpperCase().trim();
        // Deve conter "CENTRO CUSTO" mas NÃO "DEPARTAMENTO" (para evitar o item de menu 4.12)
        if (texto.includes('CENTRO') && texto.includes('CUSTO') && !texto.includes('DEPARTAMENTO') && !texto.includes('4.12')) {
          el.click();
          return { found: true, text: texto, tag: el.tagName, strategy: 'accordion-selector' };
        }
      }
      
      // Estratégia 2: Procurar qualquer <a> ou elemento clicável com texto curto "CENTRO CUSTO"
      const allLinks = document.querySelectorAll('a, button, [role="button"]');
      for (const el of allLinks) {
        // Pegar apenas o texto direto do elemento (sem filhos profundos)
        const textoDirecto = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && ['B', 'STRONG', 'SPAN', 'I'].includes(n.nodeName)))
          .map(n => n.textContent || '')
          .join('')
          .toUpperCase()
          .trim();
        
        // Texto curto tipo "CENTRO CUSTO" (sem números de menu como "4.12)")
        if (textoDirecto.includes('CENTRO CUSTO') && textoDirecto.length < 30 && !textoDirecto.includes('4.')) {
          el.click();
          return { found: true, text: textoDirecto, tag: el.tagName, strategy: 'direct-text' };
        }
      }
      
      // Estratégia 3: Procurar pela estrutura visual - seções com seta ▼ ou ▶
      const allElements = document.querySelectorAll('a, div[onclick], span[onclick]');
      for (const el of allElements) {
        const texto = (el.textContent || '').toUpperCase().trim();
        if (texto === 'CENTRO CUSTO' || texto === '▼ CENTRO CUSTO' || texto === '▶ CENTRO CUSTO' || 
            texto === '◄ CENTRO CUSTO' || texto === '► CENTRO CUSTO') {
          el.click();
          return { found: true, text: texto, tag: el.tagName, strategy: 'exact-match' };
        }
      }
      
      return { found: false };
    });
    
    if (expandiuCentroCusto.found) {
      log(`   ✅ Seção expandida: "${expandiuCentroCusto.text}" (${expandiuCentroCusto.tag}, estratégia: ${expandiuCentroCusto.strategy})`, LOG_LEVELS.SUCCESS);
      // Aguardar checkboxes aparecerem após expandir
      await page.waitForTimeout(3000);
    } else {
      log('   ⚠️ Seção "CENTRO CUSTO" não encontrada, tentando prosseguir com checkboxes já visíveis...', LOG_LEVELS.WARN);
    }
    
    const MAX_TENTATIVAS_CENTRO_CUSTO = 3;
    let centroCustoValidado = false;
    
    for (let tentativaCentro = 1; tentativaCentro <= MAX_TENTATIVAS_CENTRO_CUSTO; tentativaCentro++) {
      log(`📋 Tentativa ${tentativaCentro}/${MAX_TENTATIVAS_CENTRO_CUSTO} de configuração de Centro de Custo...`, LOG_LEVELS.INFO);
      
       const centroCustoConfigured = await page.evaluate((centrosPermitidos) => {
        const resultado = {
          sucesso: false,
          desmarcados: [],
          marcados: [],
          diagnostico: {
            totalCheckboxes: 0,
            checkboxesEncontrados: [],
            allInputs: 0,
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
        
        const centrosNormalizados = centrosPermitidos.map(c => normalizar(c));
        
        // Buscar checkboxes em toda a página
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        resultado.diagnostico.totalCheckboxes = checkboxes.length;
        resultado.diagnostico.allInputs = document.querySelectorAll('input').length;
        
        for (const cb of checkboxes) {
          const label = cb.closest('label');
          const td = cb.closest('td');
          const parentDiv = cb.closest('div');
          
          let labelText = '';
          
          if (label) {
            labelText = label.textContent || '';
          }
          if (!labelText && cb.nextSibling) {
            labelText = cb.nextSibling.textContent || '';
          }
          if (!labelText && td) {
            const tdClone = td.cloneNode(true);
            tdClone.querySelectorAll('input').forEach(i => i.remove());
            labelText = tdClone.textContent || '';
          }
          if (!labelText && parentDiv) {
            const divClone = parentDiv.cloneNode(true);
            divClone.querySelectorAll('input').forEach(i => i.remove());
            labelText = divClone.textContent || '';
          }
          if (!labelText) {
            labelText = cb.value || cb.name || cb.id || '';
          }
          
          labelText = normalizar(labelText);
          
          resultado.diagnostico.checkboxesEncontrados.push({
            value: cb.value,
            name: cb.name,
            id: cb.id,
            labelText: labelText,
            checked: cb.checked,
            visible: cb.offsetParent !== null
          });
          
          // Verificar se contém EVENTO (case insensitive já normalizado)
          const contemEvento = labelText.includes('EVENTO');
          
          if (contemEvento) {
            if (!cb.checked) {
              cb.click();
              // Fallback: forçar via propriedade
              if (!cb.checked) {
                cb.checked = true;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
                cb.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            resultado.marcados.push(labelText);
            resultado.sucesso = true;
          } else if (labelText.includes('TODOS') || labelText.includes('NAO INFORMADO') || labelText.includes('NÃO INFORMADO')) {
            // Desmarcar "Todos" e "Não informado"
            if (cb.checked) {
              cb.click();
              if (cb.checked) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            resultado.desmarcados.push(labelText);
          }
        }
        
        return resultado;
      }, CENTROS_CUSTO_PERMITIDOS);
      
      // Log diagnóstico detalhado
      log(`   📊 Diagnóstico: ${centroCustoConfigured.diagnostico.totalCheckboxes} checkboxes, ${centroCustoConfigured.diagnostico.allInputs} inputs total`, LOG_LEVELS.DEBUG);
      if (centroCustoConfigured.diagnostico.checkboxesEncontrados.length > 0) {
        centroCustoConfigured.diagnostico.checkboxesEncontrados.forEach(cb => {
          log(`      CB: "${cb.labelText}" value="${cb.value}" name="${cb.name}" checked=${cb.checked} visible=${cb.visible}`, LOG_LEVELS.DEBUG);
        });
      }
      
      if (centroCustoConfigured.sucesso) {
        log(`   ✅ Marcados: ${centroCustoConfigured.marcados.join(', ')}`, LOG_LEVELS.SUCCESS);
        if (centroCustoConfigured.desmarcados.length > 0) {
          log(`   ❌ Desmarcados: ${centroCustoConfigured.desmarcados.join(', ')}`, LOG_LEVELS.DEBUG);
        }
        centroCustoValidado = true;
        break;
      } else {
        log(`⚠️ Nenhum checkbox com "EVENTO" encontrado na tentativa ${tentativaCentro}`, LOG_LEVELS.WARN);
        
        if (tentativaCentro < MAX_TENTATIVAS_CENTRO_CUSTO) {
          // Tentar expandir a seção novamente
          log(`   🔄 Re-expandindo seção CENTRO CUSTO...`, LOG_LEVELS.INFO);
          await page.evaluate(() => {
            const els = document.querySelectorAll('a[data-toggle], a[data-bs-toggle], [data-toggle="collapse"], [data-bs-toggle="collapse"], .panel-heading, .card-header, a[aria-expanded], div[data-toggle]');
            for (const el of els) {
              const texto = (el.textContent || '').toUpperCase().trim();
              if (texto.includes('CENTRO') && texto.includes('CUSTO') && !texto.includes('DEPARTAMENTO') && !texto.includes('4.12')) {
                el.click();
                return true;
              }
            }
            // Fallback: qualquer elemento curto com "CENTRO CUSTO"
            const all = document.querySelectorAll('a, div[onclick], span[onclick], button');
            for (const el of all) {
              const t = (el.textContent || '').toUpperCase().trim();
              if (t === 'CENTRO CUSTO' || t.startsWith('CENTRO CUSTO')) {
                el.click();
                return true;
              }
            }
            return false;
          });
          await page.waitForTimeout(3000);
        }
      }
    }
    
    if (!centroCustoValidado) {
      // Último recurso: salvar debug e prosseguir mesmo assim se a seção foi expandida
      log(`⚠️ Centro de Custo não validado por checkbox, mas seção foi expandida. Prosseguindo...`, LOG_LEVELS.WARN);
      await saveDebugInfo(page, context, 'Centro de Custo - prosseguindo sem validação');
    }
    
    await page.waitForTimeout(1000);
    
    // Forma de Exibição: Em Excel
    await selecionarFormaExibicaoEmExcel(page);
    
    await page.waitForTimeout(1000);
    
    log('', LOG_LEVELS.INFO);
    log('✅ Filtros configurados!', LOG_LEVELS.SUCCESS);
    log('', LOG_LEVELS.INFO);
    
    // Salvar screenshot dos filtros
    await saveDebugInfo(page, context, 'Pre-download: estado dos filtros');
    
    // ============================================
    // ETAPA: DOWNLOAD
    // ============================================
    setStep('DOWNLOAD');
    
    // Notificar que estamos iniciando o download (relatório grande ~255MB, leva ~35min)
    await notificarProgresso({
      etapa_atual: 'aguardando_geracao',
      progresso_download: 0,
      mensagem: 'Clicando em Gerar Relatório... O servidor pode levar até 40 minutos para gerar o arquivo.',
    });
    
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
        await selecionarFormaExibicaoEmExcel(page);
        await page.waitForTimeout(1000);
        
        const semanticName = generateSemanticFilename();
        nomeArquivoFinal = semanticName;
        
        log('Iniciando estratégia híbrida de captura de download...');
        
        const capturaHibridaPromise = aguardarDownloadHibrido(
          context, 
          page, 
          downloadDir, 
          semanticName, 
          TIMEOUTS.DOWNLOAD_TOTAL
        );
        
        log('Clicando em Gerar Relatório...');
        
        const clicarGerarEmQualquerFrame = async () => {
          const tentarNoFrame = async (frame) => {
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
          
          const mainClicked = await tentarNoFrame(page.mainFrame());
          if (mainClicked) return mainClicked;
          
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
        
        log(`Aguardando captura híbrida (timeout: ${TIMEOUTS.DOWNLOAD_TOTAL / 60000} min)...`);
        
        const result = await capturaHibridaPromise;
        
        if (!result.success) {
          await saveDebugInfo(page, context, result.error?.message || 'Nenhum download capturado');
          throw result.error || new Error('Download falhou - nenhuma estratégia capturou o arquivo');
        }
        
        log(`Download finalizado via estratégia: ${result.source}`, LOG_LEVELS.SUCCESS);
        log(`Arquivo: ${result.filePath} (${(result.size / 1024).toFixed(2)} KB)`, LOG_LEVELS.INFO);
        
        const validation = validateDownloadedFile(result.filePath, result.contentType || '');
        if (!validation.valid) {
          throw new Error(`Arquivo inválido: ${validation.error}`);
        }
        
        if (validation.isHtml) {
          log(`Validação OK: HTML disfarçado de Excel (${formatBytes(validation.size)})`, LOG_LEVELS.SUCCESS);
        } else {
          log(`Validação OK: ${validation.fileType.toUpperCase()} (${formatBytes(validation.size)})`, LOG_LEVELS.SUCCESS);
        }
        
        setStep('PROCESSAMENTO');
        log('Processando arquivo...', LOG_LEVELS.INFO);
        
        await notificarProgresso({
          etapa_atual: 'processamento',
          progresso_download: 100,
          mensagem: `Download concluído (${(result.size / 1024 / 1024).toFixed(1)} MB). Processando dados...`,
        });
        
        dados = await processarArquivo(result.filePath);
        
        if (!Array.isArray(dados) || dados.length === 0) {
          throw new Error('Nenhum dado válido extraído do arquivo');
        }
        
        log(`✅ ${dados.length} registros extraídos`, LOG_LEVELS.SUCCESS);
        
        downloadSucesso = true;
        
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
          if (!urlAtual.includes('relatorioLancamento')) {
            log('Recarregando página de relatório...');
            await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
              waitUntil: 'domcontentloaded',
              timeout: TIMEOUTS.PAGE_LOAD
            });
            await fecharPopups(page);
            await page.waitForTimeout(3000);
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
    // ETAPA: ENVIO PARA WEBHOOK
    // ============================================
    const sucesso = await enviarWebhook(dados, nomeArquivoFinal);
    
    // ============================================
    // LIMPEZA: REMOVER ARQUIVO TEMPORÁRIO
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
    
    return sucesso;
    
  } catch (error) {
    log(`ERRO CRÍTICO: ${error.message}`, LOG_LEVELS.ERROR);
    if (page && context) {
      await saveDebugInfo(page, context, error.message);
    }
    throw error;
    
  } finally {
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
    log('ROBÔ MGF FINALIZADO');
    log('='.repeat(60));
  }
}

// ============================================
// NOTIFICAR PROGRESSO VIA WEBHOOK
// ============================================
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
