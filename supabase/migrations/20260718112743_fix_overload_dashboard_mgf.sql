-- ============================================================================
-- CORREÇÃO URGENTE: dashboard do MGF parou de carregar.
--
-- A migration anterior (mgf_filtros_dossie) usou CREATE OR REPLACE FUNCTION
-- adicionando parâmetros novos. Como a assinatura mudou, o Postgres NÃO
-- substituiu — criou uma SOBRECARGA. Ficaram duas versões de cada função e,
-- como os parâmetros novos têm DEFAULT, a chamada do frontend casa com ambas:
-- o Postgres não consegue escolher ("function is not unique") e a RPC falha.
--
-- Solução: remover as assinaturas ANTIGAS, deixando só as novas (que são
-- retrocompatíveis, pois todos os parâmetros extras têm default).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_dashboard_mgf_cached(
  uuid, text, text, text, text, text, text, text, date, date, integer, boolean
);

DROP FUNCTION IF EXISTS public.calcular_dashboard_mgf(
  uuid, text, text, text, text, text, text, text, date, date
);

-- Cache antigo pode ter payload de assinatura anterior; limpa por segurança.
DELETE FROM mgf_dashboard_cache;
