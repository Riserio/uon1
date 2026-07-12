#!/usr/bin/env node
/**
 * Robô de Automação - Detran-MG via Gov.br (Node.js)
 * ===================================================
 *
 * Loga com a conta Gov.br configurada e consulta situação do veículo
 * (multas, licenciamento, IPVA) no portal do Detran-MG para uma placa.
 *
 * IMPORTANTE - LIMITAÇÕES CONHECIDAS:
 * - Depende da estrutura atual do site do Gov.br SSO e do Detran-MG, que
 *   pode mudar sem aviso (como qualquer robô de crawl neste projeto).
 * - Assume que a conta Gov.br está configurada SEM exigência de segunda
 *   etapa (2FA) a cada login - se o Gov.br pedir confirmação em duas
 *   etapas mesmo assim, o robô vai falhar de forma controlada (screenshot
 *   + erro claro), sem tentar contornar a verificação.
 *
 * REQUISITOS:
 * npm install playwright axios
 * npx playwright install chromium
 */

const { chromium } = require('playwright');
const axios = require('axios');

const CONFIG = {
  GOV_BR_CPF: process.env.GOV_BR_CPF || '',
  GOV_BR_SENHA: process.env.GOV_BR_SENHA || '',

  PLACA: (process.env.PLACA || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
  RENAVAM: process.env.RENAVAM || '',
  CHASSI: process.env.CHASSI || '',
  CPF_CONSULTA: process.env.CPF_CONSULTA || '',

  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',

  // NOVO: sessão Gov.br (cookies/localStorage) salva de uma consulta anterior
  // bem-sucedida - se ainda válida, deixa o robô pular o login inteiro.
  SESSION_STATE_JSON: process.env.SESSION_STATE_JSON || '',

  CORRETORA_ID: process.env.CORRETORA_ID || '',
  EXECUCAO_ID: process.env.EXECUCAO_ID || '',
  GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || '',
  GITHUB_RUN_URL: process.env.GITHUB_RUN_URL || '',
};

const DETRAN_MG_URL = 'https://www.detran.mg.gov.br/veiculos/situacao-do-veiculo/consultar-situacao-do-veiculo';

function log(msg) {
  console.log(`[Detran-MG] ${msg}`);
}

async function fetchCredentialsFromServer() {
  const credentialsUrl = process.env.CREDENTIALS_URL;
  const robotSecret = process.env.ROBOT_SECRET;

  if (!credentialsUrl || !robotSecret || !CONFIG.CORRETORA_ID) {
    log('Sem CREDENTIALS_URL/ROBOT_SECRET ou CORRETORA_ID, usando env vars diretamente');
    return;
  }

  log(`Buscando credenciais para corretora ${CONFIG.CORRETORA_ID}...`);
  const response = await axios.post(
    credentialsUrl,
    { corretora_id: CONFIG.CORRETORA_ID },
    { headers: { 'x-robot-secret': robotSecret, 'Content-Type': 'application/json' }, timeout: 15000 },
  );

  const creds = response.data;
  if (!creds.gov_br_cpf || !creds.gov_br_senha) {
    throw new Error('Credenciais Gov.br incompletas retornadas pelo servidor');
  }
  CONFIG.GOV_BR_CPF = creds.gov_br_cpf;
  CONFIG.GOV_BR_SENHA = creds.gov_br_senha;
  log('Credenciais carregadas com sucesso do servidor');
}

async function notifyWebhook(payload) {
  if (!CONFIG.WEBHOOK_URL) {
    log('WEBHOOK_URL não configurado, pulando notificação');
    return;
  }
  try {
    await axios.post(
      CONFIG.WEBHOOK_URL,
      {
        execucao_id: CONFIG.EXECUCAO_ID,
        corretora_id: CONFIG.CORRETORA_ID,
        github_run_id: CONFIG.GITHUB_RUN_ID,
        github_run_url: CONFIG.GITHUB_RUN_URL,
        ...payload,
      },
      { headers: { 'x-webhook-secret': CONFIG.WEBHOOK_SECRET, 'Content-Type': 'application/json' }, timeout: 15000 },
    );
    log('Webhook notificado com sucesso');
  } catch (err) {
    console.error('[Detran-MG] Falha ao notificar webhook:', err.message);
  }
}

async function safeScreenshot(page, name) {
  try {
    await page.screenshot({ path: name, fullPage: true, timeout: 10000 });
    log(`Screenshot salvo: ${name}`);
  } catch (e) {
    console.error(`[Detran-MG] Falha ao salvar screenshot ${name}:`, e.message);
  }
}

// NOVO: detecta se a página atual já É o formulário de consulta (com campos
// de placa/CPF/chassi/renavam) - usado para saber se uma sessão Gov.br
// reaproveitada de uma consulta anterior ainda está válida, sem precisar
// tentar preencher nada ainda.
async function estaNoFormularioDeConsulta(page) {
  const placaSelectors = ['input[name*="placa" i]', '#placa', 'input[id*="placa" i]'];
  for (const sel of placaSelectors) {
    if (await page.locator(sel).first().isVisible({ timeout: 2500 }).catch(() => false)) return true;
  }
  return false;
}

// Detecta se a página atual parece ser uma tela de 2FA/confirmação em duas etapas
async function detectarTelaDeConfirmacao(page) {
  const bodyText = (await page.textContent('body').catch(() => '')) || '';
  const lower = bodyText.toLowerCase();
  return (
    lower.includes('confirme sua identidade') ||
    lower.includes('código de verificação') ||
    lower.includes('autenticação de dois fatores') ||
    lower.includes('confirmar login') ||
    lower.includes('enviamos um código')
  );
}

async function fazerLoginGovBr(page) {
  log('Procurando link/botão que leva ao formulário de consulta (com login Gov.br) na página do Detran-MG...');
  await safeScreenshot(page, 'debug_govbr_00_pagina_inicial.png');

  // IMPORTANTE: a página institucional do Detran-MG tem DOIS links que mencionam
  // Gov.br - um botão genérico "ENTRAR COM GOV.BR" no cabeçalho (login geral do
  // site, não leva ao formulário de consulta) e um link "formulário" dentro do
  // passo-a-passo ("Acesse o formulário e faça login com sua conta Gov.br"), que
  // é o que realmente abre o formulário de consulta + SSO. Por isso o link
  // "formulário" tem prioridade nos seletores abaixo - o robô já pegou o botão
  // errado do cabeçalho antes e ficou preso numa página sem os campos esperados.
  const loginSelectors = [
    'a:has-text("formulário")',
    'a[href*="sso.acesso.gov.br"]',
    'a:has-text("Acessar o formulário")',
    'a:has-text("Entrar com gov.br"):not(.nav-link)',
    'button:has-text("Entrar com gov.br")',
  ];

  // NOVO (corrige o robô operar na aba errada): o link "formulário" abre em
  // uma NOVA ABA (target="_blank"). Se continuássemos usando a `page`
  // original depois desse clique, ela nunca navega - o robô ficava "cego",
  // continuando a procurar campos numa aba que nunca saiu da página
  // institucional. Por isso capturamos o evento de popup (nova aba) do
  // browser context junto com o clique; se abrir popup, toda a navegação
  // seguinte (página intermediária, login Gov.br, formulário de consulta)
  // acontece nessa nova aba, que passamos a retornar/usar a partir daqui.
  let targetPage = page;
  let clicked = false;
  for (const sel of loginSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [popup] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
        page.waitForURL(/acesso\.gov\.br/i, { timeout: 8000 }).catch(() => null),
        el.click(),
      ]);
      if (popup) {
        targetPage = popup;
        await targetPage.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);
        log(`Formulário abriu em uma nova aba: ${targetPage.url()}`);
      }
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    await safeScreenshot(page, 'debug_govbr_01_sem_botao_login.png');
    throw new Error('Não foi possível localizar o link do formulário/login Gov.br na página do Detran-MG (layout pode ter mudado)');
  }

  // NOVO: se veio uma sessão Gov.br salva de uma consulta anterior (ainda
  // válida), o clique acima pode já ter caído direto no formulário de
  // consulta, sem passar pela página intermediária nem pelo login do Gov.br -
  // nesse caso não há mais nada a fazer aqui, é só devolver a página.
  if (await estaNoFormularioDeConsulta(targetPage)) {
    log('Sessão Gov.br reaproveitada com sucesso - login pulado.');
    return targetPage;
  }

  // NOVO (corrige "Campo de CPF não encontrado"): o Detran-MG passou a exibir
  // uma página intermediária de confirmação ("ATENÇÃO! Faça login do Gov.br
  // para acessar este serviço.") com um botão "Entrar" (id="botao-entrar")
  // ANTES de redirecionar de fato para o SSO do Gov.br. Se ainda não chegamos
  // no acesso.gov.br depois do primeiro clique, procuramos e clicamos nesse
  // botão. IMPORTANTE: o seletor precisa ser específico (#botao-entrar) - um
  // seletor genérico como 'a:has-text("Entrar")' também acaba encontrando o
  // link "ENTRAR COM GOV.BR" do cabeçalho do site (classe "nav-link"), que
  // leva a um login genérico sem relação com o formulário de consulta, e o
  // robô ficava preso ali aguardando uma navegação que nunca vinha.
  if (!/acesso\.gov\.br/i.test(targetPage.url())) {
    await safeScreenshot(targetPage, 'debug_govbr_01b_pagina_intermediaria.png');
    const entrarIntermediarioSelectors = [
      '#botao-entrar',
      'main button:has-text("Entrar")',
      'main a:has-text("Entrar")',
      'a:has-text("Entrar"):not(.nav-link)',
      'button:has-text("Entrar"):not(.nav-link)',
    ];
    let avancouIntermediario = false;
    for (const sel of entrarIntermediarioSelectors) {
      const el = targetPage.locator(sel).first();
      if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
        await Promise.all([
          targetPage.waitForURL(/acesso\.gov\.br/i, { timeout: 20000 }).catch(() => null),
          el.click(),
        ]);
        avancouIntermediario = true;
        break;
      }
    }

    // NOVO: mesma ideia do check acima, mas depois do clique em "Entrar" -
    // se a sessão Gov.br salva ainda for válida, esse clique pode já cair
    // direto no formulário de consulta em vez de ir para o acesso.gov.br.
    if (avancouIntermediario && await estaNoFormularioDeConsulta(targetPage)) {
      log('Sessão Gov.br reaproveitada com sucesso - login pulado.');
      return targetPage;
    }

    if (!avancouIntermediario || !/acesso\.gov\.br/i.test(targetPage.url())) {
      await safeScreenshot(targetPage, 'debug_govbr_01c_sem_redirecionar_sso.png');
      throw new Error('Não foi possível avançar da página intermediária do Detran-MG para o login do Gov.br (layout pode ter mudado)');
    }
  }

  // A partir daqui, `page` passa a apontar para a aba correta (a nova aba,
  // se abriu popup; senão, a mesma aba original) - todo o resto da função
  // (e o retorno para quem chamou) usa essa página.
  page = targetPage;
  log(`Na página do Gov.br SSO: ${page.url()}`);
  await safeScreenshot(page, 'debug_govbr_02_tela_login.png');

  // Etapa 1: CPF
  // NOVO (corrige "Campo de CPF não encontrado"): o Gov.br renomeou o campo
  // de id/name "accountid" (minúsculo) para "accountId" (camelCase) e o tipo
  // do input passou de "text" para "tel". Seletores de ID e de atributo são
  // case-sensitive, então os seletores antigos silenciosamente paravam de
  // encontrar o campo. Priorizamos os seletores novos e mantemos os antigos
  // como fallback, caso o Gov.br volte a mudar.
  const cpfSelectors = [
    '#accountId',
    'input[name="accountId"]',
    '#accountid',
    'input[name="accountid"]',
    'input[type="tel"][name*="account" i]',
    'input[type="text"][name*="cpf" i]',
  ];
  let cpfInput = null;
  for (const sel of cpfSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 5000 }).catch(() => false)) { cpfInput = el; break; }
  }
  if (!cpfInput) {
    await safeScreenshot(page, 'debug_govbr_03_sem_campo_cpf.png');
    throw new Error('Campo de CPF não encontrado na tela de login Gov.br (layout pode ter mudado, ou clicamos no link errado)');
  }
  await cpfInput.fill(CONFIG.GOV_BR_CPF);

  // NOVO: o botão "Continuar" também teve o id trocado de "send-username"
  // para "enter-account-id".
  const continuarSelectors = ['#enter-account-id', '#send-username', 'button[type="submit"]', 'button:has-text("Continuar")'];
  let avancouCpf = false;
  for (const sel of continuarSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click();
      avancouCpf = true;
      break;
    }
  }
  if (!avancouCpf) {
    await safeScreenshot(page, 'debug_govbr_04_sem_botao_continuar.png');
    throw new Error('Botão para avançar após o CPF não encontrado na tela de login Gov.br');
  }

  await page.waitForTimeout(2500);

  if (await detectarTelaDeConfirmacao(page)) {
    await safeScreenshot(page, 'debug_govbr_05_tela_confirmacao_2fa.png');
    throw new Error('Gov.br solicitou confirmação em duas etapas (2FA) - a conta precisa estar sem essa exigência para a consulta automática funcionar');
  }

  // Etapa 2: senha
  const senhaSelectors = ['#password', 'input[name="password"]', 'input[type="password"]'];
  let senhaInput = null;
  for (const sel of senhaSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 8000 }).catch(() => false)) { senhaInput = el; break; }
  }
  if (!senhaInput) {
    await safeScreenshot(page, 'debug_govbr_06_sem_campo_senha.png');
    throw new Error('Campo de senha não encontrado na tela de login Gov.br (layout pode ter mudado)');
  }
  await senhaInput.fill(CONFIG.GOV_BR_SENHA);

  const entrarSelectors = ['#send-password', 'button[type="submit"]', 'button:has-text("Entrar")'];
  let entrou = false;
  for (const sel of entrarSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await Promise.all([
        page.waitForNavigation({ timeout: 30000 }).catch(() => null),
        el.click(),
      ]);
      entrou = true;
      break;
    }
  }
  if (!entrou) {
    await safeScreenshot(page, 'debug_govbr_07_sem_botao_entrar.png');
    throw new Error('Botão para concluir o login (após a senha) não encontrado na tela do Gov.br');
  }

  await page.waitForTimeout(3000);

  if (await detectarTelaDeConfirmacao(page)) {
    await safeScreenshot(page, 'debug_govbr_08_tela_confirmacao_pos_senha.png');
    throw new Error('Gov.br solicitou confirmação em duas etapas (2FA) após a senha - desative essa exigência na conta usada para a automação');
  }

  log(`Login Gov.br concluído, de volta em: ${page.url()}`);
  await safeScreenshot(page, 'debug_govbr_09_pos_login.png');

  // Retorna a página correta (pode ser uma aba diferente da recebida como
  // argumento, se o login abriu em popup) para quem chamou continuar o
  // preenchimento do formulário de consulta na aba certa.
  return page;
}

