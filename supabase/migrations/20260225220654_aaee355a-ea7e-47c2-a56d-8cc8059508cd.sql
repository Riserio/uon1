-- Drop the old restrictive check constraint
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_tipo_check;

-- Add updated constraint with all valid types
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_tipo_check 
  CHECK (tipo = ANY (ARRAY['atendimento'::text, 'recuperacao'::text, 'boas_vindas'::text, 'relatorio'::text, 'convite_reuniao'::text, 'alerta_performance'::text]));