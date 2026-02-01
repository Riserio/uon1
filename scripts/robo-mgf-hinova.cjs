#!/usr/bin/env node
/**
 * Robô de Automação - MGF Hinova (Lançamentos Financeiros)
 * ========================================================
 * 
 * FLUXO:
 * 1. Login no portal Hinova (com tratamento de modais)
 * 2. Navegar para MGF > Relatórios > 5.1 de Lançamentos
 * 3. Selecionar Centro de Custo/Departamento (apenas com "EVENTOS")
 * 4. Selecionar Layout "BI VANGARD FINANCEIROS EVENTOS"
 * 5. Selecionar tipo de relatório "Em Excel"
 * 6. Gerar e baixar relatório
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
  
  // Centros de custo a marcar (contém "EVENTOS")
  CENTROS_CUSTO_EVENTOS: ['EVENTOS', 'EVENTOS NAO PROVISIONADO', 'EVENTOS RATEAVEIS', 'EVENTOS NÃO PROVISIONADO', 'EVENTOS RATEÁVEIS'],
  
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
// CONSTANTES
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
  return `MGF_${day}${month}${year}.xlsx`;
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
            
            // Fechar modais Bootstrap visíveis
            const modals = document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"], #myModal.show');
            modals.forEach(modal => {
              const closeBtn = modal.querySelector('.close, button.close, .btn-close, [data-dismiss="modal"]');
              if (closeBtn) {
                closeBtn.click();
                fechou = true;
              }
            });
            
            // Esconder modais diretamente
            if (!fechou) {
              modals.forEach(modal => {
                modal.style.display = 'none';
                modal.classList.remove('show', 'in');
                fechou = true;
              });
            }
            
            // Remover backdrop
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
  
  // Extrair headers do thead
  const theadMatch = htmlContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  let headers = [];
  
  if (theadMatch) {
    const headerMatches = theadMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    headers = headerMatches.map(th => extrairTexto(th));
    log(`Headers encontrados: ${headers.length}`, LOG_LEVELS.DEBUG);
  }
  
  // Extrair dados do tbody
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
  
  // Detectar tipo de arquivo
  const header = fileBuffer.slice(0, 100).toString('utf8');
  const isHtml = header.includes('<html') || header.includes('<table') || header.includes('<!DOCTYPE');
  
  if (isHtml) {
    log('Arquivo detectado como HTML', LOG_LEVELS.INFO);
    const htmlContent = fileBuffer.toString('utf8');
    
    // Verificar se é erro do portal
    if (htmlContent.includes('Nenhum registro encontrado') || htmlContent.includes('Sem dados')) {
      log('Portal retornou "Nenhum registro encontrado"', LOG_LEVELS.WARN);
      return [];
    }
    
    return processarTabelaHtml(htmlContent);
  }
  
  // Tentar processar como Excel
  try {
    log('Processando como arquivo Excel...', LOG_LEVELS.INFO);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
    
    if (jsonData.length > 0) {
      log(`Registros extraídos do Excel: ${jsonData.length}`, LOG_LEVELS.SUCCESS);
      return jsonData;
    }
    
    // Tentar ler como raw para detectar HTML disfarçado
    const rawData = XLSX.utils.sheet_to_csv(firstSheet);
    if (rawData.includes('<html') || rawData.includes('<table')) {
      log('Excel contém HTML, processando como HTML...', LOG_LEVELS.INFO);
      return processarTabelaHtml(rawData);
    }
    
    return jsonData;
  } catch (e) {
    log(`Erro ao processar Excel: ${e.message}`, LOG_LEVELS.WARN);
    
    // Fallback: tentar como HTML
    const content = fileBuffer.toString('utf8');
    if (content.includes('<table')) {
      return processarTabelaHtml(content);
    }
    
    throw e;
  }
}

// ============================================
// SELEÇÃO DE LAYOUT
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
      await page.waitForTimeout(500);
      
      // Tentar clicar em opção do autocomplete
      const acOption = page.locator(`li:has-text("VANGARD"), .autocomplete-item:has-text("VANGARD"), .dropdown-item:has-text("VANGARD")`).first();
      if (await acOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await acOption.click().catch(() => null);
        log('Layout selecionado via autocomplete', LOG_LEVELS.DEBUG);
        return true;
      }
    }
  } catch {}

  return false;
}

// ============================================
// LOGIN
// ============================================
async function realizarLogin(page) {
  setStep('LOGIN');
  log(`Acessando: ${CONFIG.HINOVA_URL}`, LOG_LEVELS.INFO);
  
  await page.goto(CONFIG.HINOVA_URL, { waitUntil: 'networkidle', timeout: TIMEOUTS.PAGE_LOAD });
  await page.waitForTimeout(2000);
  
  // Fechar popups iniciais
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
  
  // Tentar selecionar layout se disponível
  await trySelectHinovaLayout(page);
  
  // Fechar popups antes de clicar em login
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
      // Fechar popups antes de cada tentativa
      await fecharPopups(page);
      
      // Verificar se ainda está na página de login
      if (!(await isAindaNaLogin())) {
        loginSucesso = true;
        break;
      }
      
      log(`Tentativa de login ${tentativa}/${LIMITS.MAX_LOGIN_RETRIES}...`, LOG_LEVELS.INFO);
      
      // Tentar clicar no botão
      await loginBtn.click({ timeout: 5000 }).catch(async () => {
        // Se falhou, pode ter popup - fechar e tentar com force
        await fecharPopups(page);
        await loginBtn.click({ force: true, timeout: 5000 }).catch(() => {});
      });
      
      await page.waitForTimeout(TIMEOUTS.LOGIN_RETRY_WAIT);
      
      // Fechar popups pós-login
      await fecharPopups(page);
      
      // Verificar se login funcionou
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
  
  // Fechar popups
  await fecharPopups(page);
  
  log('Página de relatório carregada', LOG_LEVELS.SUCCESS);
  await saveDebugInfo(page, 'pagina_relatorio');
}

async function configurarFiltros(page) {
  setStep('FILTROS');
  log('Configurando filtros...', LOG_LEVELS.INFO);
  
  // 1. Marcar/desmarcar SOMENTE os checkboxes do bloco de "Centro de Custo"
  // (em lote via JS, para evitar ficar minutos clicando em centenas de inputs)
  log('Processando checkboxes de Centro de Custo...', LOG_LEVELS.INFO);

  const scopeCandidates = [
    {
      name: 'fieldset: Centro de Custo',
      locator: page.locator('fieldset', { hasText: /Centro\s+de\s+Custo/i }).first(),
    },
    {
      name: 'div: Centro de Custo',
      locator: page
        .locator('div', { hasText: /Centro\s+de\s+Custo/i })
        .filter({ has: page.locator('input[type="checkbox"]') })
        .first(),
    },
    {
      name: 'form: Centro de Custo',
      locator: page
        .locator('form', { hasText: /Centro\s+de\s+Custo/i })
        .filter({ has: page.locator('input[type="checkbox"]') })
        .first(),
    },
  ];

  let scopeLocator = null;
  for (const candidate of scopeCandidates) {
    try {
      if ((await candidate.locator.count()) === 0) continue;
      if (!(await candidate.locator.isVisible().catch(() => false))) continue;

      const cbCount = await candidate.locator.locator('input[type="checkbox"]').count().catch(() => 0);
      // heurística para evitar pegar containers genéricos gigantes
      if (cbCount > 0 && cbCount < 400) {
        scopeLocator = candidate.locator;
        log(`Escopo de Centro de Custo detectado: ${candidate.name} (${cbCount} checkboxes)`, LOG_LEVELS.DEBUG);
        break;
      }
    } catch {}
  }

  const batchResult = await (async () => {
    // Se não achou escopo por locators, tenta descobrir via DOM (ainda assim sem sair desmarcando a página inteira)
    if (!scopeLocator) {
      log('Escopo de Centro de Custo não encontrado por seletor; tentando detecção automática...', LOG_LEVELS.WARN);

      return await page.evaluate(() => {
        const normalize = (s) =>
          (s || '')
            .toString()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        const findBestContainer = () => {
          const nodes = Array.from(document.querySelectorAll('*'));
          const anchors = nodes.filter((el) => {
            const txt = (el.textContent || '').trim();
            return txt && /Centro\s+de\s+Custo/i.test(txt) && el.children.length === 0;
          });

          let best = null;
          let bestScore = Infinity;

          for (const anchor of anchors) {
            let el = anchor;
            for (let depth = 0; el && depth < 10; depth += 1) {
              const cbs = el.querySelectorAll('input[type="checkbox"]');
              if (cbs.length > 0 && cbs.length < 400) {
                const score = cbs.length + depth * 25;
                if (score < bestScore) {
                  best = el;
                  bestScore = score;
                }
                break;
              }
              el = el.parentElement;
            }
          }

          return best;
        };

        const container = findBestContainer();
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
          return '';
        };

        const inputs = Array.from(container.querySelectorAll('input[type="checkbox"]'));
        let marcados = 0;
        let desmarcados = 0;
        let alterados = 0;

        for (const input of inputs) {
          const t = normalize(labelTextFor(input));
          if (!t || t === 'todos') continue;

          const shouldCheck = t.includes('evento');
          if (input.checked !== shouldCheck) {
            input.checked = shouldCheck;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            alterados += 1;
          }
          if (shouldCheck) marcados += 1;
          else desmarcados += 1;
        }

        return {
          ok: true,
          used: 'auto_container',
          total: inputs.length,
          marcados,
          desmarcados,
          alterados,
        };
      });
    }

    // Caminho principal (rápido): atuar só dentro do escopo identificado
    return await scopeLocator.evaluate((root) => {
      const normalize = (s) =>
        (s || '')
          .toString()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();

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
        return '';
      };

      const inputs = Array.from(root.querySelectorAll('input[type="checkbox"]'));
      let marcados = 0;
      let desmarcados = 0;
      let alterados = 0;

      for (const input of inputs) {
        const t = normalize(labelTextFor(input));
        if (!t || t === 'todos') continue;

        const shouldCheck = t.includes('evento');
        if (input.checked !== shouldCheck) {
          input.checked = shouldCheck;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          alterados += 1;
        }
        if (shouldCheck) marcados += 1;
        else desmarcados += 1;
      }

      return {
        ok: true,
        used: 'scoped_container',
        total: inputs.length,
        marcados,
        desmarcados,
        alterados,
      };
    });
  })();

  if (!batchResult?.ok) {
    await saveDebugInfo(page, 'centro_custo_escopo_nao_encontrado');
    throw new Error('Não foi possível identificar o bloco de Centro de Custo para aplicar o filtro de EVENTOS.');
  }

  log(
    `Centro de Custo aplicado (${batchResult.used}): total=${batchResult.total}, marcados=${batchResult.marcados}, desmarcados=${batchResult.desmarcados}, alterados=${batchResult.alterados}`,
    LOG_LEVELS.SUCCESS
  );

  // Pequena pausa para a página reagir a eventos de change/input (quando existir dependência)
  await page.waitForTimeout(500);
  
  // 4. Selecionar Layout "BI VANGARD FINANCEIROS EVENTOS"
  log('Selecionando layout...', LOG_LEVELS.INFO);
  const layoutSelect = page.locator('select[name*="layout"], select[id*="layout"], select[name*="dados"]').first();
  
  if (await layoutSelect.isVisible().catch(() => false)) {
    const options = await layoutSelect.locator('option').allTextContents();
    const targetOption = options.find(opt => normalizeText(opt).includes('vangard') && normalizeText(opt).includes('financeiro'));
    
    if (targetOption) {
      await layoutSelect.selectOption({ label: targetOption });
      log(`Layout selecionado: ${targetOption}`, LOG_LEVELS.SUCCESS);
    } else {
      // Tentar selecionar por valor parcial
      await layoutSelect.selectOption({ label: CONFIG.HINOVA_LAYOUT }).catch(() => {});
      log(`Tentativa de selecionar layout: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.INFO);
    }
    
    await page.waitForTimeout(1000);
  }
  
  // 5. Selecionar tipo de relatório "Em Excel"
  log('Selecionando formato Excel...', LOG_LEVELS.INFO);
  const excelRadio = page.locator('input[type="radio"][value*="excel"], input[type="radio"][value*="xls"]').first();
  
  if (await excelRadio.isVisible().catch(() => false)) {
    await excelRadio.check();
    log('Formato Excel selecionado via radio', LOG_LEVELS.SUCCESS);
  } else {
    // Tentar select
    const formatSelect = page.locator('select[name*="tipo"], select[name*="formato"], select[name*="exibicao"]').first();
    if (await formatSelect.isVisible().catch(() => false)) {
      const options = await formatSelect.locator('option').allTextContents();
      const excelOption = options.find(opt => normalizeText(opt).includes('excel'));
      if (excelOption) {
        await formatSelect.selectOption({ label: excelOption });
        log(`Formato selecionado: ${excelOption}`, LOG_LEVELS.SUCCESS);
      }
    } else {
      // Último recurso: clicar no label/botão/link que contenha "EXCEL"
      const excelClickable = page
        .locator('label:has-text("EXCEL"), button:has-text("EXCEL"), a:has-text("EXCEL"), text=/Em\\s+Excel/i')
        .first();

      if (await excelClickable.isVisible().catch(() => false)) {
        await excelClickable.click({ timeout: 5000 }).catch(() => {});
        log('Formato Excel selecionado via clique em texto/label', LOG_LEVELS.SUCCESS);
      }
    }
  }
  
  await saveDebugInfo(page, 'filtros_configurados');
  log('Filtros configurados', LOG_LEVELS.SUCCESS);
}

// ============================================
// DOWNLOAD
// ============================================
async function gerarEBaixarRelatorio(page) {
  setStep('DOWNLOAD');
  log('Gerando relatório...', LOG_LEVELS.INFO);
  
  const downloadDir = getDownloadDirectory();
  const filename = generateSemanticFilename();
  const filePath = path.join(downloadDir, filename);
  
  log(`Diretório de download: ${downloadDir}`, LOG_LEVELS.INFO);
  
  // Salvar screenshot antes de tentar gerar
  await saveDebugInfo(page, 'antes_gerar');
  
  // Lista de seletores possíveis para o botão Gerar/Pesquisar
  const btnSelectors = [
    'button:has-text("Gerar")',
    'input[type="submit"][value*="Gerar"]',
    'input[type="button"][value*="Gerar"]',
    'a:has-text("Gerar")',
    'button:has-text("Pesquisar")',
    'input[type="submit"][value*="Pesquisar"]',
    'input[type="button"][value*="Pesquisar"]',
    'button:has-text("Consultar")',
    'input[value*="Consultar"]',
    'button:has-text("Buscar")',
    'input[value*="Buscar"]',
    'button.btn-primary',
    'button.btn-success',
    'input.btn-primary[type="submit"]',
    'input.btn-success[type="submit"]',
    '#btnGerar',
    '#btnPesquisar',
    'button[name="gerar"]',
    'input[name="gerar"]',
  ];
  
  // Tentar encontrar o botão
  let gerarBtn = null;
  for (const selector of btnSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      gerarBtn = btn;
      const btnText = await btn.textContent().catch(() => '') || await btn.getAttribute('value').catch(() => '');
      log(`Botão encontrado: ${selector} - "${btnText.trim()}"`, LOG_LEVELS.DEBUG);
      break;
    }
  }
  
  if (!gerarBtn) {
    // Último recurso: buscar qualquer botão submit visível
    const allSubmits = await page.locator('input[type="submit"], button[type="submit"]').all();
    for (const btn of allSubmits) {
      if (await btn.isVisible().catch(() => false)) {
        gerarBtn = btn;
        const btnText = await btn.getAttribute('value').catch(() => '') || await btn.textContent().catch(() => '');
        log(`Fallback - Botão submit encontrado: "${btnText}"`, LOG_LEVELS.DEBUG);
        break;
      }
    }
  }
  
  if (!gerarBtn) {
    await saveDebugInfo(page, 'botao_nao_encontrado');
    throw new Error('Botão Gerar/Pesquisar não encontrado na página');
  }
  
  // Configurar listener de download ANTES do clique
  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUTS.DOWNLOAD_EVENT });
  
  // Clicar no botão
  await gerarBtn.click();
  log('Botão Gerar clicado', LOG_LEVELS.SUCCESS);
  
  // Aguardar download
  log('Aguardando download...', LOG_LEVELS.INFO);
  
  try {
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    log(`Download iniciado: ${suggestedName}`, LOG_LEVELS.SUCCESS);
    
    // Salvar arquivo
    await download.saveAs(filePath);
    log(`Arquivo salvo: ${filePath}`, LOG_LEVELS.SUCCESS);
    
    // Validar arquivo
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      log(`Validação OK: ${formatBytes(stats.size)}`, LOG_LEVELS.SUCCESS);
      return filePath;
    }
  } catch (e) {
    log(`Erro no download: ${e.message}`, LOG_LEVELS.ERROR);
    await saveDebugInfo(page, 'erro_download');
    throw e;
  }
  
  throw new Error('Falha ao baixar arquivo');
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
  let filePath;
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
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
    filePath = await gerarEBaixarRelatorio(page);
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
    
  } catch (error) {
    log(`ERRO FATAL: ${error.message}`, LOG_LEVELS.ERROR);
    await notifyError(error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Executar
main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
