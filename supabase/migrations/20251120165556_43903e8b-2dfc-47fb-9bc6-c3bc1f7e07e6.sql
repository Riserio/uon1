-- Permitir consulta pública de atendimentos vinculados a vistorias
-- Isso permite que a tela de acompanhamento público funcione
CREATE POLICY "Public can view atendimentos by vistoria CPF or placa"
ON public.atendimentos
FOR SELECT
TO public
USING (
  id IN (
    SELECT atendimento_id 
    FROM vistorias 
    WHERE atendimento_id IS NOT NULL
  )
);

-- Permitir consulta pública de vistorias por CPF ou placa
-- Necessário para a tela de acompanhamento público
CREATE POLICY "Public can view vistorias by CPF or placa"
ON public.vistorias
FOR SELECT
TO public
USING (
  cliente_cpf IS NOT NULL 
  OR veiculo_placa IS NOT NULL
);

-- Permitir consulta pública de andamentos vinculados a atendimentos públicos
-- Para exibir o histórico na tela de acompanhamento
CREATE POLICY "Public can view andamentos of public atendimentos"
ON public.andamentos
FOR SELECT
TO public
USING (
  atendimento_id IN (
    SELECT atendimento_id 
    FROM vistorias 
    WHERE atendimento_id IS NOT NULL
  )
);