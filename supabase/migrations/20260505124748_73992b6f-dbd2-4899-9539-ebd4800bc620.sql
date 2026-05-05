ALTER TABLE public.registros_ponto
  ADD COLUMN IF NOT EXISTS tipo_original text,
  ADD COLUMN IF NOT EXISTS data_hora_original timestamp with time zone;

COMMENT ON COLUMN public.registros_ponto.tipo_original IS 'Tipo da batida antes de qualquer ajuste manual (preservado na 1ª edição)';
COMMENT ON COLUMN public.registros_ponto.data_hora_original IS 'Data/hora da batida antes de qualquer ajuste manual';