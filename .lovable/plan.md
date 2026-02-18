
## Otimizações de Performance e Custo — Todos os Robôs Hinova

### Contexto do Problema

O download manual direto no portal leva 3-5 minutos. O robô leva até 57 minutos. A diferença está em **overhead acumulado de esperas fixas e capturas de debug** inseridas no fluxo feliz (caminho sem erros), não no tempo de geração do relatório pelo servidor.

---

### O que será alterado nos 3 robôs

As mudanças são cirúrgicas e aplicadas de forma consistente nos três scripts:

---

#### 1. Limitar tentativas de login para 5 (era 20)

**Impacto:** Evita desperdiçar até 2,6 minutos tentando logar quando há falha real de credencial ou portal fora do ar. Cinco tentativas são mais do que suficientes para absorver latência transitória.

| Arquivo | Linha | Antes | Depois |
|---|---|---|---|
| `robo-sga-hinova.cjs` | 107 | `MAX_LOGIN_RETRIES: 20` | `MAX_LOGIN_RETRIES: 5` |
| `robo-mgf-hinova.cjs` | 191 | `MAX_LOGIN_RETRIES: 20` | `MAX_LOGIN_RETRIES: 5` |
| `robo-cobranca-hinova.cjs` | 201 | `MAX_LOGIN_RETRIES: 20` | `MAX_LOGIN_RETRIES: 5` |

---

#### 2. Reduzir `LOGIN_RETRY_WAIT` de 8s para 5s

Cinco segundos é tempo suficiente para o portal responder entre tentativas.

| Arquivo | Linha | Antes | Depois |
|---|---|---|---|
| `robo-sga-hinova.cjs` | 96 | `LOGIN_RETRY_WAIT: 8000` | `LOGIN_RETRY_WAIT: 5000` |
| `robo-mgf-hinova.cjs` | 180 | `LOGIN_RETRY_WAIT: 8000` | `LOGIN_RETRY_WAIT: 5000` |
| `robo-cobranca-hinova.cjs` | 187 | `LOGIN_RETRY_WAIT: 8000` | `LOGIN_RETRY_WAIT: 5000` |

---

#### 3. Remover `saveDebugInfo` do fluxo de sucesso (maior ganho)

Capturas de screenshot full-page + HTML em modo headless custam 10-30 segundos **cada**. Atualmente são chamadas 3-4 vezes mesmo quando tudo corre bem. Serão mantidas **somente em blocos `catch` (falha real)**.

**SGA (`robo-sga-hinova.cjs`):**
- Linha 1391: remover `saveDebugInfo(page, context, 'Antes do login')` — no fluxo feliz, desnecessário
- Linha 1534: remover `saveDebugInfo(page, context, 'Após datas')`
- Linha 1543: remover `saveDebugInfo(page, context, 'Após layout')`
- Linha 1551: remover `saveDebugInfo(page, context, 'Após excel')`
- Mantidas: linha 1490 (falha de login) e linha 1593 (timeout de download)

---

#### 4. Substituir `waitForTimeout` fixos por waits condicionais

Substituir pausas cegas por esperas que avançam assim que o portal responder:

**SGA (`robo-sga-hinova.cjs`):**
- Linha 1390: `waitForTimeout(3000)` → substituído pelo `waitForSelector` da senha já presente na linha 1394 (a pausa fixa é redundante, o selector já aguarda)
- Linha 1509: `waitForTimeout(5000)` após navegar → `waitForLoadState('domcontentloaded', { timeout: 15000 })`
- Linha 1512: `waitForLoadState('networkidle', { timeout: 60000 })` → reduzido para 15000ms (o portal pode ter polling ativo — esperar `networkidle` por 60s é o pior cenário)
- Linha 1542: `waitForTimeout(2000)` após layout → reduzido para 500ms
- Linha 1550: `waitForTimeout(1000)` após excel → mantido (pequeno, necessário para UI estabilizar)

**MGF e Cobrança:** mesmas substituições nos trechos equivalentes (linhas 2404/2947 para o `waitForTimeout(3000)` pós-navegação e linhas 2599/3151 para o `waitForTimeout(5000)` pós-relatório).

---

#### 5. Reduzir timeouts de download (SGA e MGF)

O download manual leva 3-5 min. Com margem de segurança generosa de 3x, 20 minutos é o suficiente. Se o portal não entregou em 20 minutos, ele provavelmente está com problema real.

**SGA (`robo-sga-hinova.cjs`)** — linhas 94-104:
```text
DOWNLOAD_TOTAL: 55 min → 20 min
DOWNLOAD_SAVE:  55 min → 20 min
DOWNLOAD_IDLE:  40 min → 15 min (se nenhum byte em 15 min = stall)
DOWNLOAD_HARD:  55 min → 20 min
```

**MGF (`robo-mgf-hinova.cjs`)** — linhas 178-186:
- MGF tem relatórios maiores (255MB). Manter margem maior: `DOWNLOAD_TOTAL/HARD: 40 min`, `DOWNLOAD_IDLE: 30 min`

**Cobrança (`robo-cobranca-hinova.cjs`)** — linhas 185-196:
- Já está com valores mais conservadores (40/55 min). Ajustar para: `DOWNLOAD_TOTAL/SAVE/IDLE: 25 min`, `DOWNLOAD_HARD: 30 min`

---

#### 6. Ajustar `timeout-minutes` dos workflows do GitHub Actions

Com os novos timeouts dos robôs, os workflows precisam ter folga para o step de fallback de erro rodar:

| Workflow | Antes | Depois |
|---|---|---|
| `eventos-hinova.yml` (SGA) | 60 min | 30 min |
| `mgf-hinova.yml` | 60 min | 50 min (relatório maior) |
| `cobranca-hinova.yml` | 60 min | 40 min |

---

### Ganho Estimado por Execução (SGA/Eventos)

| Ponto de melhoria | Economia estimada |
|---|---|
| Remover 4x `saveDebugInfo` no fluxo feliz | 1-4 minutos |
| Eliminar `waitForTimeout(3000)` redundante no login | ~3 segundos |
| Reduzir `waitForTimeout(5000)` → `domcontentloaded` | 0-5 segundos (avança quando pronto) |
| Reduzir `networkidle` 60s → 15s | 0-45 segundos |
| Reduzir retries: 5 × 5s (vs 20 × 8s em falha) | até 135 segundos em falha |
| Timeout de download 55 min → 20 min (em caso de stall) | 35 minutos poupados no pior caso |

---

### Arquivos a Modificar

1. `scripts/robo-sga-hinova.cjs` — TIMEOUTS, LIMITS, waits fixos, saveDebugInfo no fluxo feliz
2. `scripts/robo-mgf-hinova.cjs` — TIMEOUTS, LIMITS, waits fixos, saveDebugInfo no fluxo feliz
3. `scripts/robo-cobranca-hinova.cjs` — TIMEOUTS, LIMITS, waits fixos, saveDebugInfo no fluxo feliz
4. `.github/workflows/eventos-hinova.yml` — `timeout-minutes: 60` → `30`
5. `.github/workflows/mgf-hinova.yml` — `timeout-minutes: 60` → `50`
6. `.github/workflows/cobranca-hinova.yml` — `timeout-minutes: 60` → `40`
