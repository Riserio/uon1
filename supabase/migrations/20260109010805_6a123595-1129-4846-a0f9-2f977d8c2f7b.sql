-- Tabela para configuração de inadimplência referência por dia
CREATE TABLE public.cobranca_inadimplencia_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  mes_referencia VARCHAR(7) NOT NULL, -- formato: YYYY-MM
  dia INTEGER NOT NULL CHECK (dia >= 1 AND dia <= 31),
  percentual_referencia NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (percentual_referencia >= 0 AND percentual_referencia <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(corretora_id, mes_referencia, dia)
);

-- Enable RLS
ALTER TABLE public.cobranca_inadimplencia_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Authenticated users can read inadimplencia config"
  ON public.cobranca_inadimplencia_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert inadimplencia config"
  ON public.cobranca_inadimplencia_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update inadimplencia config"
  ON public.cobranca_inadimplencia_config
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete inadimplencia config"
  ON public.cobranca_inadimplencia_config
  FOR DELETE
  TO authenticated
  USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_cobranca_inadimplencia_config_updated_at
  BEFORE UPDATE ON public.cobranca_inadimplencia_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();