ALTER FUNCTION public.importar_base_api(uuid) SET statement_timeout = '10min';
ALTER FUNCTION public.importar_cobranca_api(uuid) SET statement_timeout = '10min';
ALTER FUNCTION public.importar_eventos_api(uuid) SET statement_timeout = '10min';
ALTER FUNCTION public.importar_eventos_api(uuid, boolean) SET statement_timeout = '10min';
ALTER FUNCTION public.importar_mgf_api(uuid) SET statement_timeout = '10min';