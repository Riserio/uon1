
CREATE TABLE public.backfill_recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id uuid NOT NULL,
  modulo text NOT NULL CHECK (modulo IN ('cobranca','eventos','mgf')),
  ativo boolean NOT NULL DEFAULT true,
  offset_dias integer NOT NULL DEFAULT 1 CHECK (offset_dias >= 0 AND offset_dias <= 30),
  ultima_execucao_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretora_id, modulo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backfill_recurrences TO authenticated;
GRANT ALL ON public.backfill_recurrences TO service_role;

ALTER TABLE public.backfill_recurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam todas recorrencias"
ON public.backfill_recurrences FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superintendente'::app_role));

CREATE POLICY "Usuarios veem recorrencias da sua corretora"
ON public.backfill_recurrences FOR SELECT TO authenticated
USING (corretora_id = get_user_corretora_id(auth.uid()));

CREATE POLICY "Usuarios inserem recorrencias da sua corretora"
ON public.backfill_recurrences FOR INSERT TO authenticated
WITH CHECK (corretora_id = get_user_corretora_id(auth.uid()));

CREATE POLICY "Usuarios atualizam recorrencias da sua corretora"
ON public.backfill_recurrences FOR UPDATE TO authenticated
USING (corretora_id = get_user_corretora_id(auth.uid()))
WITH CHECK (corretora_id = get_user_corretora_id(auth.uid()));

CREATE POLICY "Usuarios deletam recorrencias da sua corretora"
ON public.backfill_recurrences FOR DELETE TO authenticated
USING (corretora_id = get_user_corretora_id(auth.uid()));

CREATE TRIGGER trg_backfill_recurrences_updated_at
BEFORE UPDATE ON public.backfill_recurrences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função que enfileira jobs para as recorrências cujo horário (America/Sao_Paulo) já passou hoje
-- e que ainda não foram executadas hoje.
CREATE OR REPLACE FUNCTION public.enqueue_recurrent_backfills()
RETURNS TABLE(corretora_id uuid, modulo text, data_alvo date, job_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_now_sp timestamptz := now() AT TIME ZONE 'America/Sao_Paulo';
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_hora text;
  v_ativo_cfg boolean;
  v_data_alvo date;
  v_new_id uuid;
BEGIN
  FOR r IN
    SELECT br.id, br.corretora_id, br.modulo, br.offset_dias, br.ultima_execucao_em
    FROM public.backfill_recurrences br
    WHERE br.ativo = true
  LOOP
    -- Já rodou hoje?
    IF r.ultima_execucao_em IS NOT NULL
       AND (r.ultima_execucao_em AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN
      CONTINUE;
    END IF;

    -- Lê hora_agendada da config do módulo
    v_hora := NULL;
    v_ativo_cfg := NULL;
    IF r.modulo = 'cobranca' THEN
      SELECT hora_agendada, ativo INTO v_hora, v_ativo_cfg
      FROM public.cobranca_automacao_config WHERE corretora_id = r.corretora_id LIMIT 1;
    ELSIF r.modulo = 'eventos' THEN
      SELECT hora_agendada, ativo INTO v_hora, v_ativo_cfg
      FROM public.sga_automacao_config WHERE corretora_id = r.corretora_id LIMIT 1;
    ELSIF r.modulo = 'mgf' THEN
      SELECT hora_agendada, ativo INTO v_hora, v_ativo_cfg
      FROM public.mgf_automacao_config WHERE corretora_id = r.corretora_id LIMIT 1;
    END IF;

    -- Fallback de horário se não houver
    IF v_hora IS NULL OR v_hora = '' THEN
      v_hora := '03:00';
    END IF;

    -- Horário ainda não chegou hoje (SP)?
    IF to_char(v_now_sp, 'HH24:MI') < substring(v_hora from 1 for 5) THEN
      CONTINUE;
    END IF;

    v_data_alvo := v_today - r.offset_dias;

    -- Evita duplicar job para o mesmo dia
    IF EXISTS (
      SELECT 1 FROM public.backfill_jobs
      WHERE corretora_id = r.corretora_id
        AND modulo = r.modulo
        AND data_inicio = v_data_alvo
        AND data_fim = v_data_alvo
        AND status IN ('pendente','executando','concluido')
    ) THEN
      UPDATE public.backfill_recurrences SET ultima_execucao_em = now() WHERE id = r.id;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.backfill_jobs (corretora_id, modulo, data_inicio, data_fim, status, created_by)
      VALUES (r.corretora_id, r.modulo, v_data_alvo, v_data_alvo, 'pendente', NULL)
      RETURNING id INTO v_new_id;

      UPDATE public.backfill_recurrences SET ultima_execucao_em = now() WHERE id = r.id;

      corretora_id := r.corretora_id;
      modulo := r.modulo;
      data_alvo := v_data_alvo;
      job_id := v_new_id;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- overlap/exclusion: ignora e marca como executado pra não retentar em loop
      UPDATE public.backfill_recurrences SET ultima_execucao_em = now() WHERE id = r.id;
    END;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_recurrent_backfills() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_recurrent_backfills() TO service_role, authenticated;

-- Cron a cada 5 minutos
DO $$
DECLARE jid integer;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'enqueue-recurrent-backfills';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
  PERFORM cron.schedule(
    'enqueue-recurrent-backfills',
    '*/5 * * * *',
    $cron$ SELECT public.enqueue_recurrent_backfills(); $cron$
  );
END $$;
