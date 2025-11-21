-- Criar tabela de permissões de menu por role
CREATE TABLE IF NOT EXISTS role_menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  menu_item TEXT NOT NULL,
  pode_visualizar BOOLEAN DEFAULT true,
  pode_editar BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(role, menu_item)
);

-- Criar índices para performance
CREATE INDEX idx_role_menu_permissions_role ON role_menu_permissions(role);
CREATE INDEX idx_role_menu_permissions_menu_item ON role_menu_permissions(menu_item);

-- Trigger para updated_at
CREATE TRIGGER update_role_menu_permissions_updated_at
  BEFORE UPDATE ON role_menu_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS para role_menu_permissions
ALTER TABLE role_menu_permissions ENABLE ROW LEVEL SECURITY;

-- Superintendente e administrativo podem gerenciar todas as permissões por role
CREATE POLICY "Superintendente and administrativo can manage role menu permissions"
  ON role_menu_permissions
  FOR ALL
  USING (
    has_role(auth.uid(), 'superintendente'::app_role) 
    OR has_role(auth.uid(), 'administrativo'::app_role)
  );

-- Todos podem ver permissões do próprio role
CREATE POLICY "Users can view own role menu permissions"
  ON role_menu_permissions
  FOR SELECT
  USING (
    role IN (
      SELECT ur.role 
      FROM user_roles ur 
      WHERE ur.user_id = auth.uid()
    )
  );

-- Atualizar função de verificação de permissão de menu
CREATE OR REPLACE FUNCTION user_can_access_menu(
  _user_id UUID,
  _menu_item TEXT,
  _require_edit BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
  has_permission BOOLEAN;
  role_permission BOOLEAN;
BEGIN
  -- Superintendente e admin têm acesso total
  IF has_role(_user_id, 'superintendente'::app_role) OR has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Pegar role do usuário
  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = _user_id;
  
  -- Verificar permissão específica do usuário primeiro (sobrescreve role)
  SELECT 
    CASE 
      WHEN _require_edit THEN pode_editar
      ELSE pode_visualizar
    END INTO has_permission
  FROM user_menu_permissions
  WHERE user_id = _user_id
    AND menu_item = _menu_item;
  
  -- Se encontrou permissão específica do usuário, usar ela
  IF has_permission IS NOT NULL THEN
    RETURN has_permission;
  END IF;
  
  -- Se não tem permissão específica, verificar permissão por role
  SELECT 
    CASE 
      WHEN _require_edit THEN pode_editar
      ELSE pode_visualizar
    END INTO role_permission
  FROM role_menu_permissions
  WHERE role = user_role
    AND menu_item = _menu_item;
  
  -- Se encontrou permissão por role, usar ela
  IF role_permission IS NOT NULL THEN
    RETURN role_permission;
  END IF;
  
  -- Se não encontrou nenhuma permissão definida, permitir por padrão
  RETURN true;
END;
$$;