-- 1) sga_importacoes ganha updated_at (a UI consulta esta coluna e recebia 400)
ALTER TABLE public.sga_importacoes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.sga_importacoes SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_sga_importacoes_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sga_importacoes_touch ON public.sga_importacoes;
CREATE TRIGGER trg_sga_importacoes_touch
BEFORE UPDATE ON public.sga_importacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_sga_importacoes_touch();

-- 2) Ouvidoria: escopar policies por corretora (estavam USING(true))
DROP POLICY IF EXISTS "Authenticated users can manage ouvidoria checkpoints" ON public.ouvidoria_checkpoints;
CREATE POLICY "Checkpoints da propria corretora"
ON public.ouvidoria_checkpoints
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ouvidoria_registros r
    WHERE r.id = ouvidoria_checkpoints.registro_id
      AND (
        r.corretora_id = public.get_user_corretora_id(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'superintendente')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ouvidoria_registros r
    WHERE r.id = ouvidoria_checkpoints.registro_id
      AND (
        r.corretora_id = public.get_user_corretora_id(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'superintendente')
      )
  )
);

DROP POLICY IF EXISTS "Authenticated users can insert ouvidoria historico" ON public.ouvidoria_historico;
DROP POLICY IF EXISTS "Authenticated users can view ouvidoria historico" ON public.ouvidoria_historico;

CREATE POLICY "Historico da propria corretora - view"
ON public.ouvidoria_historico
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ouvidoria_registros r
    WHERE r.id = ouvidoria_historico.registro_id
      AND (
        r.corretora_id = public.get_user_corretora_id(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'superintendente')
      )
  )
);

CREATE POLICY "Historico da propria corretora - insert"
ON public.ouvidoria_historico
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ouvidoria_registros r
    WHERE r.id = ouvidoria_historico.registro_id
      AND (
        r.corretora_id = public.get_user_corretora_id(auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'superintendente')
      )
  )
);