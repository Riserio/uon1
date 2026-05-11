
CREATE TABLE public.categorias_financeiras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  parent_id UUID REFERENCES public.categorias_financeiras(id) ON DELETE CASCADE,
  nivel INTEGER NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 4),
  cor TEXT NOT NULL DEFAULT '#6366f1',
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  corretora_id UUID REFERENCES public.corretoras(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categorias_financeiras_corretora ON public.categorias_financeiras(corretora_id);
CREATE INDEX idx_categorias_financeiras_parent ON public.categorias_financeiras(parent_id);

ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage categorias_financeiras"
  ON public.categorias_financeiras
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_categorias_financeiras_updated_at
  BEFORE UPDATE ON public.categorias_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-set nivel based on parent and ensure parent type matches
CREATE OR REPLACE FUNCTION public.set_categoria_financeira_nivel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_nivel INT;
  parent_tipo TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.nivel := 1;
  ELSE
    SELECT nivel, tipo INTO parent_nivel, parent_tipo
    FROM public.categorias_financeiras
    WHERE id = NEW.parent_id;

    IF parent_nivel IS NULL THEN
      RAISE EXCEPTION 'Categoria pai não encontrada';
    END IF;

    IF parent_nivel >= 4 THEN
      RAISE EXCEPTION 'Limite máximo de 4 níveis atingido';
    END IF;

    NEW.nivel := parent_nivel + 1;
    NEW.tipo := parent_tipo;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_categoria_financeira_nivel
  BEFORE INSERT OR UPDATE ON public.categorias_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.set_categoria_financeira_nivel();
