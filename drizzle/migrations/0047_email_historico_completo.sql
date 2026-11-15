-- =============================================================================
-- Painel de e-mails: o histórico parou de receber registros porque vários
-- envios (Uon1 Sign, propostas, acesso, recuperação de senha, vistoria,
-- alertas de performance) saíam direto pelo Resend sem gravar em
-- email_historico. As funções passam a gravar; aqui o banco aceita esses
-- registros de sistema (sem usuário remetente) e guarda a origem. Idempotente.
-- =============================================================================
ALTER TABLE public.email_historico ALTER COLUMN enviado_por DROP NOT NULL;
ALTER TABLE public.email_historico ADD COLUMN IF NOT EXISTS origem text;
CREATE INDEX IF NOT EXISTS idx_email_historico_created ON public.email_historico (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_historico_status_created ON public.email_historico (status, created_at DESC);
