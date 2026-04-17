
-- 1) Excluir Lucas Nunes duplicado (mantém o que tem 211 registros)
DELETE FROM registros_ponto WHERE funcionario_id = 'a7fbe08c-bf42-47d4-b405-b3f825e885a1';
DELETE FROM funcionarios WHERE id = 'a7fbe08c-bf42-47d4-b405-b3f825e885a1';

-- 2) Criar tabela de feriados (compartilhada para todos)
CREATE TABLE IF NOT EXISTS public.feriados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nacional',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view feriados" ON public.feriados
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage feriados" ON public.feriados
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role));

-- Feriados nacionais 2026 BR
INSERT INTO public.feriados (data, descricao, tipo) VALUES
  ('2026-01-01', 'Confraternização Universal', 'nacional'),
  ('2026-02-16', 'Carnaval', 'nacional'),
  ('2026-02-17', 'Carnaval', 'nacional'),
  ('2026-02-18', 'Quarta-feira de Cinzas', 'nacional'),
  ('2026-04-03', 'Sexta-feira Santa', 'nacional'),
  ('2026-04-21', 'Tiradentes', 'nacional'),
  ('2026-05-01', 'Dia do Trabalho', 'nacional'),
  ('2026-06-04', 'Corpus Christi', 'nacional'),
  ('2026-09-07', 'Independência', 'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2026-11-02', 'Finados', 'nacional'),
  ('2026-11-15', 'Proclamação da República', 'nacional'),
  ('2026-12-25', 'Natal', 'nacional')
ON CONFLICT (data) DO NOTHING;
