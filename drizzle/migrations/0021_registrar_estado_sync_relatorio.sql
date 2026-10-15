-- 0021: registra no repositório objetos já aplicados direto no banco (idempotente)
CREATE INDEX IF NOT EXISTS idx_cobranca_boletos_imp_nosso ON public.cobranca_boletos USING btree (importacao_id, ((dados_extras ->> 'nosso_numero'::text)));
CREATE INDEX IF NOT EXISTS idx_sga_eventos_imp_protocolo ON public.sga_eventos USING btree (importacao_id, protocolo);
ALTER TABLE public.sga_importacoes ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.cobranca_automacao_config ADD COLUMN IF NOT EXISTS tipos_boleto_relatorio text[] DEFAULT ARRAY['FECHAMENTO'::text];

CREATE TABLE IF NOT EXISTS public.bi_filtros_padrao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  corretora_id uuid REFERENCES public.corretoras(id) ON DELETE CASCADE,
  tela text NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bi_filtros_padrao_uk UNIQUE NULLS NOT DISTINCT (user_id, tela, corretora_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_filtros_padrao TO authenticated;
GRANT ALL ON public.bi_filtros_padrao TO service_role;
ALTER TABLE public.bi_filtros_padrao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bi_filtros_padrao_proprio ON public.bi_filtros_padrao;
CREATE POLICY bi_filtros_padrao_proprio ON public.bi_filtros_padrao TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.cobranca_tipos_boleto (
  tipo text PRIMARY KEY,
  descricao text,
  grupo text NOT NULL DEFAULT 'outros' CHECK (grupo = ANY (ARRAY['mensalidade','cobranca','taxa','evento','outros'])),
  ordem integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_tipos_boleto TO authenticated;
GRANT ALL ON public.cobranca_tipos_boleto TO service_role;
ALTER TABLE public.cobranca_tipos_boleto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobranca_tipos_boleto_ler ON public.cobranca_tipos_boleto;
CREATE POLICY cobranca_tipos_boleto_ler ON public.cobranca_tipos_boleto FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cobranca_tipos_boleto_admin ON public.cobranca_tipos_boleto;
CREATE POLICY cobranca_tipos_boleto_admin ON public.cobranca_tipos_boleto TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.cobranca_tipos_boleto (tipo, descricao, grupo, ordem) VALUES
('FECHAMENTO','Mensalidade do mês (rateio/fechamento mensal do associado)','mensalidade',1),
('ADESÃO','Taxa de adesão na entrada do associado','taxa',10),
('REATIVAÇÃO','Taxa de reativação de associado/veículo','taxa',11),
('VISTORIA','Taxa de vistoria','taxa',12),
('VISTORIA - CONSULTOR','Taxa de vistoria realizada por consultor','taxa',13),
('VISTORIA - LOJA','Taxa de vistoria realizada na loja','taxa',14),
('INSTALAÇÃO DE EQUIPAMENTO','Taxa de instalação de rastreador/equipamento','taxa',15),
('PARTICIPAÇÃO','Cota de participação do associado em evento (sinistro)','evento',20),
('COBRANÇA 1','Boleto emitido pelo setor de cobrança (1ª cobrança)','cobranca',30),
('COBRANÇA 2','Boleto emitido pelo setor de cobrança (2ª cobrança)','cobranca',31),
('COBRANÇA - SAC','Boleto de cobrança emitido pelo SAC','cobranca',32),
('INADIMPLÊNCIA','Boleto de regularização de inadimplência','cobranca',33),
('ACORDO FINANCEIRO','Parcela de acordo/renegociação de débito','cobranca',34),
('COMPLEMENTO','Boleto complementar de valor','outros',90)
 ON CONFLICT (tipo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public._backup_funcoes (
  salvo_em timestamptz DEFAULT now(), assinatura text, definicao text, motivo text
);
REVOKE ALL ON public._backup_funcoes FROM anon, authenticated;
GRANT ALL ON public._backup_funcoes TO service_role;
ALTER TABLE public._backup_funcoes ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.calcular_resumo_cobranca(uuid[], text, boolean);

-- Rotinas de importação/fila não podem ser disparadas com a chave pública (anon).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig, p.prokind FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND (p.proname LIKE 'importar\_%' OR p.proname LIKE 'processar\_%'
             OR p.proname IN ('_processar_fila_sync','enfileirar_sync_diario','reabrir_sync_atrasado'))
  LOOP
    IF r.prokind = 'p' THEN
      EXECUTE format('REVOKE EXECUTE ON PROCEDURE %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON PROCEDURE %s TO authenticated, service_role', r.sig);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;