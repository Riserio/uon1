ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS contratante_papel text,
  ADD COLUMN IF NOT EXISTS corretora_nome_manual text;