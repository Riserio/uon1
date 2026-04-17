ALTER TABLE public.funcionarios 
ADD COLUMN IF NOT EXISTS tolerancia_atraso_minutos integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.funcionarios.tolerancia_atraso_minutos IS 'Tolerância diária de atraso em minutos (padrão CLT: 10 min). Atrasos dentro deste limite são desconsiderados no saldo.';