-- Fix corretora_usuarios RLS policy to target authenticated role
DROP POLICY IF EXISTS "Superintendente can manage corretora_usuarios" ON corretora_usuarios;
CREATE POLICY "Superintendente can manage corretora_usuarios"
  ON corretora_usuarios
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'superintendente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superintendente'::app_role));