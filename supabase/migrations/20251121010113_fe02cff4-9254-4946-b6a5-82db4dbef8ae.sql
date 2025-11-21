-- Criar tabela de permissões de fluxo por usuário
CREATE TABLE IF NOT EXISTS public.user_fluxo_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fluxo_id UUID NOT NULL REFERENCES public.fluxos(id) ON DELETE CASCADE,
  pode_visualizar BOOLEAN NOT NULL DEFAULT true,
  pode_editar BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  
  -- Garantir que não haja duplicatas
  UNIQUE(user_id, fluxo_id)
);

-- Comentários para documentação
COMMENT ON TABLE public.user_fluxo_permissions IS 'Define permissões específicas de usuários em fluxos de trabalho';
COMMENT ON COLUMN public.user_fluxo_permissions.pode_visualizar IS 'Se true, usuário pode ver atendimentos deste fluxo';
COMMENT ON COLUMN public.user_fluxo_permissions.pode_editar IS 'Se true, usuário pode editar atendimentos deste fluxo';

-- Criar índices para performance
CREATE INDEX idx_user_fluxo_permissions_user_id ON public.user_fluxo_permissions(user_id);
CREATE INDEX idx_user_fluxo_permissions_fluxo_id ON public.user_fluxo_permissions(fluxo_id);
CREATE INDEX idx_user_fluxo_permissions_visualizar ON public.user_fluxo_permissions(user_id, pode_visualizar) WHERE pode_visualizar = true;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_user_fluxo_permissions_updated_at
  BEFORE UPDATE ON public.user_fluxo_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Habilitar RLS
ALTER TABLE public.user_fluxo_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Superintendente e admin podem gerenciar todas as permissões
CREATE POLICY "Superintendente e admin podem gerenciar permissões"
  ON public.user_fluxo_permissions
  FOR ALL
  USING (
    has_role(auth.uid(), 'superintendente'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Líderes podem gerenciar permissões de sua equipe
CREATE POLICY "Líderes podem gerenciar permissões da equipe"
  ON public.user_fluxo_permissions
  FOR ALL
  USING (
    has_role(auth.uid(), 'lider'::app_role) AND
    user_id IN (
      SELECT p.id
      FROM profiles p
      JOIN equipes e ON p.equipe_id = e.id
      WHERE e.lider_id = auth.uid()
    )
  );

-- Usuários podem ver suas próprias permissões
CREATE POLICY "Usuários podem ver próprias permissões"
  ON public.user_fluxo_permissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Função helper para verificar se usuário pode acessar fluxo
CREATE OR REPLACE FUNCTION public.user_can_access_fluxo(
  _user_id UUID,
  _fluxo_id UUID,
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
  FROM user_fluxo_permissions
  WHERE user_id = _user_id
    AND fluxo_id = _fluxo_id;
  
  -- Se não encontrou permissão específica, permitir por padrão
  -- (mantém comportamento atual para usuários sem restrições)
  RETURN COALESCE(has_permission, true);
END;
$$;

COMMENT ON FUNCTION public.user_can_access_fluxo IS 'Verifica se usuário tem permissão para acessar um fluxo específico';