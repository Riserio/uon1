#!/usr/bin/env node
/**
 * Robô de Automação - SGA Hinova (Eventos)
 * =========================================
 * 
 * Este script automatiza a extração do relatório 12.9.1 (Por Eventos)
 * do portal SGA Hinova e envia os dados para o webhook.
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

// Campos a selecionar no relatório (conforme especificação)
const CAMPOS_EVENTO = [
  'Evento Estado',
  'Data Cadastro Item',
  'Data Evento',
  'Motivo Evento',
  'Tipo Evento',
  'Situação Evento',
  'Modelo Veículo',
  'Modelo Veículo Terceiro',
  'Placa',
  'Placa Terceiro',
  'Data Última Alteração Situação',
  'Valor Reparo',
  'Data Conclusão',
  'Custo Evento',
  'Data Alteração',
  'Data Previsão Entrega',
  'Solicitou Carro Reserva',
  'Envolvimento Terceiro',
  'Passível Ressarcimento',
  'Valor Mão de Obra',
  'Classificação',
  'Participação',
  'Envolvimento',
  'Previsão Valor Reparo',
  'Usuário Alteração',
  'Data Cadastro Evento',
  'Cooperativa',
  'Valor Protegido Veículo',
  'Situação Análise Evento',
  'Regional',
  'Ano Fabricação',
  'Voluntário',
  'Regional Veículo',
  'Associado Estado',
  'Protocolo',
  'Evento Logradouro',
  'Categoria Veículo',
  'Tipo Veículo Veículo Terceiro',
];

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
async function saveDebugInfo(page, prefix) {
  try {
    if (!fs.existsSync(CONFIG.DEBUG_DIR)) {
      fs.mkdirSync(CONFIG.DEBUG_DIR, { recursive: true });
    }
    const screenshot = path.join(CONFIG.DEBUG_DIR, `${prefix}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    log(`Screenshot salvo: ${screenshot}`, LOG_LEVELS.DEBUG);
  } catch (e) {
    log(`Erro ao salvar debug: ${e.message}`, LOG_LEVELS.WARN);
  }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

async function waitForPageLoad(page, timeout = 30000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
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

  // Atualizar status para login
  await updateProgress('executando', 'login');

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    // 1. LOGIN
    log(`Acessando portal: ${CONFIG.HINOVA_URL}`, LOG_LEVELS.INFO);
    await page.goto(CONFIG.HINOVA_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await saveDebugInfo(page, 'debug_sga_antes_login');

    // Preencher login
    log('Preenchendo credenciais...', LOG_LEVELS.INFO);
    
    // Código do cliente (se houver)
    if (CONFIG.HINOVA_CODIGO_CLIENTE) {
      const codigoInput = page.locator('input[name*="codigo" i], input[name*="cliente" i], input[placeholder*="código" i]').first();
      if (await codigoInput.isVisible().catch(() => false)) {
        await codigoInput.fill(CONFIG.HINOVA_CODIGO_CLIENTE);
      }
    }

    // Usuário
    const userInput = page.locator('input[name*="login" i], input[name*="usuario" i], input[type="text"]').first();
    await userInput.fill(CONFIG.HINOVA_USER);

    // Senha
    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill(CONFIG.HINOVA_PASS);

    // Submit
    const submitBtn = page.locator('input[type="submit"], button[type="submit"], button:has-text("Entrar"), button:has-text("Login")').first();
    await submitBtn.click();

    await waitForPageLoad(page, 30000);
    await saveDebugInfo(page, 'debug_sga_apos_login');

    // Verificar se login foi bem sucedido
    const loginError = await page.locator('text=incorreto, text=inválido, text=erro, .alert-danger, .error').first().isVisible().catch(() => false);
    if (loginError) {
      throw new Error('Falha no login - credenciais inválidas');
    }

    log('Login realizado com sucesso!', LOG_LEVELS.SUCCESS);

    // 2. NAVEGAR PARA RELATÓRIO DE EVENTOS
    await updateProgress('executando', 'filtros');
    log('Navegando para Relatório > 12.9 > 12.9.1...', LOG_LEVELS.INFO);

    // Clicar no menu Relatório
    const menuRelatorio = page.locator('a:has-text("Relatório"), a:has-text("Relatórios"), li:has-text("Relatório") > a').first();
    if (await menuRelatorio.isVisible().catch(() => false)) {
      await menuRelatorio.click();
      await page.waitForTimeout(1000);
    }

    // Clicar em 12.9 - De Eventos
    const menuEventos = page.locator('a:has-text("12.9"), a:has-text("De Eventos"), a:has-text("Eventos")').first();
    if (await menuEventos.isVisible().catch(() => false)) {
      await menuEventos.click();
      await page.waitForTimeout(1000);
    }

    // Clicar em 12.9.1 - Por Eventos
    const menuPorEventos = page.locator('a:has-text("12.9.1"), a:has-text("Por Eventos")').first();
    if (await menuPorEventos.isVisible().catch(() => false)) {
      await menuPorEventos.click();
      await waitForPageLoad(page);
    }

    await saveDebugInfo(page, 'debug_sga_relatorio_eventos');

    // 3. PREENCHER FILTROS
    log('Preenchendo filtros de período...', LOG_LEVELS.INFO);

    // Data Cadastro Item - Início
    const dataInicio = page.locator('input[name*="data_inicio" i], input[name*="datacadastro" i], input[placeholder*="inicial" i]').first();
    if (await dataInicio.isVisible().catch(() => false)) {
      await dataInicio.fill(CONFIG.DATA_INICIO);
    }

    // Data Cadastro Item - Fim
    const dataFim = page.locator('input[name*="data_fim" i], input[name*="datafim" i], input[placeholder*="final" i]').first();
    if (await dataFim.isVisible().catch(() => false)) {
      await dataFim.fill(CONFIG.DATA_FIM);
    }

    await saveDebugInfo(page, 'debug_sga_filtros_periodo');

    // 4. SELECIONAR CAMPOS (DADOS VISUALIZADOS)
    await updateProgress('executando', 'campos');
    log('Selecionando campos do relatório...', LOG_LEVELS.INFO);

    // Clicar na aba "Dados Visualizados" ou "Dados do Evento"
    const abaDados = page.locator('a:has-text("Dados Visualizados"), a:has-text("Dados do Evento"), tab:has-text("Dados")').first();
    if (await abaDados.isVisible().catch(() => false)) {
      await abaDados.click();
      await page.waitForTimeout(1000);
    }

    // Selecionar cada campo
    for (const campo of CAMPOS_EVENTO) {
      try {
        // Tentar checkbox com label
        const checkbox = page.locator(`input[type="checkbox"][name*="${normalizeText(campo).replace(/\s/g, '')}" i], label:has-text("${campo}") input[type="checkbox"]`).first();
        if (await checkbox.isVisible().catch(() => false)) {
          const isChecked = await checkbox.isChecked().catch(() => false);
          if (!isChecked) {
            await checkbox.check();
            log(`Campo selecionado: ${campo}`, LOG_LEVELS.DEBUG);
          }
        }
      } catch (e) {
        log(`Campo não encontrado: ${campo}`, LOG_LEVELS.DEBUG);
      }
    }

    // Alternativa: Selecionar TODOS se disponível
    const selectAll = page.locator('input[type="checkbox"][name*="todos" i], a:has-text("Selecionar Todos"), button:has-text("Todos")').first();
    if (await selectAll.isVisible().catch(() => false)) {
      if (await selectAll.getAttribute('type') === 'checkbox') {
        await selectAll.check();
      } else {
        await selectAll.click();
      }
      log('Opção "Selecionar Todos" ativada', LOG_LEVELS.INFO);
    }

    await saveDebugInfo(page, 'debug_sga_campos');

    // 5. SELECIONAR FORMATO EXCEL
    log('Selecionando formato Excel...', LOG_LEVELS.INFO);

    const formatoExcel = page.locator('input[value*="excel" i], input[value*="xls" i], label:has-text("Excel") input, select option:has-text("Excel")').first();
    if (await formatoExcel.isVisible().catch(() => false)) {
      if (await formatoExcel.getAttribute('type') === 'radio' || await formatoExcel.getAttribute('type') === 'checkbox') {
        await formatoExcel.check();
      } else {
        await formatoExcel.click();
      }
    }

    // Tentar select de formato
    const selectFormato = page.locator('select[name*="formato" i], select[name*="exibicao" i]').first();
    if (await selectFormato.isVisible().catch(() => false)) {
      await selectFormato.selectOption({ label: /excel/i }).catch(() => {});
    }

    await saveDebugInfo(page, 'debug_sga_formato');

    // 6. GERAR RELATÓRIO
    await updateProgress('executando', 'download');
    log('Gerando relatório...', LOG_LEVELS.INFO);

    // Configurar listener de download
    const downloadPromise = page.waitForEvent('download', { timeout: 300000 });

    // Clicar no botão gerar
    const btnGerar = page.locator('input[type="submit"]:has-text("Gerar"), button:has-text("Gerar"), input[value*="Gerar" i], button:has-text("Exportar")').first();
    if (await btnGerar.isVisible().catch(() => false)) {
      await btnGerar.click();
    }

    log('Aguardando download...', LOG_LEVELS.INFO);

    // 7. PROCESSAR DOWNLOAD
    let download;
    try {
      download = await downloadPromise;
      log(`Download iniciado: ${download.suggestedFilename()}`, LOG_LEVELS.SUCCESS);
    } catch (e) {
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

    // 8. PROCESSAR EXCEL
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

    // 9. ENVIAR PARA WEBHOOK
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
    await saveDebugInfo(page, 'debug_sga_erro');

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
