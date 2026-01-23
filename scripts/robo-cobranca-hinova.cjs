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
  DOWNLOAD_TOTAL: 3 * 60000,  // 3 min total para download
  DOWNLOAD_SAVE: 3 * 60000,   // 3 min para salvar arquivo
  POPUP_CLOSE: 800,           // 800ms para fechar popup
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
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
  const inicio = periodoInicio.replace(/\//g, '');
  const fim = periodoFim.replace(/\//g, '');
  
  return `${tipoRelatorio}_${inicio}-${fim}_${timestamp}.xlsx`;
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
function validateDownloadedFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Arquivo não existe' };
  }
  
  const stats = fs.statSync(filePath);
  
  if (stats.size < LIMITS.MIN_FILE_SIZE_BYTES) {
    return { valid: false, error: `Arquivo muito pequeno: ${stats.size} bytes` };
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
 * Verifica se uma resposta HTTP contém um arquivo Excel
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
    
    // Verificar Content-Type
    if (contentType.includes('spreadsheet') || 
        contentType.includes('excel') || 
        contentType.includes('vnd.ms-excel') ||
        contentType.includes('vnd.openxmlformats-officedocument.spreadsheetml')) {
      return true;
    }
    
    // Verificar Content-Disposition
    if (contentDisposition.includes('.xlsx') || contentDisposition.includes('.xls')) {
      return true;
    }
    
    // Verificar extensão na URL
    if (url.includes('.xlsx') || url.includes('.xls')) {
      return true;
    }
    
    // Verificar octet-stream com attachment Excel
    if (contentType.includes('octet-stream') && 
        contentDisposition.includes('attachment') && 
        (contentDisposition.includes('xls') || contentDisposition.includes('xlsx'))) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Watcher 1: Intercepta respostas HTTP que contêm Excel
 * 
 * FLUXO TERMINAL - Ao detectar resposta Excel:
 * 1. Log: "Download capturado"
 * 2. fs.writeFileSync() - salva imediatamente
 * 3. Log: "Salvando arquivo"
 * 4. Validação síncrona: existsSync + size > 0
 * 5. Log: "Arquivo salvo com sucesso"
 * 6. Etapa DOWNLOAD finaliza
 */
function criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();
  
  const onResponse = async (response) => {
    if (controller.isCaptured()) return;
    if (isExcelResponse(response)) {
      // ===== PASSO 1: Marcar como capturado e log =====
      const wasCaptured = controller.setCaptured({ 
        type: 'httpResponse', 
        response, 
        source: 'httpInterception' 
      });
      
      if (!wasCaptured) return;
      
      log(`Download capturado (via HTTP)`, LOG_LEVELS.SUCCESS);
      
      try {
        const filePath = path.join(downloadDir, semanticName);
        
        // ===== PASSO 2 e 3: Salvar arquivo imediatamente =====
        log(`Salvando arquivo via HTTP: ${semanticName}`, LOG_LEVELS.INFO);
        
        const buf = await response.body();
        fs.writeFileSync(filePath, buf);
        
        // ===== PASSO 4: Validação síncrona =====
        if (!fs.existsSync(filePath)) {
          throw new Error('FALHA: Arquivo não existe após salvamento HTTP');
        }
        
        const stats = fs.statSync(filePath);
        if (stats.size <= 0) {
          throw new Error(`FALHA: Arquivo vazio (${stats.size} bytes)`);
        }
        
        // ===== PASSO 5: Log de sucesso =====
        const sizeKB = (stats.size / 1024).toFixed(2);
        log(`Arquivo salvo com sucesso: ${semanticName} (${sizeKB} KB)`, LOG_LEVELS.SUCCESS);
        
        // ===== PASSO 6: Etapa DOWNLOAD concluída =====
        log(`✅ Etapa DOWNLOAD concluída`, LOG_LEVELS.SUCCESS);
        
        controller.setFileResult({ filePath, size: stats.size });
      } catch (e) {
        log(`Erro ao salvar via HTTP: ${e.message}`, LOG_LEVELS.ERROR);
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
 * FLUXO TERMINAL - Após capturar o objeto Download:
 * 1. Log: "Download capturado"
 * 2. download.path() - valida existência do arquivo temporário
 * 3. download.saveAs(caminhoFinal) - executa IMEDIATAMENTE
 * 4. Log: "Salvando arquivo"
 * 5. Validação síncrona: fs.existsSync() + stats.size > 0
 * 6. Log: "Arquivo salvo com sucesso" com nome e tamanho
 * 7. Etapa DOWNLOAD finaliza - SEM awaits adicionais
 * 
 * PROIBIDO: Nenhum await page.waitFor*, context.waitForEvent ou watcher após saveAs
 */
async function processarDownloadImediato(download, downloadDir, semanticName) {
  // ===== PASSO 1: Log de captura =====
  log(`Download capturado`, LOG_LEVELS.SUCCESS);
  
  const filePath = path.join(downloadDir, semanticName);
  const suggestedName = download.suggestedFilename?.() || 'download.xlsx';

  // ===== PASSO 2: Executar saveAs IMEDIATAMENTE (sem aguardar página/popup/rede) =====
  log(`Salvando arquivo: ${suggestedName} -> ${filePath}`, LOG_LEVELS.INFO);
  
  // EXECUÇÃO IMEDIATA - sem nenhum await de página, popup ou response
  await Promise.race([
    download.saveAs(filePath),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout salvando arquivo (${TIMEOUTS.DOWNLOAD_SAVE / 60000} min)`)), TIMEOUTS.DOWNLOAD_SAVE)),
  ]);
  
  // ===== PASSO 3: Validação síncrona =====
  // Verificar existência do arquivo
  if (!fs.existsSync(filePath)) {
    throw new Error('FALHA: Arquivo não existe após saveAs');
  }
  
  // Verificar tamanho > 0
  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`FALHA: Arquivo vazio (${stats.size} bytes)`);
  }
  
  // ===== PASSO 4: Log de sucesso com nome e tamanho =====
  const sizeKB = (stats.size / 1024).toFixed(2);
  log(`Arquivo salvo com sucesso: ${semanticName} (${sizeKB} KB)`, LOG_LEVELS.SUCCESS);
  
  // ===== PASSO 5: Etapa DOWNLOAD concluída =====
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
      // EXECUÇÃO IMEDIATA: path() + saveAs() + validação síncrona
      const result = await processarDownloadImediato(download, downloadDir, semanticName);
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
function criarWatcherDownloadPaginaPrincipal(page, controller, downloadDir, semanticName) {
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
      // EXECUÇÃO IMEDIATA: path() + saveAs() + validação síncrona
      const result = await processarDownloadImediato(download, downloadDir, semanticName);
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
 * - Ao capturar download, executa saveAs IMEDIATAMENTE
 * - NÃO aguarda carregamento de página após captura
 * - NÃO executa lógica adicional após saveAs
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
          // EXECUÇÃO IMEDIATA: path() + saveAs() + validação síncrona
          // Nenhum await de página após isso
          const result = await processarDownloadImediato(download, downloadDir, semanticName);
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
 * O saveAs é executado IMEDIATAMENTE dentro do watcher que captura o download
 * Retorna o resultado com o caminho do arquivo JÁ SALVO
 * 
 * FLUXO TERMINAL - Ao capturar um download:
 * 1. download.path() valida existência do arquivo temporário
 * 2. download.saveAs(caminhoFinal) executa IMEDIATAMENTE
 * 3. Validação síncrona (existsSync + size > 0)
 * 4. Etapa DOWNLOAD finaliza - SEM awaits adicionais
 * 
 * PROIBIDO após saveAs:
 * - page.waitFor* / page.waitForEvent
 * - context.waitForEvent
 * - Qualquer watcher ou listener adicional
 */
async function aguardarDownloadHibrido(context, page, downloadDir, semanticName, timeoutMs) {
  log(`Iniciando captura híbrida de download (timeout: ${timeoutMs / 60000} min)...`, LOG_LEVELS.INFO);
  log(`Arquivo destino: ${path.join(downloadDir, semanticName)}`, LOG_LEVELS.DEBUG);
  
  const controller = new DownloadController();
  
  // Iniciar todos os watchers - passando downloadDir e semanticName para saveAs imediato
  criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName);
  criarWatcherDownloadPaginaPrincipal(page, controller, downloadDir, semanticName);
  criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName);
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

function processarExcel(filePath) {
  log(`Processando arquivo: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  log(`Total de linhas brutas: ${rawData.length}`, LOG_LEVELS.DEBUG);
  
  if (rawData.length === 0) {
    log('Arquivo Excel vazio!', LOG_LEVELS.WARN);
    return [];
  }
  
  const primeiraLinha = rawData[0];
  const headersOriginais = Object.keys(primeiraLinha);
  log(`Colunas: ${headersOriginais.join(', ')}`, LOG_LEVELS.DEBUG);
  
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
  }
  
  log(`Registros válidos: ${dados.length}`, LOG_LEVELS.SUCCESS);
  return dados;
}

async function enviarWebhook(dados, nomeArquivo) {
  setStep('WEBHOOK');
  
  const payload = {
    corretora_id: CONFIG.CORRETORA_ID,
    dados,
    nome_arquivo: nomeArquivo,
    mes_referencia: new Date().toISOString().slice(0, 7),
  };
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (CONFIG.WEBHOOK_SECRET) {
    headers['x-webhook-secret'] = CONFIG.WEBHOOK_SECRET;
  }
  
  log(`Enviando ${dados.length} registros para webhook...`);
  
  try {
    const response = await axios.post(CONFIG.WEBHOOK_URL, payload, {
      headers,
      timeout: 120000,
    });
    
    log(`Webhook OK: ${response.data.message || 'Sucesso'}`, LOG_LEVELS.SUCCESS);
    return true;
  } catch (error) {
    log(`Erro no webhook: ${error.response?.status || error.message}`, LOG_LEVELS.ERROR);
    return false;
  }
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
    
    // Situação Boleto: somente ABERTO
    log('Configurando Situação Boleto: somente ABERTO...');
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      
      for (const cb of checkboxes) {
        const label = cb.closest('label') || cb.parentElement;
        const labelText = label?.textContent?.trim().toUpperCase() || '';
        const value = cb.value?.toUpperCase() || '';
        
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          if (labelText === 'TODOS' || value === 'TODOS') {
            if (cb.checked) cb.click();
          }
        }
      }
    });
    
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      
      for (const cb of checkboxes) {
        const label = cb.closest('label') || cb.parentElement;
        const labelText = label?.textContent?.trim().toUpperCase() || '';
        const value = cb.value?.toUpperCase() || '';
        
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          const isAberto = labelText === 'ABERTO' || value === 'ABERTO';
          
          if (isAberto) {
            if (!cb.checked) cb.click();
          } else if (labelText !== 'TODOS' && value !== 'TODOS') {
            if (cb.checked) cb.click();
          }
        }
      }
    });
    
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
    log('Filtros configurados', LOG_LEVELS.SUCCESS);
    
    // ============================================
    // ETAPA: DOWNLOAD (EXECUÇÃO IMEDIATA DO SAVEAS)
    // ============================================
    // Ao capturar um objeto Download válido:
    // 1. download.path() valida existência do arquivo temporário
    // 2. download.saveAs(caminhoFinal) executa IMEDIATAMENTE
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
        // NOTA: O saveAs é executado IMEDIATAMENTE dentro do watcher que captura
        log('Iniciando estratégia híbrida de captura de download...');
        
        // Criar a promessa de captura híbrida (com downloadDir e semanticName para saveAs imediato)
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
        
        log(`Validação Excel OK: ${validation.sheets} planilha(s), ${validation.rows} registros`, LOG_LEVELS.SUCCESS);
        
        // Processar Excel
        dados = processarExcel(result.filePath);
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
