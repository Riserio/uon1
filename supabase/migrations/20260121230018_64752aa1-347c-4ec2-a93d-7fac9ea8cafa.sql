-- Alterar precisão do campo percentual_inadimplencia para suportar valores até 999.99
ALTER TABLE public.cobranca_inadimplencia_historico 
ALTER COLUMN percentual_inadimplencia TYPE NUMERIC(8,4);