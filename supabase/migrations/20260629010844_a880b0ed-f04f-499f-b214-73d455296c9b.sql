ALTER TABLE public.corretoras
  ADD COLUMN IF NOT EXISTS og_titulo TEXT,
  ADD COLUMN IF NOT EXISTS og_descricao TEXT,
  ADD COLUMN IF NOT EXISTS og_imagem_url TEXT;