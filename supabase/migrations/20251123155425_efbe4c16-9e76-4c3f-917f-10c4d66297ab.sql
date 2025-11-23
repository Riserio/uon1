-- Criar tabela para gerenciar subdomínios personalizados
CREATE TABLE public.subdominios_personalizados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subdominio TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT subdominios_personalizados_subdominio_check CHECK (
    subdominio ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' AND
    length(subdominio) >= 3 AND
    length(subdominio) <= 63
  )
);

-- Índice para buscar por user_id
CREATE INDEX idx_subdominios_user_id ON public.subdominios_personalizados(user_id);

-- Índice para buscar por subdomínio ativo
CREATE INDEX idx_subdominios_ativo ON public.subdominios_personalizados(subdominio) WHERE ativo = true;

-- Enable RLS
ALTER TABLE public.subdominios_personalizados ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view own subdominios"
  ON public.subdominios_personalizados
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subdominios"
  ON public.subdominios_personalizados
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subdominios"
  ON public.subdominios_personalizados
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Superintendente can view all subdominios"
  ON public.subdominios_personalizados
  FOR SELECT
  USING (has_role(auth.uid(), 'superintendente'::app_role));

CREATE POLICY "Superintendente can manage all subdominios"
  ON public.subdominios_personalizados
  FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_subdominios_updated_at
  BEFORE UPDATE ON public.subdominios_personalizados
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.subdominios_personalizados IS 'Tabela para gerenciar subdomínios personalizados dos parceiros';
COMMENT ON COLUMN public.subdominios_personalizados.subdominio IS 'Subdomínio personalizado (ex: vangard para vangard.uon1.lovable.app)';