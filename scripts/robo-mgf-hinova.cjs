#!/usr/bin/env node
/**
 * Robô de Automação - MGF Hinova (Lançamentos Financeiros)
 * ========================================================
 * 
 * SEGUE EXATAMENTE O MESMO PADRÃO DO ROBÔ DE COBRANÇA PARA MÁXIMA ESTABILIDADE
 * - Sistema de download híbrido com múltiplos watchers
 * - HTTP Stream como fallback
 * - Monitor de progresso do arquivo
 * - Heartbeat durante downloads longos
 * 
 * FLUXO:
 * 1. Login no portal Hinova (com tratamento de modais)
 * 2. Navegar DIRETO para /mgf/relatorio/relatorioLancamento.php
 * 3. Selecionar Layout "BI VANGARD FINANCEIROS EVENTOS"
 * 4. Selecionar Centro de Custo/Departamento (apenas com "EVENTOS")
 * 5. Selecionar tipo de relatório "Em Excel"
 * 6. Clicar em "Gerar Relatório"
 * 7. Baixar arquivo (usando estratégia híbrida como cobrança)
 * 8. Enviar dados via webhook
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

// ============================================
// CONFIGURAÇÃO (IDÊNTICA AO ROBÔ DE COBRANÇA)
// ============================================

// Função para derivar URL do relatório MGF a partir da URL de login (IGUAL À COBRANÇA)
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
    // MGF usa caminho diferente: /mgf/relatorio/relatorioLancamento.php
    return `${url.origin}${basePath}/mgf/relatorio/relatorioLancamento.php`;
  } catch (e) {
    // Fallback para URL padrão se parsing falhar
    return 'https://eris.hinova.com.br/sga/sgav4_valecar/mgf/relatorio/relatorioLancamento.php';
  }
}

const HINOVA_URL = String(process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php').trim();

const CONFIG = {
  HINOVA_URL: HINOVA_URL,
  // URL do relatório MGF derivada dinamicamente da URL de login (IGUAL À COBRANÇA)
  HINOVA_RELATORIO_URL: process.env.HINOVA_RELATORIO_URL || deriveRelatorioUrl(HINOVA_URL),
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  // Código do cliente: mantém compatibilidade (IGUAL À COBRANÇA)
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

console.log(`[MGF CONFIG] HINOVA_URL: "${HINOVA_URL}"`);
console.log(`[MGF CONFIG] HINOVA_RELATORIO_URL: "${CONFIG.HINOVA_RELATORIO_URL}"`);
console.log(`[MGF CONFIG] HINOVA_LAYOUT: "${CONFIG.HINOVA_LAYOUT}"`);

// ============================================
// CONSTANTES (IDÊNTICAS AO ROBÔ DE COBRANÇA)
// ============================================
const TIMEOUTS = {
  PAGE_LOAD: 90000,
  LOGIN_RETRY_WAIT: 8000,
  DOWNLOAD_EVENT: 3 * 60000,
  DOWNLOAD_TOTAL: 40 * 60000,
  DOWNLOAD_SAVE: 40 * 60000,
  DOWNLOAD_IDLE: 40 * 60000,
  DOWNLOAD_HARD: 55 * 60000,
  POPUP_CLOSE: 800,
  FILE_PROGRESS_INTERVAL: 5000,
};

const LIMITS = {
  MAX_LOGIN_RETRIES: 20,
  MAX_POPUP_CLOSE_ATTEMPTS: 10,
  MAX_DOWNLOAD_RETRIES: 3,
  MIN_FILE_SIZE_BYTES: 100,
};

// ============================================
// LOGGING (IDÊNTICO AO ROBÔ DE COBRANÇA)
// ============================================
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  DEBUG: 'DEBUG',
};

let currentStep = 'INIT';

function setStep(step) {
  currentStep = step;
  log(`Iniciando etapa: ${step}`);
}

function log(msg, level = LOG_LEVELS.INFO) {
  const timestamp = new Date().toISOString();
  const emoji = {
    INFO: '📌',
    WARN: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅',
    DEBUG: '🔍',
  }[level] || '📌';
  console.log(`[${timestamp}] ${emoji} [${level}] ${msg}`);
}

// ============================================
// UTILS (IDÊNTICO AO ROBÔ DE COBRANÇA)
// ============================================
function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

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

function getDownloadDirectory() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dir = path.join(CONFIG.DOWNLOAD_BASE_DIR, String(year), month);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function generateSemanticFilename() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const timestamp = Date.now();
  return `MGF_Hinova_${day}${month}${year}_${timestamp}.xlsx`;
}

// ============================================
// MONITOR DE PROGRESSO (IDÊNTICO AO ROBÔ DE COBRANÇA)
// ============================================
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

// ============================================
// FUNÇÕES AUXILIARES HTTP (IDÊNTICAS AO ROBÔ DE COBRANÇA)
// ============================================
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
  const allow = ['user-agent', 'accept', 'accept-language', 'referer', 'origin', 'content-type'];
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = String(k || '').toLowerCase();
    if (allow.includes(key) && v) out[key] = v;
  }
  out['accept-encoding'] = 'identity';
  return out;
}

/**
 * Download via HTTP stream puro (IDÊNTICO AO ROBÔ DE COBRANÇA)
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
  let firstByteLogged = false;

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
    }

    const writeStream = fs.createWriteStream(tempFilePath, {
      highWaterMark: 8 * 1024 * 1024,
    });

    const progressTransform = new Transform({
      transform(chunk, encoding, callback) {
        if (!firstByteLogged && chunk && chunk.length) {
          firstByteLogged = true;
          log('🚀 DOWNLOAD INICIADO (HTTP): primeiro byte recebido do servidor', LOG_LEVELS.SUCCESS);
        }
        receivedBytes += chunk.length;
        resetIdleTimer();
        logProgress(false);
        callback(null, chunk);
      },
      highWaterMark: 8 * 1024 * 1024,
    });

    await pipeline(response.data, progressTransform, writeStream);

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
      }
    } catch {}
    throw error;
  }
}

// ============================================
// WEBHOOK
// ============================================
async function sendWebhook(payload) {
  if (!CONFIG.WEBHOOK_URL) {
    log('WEBHOOK_URL não configurado', LOG_LEVELS.WARN);
    return;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.WEBHOOK_SECRET) {
      headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;
    }

    await axios.post(CONFIG.WEBHOOK_URL, payload, { headers, timeout: 120000 });
    log('Webhook enviado com sucesso', LOG_LEVELS.SUCCESS);
  } catch (error) {
    log(`Erro ao enviar webhook: ${error.message}`, LOG_LEVELS.ERROR);
  }
}

async function updateProgress(status, etapa, extras = {}) {
  await sendWebhook({
    corretora_id: CONFIG.CORRETORA_ID,
    execucao_id: CONFIG.EXECUCAO_ID,
    github_run_id: CONFIG.GITHUB_RUN_ID,
    github_run_url: CONFIG.GITHUB_RUN_URL,
    update_progress: true,
    status,
    etapa_atual: etapa,
    ...extras,
  });
}

async function notifyStart() {
  await sendWebhook({
    corretora_id: CONFIG.CORRETORA_ID,
    execucao_id: CONFIG.EXECUCAO_ID,
    github_run_id: CONFIG.GITHUB_RUN_ID,
    github_run_url: CONFIG.GITHUB_RUN_URL,
    action: 'start',
  });
}

async function notifyError(message) {
  await sendWebhook({
    corretora_id: CONFIG.CORRETORA_ID,
    execucao_id: CONFIG.EXECUCAO_ID,
    github_run_id: CONFIG.GITHUB_RUN_ID,
    github_run_url: CONFIG.GITHUB_RUN_URL,
    action: 'error',
    error_message: message,
  });
}

// ============================================
// DEBUG
// ============================================
async function saveDebugInfo(page, prefix = 'debug') {
  try {
    const debugDir = CONFIG.DEBUG_DIR;
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const screenshotPath = path.join(debugDir, `${prefix}_${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    
    const htmlPath = path.join(debugDir, `${prefix}_${timestamp}.html`);
    const html = await page.content().catch(() => '');
    if (html) {
      fs.writeFileSync(htmlPath, html.substring(0, 50000));
    }
    
    log(`Debug salvo: ${screenshotPath}`, LOG_LEVELS.DEBUG);
  } catch (e) {
    log(`Erro ao salvar debug: ${e.message}`, LOG_LEVELS.WARN);
  }
}

// ============================================
// FECHAR POPUPS E MODAIS (PADRÃO COBRANÇA)
// ============================================
/**
 * Fechar popups genéricos - NÃO clica em botões que possam causar navegação
 * Usa ESC e remoção via CSS primeiro, depois botões seguros
 */
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
      
      // PRIMEIRA TENTATIVA: Via ESC e CSS (mais seguro - não causa navegação)
      const fechouViaEscCss = await page.evaluate(() => {
        let fechou = false;
        
        // 1. Simular ESC
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        
        // 2. Remover backdrops
        document.querySelectorAll('.modal-backdrop, .fade.show, .modal-backdrop.fade').forEach(b => {
          b.remove();
          fechou = true;
        });
        
        // 3. Esconder modais via CSS
        const modais = document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"]');
        modais.forEach(m => {
          m.classList.remove('show', 'in');
          m.style.display = 'none';
          fechou = true;
        });
        
        // 4. Limpar body
        if (document.body.classList.contains('modal-open')) {
          document.body.classList.remove('modal-open');
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
          fechou = true;
        }
        
        return fechou;
      });
      
      if (fechouViaEscCss) {
        log('Popup fechado via ESC/CSS', LOG_LEVELS.DEBUG);
        popupFechado = true;
        await page.waitForTimeout(500);
        continue;
      }
      
      // SEGUNDA TENTATIVA: Botões seguros (X, close icons)
      const seletoresSeguros = [
        '.modal.show button.close',
        '.modal.show .btn-close',
        '.modal button.close',
        '.modal .btn-close',
        '.modal .close',
        'button.close',
        '.close',
        '[data-dismiss="modal"]',
        '[data-bs-dismiss="modal"]',
        '[aria-label="Close"]',
        '.swal2-close',
      ];
      
      for (const seletor of seletoresSeguros) {
        try {
          const botoes = await page.$$(seletor);
          for (const botao of botoes) {
            const isVisible = await botao.isVisible().catch(() => false);
            if (isVisible) {
              log(`Popup detectado - fechando via: ${seletor}`, LOG_LEVELS.DEBUG);
              await botao.click({ force: true }).catch(() => {});
              await page.waitForTimeout(500);
              popupFechado = true;
              break;
            }
          }
          if (popupFechado) break;
        } catch {
          // Continuar tentando
        }
      }
      
      // Também tentar ESC via Playwright
      if (!popupFechado) {
        await page.keyboard.press('Escape').catch(() => {});
      }
      
    } catch (e) {
      // Silenciar
    }
  }
}

