-- Script para limpar todos os dados exceto usuários
-- CUIDADO: Esta ação é irreversível!

-- Deletar vistorias e fotos
DELETE FROM vistoria_fotos;
DELETE FROM vistorias;

-- Deletar atendimentos e relacionados
DELETE FROM atendimento_anexos;
DELETE FROM andamentos;
DELETE FROM atendimentos_historico;
DELETE FROM email_historico;
DELETE FROM atendimentos;

-- Deletar comunicados e documentos
DELETE FROM comunicados;
DELETE FROM documentos;
DELETE FROM links_uteis;

-- Deletar eventos e lembretes
DELETE FROM lembretes_disparados;
DELETE FROM eventos;

-- Deletar mensagens
DELETE FROM mensagens;

-- Deletar alertas de performance
DELETE FROM performance_alertas;

-- Deletar contatos e corretoras
DELETE FROM contatos;
DELETE FROM corretoras;

-- Deletar configurações de email (manter templates)
DELETE FROM email_queue;

-- Resetar sequências de números se necessário
-- Isso fará com que novos atendimentos e vistorias comecem do número 1 novamente