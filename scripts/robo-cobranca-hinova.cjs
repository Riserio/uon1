/**
 * ROBÔ HINOVA — VERSÃO OTIMIZADA
 * -------------------------------------------
 * - Login robusto
 * - Detecção inteligente de campos
 * - Fechamento de popups centralizado
 * - Download com retry
 * - Processamento de Excel estável
 * - Webhook com múltiplas tentativas
 * -------------------------------------------
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import xlsx from 'xlsx';
import { chromium } from 'playwright';

// CONFIGURAÇÕES GERAIS
const CONFIG = {
  LOGIN_URL: "https://www.hinova.com.br/login",
  RELATORIO_URL: "https://www.hinova.com.br/relatorio/bi",
  USUARIO: process.env.HINOVA_USER,
  SENHA: process.env.HINOVA_PASS,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  MAX_RETRY_DOWNLOAD: 3,
  MAX_RETRY_WEBHOOK: 5,
};

// Função de LOG com timestamp
const log = (msg) => {
  const time = new Date().toLocaleString("pt-BR");
  console.log(`[${time}] ${msg}`);
};

// Fechar popups genéricos
const fecharPopups = async (page) => {
  const seletores = [
    'button:has-text("OK")',
    'button:has-text("Fechar")',
    'button:has-text("Entendi")',
    '.modal-footer button',
    '.swal-button--confirm',
  ];

  for (const sel of seletores) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        log(`Popup detectado: fechando (${sel})`);
        await btn.click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
    } catch {}
  }
};

// Detecção robusta do campo de autenticação
const dispensarCodigoAutenticacao = async (page) => {
  log("Verificando campo de autenticação...");

  const seletores = [
    'input[placeholder*="Autent"]',
    'input[placeholder*="Código"]',
    'input[placeholder*="cod"]',
    'input[name*="codigo"]',
    'input[type="text"]'
  ];

  for (const sel of seletores) {
    const campo = await page.$(sel);
    if (campo) {
      log(`Campo de autenticação localizado (${sel}). Dispensando...`);

      try {
        await campo.fill("");
      } catch {}

      await campo.blur().catch(() => {});
      await page.waitForTimeout(1000);

      return true;
    }
  }

  log("Nenhum campo de autenticação encontrado.");
  return false;
};

// Download com retentativas
const baixarRelatorio = async (page) => {
  log("Iniciando download do relatório...");

  for (let tentativa = 1; tentativa <= CONFIG.MAX_RETRY_DOWNLOAD; tentativa++) {
    log(`Tentativa ${tentativa}/${CONFIG.MAX_RETRY_DOWNLOAD}...`);

    try {
      const download = await Promise.race([
        page.waitForEvent("download", { timeout: 60000 }),
        new Promise((resolve) => setTimeout(() => resolve(null), 60000)),
      ]);

      if (!download) {
        log("Nada baixado, nova tentativa...");
        continue;
      }

      const caminho = path.join(process.cwd(), "relatorio_hinova.xlsx");
      await download.saveAs(caminho);
      log("Download concluído com sucesso!");
      return caminho;

    } catch (e) {
      log("Falha no download: " + e.message);
    }
  }

  throw new Error("Falha ao baixar relatório após múltiplas tentativas");
};

// Processar Excel com alta tolerância
const processarExcel = (arquivo) => {
  log("Processando Excel...");

  const workbook = xlsx.readFile(arquivo);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  if (!json.length) {
    throw new Error("Excel está vazio ou ilegível.");
  }

  log(`Excel processado. Total de registros: ${json.length}`);
  return json;
};

// Enviar webhook com retry exponencial
const enviarWebhook = async (dados, arquivo) => {
  log("Enviando dados para webhook...");

  for (let tentativa = 1; tentativa <= CONFIG.MAX_RETRY_WEBHOOK; tentativa++) {
    try {
      await axios.post(CONFIG.WEBHOOK_URL, {
        arquivo,
        registros: dados.length,
        dados,
      });

      log("Webhook enviado com sucesso!");
      return true;

    } catch (e) {
      log(`Erro ao enviar webhook (tentativa ${tentativa}): ${e.message}`);
      await new Promise(r => setTimeout(r, tentativa * 2000));
    }
  }

  return false;
};

// Função principal
const iniciarRobo = async () => {
  const navegador = await chromium.launch({ headless: true });
  const page = await navegador.newPage();

  try {
    log("Acessando página de login...");
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: "domcontentloaded" });

    // Preencher usuário e senha
    await page.fill('input[name="login"], input[type="text"]', CONFIG.USUARIO);
    await page.fill('input[type="password"]', CONFIG.SENHA);

    // Dispensar autenticação
    await dispensarCodigoAutenticacao(page);

    log("Clicando em 'Entrar'...");
    await page.click('button:has-text("Entrar"), input[type="submit"]');

    await page.waitForTimeout(4000);
    await fecharPopups(page);

    // Acessar relatório
    log("Acessando tela de relatórios...");
    await page.goto(CONFIG.RELATORIO_URL, { waitUntil: "domcontentloaded" });

    await fecharPopups(page);

    // Preencher datas
    const hoje = new Date();
    const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
    const fim = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-31`;

    await page.fill('input[name*="dt_ini"]', inicio);
    await page.fill('input[name*="dt_fim"]', fim);

    // Gerar relatório
    log("Gerando relatório...");
    await page.click('button:has-text("Gerar")');
    await page.waitForTimeout(5000);

    const caminhoExcel = await baixarRelatorio(page);
    const dados = processarExcel(caminhoExcel);

    await enviarWebhook(dados, caminhoExcel);

    log("Robô finalizado com sucesso!");
    await navegador.close();
    process.exit(0);

  } catch (e) {
    log("ERRO FATAL: " + e.message);
    await page.screenshot({ path: "erro_fatal.png" }).catch(() => {});
    await navegador.close();
    process.exit(1);
  }
};

// Executar
iniciarRobo();
