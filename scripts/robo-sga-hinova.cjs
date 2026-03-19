#!/usr/bin/env node
/**
 * Robô de Automação - SGA Hinova (Eventos)
 * =========================================
 * 
 * FLUXO SIMPLIFICADO:
 * - URL do relatório: relatorioEvento.php
 * - Filtros: Data Cadastro Item + Layout "VANGARD" + Em Excel (sem Centro Custo)
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
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');

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

// URL do relatório: prioridade para env HINOVA_RELATORIO_URL (vinda de hinova_credenciais.url_eventos)
const HINOVA_RELATORIO_URL_ENV = process.env.HINOVA_RELATORIO_URL;

const CONFIG = {
  HINOVA_URL: HINOVA_URL,
  HINOVA_RELATORIO_URL: HINOVA_RELATORIO_URL_ENV || deriveRelatorioUrl(HINOVA_URL),
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
  LOGIN_RETRY_WAIT: 5000,
  DOWNLOAD_EVENT: 45 * 1000,
  DOWNLOAD_TOTAL: 20 * 60000,
  DOWNLOAD_SAVE: 20 * 60000,
  DOWNLOAD_IDLE: 15 * 60000,
  DOWNLOAD_HARD: 20 * 60000,
  DOWNLOAD_REPLAY: 4 * 60000,
  POPUP_CLOSE: 800,
  FILE_PROGRESS_INTERVAL: 10000,
};

const LIMITS = {
  MAX_LOGIN_RETRIES: 5,
  MAX_POPUP_CLOSE_ATTEMPTS: 10,
  MAX_DOWNLOAD_RETRIES: 3,
  INITIAL_WINDOW_DAYS: 31,
  MIN_WINDOW_DAYS: 7,
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

  // 2) Input autocomplete REMOVIDO — preenchia campos de texto errados
  //    (ex: "Usuário Alteração") com VANGARD. Apenas <select> é seguro.

  // 3) Fallback removed — same reason as above.

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
             norm.includes('BI - VANGARD') ||
             norm.includes('RESUMO VANGARD');
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
// DOWNLOAD CONTROLLER - Sistema robusto multi-watcher
// (Portado do robô de cobrança - padrão de referência)
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
  
  addCleanup(fn) { this.cleanupFunctions.push(fn); }
  
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
    if (this.onCompleteCallback) this.onCompleteCallback();
  }
  
  setError(error) {
    this.error = error;
    if (this.onCompleteCallback) this.onCompleteCallback();
  }
  
  setOnComplete(callback) { this.onCompleteCallback = callback; }
  isCaptured() { return this.captured; }
  isComplete() { return this.fileResult !== null || this.error !== null; }
  getResult() { return this.result; }
  getFileResult() { return this.fileResult; }
  getError() { return this.error; }
  
  cleanup() {
    if (this.monitorInterval) { clearInterval(this.monitorInterval); this.monitorInterval = null; }
    for (const fn of this.cleanupFunctions) { try { fn(); } catch {} }
    this.cleanupFunctions = [];
  }
  
  startProgressMonitor() {
    this.monitorInterval = setInterval(() => {
      if (this.captured || this.isComplete()) { clearInterval(this.monitorInterval); return; }
      const elapsed = Date.now() - this.startTime;
      const minutos = Math.floor(elapsed / 60000);
      const segundos = Math.floor((elapsed % 60000) / 1000);
      log(`Aguardando download... ${minutos}m ${segundos}s`, LOG_LEVELS.DEBUG);
    }, 30000);
  }
}

function monitorFileProgress(filePath, expectedSize = 0, intervalMs = TIMEOUTS.FILE_PROGRESS_INTERVAL) {
  const startTime = Date.now();
  let lastLoggedPercent = -1;
  let lastSize = 0;
  
  const interval = setInterval(() => {
    const possiblePaths = [filePath, filePath + '.crdownload', filePath + '.part', filePath + '.download'];
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
              const bar = '█'.repeat(filled) + '░'.repeat(barSize - filled);
              log(`   ⬇️ Download [${bar}] ${pct}% (${formatBytes(size)} / ${formatBytes(expectedSize)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
            }
          } else {
            const minutes = Math.floor(elapsed / 60);
            log(`   ⬇️ Download: ${formatBytes(size)} recebidos • ${formatBytes(speed)}/s (${minutes}m)`, LOG_LEVELS.INFO);
          }
          return;
        }
      } catch {}
    }
  }, intervalMs);
  return () => clearInterval(interval);
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
  const allow = ['user-agent', 'accept', 'accept-language', 'referer', 'origin', 'content-type'];
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (allow.includes(String(k).toLowerCase()) && v) out[String(k).toLowerCase()] = v;
  }
  out['accept-encoding'] = 'identity';
  return out;
}

function parseBrazilianDate(value) {
  const [day, month, year] = String(value || '').split('/').map(Number);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBrazilianDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildDateWindows(start, end, windowDays = 92) {
  const startDate = parseBrazilianDate(start);
  const endDate = parseBrazilianDate(end);

  if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) {
    return [{ inicio: start, fim: end }];
  }

  const windows = [];
  let cursor = new Date(startDate);

  while (cursor.getTime() <= endDate.getTime()) {
    const candidateEnd = addDays(cursor, windowDays - 1);
    const windowEnd = candidateEnd.getTime() < endDate.getTime() ? candidateEnd : new Date(endDate);

    windows.push({
      inicio: formatBrazilianDate(cursor),
      fim: formatBrazilianDate(windowEnd),
    });

    cursor = addDays(windowEnd, 1);
  }

  return windows;
}

function sanitizeFilePart(value) {
  return String(value || '').replace(/\D/g, '') || 'sem_data';
}

function generateWindowFilename(periodo, index, total) {
  const ordem = String(index + 1).padStart(2, '0');
  const totalLabel = String(total).padStart(2, '0');
  return `EVENTOS_${sanitizeFilePart(periodo.inicio)}_${sanitizeFilePart(periodo.fim)}_parte_${ordem}_de_${totalLabel}.xlsx`;
}

function writeBufferToFile(filePath, buffer) {
  fs.writeFileSync(filePath, buffer);
  return { filePath, size: buffer.length };
}

async function downloadViaAxiosStream({ url, method = 'GET', headers = {}, data, filePath, expectedBytes = 0, idleTimeoutMs = TIMEOUTS.DOWNLOAD_IDLE, hardTimeoutMs = TIMEOUTS.DOWNLOAD_HARD }) {
  if (!url) throw new Error('URL de download vazia');
  const startedAt = Date.now();
  const abortController = new AbortController();
  const tempFilePath = filePath + '.tmp';

  let hardTimer = hardTimeoutMs > 0 ? setTimeout(() => abortController.abort(new Error('Timeout rígido de download')), hardTimeoutMs) : null;
  let idleTimer = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeoutMs > 0) idleTimer = setTimeout(() => abortController.abort(new Error('Download travado')), idleTimeoutMs);
  };
  resetIdleTimer();

  let receivedBytes = 0;
  let lastLoggedAt = 0;
  const logProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastLoggedAt < 15000) return;
    lastLoggedAt = now;
    const speed = receivedBytes / Math.max(1, Math.floor((now - startedAt) / 1000));
    if (expectedBytes > 0) {
      const pct = Math.min(100, Math.floor((receivedBytes / expectedBytes) * 100));
      const barSize = 20;
      const filled = Math.round((pct / 100) * barSize);
      log(`   ⬇️ Download [${'█'.repeat(filled)}${'░'.repeat(barSize - filled)}] ${pct}% (${formatBytes(receivedBytes)}) • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
    } else {
      log(`   ⬇️ Download: ${formatBytes(receivedBytes)} • ${formatBytes(speed)}/s`, LOG_LEVELS.INFO);
    }
  };
  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
  };

  try {
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

    const responseLen = parseInt(response.headers?.['content-length'] || '0', 10);
    if (!expectedBytes && responseLen > 0) expectedBytes = responseLen;

    const writeStream = fs.createWriteStream(tempFilePath, { highWaterMark: 8 * 1024 * 1024 });
    const progressTransform = new Transform({
      transform(chunk, encoding, callback) {
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

    if (!fs.existsSync(tempFilePath)) throw new Error('Arquivo temporário não existe');
    const stats = fs.statSync(tempFilePath);
    if (stats.size <= 0) throw new Error('Arquivo temporário vazio');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.renameSync(tempFilePath, filePath);
    return { filePath, size: stats.size };
  } catch (error) {
    clearTimers();
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch {}
    throw error;
  }
}

function isExcelResponse(response) {
  try {
    if (!response) return false;
    const status = response.status();
    if (status < 200 || status >= 400) return false;
    const headers = response.headers() || {};
    const ct = String(headers['content-type'] || '').toLowerCase();
    const cd = String(headers['content-disposition'] || '').toLowerCase();
    const url = String(response.url?.() || '').toLowerCase();
    if (ct.includes('spreadsheet') || ct.includes('excel') || ct.includes('vnd.ms-excel') || ct.includes('vnd.openxmlformats')) return true;
    if (cd.includes('.xlsx') || cd.includes('.xls')) return true;
    if (url.includes('.xlsx') || url.includes('.xls')) return true;
    if ((ct.includes('octet-stream') || ct.includes('download') || ct.includes('force-download')) && (cd.includes('attachment') || cd.includes('xls'))) return true;
    return false;
  } catch {
    return false;
  }
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
        expectedSize = parseInt((response.headers?.() || {})['content-length'] || '0', 10);
      }
    }
  } catch {}

  log(`Download capturado - ${expectedSize > 0 ? formatBytes(expectedSize) : 'tamanho desconhecido'}`, LOG_LEVELS.SUCCESS);
  log(`Salvando: ${suggestedName} -> ${filePath}`, LOG_LEVELS.INFO);

  const stopMonitor = monitorFileProgress(filePath, expectedSize);
  const startTime = Date.now();
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    let fileSize = 0;

    for (const p of [filePath, filePath + '.crdownload', filePath + '.part']) {
      try {
        if (fs.existsSync(p)) {
          fileSize = fs.statSync(p).size;
          break;
        }
      } catch {}
    }

    if (fileSize > 0) {
      const speed = fileSize / Math.max(1, elapsed);
      log(`⏳ Recebendo... ${formatBytes(fileSize)} • ${formatBytes(speed)}/s (${minutes}m)`, LOG_LEVELS.INFO);
    } else {
      log(`⏳ Aguardando servidor Hinova gerar relatório... (${minutes}m)`, LOG_LEVELS.INFO);
    }
  }, 15000);

  let timeoutId = null;
  try {
    timeoutId = setTimeout(() => {
      try {
        stopMonitor();
        clearInterval(heartbeatInterval);
      } catch {}
    }, TIMEOUTS.DOWNLOAD_SAVE);

    await download.saveAs(filePath);

    stopMonitor();
    clearInterval(heartbeatInterval);
    if (timeoutId) clearTimeout(timeoutId);

    if (!fs.existsSync(filePath)) {
      throw new Error('Arquivo não encontrado após saveAs');
    }

    const stats = fs.statSync(filePath);
    if (stats.size <= 0) {
      throw new Error('Arquivo salvo vazio');
    }

    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    log(`Download concluído em ${Math.floor(totalTime / 60)}m ${totalTime % 60}s (${formatBytes(stats.size)})`, LOG_LEVELS.SUCCESS);
    return { filePath, size: stats.size };
  } catch (error) {
    stopMonitor();
    clearInterval(heartbeatInterval);
    if (timeoutId) clearTimeout(timeoutId);
    throw error;
  }
}

function criarWatcherDownloadGlobal(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();

  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    const wasCaptured = controller.setCaptured({ type: 'download', download, source: 'globalDownload' });
    if (!wasCaptured) return;

    try {
      const result = await processarDownloadImediato(download, downloadDir, semanticName);
      controller.setFileResult(result);
    } catch (e) {
      controller.setError(e);
    }
  };

  const attachToPage = (page) => {
    if (!page || pagesAttached.has(page)) return;
    pagesAttached.add(page);
    page.on('download', onDownload);
  };

  for (const p of context.pages()) attachToPage(p);
  context.on('page', (page) => {
    if (!controller.isCaptured()) attachToPage(page);
  });

  controller.addCleanup(() => {
    for (const p of pagesAttached) {
      try {
        p.removeListener('download', onDownload);
      } catch {}
    }
  });
}

function criarWatcherDownloadPaginaPrincipal(context, page, controller, downloadDir, semanticName) {
  const onDownload = async (download) => {
    if (controller.isCaptured()) return;
    const wasCaptured = controller.setCaptured({ type: 'download', download, source: 'mainPage' });
    if (!wasCaptured) return;

    try {
      const result = await processarDownloadImediato(download, downloadDir, semanticName);
      controller.setFileResult(result);
    } catch (e) {
      controller.setError(e);
    }
  };

  page.on('download', onDownload);
  controller.addCleanup(() => {
    try {
      page.removeListener('download', onDownload);
    } catch {}
  });
}

function criarWatcherNovaAba(context, mainPage, controller, downloadDir, semanticName) {
  const processarNovaAba = async (newPage) => {
    if (controller.isCaptured()) {
      try {
        await newPage.close();
      } catch {}
      return;
    }

    try {
      const onNewPageDownload = async (download) => {
        if (controller.isCaptured()) return;
        const wasCaptured = controller.setCaptured({ type: 'download', download, source: 'newTab', newPage });
        if (!wasCaptured) return;

        try {
          const result = await processarDownloadImediato(download, downloadDir, semanticName);
          controller.setFileResult(result);
          newPage.close().catch(() => {});
        } catch (e) {
          controller.setError(e);
        }
      };

      newPage.on('download', onNewPageDownload);
      await Promise.race([
        newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]).catch(() => {});

      if (controller.isCaptured()) {
        try {
          newPage.removeListener('download', onNewPageDownload);
        } catch {}
        return;
      }

      try {
        const content = await newPage.content();
        if (content && content.length > 5000) {
          const hasTable = content.includes('<table') || content.includes('<TABLE');
          if (hasTable && !controller.isCaptured()) {
            log('Nova aba contém tabela HTML grande - capturando como arquivo', LOG_LEVELS.INFO);
            const filePath = path.join(downloadDir, semanticName);
            fs.writeFileSync(filePath, content);
            const wasCaptured = controller.setCaptured({ type: 'htmlCapture', source: 'newTabHtml' });
            if (wasCaptured) {
              controller.setFileResult({ filePath, size: content.length });
              newPage.close().catch(() => {});
            }
          }
        }
      } catch {}

      controller.addCleanup(() => {
        try {
          newPage.removeListener('download', onNewPageDownload);
        } catch {}
      });
    } catch {}
  };

  const onNewPage = (newPage) => {
    if (newPage !== mainPage) processarNovaAba(newPage);
  };

  context.on('page', onNewPage);
  controller.addCleanup(() => {
    try {
      context.removeListener('page', onNewPage);
    } catch {}
  });
}

function criarWatcherRespostaHTTP(context, controller, downloadDir, semanticName) {
  const pagesAttached = new Set();

  const onResponse = async (response) => {
    if (controller.isCaptured()) return;
    if (!isExcelResponse(response)) return;

    const headers = response.headers() || {};
    const contentLength = parseInt(headers['content-length'] || '0', 10);
    const wasCaptured = controller.setCaptured({ type: 'httpResponse', response, source: 'httpStream' });
    if (!wasCaptured) return;

    log('Download capturado via HTTP stream (fallback)', LOG_LEVELS.SUCCESS);

    try {
      const filePath = path.join(downloadDir, semanticName);
      const request = response.request?.();
      const url = response.url?.();
      const method = request?.method?.() || 'GET';
      const requestHeaders = pickHeadersForHttpReplay(request?.headers?.() || {});
      const cookieHeader = await buildCookieHeader(context, url);
      if (cookieHeader) requestHeaders.cookie = cookieHeader;
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
      controller.setFileResult({ filePath, size: result.size });
    } catch (e) {
      controller.setError(e);
    }
  };

  const attachToPage = (page) => {
    if (!page || pagesAttached.has(page)) return;
    pagesAttached.add(page);
    page.on('response', onResponse);
  };

  for (const p of context.pages()) attachToPage(p);
  context.on('page', (page) => {
    if (!controller.isCaptured()) attachToPage(page);
  });

  controller.addCleanup(() => {
    for (const p of pagesAttached) {
      try {
        p.removeListener('response', onResponse);
      } catch {}
    }
  });
}

async function aguardarDownloadHibrido(context, page, downloadDir, semanticName, timeoutMs) {
  log('Iniciando captura de download (multi-watcher)...', LOG_LEVELS.INFO);
  log('PRIORIDADE: Download Playwright (saveAs) > Nova Aba (HTML) > HTTP Stream (fallback)', LOG_LEVELS.DEBUG);

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
        const fr = controller.getFileResult();
        doResolve({ success: true, filePath: fr.filePath, size: fr.size, source: controller.getResult()?.source });
      }
    });

    const timeoutId = setTimeout(() => {
      if (!resolved) doResolve({ success: false, error: new Error('Timeout - nenhum download capturado') });
    }, timeoutMs);

    controller.addCleanup(() => clearTimeout(timeoutId));
  });
}

async function capturarHtmlRelatorioRenderizado(page, downloadDir, semanticName) {
  const targets = [
    { target: page, source: 'mainPageHtml' },
    ...page.frames().filter((frame) => frame !== page.mainFrame()).map((frame) => ({ target: frame, source: 'frameHtml' })),
  ];

  for (const { target, source } of targets) {
    try {
      const content = await target.content();
      if (!content || content.length < 1500) continue;

      const normalized = normalizeText(content);
      const hasTable = /<table/i.test(content);
      const looksLikeReport = hasTable && (
        normalized.includes('protocolo') ||
        normalized.includes('evento') ||
        normalized.includes('situacao') ||
        normalized.includes('situacao evento') ||
        normalized.includes('data cadastro') ||
        normalized.includes('nenhum registro')
      );

      if (!looksLikeReport) continue;

      const filePath = path.join(downloadDir, semanticName);
      fs.writeFileSync(filePath, content);
      log(`HTML do relatório capturado diretamente da interface (${source})`, LOG_LEVELS.SUCCESS);
      return { filePath, size: Buffer.byteLength(content), source };
    } catch {}
  }

  return null;
}

async function extrairFormularioRelatorio(page) {
  return page.evaluate(() => {
    const submitters = Array.from(document.querySelectorAll('input[type="submit"], button'));
    const submitter = submitters.find((el) => {
      const text = String(el.value || el.textContent || '').toLowerCase();
      return text.includes('gerar') || text.includes('exportar');
    });

    const form = submitter?.form || submitter?.closest('form') || document.querySelector('form');
    if (!form) return null;

    const formData = new FormData(form);
    const entries = [];
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        entries.push([key, value]);
      }
    }

    if (submitter?.name) {
      entries.push([submitter.name, submitter.value || submitter.textContent || 'Gerar']);
    }

    return {
      action: form.action || window.location.href,
      method: String(form.method || 'POST').toUpperCase(),
      entries,
      submitterText: submitter?.value || submitter?.textContent || 'Gerar',
    };
  });
}

async function baixarRelatorioViaFormReplay({ context, page, downloadDir, semanticName }) {
  const formulario = await extrairFormularioRelatorio(page);
  if (!formulario) {
    throw new Error('Formulário do relatório não encontrado para replay HTTP');
  }

  const resolvedUrl = new URL(formulario.action || page.url(), page.url()).toString();
  const requestHeaders = pickHeadersForHttpReplay({
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    accept: 'text/html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
    referer: page.url(),
    origin: new URL(resolvedUrl).origin,
    'content-type': 'application/x-www-form-urlencoded',
  });

  const cookieHeader = await buildCookieHeader(context, resolvedUrl);
  if (cookieHeader) requestHeaders.cookie = cookieHeader;

  const encodedBody = new URLSearchParams(formulario.entries).toString();
  const requestUrl = formulario.method === 'GET' && encodedBody
    ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}${encodedBody}`
    : resolvedUrl;

  log(`Fallback HTTP: reenviando formulário do relatório (${formulario.method} ${requestUrl})`, LOG_LEVELS.INFO);

  const response = await axios({
    url: requestUrl,
    method: formulario.method,
    headers: requestHeaders,
    data: formulario.method === 'GET' ? undefined : encodedBody,
    responseType: 'arraybuffer',
    maxRedirects: 10,
    timeout: TIMEOUTS.DOWNLOAD_HARD,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const buffer = Buffer.from(response.data || []);
  if (!buffer.length) {
    throw new Error('Replay HTTP retornou resposta vazia');
  }

  const filePath = path.join(downloadDir, semanticName);
  const saved = writeBufferToFile(filePath, buffer);
  log(`Fallback HTTP salvou ${formatBytes(saved.size)} em ${filePath}`, LOG_LEVELS.SUCCESS);
  return { ...saved, source: 'formReplay', contentType: response.headers?.['content-type'] || '' };
}

async function executarDownloadDoPeriodo({ context, page, downloadDir, semanticName }) {
  const directCaptureTimeoutMs = Math.min(TIMEOUTS.DOWNLOAD_EVENT, 60000);

  log('Aguardando download direto (janela curta) antes dos fallbacks...', LOG_LEVELS.INFO);
  const directResult = await aguardarDownloadHibrido(context, page, downloadDir, semanticName, directCaptureTimeoutMs);
  if (directResult.success) {
    return directResult;
  }

  log(`Download direto não foi capturado: ${directResult.error?.message || 'sem detalhes'}`, LOG_LEVELS.WARN);

  const htmlCapture = await capturarHtmlRelatorioRenderizado(page, downloadDir, semanticName);
  if (htmlCapture) {
    return { success: true, ...htmlCapture };
  }

  try {
    const replayResult = await baixarRelatorioViaFormReplay({ context, page, downloadDir, semanticName });
    return { success: true, ...replayResult };
  } catch (error) {
    log(`Replay HTTP falhou: ${error.message}`, LOG_LEVELS.WARN);
  }

  return directResult;
}

async function abrirPaginaRelatorio(page) {
  log(`Navegando para Relatório de Eventos: ${CONFIG.HINOVA_RELATORIO_URL}`);

  await page.goto(CONFIG.HINOVA_RELATORIO_URL, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.PAGE_LOAD,
  });

  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {
    log('DOMContentLoaded timeout - continuando...', LOG_LEVELS.WARN);
  });
  await fecharPopups(page);

  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    log('NetworkIdle timeout - continuando...', LOG_LEVELS.WARN);
  });

  await fecharPopups(page);
  log('Página de relatório aberta', LOG_LEVELS.SUCCESS);
}

async function configurarFiltrosRelatorio(page, inicio, fim) {
  setStep('FILTROS');

  log('=== CONFIGURAÇÃO DE FILTROS ===', LOG_LEVELS.INFO);
  log(`Data Início: ${inicio}`, LOG_LEVELS.INFO);
  log(`Data Fim: ${fim}`, LOG_LEVELS.INFO);
  log(`Layout desejado: ${CONFIG.HINOVA_LAYOUT}`, LOG_LEVELS.INFO);

  await page.evaluate(() => {
    const labels = document.querySelectorAll('td, th, label, span, div');
    for (const label of labels) {
      const texto = (label.textContent || '').trim().toLowerCase();
      if (texto.includes('usuário alteração') || texto.includes('usuario alteracao') || texto.includes('usuário alteraçao')) {
        const row = label.closest('tr') || label.closest('div') || label.parentElement;
        if (row) {
          const inputs = row.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="password"])');
          for (const input of inputs) {
            if (input.value) {
              input.value = '';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      }
    }
  }).catch(() => {});
  log('Campo "Usuário Alteração" limpo (se existia)', LOG_LEVELS.DEBUG);

  const dadosVizJaAberto = await page.evaluate(() => {
    const secoes = document.querySelectorAll('a, td, th, div, fieldset, legend, span, button');
    for (const secao of secoes) {
      const textoRaw = (secao.textContent || '').trim();
      const texto = textoRaw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (texto.includes('DADOS VISUALIZADOS') && textoRaw.length < 40) {
        const container = secao.closest('table') || secao.closest('div') || secao.parentElement;
        if (container) {
          const selects = container.querySelectorAll('select');
          for (const s of selects) {
            if (s.offsetParent !== null) return true;
          }
        }
        return false;
      }
    }
    return false;
  }).catch(() => false);

  if (!dadosVizJaAberto) {
    log('Seção Dados Visualizados parece colapsada - expandindo...', LOG_LEVELS.DEBUG);
    await page.evaluate(() => {
      const secoes = document.querySelectorAll('a, td, th, div, fieldset, legend, span, button');
      let melhorMatch = null;
      let menorLength = Infinity;
      for (const secao of secoes) {
        const textoRaw = (secao.textContent || '').trim();
        const texto = textoRaw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (texto.includes('DADOS VISUALIZADOS') && textoRaw.length < menorLength && textoRaw.length < 40) {
          melhorMatch = secao;
          menorLength = textoRaw.length;
        }
      }
      if (melhorMatch) melhorMatch.click();
    }).catch(() => {});
    await page.waitForTimeout(1500);
  } else {
    log('Seção Dados Visualizados já está aberta', LOG_LEVELS.DEBUG);
  }

  const datasOk = await preencherDataCadastroItem(page, inicio, fim);
  if (!datasOk) {
    log('⚠️ ALERTA: Datas podem não ter sido preenchidas corretamente!', LOG_LEVELS.WARN);
  }

  await updateProgress('executando', 'FILTROS');
  const layoutOk = await selecionarLayoutRelatorio(page);
  if (!layoutOk) {
    log('⚠️ ALERTA: Layout pode não ter sido selecionado - verificar opções disponíveis no portal!', LOG_LEVELS.WARN);
  }
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const labels = document.querySelectorAll('td, th, label, span, div');
    for (const label of labels) {
      const texto = (label.textContent || '').trim().toLowerCase();
      if (texto.includes('usuário alteração') || texto.includes('usuario alteracao') || texto.includes('usuário alteraçao')) {
        const row = label.closest('tr') || label.closest('div') || label.parentElement;
        if (row) {
          const inputs = row.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="password"])');
          for (const input of inputs) {
            if (input.value) {
              input.value = '';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      }
    }
  }).catch(() => {});

  const excelOk = await selecionarFormaExibicaoEmExcel(page);
  if (!excelOk) {
    log('⚠️ ALERTA: Forma de exibição Excel pode não ter sido selecionada!', LOG_LEVELS.WARN);
  }
  await page.waitForTimeout(1000);

  log('=== RESUMO FILTROS ===', LOG_LEVELS.INFO);
  log(`Datas: ${datasOk ? '✅' : '⚠️'}`, LOG_LEVELS.INFO);
  log(`Layout: ${layoutOk ? '✅' : '⚠️'}`, LOG_LEVELS.INFO);
  log(`Excel: ${excelOk ? '✅' : '⚠️'}`, LOG_LEVELS.INFO);
}

async function dispararGeracaoRelatorio(page) {
  log('Clicando em Gerar Relatório...');

  const btnGerar = page.locator('input[type="submit"]:has-text("Gerar"), button:has-text("Gerar"), input[value*="Gerar" i], button:has-text("Exportar")').first();
  if (await btnGerar.isVisible().catch(() => false)) {
    await btnGerar.click();
    log('Botão Gerar clicado', LOG_LEVELS.SUCCESS);
    return;
  }

  await page.evaluate(() => {
    const btns = document.querySelectorAll('input[type="submit"], button');
    for (const btn of btns) {
      const text = (btn.value || btn.textContent || '').toLowerCase();
      if (text.includes('gerar') || text.includes('exportar')) {
        btn.click();
        return;
      }
    }
  });
  log('Botão Gerar clicado via fallback', LOG_LEVELS.DEBUG);
}

async function coletarDadosDoPeriodo(context, page, periodo, index, total) {
  const downloadDir = getDownloadDirectory();
  const semanticName = generateWindowFilename(periodo, index, total);

  setStep('NAVEGACAO');
  await updateProgress('executando', 'FILTROS');
  log(`=== COLETA ${index + 1}/${total} • ${periodo.inicio} até ${periodo.fim} ===`, LOG_LEVELS.INFO);

  await abrirPaginaRelatorio(page);
  await configurarFiltrosRelatorio(page, periodo.inicio, periodo.fim);

  setStep('DOWNLOAD');
  await updateProgress('executando', 'DOWNLOAD');
  log(`Diretório de download: ${downloadDir}`);

  await dispararGeracaoRelatorio(page);

  const downloadResult = await executarDownloadDoPeriodo({
    context,
    page,
    downloadDir,
    semanticName,
  });

  if (!downloadResult.success) {
    throw downloadResult.error || new Error('Falha no download');
  }

  const filePath = downloadResult.filePath;
  log(`Download concluído via ${downloadResult.source} (${formatBytes(downloadResult.size)})`, LOG_LEVELS.SUCCESS);

  const validation = validateDownloadedFile(filePath, downloadResult.contentType || '');
  if (!validation.valid) {
    throw new Error(`Arquivo inválido: ${validation.error}`);
  }

  log(`Validação OK: ${validation.fileType.toUpperCase()} (${formatBytes(validation.size)})`, LOG_LEVELS.SUCCESS);

  if (validation.isHtml || validation.fileType === 'html') {
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    const normalizedHtml = normalizeText(htmlContent);
    if (
      normalizedHtml.includes('nenhum registro') ||
      normalizedHtml.includes('nao foram encontrados') ||
      normalizedHtml.includes('sem registros')
    ) {
      log(`Período ${periodo.inicio} até ${periodo.fim} retornou 0 registros`, LOG_LEVELS.WARN);
      return [];
    }
  }

  const dados = await processarArquivo(filePath);
  if (dados.length === 0) {
    log(`Período ${periodo.inicio} até ${periodo.fim} sem registros após processamento`, LOG_LEVELS.WARN);
    return [];
  }

  return dados;
}

async function coletarDadosDoPeriodoComRetry(context, page, periodo, index, total) {
  let lastError = null;

  for (let tentativa = 1; tentativa <= LIMITS.MAX_DOWNLOAD_RETRIES; tentativa++) {
    try {
      if (tentativa > 1) {
        log(`Reprocessando janela ${periodo.inicio} até ${periodo.fim} (tentativa ${tentativa}/${LIMITS.MAX_DOWNLOAD_RETRIES})`, LOG_LEVELS.WARN);
      }
      return await coletarDadosDoPeriodo(context, page, periodo, index, total);
    } catch (error) {
      lastError = error;
      log(`Falha na janela ${periodo.inicio} até ${periodo.fim}: ${error.message}`, LOG_LEVELS.WARN);
      if (tentativa < LIMITS.MAX_DOWNLOAD_RETRIES) {
        await page.waitForTimeout(1500);
      }
    }
  }

  throw lastError || new Error('Falha ao coletar janela do relatório');
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

  await updateProgress('executando', 'LOGIN');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    acceptDownloads: true,
  });

  const page = await context.newPage();

  try {
    setStep('LOGIN');
    log(`Acessando portal: ${CONFIG.HINOVA_URL}`);

    await page.goto(CONFIG.HINOVA_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    log('Aguardando formulário de login...');
    await page.waitForSelector('input[type="password"], input[name*="senha" i], input[id*="senha" i]', {
      timeout: 30000,
    });
    log('Formulário de login carregado', LOG_LEVELS.SUCCESS);

    await fecharPopups(page);

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

    await trySelectHinovaLayout(page);

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

    const janelas = buildDateWindows(inicio, fim, 92);
    log(`Coleta segmentada em ${janelas.length} janelas de até 92 dias para evitar travas no portal`, LOG_LEVELS.INFO);

    const dadosAcumulados = [];

    for (let index = 0; index < janelas.length; index++) {
      const periodo = janelas[index];
      const dadosPeriodo = await coletarDadosDoPeriodoComRetry(context, page, periodo, index, janelas.length);
      if (dadosPeriodo.length === 0) continue;

      dadosAcumulados.push(...dadosPeriodo);
      log(`Janela ${index + 1}/${janelas.length} concluída com ${dadosPeriodo.length} registros (acumulado: ${dadosAcumulados.length})`, LOG_LEVELS.SUCCESS);
    }

    if (dadosAcumulados.length === 0) {
      throw new Error('Nenhum registro encontrado em nenhuma janela do período solicitado.');
    }

    setStep('ENVIO');
    await updateProgress('executando', 'ENVIANDO');

    const semanticName = generateSemanticFilename();
    log(`Enviando ${dadosAcumulados.length} registros via webhook em chunks...`, LOG_LEVELS.INFO);

    const CHUNK_SIZE = 2000;
    const totalChunks = Math.ceil(dadosAcumulados.length / CHUNK_SIZE);

    for (let i = 0; i < dadosAcumulados.length; i += CHUNK_SIZE) {
      const chunk = dadosAcumulados.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      log(`Enviando chunk ${chunkNum}/${totalChunks} (${chunk.length} registros)...`, LOG_LEVELS.INFO);

      await sendWebhook({
        action: 'import',
        corretora_id: CONFIG.CORRETORA_ID,
        execucao_id: CONFIG.EXECUCAO_ID,
        github_run_id: CONFIG.GITHUB_RUN_ID,
        github_run_url: CONFIG.GITHUB_RUN_URL,
        nome_arquivo: semanticName,
        total_registros: dadosAcumulados.length,
        dados: chunk,
        chunk_atual: chunkNum,
        total_chunks: totalChunks,
      });

      log(`Chunk ${chunkNum}/${totalChunks} enviado com sucesso`, LOG_LEVELS.SUCCESS);
    }

    setStep('FINALIZACAO');

    await updateProgress('sucesso', 'CONCLUIDO', {
      registros_total: dadosAcumulados.length,
      nome_arquivo: semanticName,
    });

    log('='.repeat(60), LOG_LEVELS.SUCCESS);
    log('ROBÔ SGA HINOVA - CONCLUÍDO COM SUCESSO', LOG_LEVELS.SUCCESS);
    log(`Total de registros: ${dadosAcumulados.length}`, LOG_LEVELS.SUCCESS);
    log('='.repeat(60), LOG_LEVELS.SUCCESS);

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
