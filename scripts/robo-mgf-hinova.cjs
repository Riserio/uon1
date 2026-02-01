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
 * 2. Navegar para MGF > Relatórios > 5.1 de Lançamentos
 * 3. Selecionar Centro de Custo/Departamento (apenas com "EVENTOS")
 * 4. Selecionar Layout "BI VANGARD FINANCEIROS EVENTOS"
 * 5. Selecionar tipo de relatório "Em Excel"
 * 6. Gerar e baixar relatório (usando estratégia híbrida como cobrança)
 * 7. Enviar dados via webhook
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
// CONFIGURAÇÃO
// ============================================

function deriveRelatorioUrl(loginUrl) {
  try {
    const cleaned = String(loginUrl || '').trim();
    const url = new URL(cleaned);
    const pathParts = url.pathname.split('/');
    const basePathParts = pathParts.filter(p => 
      p && !p.includes('login') && !p.includes('Principal') && p !== 'v5'
    );
    const basePath = '/' + basePathParts.join('/');
    return `${url.origin}${basePath}/mgf/relatorio/relatorioLancamento.php`;
  } catch (e) {
    return 'https://eris.hinova.com.br/sga/sgav4_valecar/mgf/relatorio/relatorioLancamento.php';
  }
}

const HINOVA_URL = String(process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php').trim();
const HINOVA_RELATORIO_URL_DERIVED = deriveRelatorioUrl(HINOVA_URL);

// Log imediato na carga do script para debug de URL
console.log(`[MGF CONFIG] HINOVA_URL: "${HINOVA_URL}"`);
console.log(`[MGF CONFIG] Derived relatorio URL: "${HINOVA_RELATORIO_URL_DERIVED}"`);

const CONFIG = {
  HINOVA_URL: HINOVA_URL,
  HINOVA_RELATORIO_URL: process.env.HINOVA_RELATORIO_URL || HINOVA_RELATORIO_URL_DERIVED,
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  HINOVA_CODIGO_CLIENTE: process.env.HINOVA_CODIGO_CLIENTE || '',
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

console.log(`[MGF CONFIG] HINOVA_LAYOUT env: "${process.env.HINOVA_LAYOUT || 'não definido'}"`);
console.log(`[MGF CONFIG] Final HINOVA_LAYOUT: "${CONFIG.HINOVA_LAYOUT}"`);

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
// FECHAR POPUPS E MODAIS
// ============================================
async function fecharPopups(page, maxTentativas = LIMITS.MAX_POPUP_CLOSE_ATTEMPTS) {
  let popupFechado = true;
  let tentativas = 0;
  
  while (popupFechado && tentativas < maxTentativas) {
    popupFechado = false;
    tentativas++;
    
    try {
      await page.waitForTimeout(TIMEOUTS.POPUP_CLOSE);
      
      const seletoresFechar = [
        'button:has-text("Fechar")',
        'a:has-text("Fechar")',
        '.btn:has-text("Fechar")',
        'input[value="Fechar"]',
        'button:has-text("Continuar e Fechar")',
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
        '#myModal .close',
        '#myModal button.close',
        '#myModal [data-dismiss="modal"]',
        // Seletores específicos para popup de suporte Hinova
        '.modal button:has-text("Fechar")',
        '.modal input[value="Fechar"]',
        'form button:has-text("Fechar")',
        'div[class*="modal"] button:has-text("Fechar")',
        'div[class*="dialog"] button:has-text("Fechar")',
      ];
      
      for (const seletor of seletoresFechar) {
        try {
          const el = page.locator(seletor).first();
          if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
            await el.click({ force: true, timeout: 2000 }).catch(() => {});
            log(`Popup/modal fechado via: ${seletor}`, LOG_LEVELS.DEBUG);
            popupFechado = true;
            await page.waitForTimeout(500);
            break;
          }
        } catch {}
      }
      
      // Fallback JavaScript - busca específica para popup de suporte Hinova
      if (!popupFechado) {
        const fechouViaJS = await page.evaluate(() => {
          let fechou = false;
          
          // Buscar especificamente pelo popup de suporte Hinova
          // Texto característico: "suporte", "liberar o usuário", "quanto tempo"
          const allTextElements = document.querySelectorAll('div, td, span, p, label, form');
          for (const el of allTextElements) {
            const text = (el.textContent || '').toLowerCase();
            if (text.includes('suporte') || text.includes('liberar o usuário') || text.includes('quanto tempo')) {
              // Encontrou popup de suporte - buscar botão Fechar no container
              const container = el.closest('div, table, form, .modal');
              if (container) {
                const buttons = container.querySelectorAll('button, input[type="button"], a, .btn');
                for (const btn of buttons) {
                  const btnText = (btn.textContent || btn.value || '').toLowerCase().trim();
                  if (btnText === 'fechar' || btnText.includes('fechar')) {
                    const style = window.getComputedStyle(btn);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                      btn.click();
                      fechou = true;
                      console.log('[MGF] Popup de suporte Hinova fechado');
                      break;
                    }
                  }
                }
              }
              if (fechou) break;
            }
          }
          
          // Fallback genérico: buscar qualquer botão "Fechar" visível
          if (!fechou) {
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
      // Silenciar
    }
  }
}

// ============================================
// AGUARDAR COM VERIFICAÇÃO DE POPUPS (NOVO)
// ============================================
/**
 * Aguarda um tempo específico enquanto verifica e fecha popups periodicamente.
 * Útil para esperas longas onde popups podem aparecer a qualquer momento.
 */
async function aguardarComFecharPopups(page, tempoMs, intervaloMs = 3000) {
  const inicio = Date.now();
  let iteracoes = 0;
  
  while (Date.now() - inicio < tempoMs) {
    // Verificação rápida de popups (máximo 2 tentativas por iteração)
    await fecharPopups(page, 2);
    iteracoes++;
    
    const tempoRestante = tempoMs - (Date.now() - inicio);
    if (tempoRestante <= 0) break;
    
    // Aguardar o intervalo ou o tempo restante (o que for menor)
    await page.waitForTimeout(Math.min(intervaloMs, tempoRestante));
  }
  
  if (iteracoes > 1) {
    log(`Aguardou ${Math.round(tempoMs / 1000)}s com ${iteracoes} verificações de popups`, LOG_LEVELS.DEBUG);
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

    // Método do request (importante para diferenciar o carregamento normal da página do disparo do relatório)
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

    // ============================================================
    // FALLBACK CRÍTICO (MGF): Hinova muitas vezes retorna o "Em Excel"
    // como HTML (tabela) via POST, sem Content-Disposition e sem
    // disparar evento de download do Playwright.
    //
    // Nesses casos, precisamos tratar a resposta como "arquivo" e
    // baixá-la via HTTP stream (replay do request) para não travar.
    // ============================================================
    const isRelatorioLancamento = url.includes('relatoriolancamento.php');
    const hasDownloadHintsInUrl = /\b(excel|xls|xlsx|export|download|gerar)\b/i.test(url);
    const isHtmlLike = contentType.includes('text/html') || contentType.includes('text/plain');
    const looksLikeAttachment = contentDisposition.includes('attachment');

    // Regra: se for o endpoint do relatório e o request for POST, aceitar mesmo que seja HTML.
    // Evita capturar o GET normal da tela (carregamento da página).
    if (isRelatorioLancamento && method !== 'GET' && (looksLikeAttachment || isHtmlLike)) {
      return true;
    }

    // Algumas instalações fazem GET com querystring indicando exportação.
    if (isRelatorioLancamento && method === 'GET' && looksLikeAttachment) {
      return true;
    }

    if (isRelatorioLancamento && hasDownloadHintsInUrl && (looksLikeAttachment || isHtmlLike) && (contentLength === 0 || contentLength > 1000)) {
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

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log(`Download concluído em ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`, LOG_LEVELS.SUCCESS);
  log(`Arquivo salvo com sucesso: ${semanticName} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
  return { filePath, size: stats.size };
}

// ============================================
// WATCHERS DE DOWNLOAD (IDÊNTICOS AO ROBÔ DE COBRANÇA)
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
      log(`Nova aba/popup detectado: configurando listener de download... (url=${newPage.url() || 'n/a'})`, LOG_LEVELS.DEBUG);
      
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
      
      // Aguardar carregamento inicial
      await Promise.race([
        newPage.waitForLoadState('domcontentloaded', { timeout: 15000 }),
        new Promise(resolve => setTimeout(resolve, 15000)),
      ]).catch(() => {});
      
      if (controller.isCaptured()) {
        try { newPage.removeListener('download', onNewPageDownload); } catch {}
        return;
      }
      
      // ============================================
      // FALLBACK CRÍTICO: Nova aba carregou conteúdo inline (sem evento download)
      // O portal Hinova às vezes abre o Excel/HTML direto na aba ao invés de disparar download.
      // Precisamos verificar se a aba contém o relatório e salvá-lo manualmente.
      // ============================================
      const newPageUrl = newPage.url();
      const isReportPage = /relatoriolancamento/i.test(newPageUrl) || /gerar|export|download|excel/i.test(newPageUrl);
      
      if (isReportPage || newPageUrl === 'about:blank') {
        // Aguardar um pouco mais para ver se o download dispara
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        if (controller.isCaptured()) {
          try { newPage.removeListener('download', onNewPageDownload); } catch {}
          return;
        }
        
        // Verificar se o conteúdo da nova aba é o próprio relatório
        try {
          const pageContent = await newPage.content().catch(() => '');
          const contentLength = pageContent.length;
          
          // Se a página tem conteúdo substancial (não é só uma página de carregamento)
          // e parece ser HTML com tabela, podemos salvar diretamente
          if (contentLength > 5000 && (pageContent.includes('<table') || pageContent.includes('<TABLE'))) {
            log(`Nova aba contém tabela HTML (${formatBytes(contentLength)}) - salvando como arquivo...`, LOG_LEVELS.INFO);
            
            const wasCaptured = controller.setCaptured({ 
              type: 'inlineContent', 
              source: 'newTabInline', 
              newPage 
            });
            
            if (wasCaptured) {
              const filePath = path.join(downloadDir, semanticName);
              fs.writeFileSync(filePath, pageContent, 'utf8');
              const stats = fs.statSync(filePath);
              log(`✅ Conteúdo inline salvo: ${filePath} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
              controller.setFileResult({ filePath, size: stats.size });
              newPage.close().catch(() => {});
              return;
            }
          }
        } catch (e) {
          log(`Erro ao verificar conteúdo inline da nova aba: ${e.message}`, LOG_LEVELS.DEBUG);
        }
      }
      
      // Tentar clicar em links de download na nova aba (comportamento original)
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
      log(`Erro ao processar nova aba: ${err.message}`, LOG_LEVELS.DEBUG);
    }
  };
  
  const onNewPage = (newPage) => {
    if (newPage !== mainPage) {
      processarNovaAba(newPage);
    }
  };
  
  context.on('page', onNewPage);

  // Alguns portais disparam via window.open (popup). Isso é equivalente a nova aba.
  const onPopup = (popupPage) => {
    if (popupPage && popupPage !== mainPage) {
      processarNovaAba(popupPage);
    }
  };
  mainPage.on('popup', onPopup);
  
  controller.addCleanup(() => {
    try { context.removeListener('page', onNewPage); } catch {}
    try { mainPage.removeListener('popup', onPopup); } catch {}
  });
}

function criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onResponse = async (response) => {
    if (controller.isCaptured()) return;
    
    if (isExcelResponse(response)) {
      const req = response.request?.();
      const method = (req?.method?.() || 'GET').toUpperCase();
      const headers = response.headers() || {};
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const contentType = String(headers['content-type'] || '');
      const contentDisposition = String(headers['content-disposition'] || '');
      const url = String(response.url?.() || '');

      log(
        `Resposta candidata a download (fallback HTTP): ${method} ${url} | content-type="${contentType}" | content-disposition="${contentDisposition}" | len=${contentLength || 'n/a'}`,
        LOG_LEVELS.DEBUG
      );
      
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
        
        controller.setFileResult({ filePath, size: result.size });
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

// ============================================
// AGUARDAR DOWNLOAD HÍBRIDO (IDÊNTICO AO ROBÔ DE COBRANÇA)
// ============================================
async function aguardarDownloadHibrido(context, page, downloadDir, semanticName, timeoutMs) {
  log(`Iniciando captura de download...`, LOG_LEVELS.INFO);
  log(`Arquivo destino: ${path.join(downloadDir, semanticName)}`, LOG_LEVELS.DEBUG);
  log(`PRIORIDADE: Download Playwright (saveAs) > HTTP Stream (fallback)`, LOG_LEVELS.DEBUG);
  
  const controller = new DownloadController();
  
  // Ordem: Playwright primeiro, HTTP stream como fallback
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
// LOGIN (IDÊNTICO AO ROBÔ DE COBRANÇA)
// ============================================
async function realizarLogin(page) {
  setStep('LOGIN');
  log(`Acessando: ${CONFIG.HINOVA_URL}`, LOG_LEVELS.INFO);
  
  await page.goto(CONFIG.HINOVA_URL, { waitUntil: 'networkidle', timeout: TIMEOUTS.PAGE_LOAD });
  await page.waitForTimeout(2000);
  
  await fecharPopups(page);
  
  const userInput = page.locator('input[name="usuario"], input[name="login"], input[id*="usuario"], input[id*="login"], input[type="text"]').first();
  const passInput = page.locator('input[name="senha"], input[name="password"], input[type="password"]').first();
  
  if (await userInput.isVisible()) {
    await userInput.fill(CONFIG.HINOVA_USER);
    log('Usuário preenchido', LOG_LEVELS.DEBUG);
  }
  
  if (await passInput.isVisible()) {
    await passInput.fill(CONFIG.HINOVA_PASS);
    log('Senha preenchida', LOG_LEVELS.DEBUG);
  }
  
  if (CONFIG.HINOVA_CODIGO_CLIENTE) {
    const codigoInput = page.locator('input[name*="codigo"], input[id*="codigo"], input[placeholder*="Código"]').first();
    if (await codigoInput.isVisible().catch(() => false)) {
      await codigoInput.fill(CONFIG.HINOVA_CODIGO_CLIENTE);
      log('Código do cliente preenchido', LOG_LEVELS.DEBUG);
    }
  }
  
  await fecharPopups(page);
  
  const loginBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Login"), a:has-text("Entrar")').first();
  
  let loginSucesso = false;
  
  const isAindaNaLogin = async () => {
    const relatorioVisible = await page.locator('text=Relatório').first().isVisible().catch(() => false);
    if (relatorioVisible) return false;
    
    const esqueceuVisible = await page.locator('text=Esqueci minha senha').first().isVisible().catch(() => false);
    const codigoClienteVisible = await page.locator('text=Código cliente').first().isVisible().catch(() => false);
    if (esqueceuVisible || codigoClienteVisible) return true;
    
    const currentUrl = page.url();
    return currentUrl.includes('login');
  };
  
  for (let tentativa = 1; tentativa <= LIMITS.MAX_LOGIN_RETRIES; tentativa++) {
    try {
      await fecharPopups(page);
      
      if (!(await isAindaNaLogin())) {
        loginSucesso = true;
        break;
      }
      
      log(`Tentativa de login ${tentativa}/${LIMITS.MAX_LOGIN_RETRIES}...`, LOG_LEVELS.INFO);
      
      await loginBtn.click({ timeout: 5000 }).catch(async () => {
        await fecharPopups(page);
        await loginBtn.click({ force: true, timeout: 5000 }).catch(() => {});
      });
      
      await page.waitForTimeout(TIMEOUTS.LOGIN_RETRY_WAIT);
      
      await fecharPopups(page);
      
      if (!(await isAindaNaLogin())) {
        loginSucesso = true;
        break;
      }
      
    } catch (e) {
      log(`Erro na tentativa ${tentativa}: ${e.message}`, LOG_LEVELS.WARN);
      await fecharPopups(page);
    }
  }
  
  if (!loginSucesso) {
    await saveDebugInfo(page, 'login_falhou');
    throw new Error('Login falhou após múltiplas tentativas');
  }
  
  log('Login realizado com sucesso', LOG_LEVELS.SUCCESS);
}

// ============================================
// NAVEGAÇÃO E FILTROS
// ============================================
async function navegarParaRelatorio(page) {
  setStep('NAVEGACAO');
  const targetUrl = String(CONFIG.HINOVA_RELATORIO_URL || '').trim();
  log(`Navegando para: ${targetUrl}`, LOG_LEVELS.INFO);
  
  const resp = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.PAGE_LOAD });
  await page.waitForTimeout(2500);
  
  await fecharPopups(page);

  const finalUrl = String(page.url() || '');
  const status = resp?.status?.() ?? null;
  log(`URL final após navegação: ${finalUrl} (status=${status ?? 'n/a'})`, LOG_LEVELS.DEBUG);

  const finalLower = finalUrl.toLowerCase();
  if (finalLower.includes('login.php')) {
    await saveDebugInfo(page, 'redirect_login');
    throw new Error(`Navegação para relatório falhou: redirecionou para login (${finalUrl})`);
  }
  if (!finalLower.includes('relatoriolancamento.php')) {
    await saveDebugInfo(page, 'url_relatorio_incorreta');
    throw new Error(`Navegação para relatório falhou: URL inesperada (${finalUrl}). Verifique se o caminho do MGF é /mgf/relatorio/relatorioLancamento.php neste ambiente.`);
  }
  
  log('Página de relatório carregada', LOG_LEVELS.SUCCESS);
  await saveDebugInfo(page, 'pagina_relatorio');
}

// ============================================
// SELEÇÃO RÍGIDA DE LAYOUT (MESMO PADRÃO DO COBRANÇA)
// - Procura em TODOS os frames
// - Seleciona pelo nome exato CONFIG.HINOVA_LAYOUT quando possível
// - Se falhar, ABORTA (não pode prosseguir sem layout)
// ============================================
async function selecionarLayoutRelatorioMGF(page) {
  const desiredRaw = String(CONFIG.HINOVA_LAYOUT || '').trim();
  const desired = normalizeText(desiredRaw);

  if (!desired) {
    return { ok: false, reason: 'layout_vazio' };
  }

  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

  const tryInFrameEvaluate = async (frame) => {
    try {
      return await frame.evaluate(({ desiredRaw, desired }) => {
        const normalizar = (t) =>
          (t || '')
            .toString()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        const isVisible = (el) => {
          try {
            const r = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          } catch {
            return false;
          }
        };

        const resultado = {
          ok: false,
          method: null,
          selected: null,
          selectName: null,
          optionsDisponiveis: [],
          diagnostics: {
            selects: [],
            inputs: [],
          },
        };

        const selects = Array.from(document.querySelectorAll('select')).filter(isVisible);
        const scoreSelect = (s) => {
          const id = normalizar(s.id || '');
          const name = normalizar(s.name || '');
          const attrs = `${id} ${name}`;
          let score = 0;
          if (attrs.includes('layout')) score += 20;
          if (attrs.includes('visualiz')) score += 20;
          if (attrs.includes('dados')) score += 15;
          if (attrs.includes('sistema')) score += 10;
          if (attrs.includes('perfil')) score += 10;
          return score;
        };

        // Ordenar selects por “parece layout”
        const rankedSelects = selects
          .map((s) => ({ s, score: scoreSelect(s) }))
          .sort((a, b) => b.score - a.score)
          .map((x) => x.s);

        for (const select of rankedSelects) {
          const options = Array.from(select.options || []);
          const optionTexts = options.map((o) => (o.textContent || o.value || '').trim());
          const normOptions = optionTexts.map(normalizar);

          resultado.diagnostics.selects.push({
            name: select.name || null,
            id: select.id || null,
            score: scoreSelect(select),
            options: optionTexts.slice(0, 30),
          });

          if (resultado.optionsDisponiveis.length === 0) {
            resultado.optionsDisponiveis = optionTexts.slice(0, 80);
          }

          // 1) Match exato/contém do layout desejado
          let idx = normOptions.findIndex((t) => t === desired || t.includes(desired) || desired.includes(t));

          // 2) Fallback: BI + VANGARD + (FINANCEIROS/EVENTOS)
          if (idx < 0) {
            idx = normOptions.findIndex((t) => t.includes('bi') && t.includes('vangard') && (t.includes('finance') || t.includes('evento')));
          }

          if (idx >= 0) {
            select.selectedIndex = idx;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));

            const selectedText = optionTexts[idx] || options[idx]?.value || null;
            const selectedNorm = normalizar(selectedText || '');
            const ok = !!selectedNorm && (selectedNorm.includes('vangard') || selectedNorm.includes(desired));

            if (ok) {
              resultado.ok = true;
              resultado.method = 'select';
              resultado.selected = selectedText;
              resultado.selectName = select.name || select.id || null;
              return resultado;
            }
          }
        }

        // Apenas diagnóstico de inputs (para log/debug)
        const inputs = Array.from(
          document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])')
        ).filter(isVisible);
        for (const input of inputs.slice(0, 12)) {
          resultado.diagnostics.inputs.push({
            name: input.getAttribute('name'),
            id: input.getAttribute('id'),
            placeholder: input.getAttribute('placeholder'),
          });
        }

        return resultado;
      }, { desiredRaw, desired });
    } catch {
      return { ok: false, reason: 'evaluate_failed' };
    }
  };

  const tryInFrameInput = async (frame) => {
    // Autocomplete/datalist/inputs que existem em alguns portais
    const input = frame
      .locator(
        'input[placeholder*="Dados" i], input[placeholder*="Visual" i], input[placeholder*="Layout" i], input[placeholder*="Sistema" i], input[placeholder*="Perfil" i]'
      )
      .first();

    if (!(await input.isVisible().catch(() => false))) return false;

    try {
      await input.click({ force: true }).catch(() => null);
      await input.fill(desiredRaw).catch(() => null);
      await input.press('Enter').catch(() => null);
      return true;
    } catch {
      return false;
    }
  };

  // 1) Selecionar em algum frame
  let lastDiagnostics = null;
  for (const frame of frames) {
    const res = await tryInFrameEvaluate(frame);
    if (res?.diagnostics) lastDiagnostics = res;
    if (res?.ok) {
      return { ok: true, method: res.method, selected: res.selected, frameUrl: frame.url() };
    }
  }

  // 2) Tentar via input (autocomplete) e reavaliar
  for (const frame of frames) {
    const typed = await tryInFrameInput(frame);
    if (!typed) continue;
    await page.waitForTimeout(1500);
    const res = await tryInFrameEvaluate(frame);
    if (res?.ok) {
      return { ok: true, method: `input+${res.method}`, selected: res.selected, frameUrl: frame.url() };
    }
    if (res?.diagnostics) lastDiagnostics = res;
  }

  return {
    ok: false,
    reason: 'layout_nao_encontrado',
    desired: desiredRaw,
    optionsDisponiveis: lastDiagnostics?.optionsDisponiveis || [],
    diagnostics: lastDiagnostics?.diagnostics || null,
  };
}

