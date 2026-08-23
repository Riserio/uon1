REVOKE EXECUTE ON FUNCTION public.enfileirar_sync_diario() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_sync_diario() TO postgres, service_role;