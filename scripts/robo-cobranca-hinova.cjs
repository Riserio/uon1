#!/usr/bin/env node
/**
 * Robô de Automação - Cobrança Hinova (Node.js)
 * ==============================================
 * 
 * ESTRATÉGIA: Download de Excel + Processamento Local
 * 
 * REQUISITOS:
 * -----------
 * npm install playwright axios xlsx
 * npx playwright install chromium
 * 
 * EXECUÇÃO:
 * ---------
 * node robo-cobranca-hinova.cjs
 */

const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const crypto = require('crypto');

// ============================================
// CONFIGURAÇÃO
// ============================================

const CONFIG = {
  HINOVA_URL: process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php',
  HINOVA_RELATORIO_URL: 'https://eris.hinova.com.br/sga/sgav4_valecar/relatorio/relatorioBoleto.php',
  HINOVA_CLIENT_CODE: process.env.HINOVA_CLIENT_CODE || '2363',
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',

  // Se o portal exigir MFA/2FA, configure um destes:
  // - HINOVA_MFA_CODE: código já pronto (6 dígitos)
  // - HINOVA_TOTP_SECRET: segredo base32 para gerar TOTP automaticamente
  HINOVA_MFA_CODE: process.env.HINOVA_MFA_CODE || '',
  HINOVA_TOTP_SECRET: process.env.HINOVA_TOTP_SECRET || '',

  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  CORRETORA_ID: process.env.CORRETORA_ID || 'a4931643-8bf1-4153-97b1-c64925f536eb',

  // Configurações de download
  DOWNLOAD_TIMEOUT_MS: 600000, // 10 minutos para arquivos grandes
  DOWNLOAD_POLL_INTERVAL_MS: 2000, // Verificar a cada 2 segundos
};

// Diretório de downloads (absoluto)
const DOWNLOADS_DIR = path.resolve(__dirname, 'downloads');

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function log(msg) {
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  console.log(`[${timestamp}] ${msg}`);
}

/**
 * Garante que o diretório de downloads existe e está limpo
 */
function prepararDiretorioDownloads() {
  if (fs.existsSync(DOWNLOADS_DIR)) {
    // Limpar arquivos antigos
    const arquivos = fs.readdirSync(DOWNLOADS_DIR);
    for (const arquivo of arquivos) {
      fs.unlinkSync(path.join(DOWNLOADS_DIR, arquivo));
    }
    log(`Diretório de downloads limpo: ${DOWNLOADS_DIR}`);
  } else {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    log(`Diretório de downloads criado: ${DOWNLOADS_DIR}`);
  }
}

/**
 * Aguarda um arquivo Excel aparecer no diretório de downloads
 * Retorna o caminho do arquivo ou null se timeout
 */
