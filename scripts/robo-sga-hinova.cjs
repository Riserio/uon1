#!/usr/bin/env node
/**
 * Robô de Automação - SGA Hinova (Eventos)
 * =========================================
 * 
 * FLUXO IDÊNTICO AO ROBÔ DE COBRANÇA, apenas com:
 * - URL do relatório: relatorioEvento.php (ao invés de relatorioBoleto.php)
 * - Filtros: Data Cadastro Item + Layout "BI - VANGARD" + Em Excel
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

// Função para obter primeiro e último dia do mês atual
function getCurrentMonthDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // Primeiro dia do mês
  const firstDay = new Date(year, month, 1);
  const firstDayStr = `${String(firstDay.getDate()).padStart(2, '0')}/${String(firstDay.getMonth() + 1).padStart(2, '0')}/${firstDay.getFullYear()}`;
  
  // Último dia do mês
  const lastDay = new Date(year, month + 1, 0);
  const lastDayStr = `${String(lastDay.getDate()).padStart(2, '0')}/${String(lastDay.getMonth() + 1).padStart(2, '0')}/${lastDay.getFullYear()}`;
  
  return { firstDayStr, lastDayStr };
}

const { firstDayStr, lastDayStr } = getCurrentMonthDates();

function deriveRelatorioUrl(loginUrl) {
  try {
    const url = new URL(loginUrl);
    const pathParts = url.pathname.split('/');
    const basePathParts = pathParts.filter(p => 
      p && !p.includes('login') && !p.includes('Principal') && p !== 'v5'
    );
    const basePath = '/' + basePathParts.join('/');
    return `${url.origin}${basePath}/relatorio/relatorioEvento.php`;
  } catch (e) {
    return 'https://eris.hinova.com.br/sga/sgav4_valecar/relatorio/relatorioEvento.php';
  }
}

const HINOVA_URL = process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php';

const CONFIG = {
  HINOVA_URL: HINOVA_URL,
  HINOVA_RELATORIO_URL: process.env.HINOVA_RELATORIO_URL || deriveRelatorioUrl(HINOVA_URL),
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  HINOVA_CODIGO_CLIENTE: process.env.HINOVA_CODIGO_CLIENTE || '',
  HINOVA_LAYOUT: process.env.HINOVA_LAYOUT || 'BI - VANGARD',
  
  // Datas - sempre o mês atual
  DATA_INICIO: process.env.DATA_INICIO || firstDayStr,
  DATA_FIM: process.env.DATA_FIM || lastDayStr,
  
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
  return `EVENTOS_${day}${month}${year}.xlsx`;
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
    status,
    etapa,
    ...extras,
  });
}

// ============================================
// DEBUG
// ============================================
async function saveDebugInfo(page, context, errorMessage = null) {
  try {
    if (!fs.existsSync(CONFIG.DEBUG_DIR)) {
      fs.mkdirSync(CONFIG.DEBUG_DIR, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = `debug_sga_${currentStep.toLowerCase()}`;
    
    const screenshot = path.join(CONFIG.DEBUG_DIR, `${prefix}_${timestamp}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    log(`Screenshot salvo: ${screenshot}`, LOG_LEVELS.DEBUG);
    
    try {
      const html = await page.content();
      const htmlPath = path.join(CONFIG.DEBUG_DIR, `${prefix}_${timestamp}.html`);
      fs.writeFileSync(htmlPath, html.substring(0, 500000));
      log(`HTML salvo: ${htmlPath}`, LOG_LEVELS.DEBUG);
    } catch {}
    
  } catch (e) {
    log(`Erro ao salvar debug info: ${e.message}`, LOG_LEVELS.WARN);
  }
}

// ============================================
// FECHAR POPUPS
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
        '.modal.show button.close',
        '.modal.show .btn-close',
        '.modal.show [data-dismiss="modal"]',
        'button.close',
        '.close',
        '[data-dismiss="modal"]',
        '[data-bs-dismiss="modal"]',
        '[aria-label="Close"]',
        '.swal2-confirm',
        '.swal2-close',
        '.bootbox .btn-primary',
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
        } catch {}
      }
    } catch {}
  }
}

// ============================================
// SELEÇÃO DE LAYOUT/SISTEMA NO LOGIN
// ============================================
async function trySelectHinovaLayout(page) {
  const desired = normalizeText(CONFIG.HINOVA_LAYOUT);
  if (!desired) return false;

  log(`Tentando selecionar layout: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.DEBUG);

  // 1) Select tradicional
  try {
    const select = page.locator(
      'select[name*="layout" i], select[id*="layout" i], select[name*="sistema" i], select[id*="sistema" i], select[name*="perfil" i], select[id*="perfil" i]'
    ).first();

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

  // 2) Input autocomplete
  try {
    const input = page.locator(
      'input[placeholder*="Sistema" i], input[placeholder*="Layout" i], input[placeholder*="Perfil" i], input[placeholder*="Relat" i], input[placeholder*="Empresa" i]'
    ).first();
    if (await input.isVisible().catch(() => false)) {
      await input.click({ force: true }).catch(() => null);
      await input.fill(CONFIG.HINOVA_LAYOUT).catch(() => null);
      await input.press('Enter').catch(() => null);
      log(`Layout preenchido via input: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.SUCCESS);
      return true;
    }
  } catch {}

  // 3) Fallback: último input vazio
  try {
    const ok = await page.evaluate(({ layout }) => {
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
    }, { layout: CONFIG.HINOVA_LAYOUT }).catch(() => false);

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
async function selecionarFormaExibicaoEmExcel(page) {
  log('Selecionando Forma de Exibição: Em Excel', LOG_LEVELS.INFO);

  const tryInFrame = async (frame) => {
    try {
      const result = await frame.evaluate(() => {
        const setRadioChecked = (radio) => {
          try {
            if (!radio || radio.disabled) return false;

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

        // Estratégia 1: texto próximo
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

        // Estratégia 2: value/name
        for (const radio of radios) {
          const value = (radio.value || '').toLowerCase();
          const name = (radio.name || '').toLowerCase();
          if (value.includes('excel') || name.includes('excel') || value === 'xls' || value === 'xlsx') {
            if (setRadioChecked(radio)) {
              return { success: true, method: 'value', radioValue: radio.value };
            }
          }
        }

        // Estratégia 3: texto "Em Excel" na página
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

        // Estratégia 4: grupo de forma de exibição
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

      return false;
    } catch (e) {
      log(`Erro na seleção JavaScript (frame): ${e.message}`, LOG_LEVELS.DEBUG);
      return false;
    }
  };

  if (await tryInFrame(page.mainFrame())) {
    await page.waitForTimeout(500);
    return true;
  }

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
// SELEÇÃO DE LAYOUT NO RELATÓRIO
// ============================================
async function selecionarLayoutRelatorio(page) {
  log(`Selecionando Layout "${CONFIG.HINOVA_LAYOUT}" em Dados Visualizados...`, LOG_LEVELS.INFO);

  const resultado = await page.evaluate(({ layoutDesejado }) => {
    const res = {
      sucesso: false,
      metodo: null,
      valorSelecionado: null,
      opcoesDisponiveis: [],
      diagnostico: { labelsLayout: [], selectsEncontrados: [], totalSelects: 0 }
    };

    const normalizar = (texto) => {
      return (texto || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const matchLayout = (texto) => {
      const norm = normalizar(texto);
      return norm.includes('VANGARD') || 
             (norm.includes('BI') && norm.includes('VANGARD')) ||
             norm.includes('BI - VANGARD');
    };

    const todosSelects = document.querySelectorAll('select');
    res.diagnostico.totalSelects = todosSelects.length;

    // Estratégia 1: label "Layout:" adjacente
    const labels = document.querySelectorAll('td, th, label, span');
    for (const label of labels) {
      const texto = (label.textContent || '').trim();
      const textoNorm = normalizar(texto);

      if (textoNorm === 'LAYOUT:' || textoNorm === 'LAYOUT') {
        res.diagnostico.labelsLayout.push({ texto, tag: label.tagName });

        const row = label.closest('tr');
        const selectInRow = row?.querySelector('select');

        if (selectInRow) {
          const opcoes = Array.from(selectInRow.options).map(o => o.text?.trim() || '');
          res.opcoesDisponiveis = opcoes;

          for (let i = 0; i < selectInRow.options.length; i++) {
            if (matchLayout(selectInRow.options[i].text || '')) {
              selectInRow.selectedIndex = i;
              selectInRow.dispatchEvent(new Event('input', { bubbles: true }));
              selectInRow.dispatchEvent(new Event('change', { bubbles: true }));
              res.sucesso = true;
              res.metodo = 'LABEL_LAYOUT';
              res.valorSelecionado = selectInRow.options[i].text?.trim();
              return res;
            }
          }
        }
      }
    }

    // Estratégia 2: seção "Dados Visualizados"
    const secoes = document.querySelectorAll('td, th, div, fieldset, legend, a');
    for (const secao of secoes) {
      const texto = normalizar(secao.textContent || '');

      if (texto.includes('DADOS VISUALIZADOS')) {
        const container = secao.closest('table, div, fieldset') || secao.parentElement;
        const selects = container?.querySelectorAll('select') || [];

        for (const select of selects) {
          const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');

          for (let i = 0; i < select.options.length; i++) {
            if (matchLayout(select.options[i].text || '')) {
              if (res.opcoesDisponiveis.length === 0) res.opcoesDisponiveis = opcoes;
              select.selectedIndex = i;
              select.dispatchEvent(new Event('input', { bubbles: true }));
              select.dispatchEvent(new Event('change', { bubbles: true }));
              res.sucesso = true;
              res.metodo = 'SECAO_DADOS_VISUALIZADOS';
              res.valorSelecionado = select.options[i].text?.trim();
              return res;
            }
          }
        }
      }
    }

    // Estratégia 3: varrer todos os selects
    for (const select of todosSelects) {
      const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');

      for (let i = 0; i < select.options.length; i++) {
        if (matchLayout(select.options[i].text || '')) {
          if (res.opcoesDisponiveis.length === 0) res.opcoesDisponiveis = opcoes;
          select.selectedIndex = i;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          res.sucesso = true;
          res.metodo = 'VARREDURA_OPCOES';
          res.valorSelecionado = select.options[i].text?.trim();
          return res;
        }
      }

      // Diagnóstico
      const temRelevante = opcoes.some(o => normalizar(o).includes('SELECIONE') || normalizar(o).includes('BI'));
      if (temRelevante && opcoes.length > 1) {
        res.diagnostico.selectsEncontrados.push({
          name: select.name || select.id || 'sem_nome',
          opcoes: opcoes.slice(0, 5)
        });
      }
    }

    // Estratégia 4: fallback por name/id
    for (const select of todosSelects) {
      const name = (select.name || select.id || '').toLowerCase();

      if (name.includes('layout') || name.includes('visualiza') || name.includes('dados')) {
        const opcoes = Array.from(select.options).map(o => o.text?.trim() || '');
        if (res.opcoesDisponiveis.length === 0) res.opcoesDisponiveis = opcoes;

        for (let i = 0; i < select.options.length; i++) {
          if (matchLayout(select.options[i].text || '')) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            res.sucesso = true;
            res.metodo = 'FALLBACK_NAME_ID';
            res.valorSelecionado = select.options[i].text?.trim();
            return res;
          }
        }
      }
    }

    return res;
  }, { layoutDesejado: CONFIG.HINOVA_LAYOUT });

  if (resultado.sucesso) {
    log(`✅ Layout selecionado: "${resultado.valorSelecionado}" (método: ${resultado.metodo})`, LOG_LEVELS.SUCCESS);
    return true;
  } else {
    log(`⚠️ Layout "${CONFIG.HINOVA_LAYOUT}" não encontrado nas opções`, LOG_LEVELS.WARN);
    log(`   Opções disponíveis: ${resultado.opcoesDisponiveis.slice(0, 5).join(', ') || 'NENHUMA'}`, LOG_LEVELS.DEBUG);
    log(`   Total de selects: ${resultado.diagnostico.totalSelects}`, LOG_LEVELS.DEBUG);
    return false;
  }
}

// ============================================
// PREENCHER DATAS (Data Cadastro Item)
// ============================================
async function preencherDataCadastroItem(page, inicio, fim) {
  log(`Preenchendo Data Cadastro Item: ${inicio} até ${fim}`, LOG_LEVELS.INFO);

  const resultado = await page.evaluate(({ inicio, fim }) => {
    const res = { sucesso: false, detalhes: [] };

    const normalizar = (texto) => {
      return (texto || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Estratégia 1: label "Data Cadastro Item"
    const todosElementos = document.querySelectorAll('td, th, label, span, div, b, strong');

    for (const elemento of todosElementos) {
      const texto = normalizar(elemento.textContent || '');

      if (texto.includes('DATA CADASTRO ITEM') || texto === 'DATA CADASTRO ITEM:') {
        const linha = elemento.closest('tr') || elemento.closest('div') || elemento.parentElement;
        if (linha) {
          const inputs = linha.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])');

          if (inputs.length >= 2) {
            inputs[0].value = inicio;
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

            inputs[1].value = fim;
            inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

            res.sucesso = true;
            res.detalhes.push(`Datas preenchidas: ${inicio} a ${fim}`);
            return res;
          }
        }
      }
    }

    // Estratégia 2: fallback por name de input
    const inputsData = document.querySelectorAll('input[name*="data" i], input[placeholder*="data" i], input[id*="data" i]');

    if (inputsData.length >= 2) {
      inputsData[0].value = inicio;
      inputsData[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputsData[0].dispatchEvent(new Event('change', { bubbles: true }));

      inputsData[1].value = fim;
      inputsData[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputsData[1].dispatchEvent(new Event('change', { bubbles: true }));

      res.sucesso = true;
      res.detalhes.push(`Datas preenchidas via fallback: ${inicio} a ${fim}`);
    }

    return res;
  }, { inicio, fim });

  // Logar apenas detalhes relevantes (sem textos gigantes)
  for (const detalhe of resultado.detalhes) {
    if (detalhe.length < 100) {
      log(detalhe, LOG_LEVELS.DEBUG);
    }
  }

  if (resultado.sucesso) {
    log(`✅ Data Cadastro Item preenchida: ${inicio} até ${fim}`, LOG_LEVELS.SUCCESS);
  } else {
    log('⚠️ Não foi possível preencher Data Cadastro Item automaticamente', LOG_LEVELS.WARN);
  }

  return resultado.sucesso;
}

// ============================================
// VALIDAR ARQUIVO
// ============================================
function validateDownloadedFile(filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Arquivo não existe' };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, error: 'Arquivo vazio' };
  }

  // Ler primeiros bytes para detectar tipo
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);

  // Magic bytes
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B; // XLSX é ZIP
  const isXls = buffer[0] === 0xD0 && buffer[1] === 0xCF; // XLS antigo
  const isHtml = buffer.toString('utf8', 0, 5).toLowerCase().includes('<html') ||
                 buffer.toString('utf8', 0, 5).toLowerCase().includes('<!doc');

  if (isZip) {
    return { valid: true, fileType: 'xlsx', size: stats.size };
  } else if (isXls) {
    return { valid: true, fileType: 'xls', size: stats.size };
  } else if (isHtml) {
    return { valid: true, fileType: 'html', isHtml: true, size: stats.size };
  }

  return { valid: true, fileType: 'unknown', size: stats.size };
}

// ============================================
// PROCESSAR ARQUIVO (EXCEL OU HTML)
// ============================================

// Função para extrair texto de célula HTML removendo tags
function extrairTexto(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '') // Remove tags HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Função para processar tabela HTML do Hinova
function processarTabelaHtml(htmlContent) {
  log('Processando arquivo HTML do Hinova...', LOG_LEVELS.INFO);
  
  const registros = [];
  
  // Extrair headers da tabela
  const theadMatch = htmlContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  if (!theadMatch) {
    log('Não encontrou <thead> no HTML', LOG_LEVELS.WARN);
    return [];
  }
  
  const headerMatch = theadMatch[1].match(/<th[^>]*>(.*?)<\/th>/gi);
  if (!headerMatch) {
    log('Não encontrou <th> no HTML', LOG_LEVELS.WARN);
    return [];
  }
  
  const headers = headerMatch.map(th => {
    const texto = th.replace(/<\/?th[^>]*>/gi, '').trim();
    return extrairTexto(texto);
  }).filter(h => h && h !== 'AÇÕES'); // Remove coluna de ações
  
  log(`Headers encontrados (${headers.length}): ${headers.slice(0, 10).join(', ')}...`, LOG_LEVELS.DEBUG);
  
  // Extrair tbody
  const tbodyMatch = htmlContent.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) {
    log('Não encontrou <tbody> no HTML', LOG_LEVELS.WARN);
    return [];
  }
  
  const tbodyContent = tbodyMatch[1];
  
  // Extrair todas as linhas <tr>
  // O HTML do Hinova pode ter <tr><tr> consecutivos ou <tr> com </tr>
  const trMatches = tbodyContent.match(/<tr[^>]*>[\s\S]*?(?=<tr|$)/gi);
  
  if (!trMatches) {
    log('Não encontrou linhas <tr> no tbody', LOG_LEVELS.WARN);
    return [];
  }
  
  log(`Linhas TR encontradas: ${trMatches.length}`, LOG_LEVELS.DEBUG);
  
  for (const trContent of trMatches) {
    // Extrair células <td>
    const tdMatches = trContent.match(/<td[^>]*>([\s\S]*?)(?:<\/td>|(?=<td))/gi);
    
    if (!tdMatches || tdMatches.length === 0) continue;
    
    const valores = tdMatches.map(td => {
      const conteudo = td.replace(/<\/?td[^>]*>/gi, '');
      return extrairTexto(conteudo);
    });
    
    // Verificar se tem dados suficientes (mínimo 10 colunas preenchidas)
    const valoresNaoVazios = valores.filter(v => v && v.length > 0);
    if (valoresNaoVazios.length < 5) continue;
    
    // Criar objeto com headers
    const registro = {};
    for (let i = 0; i < headers.length && i < valores.length; i++) {
      const header = headers[i];
      if (header && header !== 'AÇÕES') {
        registro[header] = valores[i] || '';
      }
    }
    
    // Só adicionar se tiver dados relevantes
    if (Object.keys(registro).length > 5) {
      registros.push(registro);
    }
  }
  
  log(`Registros extraídos do HTML: ${registros.length}`, LOG_LEVELS.SUCCESS);
  
  if (registros.length > 0) {
    log(`Primeiro registro: ${JSON.stringify(registros[0]).substring(0, 300)}`, LOG_LEVELS.DEBUG);
  }
  
  return registros;
}

async function processarArquivo(filePath) {
  log(`Processando arquivo: ${filePath}`, LOG_LEVELS.INFO);

  try {
    const buffer = fs.readFileSync(filePath);
    const fileSize = buffer.length;
    log(`Tamanho do arquivo: ${formatBytes(fileSize)}`, LOG_LEVELS.DEBUG);
    
    // Converter para string para análise
    const conteudo = buffer.toString('utf8');
    const primeirosBytes = conteudo.substring(0, 1000);
    
    // Verificar se é HTML (Hinova exporta como HTML disfarçado de .xls)
    const isHtml = primeirosBytes.toLowerCase().includes('<html') || 
                   primeirosBytes.toLowerCase().includes('<!doctype') ||
                   primeirosBytes.toLowerCase().includes('<table');
    
    if (isHtml) {
      log('Arquivo detectado como HTML - usando parser específico do Hinova', LOG_LEVELS.INFO);
      
      // Verificar se é página de erro
      if (conteudo.includes('Nenhum registro encontrado') || 
          conteudo.includes('nenhum registro') ||
          conteudo.includes('Erro') && conteudo.includes('sistema')) {
        log('⚠️ Arquivo contém mensagem de erro ou sem registros', LOG_LEVELS.WARN);
        log(`Conteúdo: ${primeirosBytes}`, LOG_LEVELS.DEBUG);
        return [];
      }
      
      // Usar parser HTML específico
      const dados = processarTabelaHtml(conteudo);
      
      if (dados.length > 0) {
        log(`HTML processado com sucesso: ${dados.length} registros`, LOG_LEVELS.SUCCESS);
        return dados;
      }
      
      // Fallback: tentar XLSX mesmo assim
      log('Parser HTML não encontrou dados, tentando XLSX...', LOG_LEVELS.WARN);
    }
    
    // Processar como Excel (XLSX ou XLS binário)
    log('Processando como Excel...', LOG_LEVELS.DEBUG);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    
    log(`Sheets encontradas: ${workbook.SheetNames.join(', ')}`, LOG_LEVELS.DEBUG);
    
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      log('Nenhuma sheet encontrada no arquivo', LOG_LEVELS.WARN);
      return [];
    }
    
    const sheet = workbook.Sheets[sheetName];
    
    // Tentar diferentes estratégias de leitura
    let dados = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    
    // Se não encontrou dados, tentar com header na primeira linha
    if (dados.length === 0) {
      log('Tentando leitura alternativa (range A1)...', LOG_LEVELS.DEBUG);
      dados = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1, raw: false });
      
      // Se tem dados no formato array, converter para objetos
      if (dados.length > 1) {
        const headers = dados[0];
        log(`Headers encontrados: ${JSON.stringify(headers).substring(0, 200)}`, LOG_LEVELS.DEBUG);
        dados = dados.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h || `col_${i}`] = row[i] || '';
          });
          return obj;
        });
      } else {
        dados = [];
      }
    }
    
    // Log das primeiras linhas para debug
    if (dados.length > 0) {
      log(`Primeira linha: ${JSON.stringify(dados[0]).substring(0, 300)}`, LOG_LEVELS.DEBUG);
    }

    log(`Arquivo processado: ${dados.length} registros`, LOG_LEVELS.SUCCESS);
    return dados;
  } catch (e) {
    log(`Erro ao processar arquivo: ${e.message}`, LOG_LEVELS.ERROR);
    log(`Stack: ${e.stack}`, LOG_LEVELS.DEBUG);
    throw e;
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

  const inicio = CONFIG.DATA_INICIO;
  const fim = CONFIG.DATA_FIM;

  log(`Período: ${inicio} até ${fim}`, LOG_LEVELS.INFO);
  log(`URL Relatório: ${CONFIG.HINOVA_RELATORIO_URL}`, LOG_LEVELS.INFO);

  // Notificar início
  await updateProgress('executando', 'login');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    acceptDownloads: true,
  });

  const page = await context.newPage();

  try {
    // ============================================
    // ETAPA: LOGIN
    // ============================================
    setStep('LOGIN');
    log(`Acessando portal: ${CONFIG.HINOVA_URL}`);

    await page.goto(CONFIG.HINOVA_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_LOAD
    });

    await page.waitForTimeout(3000);
    await saveDebugInfo(page, context, 'Antes do login');

    log('Aguardando formulário de login...');
    await page.waitForSelector('input[type="password"], input[name*="senha" i], input[id*="senha" i]', {
      timeout: 30000
    });
    log('Formulário de login carregado', LOG_LEVELS.SUCCESS);

    await fecharPopups(page);

    // Preencher credenciais
    log('Preenchendo credenciais...');

    const campoCodigoCliente = await page.$('input[placeholder*="Código" i], input[name*="codigo" i], input[id*="codigo" i]');
    if (campoCodigoCliente && CONFIG.HINOVA_CODIGO_CLIENTE) {
      await campoCodigoCliente.fill(CONFIG.HINOVA_CODIGO_CLIENTE).catch(() => {});
      log('Código cliente preenchido', LOG_LEVELS.DEBUG);
    }

    const campoUsuario = await page.$('input[placeholder*="Usuário" i], input[name*="usuario" i], input[id*="usuario" i], input[name*="login" i]');
    if (campoUsuario) {
      await campoUsuario.fill(CONFIG.HINOVA_USER);
      log('Usuário preenchido', LOG_LEVELS.DEBUG);
    }

    const campoSenha = await page.$('input[type="password"]');
    if (campoSenha) {
      await campoSenha.fill(CONFIG.HINOVA_PASS);
      log('Senha preenchida', LOG_LEVELS.DEBUG);
    }

    log('Credenciais preenchidas com sucesso', LOG_LEVELS.SUCCESS);

    // Selecionar layout no login
    await trySelectHinovaLayout(page);

    // Dispensar código de autenticação
    const dispensarAuth = async () => {
      try {
        const campoAuth = await page.$('input[placeholder*="Autenticação" i]');
        if (!campoAuth) return;
        await campoAuth.evaluate((el) => {
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.keyboard.press('Escape').catch(() => {});
        log('Código de autenticação dispensado', LOG_LEVELS.DEBUG);
      } catch {}
    };

    // Clicar Entrar
    let loginSucesso = false;

    const isAindaNaLogin = async () => {
      const relatorioVisible = await page.locator('text=Relatório').first().isVisible().catch(() => false);
      if (relatorioVisible) return false;

      const pwdVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
      const url = page.url?.() || '';
      return pwdVisible || /login/i.test(url);
    };

    for (let tentativa = 1; tentativa <= LIMITS.MAX_LOGIN_RETRIES; tentativa++) {
      log(`Tentativa ${tentativa}/${LIMITS.MAX_LOGIN_RETRIES} - Clicando em Entrar...`);

      try {
        const btnEntrar = await page.$('button:has-text("Entrar"), input[value="Entrar"], .btn-primary');
        if (btnEntrar) {
          await btnEntrar.click({ force: true }).catch(() => {});
        }

        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null),
          page.waitForTimeout(1500),
        ]);

        await dispensarAuth();

        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.LOGIN_RETRY_WAIT }).catch(() => null),
          page.waitForTimeout(TIMEOUTS.LOGIN_RETRY_WAIT),
        ]);

        const aindaNaLogin = await isAindaNaLogin();
        if (!aindaNaLogin) {
          loginSucesso = true;
          log(`Login bem sucedido na tentativa ${tentativa}!`, LOG_LEVELS.SUCCESS);
          break;
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
    setStep('NAVEGACAO');
    await updateProgress('executando', 'filtros');

    log(`Navegando para Relatório de Eventos: ${CONFIG.HINOVA_RELATORIO_URL}`);

    await page.goto(CONFIG.HINOVA_RELATORIO_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_LOAD
    });

    await page.waitForTimeout(5000);
    await fecharPopups(page);

    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {
      log('NetworkIdle timeout - continuando...', LOG_LEVELS.WARN);
    });

    await fecharPopups(page);
    log('Página de relatório aberta', LOG_LEVELS.SUCCESS);

    // ============================================
    // ETAPA: FILTROS
    // ============================================
    setStep('FILTROS');

    log(`=== CONFIGURAÇÃO DE FILTROS ===`, LOG_LEVELS.INFO);
    log(`Data Início: ${inicio}`, LOG_LEVELS.INFO);
    log(`Data Fim: ${fim}`, LOG_LEVELS.INFO);
    log(`Layout desejado: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.INFO);

    // PASSO 1: Data Cadastro Item
    const datasOk = await preencherDataCadastroItem(page, inicio, fim);
    if (!datasOk) {
      log('⚠️ ALERTA: Datas podem não ter sido preenchidas corretamente!', LOG_LEVELS.WARN);
    }
    await saveDebugInfo(page, context, 'Após datas');

    // PASSO 2: Layout
    await updateProgress('executando', 'campos');
    const layoutOk = await selecionarLayoutRelatorio(page);
    if (!layoutOk) {
      log('⚠️ ALERTA: Layout pode não ter sido selecionado - verificar opções disponíveis no portal!', LOG_LEVELS.WARN);
    }
    await page.waitForTimeout(2000);
    await saveDebugInfo(page, context, 'Após layout');

    // PASSO 3: Em Excel
    const excelOk = await selecionarFormaExibicaoEmExcel(page);
    if (!excelOk) {
      log('⚠️ ALERTA: Forma de exibição Excel pode não ter sido selecionada!', LOG_LEVELS.WARN);
    }
    await page.waitForTimeout(1000);
    await saveDebugInfo(page, context, 'Após excel');
    
    // Log final dos filtros
    log(`=== RESUMO FILTROS ===`, LOG_LEVELS.INFO);
    log(`Datas: ${datasOk ? '✅' : '⚠️'}`, LOG_LEVELS.INFO);
    log(`Layout: ${layoutOk ? '✅' : '⚠️'}`, LOG_LEVELS.INFO);
    log(`Excel: ${excelOk ? '✅' : '⚠️'}`, LOG_LEVELS.INFO);

    // ============================================
    // ETAPA: DOWNLOAD
    // ============================================
    setStep('DOWNLOAD');
    await updateProgress('executando', 'download');

    const downloadDir = getDownloadDirectory();
    log(`Diretório de download: ${downloadDir}`);

    // Configurar listener de download ANTES do clique
    const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUTS.DOWNLOAD_TOTAL });

    // Clicar Gerar
    log('Clicando em Gerar Relatório...');

    const btnGerar = page.locator('input[type="submit"]:has-text("Gerar"), button:has-text("Gerar"), input[value*="Gerar" i], button:has-text("Exportar")').first();
    if (await btnGerar.isVisible().catch(() => false)) {
      await btnGerar.click();
      log('Botão Gerar clicado', LOG_LEVELS.SUCCESS);
    } else {
      // Fallback: procurar em qualquer frame
      await page.evaluate(() => {
        const btns = document.querySelectorAll('input[type="submit"], button');
        for (const btn of btns) {
          const text = (btn.value || btn.textContent || '').toLowerCase();
          if (text.includes('gerar')) {
            btn.click();
            return;
          }
        }
      });
      log('Botão Gerar clicado via fallback', LOG_LEVELS.DEBUG);
    }

    log('Aguardando download...', LOG_LEVELS.INFO);

    // Aguardar download
    let download;
    try {
      download = await downloadPromise;
      log(`Download iniciado: ${download.suggestedFilename()}`, LOG_LEVELS.SUCCESS);
    } catch (e) {
      await saveDebugInfo(page, context, 'Timeout download');
      throw new Error(`Timeout aguardando download: ${e.message}`);
    }

    // Salvar arquivo
    const semanticName = generateSemanticFilename();
    const filePath = path.join(downloadDir, semanticName);

    log(`Salvando arquivo: ${filePath}`, LOG_LEVELS.INFO);
    await download.saveAs(filePath);
    log(`Arquivo salvo: ${filePath}`, LOG_LEVELS.SUCCESS);

    // Validar arquivo
    const validation = validateDownloadedFile(filePath, '');
    if (!validation.valid) {
      throw new Error(`Arquivo inválido: ${validation.error}`);
    }

    log(`Validação OK: ${validation.fileType.toUpperCase()} (${formatBytes(validation.size)})`, LOG_LEVELS.SUCCESS);

    // Se arquivo for HTML, verificar se é erro do portal
    if (validation.isHtml || validation.fileType === 'html') {
      const htmlContent = fs.readFileSync(filePath, 'utf8');
      if (htmlContent.includes('Nenhum registro') || htmlContent.includes('nenhum registro') || 
          htmlContent.includes('Não foram encontrados') || htmlContent.includes('não encontrado') ||
          htmlContent.includes('Erro') || htmlContent.includes('erro')) {
        log('⚠️ Portal retornou mensagem de erro ou nenhum registro', LOG_LEVELS.WARN);
        log(`Conteúdo: ${htmlContent.substring(0, 500)}`, LOG_LEVELS.DEBUG);
      }
    }

    // Processar arquivo
    const dados = await processarArquivo(filePath);

    if (dados.length === 0) {
      log('⚠️ Arquivo processado, mas sem registros', LOG_LEVELS.WARN);
    }

    // ============================================
    // ETAPA: ENVIAR DADOS
    // ============================================
    setStep('ENVIO');
    await updateProgress('executando', 'envio');

    log(`Enviando ${dados.length} registros via webhook...`, LOG_LEVELS.INFO);

    await sendWebhook({
      action: 'import',
      corretora_id: CONFIG.CORRETORA_ID,
      execucao_id: CONFIG.EXECUCAO_ID,
      github_run_id: CONFIG.GITHUB_RUN_ID,
      github_run_url: CONFIG.GITHUB_RUN_URL,
      nome_arquivo: semanticName,
      total_registros: dados.length,
      dados: dados,
    });

    // ============================================
    // FINALIZAÇÃO
    // ============================================
    setStep('FINALIZACAO');

    await updateProgress('sucesso', 'concluido', {
      registros_total: dados.length,
      nome_arquivo: semanticName,
    });

    log('='.repeat(60), LOG_LEVELS.SUCCESS);
    log('ROBÔ SGA HINOVA - CONCLUÍDO COM SUCESSO', LOG_LEVELS.SUCCESS);
    log(`Total de registros: ${dados.length}`, LOG_LEVELS.SUCCESS);
    log('='.repeat(60), LOG_LEVELS.SUCCESS);

    // Limpar debug em caso de sucesso
    try {
      if (fs.existsSync(CONFIG.DEBUG_DIR)) {
        const files = fs.readdirSync(CONFIG.DEBUG_DIR);
        for (const file of files) {
          fs.unlinkSync(path.join(CONFIG.DEBUG_DIR, file));
        }
        log('Debug files removidos (sucesso)', LOG_LEVELS.DEBUG);
      }
    } catch {}

  } catch (error) {
    log(`ERRO: ${error.message}`, LOG_LEVELS.ERROR);
    log(error.stack || '', LOG_LEVELS.DEBUG);

    await saveDebugInfo(page, context, error.message);

    await updateProgress('erro', currentStep, {
      erro: error.message,
    });

    throw error;
  } finally {
    await browser.close();
  }
}

// Executar
main().catch((err) => {
  log(`Erro fatal: ${err.message}`, LOG_LEVELS.ERROR);
  process.exit(1);
});
