CREATE OR REPLACE FUNCTION public.eh_veiculo_ativo(p_situacao text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN coalesce(btrim(p_situacao),'') = '' THEN true
    WHEN translate(upper(p_situacao),'ÁÀÃÂÉÊÍÓÔÕÚÇ','AAAAEEIOOOUC') ~ 'INADIMPL' THEN false
    WHEN translate(upper(p_situacao),'ÁÀÃÂÉÊÍÓÔÕÚÇ','AAAAEEIOOOUC') ~ 'INATIV|CANCEL|EXCLU|SUSPEN|BAIXAD|DESLIG|NEGAD|PENDENT|REVISTORIA' THEN false
    ELSE translate(upper(p_situacao),'ÁÀÃÂÉÊÍÓÔÕÚÇ','AAAAEEIOOOUC') ~ 'ATIVO|REATIV'
  END;
$$;