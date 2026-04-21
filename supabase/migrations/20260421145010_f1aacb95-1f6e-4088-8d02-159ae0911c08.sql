
CREATE TABLE IF NOT EXISTS public.vistoria_fotos_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_vistoria TEXT NOT NULL,
  tipo_sinistro TEXT,
  label TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  obrigatoria BOOLEAN NOT NULL DEFAULT true,
  instrucoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vistoria_fotos_config_tipo
  ON public.vistoria_fotos_config(tipo_vistoria, tipo_sinistro);

ALTER TABLE public.vistoria_fotos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view fotos config"
  ON public.vistoria_fotos_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage fotos config"
  ON public.vistoria_fotos_config FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role));

CREATE TRIGGER update_vistoria_fotos_config_updated_at
  BEFORE UPDATE ON public.vistoria_fotos_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default photos for each tipo_vistoria
INSERT INTO public.vistoria_fotos_config (tipo_vistoria, tipo_sinistro, label, ordem, obrigatoria, instrucoes) VALUES
  ('sinistro', NULL, 'Frente do veículo', 1, true, 'Foto frontal completa do veículo'),
  ('sinistro', NULL, 'Traseira do veículo', 2, true, 'Foto traseira completa do veículo'),
  ('sinistro', NULL, 'Lateral direita', 3, true, 'Foto da lateral direita completa'),
  ('sinistro', NULL, 'Lateral esquerda', 4, true, 'Foto da lateral esquerda completa'),
  ('sinistro', NULL, 'Painel/Hodômetro', 5, true, 'Foto do painel mostrando KM'),
  ('sinistro', NULL, 'Chassi', 6, true, 'Foto do número do chassi'),
  ('sinistro', NULL, 'Documento (CRLV)', 7, true, 'Foto do documento do veículo'),
  ('sinistro', NULL, 'Danos do sinistro', 8, true, 'Fotos detalhadas dos danos'),
  ('reativacao', NULL, 'Frente do veículo', 1, true, 'Foto frontal completa'),
  ('reativacao', NULL, 'Traseira do veículo', 2, true, 'Foto traseira completa'),
  ('reativacao', NULL, 'Lateral direita', 3, true, 'Foto da lateral direita'),
  ('reativacao', NULL, 'Lateral esquerda', 4, true, 'Foto da lateral esquerda'),
  ('reativacao', NULL, 'Painel/Hodômetro', 5, true, 'Foto do painel mostrando KM'),
  ('reativacao', NULL, 'Documento (CRLV)', 6, true, 'Foto do documento do veículo')
ON CONFLICT DO NOTHING;
