#!/usr/bin/env node
/**
 * Robô de Automação - Cobrança Hinova (Node.js)
 * ==============================================
 * 
 * REQUISITOS:
 * -----------
 * npm install playwright axios xlsx
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
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURAÇÃO - EDITE AQUI OU USE ENV VARS
// ============================================

const CONFIG = {
  HINOVA_URL: process.env.HINOVA_URL || 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php',
  HINOVA_RELATORIO_URL: 'https://eris.hinova.com.br/sga/sgav4_valecar/relatorio/relatorioBoleto.php',
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

/**
 * Fecha qualquer popup/modal que aparecer clicando em "Fechar", "X", ou botões similares
 * Continua tentando até não encontrar mais popups
 */
async function fecharPopups(page, maxTentativas = 10) {
  let popupFechado = true;
  let tentativas = 0;
  
  while (popupFechado && tentativas < maxTentativas) {
    popupFechado = false;
    tentativas++;
    
    try {
      // Aguardar um pouco para popups carregarem (site lento)
      await page.waitForTimeout(800);
      
      // Seletores comuns para botões de fechar - ordem de prioridade
      const seletoresFechar = [
        // Botões com texto "Fechar" - mais comuns
        'button:has-text("Fechar")',
        'a:has-text("Fechar")',
        '.btn:has-text("Fechar")',
        'input[value="Fechar"]',
        'input[type="button"][value="Fechar"]',
        // Botões de comunicado
        'button:has-text("Continuar e Fechar")',
        'a:has-text("Continuar e Fechar")',
        'button:has-text("Continuar")',
        // Botões OK
        'button:has-text("OK")',
        '.btn:has-text("OK")',
        // Botões X de fechar modal
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
        // SweetAlert
        '.swal2-confirm',
        '.swal2-close',
        // Bootbox e outros
        '.bootbox .btn-primary',
        '.bootbox .btn-default',
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
        } catch {
          // Continuar tentando outros seletores
        }
      }
      
      // Também tentar via JavaScript para fechar modais
      if (!popupFechado) {
        const fechouViaJS = await page.evaluate(() => {
          let fechou = false;
          
          // Procurar todos os botões com texto "Fechar"
          const allElements = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], .btn');
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
          
          // Fechar modais Bootstrap
          if (!fechou) {
            const modals = document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"]');
            modals.forEach(modal => {
              const closeBtn = modal.querySelector('.close, button.close, .btn-close, [data-dismiss="modal"]');
              if (closeBtn) {
                closeBtn.click();
                fechou = true;
              }
            });
          }
          
          // Fechar SweetAlert
          if (!fechou) {
            const swalClose = document.querySelector('.swal2-close, .swal2-confirm');
            if (swalClose) {
              swalClose.click();
              fechou = true;
            }
          }
          
          // Remover overlays de backdrop
          const overlays = document.querySelectorAll('.modal-backdrop');
          overlays.forEach(o => o.remove());
          
          return fechou;
        }).catch(() => false);
        
        if (fechouViaJS) {
          popupFechado = true;
          await page.waitForTimeout(1000);
        }
      }
      
    } catch (e) {
      // Silenciar erros - pode não haver popups
    }
  }
  
  if (tentativas > 1) {
    log(`Verificação de popups concluída (${tentativas} iterações)`);
  }
}

function getDateRange() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  // Último dia do mês atual (dia 0 do próximo mês = último dia deste mês)
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

// Colunas esperadas do layout "BI - Vangard Cobrança"
const COLUNAS_ESPERADAS = [
  "Data Pagamento",
  "Data Vencimento Original",
  "Dia Vencimento Veiculo",
  "Regional Boleto",
  "Cooperativa",
  "Voluntário",
  "Nome",
  "Placas",
  "Valor",
  "Data Vencimento",
  "Qtde Dias em Atraso Vencimento Original",
  "Situacao"
];