async function configurarFiltros(page) {
  setStep('FILTROS');
  log('Configurando filtros...', LOG_LEVELS.INFO);
  
  // Verificar popups antes de iniciar configuração
  await fecharPopups(page, 2);
  
  // 1. CONFIGURAR CHECKBOXES DE CENTRO DE CUSTO
  log('📋 Configurando checkboxes de Centro de Custo (apenas EVENTOS)...', LOG_LEVELS.INFO);
  
  const batchResult = await page.evaluate(() => {
    const normalize = (s) =>
      (s || '')
        .toString()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
    
    const findCentroCustoContainer = () => {
      const allElements = document.querySelectorAll('fieldset, div, table, form');
      
      for (const el of allElements) {
        const text = normalize(el.textContent || '');
        if (text.includes('CENTRO DE CUSTO') || text.includes('CENTRO CUSTO') || text.includes('DEPARTAMENTO')) {
          const checkboxes = el.querySelectorAll('input[type="checkbox"]');
          if (checkboxes.length > 0 && checkboxes.length < 500) {
            return el;
          }
        }
      }
      
      const labels = document.querySelectorAll('td, th, label, span');
      for (const label of labels) {
        const text = normalize(label.textContent || '');
        if (text === 'CENTRO DE CUSTO:' || text === 'CENTRO DE CUSTO' || text === 'DEPARTAMENTO:') {
          const container = label.closest('table') || label.closest('fieldset') || label.closest('div');
          if (container) {
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length > 0) return container;
          }
        }
      }
      
      return null;
    };
    
    const container = findCentroCustoContainer();
    if (!container) {
      return { ok: false, reason: 'container_not_found' };
    }
    
    const labelTextFor = (input) => {
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
    
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    let marcados = 0;
    let desmarcados = 0;
    let alterados = 0;
    const detalhes = [];
    
    for (const input of checkboxes) {
      const labelText = normalize(labelTextFor(input));
      if (!labelText || labelText === 'TODOS') continue;
      
      const shouldCheck = labelText.includes('EVENTO');
      
      if (input.checked !== shouldCheck) {
        input.checked = shouldCheck;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        alterados++;
      }
      
      if (shouldCheck) {
        marcados++;
        detalhes.push(`✓ ${labelText}`);
      } else {
        desmarcados++;
      }
    }
    
    return {
      ok: true,
      total: checkboxes.length,
      marcados,
      desmarcados,
      alterados,
      detalhes: detalhes.slice(0, 10),
    };
  });
  
  if (!batchResult?.ok) {
    log(`⚠️ Container de Centro de Custo não encontrado: ${batchResult?.reason}`, LOG_LEVELS.WARN);
  } else {
    log(`✅ Centro de Custo configurado: total=${batchResult.total}, marcados=${batchResult.marcados}, desmarcados=${batchResult.desmarcados}, alterados=${batchResult.alterados}`, LOG_LEVELS.SUCCESS);
    if (batchResult.detalhes?.length > 0) {
      log(`   Marcados: ${batchResult.detalhes.join(', ')}`, LOG_LEVELS.DEBUG);
    }
  }
  
  // Verificar popups após configurar Centro de Custo
  await fecharPopups(page, 2);
  await page.waitForTimeout(1000);
  
  // 2. SELECIONAR LAYOUT
  log('📋 Selecionando layout...', LOG_LEVELS.INFO);

  const layoutSel = await selecionarLayoutRelatorioMGF(page);
  if (layoutSel?.ok) {
    log(`✅ Layout selecionado (MGF): ${layoutSel.selected}`, LOG_LEVELS.SUCCESS);
    log(`   Método: ${layoutSel.method} | Frame: ${layoutSel.frameUrl || 'main'}`, LOG_LEVELS.DEBUG);

    // Aguardar carregamento com verificação contínua de popups (crítico!)
    log('⏳ Aguardando configurações do layout carregarem (verificando popups)...', LOG_LEVELS.INFO);
    await aguardarComFecharPopups(page, 20000, 3000);
  } else {
    log(`❌ ERRO CRÍTICO: Layout "${CONFIG.HINOVA_LAYOUT}" não selecionado no MGF`, LOG_LEVELS.ERROR);
    if (layoutSel?.optionsDisponiveis?.length) {
      log(`   Opções (amostra): ${layoutSel.optionsDisponiveis.slice(0, 25).join(' | ')}`, LOG_LEVELS.DEBUG);
    }
    await saveDebugInfo(page, 'layout_nao_encontrado');
    throw new Error(`ERRO CRÍTICO: Layout "${CONFIG.HINOVA_LAYOUT}" não encontrado/selecionado. Sem isso, o relatório vem errado ou o download nem inicia.`);
  }
  
  // Verificar popups antes de continuar
  await fecharPopups(page, 2);
  await page.waitForTimeout(1000);
  
  // 3. SELECIONAR FORMATO EXCEL
  log('📋 Selecionando formato Excel...', LOG_LEVELS.INFO);
  
  const excelSelecionado = await selecionarFormaExibicaoEmExcel(page);
  
  if (!excelSelecionado) {
    log('⚠️ Não foi possível selecionar formato Excel automaticamente', LOG_LEVELS.WARN);
  }
  
  // Verificar popups finais antes de prosseguir para geração
  await fecharPopups(page, 2);
  
  await saveDebugInfo(page, 'filtros_configurados');
  log('Filtros configurados', LOG_LEVELS.SUCCESS);
}

