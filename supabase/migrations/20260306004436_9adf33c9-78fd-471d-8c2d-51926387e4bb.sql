-- Add 'ouvidoria' to email_templates tipo check constraint
ALTER TABLE public.email_templates DROP CONSTRAINT email_templates_tipo_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_tipo_check 
  CHECK (tipo = ANY (ARRAY['atendimento','recuperacao','boas_vindas','relatorio','convite_reuniao','alerta_performance','ouvidoria']));