// Mapeamento de colunas do Excel para campos padronizados
const COLUMN_MAP = {
  "DATA PAGAMENTO": "Data Pagamento",
  "DATA VENCIMENTO ORIGINAL": "Data Vencimento Original",
  "DIA VENCIMENTO VEICULO": "Dia Vencimento Veiculo",
  "REGIONAL BOLETO": "Regional Boleto",
  "REGIONAL": "Regional Boleto",
  "COOPERATIVA": "Cooperativa",
  "VOLUNTÁRIO": "Voluntário",
  "VOLUNTARIO": "Voluntário",
  "NOME": "Nome",
  "PLACAS": "Placas",
  "PLACA": "Placas",
  "VALOR": "Valor",
  "DATA VENCIMENTO": "Data Vencimento",
  "VENCIMENTO": "Data Vencimento",
  "QTDE DIAS EM ATRASO VENCIMENTO ORIGINAL": "Qtde Dias em Atraso Vencimento Original",
  "DIAS ATRASO": "Qtde Dias em Atraso Vencimento Original",
  "SITUACAO": "Situacao",
  "SITUAÇÃO": "Situacao",
  "SITUAÇÃO BOLETO": "Situacao",
};

function normalizeHeader(header) {
  return String(header).trim().toUpperCase().replace(/\s+/g, ' ');
}

function parseExcelDate(value) {
  if (!value) return null;
  
  // Se for número (serial Excel)
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const month = String(date.m).padStart(2, '0');
      const day = String(date.d).padStart(2, '0');
      return `${date.y}-${month}-${day}`;
    }
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

function parseMoneyValue(value) {
  if (!value) return 0;
  const strValue = String(value).trim();
  const cleanValue = strValue
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
}

