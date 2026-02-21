
ALTER TABLE public.whatsapp_config ALTER COLUMN telefone_whatsapp TYPE varchar(200);
ALTER TABLE public.whatsapp_config ALTER COLUMN nome_exibicao TYPE varchar(100);

NOTIFY pgrst, 'reload schema';
