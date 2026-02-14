
-- Tabela de credenciais Hinova unificadas por associação
CREATE TABLE public.hinova_credenciais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  hinova_url TEXT NOT NULL DEFAULT '',
  hinova_user TEXT NOT NULL DEFAULT '',
  hinova_pass TEXT NOT NULL DEFAULT '',
  hinova_codigo_cliente TEXT DEFAULT '',
  layout_cobranca TEXT DEFAULT '',
  layout_eventos TEXT DEFAULT '',
  layout_mgf TEXT DEFAULT '',
  hora_agendada TEXT DEFAULT '09:00',
  ativo_cobranca BOOLEAN DEFAULT false,
  ativo_eventos BOOLEAN DEFAULT false,
  ativo_mgf BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(corretora_id)
);

ALTER TABLE public.hinova_credenciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hinova_credenciais"
  ON public.hinova_credenciais FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert hinova_credenciais"
  ON public.hinova_credenciais FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update hinova_credenciais"
  ON public.hinova_credenciais FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE TRIGGER update_hinova_credenciais_updated_at
  BEFORE UPDATE ON public.hinova_credenciais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate data from cobranca config
INSERT INTO public.hinova_credenciais (
  corretora_id, hinova_url, hinova_user, hinova_pass, hinova_codigo_cliente,
  layout_cobranca, hora_agendada, ativo_cobranca
)
SELECT 
  c.corretora_id, c.hinova_url, c.hinova_user, c.hinova_pass, 
  c.hinova_codigo_cliente, c.layout_relatorio, 
  COALESCE(c.hora_agendada::text, '09:00'),
  c.ativo
FROM cobranca_automacao_config c
ON CONFLICT (corretora_id) DO NOTHING;

-- Update with SGA config data (no layout_relatorio column)
UPDATE public.hinova_credenciais hc
SET ativo_eventos = s.ativo
FROM sga_automacao_config s
WHERE hc.corretora_id = s.corretora_id;

-- Update with MGF config data  
UPDATE public.hinova_credenciais hc
SET layout_mgf = m.layout_relatorio,
    ativo_mgf = m.ativo
FROM mgf_automacao_config m
WHERE hc.corretora_id = m.corretora_id;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.hinova_credenciais;