async function aguardarDownloadExcel(timeoutMs = CONFIG.DOWNLOAD_TIMEOUT_MS) {
  const inicio = Date.now();
  
  while (Date.now() - inicio < timeoutMs) {
    const arquivos = fs.readdirSync(DOWNLOADS_DIR);
    
    // Procurar arquivo Excel (não temporário)
    const excelFiles = arquivos.filter(f => 
      (f.endsWith('.xlsx') || f.endsWith('.xls')) && 
      !f.endsWith('.crdownload') && 
      !f.endsWith('.tmp') &&
      !f.startsWith('~')
    );
    
    if (excelFiles.length > 0) {
      const arquivoPath = path.join(DOWNLOADS_DIR, excelFiles[0]);
      const stats = fs.statSync(arquivoPath);
      
      // Verificar se o arquivo parou de crescer (download completo)
      await new Promise(r => setTimeout(r, 1000));
      const statsDepois = fs.statSync(arquivoPath);
      
      if (stats.size === statsDepois.size && stats.size > 0) {
        log(`Download completo: ${excelFiles[0]} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return arquivoPath;
      }
      
      log(`Arquivo ainda crescendo... (${(statsDepois.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Verificar arquivos em download
    const downloading = arquivos.filter(f => f.endsWith('.crdownload') || f.endsWith('.tmp'));
    if (downloading.length > 0) {
      log(`Download em progresso: ${downloading[0]}`);
    }
    
    await new Promise(r => setTimeout(r, CONFIG.DOWNLOAD_POLL_INTERVAL_MS));
  }
  
  log('Timeout aguardando download!');
  return null;
}

/**
 * Processa arquivo Excel e extrai dados
 */
function processarExcel(caminhoArquivo) {
  log(`Processando Excel: ${caminhoArquivo}`);
  
  const workbook = XLSX.readFile(caminhoArquivo);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para JSON
  const dados = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  log(`Linhas brutas do Excel: ${dados.length}`);
  
  if (dados.length === 0) {
    return [];
  }
  
  // Log das colunas encontradas
  log(`Colunas no Excel: ${Object.keys(dados[0]).join(', ')}`);
  
  // Mapear e normalizar os dados
  const dadosNormalizados = dados.map(row => {
    const normalized = {};
    
    for (const [key, value] of Object.entries(row)) {
      const keyLower = key.toLowerCase().trim();
      let mappedKey = key;
      let processedValue = value;
      
      // Mapeamento de colunas
      if (keyLower.includes('data pagamento') || keyLower === 'data_pagamento') {
        mappedKey = 'Data Pagamento';
        processedValue = parseDate(value);
      } else if (keyLower.includes('data vencimento original') || keyLower === 'data_vencimento_original') {
        mappedKey = 'Data Vencimento Original';
        processedValue = parseDate(value);
      } else if (keyLower.includes('dia vencimento') || keyLower === 'dia_vencimento_veiculo') {
        mappedKey = 'Dia Vencimento Veiculo';
        processedValue = parseNumber(value);
      } else if (keyLower.includes('regional')) {
        mappedKey = 'Regional Boleto';
        processedValue = String(value || '').trim();
      } else if (keyLower.includes('cooperativa')) {
        mappedKey = 'Cooperativa';
        processedValue = String(value || '').trim();
      } else if (keyLower.includes('voluntário') || keyLower.includes('voluntario')) {
        mappedKey = 'Voluntário';
        processedValue = String(value || '').trim();
      } else if (keyLower === 'nome') {
        mappedKey = 'Nome';
        processedValue = String(value || '').trim();
      } else if (keyLower.includes('placa')) {
        mappedKey = 'Placas';
        processedValue = String(value || '').trim();
      } else if (keyLower === 'valor') {
        mappedKey = 'Valor';
        processedValue = parseMoneyValue(value);
      } else if (keyLower === 'data vencimento' || keyLower === 'data_vencimento' || keyLower === 'vencimento') {
        mappedKey = 'Data Vencimento';
        processedValue = parseDate(value);
      } else if (keyLower.includes('dias') && keyLower.includes('atraso')) {
        mappedKey = 'Qtde Dias em Atraso Vencimento Original';
        processedValue = parseNumber(value);
      } else if (keyLower.includes('situacao') || keyLower.includes('situação')) {
        mappedKey = 'Situacao';
        processedValue = String(value || '').trim();
      } else {
        // Manter coluna original com valor limpo
        processedValue = value !== null && value !== undefined ? String(value).trim() : null;
      }
      
      if (processedValue !== null && processedValue !== '') {
        normalized[mappedKey] = processedValue;
      }
    }
    
    return normalized;
  });
  
  // Filtrar registros válidos
  const dadosValidos = dadosNormalizados.filter(row => row['Nome'] || row['Placas']);
  log(`Registros válidos: ${dadosValidos.length}`);
  
  return dadosValidos;
}

/**
 * Converte data DD/MM/YYYY ou Excel serial para YYYY-MM-DD
 */
function parseDate(value) {
  if (!value) return null;
  
  // Se for número (Excel serial date)
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const year = date.y;
      const month = String(date.m).padStart(2, '0');
      const day = String(date.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return null;
  }
  
  const strValue = String(value).trim();
  
  // Formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(strValue)) {
    const [day, month, year] = strValue.split('/');
    return `${year}-${month}-${day}`;
  }
  
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
    return strValue;
  }
  
  return null;
}

/**
 * Converte valor monetário brasileiro para número
 */
function parseMoneyValue(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  
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
 * Converte string para número
 */
function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? null : parsed;
}

// ============================================
// MFA / TOTP (quando o portal exigir 2FA)
// ============================================

function base32ToBuffer(secret) {
  if (!secret) return Buffer.alloc(0);

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');

  let bits = 0;
  let value = 0;
  const output = [];

  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function gerarTotp(secretBase32, digits = 6, stepSeconds = 30) {
  const key = base32ToBuffer(secretBase32);
  if (!key || key.length === 0) return '';

  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);

  return String(code).padStart(digits, '0');
}

/**
 * Fecha qualquer popup/modal que aparecer
 */
async function fecharPopups(page, maxTentativas = 10) {
  let popupFechado = true;
  let tentativas = 0;
  
  while (popupFechado && tentativas < maxTentativas) {
    popupFechado = false;
    tentativas++;
    
    try {
      await page.waitForTimeout(800);
      
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
        '.modal button.close',
        '.close',
        '[data-dismiss="modal"]',
        '[data-bs-dismiss="modal"]',
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
              log(`Popup detectado - fechando via: ${seletor}`);
              await botao.click({ force: true }).catch(() => {});
              await page.waitForTimeout(1000);
              popupFechado = true;
              break;
            }
          }
          if (popupFechado) break;
        } catch {}
      }
      
      if (!popupFechado) {
        const fechouViaJS = await page.evaluate(() => {
          let fechou = false;
          
          const allElements = document.querySelectorAll('button, a, input[type="button"]');
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
          
          const overlays = document.querySelectorAll('.modal-backdrop');
          overlays.forEach(o => o.remove());
          
          return fechou;
        }).catch(() => false);
        
        if (fechouViaJS) {
          popupFechado = true;
          await page.waitForTimeout(1000);
        }
      }
      
    } catch {}
  }
}

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