// ============================================
// SELEÇÃO DE FORMATO EXCEL (IDÊNTICO AO ROBÔ DE COBRANÇA)
// ============================================
async function selecionarFormaExibicaoEmExcel(page) {
  log('Selecionando Forma de Exibição: Em Excel', LOG_LEVELS.INFO);
  
  // Verificar popups antes de selecionar formato
  await fecharPopups(page, 2);
  
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

  if (await tryInFrame(page.mainFrame())) {
    return true;
  }

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await tryInFrame(frame)) {
      return true;
    }
  }

  log('Fallback: Excel não encontrado via JavaScript', LOG_LEVELS.WARN);
  return false;
}

// ============================================
// GERAR E BAIXAR RELATÓRIO (USANDO SISTEMA HÍBRIDO)
// ============================================
async function gerarEBaixarRelatorio(page, context) {
  setStep('DOWNLOAD');
  log('Gerando relatório...', LOG_LEVELS.INFO);

  // Verificar popups antes de iniciar geração do relatório
  await fecharPopups(page, 3);

  // DEBUG CRÍTICO: confirmar se o portal realmente disparou a requisição de geração do relatório
  // (mesmo quando não abre popup e não dispara evento de download).
  const netTag = '[MGF NET]';
  const onReq = (req) => {
    try {
      const url = String(req.url() || '');
      if (!url.toLowerCase().includes('relatoriolancamento.php')) return;
      log(`${netTag} request: ${req.method()} ${url}`, LOG_LEVELS.DEBUG);
    } catch {}
  };
  const onResp = (res) => {
    try {
      const url = String(res.url() || '');
      if (!url.toLowerCase().includes('relatoriolancamento.php')) return;
      const req = res.request?.();
      const method = req?.method?.() || 'GET';
      const headers = res.headers?.() || {};
      const ct = String(headers['content-type'] || '');
      const cd = String(headers['content-disposition'] || '');
      const len = String(headers['content-length'] || '');
      log(`${netTag} response: ${method} ${url} status=${res.status?.() ?? 'n/a'} ct="${ct}" cd="${cd}" len=${len || 'n/a'}`, LOG_LEVELS.DEBUG);
    } catch {}
  };
  page.on('request', onReq);
  page.on('response', onResp);
  const cleanupNet = () => {
    try { page.removeListener('request', onReq); } catch {}
    try { page.removeListener('response', onResp); } catch {}
  };

  try {
  
  const downloadDir = getDownloadDirectory();
  const semanticName = generateSemanticFilename();
  
  log(`Diretório de download: ${downloadDir}`, LOG_LEVELS.INFO);
  log(`Nome do arquivo: ${semanticName}`, LOG_LEVELS.DEBUG);
  
  // Aumentar timeout para download
  context.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
  page.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
  
  await saveDebugInfo(page, 'antes_gerar');

  // Alguns portais Hinova exibem um botão "Liberar" (destrava filtros) e só depois o botão real de geração.
  // Se clicarmos no botão errado, nenhum download é disparado e ficamos aguardando indefinidamente.
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

  const clickOptionalButtonAcrossFrames = async (keywords, label) => {
    const lowered = keywords.map((k) => k.toLowerCase());
    const exclude = ['fechar', 'cancelar', 'voltar', 'sair', 'limpar', 'reset'];

    for (const frame of frames) {
      const candidates = frame.locator('button, input[type="submit"], input[type="button"], a');
      const count = await candidates.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const el = candidates.nth(i);
        const visible = await el.isVisible().catch(() => false);
        if (!visible) continue;

        const text = (
          (await el.textContent().catch(() => '')) ||
          (await el.getAttribute('value').catch(() => '')) ||
          ''
        ).trim();

        const t = text.toLowerCase();
        if (!t) continue;
        if (exclude.some((k) => t.includes(k))) continue;

        if (lowered.some((k) => t.includes(k))) {
          log(`Botão opcional detectado (${label}): "${text}" (frame=${frame.url() || 'main'})`, LOG_LEVELS.DEBUG);
          await el.click({ timeout: 15000, force: true }).catch(() => {});
          await page.waitForTimeout(1500);
          return true;
        }
      }
    }
    return false;
  };

  const findActionButtonAcrossFrames = async () => {
    const prefer = ['gerar', 'exportar', 'baixar', 'download', 'imprimir', 'excel', 'xls', 'xlsx'];
    const exclude = ['fechar', 'cancelar', 'voltar', 'sair', 'limpar', 'reset'];

    let best = null;

    for (const frame of frames) {
      const candidates = frame.locator('button, input[type="submit"], input[type="button"], a');
      const count = await candidates.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const el = candidates.nth(i);
        const visible = await el.isVisible().catch(() => false);
        if (!visible) continue;

        const text = (
          (await el.textContent().catch(() => '')) ||
          (await el.getAttribute('value').catch(() => '')) ||
          ''
        ).trim();

        if (!text) continue;
        const t = text.toLowerCase();
        if (exclude.some((k) => t.includes(k))) continue;

        let score = 0;
        if (t.includes('gerar')) score += 50;
        if (t.includes('export')) score += 40;
        if (t.includes('baix')) score += 35;
        if (t.includes('download')) score += 35;
        if (t.includes('excel') || t.includes('xls')) score += 30;
        if (t.includes('pesquisar') || t.includes('consultar')) score += 10;
        if (t.includes('liberar')) score -= 100; // nunca tratar "Liberar" como botão final
        if (prefer.some((k) => t.includes(k))) score += 1;

        if (!best || score > best.score) {
          best = { el, text, score, frameUrl: frame.url() };
        }
      }
    }

    if (!best || best.score <= 0) return null;
    log(`Botão de ação selecionado: "${best.text}" (score=${best.score}) (frame=${best.frameUrl || 'main'})`, LOG_LEVELS.DEBUG);
    return best.el;
  };
  
  // 1) Se houver botão "Liberar", clicar (sem iniciar download ainda)
  await clickOptionalButtonAcrossFrames(['liberar'], 'LIBERAR');

  // Verificar popups que podem ter aparecido após clicar em Liberar
  await fecharPopups(page, 2);

  // 2) Encontrar o botão real de geração/exportação (NÃO usar btn-primary genérico)
  let gerarBtn = await findActionButtonAcrossFrames();
  
  if (!gerarBtn) {
    await saveDebugInfo(page, 'botao_nao_encontrado');
    throw new Error('Botão Gerar/Pesquisar não encontrado na página');
  }

  // Verificar popups finais antes do clique de geração
  await fecharPopups(page, 2);

  // Preparar captura ANTES do clique para não perder downloads rápidos
  const downloadPromise = aguardarDownloadHibrido(context, page, downloadDir, semanticName, TIMEOUTS.DOWNLOAD_HARD);

  // Sinal extra (somente log): se abrir popup/nova aba ou disparar download nos primeiros segundos
  const popupSignal = page
    .waitForEvent('popup', { timeout: 8000 })
    .then((p) => log(`🚀 DOWNLOAD INICIADO (UI): popup/nova aba criada (url=${p.url() || 'n/a'})`, LOG_LEVELS.SUCCESS))
    .catch(() => null);
  const downloadSignal = page
    .waitForEvent('download', { timeout: 8000 })
    .then(() => log('🚀 DOWNLOAD INICIADO (UI): evento de download disparado', LOG_LEVELS.SUCCESS))
    .catch(() => null);

  // Clicar e aguardar download usando sistema híbrido
  log('Clicando no botão Gerar/Exportar...', LOG_LEVELS.INFO);
  await gerarBtn.click({ timeout: 15000, force: true });
  log('Botão de geração clicado', LOG_LEVELS.SUCCESS);

  // Evitar warning de promise não aguardada; são apenas sinais de log.
  await Promise.race([popupSignal, downloadSignal, page.waitForTimeout(8000)]).catch(() => null);

  const result = await downloadPromise;
  
  if (!result.success) {
    await saveDebugInfo(page, 'download_falhou');
    throw result.error || new Error('Download falhou');
  }
  
  log(`✅ Arquivo baixado: ${result.filePath} (${formatBytes(result.size)})`, LOG_LEVELS.SUCCESS);
  return result.filePath;
  } finally {
    cleanupNet();
  }
}

