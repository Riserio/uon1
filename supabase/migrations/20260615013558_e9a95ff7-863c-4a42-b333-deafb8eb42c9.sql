
-- Habilitar extensão para constraints de range (já vem instalada no Supabase)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Tabela de jobs de backfill
CREATE TABLE public.backfill_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL CHECK (modulo IN ('cobranca', 'eventos', 'mgf')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'executando', 'concluido', 'falhou', 'cancelado')),
  progresso INT NOT NULL DEFAULT 0,
  registros_importados INT,
  erro TEXT,
  github_run_id TEXT,
  github_run_url TEXT,
  execucao_id UUID,
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_inicio <= data_fim)
);

-- Bloqueio de overlap (mesma corretora + módulo, períodos sobrepostos em status ativos)
ALTER TABLE public.backfill_jobs
  ADD CONSTRAINT backfill_jobs_no_overlap
  EXCLUDE USING gist (
    corretora_id WITH =,
    modulo WITH =,
    daterange(data_inicio, data_fim, '[]') WITH &&
  ) WHERE (status IN ('pendente','executando','concluido'));

CREATE INDEX idx_backfill_jobs_status ON public.backfill_jobs(status, created_at);
CREATE INDEX idx_backfill_jobs_corretora ON public.backfill_jobs(corretora_id, modulo, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backfill_jobs TO authenticated;
GRANT ALL ON public.backfill_jobs TO service_role;

ALTER TABLE public.backfill_jobs ENABLE ROW LEVEL SECURITY;

-- Admin/superintendente: acesso total
CREATE POLICY "Admin total access backfill_jobs"
  ON public.backfill_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role));

-- Usuários da corretora: visualizar
CREATE POLICY "Users view own corretora backfill_jobs"
  ON public.backfill_jobs FOR SELECT TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid()));

-- Usuários da corretora: inserir
CREATE POLICY "Users insert own corretora backfill_jobs"
  ON public.backfill_jobs FOR INSERT TO authenticated
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid()));

-- Usuários da corretora: atualizar (para cancelar)
CREATE POLICY "Users update own corretora backfill_jobs"
  ON public.backfill_jobs FOR UPDATE TO authenticated
  USING (corretora_id = public.get_user_corretora_id(auth.uid()))
  WITH CHECK (corretora_id = public.get_user_corretora_id(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_backfill_jobs_updated_at
  BEFORE UPDATE ON public.backfill_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.backfill_jobs;
ALTER TABLE public.backfill_jobs REPLICA IDENTITY FULL;

-- Função para pegar o próximo job pendente de uma corretora (1 por vez por associação)
CREATE OR REPLACE FUNCTION public.claim_next_backfill_job(_corretora_id UUID DEFAULT NULL)
RETURNS public.backfill_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.backfill_jobs;
BEGIN
  -- Pega 1 job pendente, somente se a corretora não tem nenhum 'executando'
  SELECT * INTO job
  FROM public.backfill_jobs bj
  WHERE bj.status = 'pendente'
    AND (_corretora_id IS NULL OR bj.corretora_id = _corretora_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.backfill_jobs bj2
      WHERE bj2.corretora_id = bj.corretora_id
        AND bj2.status = 'executando'
    )
  ORDER BY bj.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF job.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.backfill_jobs
  SET status = 'executando',
      iniciado_em = now(),
      progresso = 5
  WHERE id = job.id
  RETURNING * INTO job;

  RETURN job;
END;
$$;
