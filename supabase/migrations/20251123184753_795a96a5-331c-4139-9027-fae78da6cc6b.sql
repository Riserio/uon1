-- Adicionar campo profile_id na tabela corretora_usuarios para vincular com usuário do sistema
ALTER TABLE corretora_usuarios
ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS acesso_exclusivo_pid boolean DEFAULT true;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_corretora_usuarios_profile_id ON corretora_usuarios(profile_id);

-- Atualizar RLS para permitir parceiros visualizarem seus próprios dados
CREATE POLICY "Parceiros can view own corretora data"
ON corretoras
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role) 
  AND id IN (
    SELECT corretora_id 
    FROM corretora_usuarios 
    WHERE profile_id = auth.uid() AND ativo = true
  )
);

-- Permitir parceiros visualizarem dados financeiros da sua corretora
CREATE POLICY "Parceiros can view own producao_financeira"
ON producao_financeira
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role)
  AND corretora_id IN (
    SELECT corretora_id 
    FROM corretora_usuarios 
    WHERE profile_id = auth.uid() AND ativo = true
  )
);

-- Atualizar RLS de corretora_usuarios para permitir parceiros verem seus próprios dados
CREATE POLICY "Parceiros can view own corretora_usuario data"
ON corretora_usuarios
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role) AND profile_id = auth.uid()
);