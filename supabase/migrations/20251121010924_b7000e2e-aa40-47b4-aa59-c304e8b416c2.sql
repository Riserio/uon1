-- Criar função de trigger para updated_at se não existir
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Criar tabela de permissões de menu por usuário
CREATE TABLE IF NOT EXISTS user_menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_item TEXT NOT NULL,
  pode_visualizar BOOLEAN DEFAULT true,
  pode_editar BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(user_id, menu_item)
);

-- Criar índices para performance
CREATE INDEX idx_user_menu_permissions_user_id ON user_menu_permissions(user_id);
CREATE INDEX idx_user_menu_permissions_menu_item ON user_menu_permissions(menu_item);

-- Trigger para updated_at
CREATE TRIGGER update_user_menu_permissions_updated_at
  BEFORE UPDATE ON user_menu_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Criar tabela de logs de alterações de permissões
CREATE TABLE IF NOT EXISTS permission_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  target_user_id UUID NOT NULL REFERENCES profiles(id),
  acao TEXT NOT NULL,
  tipo_permissao TEXT NOT NULL, -- 'menu' ou 'fluxo'
  detalhes JSONB,
  authorized_by UUID NOT NULL REFERENCES profiles(id),
  senha_validada BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Criar índices para logs
CREATE INDEX idx_permission_logs_user_id ON permission_change_logs(user_id);
CREATE INDEX idx_permission_logs_target_user_id ON permission_change_logs(target_user_id);
CREATE INDEX idx_permission_logs_created_at ON permission_change_logs(created_at DESC);

-- RLS para user_menu_permissions
ALTER TABLE user_menu_permissions ENABLE ROW LEVEL SECURITY;

-- Superintendente e administrativo podem gerenciar todas as permissões
CREATE POLICY "Superintendente and administrativo can manage all menu permissions"
  ON user_menu_permissions
  FOR ALL
  USING (
    has_role(auth.uid(), 'superintendente'::app_role) 
    OR has_role(auth.uid(), 'administrativo'::app_role)
  );

-- Usuários podem ver suas próprias permissões
CREATE POLICY "Users can view own menu permissions"
  ON user_menu_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- RLS para permission_change_logs
ALTER TABLE permission_change_logs ENABLE ROW LEVEL SECURITY;

-- Superintendente e administrativo podem ver todos os logs
CREATE POLICY "Superintendente and administrativo can view all logs"
  ON permission_change_logs
  FOR SELECT
  USING (
    has_role(auth.uid(), 'superintendente'::app_role) 
    OR has_role(auth.uid(), 'administrativo'::app_role)
  );

-- Sistema pode inserir logs
CREATE POLICY "System can insert logs"
  ON permission_change_logs
  FOR INSERT
  WITH CHECK (authorized_by = auth.uid());

-- Função para verificar permissão de menu
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
  has_permission BOOLEAN;
BEGIN
  -- Superintendente e admin têm acesso total
  IF has_role(_user_id, 'superintendente'::app_role) OR has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Verificar permissão específica
  SELECT 
    CASE 
      WHEN _require_edit THEN pode_editar
      ELSE pode_visualizar
    END INTO has_permission
  FROM user_menu_permissions
  WHERE user_id = _user_id
    AND menu_item = _menu_item;
  
  -- Se não encontrou permissão específica, permitir por padrão
  RETURN COALESCE(has_permission, true);
END;
$$;