// ============================================
// DOWNLOAD CONTROLLER (IDÊNTICO AO ROBÔ DE COBRANÇA)
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
        // Ignorar
      }
    }
    this.cleanupFunctions = [];
    log(`Cleanup concluído`, LOG_LEVELS.DEBUG);
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

// ============================================
// VERIFICA SE RESPOSTA HTTP É EXCEL
// ============================================
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

    const request = response.request?.();
    const method = (request?.method?.() || 'GET').toUpperCase();
    
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

    // FALLBACK MGF: Hinova muitas vezes retorna o "Em Excel" como HTML via POST
    const isRelatorioLancamento = url.includes('relatoriolancamento.php');
    const isHtmlLike = contentType.includes('text/html') || contentType.includes('text/plain');
    const looksLikeAttachment = contentDisposition.includes('attachment');

    if (isRelatorioLancamento && method !== 'GET' && (looksLikeAttachment || isHtmlLike)) {
      return true;
    }

    if (isRelatorioLancamento && method === 'GET' && looksLikeAttachment) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

// ============================================
// PROCESSAR DOWNLOAD IMEDIATO (IDÊNTICO AO ROBÔ DE COBRANÇA)
// ============================================
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
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          fileSize = fs.statSync(p).size;
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
  log(`Arquivo salvo: ${semanticName} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
  return { filePath, size: stats.size };
}

// ============================================
// WATCHERS DE DOWNLOAD (PADRÃO COBRANÇA)
// ============================================
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
      
      await Promise.race([
        newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }),
        new Promise(resolve => setTimeout(resolve, 8000)),
      ]).catch(() => {});
      
      if (controller.isCaptured()) {
        try { newPage.removeListener('download', onNewPageDownload); } catch {}
        return;
      }
      
      // Procurar botões de download na nova aba
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
      
      controller.addCleanup(() => {
        try { newPage.removeListener('download', onNewPageDownload); } catch {}
      });
      
    } catch (err) {
      // Ignorar
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

function criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName) {
  const filePath = path.join(downloadDir, semanticName);
  
  const onResponse = async (response) => {
    if (controller.isCaptured()) return;
    
    if (!isExcelResponse(response)) return;
    
    log(`🌐 Resposta Excel detectada via HTTP: ${response.url().substring(0, 80)}...`, LOG_LEVELS.INFO);
    
    // Aguardar um pouco para ver se o Playwright captura como download
    await new Promise(r => setTimeout(r, 5000));
    
    if (controller.isCaptured()) {
      log(`Download já capturado via Playwright - ignorando HTTP stream`, LOG_LEVELS.DEBUG);
      return;
    }
    
    const wasCaptured = controller.setCaptured({
      type: 'httpResponse',
      response,
      source: 'httpWatcher',
    });
    
    if (!wasCaptured) return;
    
    try {
      const request = response.request();
      const url = response.url();
      const method = request.method();
      const postData = request.postData?.() || null;
      const headers = request.headers?.() || {};
      const cookies = await buildCookieHeader(context, url);
      
      const httpHeaders = {
        ...pickHeadersForHttpReplay(headers),
        cookie: cookies,
      };
      
      log(`Iniciando download via HTTP stream (fallback)...`, LOG_LEVELS.INFO);
      
      const result = await downloadViaAxiosStream({
        url,
        method,
        headers: httpHeaders,
        data: postData,
        filePath,
      });
      
      controller.setFileResult(result);
    } catch (e) {
      log(`Erro no download HTTP: ${e.message}`, LOG_LEVELS.ERROR);
      controller.setError(e);
    }
  };
  
  const attachToPage = (page) => {
    page.on('response', onResponse);
    controller.addCleanup(() => {
      try { page.removeListener('response', onResponse); } catch {}
    });
  };
  
  for (const p of context.pages()) {
    attachToPage(p);
  }
  
  context.on('page', (newPage) => {
    if (!controller.isCaptured()) {
      attachToPage(newPage);
    }
  });
}

async function aguardarDownloadHibrido(context, page, downloadDir, semanticName, timeoutMs) {
  log(`Iniciando captura de download...`, LOG_LEVELS.INFO);
  log(`Arquivo destino: ${path.join(downloadDir, semanticName)}`, LOG_LEVELS.DEBUG);
  
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
// LOGIN (PADRÃO COBRANÇA)
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

  // 3) Fallback DOM: se houver 4+ inputs visíveis, preencher o último vazio
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

async function realizarLogin(page) {
  setStep('LOGIN');
  
  let loginSucesso = false;

  const preencherCredenciais = async () => {
    // Código cliente (opcional dependendo do ambiente)
    if (CONFIG.HINOVA_CODIGO_CLIENTE) {
      const codigoSelectors = [
        'input[placeholder*="Código" i]',
        'input[placeholder*="cliente" i]',
        'input[name*="codigo" i]',
        'input[id*="codigo" i]',
        'input[name*="cliente" i]',
        'input[id*="cliente" i]',
        // fallback legado
        'input[placeholder=""]',
      ];

      let codigoPreenchido = false;
      for (const sel of codigoSelectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            await loc.fill(String(CONFIG.HINOVA_CODIGO_CLIENTE), { timeout: 5000 });
            codigoPreenchido = true;
            log(`Código cliente preenchido (${sel})`, LOG_LEVELS.DEBUG);
            break;
          }
        } catch {}
      }
      if (!codigoPreenchido) {
        log('Campo de código cliente não encontrado (pode ser opcional)', LOG_LEVELS.DEBUG);
      }
    }

    // Usuário (não usar input[type=text] genérico para não sobrescrever "Código Cliente")
    try {
      const userSelectors = [
        'input[placeholder*="Usuário" i]',
        'input[name*="usuario" i]',
        'input[id*="usuario" i]',
        'input[name*="login" i]',
        'input[id*="login" i]',
      ];
      for (const sel of userSelectors) {
        const loc = page.locator(sel).first();
        if (await loc.isVisible().catch(() => false)) {
          await loc.fill(String(CONFIG.HINOVA_USER), { timeout: 5000 });
          log(`Usuário preenchido (${sel})`, LOG_LEVELS.DEBUG);
          break;
        }
      }
    } catch (e) {
      log(`Erro ao preencher usuário: ${e.message}`, LOG_LEVELS.WARN);
    }

    // Senha
    try {
      const passSelectors = [
        'input[placeholder*="Senha" i]',
        'input[name*="senha" i]',
        'input[id*="senha" i]',
        'input[type="password"]',
      ];
      for (const sel of passSelectors) {
        const loc = page.locator(sel).first();
        if (await loc.isVisible().catch(() => false)) {
          await loc.fill(String(CONFIG.HINOVA_PASS), { timeout: 5000 });
          log(`Senha preenchida (${sel})`, LOG_LEVELS.DEBUG);
          break;
        }
      }
    } catch (e) {
      log(`Erro ao preencher senha: ${e.message}`, LOG_LEVELS.WARN);
    }

    // Fallback: preencher via JS (ordem típica: código, usuário, senha)
    await page
      .evaluate(({ codigoCliente, usuario, senha }) => {
        const isVisible = (el) => {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };

        const allInputs = Array.from(
          document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])')
        ).filter(isVisible);

        // Heurística: se existe password, preencher ele por tipo
        const pwd = allInputs.find((i) => (i.getAttribute('type') || '').toLowerCase() === 'password');
        if (pwd && senha && (!pwd.value || pwd.value === pwd.placeholder)) {
          pwd.value = senha;
          pwd.dispatchEvent(new Event('input', { bubbles: true }));
          pwd.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Preencher os 3 primeiros inputs visíveis (legado)
        if (allInputs.length >= 3) {
          if (codigoCliente && !allInputs[0].value) {
            allInputs[0].value = codigoCliente;
            allInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (usuario && (!allInputs[1].value || allInputs[1].value === allInputs[1].placeholder)) {
            allInputs[1].value = usuario;
            allInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (senha && (!allInputs[2].value || allInputs[2].value === allInputs[2].placeholder)) {
            allInputs[2].value = senha;
            allInputs[2].dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }, { codigoCliente: CONFIG.HINOVA_CODIGO_CLIENTE, usuario: CONFIG.HINOVA_USER, senha: CONFIG.HINOVA_PASS })
      .catch(() => {});
  };

  const dispensarCodigoAutenticacao = async () => {
    try {
      const selector = 'input[placeholder*="Autenticação" i]';
      const campoAuth = page.locator(selector).first();
      if (!(await campoAuth.isVisible().catch(() => false))) return false;

      await campoAuth.fill('').catch(() => {});
      await campoAuth.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
      await page.click('body', { position: { x: 20, y: 20 }, force: true }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);

      log('Código de autenticação dispensado', LOG_LEVELS.DEBUG);
      return true;
    } catch {
      return false;
    }
  };

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

  const clicarEntrar = async () => {
    const btnSelector =
      'button:has-text("Entrar"), input[value="Entrar"], .btn-primary, button.btn, #btn-login, input[type="submit"], button[type="submit"]';
    const btn = page.locator(btnSelector).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      return;
    }
    await page.locator('button:has-text("Entrar")').first().click({ force: true, timeout: 1000 }).catch(() => {});
  };

  const validarLoginAbrindoRelatorio = async () => {
    try {
      await page.goto(CONFIG.HINOVA_RELATORIO_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await page.waitForTimeout(1500);
      const url = String(page.url() || '').toLowerCase();
      return !url.includes('login.php') && url.includes('relatoriolancamento.php');
    } catch {
      return false;
    }
  };
  
  for (let tentativa = 1; tentativa <= LIMITS.MAX_LOGIN_RETRIES && !loginSucesso; tentativa++) {
    log(`Tentativa de login ${tentativa}/${LIMITS.MAX_LOGIN_RETRIES}...`);
    
    try {
      await fecharPopups(page);

      // Garantir que estamos na tela de login (ou que o formulário existe)
      await page
        .waitForSelector('input[type="password"], input[placeholder*="Usuário" i], button:has-text("Entrar")', {
          timeout: 15000,
        })
        .catch(() => {});

      await preencherCredenciais();

      // IMPORTANTE (MGF): layout NÃO é selecionado no login.
      // O layout (BI VANGARD) será selecionado apenas na tela do relatório.

      // Clique/Enter resiliente (padrão Cobrança)
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

      await fecharPopups(page);

      // Validação final (padrão Cobrança): se abrir o relatório sem voltar para login, consideramos logado.
      const okAbrirRelatorio = await validarLoginAbrindoRelatorio();
      if (okAbrirRelatorio) {
        loginSucesso = true;
        log(`Login bem sucedido na tentativa ${tentativa} (validação via relatório)`, LOG_LEVELS.SUCCESS);
        break;
      }

      // Se ainda estamos na login, seguimos tentando.
      const aindaNaLogin = await isAindaNaLogin();

      const erroMsg = await page
        .$eval('.alert-danger, .error, .erro, .message-error', (el) => el.textContent)
        .catch(() => null);
      if (erroMsg) {
        log(`Erro detectado: ${String(erroMsg).trim()}`, LOG_LEVELS.WARN);
      }

      log(`Tentativa ${tentativa} falhou - ainda na página de login`, LOG_LEVELS.WARN);
      await page.waitForTimeout(600);
      
    } catch (e) {
      log(`Erro na tentativa de login: ${e.message}`, LOG_LEVELS.WARN);
      await page.waitForTimeout(600);
    }
  }
  
  if (!loginSucesso) {
    throw new Error('Login falhou após múltiplas tentativas');
  }
}

// ============================================
// NAVEGAÇÃO PARA RELATÓRIO (DIRETO PARA A URL)
// ============================================
async function navegarParaRelatorio(page) {
  setStep('NAVEGACAO');

  const targetUrl = CONFIG.HINOVA_RELATORIO_URL;
  log(`Navegando para Relatório MGF: ${targetUrl}`, LOG_LEVELS.INFO);
  
  // Fechar popups antes de navegar
  await fecharPopups(page);
  
  // Navegar para a URL do relatório
  await page.goto(targetUrl, { 
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.PAGE_LOAD
  });
  
  log('Aguardando carregamento...', LOG_LEVELS.DEBUG);
  await page.waitForTimeout(5000);
  await fecharPopups(page);
  
  // Aguardar networkidle com fallback
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {
    log('NetworkIdle timeout - continuando...', LOG_LEVELS.WARN);
  });
  
  await fecharPopups(page);
  
  // Verificar URL atual
  const urlAtual = String(page.url() || '').toLowerCase();
  log(`URL após navegação: ${urlAtual}`, LOG_LEVELS.DEBUG);
  
  // Verificação de redirecionamento para login
  if (urlAtual.includes('login.php')) {
    await saveDebugInfo(page, 'redirect_login');
    throw new Error(`Navegação para relatório falhou: redirecionou para login`);
  }
  
  // Verificação se está na página correta
  if (!urlAtual.includes('relatoriolancamento.php')) {
    await saveDebugInfo(page, 'url_incorreta');
    throw new Error(`URL inesperada: ${page.url()}. Esperado: relatorioLancamento.php`);
  }

  log('Página de relatório aberta', LOG_LEVELS.SUCCESS);
  await saveDebugInfo(page, 'pagina_relatorio');
}

// ============================================
// CONFIGURAÇÃO DE FILTROS
// ============================================
async function configurarFiltros(page) {
  setStep('FILTROS');
  log('Configurando filtros...', LOG_LEVELS.INFO);
  
  await fecharPopups(page);
  
  // 1. SELECIONAR LAYOUT "BI VANGARD FINANCEIROS EVENTOS"
  log('📋 Selecionando layout...', LOG_LEVELS.INFO);
  
  const layoutSelecionado = await page.evaluate(({ desiredLayout }) => {
    const normalizar = (t) =>
      (t || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    
    const desired = normalizar(desiredLayout);
    
    // Procurar selects que parecem ser de layout/visualização
    const selects = Array.from(document.querySelectorAll('select'));
    
    for (const select of selects) {
      const selectName = (select.name || select.id || '').toLowerCase();
      const options = Array.from(select.options || []);
      const optionTexts = options.map(o => (o.textContent || o.value || '').trim());
      const normOptions = optionTexts.map(normalizar);
      
      // Procurar opção que contenha "bi vangard" e "eventos" ou "financeiro"
      let idx = normOptions.findIndex(t => 
        (t.includes('bi') && t.includes('vangard') && (t.includes('evento') || t.includes('financeiro'))) ||
        t.includes(desired)
      );
      
      if (idx >= 0) {
        select.selectedIndex = idx;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, selected: optionTexts[idx], selectName };
      }
    }
    
    return { ok: false };
  }, { desiredLayout: CONFIG.HINOVA_LAYOUT });
  
  if (layoutSelecionado.ok) {
    log(`✅ Layout selecionado: ${layoutSelecionado.selected}`, LOG_LEVELS.SUCCESS);
    await page.waitForTimeout(3000); // Aguardar carregar opções do layout
    await fecharPopups(page);
  } else {
    log(`⚠️ Layout não encontrado automaticamente, continuando...`, LOG_LEVELS.WARN);
    await saveDebugInfo(page, 'layout_nao_encontrado');
  }
  
  // 2. CONFIGURAR CHECKBOXES DE CENTRO DE CUSTO (APENAS EVENTOS)
  log('📋 Configurando Centro de Custo (apenas EVENTOS)...', LOG_LEVELS.INFO);
  
  const centroCustoResult = await page.evaluate(() => {
    const normalize = (s) =>
      (s || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
    
    const getLabelText = (input) => {
      const id = input.getAttribute('id');
      if (id) {
        const lb = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lb && lb.textContent) return lb.textContent;
      }
      const label = input.closest('label');
      if (label && label.textContent) return label.textContent;
      const parent = input.parentElement;
      if (parent && parent.textContent) return parent.textContent;
      const next = input.nextSibling;
      if (next && next.textContent) return next.textContent;
      return '';
    };
    
    // Procurar container de Centro de Custo
    let container = null;
    const allElements = document.querySelectorAll('fieldset, div, table, form, td');
    
    for (const el of allElements) {
      const text = normalize(el.textContent || '');
      if (text.includes('CENTRO DE CUSTO') || text.includes('CENTRO CUSTO') || text.includes('DEPARTAMENTO')) {
        const checkboxes = el.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length > 0 && checkboxes.length < 500) {
          container = el;
          break;
        }
      }
    }
    
    if (!container) {
      // Fallback: procurar todos os checkboxes da página
      container = document.body;
    }
    
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    let marcados = 0;
    let desmarcados = 0;
    let alterados = 0;
    const detalhes = [];
    
    for (const input of checkboxes) {
      const labelText = normalize(getLabelText(input));
      if (!labelText || labelText === 'TODOS') continue;
      
      // Marcar APENAS os que contêm "EVENTO"
      const shouldCheck = labelText.includes('EVENTO');
      
      if (input.checked !== shouldCheck) {
        input.checked = shouldCheck;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        alterados++;
      }
      
      if (shouldCheck) {
        marcados++;
        detalhes.push(labelText.substring(0, 30));
      } else {
        desmarcados++;
      }
    }
    
    return {
      ok: marcados > 0,
      total: checkboxes.length,
      marcados,
      desmarcados,
      alterados,
      detalhes: detalhes.slice(0, 5),
    };
  });
  
  if (centroCustoResult.ok) {
    log(`✅ Centro de Custo: ${centroCustoResult.marcados} EVENTOS marcados, ${centroCustoResult.desmarcados} outros desmarcados`, LOG_LEVELS.SUCCESS);
    if (centroCustoResult.detalhes.length > 0) {
      log(`   Marcados: ${centroCustoResult.detalhes.join(', ')}`, LOG_LEVELS.DEBUG);
    }
  } else {
    log(`⚠️ Nenhum checkbox EVENTOS encontrado (total: ${centroCustoResult.total})`, LOG_LEVELS.WARN);
  }
  
  await fecharPopups(page);
  await page.waitForTimeout(1000);
  
  // 3. SELECIONAR FORMATO "EM EXCEL"
  log('📋 Selecionando formato Em Excel...', LOG_LEVELS.INFO);
  
  const excelSelecionado = await page.evaluate(() => {
    // Procurar radio buttons
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    
    for (const radio of radios) {
      // Pegar texto do container
      const containers = [
        radio.closest('tr'),
        radio.closest('td'),
        radio.closest('label'),
        radio.closest('div'),
        radio.parentElement,
      ].filter(Boolean);
      
      for (const container of containers) {
        const text = (container.textContent || '').toLowerCase();
        if (text.includes('excel') && !text.includes('tela')) {
          if (radio.disabled) continue;
          
          // Desmarcar outros do mesmo grupo
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
          
          return { ok: true, text: text.substring(0, 50) };
        }
      }
    }
    
    return { ok: false };
  });
  
  if (excelSelecionado.ok) {
    log(`✅ Formato Excel selecionado`, LOG_LEVELS.SUCCESS);
  } else {
    log(`⚠️ Radio "Em Excel" não encontrado automaticamente`, LOG_LEVELS.WARN);
  }
  
  await fecharPopups(page);
  await saveDebugInfo(page, 'filtros_configurados');
  log('Filtros configurados', LOG_LEVELS.SUCCESS);
}

// ============================================
// GERAR RELATÓRIO E AGUARDAR DOWNLOAD
// ============================================
async function gerarRelatorio(page, context) {
  setStep('GERACAO');
  log('Gerando relatório...', LOG_LEVELS.INFO);
  
  await fecharPopups(page);
  
  // Preparar download
  const downloadDir = getDownloadDirectory();
  const semanticName = generateSemanticFilename();
  
  // Procurar e clicar no botão de gerar
  const gerarResult = await page.evaluate(() => {
    const normalize = (s) =>
      (s || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    
    // Scoring de botões
    const scoreButton = (el) => {
      const text = normalize(el.textContent || el.value || '');
      const name = normalize(el.name || '');
      const id = normalize(el.id || '');
      const combined = `${text} ${name} ${id}`;
      
      let score = 0;
      
      // Positivo
      if (combined.includes('gerar')) score += 50;
      if (combined.includes('relatorio')) score += 30;
      if (combined.includes('exportar')) score += 40;
      if (combined.includes('baixar')) score += 35;
      if (combined.includes('excel')) score += 20;
      
      // Negativo (evitar botões errados)
      if (combined.includes('fechar')) score -= 100;
      if (combined.includes('liberar')) score -= 80;
      if (combined.includes('cancelar')) score -= 80;
      if (combined.includes('limpar')) score -= 60;
      
      return { el, score, text };
    };
    
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
    const scored = buttons.map(scoreButton).filter(b => b.score > 0);
    scored.sort((a, b) => b.score - a.score);
    
    if (scored.length === 0) {
      return { ok: false, reason: 'no_button_found' };
    }
    
    const best = scored[0];
    best.el.click();
    
    return { ok: true, clicked: best.text, score: best.score };
  });
  
  if (!gerarResult.ok) {
    await saveDebugInfo(page, 'botao_gerar_nao_encontrado');
    throw new Error('Botão de gerar relatório não encontrado');
  }
  
  log(`Botão clicado: "${gerarResult.clicked}" (score: ${gerarResult.score})`, LOG_LEVELS.SUCCESS);
  
  // Aguardar download
  log('Aguardando download do relatório...', LOG_LEVELS.INFO);
  
  const downloadResult = await aguardarDownloadHibrido(
    context,
    page,
    downloadDir,
    semanticName,
    TIMEOUTS.DOWNLOAD_HARD
  );
  
  if (!downloadResult.success) {
    await saveDebugInfo(page, 'download_falhou');
    throw downloadResult.error || new Error('Download do relatório falhou');
  }
  
  log(`Relatório baixado: ${downloadResult.filePath}`, LOG_LEVELS.SUCCESS);
  return downloadResult;
}

// ============================================
// PROCESSAMENTO DE ARQUIVO
// ============================================
function detectFileType(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    
    // ZIP (XLSX)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return { type: 'xlsx' };
    }
    
    // XLS (BIFF)
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
      return { type: 'xls' };
    }
    
    // HTML
    const textStart = buffer.toString('utf8', 0, 8).toLowerCase();
    if (textStart.includes('<') || textStart.includes('<!doctype') || textStart.includes('<html')) {
      return { type: 'html' };
    }
    
    return { type: 'unknown' };
  } catch (e) {
    return { type: 'unknown', error: e.message };
  }
}

function parseMoneyValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).replace(/\s/g, '');
  if (str === '-' || str === '') return null;
  
  // Formato BR: 1.234,56
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
  }
  
  // Formato US: 1,234.56
  if (/^\d{1,3}(,\d{3})*\.\d{2}$/.test(str)) {
    return parseFloat(str.replace(/,/g, ''));
  }
  
  // Simples: 1234.56 ou 1234,56
  const clean = str.replace(/[^\d,.-]/g, '');
  if (clean.includes(',') && !clean.includes('.')) {
    return parseFloat(clean.replace(',', '.'));
  }
  
  return parseFloat(clean) || null;
}

function parseExcelDate(val) {
  if (!val || val === '-') return null;
  
  const str = String(val).trim();
  
  // DD/MM/YYYY
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  
  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return str;
  }
  
  // Excel serial number
  if (typeof val === 'number' && val > 10000 && val < 100000) {
    const date = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  return null;
}

// Mapeamento de colunas MGF
const COLUMN_MAP = {
  // Centro de Custo / Departamento
  'centro de custo': 'Centro Custo',
  'centro custo': 'Centro Custo',
  'departamento': 'Departamento',
  
  // Valores
  'valor': 'Valor',
  'valor total': 'Valor Total',
  
  // Datas
  'data': 'Data',
  'data lancamento': 'Data Lancamento',
  'data vencimento': 'Data Vencimento',
  'data pagamento': 'Data Pagamento',
  
  // Identificação
  'descricao': 'Descricao',
  'historico': 'Historico',
  'documento': 'Documento',
  'numero': 'Numero',
  
  // Associado
  'nome': 'Nome',
  'placa': 'Placa',
  'placas': 'Placas',
  'voluntario': 'Voluntario',
  'associado': 'Associado',
  
  // Outros
  'tipo': 'Tipo',
  'status': 'Status',
  'situacao': 'Situacao',
  'observacao': 'Observacao',
};

function normalizeHeader(header) {
  return String(header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function processarExcel(filePath) {
  setStep('PROCESSAMENTO_EXCEL');
  log(`Processando arquivo Excel: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  log(`Total de linhas brutas: ${rawData.length}`, LOG_LEVELS.DEBUG);
  
  if (rawData.length === 0) {
    return [];
  }
  
  const headersOriginais = Object.keys(rawData[0]);
  log(`Colunas: ${headersOriginais.length}`, LOG_LEVELS.DEBUG);
  
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
  
  const dados = [];
  for (const row of rawData) {
    const rowData = {};
    let temDados = false;
    
    for (const [originalHeader, mappedHeader] of Object.entries(headerMapping)) {
      let value = row[originalHeader];
      
      if (mappedHeader.includes('Data')) {
        value = parseExcelDate(value);
      } else if (mappedHeader === 'Valor' || mappedHeader === 'Valor Total') {
        value = parseMoneyValue(value);
      } else {
        value = value ? String(value).trim() : null;
      }
      
      if (value !== null && value !== '') {
        rowData[mappedHeader] = value;
        temDados = true;
      }
    }
    
    if (temDados) {
      dados.push(rowData);
    }
  }
  
  log(`Registros válidos: ${dados.length}`, LOG_LEVELS.SUCCESS);
  return dados;
}

