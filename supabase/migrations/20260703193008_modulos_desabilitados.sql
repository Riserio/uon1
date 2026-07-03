-- Gestão global de módulos: módulos desabilitados ficam ocultos no menu para todos os usuários.
-- Presença da linha = módulo desabilitado.

CREATE TABLE IF NOT EXISTS public.modulos_desabilitados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id text NOT NULL UNIQUE,
  desabilitado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  desabilitado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modulos_desabilitados ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (o menu precisa saber o que ocultar)
DROP POLICY IF EXISTS "Authenticated can view modulos desabilitados" ON public.modulos_desabilitados;
CREATE POLICY "Authenticated can view modulos desabilitados"
  ON public.modulos_desabilitados
  FOR SELECT
  TO authenticated
  USING (true);

-- Apenas admin/administrativo/superintendente gerenciam
DROP POLICY IF EXISTS "Admins manage modulos desabilitados" ON public.modulos_desabilitados;
CREATE POLICY "Admins manage modulos desabilitados"
  ON public.modulos_desabilitados
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'superintendente'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'superintendente'::app_role)
  );

-- Realtime para refletir a mudança em todas as sessões
ALTER TABLE public.modulos_desabilitados REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.modulos_desabilitados;
