## Objetivo

Permitir, em **Configurações → WhatsApp**, criar agendamentos recorrentes (diário, semanal ou mensal) que enviam templates aprovados na Meta (`resumo_eventos`, `resumo_cobranca`, `resumo_mgf`, etc.) com as variáveis `{{1}}, {{2}}…` **preenchidas automaticamente** a partir dos dados atuais do BI da associação — sem precisar de janela de 24h.

## 1. Banco de dados

Nova tabela `whatsapp_template_schedules`:

- `corretora_id` (uuid, FK)
- `template_name` (text) — nome do template aprovado
- `template_language` (text, default `pt_BR`)
- `data_source` (text) — `resumo_eventos` | `resumo_cobranca` | `resumo_mgf`  (define qual edge function gera os valores)
- `recipients` (text[]) — telefones que recebem
- `frequency` (text) — `daily` | `weekly` | `monthly`
- `day_of_week` (int 0–6, nullable, p/ semanal)
- `day_of_month` (int 1–31, nullable, p/ mensal)
- `send_time` (time, default `08:00`) — horário em America/Sao_Paulo
- `ativo` (bool, default true)
- `last_run_at`, `last_status`, `last_error`, `next_run_at`
- RLS: somente usuários da associação (ou admin) leem/escrevem; mesmo padrão das outras tabelas do WhatsApp.

## 2. Edge functions

**`whatsapp-template-schedule-runner`** (novo, invocado a cada 5 min por `pg_cron`):
1. Busca schedules ativos com `next_run_at <= now()`.
2. Para cada um:
   - Chama o gerador correspondente (`gerar-resumo-eventos`, `gerar-resumo-cobranca`, ou um novo `gerar-resumo-mgf`) passando `corretora_id`.
   - Mapeia os campos do JSON retornado nos placeholders do template (mapeamento documentado abaixo).
   - Envia via Meta Cloud API (`type: "template"`) para cada destinatário.
   - Registra em `whatsapp_messages` (`status='sent'`, sem `contact_id` quando não existir) e atualiza `last_run_at`, `last_status`, `next_run_at` conforme `frequency`.

**Mapeamento Template → Dados** (configurável, com defaults):
- `resumo_eventos`: {{1}}=`mes_referencia`, {{2}}=`total_eventos`, {{3}}=`eventos_colisao`, {{4}}=`eventos_vidros`, {{5}}=`eventos_furto_roubo`, {{6}}=`eventos_outros`, {{7}}=`cidade_mais_eventos`, {{8}}=`cooperativa_mais_eventos`.
- `resumo_cobranca`: derivado do retorno de `gerar-resumo-cobranca`.
- `resumo_mgf`: nova função análoga (manutenção/gerenciamento de frota) — placeholder por enquanto até confirmação dos campos.

A primeira vez o usuário visualiza os mapeamentos automáticos; pode sobrescrever em uma coluna `variable_map jsonb` se quiser.

## 3. Agendador

`pg_cron` (já habilitado) chamando o runner a cada 5 minutos via `pg_net`. Migração separada (com a anon key específica do projeto) — não usada em remix.

## 4. UI — Configurações → WhatsApp

Nova seção **"Envios Automáticos por Template"** dentro de `WhatsAppConfig.tsx`:
- Lista de schedules da associação selecionada.
- Botão **"Novo agendamento"** abre dialog com:
  - Select de Template (carregado de `listar-templates-whatsapp`, só `APPROVED`).
  - Origem dos dados (auto-sugerida pelo nome do template).
  - Frequência (Diário / Semanal / Mensal) + Dia da semana / Dia do mês conforme escolha.
  - Horário (`HH:mm`).
  - Destinatários (multi-input com os mesmos números já configurados como sugestão).
  - Toggle ativo.
  - Pré-visualização: chama o gerador e mostra o texto que será enviado.
- Cada linha mostra `Ativo`, `Próxima execução`, `Último envio`, ações `Editar` / `Pausar` / `Excluir` / `Enviar agora`.

## 5. Critérios de aceite

- Criar agendamento diário às 08:00 do template `resumo_eventos` para 2 números → recebimento real às 08:00 com números do mês atual preenchidos.
- Mudar para semanal (segunda-feira) → `next_run_at` reagenda corretamente.
- Pausar → não envia mais; reativar → recalcula `next_run_at`.
- "Enviar agora" dispara fora do horário e registra `last_run_at`.

## Notas técnicas

- Usar `America/Sao_Paulo` para todo cálculo de `next_run_at`.
- O envio é via `type: "template"` então não exige janela de 24h.
- Falha de Meta → grava `last_error`, mantém `ativo`, tenta novamente na próxima janela.