async function preencherFormularioConsulta(page) {
  log('Preenchendo formulário de consulta no Detran-MG...');
  await safeScreenshot(page, 'debug_detran_mg_00_formulario.png');

  const campos = [
    { valor: CONFIG.CPF_CONSULTA, seletores: ['input[name*="cpf" i]', '#cpf', 'input[id*="cpf" i]'] },
    { valor: CONFIG.PLACA, seletores: ['input[name*="placa" i]', '#placa', 'input[id*="placa" i]'] },
    { valor: CONFIG.CHASSI, seletores: ['input[name*="chassi" i]', '#chassi', 'input[id*="chassi" i]'] },
    { valor: CONFIG.RENAVAM, seletores: ['input[name*="renavam" i]', '#renavam', 'input[id*="renavam" i]'] },
  ];

  let algumCampoPreenchido = false;
  for (const campo of campos) {
    if (!campo.valor) continue;
    for (const sel of campo.seletores) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.fill(campo.valor);
        algumCampoPreenchido = true;
        break;
      }
    }
  }

  if (!algumCampoPreenchido) {
    await safeScreenshot(page, 'debug_detran_mg_01_sem_campos.png');
    throw new Error('Nenhum campo do formulário de consulta (CPF/placa/chassi/renavam) foi encontrado - layout do Detran-MG pode ter mudado');
  }

  const submitSelectors = ['button[type="submit"]', 'button:has-text("Consultar")', 'input[type="submit"]'];
  let enviou = false;
  for (const sel of submitSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null),
        el.click(),
      ]);
      enviou = true;
      break;
    }
  }
  if (!enviou) {
    await safeScreenshot(page, 'debug_detran_mg_02_sem_botao_consultar.png');
    throw new Error('Botão de consulta não encontrado no formulário do Detran-MG');
  }

  await page.waitForTimeout(3000);
  await safeScreenshot(page, 'debug_detran_mg_03_resultado.png');
}

