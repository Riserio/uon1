ALTER TABLE public.corretoras ADD COLUMN IF NOT EXISTS logo_collapsed_url text DEFAULT NULL;
ALTER TABLE public.corretoras ADD COLUMN IF NOT EXISTS logo_expanded_url text DEFAULT NULL;