async function enviarWebhook(dados, nomeArquivo) {
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
      timeout: 180000, // 3 minutos
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    
    log(`Webhook OK: ${response.data.message || 'Sucesso'}`);
    return true;
  } catch (error) {
    log(`Erro no webhook: ${error.response?.status || error.message}`);
    if (error.response?.data) {
      log(`Detalhes: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

async function rodarRobo() {
  if (!CONFIG.HINOVA_USER || !CONFIG.HINOVA_PASS) {
    throw new Error('HINOVA_USER e HINOVA_PASS são obrigatórios');
  }
  if (!CONFIG.WEBHOOK_URL) {
    throw new Error('WEBHOOK_URL é obrigatório');
  }

  log('='.repeat(50));
  log('INICIANDO ROBÔ DE COBRANÇA HINOVA');
  log('Modo: DOWNLOAD EXCEL + PROCESSAMENTO LOCAL');
  log('='.repeat(50));
  
  // Preparar diretório de downloads
  prepararDiretorioDownloads();
  
  const { inicio, fim } = getDateRange();
  log(`Período: ${inicio} até ${fim}`);
  
  const browser = await chromium.launch({ headless: true });
  
  // Contexto com diretório de downloads configurado
  const context = await browser.newContext({
    acceptDownloads: true,
  });
  
  const page = await context.newPage();
  
  try {
    // 1. Acessar página de login
    log('Acessando portal Hinova...');
    let navegacaoOk = false;
    for (let tentativa = 1; tentativa <= 3 && !navegacaoOk; tentativa++) {
      try {
        await page.goto(CONFIG.HINOVA_URL, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000 
        });
        navegacaoOk = true;
      } catch (e) {
        log(`Erro na tentativa ${tentativa}: ${e.message}`);
        if (tentativa === 3) throw e;
        await page.waitForTimeout(5000);
      }
    }
    
    log('Aguardando formulário de login...');
    await page.waitForTimeout(3000);
    await fecharPopups(page);
    
    // 2. Fazer login
    log('Realizando login...');
    
    // Preencher campos de login
    await page.evaluate(({ codigoCliente, usuario, senha }) => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };

      const inputs = Array.from(document.querySelectorAll('input'))
        .filter((i) => {
          const type = (i.getAttribute('type') || 'text').toLowerCase();
          if (type === 'hidden' || type === 'submit' || type === 'button') return false;
          return isVisible(i);
        });

      const passwordInput = inputs.find((i) => (i.getAttribute('type') || '').toLowerCase() === 'password');
      const textInputs = inputs.filter((i) => i !== passwordInput);

      // Heurística: 1º campo visível (texto) costuma ser "Código cliente"
      if (textInputs[0]) {
        textInputs[0].value = codigoCliente;
        textInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Heurística: 2º campo visível (texto) costuma ser usuário
      if (textInputs[1]) {
        textInputs[1].value = usuario;
        textInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (passwordInput) {
        passwordInput.value = senha;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { codigoCliente: CONFIG.HINOVA_CLIENT_CODE, usuario: CONFIG.HINOVA_USER, senha: CONFIG.HINOVA_PASS });
    
    await page.screenshot({ path: 'debug_antes_login.png' });

    // Helper: detectar/limpar o campo de "código de autenticação" (quando aparecer)
    const AUTH_FIELD_SELECTOR = [
      'input[placeholder*="Autenticação"]',
      'input[placeholder*="autenticação"]',
      'input[name*="autentic"]',
      'input[id*="autentic"]',
    ].join(', ');

    const getCampoAutenticacao = async () => {
      const campo = await page.$(AUTH_FIELD_SELECTOR).catch(() => null);
      if (!campo) return null;
      const visivel = await campo.isVisible().catch(() => false);
      return visivel ? campo : null;
    };

    // Regra solicitada: ao clicar em entrar, esse campo deve sumir; então limpamos e clicamos novamente.
    const dispensarCodigoAutenticacao = async () => {
      try {
        const campo = await getCampoAutenticacao();
        if (!campo) return false;

        await campo.fill('').catch(async () => {
          await campo.evaluate((el) => {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        });

        // Tirar foco e fechar eventuais overlays
        await page.click('body', { position: { x: 20, y: 20 }, force: true }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});

        log('Código de autenticação dispensado');
        return true;
      } catch {
        return false;
      }
    };
    
    // Clicar no botão Entrar com retry
    let loginSucesso = false;
    const MAX_TENTATIVAS = 20;
    
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      log(`Tentativa ${tentativa}/${MAX_TENTATIVAS} - Clicando em Entrar...`);
      
      try {
        const btnSelector = 'button:has-text("Entrar"), input[type="submit"][value*="Entrar"], input[value="Entrar"], button[type="submit"], .btn-primary';
        const btnEntrar = await page.$(btnSelector);
        
        if (btnEntrar) {
          await btnEntrar.evaluate(el => el.click()).catch(() => {});
          await btnEntrar.click({ force: true }).catch(() => {});
        }
        
        // Após o primeiro clique, o portal costuma mostrar/limpar o campo de autenticação.
        // Regra: dispensar (limpar) e clicar novamente até logar.
        await page.waitForTimeout(1200);
        const dispensado = await dispensarCodigoAutenticacao();
        await page.waitForTimeout(dispensado ? 800 : 400);
        
        // Segundo clique
        const btn2 = await page.$(btnSelector);
        if (btn2) {
          await btn2.click({ force: true }).catch(() => {});
        }
        
        await page.keyboard.press('Enter').catch(() => {});
        
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }),
          page.waitForTimeout(8000),
        ]).catch(() => {});
        
        // Verificar se saiu do login
        const relatorioVisible = await page.locator('text=Relatório').first().isVisible().catch(() => false);
        const loginVisible = await page.locator('text=Esqueci minha senha').first().isVisible().catch(() => false);
        
        if (relatorioVisible && !loginVisible) {
          loginSucesso = true;
          log('Login bem sucedido!');
          break;
        }
        
      } catch (err) {
        log(`Erro na tentativa ${tentativa}: ${err.message}`);
      }
    }
    
    await page.screenshot({ path: 'debug_apos_login.png' });
    
    if (!loginSucesso) {
      throw new Error(`Login falhou após ${MAX_TENTATIVAS} tentativas`);
    }
    
    await fecharPopups(page);
    
    // 3. Navegar para página de Relatório de Boletos
    log('Navegando para Relatório de Boletos...');
    await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    
    await page.waitForTimeout(5000);
    await fecharPopups(page);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await fecharPopups(page);
    log('Página de relatório aberta!');
    
    // 4. Preencher filtros
    log('Preenchendo filtros...');
    
    // Data Vencimento Original
    const dataInicioInput = await page.$('input[name*="dt_vencimento_original_ini"]');
    if (dataInicioInput) {
      await dataInicioInput.fill('');
      await dataInicioInput.fill(inicio);
    }
    
    const dataFimInput = await page.$('input[name*="dt_vencimento_original_fim"]');
    if (dataFimInput) {
      await dataFimInput.fill('');
      await dataFimInput.fill(fim);
    }
    
    log(`Data Vencimento Original: ${inicio} até ${fim}`);
    
    // Boletos Anteriores: NÃO POSSUI
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const parent = select.closest('tr, div, td');
        const parentText = parent?.textContent?.toLowerCase() || '';
        
        if (parentText.includes('boletos anteriores')) {
          const options = Array.from(select.querySelectorAll('option'));
          for (const option of options) {
            if (option.textContent?.toUpperCase().includes('NÃO POSSUI')) {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
    });
    log('Boletos Anteriores: NÃO POSSUI');
    
    // Referência: VENCIMENTO ORIGINAL
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const parent = select.closest('tr, div, td');
        const parentText = parent?.textContent?.toLowerCase() || '';
        
        if (parentText.includes('referência') || parentText.includes('referencia')) {
          const options = Array.from(select.querySelectorAll('option'));
          for (const option of options) {
            if (option.textContent?.toUpperCase().includes('VENCIMENTO ORIGINAL')) {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
    });
    log('Referência: VENCIMENTO ORIGINAL');
    
    await page.waitForTimeout(1000);
    
    // Situação Boleto: somente ABERTO
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      
      for (const cb of checkboxes) {
        const label = cb.closest('label') || cb.parentElement;
        const labelText = label?.textContent?.trim().toUpperCase() || '';
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          // Desmarcar TODOS primeiro
          if (labelText === 'TODOS') {
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
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          if (labelText === 'ABERTO' || cb.value?.toUpperCase() === 'ABERTO') {
            if (!cb.checked) cb.click();
          } else if (labelText !== 'TODOS') {
            if (cb.checked) cb.click();
          }
        }
      }
    });
    log('Situação Boleto: somente ABERTO');
    
    // Layout: BI - Vangard Cobrança
    const layoutSelect = await page.$('select[name*="layout"], select[name*="dados_visualizados"]');
    if (layoutSelect) {
      await layoutSelect.selectOption({ label: 'BI - Vangard Cobrança' }).catch(async () => {
        await layoutSelect.selectOption({ label: 'BI - Vangard' }).catch(() => {});
      });
    }
    log('Layout: BI - Vangard Cobrança');
    
    // ========================================
    // FORMA DE EXIBIÇÃO: "EM EXCEL"
    // ========================================
    log('Configurando forma de exibição: EM EXCEL...');
    
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.querySelectorAll('option'));
        for (const option of options) {
          const texto = option.textContent?.toLowerCase().trim() || '';
          if (texto.includes('excel') || texto === 'em excel') {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Forma exibição: Em Excel');
            return;
          }
        }
      }
    });
    log('Forma de exibição: Em Excel');
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'debug_filtros.png' });
    
    // 5. Clicar em Gerar e aguardar download
    log('Clicando em Gerar relatório...');
    
    // Configurar handler de download
    let downloadPath = null;
    
    page.on('download', async (download) => {
      log(`Download iniciado: ${download.suggestedFilename()}`);
      const savePath = path.join(DOWNLOADS_DIR, download.suggestedFilename());
      await download.saveAs(savePath);
      downloadPath = savePath;
      log(`Download salvo em: ${savePath}`);
    });
    
    // Clicar no botão Gerar
    const botoesGerar = [
      'input[type="submit"][value*="Gerar"]',
      'button:has-text("Gerar")',
      'input[value="Gerar"]',
      'input[value="Gerar Relatório"]',
    ];
    
    let clicouBotao = false;
    for (const seletor of botoesGerar) {
      try {
        const botao = await page.$(seletor);
        if (botao && await botao.isVisible()) {
          await botao.click();
          log(`Clicou no botão: ${seletor}`);
          clicouBotao = true;
          break;
        }
      } catch {}
    }
    
    if (!clicouBotao) {
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
        for (const el of inputs) {
          const texto = (el.value || el.textContent || '').toLowerCase();
          if (texto.includes('gerar')) {
            el.click();
            return true;
          }
        }
      });
      log('Clicou via JavaScript');
    }
    
    // 6. Aguardar download completar
    log('Aguardando download do Excel...');
    log(`Timeout configurado: ${CONFIG.DOWNLOAD_TIMEOUT_MS / 1000} segundos`);
    
    // Método 1: Aguardar evento de download do Playwright
    const downloadTimeout = setTimeout(() => {
      log('Timeout do download, verificando diretório...');
    }, CONFIG.DOWNLOAD_TIMEOUT_MS);
    
    // Aguardar download via polling no diretório
    const caminhoArquivo = await aguardarDownloadExcel(CONFIG.DOWNLOAD_TIMEOUT_MS);
    clearTimeout(downloadTimeout);
    
    // Se não encontrou via polling, tentar via downloadPath do evento
    const arquivoFinal = caminhoArquivo || downloadPath;
    
    if (!arquivoFinal || !fs.existsSync(arquivoFinal)) {
      log('Download não completou. Verificando se há nova aba...');
      
      // Tentar capturar nova aba (fallback)
      const pages = context.pages();
      log(`Páginas abertas: ${pages.length}`);
      
      for (const p of pages) {
        log(`  - ${p.url()}`);
      }
      
      await page.screenshot({ path: 'debug_apos_gerar.png' });
      throw new Error('Download do Excel não completou');
    }
    
    // 7. Processar Excel
    log('Processando arquivo Excel...');
    const dados = processarExcel(arquivoFinal);
    
    log(`Total de registros processados: ${dados.length}`);
    
    if (dados.length === 0) {
      log('AVISO: Nenhum dado válido no Excel!');
      return false;
    }
    
    // 8. Enviar para webhook
    const nomeArquivo = path.basename(arquivoFinal);
    const sucesso = await enviarWebhook(dados, nomeArquivo);
    
    // Limpar arquivo após processamento
    if (sucesso) {
      fs.unlinkSync(arquivoFinal);
      log('Arquivo Excel removido após processamento');
    }
    
    return sucesso;
    
  } catch (error) {
    log(`ERRO: ${error.message}`);
    try {
      await page.screenshot({ path: 'erro_hinova.png' });
      log('Screenshot de erro salvo');
    } catch {}
    return false;
    
  } finally {
    await browser.close();
  }
}

// ============================================
// EXECUÇÃO
// ============================================

rodarRobo()
  .then((sucesso) => {
    if (sucesso) {
      log('✅ ROBÔ FINALIZADO COM SUCESSO!');
      process.exit(0);
    } else {
      log('❌ ROBÔ FINALIZADO COM ERROS');
      process.exit(1);
    }
  })
  .catch((error) => {
    log(`❌ ERRO FATAL: ${error.message}`);
    process.exit(1);
  });
