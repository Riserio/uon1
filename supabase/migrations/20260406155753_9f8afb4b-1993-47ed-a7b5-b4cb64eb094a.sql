
CREATE TABLE public.consultas_veiculo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  placa TEXT NOT NULL,
  renavam TEXT,
  uf TEXT,
  resultado_json JSONB,
  data_consulta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_id UUID NOT NULL
);

ALTER TABLE public.consultas_veiculo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own queries"
  ON public.consultas_veiculo FOR SELECT
  TO authenticated
  USING (auth.uid() = usuario_id);

CREATE POLICY "Users can insert their own queries"
  ON public.consultas_veiculo FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuario_id);

CREATE INDEX idx_consultas_veiculo_placa ON public.consultas_veiculo(placa);
CREATE INDEX idx_consultas_veiculo_usuario ON public.consultas_veiculo(usuario_id);
