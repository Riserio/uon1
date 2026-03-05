
-- 1. Add columns to ouvidoria_registros
ALTER TABLE public.ouvidoria_registros 
  ADD COLUMN IF NOT EXISTS urgencia TEXT DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS origem_reclamacao TEXT,
  ADD COLUMN IF NOT EXISTS setor_responsavel TEXT,
  ADD COLUMN IF NOT EXISTS possivel_motivo TEXT,
  ADD COLUMN IF NOT EXISTS analista_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS satisfacao_nota INTEGER,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT now();

-- 2. Create ouvidoria_checkpoints table
CREATE TABLE IF NOT EXISTS public.ouvidoria_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id UUID NOT NULL REFERENCES public.ouvidoria_registros(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL,
  checkpoint_index INTEGER NOT NULL,
  checkpoint_label TEXT NOT NULL,
  concluido BOOLEAN DEFAULT false,
  concluido_em TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ouvidoria_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage ouvidoria checkpoints"
  ON public.ouvidoria_checkpoints
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Add acesso_ouvidoria to corretora_usuarios
ALTER TABLE public.corretora_usuarios 
  ADD COLUMN IF NOT EXISTS acesso_ouvidoria BOOLEAN DEFAULT false;

-- 4. Trigger to update status_changed_at on ouvidoria_registros
CREATE OR REPLACE FUNCTION public.update_ouvidoria_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER trg_ouvidoria_status_changed_at
  BEFORE UPDATE ON public.ouvidoria_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ouvidoria_status_changed_at();
