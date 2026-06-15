## Modo "Por dia" — Repetir automaticamente todo dia (D-1)

Adicionar ao painel **Backfill** a opção de salvar **uma regra única** que, todo dia, no horário já configurado em **Configurações de Sincronização** da associação, dispara automaticamente um backfill do **dia anterior** (D-1) para o módulo escolhido.

### UI (`BackfillPanel.tsx`)

No modo **"Por dia"**, abaixo do seletor de data, adicionar:

- Switch **"Repetir automaticamente todo dia"** (busca sempre o dia anterior).
- Quando ativado:
  - O seletor de data some.
  - Mostra um resumo: *"Todo dia às HH:MM (horário de Configurações) busca o dia anterior."*
  - O botão muda para **"Salvar regra automática"** (ou **"Desativar regra"** se já existir).
  - Mostra status atual: *Próxima execução: amanhã às HH:MM →  buscar DD/MM/AAAA*.
- Convive normalmente com jobs manuais via presets/período (não conflita).

### Backend

**Nova tabela `backfill_recurrences`** (1 linha por `corretora_id` + `modulo`):
- `ativo` (bool), `offset_dias` (int, default 1 = D-1), `ultima_execucao_em` (timestamptz).
- Constraint unique (`corretora_id`, `modulo`).
- RLS: mesmas regras de `backfill_jobs`.

**Nova função SQL `enqueue_recurrent_backfills()`** (SECURITY DEFINER):
- Para cada recorrência ativa:
  1. Lê o horário do scheduler já configurado na tabela do módulo (`cobranca_automacao_config.horario_execucao`, `sga_automacao_config.horario_execucao`, `mgf_automacao_config.horario_execucao`).
  2. Se `now() (America/Sao_Paulo)` >= horário e ainda não rodou hoje (`ultima_execucao_em < hoje 00:00`):
     - Calcula `data = hoje - offset_dias`.
     - Insere em `backfill_jobs` (`status: pendente`, ignora se já existir job para esse `data_inicio=data_fim=data`).
     - Atualiza `ultima_execucao_em = now()`.

**Cron `pg_cron`**: roda `enqueue_recurrent_backfills()` a cada 5 minutos. O `backfill-worker` (já existente, a cada 1 min) então pega o job e dispara o robô.

### Resultado

Uma única regra salva por (associação, módulo). O usuário liga uma vez e o sistema executa todo dia no horário definido em **Configurações**, buscando sempre D-1, usando exatamente o mesmo motor de fila do Backfill (1 job por vez, com proteção de overlap e timeout).

### Arquivos

- **Migração**: criar `backfill_recurrences` + função + cron.
- **Editar** `src/components/bi/BackfillPanel.tsx`: switch + status + salvar/remover recorrência.
- **Novo hook** `useBackfillRecurrence.ts`: ler/gravar recorrência ativa por módulo.