// Extrai o texto da página e tenta separar em multas / licenciamento / IPVA
// de forma best-effort - o site pode organizar isso em seções, tabelas ou
// cards diferentes. Guardamos o texto bruto também para conferência manual.
async function extrairResultado(page) {
  const bodyText = (await page.textContent('body').catch(() => '')) || '';

  const buscarSecao = (chave) => {
    const idx = bodyText.toLowerCase().indexOf(chave);
    if (idx === -1) return null;
    return bodyText.slice(idx, idx + 600).replace(/\s+/g, ' ').trim();
  };

  return {
    fonte: 'Detran-MG via Gov.br',
    placa: CONFIG.PLACA,
    renavam: CONFIG.RENAVAM || null,
    uf: 'MG',
    consultado_em: new Date().toISOString(),
    multas_raw: buscarSecao('multa'),
    licenciamento_raw: buscarSecao('licenciamento'),
    ipva_raw: buscarSecao('ipva'),
    texto_completo: bodyText.replace(/\s+/g, ' ').trim().slice(0, 5000),
  };
}

async function main() {
  if (!CONFIG.PLACA) {
    throw new Error('PLACA não informada');
  }

  await fetchCredentialsFromServer();

  if (!CONFIG.GOV_BR_CPF || !CONFIG.GOV_BR_SENHA) {
    throw new Error('Credenciais Gov.br não disponíveis (nem via servidor, nem via env vars)');
  }

  // NOVO: se veio uma sessão Gov.br salva de uma consulta anterior, tenta
  // abrir o navegador já com esses cookies/localStorage - se ainda válida,
  // o robô pula o login inteiro (ver estaNoFormularioDeConsulta acima).
  let storageStateInicial;
  if (CONFIG.SESSION_STATE_JSON) {
    try {
      storageStateInicial = JSON.parse(CONFIG.SESSION_STATE_JSON);
      log('Sessão Gov.br salva encontrada, tentando reaproveitar...');
    } catch (e) {
      log(`SESSION_STATE_JSON inválido, ignorando e seguindo com login normal: ${e.message}`);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'pt-BR', storageState: storageStateInicial });
  const page = await context.newPage();

  // NOVO: o login Gov.br pode abrir numa aba nova (popup) - `currentPage`
  // acompanha qual aba está realmente em uso a cada momento, para que o
  // screenshot de erro (no catch) sempre capture a aba certa, mesmo que o
  // erro aconteça depois da troca de aba dentro de fazerLoginGovBr.
  let currentPage = page;

  try {
    log(`Abrindo página do Detran-MG para consulta da placa ${CONFIG.PLACA}...`);
    await page.goto(DETRAN_MG_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    currentPage = await fazerLoginGovBr(page);
    await preencherFormularioConsulta(currentPage);
    const resultado = await extrairResultado(currentPage);

    // NOVO: guarda a sessão Gov.br (cookies/localStorage) autenticada com
    // sucesso - reaproveitada ou recém-logada, não importa - para a PRÓXIMA
    // consulta poder tentar pular o login inteiro. Se isso falhar por
    // qualquer motivo, não compromete a consulta atual (já concluída).
    let sessionState;
    try {
      sessionState = JSON.stringify(await context.storageState());
    } catch (e) {
      console.warn('[Detran-MG] Falha ao capturar sessão Gov.br para salvar (ignorado):', e.message);
    }

    log('Consulta concluída com sucesso');
    await notifyWebhook({ action: 'success', resultado, session_state: sessionState });

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('[Detran-MG] ERRO:', err.message);
    await safeScreenshot(currentPage, 'erro_detran_mg.png');
    await notifyWebhook({ action: 'error', error_message: err.message });
    await browser.close();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('[Detran-MG] ERRO FATAL:', err.message);
  await notifyWebhook({ action: 'error', error_message: err.message || 'Erro fatal desconhecido' });
  process.exit(1);
});
