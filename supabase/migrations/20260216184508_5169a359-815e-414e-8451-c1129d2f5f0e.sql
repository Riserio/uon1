
-- Tabela para rastrear visitas dos usuários
CREATE TABLE public.visitor_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  page TEXT NOT NULL,
  referrer TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  screen_width INT,
  screen_height INT,
  language TEXT,
  timezone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  duration_seconds INT DEFAULT 0
);

-- Índices para performance
CREATE INDEX idx_visitor_logs_created_at ON public.visitor_logs (created_at DESC);
CREATE INDEX idx_visitor_logs_session_id ON public.visitor_logs (session_id);
CREATE INDEX idx_visitor_logs_page ON public.visitor_logs (page);

-- RLS
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;

-- Permitir inserção por qualquer usuário autenticado
CREATE POLICY "Authenticated users can insert visitor logs"
  ON public.visitor_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Apenas admins podem ler
CREATE POLICY "Admins can read visitor logs"
  ON public.visitor_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'superintendente'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
  );
