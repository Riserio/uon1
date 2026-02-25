
-- Make atendimento_id nullable so non-atendimento emails (contacts, meetings) can be logged
ALTER TABLE public.email_historico ALTER COLUMN atendimento_id DROP NOT NULL;

-- Drop the existing FK constraint
ALTER TABLE public.email_historico DROP CONSTRAINT IF EXISTS email_historico_atendimento_id_fkey;

-- Re-add FK constraint but allow NULLs
ALTER TABLE public.email_historico ADD CONSTRAINT email_historico_atendimento_id_fkey 
  FOREIGN KEY (atendimento_id) REFERENCES public.atendimentos(id) ON DELETE SET NULL;

-- Update existing dummy UUIDs to NULL
UPDATE public.email_historico 
SET atendimento_id = NULL 
WHERE atendimento_id = '00000000-0000-0000-0000-000000000000';
