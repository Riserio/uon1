-- 1) andamentos: exigir token de vistoria válido e não expirado
DROP POLICY IF EXISTS "Public can view andamentos of public atendimentos" ON public.andamentos;
CREATE POLICY "Public can view andamentos via valid vistoria token"
ON public.andamentos
FOR SELECT
TO anon, authenticated
USING (
  atendimento_id IN (
    SELECT v.atendimento_id
    FROM public.vistorias v
    WHERE v.atendimento_id IS NOT NULL
      AND v.link_token IS NOT NULL
      AND v.link_token::text = current_setting('request.headers', true)::json->>'x-vistoria-token'
      AND (v.link_expires_at IS NULL OR v.link_expires_at > now())
  )
);

-- 2) atendimentos: mesma exigência de token válido
DROP POLICY IF EXISTS "Public can view atendimentos by vistoria CPF or placa" ON public.atendimentos;
CREATE POLICY "Public can view atendimentos via valid vistoria token"
ON public.atendimentos
FOR SELECT
TO anon, authenticated
USING (
  id IN (
    SELECT v.atendimento_id
    FROM public.vistorias v
    WHERE v.atendimento_id IS NOT NULL
      AND v.link_token IS NOT NULL
      AND v.link_token::text = current_setting('request.headers', true)::json->>'x-vistoria-token'
      AND (v.link_expires_at IS NULL OR v.link_expires_at > now())
  )
);

-- 3) contatos: escopar por corretora_id do usuário; admin/superintendente/administrativo têm bypass
DROP POLICY IF EXISTS "Authenticated users can view all contatos" ON public.contatos;
CREATE POLICY "Users view contatos of own corretora"
ON public.contatos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR (
    corretora_id IS NOT NULL
    AND corretora_id = public.get_user_corretora_id(auth.uid())
  )
  OR created_by = auth.uid()
);