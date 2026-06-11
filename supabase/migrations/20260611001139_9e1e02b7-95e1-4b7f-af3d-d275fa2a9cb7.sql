
-- Cargos table
CREATE TABLE public.cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  cor TEXT DEFAULT '#6366f1',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargos TO authenticated;
GRANT ALL ON public.cargos TO service_role;

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cargos"
  ON public.cargos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage cargos"
  ON public.cargos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role));

CREATE TRIGGER update_cargos_updated_at BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cargo menu permissions
CREATE TABLE public.cargo_menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id UUID NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  menu_item TEXT NOT NULL,
  pode_visualizar BOOLEAN NOT NULL DEFAULT true,
  pode_editar BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cargo_id, menu_item)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargo_menu_permissions TO authenticated;
GRANT ALL ON public.cargo_menu_permissions TO service_role;

ALTER TABLE public.cargo_menu_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cargo permissions"
  ON public.cargo_menu_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage cargo permissions"
  ON public.cargo_menu_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superintendente'::app_role));

CREATE TRIGGER update_cargo_menu_permissions_updated_at BEFORE UPDATE ON public.cargo_menu_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link profiles to cargo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_cargo_id ON public.profiles(cargo_id);

-- Update user_can_access_menu to consider cargo_id
CREATE OR REPLACE FUNCTION public.user_can_access_menu(_user_id uuid, _menu_item text, _require_edit boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role app_role;
  user_cargo_id uuid;
  has_permission BOOLEAN;
  cargo_permission BOOLEAN;
  role_permission BOOLEAN;
BEGIN
  -- Superintendente e admin têm acesso total
  IF has_role(_user_id, 'superintendente'::app_role) OR has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  -- 1) Permissão específica do usuário (sobrescreve tudo)
  SELECT
    CASE WHEN _require_edit THEN pode_editar ELSE pode_visualizar END INTO has_permission
  FROM user_menu_permissions
  WHERE user_id = _user_id AND menu_item = _menu_item;

  IF has_permission IS NOT NULL THEN
    RETURN has_permission;
  END IF;

  -- 2) Permissão por cargo personalizado
  SELECT cargo_id INTO user_cargo_id FROM profiles WHERE id = _user_id;
  IF user_cargo_id IS NOT NULL THEN
    SELECT
      CASE WHEN _require_edit THEN pode_editar ELSE pode_visualizar END INTO cargo_permission
    FROM cargo_menu_permissions
    WHERE cargo_id = user_cargo_id AND menu_item = _menu_item;

    IF cargo_permission IS NOT NULL THEN
      RETURN cargo_permission;
    END IF;
  END IF;

  -- 3) Permissão por role do sistema
  SELECT role INTO user_role FROM user_roles WHERE user_id = _user_id;
  SELECT
    CASE WHEN _require_edit THEN pode_editar ELSE pode_visualizar END INTO role_permission
  FROM role_menu_permissions
  WHERE role = user_role AND menu_item = _menu_item;

  IF role_permission IS NOT NULL THEN
    RETURN role_permission;
  END IF;

  -- Default: permitir
  RETURN true;
END;
$function$;