function processarHtml(filePath) {
  setStep('PROCESSAMENTO_HTML');
  log(`Processando arquivo HTML: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extrair tabelas
  const tableMatch = content.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (!tableMatch || tableMatch.length === 0) {
    log('Nenhuma tabela encontrada no HTML', LOG_LEVELS.WARN);
    return [];
  }
  
  // Pegar a maior tabela
  let largestTable = tableMatch[0];
  for (const t of tableMatch) {
    if (t.length > largestTable.length) {
      largestTable = t;
    }
  }
  
  // Extrair linhas
  const rowMatches = largestTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows = [];
  
  for (const rowHtml of rowMatches) {
    const cells = [];
    const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
    for (const cellHtml of cellMatches) {
      const text = cellHtml.replace(/<[^>]+>/g, '').trim();
      cells.push(text);
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  log(`Linhas extraídas do HTML: ${rows.length}`, LOG_LEVELS.DEBUG);
  
  if (rows.length < 2) {
    return [];
  }
  
  // Primeira linha como header
  const headers = rows[0].map(normalizeHeader);
  
  const headerMapping = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (COLUMN_MAP[h]) {
      headerMapping[i] = COLUMN_MAP[h];
    } else {
      for (const [key, value] of Object.entries(COLUMN_MAP)) {
        if (h.includes(key) || key.includes(h)) {
          headerMapping[i] = value;
          break;
        }
      }
    }
  }
  
  const dados = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowData = {};
    let temDados = false;
    
    for (let j = 0; j < cells.length && j < headerMapping.length; j++) {
      const mappedHeader = headerMapping[j];
      if (!mappedHeader) continue;
      
      let value = cells[j];
      
      if (mappedHeader.includes('Data')) {
        value = parseExcelDate(value);
      } else if (mappedHeader === 'Valor' || mappedHeader === 'Valor Total') {
        value = parseMoneyValue(value);
      } else {
        value = value ? String(value).trim() : null;
      }
      
      if (value !== null && value !== '') {
        rowData[mappedHeader] = value;
        temDados = true;
      }
    }
    
    if (temDados) {
      dados.push(rowData);
    }
  }
  
  log(`Registros válidos do HTML: ${dados.length}`, LOG_LEVELS.SUCCESS);
  return dados;
}

async function processarArquivo(filePath) {
  const fileType = detectFileType(filePath);
  
  if (fileType.type === 'html') {
    log(`Formato detectado: HTML`, LOG_LEVELS.INFO);
    return processarHtml(filePath);
  }
  
  log(`Formato detectado: ${fileType.type.toUpperCase()}`, LOG_LEVELS.INFO);
  return processarExcel(filePath);
}

// ============================================
// ENVIAR WEBHOOK COM DADOS
// ============================================
async function enviarDados(dados, nomeArquivo) {
  setStep('IMPORTACAO');
  
  if (!CONFIG.WEBHOOK_URL) {
    log('WEBHOOK_URL não configurado', LOG_LEVELS.WARN);
    return false;
  }
  
  const headers = { 'Content-Type': 'application/json' };
  if (CONFIG.WEBHOOK_SECRET) headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;
  
  const BATCH_SIZE = 1000;
  const total = dados.length;
  const totalChunks = Math.ceil(total / BATCH_SIZE);
  let importacaoId = null;
  let enviados = 0;
  
  log(`Enviando ${total} registros em ${totalChunks} lotes...`, LOG_LEVELS.INFO);
  
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
      total_registros: total,
      chunk_index: chunkIndex,
      chunk_total: totalChunks,
    };
    
    try {
      const response = await axios.post(CONFIG.WEBHOOK_URL, payload, {
        headers,
        timeout: 600000,
      });
      
      if (!importacaoId && response.data?.importacao_id) {
        importacaoId = response.data.importacao_id;
      }
      
      enviados += batch.length;
      const pct = Math.min(100, Math.floor((enviados / total) * 100));
      log(`   Lote ${chunkIndex}/${totalChunks}: ${pct}% (${enviados}/${total})`, LOG_LEVELS.INFO);
      
    } catch (error) {
      log(`Erro no lote ${chunkIndex}: ${error.message}`, LOG_LEVELS.ERROR);
      return false;
    }
  }
  
  log(`Dados enviados com sucesso: ${enviados} registros`, LOG_LEVELS.SUCCESS);
  return true;
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================
async function main() {
  setStep('VALIDACAO');
  
  if (!CONFIG.HINOVA_USER || !CONFIG.HINOVA_PASS) {
    throw new Error('HINOVA_USER e HINOVA_PASS são obrigatórios');
  }
  if (!CONFIG.WEBHOOK_URL) {
    throw new Error('WEBHOOK_URL é obrigatório');
  }

  log('='.repeat(60));
  log('INICIANDO ROBÔ MGF HINOVA');
  log('='.repeat(60));
  log(`URL Login: ${CONFIG.HINOVA_URL}`, LOG_LEVELS.INFO);
  log(`URL Relatório: ${CONFIG.HINOVA_RELATORIO_URL}`, LOG_LEVELS.INFO);
  log(`Layout: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.INFO);
  log(`Corretora ID: ${CONFIG.CORRETORA_ID}`, LOG_LEVELS.INFO);
  log('='.repeat(60));
  
  // Notificar início
  await notifyStart();
  
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
    
    // 1. LOGIN
    setStep('LOGIN');
    await page.goto(CONFIG.HINOVA_URL, { 
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_LOAD 
    });
    await page.waitForTimeout(3000);
    await realizarLogin(page);
    
    await updateProgress('executando', 'Login realizado');
    
    // 2. NAVEGAR PARA RELATÓRIO
    await navegarParaRelatorio(page);
    await updateProgress('executando', 'Página do relatório aberta');
    
    // 3. CONFIGURAR FILTROS
    await configurarFiltros(page);
    await updateProgress('executando', 'Filtros configurados');
    
    // 4. GERAR E BAIXAR RELATÓRIO
    const downloadResult = await gerarRelatorio(page, context);
    await updateProgress('executando', 'Download concluído');
    
    // 5. PROCESSAR ARQUIVO
    setStep('PROCESSAMENTO');
    const dados = await processarArquivo(downloadResult.filePath);
    
    if (dados.length === 0) {
      throw new Error('Nenhum registro encontrado no arquivo');
    }
    
    log(`Total de registros processados: ${dados.length}`, LOG_LEVELS.SUCCESS);
    await updateProgress('executando', 'Arquivo processado', { registros_total: dados.length });
    
    // 6. ENVIAR DADOS
    const nomeArquivo = path.basename(downloadResult.filePath);
    const enviado = await enviarDados(dados, nomeArquivo);
    
    if (!enviado) {
      throw new Error('Falha ao enviar dados via webhook');
    }
    
    // 7. LIMPAR ARQUIVO
    try {
      fs.unlinkSync(downloadResult.filePath);
      log('Arquivo temporário removido', LOG_LEVELS.DEBUG);
    } catch {}
    
    // Sucesso
    await sendWebhook({
      corretora_id: CONFIG.CORRETORA_ID,
      execucao_id: CONFIG.EXECUCAO_ID,
      github_run_id: CONFIG.GITHUB_RUN_ID,
      github_run_url: CONFIG.GITHUB_RUN_URL,
      action: 'complete',
      registros_total: dados.length,
    });
    
    log('='.repeat(60));
    log('ROBÔ MGF HINOVA CONCLUÍDO COM SUCESSO', LOG_LEVELS.SUCCESS);
    log('='.repeat(60));
    
  } catch (error) {
    log(`ERRO FATAL: ${error.message}`, LOG_LEVELS.ERROR);
    await saveDebugInfo(page, 'erro_fatal').catch(() => {});
    await notifyError(error.message);
    throw error;
    
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      log('Browser fechado', LOG_LEVELS.DEBUG);
    }
  }
}

// Executar
main().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});
