-- Adicionar role 'parceiro' ao enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'parceiro';

-- Criar função para obter corretora_id do usuário parceiro
CREATE OR REPLACE FUNCTION public.get_user_corretora_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT corretora_id
  FROM public.corretora_usuarios
  WHERE profile_id = _user_id
    AND ativo = true
  LIMIT 1
$$;

-- RLS Policy para vistorias - parceiros veem apenas da sua corretora
CREATE POLICY "Parceiros podem ver vistorias de sua corretora"
ON vistorias
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role) 
  AND corretora_id = get_user_corretora_id(auth.uid())
);

-- RLS Policy para producao_financeira - parceiros veem apenas da sua corretora
CREATE POLICY "Parceiros podem ver producao_financeira de sua corretora"
ON producao_financeira
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role)
  AND corretora_id = get_user_corretora_id(auth.uid())
);

-- RLS Policy para corretoras - parceiros veem apenas a sua
CREATE POLICY "Parceiros podem ver apenas sua corretora"
ON corretoras
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role)
  AND id = get_user_corretora_id(auth.uid())
);