#!/usr/bin/env node
/**
 * Robô de Automação - SGA Hinova (Eventos)
 * =========================================
 * 
 * Este script automatiza a extração do relatório 11.9.1 (Por Eventos)
 * do portal SGA Hinova e envia os dados para o webhook.
 * 
 * FLUXO SIMPLIFICADO:
 * -------------------
 * 1. Login no portal
 * 2. Navegar DIRETAMENTE para URL do relatório (relatorioEvento.php)
 * 3. Preencher: Data Cadastro Item (período)
 * 4. Selecionar: Layout "BI - VANGARD" em Dados Visualizados
 * 5. Selecionar: Forma de Exibição "Em Excel"
 * 6. Clicar em Gerar
 * 
 * REQUISITOS:
 * -----------
 * npm install playwright axios xlsx
 * npx playwright install chromium
 * 
 * EXECUÇÃO:
 * ---------
 * node robo-sga-hinova.cjs
 */

const { chromium } = require('playwright');
const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURAÇÃO
// ============================================

const CONFIG = {
  HINOVA_URL: process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php',
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  HINOVA_CODIGO_CLIENTE: process.env.HINOVA_CODIGO_CLIENTE || '',
  HINOVA_LAYOUT: process.env.HINOVA_LAYOUT || 'BI - VANGARD',
  
  // Período do relatório
  DATA_INICIO: process.env.DATA_INICIO || '01/01/2000',
  DATA_FIM: process.env.DATA_FIM || new Date().toLocaleDateString('pt-BR'),
  
  // Webhook
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  
  // Identificadores
  CORRETORA_ID: process.env.CORRETORA_ID || '',
  EXECUCAO_ID: process.env.EXECUCAO_ID || '',
  GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || '',
  GITHUB_RUN_URL: process.env.GITHUB_RUN_URL || '',
  
  // Diretórios
  DOWNLOAD_DIR: './downloads',
  DEBUG_DIR: './debug',
};

/**
 * Deriva a URL do relatório de eventos a partir da URL de login
 * Exemplo: https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php
 *       -> https://eris.hinova.com.br/sga/sgav4_valecar/relatorio/relatorioEvento.php
 */
function deriveRelatorioUrl(loginUrl) {
  try {
    const url = new URL(loginUrl);
    // Extrai o path base (ex: /sga/sgav4_valecar/)
    const pathMatch = url.pathname.match(/^(\/sga\/[^\/]+\/)/);
    if (pathMatch) {
      return `${url.origin}${pathMatch[1]}relatorio/relatorioEvento.php`;
    }
    // Fallback: tentar substituir v5/login.php por relatorio/relatorioEvento.php
    const fallbackPath = url.pathname.replace(/v5\/login\.php.*/, 'relatorio/relatorioEvento.php');
    return `${url.origin}${fallbackPath}`;
  } catch (e) {
    console.error(`Erro ao derivar URL do relatório: ${e.message}`);
    return null;
  }
}

// Timeouts
const TIMEOUTS = {
  PAGE_LOAD: 60000,
  LOGIN_RETRY_WAIT: 5000,
  DOWNLOAD_WAIT: 300000, // 5 minutos
  POPUP_CLOSE: 500,
};

// Limites
const LIMITS = {
  MAX_LOGIN_RETRIES: 20,
  MAX_POPUP_CLOSE_ATTEMPTS: 10,
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
// UTIL: Normalização de texto
// ============================================
function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
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
    const headers = {
      'Content-Type': 'application/json',
    };
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
    status,
    etapa,
    ...extras,
  });
}