// ============================================
// PROCESSAMENTO DE ARQUIVO
// ============================================
function extrairTexto(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s+/g, ' ')
    .trim();
}

function processarTabelaHtml(htmlContent) {
  log('Processando arquivo como tabela HTML...', LOG_LEVELS.INFO);
  
  const theadMatch = htmlContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  let headers = [];
  
  if (theadMatch) {
    const headerMatches = theadMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    headers = headerMatches.map(th => extrairTexto(th));
    log(`Headers encontrados: ${headers.length}`, LOG_LEVELS.DEBUG);
  }
  
  const tbodyMatch = htmlContent.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const registros = [];
  
  if (tbodyMatch) {
    const rowMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    log(`Linhas encontradas no tbody: ${rowMatches.length}`, LOG_LEVELS.DEBUG);
    
    for (const row of rowMatches) {
      const cellMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      const values = cellMatches.map(td => extrairTexto(td));
      
      if (values.length > 0 && values.some(v => v.length > 0)) {
        const record = {};
        headers.forEach((h, i) => {
          if (h && values[i] !== undefined) {
            record[h] = values[i];
          }
        });
        registros.push(record);
      }
    }
  }
  
  log(`Registros extraídos da tabela HTML: ${registros.length}`, LOG_LEVELS.SUCCESS);
  return registros;
}

