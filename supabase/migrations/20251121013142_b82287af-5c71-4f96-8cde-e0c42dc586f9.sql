-- Atualizar RLS policies da tabela role_menu_permissions
-- para permitir administrativo gerenciar perfis abaixo dele

-- Remover policy antiga
DROP POLICY IF EXISTS "Superintendente and administrativo can manage role permissions" ON role_menu_permissions;

-- Criar novas policies mais granulares
CREATE POLICY "Superintendente can manage all role permissions"
ON role_menu_permissions
FOR ALL
USING (has_role(auth.uid(), 'superintendente'))
WITH CHECK (has_role(auth.uid(), 'superintendente'));

CREATE POLICY "Administrativo can manage non-superintendente role permissions"
ON role_menu_permissions
FOR ALL
USING (
  has_role(auth.uid(), 'administrativo') 
  AND role IN ('administrativo', 'lider', 'comercial')
)
WITH CHECK (
  has_role(auth.uid(), 'administrativo') 
  AND role IN ('administrativo', 'lider', 'comercial')
);