// ============================================
// DEBUG
// ============================================
async function saveDebugInfo(page, prefix, errorMessage = null) {
  try {
    if (!fs.existsSync(CONFIG.DEBUG_DIR)) {
      fs.mkdirSync(CONFIG.DEBUG_DIR, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Screenshot
    const screenshot = path.join(CONFIG.DEBUG_DIR, `${prefix}_${timestamp}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    log(`Screenshot salvo: ${screenshot}`, LOG_LEVELS.DEBUG);
    
    // HTML
    try {
      const html = await page.content();
      const htmlPath = path.join(CONFIG.DEBUG_DIR, `${prefix}_${timestamp}.html`);
      fs.writeFileSync(htmlPath, html.substring(0, 500000)); // Limitar a 500KB
      log(`HTML salvo: ${htmlPath}`, LOG_LEVELS.DEBUG);
    } catch {}
    
    // URL
    const urlPath = path.join(CONFIG.DEBUG_DIR, `url_${prefix}_${timestamp}.txt`);
    const urlInfo = `URL: ${page.url()}\nTimestamp: ${new Date().toISOString()}\nStep: ${currentStep}\nError: ${errorMessage || 'N/A'}`;
    fs.writeFileSync(urlPath, urlInfo);
    
  } catch (e) {
    log(`Erro ao salvar debug info: ${e.message}`, LOG_LEVELS.WARN);
  }
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
    } catch (e) {
      // Ignorar erro
    }
  }
}

// ============================================
// SELEÇÃO DE LAYOUT/SISTEMA (CRÍTICO!)
// ============================================
/**
 * Tenta selecionar o layout/sistema no portal Hinova.
 * O portal exibe um modal de seleção que bloqueia o login se não preenchido.
 */
async function trySelectHinovaLayout(page) {
  const desired = normalizeText(CONFIG.HINOVA_LAYOUT);
  if (!desired) return false;
  
  log(`Tentando selecionar layout: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.DEBUG);

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
        log(`Layout selecionado via <select>: ${optionTexts[idx]}`, LOG_LEVELS.SUCCESS);
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
      log(`Layout preenchido via input: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.SUCCESS);
      return true;
    }
  } catch {}

  // 3) Fallback: se houver 4+ inputs visíveis, preencher o último vazio
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
      log(`Layout preenchido via fallback (último input): ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.SUCCESS);
      return true;
    }
  } catch {}

  return false;
}

// ============================================
// SELEÇÃO DE FORMA DE EXIBIÇÃO EXCEL (RÁDIO)
// ============================================
// Mesma estratégia usada no robô de Cobrança: tenta no frame principal e em iframes,
// e dispara eventos (click/input/change) para o portal reconhecer a alteração.
async function selecionarFormaExibicaoEmExcel(page) {
  log('Selecionando Forma de Exibição: Em Excel', LOG_LEVELS.INFO);

  const tryInFrame = async (frame) => {
    try {
      const result = await frame.evaluate(() => {
        const setRadioChecked = (radio) => {
          try {
            if (!radio || radio.disabled) return false;

            // Desmarcar irmãos do mesmo grupo
            if (radio.name) {
              const siblings = document.querySelectorAll(`input[type="radio"][name="${radio.name}"]`);
              siblings.forEach((r) => {
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
          } catch {
            return false;
          }
        };

        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

        // Estratégia 1: texto próximo (td/tr/label/div/etc)
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

        // Estratégia 2: pelo value/name
        for (const radio of radios) {
          const value = (radio.value || '').toLowerCase();
          const name = (radio.name || '').toLowerCase();
          if (value.includes('excel') || name.includes('excel') || value === 'xls' || value === 'xlsx') {
            if (setRadioChecked(radio)) {
              return { success: true, method: 'value', radioValue: radio.value };
            }
          }
        }

        // Estratégia 3: buscar texto "Em Excel" na página e selecionar o rádio na mesma linha
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

        // Estratégia 4: grupo de forma de exibição (pegar o 2º radio do grupo)
        const formaExibicaoRadios = radios.filter((r) => {
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

      if (result?.success) {
        log(`Excel selecionado: ${result.method}`, LOG_LEVELS.SUCCESS);
        return true;
      }

      log(`Não selecionou Excel neste frame (radios: ${result?.totalRadios ?? 'N/A'})`, LOG_LEVELS.DEBUG);
      return false;
    } catch (e) {
      log(`Erro na seleção JavaScript (frame): ${e.message}`, LOG_LEVELS.DEBUG);
      return false;
    }
  };

  // Frame principal
  if (await tryInFrame(page.mainFrame())) {
    await page.waitForTimeout(500);
    return true;
  }

  // Iframes
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await tryInFrame(frame)) {
      await page.waitForTimeout(500);
      return true;
    }
  }

  log('Não foi possível selecionar a opção Excel', LOG_LEVELS.WARN);
  return false;
}

// ============================================
// DISPENSAR CÓDIGO DE AUTENTICAÇÃO
// ============================================
async function dispensarCodigoAutenticacao(page) {
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
}

// ============================================
// MAIN
// ============================================
async function main() {
  log('='.repeat(60), LOG_LEVELS.INFO);
  log('INICIANDO ROBÔ SGA HINOVA - EVENTOS', LOG_LEVELS.INFO);
  log('='.repeat(60), LOG_LEVELS.INFO);

  if (!CONFIG.HINOVA_USER || !CONFIG.HINOVA_PASS) {
    throw new Error('HINOVA_USER e HINOVA_PASS são obrigatórios');
  }

  // Notificar início
  await updateProgress('executando', 'login');

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptDownloads: true,
  });

  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(TIMEOUTS.PAGE_LOAD);

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(TIMEOUTS.PAGE_LOAD);

  try {
    // ============================================
    // ETAPA: LOGIN
    // ============================================
    setStep('LOGIN');
    
    let navegacaoOk = false;
    for (let tentativa = 1; tentativa <= 3 && !navegacaoOk; tentativa++) {
      try {
        log(`Tentativa ${tentativa} de acessar portal: ${CONFIG.HINOVA_URL}`);
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
    
    await saveDebugInfo(page, 'debug_sga_antes_login');
    
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
    
    // Preencher código cliente (se houver)
    if (CONFIG.HINOVA_CODIGO_CLIENTE) {
      try {
        await page.fill('input[placeholder=""]', CONFIG.HINOVA_CODIGO_CLIENTE, { timeout: 5000 });
        log('Código cliente preenchido', LOG_LEVELS.DEBUG);
      } catch (e) {
        log('Campo código cliente não encontrado (pode ser opcional)', LOG_LEVELS.DEBUG);
      }
    }
    
    // Preencher usuário
    try {
      await page.fill('input[placeholder="Usuário"]', CONFIG.HINOVA_USER, { timeout: 5000 });
      log('Usuário preenchido', LOG_LEVELS.DEBUG);
    } catch (e) {
      log(`Erro ao preencher usuário: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    // Preencher senha
    try {
      await page.fill('input[placeholder="Senha"]', CONFIG.HINOVA_PASS, { timeout: 5000 });
      log('Senha preenchida', LOG_LEVELS.DEBUG);
    } catch (e) {
      log(`Erro ao preencher senha: ${e.message}`, LOG_LEVELS.WARN);
    }
    
    // Aguardar um pouco
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

    // ========= CRÍTICO: Selecionar Layout/Sistema =========
    const layoutOk = await trySelectHinovaLayout(page);
    if (!layoutOk) {
      log('Campo de layout/perfil não identificado no login (seguindo assim mesmo)', LOG_LEVELS.WARN);
    }
    
    // Clicar no botão Entrar com múltiplas tentativas
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
        
        await dispensarCodigoAutenticacao(page);
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
      await saveDebugInfo(page, 'debug_sga_login_falhou');
      throw new Error(`Login falhou após ${LIMITS.MAX_LOGIN_RETRIES} tentativas`);
    }
    
    await saveDebugInfo(page, 'debug_sga_apos_login');
    await fecharPopups(page);
    log('Login realizado com sucesso!', LOG_LEVELS.SUCCESS);

    // ============================================
    // ETAPA: NAVEGAR DIRETAMENTE PARA PÁGINA DO RELATÓRIO
    // ============================================
    setStep('NAVEGACAO');
    await updateProgress('executando', 'filtros');
    
    const relatorioUrl = deriveRelatorioUrl(CONFIG.HINOVA_URL);
    log(`Navegando diretamente para: ${relatorioUrl}`, LOG_LEVELS.INFO);

    try {
      await page.goto(relatorioUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.PAGE_LOAD 
      });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      log('Página do relatório carregada', LOG_LEVELS.SUCCESS);
    } catch (e) {
      log(`Erro ao navegar para relatório: ${e.message}`, LOG_LEVELS.WARN);
      await saveDebugInfo(page, 'debug_sga_navegacao_erro');
    }

    await fecharPopups(page);
    await saveDebugInfo(page, 'debug_sga_relatorio_eventos');

    // ============================================
    // PASSO 1: PREENCHER DATA CADASTRO ITEM
    // ============================================
    setStep('FILTROS');
    log(`PASSO 1: Preenchendo Data Cadastro Item: ${CONFIG.DATA_INICIO} até ${CONFIG.DATA_FIM}`, LOG_LEVELS.INFO);

    const preencheuDatas = await page.evaluate(({ inicio, fim }) => {
      const resultado = { sucesso: false, detalhes: [] };
      
      // Estratégia 1: Procurar por labels "Data Cadastro Item" e inputs próximos
      const todosElementos = document.querySelectorAll('td, th, label, span, div, b, strong');
      
      for (const elemento of todosElementos) {
        const texto = elemento.textContent?.trim() || '';
        
        if (texto.includes('Data Cadastro Item') || texto === 'Data Cadastro Item') {
          resultado.detalhes.push(`Label encontrado: "${texto}"`);
          
          // Procurar inputs na mesma linha/tabela
          const linha = elemento.closest('tr') || elemento.closest('div') || elemento.parentElement;
          if (linha) {
            const inputs = linha.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])');
            resultado.detalhes.push(`Inputs encontrados: ${inputs.length}`);
            
            if (inputs.length >= 2) {
              // Primeiro input = data início, segundo = data fim
              inputs[0].value = inicio;
              inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
              inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
              
              inputs[1].value = fim;
              inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
              inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
              
              resultado.sucesso = true;
              resultado.detalhes.push(`Datas preenchidas: ${inicio} a ${fim}`);
              return resultado;
            }
          }
        }
      }
      
      // Estratégia 2: Procurar inputs de data pelo placeholder ou name
      const inputsData = document.querySelectorAll('input[name*="data" i], input[placeholder*="data" i], input[id*="data" i]');
      resultado.detalhes.push(`Inputs de data encontrados (fallback): ${inputsData.length}`);
      
      if (inputsData.length >= 2) {
        inputsData[0].value = inicio;
        inputsData[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputsData[0].dispatchEvent(new Event('change', { bubbles: true }));
        
        inputsData[1].value = fim;
        inputsData[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputsData[1].dispatchEvent(new Event('change', { bubbles: true }));
        
        resultado.sucesso = true;
        resultado.detalhes.push(`Datas preenchidas via fallback: ${inicio} a ${fim}`);
      }
      
      return resultado;
    }, { inicio: CONFIG.DATA_INICIO, fim: CONFIG.DATA_FIM });

    for (const detalhe of preencheuDatas.detalhes) {
      log(detalhe, LOG_LEVELS.DEBUG);
    }
    
    if (preencheuDatas.sucesso) {
      log(`✅ PASSO 1 OK: Data Cadastro Item preenchida: ${CONFIG.DATA_INICIO} até ${CONFIG.DATA_FIM}`, LOG_LEVELS.SUCCESS);
    } else {
      log('⚠️ PASSO 1: Não foi possível preencher Data Cadastro Item automaticamente', LOG_LEVELS.WARN);
    }

    await saveDebugInfo(page, 'debug_sga_datas');

    // ============================================
    // PASSO 2: SELECIONAR LAYOUT "BI - VANGARD" EM DADOS VISUALIZADOS
    // ============================================
    // Mesma técnica robusta usada no robô de Cobrança
    await updateProgress('executando', 'campos');
    log(`PASSO 2: Verificando/Selecionando Layout "${CONFIG.HINOVA_LAYOUT}" em Dados Visualizados...`, LOG_LEVELS.INFO);

    const layoutSelecionado = await page.evaluate(({ layoutDesejado }) => {
      const resultado = {
        sucesso: false,
        jaEstavaSelecionado: false,
        metodo: null,
        valorSelecionado: null,
        opcoesDisponiveis: [],
        diagnostico: {
          labelsLayout: [],
          secaoDadosVisualizados: null,
          selectsEncontrados: [],
          totalSelects: 0,
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
      
      const matchVangard = (texto) => {
        const norm = normalizar(texto);
        return norm.includes('VANGARD') || 
               (norm.includes('BI') && norm.includes('VANGARD')) ||
               norm.includes('BI - VANGARD');
      };
      
      const todosSelects = document.querySelectorAll('select');
      resultado.diagnostico.totalSelects = todosSelects.length;
      
      // ========================================
      // VERIFICAR SE JÁ ESTÁ SELECIONADO (QUALQUER SELECT)
      // ========================================
      for (const select of todosSelects) {
        const selectedOption = select.options[select.selectedIndex];
        if (selectedOption && matchVangard(selectedOption.text || selectedOption.value)) {
          resultado.sucesso = true;
          resultado.jaEstavaSelecionado = true;
          resultado.metodo = 'JA_SELECIONADO';
          resultado.valorSelecionado = selectedOption.text?.trim() || selectedOption.value;
          return resultado;
        }
      }
      
      // ========================================
      // ESTRATÉGIA 1: Buscar label "Layout" e select na mesma linha/célula
      // ========================================
      const tds = document.querySelectorAll('td, th, div, label, span');
      for (const td of tds) {
        const texto = normalizar(td.textContent || '');
        
        if (texto.includes('LAYOUT') || texto === 'LAYOUT:' || texto === 'LAYOUT') {
          resultado.diagnostico.labelsLayout.push({
            tag: td.tagName,
            texto: (td.textContent || '').substring(0, 80)
          });
          
          const row = td.closest('tr') || td.closest('div') || td.parentElement;
          const selectInRow = row?.querySelector('select');
          
          if (selectInRow) {
            const opcoes = Array.from(selectInRow.options).map(o => o.text?.trim() || '');
            resultado.opcoesDisponiveis = opcoes;
            
            for (let i = 0; i < selectInRow.options.length; i++) {
              if (matchVangard(selectInRow.options[i].text || '')) {
                selectInRow.selectedIndex = i;
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
      const secoes = document.querySelectorAll('td, th, div, fieldset, legend, a');
      for (const secao of secoes) {
        const texto = normalizar(secao.textContent || '');
        
        if (texto.includes('DADOS VISUALIZADOS')) {
          resultado.diagnostico.secaoDadosVisualizados = {
            tag: secao.tagName,
            texto: (secao.textContent || '').substring(0, 100)
          };
          
          const container = secao.closest('table, div, fieldset, tr') || secao.parentElement;
          const selects = container?.querySelectorAll('select') || [];
          
          for (const select of selects) {
            const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
            
            for (let i = 0; i < select.options.length; i++) {
              if (matchVangard(select.options[i].text || '')) {
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
      for (const select of todosSelects) {
        const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
        
        for (let i = 0; i < select.options.length; i++) {
          if (matchVangard(select.options[i].text || '')) {
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
        
        // Guardar para diagnóstico
        const temLayoutOuVisualizacao = opcoes.some(o => {
          const norm = normalizar(o);
          return norm.includes('SELECIONE') || norm.includes('BI') || norm.includes('EVENTOS');
        });
        if (temLayoutOuVisualizacao && opcoes.length > 1) {
          resultado.diagnostico.selectsEncontrados.push({
            name: select.name || select.id || 'sem_nome',
            opcoes: opcoes.slice(0, 8)
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
          
          for (let i = 0; i < select.options.length; i++) {
            if (matchVangard(select.options[i].text || '')) {
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
    }, { layoutDesejado: CONFIG.HINOVA_LAYOUT });
    
    // Validação do resultado
    if (layoutSelecionado.sucesso) {
      if (layoutSelecionado.jaEstavaSelecionado) {
        log(`✅ PASSO 2 OK: Layout já estava selecionado: "${layoutSelecionado.valorSelecionado}"`, LOG_LEVELS.SUCCESS);
      } else {
        log(`✅ PASSO 2 OK: Layout selecionado!`, LOG_LEVELS.SUCCESS);
        log(`   Método: ${layoutSelecionado.metodo}`, LOG_LEVELS.DEBUG);
        log(`   Valor: "${layoutSelecionado.valorSelecionado}"`, LOG_LEVELS.SUCCESS);
      }
    } else {
      // NÃO FALHAR - apenas avisar, o layout pode estar pré-configurado de outra forma
      log(`⚠️ PASSO 2: Layout "${CONFIG.HINOVA_LAYOUT}" não encontrado nas opções`, LOG_LEVELS.WARN);
      log(`   Isso pode ser normal se o layout já estiver pré-configurado no portal`, LOG_LEVELS.WARN);
      
      if (layoutSelecionado.opcoesDisponiveis.length > 0) {
        log(`   Opções disponíveis: ${layoutSelecionado.opcoesDisponiveis.slice(0, 5).join(', ')}...`, LOG_LEVELS.DEBUG);
      }
      if (layoutSelecionado.diagnostico.selectsEncontrados.length > 0) {
        log(`   Selects relevantes encontrados:`, LOG_LEVELS.DEBUG);
        layoutSelecionado.diagnostico.selectsEncontrados.forEach(s => {
          log(`      ${s.name}: [${s.opcoes.join(', ')}]`, LOG_LEVELS.DEBUG);
        });
      }
      log(`   Total de selects na página: ${layoutSelecionado.diagnostico.totalSelects}`, LOG_LEVELS.DEBUG);
      
      await saveDebugInfo(page, 'debug_sga_layout');
      // Continuar mesmo assim - não lançar erro
    }

    await page.waitForTimeout(2000);
    await saveDebugInfo(page, 'debug_sga_layout');

    // ============================================
    // PASSO 3: SELECIONAR "EM EXCEL" NA FORMA DE EXIBIÇÃO
    // ============================================
    // Usar o mesmo padrão do robô de Cobrança (texto próximo + value + varredura + iframes)
    log('PASSO 3: Selecionando Forma de Exibição "Em Excel" (padrão Cobrança)...', LOG_LEVELS.INFO);

    const excelOk = await selecionarFormaExibicaoEmExcel(page);
    if (excelOk) {
      log('✅ PASSO 3 OK: Forma de Exibição "Em Excel" selecionada', LOG_LEVELS.SUCCESS);
    } else {
      log('⚠️ PASSO 3: Não foi possível selecionar Excel automaticamente', LOG_LEVELS.WARN);
      await saveDebugInfo(page, 'debug_sga_excel');
      // Continuar mesmo assim (sem hard error) para manter o comportamento atual
    }

    await page.waitForTimeout(1000);
    await saveDebugInfo(page, 'debug_sga_excel');


    // ============================================
    // ETAPA: GERAR RELATÓRIO E DOWNLOAD
    // ============================================
    setStep('DOWNLOAD');
    await updateProgress('executando', 'download');
    log('Gerando relatório...', LOG_LEVELS.INFO);

    // Configurar listener de download
    const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUTS.DOWNLOAD_WAIT });

    // Clicar no botão gerar
    const btnGerar = page.locator('input[type="submit"]:has-text("Gerar"), button:has-text("Gerar"), input[value*="Gerar" i], button:has-text("Exportar")').first();
    if (await btnGerar.isVisible().catch(() => false)) {
      await btnGerar.click();
      log('Botão Gerar clicado', LOG_LEVELS.DEBUG);
    }

    log('Aguardando download...', LOG_LEVELS.INFO);

    // Aguardar download
    let download;
    try {
      download = await downloadPromise;
      log(`Download iniciado: ${download.suggestedFilename()}`, LOG_LEVELS.SUCCESS);
    } catch (e) {
      await saveDebugInfo(page, 'debug_sga_timeout_download');
      throw new Error(`Timeout aguardando download: ${e.message}`);
    }

    // Salvar arquivo
    if (!fs.existsSync(CONFIG.DOWNLOAD_DIR)) {
      fs.mkdirSync(CONFIG.DOWNLOAD_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `SGA_Eventos_${timestamp}.xlsx`;
    const filepath = path.join(CONFIG.DOWNLOAD_DIR, filename);

    await download.saveAs(filepath);
    log(`Arquivo salvo: ${filepath}`, LOG_LEVELS.SUCCESS);

    const stats = fs.statSync(filepath);
    await updateProgress('executando', 'processamento', {
      nome_arquivo: filename,
      bytes_total: stats.size,
    });

    // ============================================
    // ETAPA: PROCESSAR EXCEL
    // ============================================
    setStep('PROCESSAMENTO');
    log('Processando arquivo Excel...', LOG_LEVELS.INFO);

    const workbook = XLSX.readFile(filepath, { type: 'file' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const dados = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    log(`Total de registros: ${dados.length}`, LOG_LEVELS.SUCCESS);

    if (dados.length === 0) {
      log('Nenhum dado encontrado no relatório', LOG_LEVELS.WARN);
      await updateProgress('sucesso', 'concluido', {
        nome_arquivo: filename,
        registros_total: 0,
        registros_processados: 0,
      });
      return;
    }

    // ============================================
    // ETAPA: ENVIAR PARA WEBHOOK
    // ============================================
    setStep('IMPORTACAO');
    await updateProgress('executando', 'importacao', {
      nome_arquivo: filename,
      registros_total: dados.length,
    });

    log('Enviando dados para webhook...', LOG_LEVELS.INFO);

    await sendWebhook({
      corretora_id: CONFIG.CORRETORA_ID,
      execucao_id: CONFIG.EXECUCAO_ID,
      github_run_id: CONFIG.GITHUB_RUN_ID,
      dados: dados,
      nome_arquivo: filename,
      status: 'sucesso',
      etapa: 'concluido',
      registros_total: dados.length,
      registros_processados: dados.length,
    });

    log('='.repeat(60), LOG_LEVELS.SUCCESS);
    log(`ROBÔ FINALIZADO COM SUCESSO - ${dados.length} registros`, LOG_LEVELS.SUCCESS);
    log('='.repeat(60), LOG_LEVELS.SUCCESS);

    // Limpar arquivo após envio
    try {
      fs.unlinkSync(filepath);
      log('Arquivo temporário removido', LOG_LEVELS.DEBUG);
    } catch {}

  } catch (error) {
    log(`ERRO: ${error.message}`, LOG_LEVELS.ERROR);
    await saveDebugInfo(page, 'debug_sga_erro', error.message);

    await updateProgress('erro', 'erro', {
      erro: error.message,
    });

    throw error;
  } finally {
    await browser.close();
  }
}

// ============================================
// EXECUÇÃO
// ============================================
main()
  .then(() => {
    log('Robô SGA finalizado com sucesso', LOG_LEVELS.SUCCESS);
    process.exit(0);
  })
  .catch((error) => {
    log(`Robô SGA falhou: ${error.message}`, LOG_LEVELS.ERROR);
    process.exit(1);
  });
