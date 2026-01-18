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
    
    // Debug: verificar se as credenciais chegaram
    log(`DEBUG: HINOVA_USER tem ${CONFIG.HINOVA_USER?.length || 0} caracteres`);
    log(`DEBUG: HINOVA_PASS tem ${CONFIG.HINOVA_PASS?.length || 0} caracteres`);
    
    if (!CONFIG.HINOVA_USER || !CONFIG.HINOVA_PASS) {
      throw new Error('ERRO CRÍTICO: Credenciais não foram passadas. Verifique os secrets no GitHub.');
    }
    
    // Tirar screenshot para debug
    await page.screenshot({ path: 'debug_antes_login.png' });
    
    // Listar todos os inputs da página para debug
    const inputs = await page.$$eval('input', els => els.map(el => ({
      name: el.name,
      id: el.id,
      type: el.type,
      placeholder: el.placeholder,
      className: el.className
    })));
    log(`Inputs encontrados: ${JSON.stringify(inputs)}`);
    
    // Usar placeholders para encontrar os campos corretos (baseado no screenshot)
    // Campo "Usuário" tem placeholder "Usuário"
    // Campo "Senha" tem placeholder "Senha"
    
    // Preencher código cliente primeiro
    await page.fill('input[placeholder=""]', '2363').catch(() => {});
    
    // Tentar preencher por placeholder
    try {
      await page.fill('input[placeholder="Usuário"]', CONFIG.HINOVA_USER);
      log(`Usuário preenchido por placeholder: ${CONFIG.HINOVA_USER}`);
    } catch (e) {
      log(`Erro ao preencher usuário por placeholder: ${e.message}`);
    }
    
    try {
      await page.fill('input[placeholder="Senha"]', CONFIG.HINOVA_PASS);
      log('Senha preenchida por placeholder');
    } catch (e) {
      log(`Erro ao preencher senha por placeholder: ${e.message}`);
    }
    
    // Fallback: preencher via JavaScript com seletores baseados em label
    const resultado = await page.evaluate((usuario, senha) => {
      const logs = [];
      
      // Encontrar inputs pelo texto do label anterior
      const labels = document.querySelectorAll('label, .label, div');
      
      labels.forEach(label => {
        const text = label.textContent?.trim().toLowerCase();
        
        // Encontrar o input seguinte ao label
        let input = label.querySelector('input') || 
                   label.nextElementSibling?.querySelector('input') ||
                   label.nextElementSibling;
        
        if (input && input.tagName === 'INPUT') {
          if (text === 'código cliente') {
            input.value = '2363';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            logs.push('Código cliente preenchido via label');
          } else if (text === 'usuário') {
            input.value = usuario;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            logs.push('Usuário preenchido via label: ' + usuario);
          } else if (text === 'senha') {
            input.value = senha;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            logs.push('Senha preenchida via label');
          }
        }
      });
      
      // Fallback final: preencher por ordem de aparição
      const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])'));
      logs.push(`Total inputs encontrados: ${allInputs.length}`);
      
      // Ordenar por posição no DOM
      if (allInputs.length >= 3) {
        // Input 0: Código cliente
        if (!allInputs[0].value) {
          allInputs[0].value = '2363';
          allInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          logs.push('Código preenchido por índice');
        }
        
        // Input 1: Usuário
        if (!allInputs[1].value || allInputs[1].value === allInputs[1].placeholder) {
          allInputs[1].value = usuario;
          allInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
          logs.push('Usuário preenchido por índice: ' + usuario);
        }
        
        // Input 2: Senha
        if (!allInputs[2].value || allInputs[2].value === allInputs[2].placeholder) {
          allInputs[2].value = senha;
          allInputs[2].dispatchEvent(new Event('input', { bubbles: true }));
          logs.push('Senha preenchida por índice');
        }
      }
      
      // Verificar valores finais
      const valores = {
        codigo: allInputs[0]?.value,
        usuario: allInputs[1]?.value,
        senhaLen: allInputs[2]?.value?.length || 0
      };
      
      return { logs, valores };
    }, CONFIG.HINOVA_USER, CONFIG.HINOVA_PASS);
    
    resultado.logs.forEach(l => log(l));
    log(`Valores finais: Código=${resultado.valores.codigo}, Usuário=${resultado.valores.usuario}, Senha=${resultado.valores.senhaLen} chars`);
    
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'debug_campos_preenchidos.png' });
    
    // IMPORTANTE: Clicar no campo de autenticação e depois fora para validar que está vazio
    log('Validando dispensa de código de autenticação...');
    try {
      // Clicar no campo de código de autenticação
      const campoAuth = await page.$('input[placeholder*="Autenticação"], input[placeholder*="autenticação"]');
      if (campoAuth) {
        await campoAuth.click();
        log('Clicou no campo de autenticação');
        await page.waitForTimeout(300);
        
        // Clicar fora (no body ou em outro elemento) para validar
        await page.click('body', { position: { x: 10, y: 10 } }).catch(() => {});
        log('Clicou fora para validar dispensa');
        await page.waitForTimeout(300);
      }
    } catch (e) {
      log(`Erro ao validar campo auth: ${e.message}`);
    }
    
    // Clicar no botão Entrar - com retry até realmente sair da tela de login
    let loginSucesso = false;

    const MAX_TENTATIVAS = Number(process.env.HINOVA_LOGIN_MAX_TENTATIVAS || '20');
    const ESPERA_POR_TENTATIVA_MS = Number(process.env.HINOVA_LOGIN_ESPERA_MS || '8000');

    const isAindaNaLogin = async () => {
      // Preferir visibilidade (algumas páginas mantêm o input no DOM mas escondem)
      const pwdVisible = await page
        .locator('input[type="password"]')
        .first()
        .isVisible()
        .catch(() => false);

      // Heurística adicional por URL (caso o input seja removido mas a URL continue)
      const url = page.url?.() || '';
      const urlPareceLogin = /login/i.test(url);

      return pwdVisible || urlPareceLogin;
    };

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      log(`Tentativa ${tentativa}/${MAX_TENTATIVAS} - Clicando no botão Entrar...`);

      try {
        const btnSelector = 'button:has-text("Entrar"), input[value="Entrar"], .btn-primary, button.btn, #btn-login';

        // Em alguns cenários o portal só reage após múltiplos cliques (ou clique + Enter).
        // Então fazemos uma "rajada" curta de ações por tentativa.
        const btnEntrar = await page.$(btnSelector);

        if (btnEntrar) {
          // 1) Clique via JS (bypass de overlay)
          await btnEntrar.evaluate((el) => el.click()).catch(() => {});
          // 2) Clique forçado Playwright
          await btnEntrar.click({ force: true }).catch(() => {});
        } else {
          await page.click('button:has-text("Entrar")', { force: true, timeout: 1000 }).catch(() => {});
        }

        // 3) Enter como fallback final
        await page.keyboard.press('Enter').catch(() => {});

        // Aguardar qualquer reação do app (navegação, requests, etc.)
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: ESPERA_POR_TENTATIVA_MS }).catch(() => null),
          page.waitForLoadState('networkidle', { timeout: ESPERA_POR_TENTATIVA_MS }).catch(() => null),
          page.waitForTimeout(ESPERA_POR_TENTATIVA_MS),
        ]);

        // Verificar se saiu da página de login
        const aindaNaLogin = await isAindaNaLogin();
        if (!aindaNaLogin) {
          loginSucesso = true;
          log(`Login bem sucedido na tentativa ${tentativa}!`);
          break;
        }

        // Ainda na página de login, verificar se há mensagem de erro
        const erroMsg = await page
          .$eval('.alert-danger, .error, .erro, .message-error', (el) => el.textContent)
          .catch(() => null);
        if (erroMsg) {
          log(`Erro detectado: ${String(erroMsg).trim()}`);
        }

        log(`Tentativa ${tentativa} falhou - ainda na página de login`);
        await page.waitForTimeout(600);
      } catch (err) {
        log(`Erro na tentativa ${tentativa}: ${err.message}`);
        await page.waitForTimeout(600);
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
