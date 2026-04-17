ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS bate_ponto BOOLEAN NOT NULL DEFAULT false;

-- Marcar LUCAS NUNES e Aline Arcanjo como bate_ponto = true
UPDATE public.funcionarios SET bate_ponto = true WHERE nome IN ('LUCAS NUNES', 'Aline Arcanjo') AND ativo = true;