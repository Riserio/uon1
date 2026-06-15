---
name: BI Backfill por período
description: Fila persistente de download por período (Cobrança, Eventos, MGF) com presets, execução automática 1-por-vez por associação e overlap bloqueado.
type: feature
---

Aba "Backfill" no modal de Sincronização (`BISyncButton`):

- Tabela `backfill_jobs` com constraint `EXCLUDE USING gist` impedindo overlap de períodos para a mesma corretora+módulo em status (pendente/executando/concluido).
- Presets BR: Mês anterior, Mês atual, Últimos 6 meses, Ano anterior, Ano atual, Tudo (desde 2020).
- Modo "Por dia" cria job com `data_inicio = data_fim`.
- Worker `backfill-worker` agendado via pg_cron a cada 1 minuto: sincroniza progresso dos `executando` via `execucao_id` e claim_next_backfill_job (RPC SECURITY DEFINER, FOR UPDATE SKIP LOCKED) garante 1 job por associação por vez.
- Worker chama `disparar-{github|sga|mgf}-workflow` com `bypass_daily_limit: true` (validado via service-role auth) e `data_inicio`/`data_fim` (ISO `YYYY-MM-DD`, convertidos a `DD/MM/YYYY` no SGA).
- Disparo imediato após inserir job: `supabase.functions.invoke("backfill-worker")` no client.
- Realtime na tabela `backfill_jobs` mantém UI ao vivo.
- Timeout de segurança: 60 minutos sem terminar marca o job como `falhou`.
- Importante: os workflows do GitHub para Cobrança e MGF ainda precisam ler `data_inicio`/`data_fim` da entrada para honrar o período no scraping; o plumbing do Supabase já envia.