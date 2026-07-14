
ALTER TABLE public.corretora_usuarios
  ADD COLUMN IF NOT EXISTS menu_position text NOT NULL DEFAULT 'inferior';

ALTER TABLE public.corretora_usuarios
  DROP CONSTRAINT IF EXISTS corretora_usuarios_menu_position_check;

ALTER TABLE public.corretora_usuarios
  ADD CONSTRAINT corretora_usuarios_menu_position_check
  CHECK (menu_position IN ('inferior','vertical'));

CREATE OR REPLACE FUNCTION public.set_user_menu_position(new_position text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_position NOT IN ('inferior','vertical') THEN
    RAISE EXCEPTION 'menu_position inválido';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'não autenticado';
  END IF;
  UPDATE public.corretora_usuarios
    SET menu_position = new_position
  WHERE profile_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_menu_position(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_menu_position(text) TO authenticated;
