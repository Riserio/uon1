#!/usr/bin/env node
/**
 * Robô de Automação - MGF Hinova (Lançamentos Financeiros)
 * ========================================================
 * 
 * SEGUE O MESMO PADRÃO DO ROBÔ DE COBRANÇA PARA MÁXIMA ESTABILIDADE
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

// ============================================
// CONFIGURAÇÃO
// ============================================

function deriveRelatorioUrl(loginUrl) {
  try {
    const url = new URL(loginUrl);
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

const HINOVA_URL = process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php';

const CONFIG = {
  HINOVA_URL: HINOVA_URL,
  HINOVA_RELATORIO_URL: process.env.HINOVA_RELATORIO_URL || deriveRelatorioUrl(HINOVA_URL),
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

// ============================================
// CONSTANTES (MESMAS DO ROBÔ DE COBRANÇA)
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
  ACTION_DELAY: 500,
};

const LIMITS = {
  MAX_LOGIN_RETRIES: 20,
  MAX_POPUP_CLOSE_ATTEMPTS: 10,
  MAX_DOWNLOAD_RETRIES: 3,
  MIN_FILE_SIZE_BYTES: 100,
};

// ============================================
// LOGGING
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
// UTILS
// ============================================
function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        '#myModal .close',
        '#myModal button.close',
        '#myModal [data-dismiss="modal"]',
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
      
      // Fallback: tentar fechar via JavaScript
      if (!popupFechado) {
        try {
          const fechou = await page.evaluate(() => {
            let fechou = false;
            
            const modals = document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"], #myModal.show');
            modals.forEach(modal => {
              const closeBtn = modal.querySelector('.close, button.close, .btn-close, [data-dismiss="modal"]');
              if (closeBtn) {
                closeBtn.click();
                fechou = true;
              }
            });
            
            if (!fechou) {
              modals.forEach(modal => {
                modal.style.display = 'none';
                modal.classList.remove('show', 'in');
                fechou = true;
              });
            }
            
            const backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(b => b.remove());
            
            return fechou;
          });
          
          if (fechou) {
            log('Popup/modal fechado via JavaScript', LOG_LEVELS.DEBUG);
            popupFechado = true;
          }
        } catch {}
      }
      
    } catch (e) {
      log(`Erro ao fechar popup: ${e.message}`, LOG_LEVELS.DEBUG);
    }
  }
  
  return tentativas > 0;
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
// LOGIN (MESMO PADRÃO DO ROBÔ DE COBRANÇA)
// ============================================
async function realizarLogin(page) {
  setStep('LOGIN');
  log(`Acessando: ${CONFIG.HINOVA_URL}`, LOG_LEVELS.INFO);
  
  await page.goto(CONFIG.HINOVA_URL, { waitUntil: 'networkidle', timeout: TIMEOUTS.PAGE_LOAD });
  await page.waitForTimeout(2000);
  
  await fecharPopups(page);
  
  // Preencher credenciais
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
  
  // Preencher código do cliente se houver
  if (CONFIG.HINOVA_CODIGO_CLIENTE) {
    const codigoInput = page.locator('input[name*="codigo"], input[id*="codigo"], input[placeholder*="Código"]').first();
    if (await codigoInput.isVisible().catch(() => false)) {
      await codigoInput.fill(CONFIG.HINOVA_CODIGO_CLIENTE);
      log('Código do cliente preenchido', LOG_LEVELS.DEBUG);
    }
  }
  
  await fecharPopups(page);
  
  // Clicar no botão de login com retry
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
  log(`Navegando para: ${CONFIG.HINOVA_RELATORIO_URL}`, LOG_LEVELS.INFO);
  
  await page.goto(CONFIG.HINOVA_RELATORIO_URL, { waitUntil: 'networkidle', timeout: TIMEOUTS.PAGE_LOAD });
  await page.waitForTimeout(3000);
  
  await fecharPopups(page);
  
  log('Página de relatório carregada', LOG_LEVELS.SUCCESS);
  await saveDebugInfo(page, 'pagina_relatorio');
}

async function configurarFiltros(page) {
  setStep('FILTROS');
  log('Configurando filtros...', LOG_LEVELS.INFO);
  
  // ============================================
  // 1. CONFIGURAR CHECKBOXES DE CENTRO DE CUSTO
  // Marcar APENAS os que contêm "EVENTOS", desmarcar os demais
  // ============================================
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
    
    // Encontrar o container de Centro de Custo
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
      
      // Fallback: procurar por labels/textos específicos
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
      // 1) label[for]
      const id = input.getAttribute('id');
      if (id) {
        const lb = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lb && lb.textContent) return lb.textContent;
      }
      // 2) wrapper label
      const label = input.closest('label');
      if (label && label.textContent) return label.textContent;
      // 3) parent text
      const parent = input.parentElement;
      if (parent && parent.textContent) return parent.textContent;
      // 4) next sibling text
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
      
      // Marcar APENAS se contém "EVENTOS"
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
      detalhes: detalhes.slice(0, 10), // Primeiros 10 para log
    };
  });
  
  if (!batchResult?.ok) {
    log(`⚠️ Container de Centro de Custo não encontrado: ${batchResult?.reason}`, LOG_LEVELS.WARN);
    await saveDebugInfo(page, 'centro_custo_nao_encontrado');
  } else {
    log(`✅ Centro de Custo configurado: total=${batchResult.total}, marcados=${batchResult.marcados}, desmarcados=${batchResult.desmarcados}, alterados=${batchResult.alterados}`, LOG_LEVELS.SUCCESS);
    if (batchResult.detalhes?.length > 0) {
      log(`   Marcados: ${batchResult.detalhes.join(', ')}`, LOG_LEVELS.DEBUG);
    }
  }
  
  await page.waitForTimeout(1000);
  
  // ============================================
  // 2. SELECIONAR LAYOUT "BI VANGARD FINANCEIROS EVENTOS"
  // ============================================
  log('📋 Selecionando layout...', LOG_LEVELS.INFO);
  
  const layoutResult = await page.evaluate(() => {
    const normalize = (s) =>
      (s || '')
        .toString()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
    
    const selects = document.querySelectorAll('select');
    
    for (const select of selects) {
      const options = Array.from(select.options);
      
      for (let i = 0; i < options.length; i++) {
        const optText = normalize(options[i].text || '');
        
        // Procurar layout com VANGARD e FINANCEIRO (ou EVENTOS)
        if ((optText.includes('VANGARD') && (optText.includes('FINANCEIRO') || optText.includes('EVENTO'))) ||
            optText.includes('BI VANGARD')) {
          select.selectedIndex = i;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, selected: options[i].text };
        }
      }
    }
    
    return { ok: false };
  });
  
  if (layoutResult?.ok) {
    log(`✅ Layout selecionado: ${layoutResult.selected}`, LOG_LEVELS.SUCCESS);
  } else {
    log('⚠️ Layout não encontrado automaticamente, tentando via input...', LOG_LEVELS.WARN);
  }
  
  await page.waitForTimeout(1000);
  
  // ============================================
  // 3. SELECIONAR FORMATO "EM EXCEL"
  // ============================================
  log('📋 Selecionando formato Excel...', LOG_LEVELS.INFO);
  
  const excelResult = await page.evaluate(() => {
    const normalize = (s) =>
      (s || '')
        .toString()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
    
    // Tentar via radio button
    const radios = document.querySelectorAll('input[type="radio"]');
    for (const radio of radios) {
      const label = radio.closest('label');
      const labelText = normalize(label?.textContent || radio.value || '');
      
      if (labelText.includes('EXCEL') || labelText.includes('XLS')) {
        radio.checked = true;
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        return { ok: true, method: 'radio', label: labelText };
      }
    }
    
    // Tentar via select
    const selects = document.querySelectorAll('select');
    for (const select of selects) {
      const options = Array.from(select.options);
      
      for (let i = 0; i < options.length; i++) {
        const optText = normalize(options[i].text || '');
        
        if (optText.includes('EXCEL') || optText.includes('XLS')) {
          select.selectedIndex = i;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, method: 'select', label: options[i].text };
        }
      }
    }
    
    // Tentar via clique em label/botão
    const clickables = document.querySelectorAll('label, button, a, span');
    for (const el of clickables) {
      const text = normalize(el.textContent || '');
      if (text.includes('EXCEL') || text === 'EM EXCEL') {
        el.click();
        return { ok: true, method: 'click', label: text };
      }
    }
    
    return { ok: false };
  });
  
  if (excelResult?.ok) {
    log(`✅ Formato Excel selecionado via ${excelResult.method}: ${excelResult.label}`, LOG_LEVELS.SUCCESS);
  } else {
    log('⚠️ Formato Excel não encontrado automaticamente', LOG_LEVELS.WARN);
  }
  
  await saveDebugInfo(page, 'filtros_configurados');
  log('Filtros configurados', LOG_LEVELS.SUCCESS);
}

// ============================================
// DOWNLOAD (MESMO PADRÃO DO ROBÔ DE COBRANÇA)
// ============================================
async function gerarEBaixarRelatorio(page, context) {
  setStep('DOWNLOAD');
  log('Gerando relatório...', LOG_LEVELS.INFO);
  
  const downloadDir = getDownloadDirectory();
  const semanticName = generateSemanticFilename();
  const filePath = path.join(downloadDir, semanticName);
  
  log(`Diretório de download: ${downloadDir}`, LOG_LEVELS.INFO);
  log(`Nome do arquivo: ${semanticName}`, LOG_LEVELS.DEBUG);
  
  // Aumentar timeout durante download
  context.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
  page.setDefaultTimeout(TIMEOUTS.DOWNLOAD_HARD);
  
  // Salvar screenshot antes de tentar gerar
  await saveDebugInfo(page, 'antes_gerar');
  
  let downloadSucesso = false;
  
  for (let tentativa = 1; tentativa <= LIMITS.MAX_DOWNLOAD_RETRIES && !downloadSucesso; tentativa++) {
    log(`Tentativa de download ${tentativa}/${LIMITS.MAX_DOWNLOAD_RETRIES}...`, LOG_LEVELS.INFO);
    
    try {
      // ============================================
      // CLICAR NO BOTÃO GERAR (MULTI-ESTRATÉGIA)
      // ============================================
      const clicarGerar = async () => {
        const btnSelectors = [
          'button:has-text("Gerar")',
          'input[type="submit"][value*="Gerar"]',
          'input[type="button"][value*="Gerar"]',
          'a:has-text("Gerar")',
          'button:has-text("Pesquisar")',
          'input[type="submit"][value*="Pesquisar"]',
          'button:has-text("Consultar")',
          'input[value*="Consultar"]',
          'button:has-text("Buscar")',
          'button.btn-primary',
          'button.btn-success',
          'input.btn-primary[type="submit"]',
          'input.btn-success[type="submit"]',
          '#btnGerar',
          '#btnPesquisar',
        ];
        
        for (const selector of btnSelectors) {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            const btnText = await btn.textContent().catch(() => '') || await btn.getAttribute('value').catch(() => '');
            log(`Botão encontrado: ${selector} - "${btnText?.trim()}"`, LOG_LEVELS.DEBUG);
            return btn;
          }
        }
        
        // Fallback: qualquer submit visível
        const allSubmits = await page.locator('input[type="submit"], button[type="submit"]').all();
        for (const btn of allSubmits) {
          if (await btn.isVisible().catch(() => false)) {
            const btnText = await btn.getAttribute('value').catch(() => '') || await btn.textContent().catch(() => '');
            log(`Fallback - Botão submit encontrado: "${btnText}"`, LOG_LEVELS.DEBUG);
            return btn;
          }
        }
        
        return null;
      };
      
      const gerarBtn = await clicarGerar();
      
      if (!gerarBtn) {
        await saveDebugInfo(page, 'botao_nao_encontrado');
        throw new Error('Botão Gerar/Pesquisar não encontrado na página');
      }
      
      // ============================================
      // CONFIGURAR LISTENER DE DOWNLOAD ANTES DO CLIQUE
      // (MESMA ESTRATÉGIA DO ROBÔ DE COBRANÇA)
      // ============================================
      log('Configurando listener de download...', LOG_LEVELS.DEBUG);
      
      const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUTS.DOWNLOAD_TOTAL });
      
      // Clicar no botão
      await gerarBtn.click({ timeout: 15000, force: true });
      log('Botão Gerar clicado', LOG_LEVELS.SUCCESS);
      
      // ============================================
      // AGUARDAR DOWNLOAD
      // ============================================
      log(`Aguardando download (timeout: ${TIMEOUTS.DOWNLOAD_TOTAL / 60000} min)...`, LOG_LEVELS.INFO);
      
      const download = await downloadPromise;
      const suggestedName = download.suggestedFilename();
      log(`Download iniciado: ${suggestedName}`, LOG_LEVELS.SUCCESS);
      
      // Salvar arquivo
      log(`Salvando arquivo: ${filePath}`, LOG_LEVELS.INFO);
      await download.saveAs(filePath);
      
      // Validar arquivo
      if (!fs.existsSync(filePath)) {
        throw new Error('Arquivo não foi salvo');
      }
      
      const stats = fs.statSync(filePath);
      if (stats.size < LIMITS.MIN_FILE_SIZE_BYTES) {
        throw new Error(`Arquivo muito pequeno: ${stats.size} bytes`);
      }
      
      log(`✅ Arquivo salvo: ${filePath} (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
      downloadSucesso = true;
      
    } catch (downloadError) {
      log(`Erro na tentativa ${tentativa}: ${downloadError.message}`, LOG_LEVELS.ERROR);
      await saveDebugInfo(page, `erro_download_tentativa_${tentativa}`);
      
      if (tentativa < LIMITS.MAX_DOWNLOAD_RETRIES) {
        log('Preparando nova tentativa...', LOG_LEVELS.INFO);
        await page.waitForTimeout(5000);
        await fecharPopups(page);
        
        // Recarregar página se necessário
        const urlAtual = page.url();
        if (!urlAtual.includes('relatorioLancamento')) {
          log('Recarregando página de relatório...', LOG_LEVELS.INFO);
          await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
            waitUntil: 'networkidle',
            timeout: TIMEOUTS.PAGE_LOAD
          });
          await fecharPopups(page);
          await page.waitForTimeout(3000);
          
          // Re-configurar filtros
          await configurarFiltros(page);
        }
      }
    }
  }
  
  if (!downloadSucesso) {
    await saveDebugInfo(page, 'download_falhou_todas_tentativas');
    throw new Error('Download falhou após todas as tentativas');
  }
  
  return filePath;
}

// ============================================
// MAIN
// ============================================
async function main() {
  log('============================================================', LOG_LEVELS.SUCCESS);
  log('ROBÔ MGF HINOVA - INICIANDO', LOG_LEVELS.SUCCESS);
  log('============================================================', LOG_LEVELS.SUCCESS);
  
  // Notificar início
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
    
    // Timeout padrão moderado para operações normais
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
    
    // Gerar e baixar relatório (passando context para ajustar timeout)
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
        log('Debug files removidos (sucesso)', LOG_LEVELS.DEBUG);
      }
    } catch {}
    
    // Limpar arquivo de download após sucesso
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log('Arquivo temporário removido', LOG_LEVELS.DEBUG);
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
