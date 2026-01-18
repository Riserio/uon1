#!/usr/bin/env python3
"""
Robô de Automação - Cobrança Hinova
===================================

Este script automatiza a busca de relatórios de boletos no portal Hinova
e envia os dados para o webhook do sistema de cobrança.

REQUISITOS:
-----------
pip install playwright requests
playwright install chromium

CONFIGURAÇÃO:
-------------
Edite as variáveis abaixo ou use variáveis de ambiente:
- HINOVA_URL: URL do portal Hinova
- HINOVA_USER: Usuário de login
- HINOVA_PASS: Senha de login
- WEBHOOK_URL: URL do webhook (Edge Function)
- WEBHOOK_SECRET: Secret do webhook (opcional)
- CORRETORA_SLUG: Slug da corretora (ex: "valecar")

EXECUÇÃO:
---------
python robo-cobranca-hinova.py

AGENDAMENTO (Linux/Mac):
------------------------
Adicione ao crontab para rodar todo dia às 8h:
0 8 * * * cd /caminho/do/script && python robo-cobranca-hinova.py >> cobranca.log 2>&1

AGENDAMENTO (Windows):
----------------------
Use o Agendador de Tarefas para rodar o script diariamente.
"""

import os
import json
import requests
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ============================================
# CONFIGURAÇÃO - EDITE AQUI OU USE ENV VARS
# ============================================

HINOVA_URL = os.getenv("HINOVA_URL", "https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php")
HINOVA_USER = os.getenv("HINOVA_USER", "miriam soares")
HINOVA_PASS = os.getenv("HINOVA_PASS", "Claura2021")

# URL do webhook - SUBSTITUA pelo seu projeto
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "https://mnoczwmqgignmylbvpgp.supabase.co/functions/v1/webhook-cobranca-hinova")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")  # Opcional

# Identificador da corretora - USE O ID DIRETO
CORRETORA_ID = os.getenv("CORRETORA_ID", "a4931643-8bf1-4153-97b1-c64925f536eb")

# ============================================
# FUNÇÕES DO ROBÔ
# ============================================

def log(msg):
    """Log com timestamp"""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

def get_date_range():
    """Retorna as datas para o filtro: primeiro dia do mês até hoje"""
    hoje = datetime.now()
    primeiro_dia = hoje.replace(day=1)
    return primeiro_dia.strftime("%d/%m/%Y"), hoje.strftime("%d/%m/%Y")

def extrair_dados_tabela(page):
    """Extrai dados da tabela de boletos"""
    dados = []
    
    # Aguardar tabela carregar
    try:
        page.wait_for_selector("table", timeout=30000)
    except PlaywrightTimeout:
        log("Tabela não encontrada")
        return dados
    
    # Extrair cabeçalhos
    headers = []
    header_elements = page.query_selector_all("table thead th, table tr:first-child th, table tr:first-child td")
    for th in header_elements:
        text = th.inner_text().strip()
        if text:
            headers.append(text)
    
    log(f"Colunas encontradas: {headers}")
    
    # Extrair linhas
    rows = page.query_selector_all("table tbody tr, table tr:not(:first-child)")
    
    for row in rows:
        cells = row.query_selector_all("td")
        if len(cells) >= len(headers):
            row_data = {}
            for i, cell in enumerate(cells):
                if i < len(headers):
                    row_data[headers[i]] = cell.inner_text().strip()
            if row_data:
                dados.append(row_data)
    
    return dados

def enviar_webhook(dados, nome_arquivo):
    """Envia dados para o webhook"""
    payload = {
        "corretora_id": CORRETORA_ID,
        "dados": dados,
        "nome_arquivo": nome_arquivo,
        "mes_referencia": datetime.now().strftime("%Y-%m"),
    }
    
    headers = {
        "Content-Type": "application/json",
    }
    
    if WEBHOOK_SECRET:
        headers["x-webhook-secret"] = WEBHOOK_SECRET
    
    log(f"Enviando {len(dados)} registros para webhook...")
    
    response = requests.post(
        WEBHOOK_URL,
        json=payload,
        headers=headers,
        timeout=120
    )
    
    if response.status_code == 200:
        result = response.json()
        log(f"Webhook OK: {result.get('message', 'Sucesso')}")
        return True
    else:
        log(f"Erro no webhook: {response.status_code} - {response.text}")
        return False

