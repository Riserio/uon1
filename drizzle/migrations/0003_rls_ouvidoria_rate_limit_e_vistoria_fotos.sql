-- 1) ouvidoria_rate_limit: nao expor IPs/corretora_id ao publico
DROP POLICY IF EXISTS "Anyone can select rate limit" ON public.ouvidoria_rate_limit;

CREATE OR REPLACE FUNCTION public.ouvidoria_rate_limit_ok(p_corretora_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0) < 5
  FROM public.ouvidoria_rate_limit
  WHERE corretora_id = p_corretora_id
    AND created_at >= now() - interval '1 hour';
$$;

REVOKE ALL ON FUNCTION public.ouvidoria_rate_limit_ok(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ouvidoria_rate_limit_ok(uuid) TO anon, authenticated, service_role;

-- 2) vistoria_fotos: remover INSERT irrestrito
DROP POLICY IF EXISTS "Public can insert vistoria_fotos" ON public.vistoria_fotos;
DROP POLICY IF EXISTS "Users can insert fotos in own vistorias" ON public.vistoria_fotos;

CREATE POLICY "Insert fotos com link valido ou dono"
ON public.vistoria_fotos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vistorias v
    WHERE v.id = vistoria_fotos.vistoria_id
      AND (
        (v.created_by IS NOT NULL AND v.created_by = auth.uid())
        OR (v.link_token IS NOT NULL AND v.link_expires_at > now())
      )
  )
);
