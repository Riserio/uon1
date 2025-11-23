-- Add RLS policies for producao_financeira to allow internal system users to manage data

-- Superintendente can manage all producao_financeira
CREATE POLICY "Superintendente can manage all producao_financeira"
ON public.producao_financeira
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'superintendente'
  )
);

-- Users can view all producao_financeira (for internal PID dashboard)
CREATE POLICY "Authenticated users can view producao_financeira"
ON public.producao_financeira
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Users can insert manual entries
CREATE POLICY "Users can insert manual producao_financeira"
ON public.producao_financeira
FOR INSERT
TO authenticated
WITH CHECK (
  tipo_origem = 'manual'
  AND criado_por_usuario_id = auth.uid()
);

-- Users can update their own manual entries
CREATE POLICY "Users can update own manual producao_financeira"
ON public.producao_financeira
FOR UPDATE
TO authenticated
USING (
  tipo_origem = 'manual'
  AND criado_por_usuario_id = auth.uid()
);

-- Users can delete their own manual entries
CREATE POLICY "Users can delete own manual producao_financeira"
ON public.producao_financeira
FOR DELETE
TO authenticated
USING (
  tipo_origem = 'manual'
  AND criado_por_usuario_id = auth.uid()
);

-- Parceiros can view their corretora data
CREATE POLICY "Parceiros can view own corretora producao_financeira"
ON public.producao_financeira
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.corretora_usuarios cu ON cu.profile_id = ur.user_id
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'parceiro'
    AND cu.corretora_id = producao_financeira.corretora_id
    AND cu.ativo = true
  )
);