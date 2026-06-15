
UPDATE public.sga_automacao_execucoes
SET status = 'erro',
    erro = COALESCE(erro, 'Execução travada em FILTROS — cancelada manualmente'),
    finalizado_at = COALESCE(finalizado_at, now())
WHERE id = '388aeb47-ab2e-4bf7-8dfe-818f4ee1e491'
  AND status = 'executando';

UPDATE public.backfill_jobs
SET status = 'cancelado',
    erro = 'Cancelado: execução SGA anterior travada em FILTROS',
    concluido_em = now()
WHERE id IN (
  '17a020a7-e00c-42e1-a326-2034cbb08a04',
  'f78e61a3-b593-4da2-ac49-626e252a2dcb'
) AND status = 'pendente';