function processarArquivo(filePath) {
  log(`Processando arquivo: ${filePath}`, LOG_LEVELS.INFO);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;
  log(`Tamanho do arquivo: ${formatBytes(fileSize)}`, LOG_LEVELS.DEBUG);
  
  const header = fileBuffer.slice(0, 100).toString('utf8');
  const isHtml = header.includes('<html') || header.includes('<table') || header.includes('<!DOCTYPE');
  
  if (isHtml) {
    log('Arquivo detectado como HTML', LOG_LEVELS.INFO);
    const htmlContent = fileBuffer.toString('utf8');
    
    if (htmlContent.includes('Nenhum registro encontrado') || htmlContent.includes('Sem dados')) {
      log('Portal retornou "Nenhum registro encontrado"', LOG_LEVELS.WARN);
      return [];
    }
    
    return processarTabelaHtml(htmlContent);
  }
  
  try {
    log('Processando como arquivo Excel...', LOG_LEVELS.INFO);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
    
    if (jsonData.length > 0) {
      log(`Registros extraídos do Excel: ${jsonData.length}`, LOG_LEVELS.SUCCESS);
      return jsonData;
    }
    
    const rawData = XLSX.utils.sheet_to_csv(firstSheet);
    if (rawData.includes('<html') || rawData.includes('<table')) {
      log('Excel contém HTML, processando como HTML...', LOG_LEVELS.INFO);
      return processarTabelaHtml(rawData);
    }
    
    return jsonData;
  } catch (e) {
    log(`Erro ao processar Excel: ${e.message}`, LOG_LEVELS.WARN);
    
    const content = fileBuffer.toString('utf8');
    if (content.includes('<table')) {
      return processarTabelaHtml(content);
    }
    
    throw e;
  }
}

