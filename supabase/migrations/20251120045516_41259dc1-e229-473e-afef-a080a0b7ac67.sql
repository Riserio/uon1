-- Criar tabela para configuração de status públicos
CREATE TABLE IF NOT EXISTS public.status_publicos_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id UUID NOT NULL REFERENCES public.fluxos(id) ON DELETE CASCADE,
  status_nome TEXT NOT NULL,
  visivel_publico BOOLEAN DEFAULT true,
  ordem_exibicao INTEGER DEFAULT 0,
  descricao_publica TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index para performance
CREATE INDEX idx_status_publicos_fluxo ON public.status_publicos_config(fluxo_id);
CREATE INDEX idx_status_publicos_visivel ON public.status_publicos_config(visivel_publico);

-- RLS policies
ALTER TABLE public.status_publicos_config ENABLE ROW LEVEL SECURITY;

-- Admins e superintendentes podem gerenciar
CREATE POLICY "Admins can manage status publicos config"
  ON public.status_publicos_config
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'superintendente'::app_role)
  );

-- Qualquer pessoa pode ver status públicos (para página de acompanhamento)
CREATE POLICY "Anyone can view public status config"
  ON public.status_publicos_config
  FOR SELECT
  USING (visivel_publico = true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_status_publicos_config_updated_at
  BEFORE UPDATE ON public.status_publicos_config
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();