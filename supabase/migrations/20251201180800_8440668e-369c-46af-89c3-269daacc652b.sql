-- Remover políticas muito restritivas e criar políticas mais abertas para visualização

-- ATENDIMENTOS: Permitir que todos os usuários autenticados vejam todos os atendimentos
DROP POLICY IF EXISTS "Administrativo can view team atendimentos" ON atendimentos;
DROP POLICY IF EXISTS "Comercial can view own atendimentos" ON atendimentos;
DROP POLICY IF EXISTS "Lider can view team atendimentos" ON atendimentos;
DROP POLICY IF EXISTS "Superintendente can view all atendimentos" ON atendimentos;

CREATE POLICY "Authenticated users can view all atendimentos"
ON atendimentos
FOR SELECT
TO authenticated
USING (true);

-- CONTATOS: Permitir que todos os usuários autenticados vejam todos os contatos
DROP POLICY IF EXISTS "Administrativo can view team contatos" ON contatos;
DROP POLICY IF EXISTS "Lideres can view team contatos" ON contatos;
DROP POLICY IF EXISTS "Superintendente can view all contatos" ON contatos;
DROP POLICY IF EXISTS "Users can view own contatos" ON contatos;

CREATE POLICY "Authenticated users can view all contatos"
ON contatos
FOR SELECT
TO authenticated
USING (true);

-- CORRETORAS: Permitir que todos os usuários autenticados vejam todas as corretoras
DROP POLICY IF EXISTS "Administrativo can view team corretoras" ON corretoras;
DROP POLICY IF EXISTS "Lideres can view team corretoras" ON corretoras;
DROP POLICY IF EXISTS "Superintendente can view all corretoras" ON corretoras;
DROP POLICY IF EXISTS "Users can view own corretoras" ON corretoras;
DROP POLICY IF EXISTS "Parceiros podem ver apenas sua corretora" ON corretoras;

CREATE POLICY "Authenticated users can view all corretoras"
ON corretoras
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Parceiros continuam vendo apenas sua corretora
CREATE POLICY "Parceiros can view own corretora"
ON corretoras
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'parceiro'::app_role) AND 
  id = get_user_corretora_id(auth.uid())
);

-- LANÇAMENTOS FINANCEIROS: Permitir que todos os usuários autenticados visualizem
DROP POLICY IF EXISTS "Admin pode visualizar lançamentos" ON lancamentos_financeiros;
DROP POLICY IF EXISTS "Usuarios com permissao podem visualizar lancamentos" ON lancamentos_financeiros;
DROP POLICY IF EXISTS "Parceiros podem ver seus lançamentos" ON lancamentos_financeiros;

CREATE POLICY "Authenticated users can view lancamentos"
ON lancamentos_financeiros
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- VISTORIAS: Permitir visualização para todos os usuários autenticados
CREATE POLICY "Authenticated users can view all vistorias"
ON vistorias
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- SINISTRO_ACOMPANHAMENTO: Permitir visualização para todos
CREATE POLICY "Authenticated users can view sinistro_acompanhamento"
ON sinistro_acompanhamento
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- TERMOS: Permitir visualização para todos os usuários autenticados
CREATE POLICY "Authenticated users can view all termos"
ON termos
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);