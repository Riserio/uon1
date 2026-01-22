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
  DOWNLOAD_TOTAL: 10 * 60000, // 10 min total para download
  DOWNLOAD_SAVE: 5 * 60000,   // 5 min para salvar arquivo
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
  
  // ===== PASSO 2: Validar arquivo temporário via download.path() =====
  let tempPath = null;
  try {
    tempPath = await download.path();
    if (tempPath && fs.existsSync(tempPath)) {
      const tempStats = fs.statSync(tempPath);
      log(`Arquivo temporário válido: ${tempPath} (${tempStats.size} bytes)`, LOG_LEVELS.DEBUG);
    }
  } catch (e) {
    // download.path() pode falhar se o download ainda não completou internamente
    // Mas prosseguimos com saveAs que aguardará o download completo
    log(`Aviso: download.path() não disponível - ${e.message}`, LOG_LEVELS.DEBUG);
  }
  
  // ===== PASSO 3 e 4: Executar saveAs IMEDIATAMENTE =====
  log(`Salvando arquivo: ${suggestedName} -> ${filePath}`, LOG_LEVELS.INFO);
  
  // EXECUÇÃO IMEDIATA - sem nenhum await de página, popup ou response
  await download.saveAs(filePath);
  
  // ===== PASSO 5: Validação síncrona =====
  // Verificar existência do arquivo
  if (!fs.existsSync(filePath)) {
    throw new Error('FALHA: Arquivo não existe após saveAs');
  }
  
  // Verificar tamanho > 0
  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`FALHA: Arquivo vazio (${stats.size} bytes)`);
  }
  
  // ===== PASSO 6: Log de sucesso com nome e tamanho =====
  const sizeKB = (stats.size / 1024).toFixed(2);
  log(`Arquivo salvo com sucesso: ${semanticName} (${sizeKB} KB)`, LOG_LEVELS.SUCCESS);
  
  // ===== PASSO 7: Etapa DOWNLOAD concluída =====
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
      } else {
        value = value ? String(value).trim() : null;
      }
      
      if (value !== null && value !== '') {
        rowData[mappedHeader] = value;
        temDados = true;
      }
    }
    
    if (temDados) dados.push(rowData);
  }
  
  log(`Registros válidos: ${dados.length}`, LOG_LEVELS.SUCCESS);
  return dados;
}

async function enviarWebhook(dados, nomeArquivo) {
  setStep('WEBHOOK');
  
  log(`Enviando ${dados.length} registros para webhook...`);
  
  await axios.post(CONFIG.WEBHOOK_URL, {
    corretora_id: CONFIG.CORRETORA_ID,
    dados,
    nome_arquivo: nomeArquivo,
    mes_referencia: new Date().toISOString().slice(0, 7),
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
  });
  
  log('Webhook enviado com sucesso', LOG_LEVELS.SUCCESS);
  return true;
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================
async function rodarRobo() {
  setStep('INICIO');
  log('INICIANDO ROBÔ DE COBRANÇA HINOVA');

  const { inicio, fim } = getDateRange();
  let browser, context, page;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();

    // LOGIN
    setStep('LOGIN');
    await page.goto(CONFIG.HINOVA_URL, { waitUntil: 'domcontentloaded' });
    await realizarLogin(page);

    // RELATÓRIO
    setStep('RELATORIO');
    await page.goto(CONFIG.HINOVA_RELATORIO_URL, { waitUntil: 'domcontentloaded' });
    await configurarFiltros(page, inicio, fim);
    await selecionarFormaExibicaoEmExcel(page);

    // DOWNLOAD
    setStep('DOWNLOAD');
    const nomeArquivo = generateSemanticFilename('Cobranca_Hinova', inicio, fim);
    const downloadDir = getDownloadDirectory();

    const resultado = await aguardarDownloadHibrido(
      context,
      page,
      downloadDir,
      nomeArquivo,
      TIMEOUTS.DOWNLOAD_TOTAL
    );

    if (!resultado.success) {
      throw resultado.error || new Error('Falha no download');
    }

    const dados = processarExcel(resultado.filePath);
    if (!dados.length) throw new Error('Excel sem dados');

    // WEBHOOK
    await enviarWebhook(dados, nomeArquivo);

    log('ROBÔ FINALIZADO COM SUCESSO', LOG_LEVELS.SUCCESS);
    return true;

  } catch (error) {
    log(`ERRO CRÍTICO: ${error.message}`, LOG_LEVELS.ERROR);
    if (page && context) await saveDebugInfo(page, context, error.message);
    throw error;

  } finally {
    setStep('ENCERRAMENTO');
    if (browser) await browser.close();
  }
}

// ============================================
// EXECUÇÃO
// ============================================
rodarRobo()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
