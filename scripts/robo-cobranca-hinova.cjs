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

/**
 * Seleciona a opção "Em Excel" na seção "Forma de Exibição".
 * Usa JavaScript para localizar o input[type="radio"] correspondente,
 * marcar checked = true e disparar o evento change.
 * NÃO usa clique visual nem getByText.
 */
async function selecionarFormaExibicaoEmExcel(page) {
  log('Iniciando seleção de Forma de Exibição: Em Excel via JavaScript...');
  
  // Screenshot antes da seleção para debug
  await page.screenshot({ path: 'debug_antes_excel.png' }).catch(() => {});
  
  const tryInFrame = async (frame) => {
    const frameUrl = frame.url() || 'main';
    log(`Tentando selecionar Excel no frame: ${frameUrl}`);

    // ========================================
    // ESTRATÉGIA ÚNICA: JavaScript direto no input[type="radio"]
    // ========================================
    try {
      const result = await frame.evaluate(() => {
        // Função auxiliar para marcar radio via JavaScript
        const setRadioChecked = (radio) => {
          try {
            // Garantir que está visível e habilitado
            if (radio.disabled) return false;
            
            // Desmarcar outros radios do mesmo grupo
            if (radio.name) {
              const siblings = document.querySelectorAll(`input[type="radio"][name="${radio.name}"]`);
              siblings.forEach(r => {
                if (r !== radio && r.checked) {
                  r.checked = false;
                  r.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
            }
            
            // Marcar o radio
            radio.checked = true;
            
            // Disparar eventos para que o sistema detecte a mudança
            radio.dispatchEvent(new Event('click', { bubbles: true }));
            radio.dispatchEvent(new Event('input', { bubbles: true }));
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Também disparar evento no formulário pai, se existir
            const form = radio.closest('form');
            if (form) {
              form.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            return true;
          } catch (e) {
            console.error('Erro ao marcar radio:', e);
            return false;
          }
        };

        // Buscar todos os inputs radio
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        console.log(`Total de radios encontrados: ${radios.length}`);
        
        // Debug: listar todos os radios
        radios.forEach((r, i) => {
          const nearText = (r.closest('tr, td, div, label, p, font')?.textContent || '').trim().substring(0, 100);
          console.log(`Radio ${i}: name=${r.name}, value=${r.value}, checked=${r.checked}, nearText=${nearText}`);
        });
        
        // ESTRATÉGIA 1: Buscar radio cujo elemento próximo contém texto "Em Excel"
        for (const radio of radios) {
          // Verificar texto do elemento pai mais próximo
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
            
            // Verificar padrões de "Em Excel"
            if (/\bem\s*excel\b/i.test(text) || 
                text.includes('excel') && text.includes('em')) {
              console.log(`Encontrado radio Excel no container: ${container.tagName}, texto: ${text.substring(0, 80)}`);
              
              if (setRadioChecked(radio)) {
                console.log('✅ Radio Excel marcado com sucesso via JavaScript');
                return { success: true, method: 'nearText', radioValue: radio.value, radioName: radio.name };
              }
            }
          }
        }
        
        // ESTRATÉGIA 2: Buscar pelo valor do radio que contenha "excel"
        for (const radio of radios) {
          const value = (radio.value || '').toLowerCase();
          const name = (radio.name || '').toLowerCase();
          
          if (value.includes('excel') || name.includes('excel') || value === 'xls' || value === 'xlsx') {
            console.log(`Encontrado radio Excel por value/name: value=${radio.value}, name=${radio.name}`);
            
            if (setRadioChecked(radio)) {
              console.log('✅ Radio Excel marcado com sucesso via value/name');
              return { success: true, method: 'value', radioValue: radio.value, radioName: radio.name };
            }
          }
        }
        
        // ESTRATÉGIA 3: Buscar texto "Em Excel" na página e encontrar radio próximo
        const textElements = document.querySelectorAll('td, span, label, font, div, p, b, strong');
        for (const el of textElements) {
          const text = (el.textContent || '').trim();
          
          if (/^Em\s*Excel$/i.test(text) || /\bEm\s*Excel\b/i.test(text)) {
            console.log(`Encontrado texto "Em Excel" em: ${el.tagName}, buscando radio próximo...`);
            
            // Procurar radio na mesma linha da tabela
            const tr = el.closest('tr');
            if (tr) {
              const radio = tr.querySelector('input[type="radio"]');
              if (radio) {
                console.log(`Radio encontrado na mesma TR`);
                if (setRadioChecked(radio)) {
                  return { success: true, method: 'sameRow', radioValue: radio.value, radioName: radio.name };
                }
              }
            }
            
            // Procurar radio no elemento pai
            const parent = el.parentElement;
            if (parent) {
              const radio = parent.querySelector('input[type="radio"]');
              if (radio) {
                console.log(`Radio encontrado no parent`);
                if (setRadioChecked(radio)) {
                  return { success: true, method: 'parent', radioValue: radio.value, radioName: radio.name };
                }
              }
            }
            
            // Procurar radio em elementos irmãos
            const siblings = el.parentElement?.children || [];
            for (const sibling of siblings) {
              const radio = sibling.querySelector ? sibling.querySelector('input[type="radio"]') : null;
              if (radio) {
                console.log(`Radio encontrado em sibling`);
                if (setRadioChecked(radio)) {
                  return { success: true, method: 'sibling', radioValue: radio.value, radioName: radio.name };
                }
              }
              if (sibling.tagName === 'INPUT' && sibling.type === 'radio') {
                console.log(`Sibling é o próprio radio`);
                if (setRadioChecked(sibling)) {
                  return { success: true, method: 'sibling-direct', radioValue: sibling.value, radioName: sibling.name };
                }
              }
            }
          }
        }
        
        // ESTRATÉGIA 4: Se houver radio group de "forma exibição", selecionar o segundo (geralmente Excel)
        const formaExibicaoRadios = radios.filter(r => {
          const name = (r.name || '').toLowerCase();
          return name.includes('forma') || name.includes('exib') || name.includes('tipo') || name.includes('output');
        });
        
        if (formaExibicaoRadios.length >= 2) {
          // Normalmente: [0] = Em Tela, [1] = Em Excel
          console.log(`Grupo de forma exibição encontrado com ${formaExibicaoRadios.length} opções`);
          const excelRadio = formaExibicaoRadios[1]; // Segundo geralmente é Excel
          if (setRadioChecked(excelRadio)) {
            return { success: true, method: 'groupSecond', radioValue: excelRadio.value, radioName: excelRadio.name };
          }
        }
        
        return { success: false, totalRadios: radios.length };
      });
      
      if (result.success) {
        log(`✅ Excel selecionado via JavaScript: ${JSON.stringify(result)}`);
        await page.waitForTimeout(500);
        
        // Verificar se realmente foi marcado
        const verified = await frame.evaluate(() => {
          const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
          const checkedRadio = radios.find(r => r.checked);
          if (!checkedRadio) return { verified: false, reason: 'Nenhum radio marcado' };
          
          const nearText = (checkedRadio.closest('tr, td, div, label')?.textContent || '').toLowerCase();
          const isExcel = /\bem\s*excel\b/i.test(nearText) || 
                          nearText.includes('excel') ||
                          (checkedRadio.value || '').toLowerCase().includes('excel');
          
          return { 
            verified: isExcel, 
            checkedValue: checkedRadio.value,
            nearText: nearText.substring(0, 100)
          };
        }).catch(() => ({ verified: false }));
        
        log(`Verificação do radio: ${JSON.stringify(verified)}`);
        return verified.verified || result.success;
      }
      
      log(`JavaScript não encontrou radio Excel: ${JSON.stringify(result)}`);
      
    } catch (e) {
      log(`Erro na seleção JavaScript: ${e.message}`);
    }

    // Debug: listar todos os radios encontrados
    const radioInfo = await frame.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      return radios.map(r => ({
        name: r.name || '',
        value: r.value || '',
        id: r.id || '',
        checked: r.checked,
        parentText: (r.parentElement?.textContent || '').trim().substring(0, 50),
        nearText: (r.closest('tr, div, label')?.textContent || '').trim().substring(0, 100)
      }));
    }).catch(() => []);
    
    if (radioInfo.length > 0) {
      log(`DEBUG - Radios encontrados (${radioInfo.length}): ${JSON.stringify(radioInfo.slice(0, 5))}`);
    }

    return false;
  };

  // Tentar no frame principal primeiro
  if (await tryInFrame(page.mainFrame())) {
    log('✅ Forma de exibição Excel selecionada com sucesso (main frame)');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'debug_apos_excel.png' }).catch(() => {});
    return true;
  }

  // Tentar em iframes
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await tryInFrame(frame)) {
      log(`✅ Forma de exibição Excel selecionada com sucesso (iframe: ${frame.url()})`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'debug_apos_excel.png' }).catch(() => {});
      return true;
    }
  }

  log('⚠️ Não foi possível selecionar a opção Excel - verificar screenshots debug_antes_excel.png e debug_apos_excel.png');
  await page.screenshot({ path: 'debug_falha_excel.png' }).catch(() => {});
  return false;
}

