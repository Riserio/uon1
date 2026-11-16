ALTER TABLE public.comunicados ADD COLUMN IF NOT EXISTS newsletter_enviado_em timestamptz;
COMMENT ON COLUMN public.comunicados.newsletter_enviado_em IS 'Quando o comunicado externo saiu na newsletter do Radar (NULL = ainda não saiu)';

REVOKE EXECUTE ON FUNCTION public.executar_importacao_hinova_bg(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.executar_importacao_hinova_bg(text, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.listar_cobranca_boletos_dedup(uuid[], text, text, text, text, int4, text, date, date, date, date, text, text, text, text, int4, int4, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_cobranca_boletos_dedup(uuid[], text, text, text, text, int4, text, date, date, date, date, text, text, text, text, int4, int4, text[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.listar_eventos_paginado(uuid, text, date, date, text, text, text, text, text, text, text, text, text, int4, int4) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_eventos_paginado(uuid, text, date, date, text, text, text, text, text, text, text, text, text, int4, int4) TO authenticated, service_role;