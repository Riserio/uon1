-- Permitir que admin e superintendente vejam TODOS os comunicados (ativos e inativos)
-- para a página de gerenciamento

CREATE POLICY "Superintendente can view all comunicados"
ON comunicados
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'superintendente'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);