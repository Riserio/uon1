-- base_api_jobs: restringe leitura a corretora do usuario (ou admin/superintendente)
DROP POLICY IF EXISTS p_base_api_jobs_ro ON public.base_api_jobs;
CREATE POLICY p_base_api_jobs_ro ON public.base_api_jobs
FOR SELECT TO authenticated
USING (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
);

-- integracao_sync_log: idem
DROP POLICY IF EXISTS "leitura autenticada do log de integracao" ON public.integracao_sync_log;
CREATE POLICY p_integracao_sync_log_ro ON public.integracao_sync_log
FOR SELECT TO authenticated
USING (
  corretora_id = public.get_user_corretora_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
);

-- sga_eventos_historico: escopo pela importacao (mesma regra do pai sga_eventos)
DROP POLICY IF EXISTS "Authenticated users can read event history" ON public.sga_eventos_historico;
DROP POLICY IF EXISTS "Authenticated users can insert event history" ON public.sga_eventos_historico;

CREATE POLICY p_sga_eventos_historico_ro ON public.sga_eventos_historico
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.sga_importacoes si
    WHERE si.id = sga_eventos_historico.importacao_id
      AND si.corretora_id = public.get_user_corretora_id(auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.sga_eventos se
    JOIN public.sga_importacoes si2 ON si2.id = se.importacao_id
    WHERE se.id = sga_eventos_historico.evento_id
      AND si2.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY p_sga_eventos_historico_ins ON public.sga_eventos_historico
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superintendente')
  OR EXISTS (
    SELECT 1 FROM public.sga_importacoes si
    WHERE si.id = sga_eventos_historico.importacao_id
      AND si.corretora_id = public.get_user_corretora_id(auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.sga_eventos se
    JOIN public.sga_importacoes si2 ON si2.id = se.importacao_id
    WHERE se.id = sga_eventos_historico.evento_id
      AND si2.corretora_id = public.get_user_corretora_id(auth.uid())
  )
);
