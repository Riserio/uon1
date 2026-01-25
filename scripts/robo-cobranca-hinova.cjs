#!/usr/bin/env node
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

const CONFIG = {
  HINOVA_URL: process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php',
  HINOVA_RELATORIO_URL: 'https://eris.hinova.com.br/sga/sgav4_valecar/relatorio/relatorioBoleto.php',
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  
  // URL do webhook
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  
  // Identificador da corretora - USE O ID DIRETO
  CORRETORA_ID: process.env.CORRETORA_ID || 'a4931643-8bf1-4153-97b1-c64925f536eb',
  
  // Diretório base para downloads
  DOWNLOAD_BASE_DIR: process.env.DOWNLOAD_DIR || './downloads',
  
  // Diretório para debug (screenshots e HTML)
  DEBUG_DIR: process.env.DEBUG_DIR || './debug',
};

// ============================================
// CONSTANTES DE TIMEOUT E CONTROLE
// ============================================
const TIMEOUTS = {
  PAGE_LOAD: 90000,           // 90s para carregar página
  LOGIN_RETRY_WAIT: 8000,     // 8s entre tentativas de login
  DOWNLOAD_EVENT: 3 * 60000,  // 3 min para evento de download
  DOWNLOAD_TOTAL: 10 * 60000, // 10 min total para download (portal pode demorar)
  DOWNLOAD_SAVE: 10 * 60000,  // 10 min para salvar arquivo (portal Hinova é lento)
  // O portal pode levar MUITO tempo para iniciar a transmissão do relatório.
  // Se o idle for curto, o replay HTTP aborta cedo e acabamos caindo no `saveAs()`,
  // que pode ser cancelado se o popup/contexto fechar antes do download iniciar.
  DOWNLOAD_IDLE: 20 * 60000,  // 20 min sem receber bytes -> abortar
  DOWNLOAD_HARD: 28 * 60000,  // 28 min limite rígido (abaixo do timeout do workflow)
  POPUP_CLOSE: 800,           // 800ms para fechar popup
  FILE_PROGRESS_INTERVAL: 10000, // 10s entre logs de progresso do arquivo
};

const LIMITS = {
  MAX_LOGIN_RETRIES: 20,
  MAX_DOWNLOAD_RETRIES: 3,
  MAX_POPUP_CLOSE_ATTEMPTS: 10,
  MAX_LOOP_ITERATIONS: 100,   // Limite para evitar loops infinitos
  MIN_FILE_SIZE_BYTES: 100,   // Tamanho mínimo para arquivo válido
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
              log(`⬇️ Download ${pct}% (${formatBytes(size)} / ${formatBytes(expectedSize)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.DEBUG);
            }
          } else {
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            log(`⬇️ Download ${formatBytes(size)} recebido • ${formatBytes(speed)}/s (${minutes}m ${seconds}s)`, LOG_LEVELS.DEBUG);
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
      log(`⬇️ Download ${pct}% (${formatBytes(receivedBytes)} / ${formatBytes(expectedBytes)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.DEBUG);
    } else {
      log(`⬇️ Download ${formatBytes(receivedBytes)} recebido • ${formatBytes(speed)}/s`, LOG_LEVELS.DEBUG);
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
// VALIDAÇÃO DE ARQUIVO
// ============================================
// Constante para validação de tamanho (indica que filtros não foram aplicados)
const MAX_EXPECTED_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Detecta se o arquivo é HTML disfarçado de Excel (comum no Hinova)
 */
function isHtmlFile(filePath) {
  try {
    // Ler primeiros 500 bytes para detectar
    const buffer = Buffer.alloc(500);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 500, 0);
    fs.closeSync(fd);
    
    const header = buffer.toString('utf-8', 0, 500).toLowerCase();
    return header.includes('<!doctype') || header.includes('<html') || header.includes('<table');
  } catch {
    return false;
  }
}

function validateDownloadedFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Arquivo não existe' };
  }
  
  const stats = fs.statSync(filePath);
  
  if (stats.size < LIMITS.MIN_FILE_SIZE_BYTES) {
    return { valid: false, error: `Arquivo muito pequeno: ${stats.size} bytes` };
  }
  
  // Verificar se tamanho indica filtros não aplicados
  if (stats.size > MAX_EXPECTED_FILE_SIZE) {
    log(`⚠️ ATENÇÃO: Arquivo muito grande (${formatBytes(stats.size)}) - pode indicar filtros não aplicados`, LOG_LEVELS.WARN);
  }
  
  // Detectar se é HTML disfarçado
  const isHtml = isHtmlFile(filePath);
  
  if (isHtml) {
    log(`Arquivo detectado como HTML disfarçado de Excel`, LOG_LEVELS.INFO);
    // Validar que tem conteúdo de tabela
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const hasTable = content.includes('<table') || content.includes('<tr');
      if (!hasTable) {
        return { valid: false, error: 'Arquivo HTML sem tabela de dados' };
      }
      
      // Contar linhas aproximadas
      const rowCount = (content.match(/<tr/gi) || []).length;
      
      return {
        valid: true,
        size: stats.size,
        isHtml: true,
        rows: rowCount,
      };
    } catch (e) {
      return { valid: false, error: `Erro ao ler HTML: ${e.message}` };
    }
  }
  
  // Verificar se é um Excel válido tentando abrir
  try {
    const workbook = XLSX.readFile(filePath);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { valid: false, error: 'Excel sem planilhas' };
    }
    
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    return {
      valid: true,
      size: stats.size,
      isHtml: false,
      sheets: workbook.SheetNames.length,
      rows: data.length,
    };
  } catch (e) {
    return { valid: false, error: `Erro ao ler Excel: ${e.message}` };
  }
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
 * Watcher 1: Intercepta respostas HTTP que contêm Excel
 * MÉTODO PRINCIPAL - Captura direta do stream HTTP
 * 
 * FLUXO TERMINAL COM STREAMING:
 * 1. Detecta resposta Excel via headers
 * 2. Consome o body da resposta diretamente
 * 3. Salva bytes em disco com progresso
 * 4. Validação síncrona
 * 5. Etapa DOWNLOAD finaliza
 */
function criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onResponse = async (response) => {
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
      
      // ===== PASSO 1: Marcar como capturado =====
      const wasCaptured = controller.setCaptured({ 
        type: 'httpResponse', 
        response, 
        source: 'httpStream' 
      });
      
      if (!wasCaptured) return;
      
      log(`✅ Download capturado via interceptação HTTP`, LOG_LEVELS.SUCCESS);
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
        
        // ===== PASSO 4: Validação síncrona =====
        if (!fs.existsSync(filePath)) {
          throw new Error('FALHA: Arquivo não existe após salvamento HTTP');
        }
        
        const stats = fs.statSync(filePath);

        // Verificar se tamanho bate com content-length (se informado)
        if (contentLength > 0 && stats.size !== contentLength) {
          log(`⚠️ Tamanho difere: esperado ${contentLength}, recebido ${stats.size}`, LOG_LEVELS.WARN);
        }

        // ===== PASSO 5: Log de sucesso =====
        log(`✅ Arquivo salvo com sucesso: ${semanticName} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
        log(`✅ Etapa DOWNLOAD concluída via HTTP Stream`, LOG_LEVELS.SUCCESS);
        
        controller.setFileResult({ filePath, size: stats.size });
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

  // Heartbeat para mostrar que o processo ainda está ativo
  let lastHeartbeat = Date.now();
  const HEARTBEAT_INTERVAL = 30000; // 30 segundos
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    // Verificar se arquivo começou a ser criado
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
      log(`⏳ Recebendo dados... ${formatBytes(fileSize)} (${minutes}m ${seconds}s)`, LOG_LEVELS.INFO);
    } else {
      log(`⏳ Aguardando servidor Hinova gerar relatório... (${minutes}m ${seconds}s)`, LOG_LEVELS.INFO);
    }
  }, HEARTBEAT_INTERVAL);

  try {
    await download.saveAs(filePath);
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
 * Ao capturar, executa saveAs IMEDIATAMENTE no mesmo bloco
 */
function criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    
    const filename = download.suggestedFilename?.() || '';
    log(`Download global detectado: ${filename}`, LOG_LEVELS.DEBUG);
    
    // Marcar como capturado ANTES de qualquer processamento
    const wasCaptured = controller.setCaptured({ 
      type: 'download', 
      download, 
      source: 'globalDownload' 
    });
    
    if (!wasCaptured) return; // Outro watcher já capturou
    
    try {
      // Preferir replay HTTP com cookies da sessão para obter % e evitar cancelamento
      const url = download.url?.() || '';
      const cookieHeader = await buildCookieHeader(context, url);
      const headers = pickHeadersForHttpReplay({ 'user-agent': 'Mozilla/5.0' });
      if (cookieHeader) headers['cookie'] = cookieHeader;

      let result;
      if (url) {
        try {
          log(`⬇️ Baixando via HTTP stream (globalDownload)...`, LOG_LEVELS.INFO);
          result = await downloadViaAxiosStream({
            url,
            method: 'GET',
            headers,
            filePath: path.join(downloadDir, semanticName),
          });
        } catch (e) {
          log(`⚠️ HTTP stream falhou (${e.message}) — usando saveAs`, LOG_LEVELS.WARN);
          result = await processarDownloadImediato(download, downloadDir, semanticName);
        }
      } else {
        result = await processarDownloadImediato(download, downloadDir, semanticName);
      }
      controller.setFileResult(result);
    } catch (e) {
      log(`Erro ao salvar download: ${e.message}`, LOG_LEVELS.ERROR);
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
 * Ao capturar, executa saveAs IMEDIATAMENTE no mesmo bloco
 */
function criarWatcherDownloadPaginaPrincipal(context, page, controller, downloadDir, semanticName) {
  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    
    const filename = download.suggestedFilename?.() || '';
    log(`Download página principal: ${filename}`, LOG_LEVELS.DEBUG);
    
    // Marcar como capturado ANTES de qualquer processamento
    const wasCaptured = controller.setCaptured({ 
      type: 'download', 
      download, 
      source: 'mainPage' 
    });
    
    if (!wasCaptured) return; // Outro watcher já capturou
    
    try {
      const url = download.url?.() || '';
      const cookieHeader = await buildCookieHeader(context, url);
      const headers = pickHeadersForHttpReplay({ 'user-agent': 'Mozilla/5.0' });
      if (cookieHeader) headers['cookie'] = cookieHeader;

      let result;
      if (url) {
        try {
          log(`⬇️ Baixando via HTTP stream (mainPage)...`, LOG_LEVELS.INFO);
          result = await downloadViaAxiosStream({
            url,
            method: 'GET',
            headers,
            filePath: path.join(downloadDir, semanticName),
          });
        } catch (e) {
          log(`⚠️ HTTP stream falhou (${e.message}) — usando saveAs`, LOG_LEVELS.WARN);
          result = await processarDownloadImediato(download, downloadDir, semanticName);
        }
      } else {
        result = await processarDownloadImediato(download, downloadDir, semanticName);
      }
      controller.setFileResult(result);
    } catch (e) {
      log(`Erro ao salvar download: ${e.message}`, LOG_LEVELS.ERROR);
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
      
      // Handler de download na nova aba - executa saveAs IMEDIATAMENTE
      const onNewPageDownload = async (download) => {
        if (controller.isCaptured()) return;
        
        const filename = download.suggestedFilename?.() || '';
        
        const wasCaptured = controller.setCaptured({ 
          type: 'download', 
          download, 
          source: 'newTab', 
          newPage 
        });
        
        if (!wasCaptured) return;
        
        try {
          const url = download.url?.() || '';
          const cookieHeader = await buildCookieHeader(context, url);
          const headers = pickHeadersForHttpReplay({ 'user-agent': 'Mozilla/5.0' });
          if (cookieHeader) headers['cookie'] = cookieHeader;

          let result;
          if (url) {
            try {
              log(`⬇️ Baixando via HTTP stream (newTab)...`, LOG_LEVELS.INFO);
              result = await downloadViaAxiosStream({
                url,
                method: 'GET',
                headers,
                filePath: path.join(downloadDir, semanticName),
              });
            } catch (e) {
              log(`⚠️ HTTP stream falhou (${e.message}) — usando saveAs`, LOG_LEVELS.WARN);
              result = await processarDownloadImediato(download, downloadDir, semanticName);
            }
          } else {
            result = await processarDownloadImediato(download, downloadDir, semanticName);
          }
          controller.setFileResult(result);
          
          // Fechar aba após salvar (sem esperar)
          newPage.close().catch(() => {});
        } catch (e) {
          log(`Erro ao salvar download: ${e.message}`, LOG_LEVELS.ERROR);
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
 * PRIORIDADE: HTTP Stream > Download Global > Download Página > Nova Aba
 * 
 * ESTRATÉGIA HÍBRIDA:
 * 1. HTTP Stream (PREFERIDO): Captura bytes diretamente da resposta HTTP - mais rápido e confiável
 * 2. Download Global: Eventos de download do contexto Playwright
 * 3. Download Página: Eventos de download da página principal
 * 4. Nova Aba: Detecta popups que disparam downloads
 * 
 * O primeiro watcher que capturar salva imediatamente e encerra os demais.
 */
async function aguardarDownloadHibrido(context, page, downloadDir, semanticName, timeoutMs) {
  log(`Iniciando captura híbrida de download...`, LOG_LEVELS.INFO);
  log(`Arquivo destino: ${path.join(downloadDir, semanticName)}`, LOG_LEVELS.DEBUG);
  log(`Watchers ativos: HTTP Stream (principal), Download Global, Download Página, Nova Aba`, LOG_LEVELS.DEBUG);
  
  const controller = new DownloadController();
  
  // Iniciar watchers - HTTP Stream é o principal (mais rápido e confiável)
  criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName);  // PRINCIPAL
  criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName);
  criarWatcherDownloadPaginaPrincipal(context, page, controller, downloadDir, semanticName);
  criarWatcherNovaAba(context, page, controller, downloadDir, semanticName);
  
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
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  
  const formatDate = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };
  
  return {
    inicio: formatDate(primeiroDia),
    fim: formatDate(ultimoDia),
  };
}

// ============================================
// VALIDAÇÃO COMPLETA DE CHECKBOXES
// ============================================

/**
 * Lista todos os checkboxes visíveis na página
 * Retorna array com informações detalhadas de cada checkbox
 */
async function listarCheckboxes(page) {
  return await page.evaluate(() => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const resultado = [];
    let index = 0;
    
    for (const cb of checkboxes) {
      // Ignorar checkboxes hidden ou disabled
      const style = window.getComputedStyle(cb);
      const isHidden = style.display === 'none' || 
                       style.visibility === 'hidden' || 
                       cb.type === 'hidden' ||
                       cb.offsetParent === null;
      
      if (isHidden || cb.disabled) continue;
      
      // Extrair label
      let label = '';
      const labelElement = cb.closest('label');
      if (labelElement) {
        label = labelElement.textContent?.trim() || '';
      } else {
        // Procurar label por for
        const forLabel = document.querySelector(`label[for="${cb.id}"]`);
        if (forLabel) {
          label = forLabel.textContent?.trim() || '';
        } else {
          // Usar texto do parent
          const parent = cb.parentElement;
          label = parent?.textContent?.trim().substring(0, 50) || '';
        }
      }
      
      // Extrair seção
      const section = cb.closest('tr, fieldset, div[class*="section"], div[class*="group"]');
      const sectionText = section?.textContent?.toLowerCase().substring(0, 100) || '';
      
      // Determinar nome da seção
      let sectionName = 'desconhecida';
      if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
        sectionName = 'Situação Boleto';
      } else if (sectionText.includes('regional')) {
        sectionName = 'Regional';
      } else if (sectionText.includes('cooperativa')) {
        sectionName = 'Cooperativa';
      } else if (sectionText.includes('status') || sectionText.includes('estado')) {
        sectionName = 'Status';
      }
      
      resultado.push({
        index: index++,
        label: label.replace(/\s+/g, ' ').trim().substring(0, 50),
        value: cb.value || '',
        checked: cb.checked,
        section: sectionName,
        name: cb.name || '',
        id: cb.id || '',
      });
    }
    
    return resultado;
  });
}

/**
 * Valida e marca TODOS os checkboxes visíveis
 * Loga o estado antes e depois
 * Lança erro se não conseguir marcar 100%
 */
async function validarEMarcarTodosCheckboxes(page, maxTentativas = 3) {
  const stepAnterior = currentStep;
  setStep('FILTROS_CHECKBOXES');
  
  log('📋 Iniciando validação completa de checkboxes...', LOG_LEVELS.INFO);
  
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    // 1. LISTAR ESTADO INICIAL
    const checkboxesAntes = await listarCheckboxes(page);
    const totalCheckboxes = checkboxesAntes.length;
    
    if (totalCheckboxes === 0) {
      log('⚠️ Nenhum checkbox visível encontrado na página', LOG_LEVELS.WARN);
      currentStep = stepAnterior;
      return true;
    }
    
    const marcadosAntes = checkboxesAntes.filter(cb => cb.checked);
    const desmarcadosAntes = checkboxesAntes.filter(cb => !cb.checked);
    
    // 2. LOG ESTADO INICIAL (ANTES)
    log(`📋 ANTES (tentativa ${tentativa}/${maxTentativas}) - Total: ${totalCheckboxes}, Marcados: ${marcadosAntes.length}, Desmarcados: ${desmarcadosAntes.length}`, LOG_LEVELS.INFO);
    
    if (desmarcadosAntes.length > 0) {
      const labels = desmarcadosAntes.map(cb => `"${cb.label || cb.value}"`).join(', ');
      log(`🔍 Desmarcados: ${labels}`, LOG_LEVELS.DEBUG);
    }
    
    // Agrupar por seção
    const porSecao = {};
    for (const cb of checkboxesAntes) {
      if (!porSecao[cb.section]) porSecao[cb.section] = { total: 0, marcados: 0 };
      porSecao[cb.section].total++;
      if (cb.checked) porSecao[cb.section].marcados++;
    }
    for (const [secao, stats] of Object.entries(porSecao)) {
      log(`   [${secao}] ${stats.marcados}/${stats.total}`, LOG_LEVELS.DEBUG);
    }
    
    // 3. MARCAR TODOS os desmarcados
    if (desmarcadosAntes.length > 0) {
      log(`✅ Marcando ${desmarcadosAntes.length} checkboxes desmarcados...`, LOG_LEVELS.INFO);
      
      await page.evaluate(() => {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        
        for (const cb of checkboxes) {
          // Ignorar hidden/disabled
          const style = window.getComputedStyle(cb);
          const isHidden = style.display === 'none' || 
                           style.visibility === 'hidden' || 
                           cb.type === 'hidden' ||
                           cb.offsetParent === null;
          
          if (isHidden || cb.disabled) continue;
          
          // Marcar se estiver desmarcado
          if (!cb.checked) {
            cb.click();
          }
        }
      });
      
      // Aguardar estabilização
      await page.waitForTimeout(500);
    }
    
    // 4. VALIDAR NOVAMENTE
    const checkboxesDepois = await listarCheckboxes(page);
    const marcadosDepois = checkboxesDepois.filter(cb => cb.checked);
    const desmarcadosDepois = checkboxesDepois.filter(cb => !cb.checked);
    
    // 5. LOG ESTADO FINAL (DEPOIS)
    log(`📋 DEPOIS - Total: ${checkboxesDepois.length}, Marcados: ${marcadosDepois.length}, Desmarcados: ${desmarcadosDepois.length}`, LOG_LEVELS.INFO);
    
    // 6. VERIFICAR 100%
    if (desmarcadosDepois.length === 0) {
      log(`✅ 100% dos checkboxes estão marcados (${marcadosDepois.length}/${checkboxesDepois.length}) - prosseguindo`, LOG_LEVELS.SUCCESS);
      currentStep = stepAnterior;
      return true;
    }
    
    // Ainda tem desmarcados - logar e tentar novamente
    const labelsRestantes = desmarcadosDepois.map(cb => `"${cb.label || cb.value}"`).join(', ');
    log(`⚠️ Ainda desmarcados após tentativa ${tentativa}: ${labelsRestantes}`, LOG_LEVELS.WARN);
    
    if (tentativa < maxTentativas) {
      log(`Aguardando 1s antes de nova tentativa...`, LOG_LEVELS.DEBUG);
      await page.waitForTimeout(1000);
    }
  }
  
  // 7. FALHA APÓS TODAS AS TENTATIVAS
  const checkboxesFinal = await listarCheckboxes(page);
  const desmarcadosFinal = checkboxesFinal.filter(cb => !cb.checked);
  
  const labels = desmarcadosFinal.map(cb => `"${cb.label || cb.value}" (${cb.section})`).join(', ');
  const errorMsg = `FALHA: Após ${maxTentativas} tentativas, ${desmarcadosFinal.length} checkboxes ainda desmarcados: ${labels}`;
  
  log(errorMsg, LOG_LEVELS.ERROR);
  currentStep = stepAnterior;
  
  throw new Error(errorMsg);
}

// Mapeamento de colunas
const COLUMN_MAP = {
  "DATA PAGAMENTO": "Data Pagamento",
  "DATA VENCIMENTO ORIGINAL": "Data Vencimento Original",
  "DIA VENCIMENTO VEICULO": "Dia Vencimento Veiculo",
  "REGIONAL BOLETO": "Regional Boleto",
  "REGIONAL": "Regional Boleto",
  "COOPERATIVA": "Cooperativa",
  "VOLUNTÁRIO": "Voluntário",
  "VOLUNTARIO": "Voluntário",
  "NOME": "Nome",
  "PLACAS": "Placas",
  "PLACA": "Placas",
  "VALOR": "Valor",
  "DATA VENCIMENTO": "Data Vencimento",
  "VENCIMENTO": "Data Vencimento",
  "QTDE DIAS EM ATRASO VENCIMENTO ORIGINAL": "Qtde Dias em Atraso Vencimento Original",
  "DIAS ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "SITUACAO": "Situacao",
  "SITUAÇÃO": "Situacao",
  "SITUAÇÃO BOLETO": "Situacao",
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
  
  // Buffer para acumular linhas até termos um <tr>...</tr> completo
  let buffer = '';
  let insideRow = false;
  
  // Criar stream de leitura
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 64 * 1024 }), // 64KB chunks
    crlfDelay: Infinity,
  });
  
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
    
    // Detectar cabeçalho nas primeiras 10 linhas
    if (headerRowIndex === -1 && currentRowIndex <= 10) {
      const rowText = cells.join(' ').toUpperCase();
      if (rowText.includes('NOME') && (rowText.includes('PLACA') || rowText.includes('VALOR') || rowText.includes('VENCIMENTO'))) {
        headerRowIndex = currentRowIndex;
        headersEncontrados = cells.map(h => normalizeHeader(h));
        log(`Cabeçalho detectado na linha ${currentRowIndex}: ${cells.length} colunas`, LOG_LEVELS.DEBUG);
        
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
  log(`Registros válidos: ${dados.length} (${currentRowIndex} linhas lidas)`, LOG_LEVELS.SUCCESS);
  
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
  
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const rowText = rows[i].join(' ').toUpperCase();
    if (rowText.includes('NOME') && (rowText.includes('PLACA') || rowText.includes('VALOR') || rowText.includes('VENCIMENTO'))) {
      headerRowIndex = i;
      headersEncontrados = rows[i].map(h => normalizeHeader(h));
      log(`Cabeçalho detectado na linha ${i}: ${rows[i].length} colunas`, LOG_LEVELS.DEBUG);
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    log('Cabeçalho não encontrado - usando índices padrão', LOG_LEVELS.WARN);
    headersEncontrados = [
      'DATA PAGAMENTO', 'DATA VENCIMENTO ORIGINAL', 'DIA VENCIMENTO VEICULO',
      'REGIONAL BOLETO', 'COOPERATIVA', 'VOLUNTARIO', 'NOME', 'PLACAS',
      'VALOR', 'DATA VENCIMENTO', 'QTDE DIAS EM ATRASO VENCIMENTO ORIGINAL', 'SITUACAO',
    ];
    headerRowIndex = -1;
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
 * Processa arquivo Excel ou HTML (detecta automaticamente)
 * ASYNC: Pode retornar Promise para arquivos HTML muito grandes (streaming)
 */
async function processarArquivo(filePath) {
  // Detectar formato
  if (isHtmlFile(filePath)) {
    log(`Formato detectado: HTML disfarçado de Excel`, LOG_LEVELS.INFO);
    // processarHtmlRelatorio pode retornar Promise se usar streaming
    const result = processarHtmlRelatorio(filePath);
    return result instanceof Promise ? await result : result;
  }
  
  log(`Formato detectado: Excel binário`, LOG_LEVELS.INFO);
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

async function enviarWebhook(dados, nomeArquivo) {
  setStep('WEBHOOK');

  const mesReferencia = new Date().toISOString().slice(0, 7);
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

  log(`📤 Enviando ${total} registros para webhook em ${totalChunks} lote(s) (batch=${BATCH_SIZE})...`, LOG_LEVELS.INFO);

  const startTime = Date.now();

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const chunkIndex = Math.floor(offset / BATCH_SIZE) + 1;
    const batch = dados.slice(offset, offset + BATCH_SIZE);

    const payload = {
      corretora_id: CONFIG.CORRETORA_ID,
      importacao_id: importacaoId,
      dados: batch,
      nome_arquivo: nomeArquivo,
      mes_referencia: mesReferencia,
      total_registros: total,
      chunk_index: chunkIndex,
      chunk_total: totalChunks,
    };

    log(`📦 Lote ${chunkIndex}/${totalChunks}: enviando ${batch.length} registros...`, LOG_LEVELS.DEBUG);

    try {
      const response = await axios.post(CONFIG.WEBHOOK_URL, payload, {
        headers,
        timeout: 600000, // 10 min por lote
      });

      if (!importacaoId && response.data?.importacao_id) {
        importacaoId = response.data.importacao_id;
        log(`🆔 Importação iniciada: ${importacaoId}`, LOG_LEVELS.DEBUG);
      }

      enviados += batch.length;
      const pct = Math.min(100, Math.floor((enviados / total) * 100));
      log(`✅ Importação (envio) ${pct}% (${enviados}/${total})`, LOG_LEVELS.INFO);
    } catch (error) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      log(`❌ Falha no lote ${chunkIndex}/${totalChunks} após ${elapsed}s: ${error.response?.status || error.message}`, LOG_LEVELS.ERROR);
      return false;
    }
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  log(`✅ Webhook concluído em ${totalTime}s (importação_id=${importacaoId || 'N/A'})`, LOG_LEVELS.SUCCESS);
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
  
  const { inicio, fim } = getDateRange();
  log(`Período: ${inicio} até ${fim}`);
  
  let browser = null;
  let context = null;
  let page = null;
  
  try {
    setStep('BROWSER_INIT');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-popup-blocking'],
    });
    context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();

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
    
    // Preencher credenciais
    log('Preenchendo credenciais...');
    
    await page.fill('input[placeholder=""]', '2363').catch(() => {});
    
    try {
      await page.fill('input[placeholder="Usuário"]', CONFIG.HINOVA_USER);
    } catch (e) {
      log(`Erro ao preencher usuário: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    try {
      await page.fill('input[placeholder="Senha"]', CONFIG.HINOVA_PASS);
    } catch (e) {
      log(`Erro ao preencher senha: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    // Fallback: preencher via JavaScript
    await page.evaluate(({ usuario, senha }) => {
      const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])'));
      
      if (allInputs.length >= 3) {
        if (!allInputs[0].value) {
          allInputs[0].value = '2363';
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
    }, { usuario: CONFIG.HINOVA_USER, senha: CONFIG.HINOVA_PASS });
    
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
    
    log('Navegando para Relatório de Boletos...');
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
    // ETAPA: PREENCHIMENTO DE FILTROS
    // ============================================
    setStep('FILTROS');
    
    log(`Data Vencimento Original: ${inicio} até ${fim}`);
    
    const dataInicioInput = await page.$('input[name*="data_inicio"], input[name*="vencimento_inicial"], input[name*="dt_vencimento_original_ini"]');
    if (dataInicioInput) {
      await dataInicioInput.fill('');
      await dataInicioInput.fill(inicio);
      log(`Data início: ${inicio}`, LOG_LEVELS.DEBUG);
    }
    
    const dataFimInput = await page.$('input[name*="data_fim"], input[name*="vencimento_final"], input[name*="dt_vencimento_original_fim"]');
    if (dataFimInput) {
      await dataFimInput.fill('');
      await dataFimInput.fill(fim);
      log(`Data fim: ${fim}`, LOG_LEVELS.DEBUG);
    }
    
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
    
    // Layout
    log('Configurando layout...');
    const layoutSelect = await page.$('select[name*="layout"], select[name*="visualiza"], select[name*="dados_visualizados"]');
    if (layoutSelect) {
      await layoutSelect.selectOption({ label: 'BI - Vangard Cobrança' }).catch(async () => {
        await layoutSelect.selectOption({ label: 'BI - Vangard' }).catch(() => {});
      });
    }
    
    // Forma de Exibição: Em Excel
    await selecionarFormaExibicaoEmExcel(page);
    
    await page.waitForTimeout(1000);
    
    // ============================================
    // VALIDAÇÃO COMPLETA DE CHECKBOXES
    // ============================================
    // Antes de gerar, garantir que TODOS os checkboxes estão marcados
    // Isso evita que filtros não aplicados gerem arquivos enormes (600+ MB)
    // ============================================
    try {
      await validarEMarcarTodosCheckboxes(page, 3);
    } catch (checkboxError) {
      log(`Erro na validação de checkboxes: ${checkboxError.message}`, LOG_LEVELS.ERROR);
      await saveDebugInfo(page, context, `Checkboxes: ${checkboxError.message}`);
      throw checkboxError;
    }
    
    // ============================================
    // DEBUG: Salvar estado dos filtros ANTES de gerar
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
    
    log(`🔍 Estado dos filtros:`, LOG_LEVELS.DEBUG);
    log(`   Inputs: ${JSON.stringify(estadoFiltros.inputs)}`, LOG_LEVELS.DEBUG);
    log(`   Checkboxes marcados: ${estadoFiltros.checkboxes.marcados.join(', ') || 'nenhum'}`, LOG_LEVELS.DEBUG);
    log(`   Checkboxes desmarcados: ${estadoFiltros.checkboxes.desmarcados.join(', ') || 'nenhum'}`, LOG_LEVELS.DEBUG);
    log(`   Selects: ${JSON.stringify(estadoFiltros.selects)}`, LOG_LEVELS.DEBUG);
    log(`   Radios selecionados: ${estadoFiltros.radios.join(', ') || 'nenhum'}`, LOG_LEVELS.DEBUG);
    
    // Salvar screenshot dos filtros para análise
    await saveDebugInfo(page, context, 'Pre-download: estado dos filtros');
    log('🔍 Debug de filtros salvo para análise', LOG_LEVELS.DEBUG);
    
    log('Filtros configurados', LOG_LEVELS.SUCCESS);
    
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
        
        // Validar arquivo Excel (estrutura interna)
        const validation = validateDownloadedFile(result.filePath);
        if (!validation.valid) {
          throw new Error(`Arquivo inválido: ${validation.error}`);
        }
        
        if (validation.isHtml) {
          log(`Validação HTML OK: ~${validation.rows} linhas de tabela`, LOG_LEVELS.SUCCESS);
        } else {
          log(`Validação Excel OK: ${validation.sheets} planilha(s), ${validation.rows} registros`, LOG_LEVELS.SUCCESS);
        }
        
        // Processar arquivo (detecta formato automaticamente - async para streaming)
        dados = await processarArquivo(result.filePath);
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
    // ETAPA: ENVIO PARA WEBHOOK
    // ============================================
    const sucesso = await enviarWebhook(dados, nomeArquivoFinal);
    
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
// EXECUÇÃO
// ============================================
rodarRobo()
  .then((sucesso) => {
    if (sucesso) {
      log('Execução concluída com sucesso!', LOG_LEVELS.SUCCESS);
      process.exit(0);
    } else {
      log('Execução concluída com avisos', LOG_LEVELS.WARN);
      process.exit(1);
    }
  })
  .catch((error) => {
    log(`Execução falhou: ${error.message}`, LOG_LEVELS.ERROR);
    process.exit(1);
  });
