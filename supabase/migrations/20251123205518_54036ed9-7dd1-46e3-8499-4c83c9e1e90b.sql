-- Políticas RLS para producao_financeira - Parceiros só veem dados da sua corretora
CREATE POLICY "Parceiros podem ver producao da sua corretora"
ON producao_financeira
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role) 
  AND corretora_id = get_user_corretora_id(auth.uid())
);

-- Políticas RLS para vistorias - Parceiros só veem sinistros da sua corretora
CREATE POLICY "Parceiros podem ver vistorias da sua corretora"
ON vistorias
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role) 
  AND corretora_id = get_user_corretora_id(auth.uid())
);

-- Garantir que parceiros não podem inserir, atualizar ou deletar dados financeiros
CREATE POLICY "Parceiros não podem modificar producao_financeira"
ON producao_financeira
FOR ALL
TO authenticated
USING (
  NOT has_role(auth.uid(), 'parceiro'::app_role)
)
WITH CHECK (
  NOT has_role(auth.uid(), 'parceiro'::app_role)
);

-- Parceiros podem atualizar deliberações do comitê de sinistros
CREATE POLICY "Parceiros podem atualizar observacoes_ia de sinistros"
ON vistorias
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role) 
  AND corretora_id = get_user_corretora_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'parceiro'::app_role) 
  AND corretora_id = get_user_corretora_id(auth.uid())
);

-- Garantir que parceiros não podem inserir ou deletar sinistros
CREATE POLICY "Parceiros não podem inserir sinistros"
ON vistorias
FOR INSERT
TO authenticated
WITH CHECK (
  NOT has_role(auth.uid(), 'parceiro'::app_role)
);

CREATE POLICY "Parceiros não podem deletar sinistros"
ON vistorias
FOR DELETE
TO authenticated
USING (
  NOT has_role(auth.uid(), 'parceiro'::app_role)
);