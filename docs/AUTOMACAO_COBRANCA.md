# Automação de Cobrança - Hinova

Este documento explica como configurar a automação para buscar relatórios de boletos do portal Hinova e importar automaticamente no sistema de cobrança.

## Arquitetura

```
┌─────────────────┐    ┌───────────────────┐    ┌──────────────────┐
│ Portal Hinova   │    │ Script Local      │    │ Edge Function    │
│ (eris.hinova)   │───►│ (Python/Node)     │───►│ (webhook)        │
│                 │    │ Playwright        │    │                  │
└─────────────────┘    └───────────────────┘    └──────────────────┘
                              │                         │
                              │                         ▼
                              │               ┌──────────────────┐
                              │               │ Supabase         │
                              │               │ cobranca_boletos │
                              └──────────────►│ cobranca_import. │
                                              └──────────────────┘
```

## Opções de Execução

### Opção 1: Script Python (Recomendado)

#### Instalação

```bash
# Instalar dependências
pip install playwright requests

# Instalar navegador Chromium
playwright install chromium
```

#### Configuração

Edite o arquivo `scripts/robo-cobranca-hinova.py`:

```python
HINOVA_URL = "https://eris.hinova.com.br/sga/sgav4_<CLIENTE>/v5/login.php"
HINOVA_USER = "seu_usuario"
HINOVA_PASS = "sua_senha"
CORRETORA_ID = "<SEU_CORRETORA_ID>"
```

Ou use variáveis de ambiente:

```bash
export HINOVA_USER="seu_usuario"
export HINOVA_PASS="sua_senha"
export CORRETORA_ID="<SEU_CORRETORA_ID>"
```

#### Execução Manual

```bash
python scripts/robo-cobranca-hinova.py
```

#### Agendamento Automático (Linux/Mac)

Adicione ao crontab para rodar todo dia às 8h:

```bash
crontab -e

# Adicione a linha:
0 8 * * * cd /caminho/do/projeto && python scripts/robo-cobranca-hinova.py >> /var/log/cobranca.log 2>&1
```

#### Agendamento Automático (Windows)

1. Abra o "Agendador de Tarefas"
2. Crie uma nova tarefa básica
3. Configure para rodar diariamente às 8h
4. Ação: Iniciar programa
5. Programa: `python`
6. Argumentos: `C:\caminho\do\projeto\scripts\robo-cobranca-hinova.py`

---

### Opção 2: Script Node.js

#### Instalação

```bash
npm install playwright axios
npx playwright install chromium
```

#### Execução

```bash
node scripts/robo-cobranca-hinova.cjs
```

---

### Opção 3: n8n Self-Hosted (Interface Visual)

Se preferir uma interface visual:

1. Instale o n8n: https://docs.n8n.io/hosting/
2. Crie um workflow com os nodes:
   - **HTTP Request** (login no Hinova)
   - **HTML Extract** (extrair dados da tabela)
   - **HTTP Request** (enviar para webhook)
3. Configure um trigger de tempo (Schedule Trigger)

---

## Webhook Endpoint

O webhook está disponível em:

```
POST https://<PROJECT_REF>.supabase.co/functions/v1/webhook-cobranca-hinova
```

> Substitua `<PROJECT_REF>` pelo ID do projeto Supabase (disponível nas variáveis de ambiente).

### Payload

```json
{
  "corretora_id": "<SEU_CORRETORA_ID>",
  "dados": [
    {
      "nome": "João Silva",
      "voluntario": "12345",
      "placas": "ABC-1234",
      "cooperativa": "Cooperativa X",
      "regional": "Regional Sul",
      "situacao": "ABERTO",
      "valor": "150,00",
      "data_vencimento": "15/01/2026",
      "data_vencimento_original": "10/01/2026"
    }
  ],
  "nome_arquivo": "Hinova_Boletos_18-01-2026.json",
  "mes_referencia": "2026-01"
}
```

### Headers (Opcionais)

```
Content-Type: application/json
x-webhook-secret: seu_secret_aqui
```

---

## Segurança

### Configurar Secret do Webhook (Opcional)

Para maior segurança, configure um secret no webhook:

1. Adicione o secret nas configurações do projeto
2. Configure a variável `COBRANCA_WEBHOOK_SECRET` no Edge Function
3. Passe o header `x-webhook-secret` nas requisições

---

## Fluxo do Relatório no Hinova

O script automatiza os seguintes passos:

1. **Login** no portal Hinova
2. **Menu** Relatório → 11.3 Relatório Boletos
3. **Filtros**:
   - Data Vencimento Original: 01 do mês até data atual
   - Situação: desmarcar "Cancelado"
   - Boletos Anteriores: "Não possui"
   - Referência Original: apenas "Aberto"
   - Layout: "BI - Vangard Cobrança"
4. **Gerar** relatório
5. **Extrair** dados da tabela
6. **Enviar** para webhook

---

## Troubleshooting

### Erro de Login

Verifique se as credenciais estão corretas e se o portal está acessível.

### Tabela não encontrada

O layout do portal pode ter mudado. Capture um screenshot para debug:

```python
page.screenshot(path="debug.png")
```

### Erro no Webhook

Verifique:
- URL do webhook está correta
- Corretora existe no banco de dados
- Dados estão no formato correto

---

## Monitoramento

Os logs de importação ficam disponíveis em:
- **Histórico de Importações** na tela de Cobrança
- **Audit Logs** no BI (para admins/superintendentes)
