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

// Colunas esperadas do layout "BI - Vangard Cobrança" (baseado na imagem)
const COLUNAS_TABELA = [
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

/**
 * Converte data DD/MM/YYYY para YYYY-MM-DD
 */
function parseDate(value) {
  if (!value) return null;
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
 * Extrai dados de uma tabela HTML via scraping
 */
async function extrairDadosTabela(page) {
  log('Extraindo dados da tabela HTML...');

  // Tentar aguardar pelo menos alguma tabela aparecer (pode estar dentro de iframe)
  await page.waitForTimeout(1500);

  // Screenshot para debug (não pode quebrar o robô)
  await page
    .screenshot({ path: 'debug_tabela.png', fullPage: true, timeout: 120000, animations: 'disabled' })
    .catch(() => {});

  /**
   * Extrai linhas de uma tabela no contexto (documento) atual.
   * Retorna um objeto com score e dados, para escolher a melhor tabela.
   */
  const extrairDoContexto = async (ctx) => {
    try {
      return await ctx.evaluate((colunasEsperadas) => {
        const normalize = (s) =>
          String(s || '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        const expected = colunasEsperadas.map(normalize);

        const getHeaders = (table) => {
          const thead = table.querySelector('thead');
          const headerRow = thead?.querySelector('tr') || table.querySelector('tr');
          if (!headerRow) return [];
          return Array.from(headerRow.querySelectorAll('th, td')).map((c) => (c.textContent || '').trim());
        };

        const looksLikeHeaderRow = (cellsText) => {
          const norm = cellsText.map(normalize);
          const matched = expected.filter((e) => norm.some((h) => h === e || h.includes(e) || e.includes(h))).length;
          return matched >= Math.min(3, expected.length);
        };

        const getDataRows = (table, headers) => {
          const tbody = table.querySelector('tbody');
          let rows = Array.from((tbody || table).querySelectorAll('tr'));

          if (!rows.length) return [];

          // Remover possíveis linhas de cabeçalho (primeira linha)
          const firstRowCells = Array.from(rows[0].querySelectorAll('th, td'));
          const firstRowText = firstRowCells.map((c) => (c.textContent || '').trim());
          const hasTH = rows[0].querySelectorAll('th').length > 0;
          if (hasTH || looksLikeHeaderRow(firstRowText)) {
            rows = rows.slice(1);
          }

          // Remover linhas vazias ou de mensagem
          rows = rows.filter((r) => {
            const t = normalize(r.textContent || '');
            if (!t) return false;
            if (t.includes('nenhum') && (t.includes('registro') || t.includes('resultado'))) return false;
            return true;
          });

          return rows;
        };

        const tables = Array.from(document.querySelectorAll('table'));
        if (!tables.length) {
          return {
            score: 0,
            tableIndex: -1,
            headers: [],
            rows: [],
            debug: { tables: 0 },
          };
        }

        // Escolher a melhor tabela por score de colunas + volume
        let best = {
          score: -1,
          tableIndex: -1,
          headers: [],
          rows: [],
          debug: { tables: tables.length },
        };

        for (let i = 0; i < tables.length; i++) {
          const table = tables[i];
          const headers = getHeaders(table);
          const headersNorm = headers.map(normalize);

          const matched = expected.filter((e) => headersNorm.some((h) => h === e || h.includes(e) || e.includes(h))).length;

          const dataRows = getDataRows(table, headers);
          const colCount = headers.length || (dataRows[0]?.querySelectorAll('td').length || 0);

          // Score prioriza match de colunas, depois quantidade de linhas
          const score = matched * 1000 + dataRows.length * 10 + colCount;

          if (score > best.score) {
            best = {
              score,
              tableIndex: i,
              headers,
              rows: dataRows.map((row) => {
                const cells = Array.from(row.querySelectorAll('td'));
                const obj = {};
                cells.forEach((cell, idx) => {
                  const key = headers[idx] || `col_${idx}`;
                  obj[key] = (cell.textContent || '').trim();
                });
                return obj;
              }),
              debug: {
                tables: tables.length,
                matched,
                dataRows: dataRows.length,
                colCount,
              },
            };
          }
        }

        return best;
      }, COLUNAS_TABELA);
    } catch (e) {
      return null;
    }
  };

  // Importante: alguns relatórios abrem dentro de iframe, então buscamos em todos os frames
  const tentarExtrair = async () => {
    const frames = page.frames();
    const contexts = [page.mainFrame(), ...frames.filter((f) => f !== page.mainFrame())];

    log(`Frames detectados: ${contexts.length}`);

    let melhor = { score: -1, rows: [], headers: [], debug: {}, frameUrl: page.url() };

    for (const frame of contexts) {
      const result = await extrairDoContexto(frame);
      const frameUrl = frame.url();

      if (result?.rows?.length) {
        log(`Tabela candidata em frame: ${frameUrl} | linhas=${result.rows.length} | score=${result.score} | matched=${result.debug?.matched ?? 0}`);
      }

      if (result && result.score > melhor.score) {
        melhor = { ...result, frameUrl };
      }
    }

    return melhor;
  };

  // Polling: o Hinova às vezes renderiza a tabela depois
  const deadline = Date.now() + 120000;
  let melhorTabela = await tentarExtrair();

  while (Date.now() < deadline && (!melhorTabela?.rows || melhorTabela.rows.length === 0)) {
    await page.waitForTimeout(2500);
    melhorTabela = await tentarExtrair();
  }

  const dadosBrutos = melhorTabela?.rows || [];

  log(`Total de linhas brutas extraídas: ${dadosBrutos.length}`);
  if (melhorTabela?.frameUrl) log(`Fonte selecionada: ${melhorTabela.frameUrl} | score=${melhorTabela.score}`);

  if (dadosBrutos.length === 0) {
    log('AVISO: Nenhum dado encontrado na tabela!');
    return [];
  }

  // Log das colunas encontradas
  if (dadosBrutos.length > 0) {
    log(`Colunas encontradas: ${Object.keys(dadosBrutos[0]).join(', ')}`);
  }

  // Mapear e normalizar os dados
  const dados = dadosBrutos.map((row) => {
    const normalized = {};

    // Mapeamento de colunas para nomes padronizados
    const mapping = {
      'data pagamento': 'Data Pagamento',
      'data vencimento original': 'Data Vencimento Original',
      'dia vencimento veiculo': 'Dia Vencimento Veiculo',
      'dia vencimento veículo': 'Dia Vencimento Veiculo',
      'regional boleto': 'Regional Boleto',
      regional: 'Regional Boleto',
      cooperativa: 'Cooperativa',
      'voluntário': 'Voluntário',
      voluntario: 'Voluntário',
      nome: 'Nome',
      placas: 'Placas',
      placa: 'Placas',
      valor: 'Valor',
      'data vencimento': 'Data Vencimento',
      vencimento: 'Data Vencimento',
      'qtde dias em atraso vencimento original': 'Qtde Dias em Atraso Vencimento Original',
      'dias atraso': 'Qtde Dias em Atraso Vencimento Original',
      situacao: 'Situacao',
      'situação': 'Situacao',
    };

    for (const [key, value] of Object.entries(row)) {
      const keyLower = key.toLowerCase().trim();
      const mappedKey = mapping[keyLower] || key;

      // Processar valores especiais
      let processedValue = value;

      if (mappedKey.includes('Data')) {
        processedValue = parseDate(value);
      } else if (mappedKey === 'Valor') {
        processedValue = parseMoneyValue(value);
      } else if (mappedKey === 'Dia Vencimento Veiculo' || mappedKey.includes('Dias')) {
        processedValue = parseInt(String(value), 10);
        if (Number.isNaN(processedValue)) processedValue = null;
      } else {
        processedValue = value ? String(value).trim() : null;
      }

      if (processedValue !== null && processedValue !== '') {
        normalized[mappedKey] = processedValue;
      }
    }

    return normalized;
  });

  // Filtrar registros válidos (deve ter Nome ou Placas)
  const dadosValidos = dados.filter((row) => row['Nome'] || row['Placas']);

  log(`Registros válidos processados: ${dadosValidos.length}`);
  return dadosValidos;
}

/**
 * Verifica se há paginação e extrai dados de todas as páginas
 */
async function extrairTodasPaginas(page) {
  let todosOsDados = [];
  let paginaAtual = 1;
  
  // Extrair primeira página
  const dadosPrimeiraPagina = await extrairDadosTabela(page);
  todosOsDados = todosOsDados.concat(dadosPrimeiraPagina);
  
  // Verificar se há paginação
  const temPaginacao = await page.evaluate(() => {
    const seletoresPaginacao = [
      'a:has-text("Próxima")',
      'a:has-text("Próximo")',
      'a:has-text(">")',
      '.pagination .next',
      '[rel="next"]',
      'button:has-text("Próxima")',
    ];
    
    for (const sel of seletoresPaginacao) {
      try {
        const el = document.querySelector(sel);
        if (el && window.getComputedStyle(el).display !== 'none') {
          return sel;
        }
      } catch {}
    }
    return null;
  });
  
  if (temPaginacao) {
    log(`Paginação detectada, extraindo mais páginas...`);
    
    // Limite de segurança para evitar loop infinito
    const MAX_PAGINAS = 100;
    
    while (paginaAtual < MAX_PAGINAS) {
      try {
        // Tentar clicar no botão próxima página
        const clicouProxima = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el && !el.classList.contains('disabled') && !el.hasAttribute('disabled')) {
            el.click();
            return true;
          }
          return false;
        }, temPaginacao);
        
        if (!clicouProxima) {
          log(`Fim da paginação na página ${paginaAtual}`);
          break;
        }
        
        paginaAtual++;
        
        // Aguardar carregamento
        await page.waitForTimeout(2000);
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        
        // Extrair dados da página atual
        const dadosPagina = await extrairDadosTabela(page);
        if (dadosPagina.length === 0) {
          log(`Página ${paginaAtual} vazia, encerrando`);
          break;
        }
        
        todosOsDados = todosOsDados.concat(dadosPagina);
        log(`Página ${paginaAtual}: +${dadosPagina.length} registros (total: ${todosOsDados.length})`);
        
      } catch (e) {
        log(`Erro na paginação: ${e.message}`);
        break;
      }
    }
  }
  
  return todosOsDados;
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
    throw new Error('HINOVA_USER e HINOVA_PASS são obrigatórios (configure como secrets/variáveis de ambiente)');
  }
  if (!CONFIG.WEBHOOK_URL) {
    throw new Error('WEBHOOK_URL é obrigatório (configure como secret/variável de ambiente)');
  }

  log('='.repeat(50));
  log('INICIANDO ROBÔ DE COBRANÇA HINOVA');
  log('Modo: SCRAPING DE TABELA HTML');
  log('='.repeat(50));
  
  const { inicio, fim } = getDateRange();
  log(`Período: ${inicio} até ${fim}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
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
    
    // Fechar qualquer popup/modal que aparecer
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
    const dispensarCodigoAutenticacao = async () => {
      try {
        const selector =
          'input[placeholder*="Autenticação"], input[placeholder*="autenticação"], input[placeholder*="Código de Autenticação"], input[placeholder*="código de autenticação"]';

        const campoAuth = await page.$(selector);
        if (!campoAuth) return false;

        // Garantir que está vazio
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

        // Clicar fora e ESC
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

      // Heurística de tela de login
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

        // Primeiro clique
        await clicarEntrar();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => null),
          page.waitForTimeout(1500),
        ]);

        // Dispensar código de autenticação
        await dispensarCodigoAutenticacao();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => null),
          page.waitForTimeout(1200),
        ]);

        // Segundo clique
        await clicarEntrar();
        await Promise.race([
          page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => null),
          page.waitForTimeout(1200),
        ]);

        // Enter como fallback
        await page.keyboard.press('Enter').catch(() => {});

        // Aguardar reação
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

        // Verificar mensagem de erro
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
    
    // Fechar popups após login
    await fecharPopups(page);
    log('Login realizado com sucesso!');
    
    // 3. Navegar DIRETAMENTE para a página de Relatório de Boletos
    log('Navegando diretamente para Relatório de Boletos...');
    await fecharPopups(page);
    
    await page.goto(CONFIG.HINOVA_RELATORIO_URL, { 
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    
    log('Aguardando página de relatório carregar (site lento)...');
    await page.waitForTimeout(5000);
    await fecharPopups(page);
    
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {
      log('NetworkIdle timeout - continuando...');
    });
    await fecharPopups(page);
    log('Página de relatório aberta!');
    
    // 4. Preencher filtros conforme instruções
    log('Preenchendo filtros...');
    log(`Data Vencimento Original: ${inicio} até ${fim}`);
    
    // Data Vencimento Original - Início
    const dataInicioInput = await page.$('input[name*="data_inicio"], input[name*="vencimento_inicial"], input[name*="dt_vencimento_original_ini"]');
    if (dataInicioInput) {
      await dataInicioInput.fill('');
      await dataInicioInput.fill(inicio);
      log(`Data início preenchida: ${inicio}`);
    }
    
    // Data Vencimento Original - Fim
    const dataFimInput = await page.$('input[name*="data_fim"], input[name*="vencimento_final"], input[name*="dt_vencimento_original_fim"]');
    if (dataFimInput) {
      await dataFimInput.fill('');
      await dataFimInput.fill(fim);
      log(`Data fim preenchida: ${fim}`);
    }
    
    // Boletos Anteriores - Selecionar "NÃO POSSUI"
    log('Configurando Boletos Anteriores: NÃO POSSUI...');
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
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
    
    // Referência - Selecionar "VENCIMENTO ORIGINAL"
    log('Configurando Referência: VENCIMENTO ORIGINAL...');
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const parent = select.closest('tr, div, td');
        const parentText = parent?.textContent?.toLowerCase() || '';
        const options = Array.from(select.querySelectorAll('option'));
        
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
    
    await page.waitForTimeout(1000);
    
    // Situação Boleto - Desmarcar TODOS, marcar SOMENTE "ABERTO"
    log('Configurando Situação Boleto: somente ABERTO...');
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      
      for (const cb of checkboxes) {
        const label = cb.closest('label') || cb.parentElement;
        const labelText = label?.textContent?.trim().toUpperCase() || '';
        const value = cb.value?.toUpperCase() || '';
        
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          if (labelText === 'TODOS' || value === 'TODOS') {
            if (cb.checked) {
              cb.click();
              console.log('Desmarcado: TODOS');
            }
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
        const value = cb.value?.toUpperCase() || '';
        
        const section = cb.closest('tr, div, fieldset');
        const sectionText = section?.textContent?.toLowerCase() || '';
        
        if (sectionText.includes('situação boleto') || sectionText.includes('situacao boleto')) {
          const isAberto = labelText === 'ABERTO' || value === 'ABERTO';
          
          if (isAberto) {
            if (!cb.checked) {
              cb.click();
              console.log('Marcado: ABERTO');
            }
          } else if (labelText !== 'TODOS' && value !== 'TODOS') {
            if (cb.checked) {
              cb.click();
              console.log('Desmarcado: ' + (labelText || value));
            }
          }
        }
      }
    });
    log('Situação Boleto: somente ABERTO marcado!');
    
    // Layout "BI - Vangard Cobrança"
    log('Configurando layout...');
    const layoutSelect = await page.$('select[name*="layout"], select[name*="visualiza"], select[name*="dados_visualizados"]');
    if (layoutSelect) {
      await layoutSelect.selectOption({ label: 'BI - Vangard Cobrança' }).catch(async () => {
        await layoutSelect.selectOption({ label: 'BI - Vangard' }).catch(() => {});
      });
      log('Layout: BI - Vangard Cobrança');
    }
    
    // ========================================
    // FORMA DE EXIBIÇÃO: "EM TELA" (NOVO!)
    // ========================================
    log('Configurando forma de exibição para EM TELA...');
    
    const formaExibicaoSelect = await page.$('select[name*="forma_exibicao"], select[name*="exibicao"], select[name*="formato"]');
    if (formaExibicaoSelect) {
      // Tentar selecionar "Em Tela"
      await formaExibicaoSelect.selectOption({ label: 'Em Tela' }).catch(async () => {
        log('Não conseguiu selecionar "Em Tela" por label, tentando por valor...');
      });
      log('Forma de exibição: Em Tela');
    } else {
      // Tentar via JavaScript
      await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        for (const select of selects) {
          const options = Array.from(select.querySelectorAll('option'));
          for (const option of options) {
            const texto = option.textContent?.toLowerCase().trim() || '';
            if (texto.includes('tela') || texto === 'em tela') {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              console.log('Forma exibição: Em Tela (via JS)');
              return;
            }
          }
        }
      });
    }
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'debug_filtros.png' });
    
    // 5. Clicar em Gerar e aguardar nova aba com tabela
    log('Clicando em Gerar relatório...');
    
    const botoesGerar = [
      'input[type="submit"][value*="Gerar"]',
      'button:has-text("Gerar")',
      'input[type="button"][value*="Gerar"]',
      '.btn-gerar',
      'input[value="Gerar"]',
      'input[value="Gerar Relatório"]',
      'button:has-text("Gerar Relatório")',
    ];
    
    // Preparar para capturar nova aba
    const newPagePromise = context.waitForEvent('page', { timeout: 120000 });
    
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
    
    // Aguardar nova aba abrir
    log('Aguardando nova aba com relatório...');
    let newPage;
    try {
      newPage = await newPagePromise;
      log('Nova aba detectada!');
    } catch (e) {
      log('Nova aba não detectada, verificando se relatório carregou na mesma página...');
      newPage = page; // Usar mesma página se não abriu nova aba
    }
    
    // Aguardar carregamento da página com relatório
    log('Aguardando carregamento do relatório...');
    await newPage.waitForLoadState('domcontentloaded', { timeout: 120000 }).catch(() => {});
    await newPage.waitForTimeout(5000);
    await fecharPopups(newPage);
    
    // Tirar screenshot
    await newPage.screenshot({ path: 'debug_relatorio.png', fullPage: true }).catch(() => {});
    log(`URL do relatório: ${newPage.url()}`);
    
    // Aguardar tabela aparecer
    log('Aguardando tabela de dados...');
    await newPage.waitForSelector('table', { timeout: 120000 }).catch(() => {
      log('Tabela não encontrada pelo seletor padrão, continuando...');
    });
    
    // Aguardar mais um pouco para dados carregarem
    await newPage.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await newPage.waitForTimeout(3000);
    
    // 6. Extrair dados da tabela HTML
    log('Iniciando extração de dados...');
    const dados = await extrairTodasPaginas(newPage);
    
    log(`Total de registros extraídos: ${dados.length}`);
    
    if (dados.length === 0) {
      log('AVISO: Nenhum dado encontrado na tabela!');
      await newPage
        .screenshot({ path: 'debug_sem_dados.png', fullPage: true, timeout: 120000, animations: 'disabled' })
        .catch(() => {});
      
      // Debug: mostrar HTML da página
      const html = await newPage.content();
      fs.writeFileSync('debug_html.html', html);
      log('HTML salvo em debug_html.html para análise');
      
      return false;
    }
    
    // 7. Enviar para webhook
    const nomeArquivo = `Hinova_Boletos_${fim.replace(/\//g, '-')}_scraping.json`;
    const sucesso = await enviarWebhook(dados, nomeArquivo);
    
    // Fechar nova aba se diferente da principal
    if (newPage !== page) {
      await newPage.close().catch(() => {});
      log('Nova aba fechada');
    }
    
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