function processarExcel(filePath) {
  log(`Processando arquivo Excel: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para JSON com headers
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  log(`Total de linhas brutas: ${rawData.length}`);
  
  if (rawData.length === 0) {
    log('AVISO: Arquivo Excel vazio!');
    return [];
  }
  
  // Identificar headers
  const primeiraLinha = rawData[0];
  const headersOriginais = Object.keys(primeiraLinha);
  log(`Colunas no Excel: ${headersOriginais.join(', ')}`);
  
  // Mapear colunas
  const headerMapping = {};
  for (const header of headersOriginais) {
    const normalized = normalizeHeader(header);
    if (COLUMN_MAP[normalized]) {
      headerMapping[header] = COLUMN_MAP[normalized];
    } else {
      // Tentar match parcial
      for (const [key, value] of Object.entries(COLUMN_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          headerMapping[header] = value;
          break;
        }
      }
    }
  }
  
  log(`Mapeamento de colunas: ${JSON.stringify(headerMapping, null, 2)}`);
  
  // Processar dados
  const dados = [];
  for (const row of rawData) {
    const rowData = {};
    let temDados = false;
    
    for (const [originalHeader, mappedHeader] of Object.entries(headerMapping)) {
      let value = row[originalHeader];
      
      // Processar valores especiais
      if (mappedHeader.includes('Data')) {
        value = parseExcelDate(value);
      } else if (mappedHeader === 'Valor') {
        value = parseMoneyValue(value);
      } else if (mappedHeader === 'Dia Vencimento Veiculo' || mappedHeader.includes('Dias')) {
        value = parseInt(String(value)) || null;
      } else {
        value = value ? String(value).trim() : null;
      }
      
      if (value !== null && value !== '') {
        rowData[mappedHeader] = value;
        temDados = true;
      }
    }
    
    // Só adicionar se tem dados válidos (pelo menos Nome ou Placas)
    if (temDados && (rowData['Nome'] || rowData['Placas'])) {
      dados.push(rowData);
    }
  }
  
  log(`Registros válidos processados: ${dados.length}`);
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
  const context = await browser.newContext({
    // Importante: sem isso o Playwright pode não emitir evento de download em alguns ambientes
    acceptDownloads: true,
  });
  const page = await context.newPage();
  
  try {
    // 1. Acessar página de login com retry
    log('Acessando portal Hinova...');
    let navegacaoOk = false;
    for (let tentativa = 1; tentativa <= 3 && !navegacaoOk; tentativa++) {
      try {
        log(`Tentativa ${tentativa} de acessar portal...`);
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
    
    // Esperar formulário de login carregar
    log('Aguardando formulário de login...');
    await page.waitForTimeout(3000);
    try {
      await page.waitForSelector('input[placeholder="Usuário"], input[type="password"]', {
        timeout: 30000
      });
      log('Formulário de login carregado');
    } catch {
      log('Aviso: Não encontrou campos de login pelo seletor padrão, continuando...');
    }
    
    // 1.1 Fechar qualquer popup/modal que aparecer
    await fecharPopups(page);
    
    
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
    const resultado = await page.evaluate(({ usuario, senha }) => {
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
    }, { usuario: CONFIG.HINOVA_USER, senha: CONFIG.HINOVA_PASS });
    
    resultado.logs.forEach(l => log(l));
    log(`Valores finais: Código=${resultado.valores.codigo}, Usuário=${resultado.valores.usuario}, Senha=${resultado.valores.senhaLen} chars`);
    
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'debug_campos_preenchidos.png' });
    
    // Helper: dispensar/validar o campo "Código de autenticação".
    // Na prática, o portal às vezes só libera o login após:
    // 1) clicar em Entrar (primeira validação)
    // 2) focar/desfocar o campo de autenticação (dispensar)
    // 3) clicar em Entrar novamente
    const dispensarCodigoAutenticacao = async () => {
      try {
        const selector =
          'input[placeholder*="Autenticação"], input[placeholder*="autenticação"], input[placeholder*="Código de Autenticação"], input[placeholder*="código de autenticação"]';

        const campoAuth = await page.$(selector);
        if (!campoAuth) return false;

        // Garantir que está vazio (se o portal inseriu algo automaticamente)
        await campoAuth
          .evaluate((el) => {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })
          .catch(() => {});

        // Foco e blur para o portal "entender" que o campo ficou vazio
        await campoAuth.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);

        // Clicar fora (e ESC) ajuda em alguns fluxos (validação/fechamento de hint)
        await page.click('body', { position: { x: 20, y: 20 }, force: true }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);

        log('Dispensa do código de autenticação executada (foco/blur no campo)');
        return true;
      } catch (e) {
        log(`Erro ao dispensar código de autenticação: ${e.message}`);
        return false;
      }
    };

    // Clicar no botão Entrar - com retry até realmente sair da tela de login
    let loginSucesso = false;

    const MAX_TENTATIVAS = Number(process.env.HINOVA_LOGIN_MAX_TENTATIVAS || '20');
    const ESPERA_POR_TENTATIVA_MS = Number(process.env.HINOVA_LOGIN_ESPERA_MS || '8000');

    const isAindaNaLogin = async () => {
      // Heurística principal: quando o menu aparece, o login já aconteceu
      const relatorioVisible = await page
        .locator('text=Relatório')
        .first()
        .isVisible()
        .catch(() => false);
      if (relatorioVisible) return false;

      // Heurística de tela de login: textos do formulário
      const esqueceuVisible = await page
        .locator('text=Esqueci minha senha')
        .first()
        .isVisible()
        .catch(() => false);
      const codigoClienteVisible = await page
        .locator('text=Código cliente')
        .first()
        .isVisible()
        .catch(() => false);
      if (esqueceuVisible || codigoClienteVisible) return true;

      // Fallback: visibilidade do campo senha e/ou URL parecendo login
      const pwdVisible = await page
        .locator('input[type="password"]')
        .first()
        .isVisible()
        .catch(() => false);

      const url = page.url?.() || '';
      const urlPareceLogin = /login/i.test(url);

      return pwdVisible || urlPareceLogin;
    };

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      log(`Tentativa ${tentativa}/${MAX_TENTATIVAS} - Clicando no botão Entrar...`);

      try {
        const btnSelector = 'button:has-text("Entrar"), input[value="Entrar"], .btn-primary, button.btn, #btn-login';

        const clicarEntrar = async () => {
          const btnEntrar = await page.$(btnSelector);

          if (btnEntrar) {
            // 1) Clique via JS (bypass de overlay)
            await btnEntrar.evaluate((el) => el.click()).catch(() => {});
            // 2) Clique forçado Playwright
            await btnEntrar.click({ force: true }).catch(() => {});
          } else {
            await page.click('button:has-text("Entrar")', { force: true, timeout: 1000 }).catch(() => {});
          }
        };

        // Muitos logins na Hinova só completam após 2 cliques no botão.
        // 1) Primeiro clique: valida credenciais e "marca" a dispensa do código
        await clicarEntrar();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null),
          page.waitForTimeout(1500),
        ]);

        // 2) Dispensar (foco/blur) do campo de autenticação (quando aplicável)
        await dispensarCodigoAutenticacao();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => null),
          page.waitForTimeout(1200),
        ]);

        // 3) Segundo clique: efetiva o login
        await clicarEntrar();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => null),
          page.waitForTimeout(1200),
        ]);

        // 4) Enter como fallback final
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
    
    // Fechar qualquer popup que apareça após login
    await fecharPopups(page);
    
    
    log('Login realizado com sucesso!');
    
    // 3. Navegar DIRETAMENTE para a página de Relatório de Boletos (evita cliques em menu lento)
    log('Navegando diretamente para Relatório de Boletos...');
    
    // Fechar popups antes de navegar
    await fecharPopups(page);
    
    // Navegar diretamente para a URL do relatório
    await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
      waitUntil: 'domcontentloaded',
      timeout: 90000  // Timeout maior para site lento
    });
    
    // Aguardar carregamento (site é lento)
    log('Aguardando página de relatório carregar (site lento)...');
    await page.waitForTimeout(5000);
    
    // Fechar popups que aparecerem após navegação
    await fecharPopups(page);
    
    // Aguardar mais se necessário
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {
      log('NetworkIdle timeout - continuando...');
    });
    
    // Fechar popups novamente
    await fecharPopups(page);
    
    log('Página de relatório aberta!');
    
    // 4. Preencher filtros conforme instruções
    log('Preenchendo filtros...');
    log(`Data Vencimento Original: ${inicio} até ${fim}`);
    
    // Data Vencimento Original - Início (dia 01 do mês atual)
    const dataInicioInput = await page.$('input[name*="data_inicio"], input[name*="vencimento_inicial"], input[name*="dt_vencimento_original_ini"]');
    if (dataInicioInput) {
      await dataInicioInput.fill('');
      await dataInicioInput.fill(inicio);
      log(`Data início preenchida: ${inicio}`);
    }
    
    // Data Vencimento Original - Fim (último dia do mês atual)
    const dataFimInput = await page.$('input[name*="data_fim"], input[name*="vencimento_final"], input[name*="dt_vencimento_original_fim"]');
    if (dataFimInput) {
      await dataFimInput.fill('');
      await dataFimInput.fill(fim);
      log(`Data fim preenchida: ${fim}`);
    }
    
    // ============================================
    // SEÇÃO: BOLETOS ANTERIORES (conforme imagem de referência)
    // ============================================
    
    // 1) Boletos Anteriores - Selecionar "NÃO POSSUI"
    log('Configurando Boletos Anteriores: NÃO POSSUI...');
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        // Procurar pelo select de "Boletos Anteriores"
        const parent = select.closest('tr, div, td');
        const parentText = parent?.textContent?.toLowerCase() || '';
        const options = Array.from(select.querySelectorAll('option'));
        
        if (parentText.includes('boletos anteriores') || parentText.includes('boleto anterior')) {
          for (const option of options) {
            const texto = option.textContent?.toUpperCase().trim() || '';
            if (texto === 'NÃO POSSUI' || texto === 'NAO POSSUI') {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              console.log('Boletos Anteriores: NÃO POSSUI selecionado');
              break;
            }
          }
        }
      }
    });
    log('Boletos Anteriores configurado!');
    
    // 2) Referência - Selecionar "VENCIMENTO ORIGINAL"
    log('Configurando Referência: VENCIMENTO ORIGINAL...');
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const parent = select.closest('tr, div, td');
        const parentText = parent?.textContent?.toLowerCase() || '';
        const options = Array.from(select.querySelectorAll('option'));
        
        // Procurar pelo select de "Referência"
        if (parentText.includes('referência') || parentText.includes('referencia')) {
          for (const option of options) {
            const texto = option.textContent?.toUpperCase().trim() || '';
            if (texto === 'VENCIMENTO ORIGINAL' || texto.includes('VENCIMENTO ORIGINAL')) {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              console.log('Referência: VENCIMENTO ORIGINAL selecionado');
              break;
            }
          }
        }
      }
    });
    log('Referência configurado!');
    
    // Aguardar possível reload de opções
    await page.waitForTimeout(1000);
    
    // 3) Situação Boleto - Desmarcar TODOS, marcar SOMENTE "ABERTO"
    log('Configurando Situação Boleto: somente ABERTO...');
    await page.evaluate(() => {
      // Primeiro desmarcar checkbox "TODOS" se existir
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      
      for (const cb of checkboxes) {
        const label = cb.closest('label') || cb.parentElement;
        const labelText = label?.textContent?.trim().toUpperCase() || '';
        const value = cb.value?.toUpperCase() || '';
        
        // Verificar se está na seção de Situação Boleto
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          if (labelText === 'TODOS' || value === 'TODOS') {
            // Desmarcar "TODOS"
            if (cb.checked) {
              cb.click();
              console.log('Desmarcado: TODOS');
            }
          }
        }
      }
    });
    
    await page.waitForTimeout(500);
    
    // Agora desmarcar todos os outros e marcar apenas ABERTO
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      
      for (const cb of checkboxes) {
        const label = cb.closest('label') || cb.parentElement;
        const labelText = label?.textContent?.trim().toUpperCase() || '';
        const value = cb.value?.toUpperCase() || '';
        
        // Verificar se está na seção de Situação Boleto
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          const isAberto = labelText === 'ABERTO' || value === 'ABERTO';
          
          if (isAberto) {
            // Marcar ABERTO
            if (!cb.checked) {
              cb.click();
              console.log('Marcado: ABERTO');
            }
          } else if (labelText !== 'TODOS' && value !== 'TODOS') {
            // Desmarcar todos os outros (exceto TODOS que já tratamos)
            if (cb.checked) {
              cb.click();
              console.log('Desmarcado: ' + (labelText || value));
            }
          }
        }
      }
    });
    log('Situação Boleto: somente ABERTO marcado!');
    
    // ============================================
    // FIM SEÇÃO BOLETOS ANTERIORES
    // ============================================
    
    // Dados Visualizados - Selecionar layout "BI - Vangard Cobrança"
    log('Configurando layout...');
    const layoutSelect = await page.$('select[name*="layout"], select[name*="visualiza"], select[name*="dados_visualizados"]');
    if (layoutSelect) {
      await layoutSelect.selectOption({ label: 'BI - Vangard Cobrança' }).catch(async () => {
        // Tentar variações do nome
        await layoutSelect.selectOption({ label: 'BI - Vangard' }).catch(() => {});
      });
      log('Layout: BI - Vangard Cobrança');
    }
    
    // NOVO: Forma de Exibição - Selecionar "Em Excel"
    log('Configurando forma de exibição para Excel...');
    const formaExibicaoSelect = await page.$('select[name*="forma_exibicao"], select[name*="exibicao"], select[name*="formato"]');
    if (formaExibicaoSelect) {
      await formaExibicaoSelect.selectOption({ label: 'Em Excel' }).catch(async () => {
        await formaExibicaoSelect.selectOption({ value: 'excel' }).catch(async () => {
          await formaExibicaoSelect.selectOption({ label: 'Excel' }).catch(() => {});
        });
      });
      log('Forma de exibição: Em Excel');
    } else {
      // Tentar via JavaScript se não encontrar o select
      await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        for (const select of selects) {
          const options = select.querySelectorAll('option');
          for (const option of options) {
            const texto = option.textContent?.toLowerCase() || '';
            if (texto.includes('excel') || texto === 'em excel') {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        return false;
      });
      log('Forma de exibição configurada via JS');
    }
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'debug_filtros.png' });
    log('Filtros preenchidos!');
    
    // 5. Configurar download de arquivo
    log('Configurando download...');
    const downloadPath = path.resolve('./downloads');
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }
    
    // Configurações de timeout para download
    // - O evento de download deve aparecer rápido (mesmo que o arquivo demore para salvar)
    // - O salvamento pode demorar (arquivo grande / portal lento)
    const DOWNLOAD_EVENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos para o evento de download aparecer
    const DOWNLOAD_SAVE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutos para salvar o arquivo (pior caso)
    const DOWNLOAD_CHECK_INTERVAL_MS = 10000; // Verificar a cada 10 segundos
    const MAX_DOWNLOAD_RETRIES = 3;
    
    let dados = [];
    let nomeArquivoFinal = '';
    let downloadSucesso = false;
    
    for (let tentativaDownload = 1; tentativaDownload <= MAX_DOWNLOAD_RETRIES && !downloadSucesso; tentativaDownload++) {
      log(`Tentativa de download ${tentativaDownload}/${MAX_DOWNLOAD_RETRIES}...`);
      
      try {
        // ============================================
        // CORREÇÃO: O portal Hinova abre uma NOVA ABA após clicar em "Gerar"
        // O download acontece nessa nova aba, não na página original
        // ============================================
        
        // 6. Gerar relatório (vai abrir nova aba e baixar Excel)
        log('Clicando em Gerar relatório Excel...');
        
        // Tentar diferentes seletores para o botão Gerar
        const botoesGerar = [
          'input[type="submit"][value*="Gerar"]',
          'button:has-text("Gerar")',
          'input[type="button"][value*="Gerar"]',
          '.btn-gerar',
          'input[value="Gerar"]',
          'input[value="Gerar Relatório"]',
          'button:has-text("Gerar Relatório")',
        ];
        
        // Promises precisam ser criadas ANTES do clique para não perder eventos rápidos
        // - download: pode iniciar na nova aba instantaneamente
        // - page: Hinova abre uma nova aba (geraRelatorioBoleto.php)
        // Capturar o PRIMEIRO download após o clique.
        // IMPORTANTE: o Hinova às vezes sugere um filename sem extensão/"relatorio".
        // Se colocarmos predicate, podemos perder o evento e ficar esperando para sempre.
        const downloadPromise = context.waitForEvent('download', {
          timeout: DOWNLOAD_EVENT_TIMEOUT_MS,
        });

        // Log rápido caso o evento dispare (ajuda a ver o filename real no Actions)
        context.once('download', (d) => {
          try {
            log(`📥 Evento de download detectado: ${d.suggestedFilename()}`);
          } catch {
            log('📥 Evento de download detectado');
          }
        });

        // Não aguardamos aqui para não bloquear; é só para debug/screenshot e tentativa de “desencadear” download
        const newPagePromise = context
          .waitForEvent('page', { timeout: 60000 })
          .then(async (newPage) => {
            try {
              await newPage.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
              log(`Nova aba detectada: ${newPage.url() || 'carregando...'}`);
              await newPage.screenshot({ path: 'debug_nova_aba.png' }).catch(() => {});

              // Em alguns cenários o Hinova abre a aba e só então “dispara” o download via botão/link.
              await fecharPopups(newPage).catch(() => {});

              const seletoresDisparoDownload = [
                'a[href*=".xlsx"]',
                'a[href*=".xls"]',
                'a[href*="xlsx"]',
                'a[href*="xls"]',
                'button:has-text("Baixar")',
                'button:has-text("Download")',
                'button:has-text("Exportar")',
                'a:has-text("Baixar")',
                'a:has-text("Download")',
                'a:has-text("Exportar")',
                'input[value*="Baixar"]',
                'input[value*="Download"]',
                'input[value*="Exportar"]',
              ];

              for (const sel of seletoresDisparoDownload) {
                try {
                  const el = await newPage.$(sel);
                  if (el && (await el.isVisible().catch(() => false))) {
                    await el.click({ force: true }).catch(() => {});
                    log(`Tentou disparar download na nova aba via: ${sel}`);
                    break;
                  }
                } catch {
                  // ignore
                }
              }
            } catch {}
            return newPage;
          })
          .catch(() => null);

        // Clicar no botão Gerar
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
          } catch (e) {
            // Continuar tentando
          }
        }
        
        if (!clicouBotao) {
          // Fallback via JavaScript
          await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
            for (const el of inputs) {
              const texto = (el.value || el.textContent || '').toLowerCase();
              if (texto.includes('gerar')) {
                el.click();
                return true;
              }
            }
            return false;
          });
          log('Clicou no botão via JavaScript');
        }
        
        // Monitorar o download com feedback periódico
        log('Aguardando download (pode demorar - nova aba será aberta)...');
        
        let tempoEsperado = 0;
        const monitoramentoInterval = setInterval(() => {
          tempoEsperado += DOWNLOAD_CHECK_INTERVAL_MS;
          const minutos = Math.floor(tempoEsperado / 60000);
          const segundos = Math.floor((tempoEsperado % 60000) / 1000);
          log(`⏳ Aguardando download... ${minutos}m ${segundos}s`);
        }, DOWNLOAD_CHECK_INTERVAL_MS);
        
        try {
          // Aguardar download (independente da aba que iniciou)
          const download = await downloadPromise;
          clearInterval(monitoramentoInterval);

          const suggested = (typeof download.suggestedFilename === 'function'
            ? download.suggestedFilename()
            : '') || '';

          const suggestedLower = suggested.toLowerCase();
          const suggestedOk = suggestedLower.endsWith('.xlsx') || suggestedLower.endsWith('.xls');

          nomeArquivoFinal = suggestedOk
            ? suggested
            : `Hinova_${fim.replace(/\//g, '-')}.xlsx`;
          const filePath = path.join(downloadPath, nomeArquivoFinal);
          
          log(`✅ Download capturado: ${nomeArquivoFinal}`);
          
          // Monitorar o progresso do salvamento
          log('Salvando arquivo (pode demorar para arquivos grandes)...');
          const saveStartTime = Date.now();
          
          await Promise.race([
            download.saveAs(filePath),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Timeout ao salvar o arquivo baixado')),
                DOWNLOAD_SAVE_TIMEOUT_MS
              )
            ),
          ]);
          
          const saveEndTime = Date.now();
          const saveDuration = Math.round((saveEndTime - saveStartTime) / 1000);
          log(`✅ Arquivo salvo em ${saveDuration}s: ${filePath}`);
          
          // Verificar se o arquivo foi salvo corretamente
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            log(`Tamanho do arquivo: ${(stats.size / 1024).toFixed(2)} KB`);
            
            if (stats.size < 100) {
              log('⚠️ Arquivo muito pequeno, pode estar vazio ou com erro');
              throw new Error('Arquivo baixado está vazio ou corrompido');
            }
            
            // Processar Excel
            dados = processarExcel(filePath);
            
            // Limpar arquivo após processar
            try {
              fs.unlinkSync(filePath);
              log('Arquivo temporário removido');
            } catch (e) {
              log('Aviso: não foi possível remover arquivo temporário');
            }
            
            downloadSucesso = true;
            
            // Fechar novas abas abertas
            const pages = context.pages();
            for (const p of pages) {
              if (p !== page) {
                await p.close().catch(() => {});
                log('Nova aba fechada');
              }
            }
            
          } else {
            throw new Error('Arquivo não foi salvo corretamente');
          }
          
        } catch (downloadError) {
          clearInterval(monitoramentoInterval);
          throw downloadError;
        }
        
      } catch (downloadError) {
        log(`❌ Erro no download (tentativa ${tentativaDownload}): ${downloadError.message}`);
        
        if (tentativaDownload < MAX_DOWNLOAD_RETRIES) {
          log('Aguardando antes de tentar novamente...');
          await page.waitForTimeout(5000);
          
          // Tirar screenshot para debug
          await page.screenshot({ path: `debug_download_retry_${tentativaDownload}.png` });
          
          // Fechar popups que possam ter aparecido
          await fecharPopups(page);
          
          // Recarregar a página e preencher filtros novamente se necessário
          log('Verificando estado da página...');
          const urlAtual = page.url();
          if (!urlAtual.includes('relatorioBoleto')) {
            log('Página mudou, recarregando relatório...');
            await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
              waitUntil: 'domcontentloaded',
              timeout: 90000
            });
            await fecharPopups(page);
            await page.waitForTimeout(3000);
            
            // Re-preencher filtros básicos
            const dataInicioInput = await page.$('input[name*="data_inicio"], input[name*="vencimento_inicial"], input[name*="dt_vencimento_original_ini"]');
            if (dataInicioInput) await dataInicioInput.fill(inicio);
            
            const dataFimInput = await page.$('input[name*="data_fim"], input[name*="vencimento_final"], input[name*="dt_vencimento_original_fim"]');
            if (dataFimInput) await dataFimInput.fill(fim);
          }
        }
      }
    }
    
    if (!downloadSucesso) {
      log('❌ Download falhou após todas as tentativas');
      await page.screenshot({ path: 'debug_apos_gerar.png' });
      
      // Fallback: tentar extrair da tabela HTML se Excel falhar
      log('AVISO: Download de Excel falhou. Verifique os screenshots para debug.');
      return false;
    }
    
    log(`Total de registros processados: ${dados.length}`);
    
    if (dados.length === 0) {
      log('AVISO: Nenhum dado encontrado no Excel!');
      await page.screenshot({ path: 'debug_hinova.png' });
      return false;
    }
    
    // 7. Enviar para webhook
    const nomeArquivo = nomeArquivoFinal || `Hinova_Boletos_${fim.replace(/\//g, '-')}.xlsx`;
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