/**
 * Fallback para casos em que o "download" não dispara evento no Playwright.
 * Captura a resposta HTTP do Excel (Content-Type/Disposition) em qualquer aba.
 */
function criarWatcherRespostaExcel(context, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const pagesAttached = new Set();

    const matchesExcel = (resp) => {
      try {
        if (!resp) return false;
        // Hinova pode responder com 200/206 ou redirecionar (3xx) antes do arquivo.
        const status = resp.status();
        if (status < 200 || status >= 400) return false;
        const h = resp.headers() || {};
        const ct = String(h['content-type'] || '').toLowerCase();
        const cd = String(h['content-disposition'] || '').toLowerCase();
        const url = String(resp.url?.() || '').toLowerCase();

        if (ct.includes('spreadsheet') || ct.includes('excel')) return true;
        if (cd.includes('.xlsx') || cd.includes('.xls')) return true;
        if (url.includes('.xlsx') || url.includes('.xls')) return true;
        // alguns servidores retornam octet-stream com filename no header
        if (ct.includes('octet-stream') && cd.includes('attachment') && (cd.includes('xls') || cd.includes('xlsx'))) {
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const cleanup = (timer, onPage) => {
      try {
        clearTimeout(timer);
      } catch {}
      try {
        context.removeListener('page', onPage);
      } catch {}
      for (const p of pagesAttached) {
        try {
          p.removeListener('response', onResponse);
        } catch {}
      }
    };

    const onResponse = async (resp) => {
      if (done) return;
      if (!matchesExcel(resp)) return;
      done = true;
      cleanup(timer, onPage);
      resolve(resp);
    };

    const attachToPage = (p) => {
      if (!p || pagesAttached.has(p)) return;
      pagesAttached.add(p);
      p.on('response', onResponse);
    };

    const onPage = (p) => attachToPage(p);
    context.on('page', onPage);

    // anexar páginas já abertas
    for (const p of context.pages()) attachToPage(p);

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup(timer, onPage);
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Captura o evento de download em QUALQUER aba (incluindo popups) sem depender
 * de estar esperando no page correto.
 */
function criarWatcherDownloadAnyPage(context, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const pagesAttached = new Set();

    const cleanup = (timer, onPage, onDownload) => {
      try {
        clearTimeout(timer);
      } catch {}
      try {
        context.removeListener('page', onPage);
      } catch {}
      for (const p of pagesAttached) {
        try {
          p.removeListener('download', onDownload);
        } catch {}
      }
    };

    const onDownload = (download) => {
      if (done) return;
      done = true;
      cleanup(timer, onPage, onDownload);
      resolve(download);
    };

    const attachToPage = (p) => {
      if (!p || pagesAttached.has(p)) return;
      pagesAttached.add(p);
      p.on('download', onDownload);
    };

    const onPage = (p) => attachToPage(p);
    context.on('page', onPage);

    // anexar páginas já abertas
    for (const p of context.pages()) attachToPage(p);

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup(timer, onPage, onDownload);
      resolve(null);
    }, timeoutMs);
  });
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
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-popup-blocking'],
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Debug: qualquer download disparado em qualquer aba
  context.on('download', (d) => {
    try {
      const name = d.suggestedFilename?.() || 'arquivo';
      const url = (d.url?.() || '').slice(0, 180);
      log(`(debug) Evento de download: ${name} | ${url}`);
    } catch {}
  });

  // Debug: logar qualquer aba/pop-up criado pelo Hinova
  context.on('page', async (p) => {
    try {
      await p.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      log(`(debug) Nova aba/page criada: ${p.url() || 'carregando...'}`);
    } catch {}
  });

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
    
    // Forma de Exibição - Selecionar "Em Excel" (Hinova usa RADIO)
    log('Configurando forma de exibição para Excel...');
    const excelSelecionado = await selecionarFormaExibicaoEmExcel(page);
    if (excelSelecionado) {
      log('Forma de exibição: Em Excel (radio)');
    } else {
      // fallback legado (se em algum ambiente for select)
      const formaExibicaoSelect = await page.$(
        'select[name*="forma_exibicao"], select[name*="exibicao"], select[name*="formato"]'
      );
      if (formaExibicaoSelect) {
        await formaExibicaoSelect
          .selectOption({ label: 'Em Excel' })
          .catch(async () => {
            await formaExibicaoSelect
              .selectOption({ value: 'excel' })
              .catch(async () => {
                await formaExibicaoSelect.selectOption({ label: 'Excel' }).catch(() => {});
              });
          });
        log('Forma de exibição: Em Excel (select)');
      } else {
        log('⚠️ Não foi possível selecionar "Em Excel" automaticamente (radio/select não localizado)');
      }
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
    // - Evento de download deve aparecer relativamente rápido; se não aparecer, geralmente é bloqueio/flow do Hinova
    // - Salvamento do arquivo pode demorar se o relatório for grande
    const DOWNLOAD_EVENT_TIMEOUT_MS = 6 * 60 * 1000; // 6 min para o evento de download aparecer
    const DOWNLOAD_SAVE_TIMEOUT_MS = 20 * 60 * 1000; // 20 min para salvar arquivo grande
    const DOWNLOAD_CHECK_INTERVAL_MS = 10000; // Verificar a cada 10 segundos
    const MAX_DOWNLOAD_RETRIES = 3;
    
    let dados = [];
    let nomeArquivoFinal = '';
    let downloadSucesso = false;
    
    for (let tentativaDownload = 1; tentativaDownload <= MAX_DOWNLOAD_RETRIES && !downloadSucesso; tentativaDownload++) {
      log(`Tentativa de download ${tentativaDownload}/${MAX_DOWNLOAD_RETRIES}...`);
      
      try {
        // ============================================
        // CORREÇÃO: Selecionar Excel ANTES de clicar em Gerar
        // ============================================
        
        // PASSO 1: Garantir que "Em Excel" está selecionado
        log('Verificando/selecionando forma de exibição Excel...');
        await page.screenshot({ path: 'debug_antes_excel_tentativa.png' }).catch(() => {});
        
        // Tentar selecionar Excel em qualquer frame
        const selecionarExcelEmQualquerFrame = async () => {
          const frames = [page.mainFrame(), ...page.frames().filter(f => f !== page.mainFrame())];
          
          for (const frame of frames) {
            try {
              const frameUrl = frame.url() || 'main';
              
              // Verificar se já tem Excel selecionado
              const jaChecked = await frame.evaluate(() => {
                const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
                for (const r of radios) {
                  if (!r.checked) continue;
                  const nearText = (r.closest('tr, div, label, td')?.textContent || '').toLowerCase();
                  const value = (r.value || '').toLowerCase();
                  if (nearText.includes('excel') || value.includes('excel')) {
                    return true;
                  }
                }
                return false;
              }).catch(() => false);
              
              if (jaChecked) {
                log(`✅ Excel já está selecionado (frame: ${frameUrl})`);
                return true;
              }
              
              // Tentar clicar no radio de Excel
              const clicouExcel = await frame.evaluate(() => {
                const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
                
                for (const radio of radios) {
                  const value = (radio.value || '').toLowerCase();
                  const id = (radio.id || '').toLowerCase();
                  const name = (radio.name || '').toLowerCase();
                  const nearText = (radio.closest('tr, div, label, td, table')?.textContent || '').toLowerCase();
                  
                  // Verificar se é o radio de forma de exibição Excel
                  const isExcel = value.includes('excel') || id.includes('excel') ||
                    (nearText.includes('excel') && (nearText.includes('exib') || nearText.includes('forma')));
                  
                  if (isExcel) {
                    radio.checked = true;
                    radio.click();
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, value, id, nearText: nearText.substring(0, 100) };
                  }
                }
                
                // Fallback: procurar por texto "Em Excel" e clicar no radio mais próximo
                const labels = Array.from(document.querySelectorAll('label, span, td, div, font, b'));
                for (const label of labels) {
                  const text = (label.textContent || '').toLowerCase();
                  if (text.includes('em excel') || (text.trim() === 'excel' && text.length < 20)) {
                    // Procurar radio próximo
                    let radio = label.querySelector('input[type="radio"]');
                    if (!radio) radio = label.previousElementSibling;
                    if (!radio || radio.tagName !== 'INPUT') radio = label.parentElement?.querySelector('input[type="radio"]');
                    if (!radio) radio = label.closest('tr, td, div')?.querySelector('input[type="radio"]');
                    
                    if (radio && radio.type === 'radio') {
                      radio.checked = true;
                      radio.click();
                      radio.dispatchEvent(new Event('change', { bubbles: true }));
                      return { success: true, method: 'label', labelText: text.substring(0, 50) };
                    }
                  }
                }
                
                return { success: false };
              }).catch(() => ({ success: false }));
              
              if (clicouExcel.success) {
                log(`✅ Excel selecionado via JavaScript (frame: ${frameUrl}): ${JSON.stringify(clicouExcel)}`);
                await page.waitForTimeout(500);
                return true;
              }
              
              // Tentar via Playwright locator
              const excelLocator = frame.locator('text=/em\\s*excel/i').first();
              const excelVisible = await excelLocator.isVisible().catch(() => false);
              
              if (excelVisible) {
                const box = await excelLocator.boundingBox().catch(() => null);
                if (box) {
                  // Clicar à esquerda do texto onde normalmente está o radio
                  await page.mouse.click(box.x - 15, box.y + box.height / 2);
                  log(`✅ Clicou à esquerda do texto "Em Excel" (frame: ${frameUrl})`);
                  await page.waitForTimeout(500);
                  return true;
                }
              }
              
            } catch (err) {
              // Continuar para próximo frame
            }
          }
          
          return false;
        };
        
        const excelOk = await selecionarExcelEmQualquerFrame();
        
        if (!excelOk) {
          log('⚠️ Não foi possível confirmar seleção de Excel - tentando mesmo assim...');
        }
        
        // Aguardar um pouco após selecionar Excel
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'debug_apos_selecao_excel.png' }).catch(() => {});
        
        // ============================================
        // PASSO 2: Clicar no botão Gerar
        // ============================================
        log('Clicando em Gerar relatório...');

        // IMPORTANTE: no Hinova o botão pode estar dentro de iframe.
        // Se a gente "clica via JS" (evaluate), o portal pode bloquear o window.open/download.
        // Portanto, buscamos e clicamos com Playwright (clique "real") em qualquer frame.
        const clicarGerarEmQualquerFrame = async () => {
          const tentarNoFrame = async (frame) => {
            // getByRole('button') cobre <button> e <input type=submit/button> usando o value como name
            const byRole = frame.getByRole('button', { name: /gerar/i });
            const count = await byRole.count().catch(() => 0);
            for (let i = 0; i < count; i++) {
              const el = byRole.nth(i);
              const visible = await el.isVisible().catch(() => false);
              if (!visible) continue;

              const enabled = await el.isEnabled().catch(() => true);
              if (!enabled) continue;

              await el.click({ timeout: 15000, force: true });
              return `role=button name~/gerar/i (frame: ${frame.url() || 'main'})`;
            }

            // Fallback: alguns portais usam input[type=image] ou value/alt diferentes
            const inputs = frame.locator('input[type="submit"], input[type="button"], input[type="image"]');
            const ic = await inputs.count().catch(() => 0);
            for (let i = 0; i < ic; i++) {
              const el = inputs.nth(i);
              const visible = await el.isVisible().catch(() => false);
              if (!visible) continue;

              const value = (await el.getAttribute('value').catch(() => '')) || '';
              const alt = (await el.getAttribute('alt').catch(() => '')) || '';
              const label = `${value} ${alt}`.toLowerCase();
              if (label.includes('gerar')) {
                await el.click({ timeout: 15000, force: true });
                return `input gerar (value="${value}", alt="${alt}") (frame: ${frame.url() || 'main'})`;
              }
            }

            return null;
          };

          // primeiro tenta no frame principal
          const mainClicked = await tentarNoFrame(page.mainFrame());
          if (mainClicked) return mainClicked;

          // depois varre iframes
          for (const frame of page.frames()) {
            if (frame === page.mainFrame()) continue;
            const clicked = await tentarNoFrame(frame);
            if (clicked) return clicked;
          }

          return null;
        };

        // Promises precisam ser criadas ANTES do clique para não perder eventos rápidos
        // - download: pode iniciar na nova aba instantaneamente
        // - page: Hinova abre uma nova aba (geraRelatorioBoleto.php)
        // Capturar download em qualquer aba (incluindo popup). Isso evita o bug
        // onde a Hinova abre uma nova janela e o download dispara lá.
        const downloadPromise = criarWatcherDownloadAnyPage(
          context,
          DOWNLOAD_EVENT_TIMEOUT_MS
        ).catch(() => null);

        // fallback: capturar a RESPOSTA HTTP do Excel (quando o evento de download não dispara)
        const excelResponsePromise = criarWatcherRespostaExcel(
          context,
          DOWNLOAD_EVENT_TIMEOUT_MS
        ).catch(() => null);

        // Popup costuma ser aberto a partir da página principal (window.open)
        // Não aguardamos aqui para não bloquear; é só para debug/screenshot e para tentar forçar o start do download
        const popupPromise = page
          .waitForEvent('popup', { timeout: 60000 })
          .then(async (popup) => {
            try {
              await popup.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
              log(`Popup detectado: ${popup.url() || 'carregando...'}`);
              await popup.screenshot({ path: 'debug_nova_aba.png' }).catch(() => {});

              // Alguns fluxos exigem um clique extra no popup para iniciar o download
              const seletoresDownload = [
                'a[href*=".xlsx"]',
                'a[href*=".xls"]',
                'a:has-text("Baixar")',
                'button:has-text("Baixar")',
                'a:has-text("Download")',
                'button:has-text("Download")',
                'a:has-text("Export")',
                'button:has-text("Export")',
              ];

              for (const s of seletoresDownload) {
                const el = await popup.$(s).catch(() => null);
                if (el && (await el.isVisible().catch(() => false))) {
                  await el.click({ timeout: 3000 }).catch(() => {});
                  log(`(debug) Clique extra no popup para iniciar download: ${s}`);
                  break;
                }
              }
            } catch {}
            return popup;
          })
          .catch(() => null);

        // Alternativa: alguns casos abrem como uma nova page no contexto
        const newPagePromise = context
          .waitForEvent('page', { timeout: 60000 })
          .then(async (newPage) => {
            try {
              await newPage.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
              log(`Nova aba detectada: ${newPage.url() || 'carregando...'}`);
              await newPage.screenshot({ path: 'debug_nova_aba.png' }).catch(() => {});
            } catch {}
            return newPage;
          })
          .catch(() => null);

        // Clique "real" no botão Gerar
        await page.screenshot({ path: 'debug_antes_gerar.png' }).catch(() => {});
        const clickInfo = await clicarGerarEmQualquerFrame();
        if (!clickInfo) {
          await page.screenshot({ path: 'erro_hinova.png' }).catch(() => {});

          // Log básico de diagnóstico (não depende de iframe)
          const diag = await page
            .evaluate(() => {
              const els = Array.from(document.querySelectorAll('button, input, a'));
              const mapped = els
                .map((el) => {
                  const tag = el.tagName.toLowerCase();
                  const type = el.getAttribute('type') || '';
                  const value = el.getAttribute('value') || '';
                  const text = (el.textContent || '').trim();
                  const alt = el.getAttribute('alt') || '';
                  const label = `${value} ${text} ${alt}`.trim();
                  return { tag, type, label: label.slice(0, 80) };
                })
                .filter((x) => x.label.toLowerCase().includes('gerar'))
                .slice(0, 30);
              return mapped;
            })
            .catch(() => []);

          log(`(debug) Elementos com 'gerar' no DOM principal: ${JSON.stringify(diag)}`);
          throw new Error('Botão "Gerar" não encontrado/clicável (provável iframe ou layout mudou).');
        }

        log(`Clicou no botão Gerar: ${clickInfo}`);

        // Dar um pequeno tempo para o Hinova abrir a nova aba/popup (sem bloquear o download)
        await Promise.race([
          popupPromise,
          newPagePromise,
          page.waitForTimeout(1500).then(() => null),
        ]);

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
           // Aguardar download OU resposta de Excel
           const result = await Promise.race([
             downloadPromise.then((d) => ({ type: 'download', download: d })),
             excelResponsePromise.then((r) => ({ type: 'response', response: r })),
           ]);

           if (!result || (!result.download && !result.response)) {
             throw new Error('Timeout aguardando download/resposta do Excel (Hinova não iniciou o arquivo)');
           }

           clearInterval(monitoramentoInterval);

           // Definir nome/arquivo
           const defaultName = `Hinova_${fim.replace(/\//g, '-')}.xlsx`;
           let filePath = '';

           if (result.type === 'download' && result.download) {
             const download = result.download;
             nomeArquivoFinal = download.suggestedFilename() || defaultName;
             filePath = path.join(downloadPath, nomeArquivoFinal);

             log(`✅ Download capturado: ${nomeArquivoFinal}`);

             // Monitorar o progresso do salvamento
             log('Salvando arquivo (pode demorar para arquivos grandes)...');
             const saveStartTime = Date.now();

             await Promise.race([
               download.saveAs(filePath),
               new Promise((_, reject) =>
                 setTimeout(
                   () => reject(new Error('Timeout ao salvar o arquivo de download')),
                   DOWNLOAD_SAVE_TIMEOUT_MS
                 )
               ),
             ]);

             const saveEndTime = Date.now();
             const saveDuration = Math.round((saveEndTime - saveStartTime) / 1000);
             log(`✅ Arquivo salvo em ${saveDuration}s: ${filePath}`);
           } else if (result.type === 'response' && result.response) {
             const resp = result.response;
             const headers = resp.headers() || {};
             const cd = String(headers['content-disposition'] || '');
             const match = cd.match(/filename\*?=(?:UTF-8''|\")?([^;\"\n\r]+)/i);
             const suggested = match ? decodeURIComponent(match[1]).replace(/\"/g, '').trim() : '';

             nomeArquivoFinal = suggested || defaultName;
             // garantir extensão
             if (!/\.(xlsx|xls)$/i.test(nomeArquivoFinal)) nomeArquivoFinal += '.xlsx';
             filePath = path.join(downloadPath, nomeArquivoFinal);

             log(`✅ Excel capturado via resposta HTTP: ${nomeArquivoFinal}`);

             const buf = await resp.body();
             fs.writeFileSync(filePath, buf);
             const stats = fs.statSync(filePath);
             log(`✅ Arquivo salvo via HTTP: ${(stats.size / 1024).toFixed(2)} KB`);
           }
          
           // Verificar se o arquivo foi salvo corretamente
           if (filePath && fs.existsSync(filePath)) {
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
