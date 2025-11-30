-- Tabela para configurar prazos de vistoria por associação (corretora)
CREATE TABLE IF NOT EXISTS public.vistoria_prazo_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  prazo_dias INTEGER NOT NULL DEFAULT 3,
  prazo_horas INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(corretora_id)
);

-- Enable RLS
ALTER TABLE public.vistoria_prazo_config ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view vistoria_prazo_config"
ON public.vistoria_prazo_config
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can manage vistoria_prazo_config"
ON public.vistoria_prazo_config
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Adicionar campos na tabela vistorias para prazo
ALTER TABLE public.vistorias 
ADD COLUMN IF NOT EXISTS prazo_validade TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS prazo_manual BOOLEAN DEFAULT false;

-- Trigger para updated_at
CREATE TRIGGER update_vistoria_prazo_config_updated_at
BEFORE UPDATE ON public.vistoria_prazo_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();