def rodar_robo():
    """Executa o robô de automação"""
    log("=" * 50)
    log("INICIANDO ROBÔ DE COBRANÇA HINOVA")
    log("=" * 50)
    
    data_inicio, data_fim = get_date_range()
    log(f"Período: {data_inicio} até {data_fim}")
    
    with sync_playwright() as p:
        # Iniciar navegador (headless=True para rodar sem interface)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        try:
            # 1. Acessar página de login
            log("Acessando portal Hinova...")
            page.goto(HINOVA_URL, wait_until="networkidle")
            
            # 2. Fazer login
            log("Realizando login...")
            page.fill('input[name="login"], input[name="usuario"], input[type="text"]:first-of-type', HINOVA_USER)
            page.fill('input[name="senha"], input[type="password"]', HINOVA_PASS)
            page.click('input[type="submit"], button[type="submit"], .btn-login, #btn-login')
            
            page.wait_for_load_state("networkidle")
            log("Login realizado!")
            
            # 3. Navegar até Relatório de Boletos
            log("Navegando para Relatório de Boletos...")
            
            # Clicar no menu Relatório
            page.click('text=Relatório, text=Relatórios, a:has-text("Relatório")', timeout=10000)
            page.wait_for_timeout(1000)
            
            # Clicar em 11.3 Relatório Boletos
            page.click('text=11.3, text=Relatório Boletos, a:has-text("Boletos")', timeout=10000)
            page.wait_for_load_state("networkidle")
            log("Página de relatório aberta!")
            
            # 4. Preencher filtros
            log("Preenchendo filtros...")
            
            # Data Vencimento Original - Início
            data_inicio_input = page.query_selector('input[name*="data_inicio"], input[name*="vencimento_inicial"]')
            if data_inicio_input:
                data_inicio_input.fill(data_inicio)
            
            # Data Vencimento Original - Fim
            data_fim_input = page.query_selector('input[name*="data_fim"], input[name*="vencimento_final"]')
            if data_fim_input:
                data_fim_input.fill(data_fim)
            
            # Desmarcar "Cancelado" em Situação do Boleto
            cancelado_checkbox = page.query_selector('input[value="CANCELADO"], label:has-text("Cancelado") input')
            if cancelado_checkbox and cancelado_checkbox.is_checked():
                cancelado_checkbox.uncheck()
            
            # Boletos Anteriores - Selecionar "Não possui"
            boletos_anteriores = page.query_selector('select[name*="anteriores"], select[name*="boletos_ant"]')
            if boletos_anteriores:
                boletos_anteriores.select_option(label="Não possui")
            
            # Referência Original - Situação do boleto: desmarcar todos e marcar só "Aberto"
            # Primeiro desmarca todos
            situacao_checkboxes = page.query_selector_all('input[name*="situacao_ref"], input[name*="ref_situacao"]')
            for cb in situacao_checkboxes:
                if cb.is_checked():
                    cb.uncheck()
            
            # Marca só "Aberto"
            aberto_checkbox = page.query_selector('input[value="ABERTO"], label:has-text("Aberto") input')
            if aberto_checkbox:
                aberto_checkbox.check()
            
            # Selecionar layout "BI - Vangard Cobrança"
            layout_select = page.query_selector('select[name*="layout"], select[name*="visualiza"]')
            if layout_select:
                layout_select.select_option(label="BI - Vangard Cobrança")
            
            log("Filtros preenchidos!")
            
            # 5. Gerar relatório
            log("Gerando relatório...")
            page.click('input[type="submit"]:has-text("Gerar"), button:has-text("Gerar"), .btn-gerar')
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(5000)  # Aguardar processamento
            
            # 6. Extrair dados da tabela
            log("Extraindo dados...")
            dados = extrair_dados_tabela(page)
            log(f"Total de registros extraídos: {len(dados)}")
            
            if not dados:
                log("AVISO: Nenhum dado encontrado!")
                # Salvar screenshot para debug
                page.screenshot(path="debug_hinova.png")
                log("Screenshot salvo: debug_hinova.png")
                return False
            
            # 7. Enviar para webhook
            nome_arquivo = f"Hinova_Boletos_{data_fim.replace('/', '-')}.json"
            sucesso = enviar_webhook(dados, nome_arquivo)
            
            return sucesso
            
        except Exception as e:
            log(f"ERRO: {str(e)}")
            # Salvar screenshot para debug
            try:
                page.screenshot(path="erro_hinova.png")
                log("Screenshot de erro salvo: erro_hinova.png")
            except:
                pass
            return False
            
        finally:
            browser.close()

# ============================================
# EXECUÇÃO
# ============================================

if __name__ == "__main__":
    try:
        sucesso = rodar_robo()
        if sucesso:
            log("✅ ROBÔ FINALIZADO COM SUCESSO!")
        else:
            log("❌ ROBÔ FINALIZADO COM ERROS")
            exit(1)
    except Exception as e:
        log(f"❌ ERRO FATAL: {e}")
        exit(1)
