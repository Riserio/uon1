#!/usr/bin/env node
/**
 * Robô de Automação - Cobrança Hinova (Node.js)
 * Requisitos: npm install playwright axios xlsx
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
  HINOVA_RELATORIO_URL: 'https://eris.hinova.com.br/sga/sgav4_valecar/relatorio/relatorioBoleto.php',
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  CORRETORA_ID: process.env.CORRETORA_ID || 'a4931643-8bf1-4153-97b1-c64925f536eb',
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function log(msg) {
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  console.log(`[${timestamp}] ${msg}`);
}

async function fecharPopups(page, maxTentativas = 5) {
  let tentativas = 0;
  while (tentativas < maxTentativas) {
    tentativas++;
    try {
      await page.waitForTimeout(1000);
      const fechou = await page.evaluate(() => {
        let encontrou = false;
        const seletores = ['.swal2-confirm', '.modal.show .close', 'button:has-text("Fechar")', '.btn-close'];
        seletores.forEach(sel => {
          const el = document.querySelector(sel);
          if (el && el.offsetHeight > 0) {
            el.click();
            encontrou = true;
          }
        });
        return encontrou;
      });
      if (!fechou) break;
    } catch (e) { break; }
  }
}

function getDateRange() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const format = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  return { inicio: format(primeiroDia), fim: format(ultimoDia) };
}

const COLUMN_MAP = {
  "DATA PAGAMENTO": "Data Pagamento",
  "DATA VENCIMENTO ORIGINAL": "Data Vencimento Original",
  "NOME": "Nome",
  "PLACAS": "Placas",
  "VALOR": "Valor",
  "SITUACAO": "Situacao"
};

function parseExcelDate(value) {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  return value;
}

function processarExcel(filePath) {
  log(`Processando: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet);
  
  return rawData.map(row => {
    let newRow = {};
    Object.keys(row).forEach(key => {
      const normalizedKey = key.trim().toUpperCase();
      if (COLUMN_MAP[normalizedKey]) {
        let val = row[key];
        if (normalizedKey.includes("DATA")) val = parseExcelDate(val);
        newRow[COLUMN_MAP[normalizedKey]] = val;
      }
    });
    return newRow;
  }).filter(r => r.Nome);
}

async function enviarWebhook(dados, nomeArquivo) {
  if (!CONFIG.WEBHOOK_URL) return log('Webhook URL não configurada. Pulando envio.');
  try {
    const res = await axios.post(CONFIG.WEBHOOK_URL, {
      corretora_id: CONFIG.CORRETORA_ID,
      dados,
      nome_arquivo: nomeArquivo,
      data_processamento: new Date().toISOString()
    }, { headers: { 'x-webhook-secret': CONFIG.WEBHOOK_SECRET } });
    log(`Webhook enviado: ${res.status}`);
  } catch (e) { log(`Erro Webhook: ${e.message}`); }
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

async function rodarRobo() {
  log('INICIANDO ROBÔ HINOVA');
  const { inicio, fim } = getDateRange();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // 1. Login
    await page.goto(CONFIG.HINOVA_URL);
    await page.fill('input[placeholder="Usuário"]', CONFIG.HINOVA_USER);
    await page.fill('input[placeholder="Senha"]', CONFIG.HINOVA_PASS);
    
    // Dispensa código de autenticação (foco/blur)
    const authField = await page.$('input[placeholder*="Autenticação"]');
    if (authField) {
      await authField.focus();
      await page.waitForTimeout(500);
      await page.keyboard.press('Tab');
    }

    await page.click('button:has-text("Entrar")');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
    log('Login concluído.');

    // 2. Relatório
    await page.goto(CONFIG.HINOVA_RELATORIO_URL);
    await fecharPopups(page);

    // Preencher Datas
    await page.fill('input[name*="dt_vencimento_original_ini"]', inicio);
    await page.fill('input[name*="dt_vencimento_original_fim"]', fim);

    // Configurar Filtros (Apenas Aberto / Vencimento Original / Boletos Anteriores: Não)
    await page.evaluate(() => {
      // 1. Situação: Marcar apenas ABERTO
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const txt = cb.parentElement.textContent.toUpperCase();
        if (txt.includes('SITUAÇÃO')) {
           cb.checked = txt.includes('ABERTO');
        }
      });
      // 2. Referência e Boletos Anteriores
      document.querySelectorAll('select').forEach(sel => {
        const txt = sel.parentElement.textContent.toUpperCase();
        if (txt.includes('REFERÊNCIA')) sel.value = "1"; // Vencimento Original
        if (txt.includes('ANTERIORES')) sel.value = "N"; // Não possui
      });
    });

    // 3. Selecionar Layout e Gerar
    log('Selecionando layout e gerando Excel...');
    await page.selectOption('select[name*="layout"]', { label: 'BI - Vangard Cobrança' }).catch(() => {});
    
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.click('button:has-text("Gerar Excel"), #btn_gerar_excel, .btn-success')
    ]);

    const tempPath = path.join(__dirname, 'relatorio.xlsx');
    await download.saveAs(tempPath);
    log('Arquivo baixado.');

    // 4. Processar e Enviar
    const dados = processarExcel(tempPath);
    log(`Total de registros: ${dados.length}`);
    await enviarWebhook(dados, download.suggestedFilename());

    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

  } catch (err) {
    log(`ERRO: ${err.message}`);
    await page.screenshot({ path: 'erro.png' });
  } finally {
    await browser.close();
    log('Fim da execução.');
  }
}

rodarRobo();