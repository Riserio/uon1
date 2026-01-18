#!/usr/bin/env node
/**
 * Robô de Automação - Cobrança Hinova (Node.js)
 * ==============================================
 * 
 * REQUISITOS:
 * -----------
 * npm install playwright axios
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

// ============================================
// CONFIGURAÇÃO - EDITE AQUI OU USE ENV VARS
// ============================================

const CONFIG = {
  HINOVA_URL: process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php',
  HINOVA_USER: process.env.HINOVA_USER || '',
  HINOVA_PASS: process.env.HINOVA_PASS || '',
  
  // URL do webhook
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  
  // Identificador da corretora - USE O ID DIRETO
  CORRETORA_ID: process.env.CORRETORA_ID || 'a4931643-8bf1-4153-97b1-c64925f536eb',
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function log(msg) {
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  console.log(`[${timestamp}] ${msg}`);
}

function getDateRange() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  
  const formatDate = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };
  
  return {
    inicio: formatDate(primeiroDia),
    fim: formatDate(hoje),
  };
}

async function extrairDadosTabela(page) {
  const dados = [];
  
  try {
    await page.waitForSelector('table', { timeout: 30000 });
  } catch {
    log('Tabela não encontrada');
    return dados;
  }
  
  // Extrair cabeçalhos
  const headers = await page.$$eval(
    'table thead th, table tr:first-child th, table tr:first-child td',
    (elements) => elements.map(el => el.innerText.trim()).filter(Boolean)
  );
  
  log(`Colunas encontradas: ${headers.join(', ')}`);
  
  // Extrair linhas
  const rows = await page.$$('table tbody tr, table tr:not(:first-child)');
  
  for (const row of rows) {
    const cells = await row.$$('td');
    if (cells.length >= headers.length) {
      const rowData = {};
      for (let i = 0; i < cells.length && i < headers.length; i++) {
        const text = await cells[i].innerText();
        rowData[headers[i]] = text.trim();
      }
      if (Object.keys(rowData).length > 0) {
        dados.push(rowData);
      }
    }
  }
  
  return dados;
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
      timeout: 120000,
    });
    
    log(`Webhook OK: ${response.data.message || 'Sucesso'}`);
    return true;
  } catch (error) {
    log(`Erro no webhook: ${error.response?.status || error.message}`);
    return false;
  }
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

async function rodarRobo() {
  if (!CONFIG.HINOVA_USER || !CONFIG.HINOVA_PASS) {
    throw new Error('HINOVA_USER e HINOVA_PASS são obrigatórios (configure como secrets/variáveis de ambiente)');
  }
  if (!CONFIG.WEBHOOK_URL) {
    throw new Error('WEBHOOK_URL é obrigatório (configure como secret/variável de ambiente)');
  }

  log('='.repeat(50));
  log('INICIANDO ROBÔ DE COBRANÇA HINOVA');
  log('='.repeat(50));
  
  const { inicio, fim } = getDateRange();
  log(`Período: ${inicio} até ${fim}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. Acessar página de login
    log('Acessando portal Hinova...');
    await page.goto(CONFIG.HINOVA_URL, { waitUntil: 'networkidle' });
    
    // 1.1 Fechar modal de "Comunicado Importante" se aparecer
    try {
      const modalButton = await page.$('button:has-text("Continuar e Fechar"), a:has-text("Continuar e Fechar"), .btn:has-text("Continuar")');
      if (modalButton) {
        log('Modal de comunicado detectado - fechando...');
        await modalButton.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Modal não apareceu, seguir normalmente
    }
    
    // 2. Fazer login (sem código de autenticação - usuário dispensado)
    log('Realizando login...');
    
    // Tirar screenshot para debug
    await page.screenshot({ path: 'debug_antes_login.png' });
    
    // Listar todos os inputs da página para debug
    const inputs = await page.$$eval('input', els => els.map(el => ({
      name: el.name,
      id: el.id,
      type: el.type,
      placeholder: el.placeholder
    })));
    log(`Inputs encontrados: ${JSON.stringify(inputs)}`);
    
    // Preencher campos usando seletores mais genéricos
    // Campo 1: Código cliente (primeiro input text)
    const allTextInputs = await page.$$('input[type="text"], input:not([type]):not([type="password"]):not([type="hidden"]):not([type="submit"])');
    log(`Inputs de texto encontrados: ${allTextInputs.length}`);
    
    if (allTextInputs.length >= 1) {
      await allTextInputs[0].click();
      await allTextInputs[0].fill('2363');
      log('Código cliente preenchido: 2363');
    }
    
    // Campo 2: Usuário (segundo input text)
    if (allTextInputs.length >= 2) {
      await allTextInputs[1].click();
      await allTextInputs[1].fill(CONFIG.HINOVA_USER);
      log(`Usuário preenchido: ${CONFIG.HINOVA_USER}`);
    }
    
    // Campo 3: Senha - buscar todos os inputs password
    const senhaInputs = await page.$$('input[type="password"]');
    log(`Inputs de senha encontrados: ${senhaInputs.length}`);
    
    if (senhaInputs.length >= 1) {
      // Pegar o primeiro campo de senha (campo "Senha", não "Código de autenticação")
      await senhaInputs[0].click();
      await senhaInputs[0].fill(CONFIG.HINOVA_PASS);
      log('Senha preenchida com sucesso');
      
      // Verificar se preencheu
      const senhaPreenchida = await senhaInputs[0].inputValue();
      log(`Senha tem ${senhaPreenchida.length} caracteres`);
    } else {
      // Fallback: tentar por nome ou id
      log('Tentando fallback para senha...');
      await page.fill('input[name="senha"]', CONFIG.HINOVA_PASS).catch(() => {});
      await page.fill('input#senha', CONFIG.HINOVA_PASS).catch(() => {});
      await page.fill('input[name="password"]', CONFIG.HINOVA_PASS).catch(() => {});
    }
    
    // NÃO preencher código de autenticação (segundo password) - usuário está dispensado
    
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'debug_campos_preenchidos.png' });
    
    // Clicar no botão Entrar - com retry de até 5 tentativas (bug conhecido)
    let loginSucesso = false;
    const MAX_TENTATIVAS = 5;
    
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      log(`Tentativa ${tentativa}/${MAX_TENTATIVAS} - Clicando no botão Entrar...`);
      
      try {
        // Tentar múltiplos seletores e métodos de clique
        const btnEntrar = await page.$('button:has-text("Entrar"), input[value="Entrar"], .btn-primary, button.btn, #btn-login');
        
        if (btnEntrar) {
          // Forçar clique com JavaScript (bypass de qualquer overlay)
          await btnEntrar.evaluate(el => el.click());
          log('Clique forçado via JavaScript');
          
          // Também tentar clique normal
          await btnEntrar.click({ force: true }).catch(() => {});
        } else {
          // Fallback: clicar por posição ou pressionar Enter
          await page.click('button:has-text("Entrar")', { force: true }).catch(async () => {
            await page.keyboard.press('Enter');
            log('Pressionando Enter para submeter');
          });
        }
        
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle').catch(() => {});
        
        // Verificar se saiu da página de login
        const aindaNaLogin = await page.$('input[type="password"]');
        if (!aindaNaLogin) {
          loginSucesso = true;
          log(`Login bem sucedido na tentativa ${tentativa}!`);
          break;
        }
        
        // Ainda na página de login, verificar se há mensagem de erro
        const erroMsg = await page.$eval('.alert-danger, .error, .erro, .message-error', el => el.textContent).catch(() => null);
        if (erroMsg) {
          log(`Erro detectado: ${erroMsg}`);
        }
        
        log(`Tentativa ${tentativa} falhou - ainda na página de login`);
        await page.waitForTimeout(1000);
        
      } catch (err) {
        log(`Erro na tentativa ${tentativa}: ${err.message}`);
      }
    }
    
    await page.screenshot({ path: 'debug_apos_login.png' });
    
    if (!loginSucesso) {
      throw new Error(`Login falhou após ${MAX_TENTATIVAS} tentativas`);
    }
    
    // Verificar se apareceu outro modal após login e fechar
    try {
      const modalButton2 = await page.$('button:has-text("Continuar e Fechar"), a:has-text("Continuar e Fechar")');
      if (modalButton2) {
        log('Modal pós-login detectado - fechando...');
        await modalButton2.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Modal não apareceu
    }
    
    log('Login realizado com sucesso!');
    
    // 3. Navegar até Relatório de Boletos
    log('Navegando para Relatório de Boletos...');
    
    await page.click('text=Relatório', { timeout: 10000 }).catch(() => {
      return page.click('text=Relatórios');
    });
    await page.waitForTimeout(1000);
    
    await page.click('text=11.3', { timeout: 10000 }).catch(() => {
      return page.click('text=Relatório Boletos');
    });
    await page.waitForLoadState('networkidle');
    log('Página de relatório aberta!');
    
    // 4. Preencher filtros
    log('Preenchendo filtros...');
    
    const dataInicioInput = await page.$('input[name*="data_inicio"], input[name*="vencimento_inicial"]');
    if (dataInicioInput) {
      await dataInicioInput.fill(inicio);
    }
    
    const dataFimInput = await page.$('input[name*="data_fim"], input[name*="vencimento_final"]');
    if (dataFimInput) {
      await dataFimInput.fill(fim);
    }
    
    // Desmarcar "Cancelado"
    const canceladoCheckbox = await page.$('input[value="CANCELADO"], label:has-text("Cancelado") input');
    if (canceladoCheckbox && await canceladoCheckbox.isChecked()) {
      await canceladoCheckbox.uncheck();
    }
    
    // Boletos Anteriores - "Não possui"
    const boletosAnteriores = await page.$('select[name*="anteriores"], select[name*="boletos_ant"]');
    if (boletosAnteriores) {
      await boletosAnteriores.selectOption({ label: 'Não possui' });
    }
    
    // Selecionar layout "BI - Vangard Cobrança"
    const layoutSelect = await page.$('select[name*="layout"], select[name*="visualiza"]');
    if (layoutSelect) {
      await layoutSelect.selectOption({ label: 'BI - Vangard Cobrança' });
    }
    
    log('Filtros preenchidos!');
    
    // 5. Gerar relatório
    log('Gerando relatório...');
    await page.click('input[type="submit"]:has-text("Gerar"), button:has-text("Gerar"), .btn-gerar');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // 6. Extrair dados
    log('Extraindo dados...');
    const dados = await extrairDadosTabela(page);
    log(`Total de registros extraídos: ${dados.length}`);
    
    if (dados.length === 0) {
      log('AVISO: Nenhum dado encontrado!');
      await page.screenshot({ path: 'debug_hinova.png' });
      log('Screenshot salvo: debug_hinova.png');
      return false;
    }
    
    // 7. Enviar para webhook
    const nomeArquivo = `Hinova_Boletos_${fim.replace(/\//g, '-')}.json`;
    const sucesso = await enviarWebhook(dados, nomeArquivo);
    
    return sucesso;
    
  } catch (error) {
    log(`ERRO: ${error.message}`);
    try {
      await page.screenshot({ path: 'erro_hinova.png' });
      log('Screenshot de erro salvo: erro_hinova.png');
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