// ============================================
// MAIN
// ============================================
async function main() {
  log('============================================================', LOG_LEVELS.SUCCESS);
  log('ROBÔ MGF HINOVA - INICIANDO', LOG_LEVELS.SUCCESS);
  log('============================================================', LOG_LEVELS.SUCCESS);
  
  await notifyStart();
  await updateProgress('executando', 'login');
  
  let browser;
  let context;
  let page;
  let filePath;
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-popup-blocking'],
    });
    
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
      navigationTimeout: TIMEOUTS.PAGE_LOAD,
    });
    
    context.setDefaultTimeout(30000);
    
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(TIMEOUTS.PAGE_LOAD);
    
    // Login
    await realizarLogin(page);
    await updateProgress('executando', 'navegacao');
    
    // Navegar para relatório
    await navegarParaRelatorio(page);
    await updateProgress('executando', 'filtros');
    
    // Configurar filtros
    await configurarFiltros(page);
    await updateProgress('executando', 'download');
    
    // Gerar e baixar relatório
    filePath = await gerarEBaixarRelatorio(page, context);
    await updateProgress('executando', 'processamento');
    
    // Processar arquivo
    log('Processando arquivo...', LOG_LEVELS.INFO);
    const registros = processarArquivo(filePath);
    log(`Arquivo processado: ${registros.length} registros`, LOG_LEVELS.SUCCESS);
    
    if (registros.length === 0) {
      log('⚠️ Arquivo processado, mas sem registros', LOG_LEVELS.WARN);
    }
    
    await updateProgress('executando', 'importacao');
    
    // Enviar registros em lotes
    log(`Enviando ${registros.length} registros via webhook...`, LOG_LEVELS.INFO);
    
    const batchSize = 100;
    const totalBatches = Math.ceil(registros.length / batchSize) || 1;
    
    for (let i = 0; i < totalBatches; i++) {
      const batch = registros.slice(i * batchSize, (i + 1) * batchSize);
      
      await sendWebhook({
        corretora_id: CONFIG.CORRETORA_ID,
        execucao_id: CONFIG.EXECUCAO_ID,
        github_run_id: CONFIG.GITHUB_RUN_ID,
        github_run_url: CONFIG.GITHUB_RUN_URL,
        dados: batch,
        nome_arquivo: path.basename(filePath),
        total_registros: registros.length,
        chunk_index: i,
        chunk_total: totalBatches,
      });
      
      const progresso = Math.round(((i + 1) / totalBatches) * 100);
      log(`Batch ${i + 1}/${totalBatches} enviado (${progresso}%)`, LOG_LEVELS.INFO);
    }
    
    // Sucesso final
    await sendWebhook({
      corretora_id: CONFIG.CORRETORA_ID,
      execucao_id: CONFIG.EXECUCAO_ID,
      github_run_id: CONFIG.GITHUB_RUN_ID,
      github_run_url: CONFIG.GITHUB_RUN_URL,
      update_progress: true,
      status: 'sucesso',
      etapa_atual: 'concluido',
      registros_total: registros.length,
      registros_processados: registros.length,
      progresso_importacao: 100,
      nome_arquivo: path.basename(filePath),
    });
    
    log('============================================================', LOG_LEVELS.SUCCESS);
    log('ROBÔ MGF HINOVA - CONCLUÍDO COM SUCESSO', LOG_LEVELS.SUCCESS);
    log(`Total de registros: ${registros.length}`, LOG_LEVELS.SUCCESS);
    log('============================================================', LOG_LEVELS.SUCCESS);
    
    // Limpar debug em caso de sucesso
    try {
      if (fs.existsSync(CONFIG.DEBUG_DIR)) {
        fs.rmSync(CONFIG.DEBUG_DIR, { recursive: true, force: true });
      }
    } catch {}
    
    // Limpar arquivo de download
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
    
  } catch (error) {
    log(`ERRO FATAL: ${error.message}`, LOG_LEVELS.ERROR);
    await notifyError(error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      log('Browser fechado', LOG_LEVELS.DEBUG);
    }
  }
}

// Executar
main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
