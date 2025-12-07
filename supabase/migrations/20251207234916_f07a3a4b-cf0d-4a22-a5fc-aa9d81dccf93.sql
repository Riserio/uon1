
-- ===========================================
-- MÓDULO UON1SIGN - GESTÃO DE CONTRATOS
-- ===========================================

-- Tabela de templates de contrato
CREATE TABLE public.contrato_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  conteudo_html TEXT NOT NULL, -- HTML do contrato com placeholders {{nome}}, {{cpf}}, etc
  categoria TEXT, -- Ex: "Adesão", "Prestação de Serviços", etc
  variaveis_disponiveis JSONB DEFAULT '[]'::JSONB, -- Lista de variáveis que podem ser substituídas
  ativo BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de contratos gerados
CREATE TABLE public.contratos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE, -- CON-2025-000001
  template_id UUID REFERENCES public.contrato_templates(id),
  titulo TEXT NOT NULL,
  conteudo_html TEXT NOT NULL, -- HTML final do contrato
  variaveis_preenchidas JSONB DEFAULT '{}'::JSONB, -- Valores das variáveis
  status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho, aguardando_assinatura, assinado, cancelado, expirado
  contratante_nome TEXT,
  contratante_email TEXT,
  contratante_cpf TEXT,
  contratante_telefone TEXT,
  contratado_nome TEXT,
  contratado_email TEXT,
  contratado_cnpj TEXT,
  valor_contrato NUMERIC,
  data_inicio DATE,
  data_fim DATE,
  link_token UUID DEFAULT gen_random_uuid(),
  link_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  pdf_url TEXT,
  corretora_id UUID REFERENCES public.corretoras(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de assinaturas (cada signatário)
CREATE TABLE public.contrato_assinaturas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cpf TEXT,
  tipo TEXT NOT NULL DEFAULT 'contratante', -- contratante, contratado, testemunha
  ordem INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente, assinado, recusado
  assinatura_url TEXT, -- URL da imagem da assinatura
  ip_assinatura TEXT,
  user_agent TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  hash_documento TEXT, -- SHA-256 do documento no momento da assinatura
  assinado_em TIMESTAMP WITH TIME ZONE,
  link_token UUID DEFAULT gen_random_uuid(),
  link_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  notificado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Histórico de ações do contrato
CREATE TABLE public.contrato_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  acao TEXT NOT NULL, -- criado, enviado, visualizado, assinado, recusado, cancelado
  descricao TEXT,
  dados JSONB,
  ip TEXT,
  user_agent TEXT,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- MÓDULO JORNADA/RH - GESTÃO DE FUNCIONÁRIOS
-- ===========================================

-- Tabela de funcionários (colaboradores)
CREATE TABLE public.funcionarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id), -- Pode estar vinculado a um usuário do sistema
  nome TEXT NOT NULL,
  email TEXT,
  cpf TEXT,
  telefone TEXT,
  cargo TEXT,
  departamento TEXT,
  data_admissao DATE,
  data_demissao DATE,
  salario NUMERIC,
  tipo_contrato TEXT DEFAULT 'CLT', -- CLT, PJ, Estagiário, Temporário
  carga_horaria_semanal INTEGER DEFAULT 44, -- horas/semana
  horario_entrada TIME DEFAULT '08:00',
  horario_saida TIME DEFAULT '18:00',
  horario_almoco_inicio TIME DEFAULT '12:00',
  horario_almoco_fim TIME DEFAULT '13:00',
  dados_bancarios JSONB, -- banco, agencia, conta, pix
  endereco JSONB, -- cep, rua, numero, bairro, cidade, estado
  documentos_urls JSONB DEFAULT '[]'::JSONB, -- URLs de documentos (RG, CTPS, etc)
  foto_url TEXT,
  ativo BOOLEAN DEFAULT true,
  corretora_id UUID REFERENCES public.corretoras(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de registros de ponto
CREATE TABLE public.registros_ponto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- entrada, saida_almoco, volta_almoco, saida
  data_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  latitude NUMERIC,
  longitude NUMERIC,
  endereco_aproximado TEXT,
  foto_url TEXT, -- Foto do colaborador no momento do registro
  ip TEXT,
  user_agent TEXT,
  dispositivo TEXT, -- mobile, desktop
  observacao TEXT,
  ajustado BOOLEAN DEFAULT false, -- Se foi ajustado manualmente
  ajustado_por UUID,
  ajustado_em TIMESTAMP WITH TIME ZONE,
  motivo_ajuste TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de banco de horas
CREATE TABLE public.banco_horas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  horas_trabalhadas INTERVAL,
  horas_esperadas INTERVAL DEFAULT '08:00:00',
  saldo INTERVAL, -- positivo = hora extra, negativo = falta
  tipo TEXT DEFAULT 'normal', -- normal, feriado, fim_de_semana
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de alertas de ponto
CREATE TABLE public.alertas_ponto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- lembrete_entrada, lembrete_saida, atraso, falta
  mensagem TEXT NOT NULL,
  horario_programado TIME, -- Para lembretes
  ativo BOOLEAN DEFAULT true,
  dias_semana INTEGER[] DEFAULT '{1,2,3,4,5}'::INTEGER[], -- 0=Dom, 1=Seg, ..., 6=Sab
  enviado_em TIMESTAMP WITH TIME ZONE,
  visualizado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de justificativas de ausência
CREATE TABLE public.justificativas_ausencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  tipo TEXT NOT NULL, -- atestado, falta_justificada, ferias, licenca
  motivo TEXT,
  documento_url TEXT,
  status TEXT DEFAULT 'pendente', -- pendente, aprovado, rejeitado
  aprovado_por UUID,
  aprovado_em TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sequência para número de contrato
CREATE SEQUENCE IF NOT EXISTS contrato_numero_seq START WITH 1;

-- Função para gerar número do contrato
CREATE OR REPLACE FUNCTION public.generate_contrato_numero()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ano TEXT;
  sequencia TEXT;
BEGIN
  ano := TO_CHAR(CURRENT_DATE, 'YYYY');
  sequencia := LPAD(nextval('contrato_numero_seq')::TEXT, 6, '0');
  RETURN 'CON-' || ano || '-' || sequencia;
END;
$$;

-- Trigger para gerar número do contrato automaticamente
CREATE OR REPLACE FUNCTION public.set_contrato_numero()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := generate_contrato_numero();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_contrato_numero_trigger
  BEFORE INSERT ON public.contratos
  FOR EACH ROW
  EXECUTE FUNCTION set_contrato_numero();

-- ===========================================
-- RLS POLICIES
-- ===========================================

-- contrato_templates
ALTER TABLE public.contrato_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contrato_templates"
  ON public.contrato_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage contrato_templates"
  ON public.contrato_templates FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- contratos
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contratos"
  ON public.contratos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert contratos"
  ON public.contratos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage contratos"
  ON public.contratos FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view contrato by token"
  ON public.contratos FOR SELECT
  USING (link_token IS NOT NULL AND link_expires_at > now());

-- contrato_assinaturas
ALTER TABLE public.contrato_assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contrato_assinaturas"
  ON public.contrato_assinaturas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage contrato_assinaturas"
  ON public.contrato_assinaturas FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can sign contrato by token"
  ON public.contrato_assinaturas FOR UPDATE
  USING (link_token IS NOT NULL AND link_expires_at > now());

CREATE POLICY "Public can view assinatura by token"
  ON public.contrato_assinaturas FOR SELECT
  USING (link_token IS NOT NULL AND link_expires_at > now());

-- contrato_historico
ALTER TABLE public.contrato_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contrato_historico"
  ON public.contrato_historico FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert contrato_historico"
  ON public.contrato_historico FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR auth.uid() IS NULL);

-- funcionarios
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view funcionarios"
  ON public.funcionarios FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage funcionarios"
  ON public.funcionarios FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- registros_ponto
ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view registros_ponto"
  ON public.registros_ponto FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert registros_ponto"
  ON public.registros_ponto FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage registros_ponto"
  ON public.registros_ponto FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- banco_horas
ALTER TABLE public.banco_horas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view banco_horas"
  ON public.banco_horas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage banco_horas"
  ON public.banco_horas FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- alertas_ponto
ALTER TABLE public.alertas_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view alertas_ponto"
  ON public.alertas_ponto FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage alertas_ponto"
  ON public.alertas_ponto FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can insert alertas_ponto"
  ON public.alertas_ponto FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- justificativas_ausencia
ALTER TABLE public.justificativas_ausencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view justificativas_ausencia"
  ON public.justificativas_ausencia FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert justificativas_ausencia"
  ON public.justificativas_ausencia FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage justificativas_ausencia"
  ON public.justificativas_ausencia FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Adicionar índices para performance
CREATE INDEX idx_contratos_status ON public.contratos(status);
CREATE INDEX idx_contratos_corretora ON public.contratos(corretora_id);
CREATE INDEX idx_contrato_assinaturas_contrato ON public.contrato_assinaturas(contrato_id);
CREATE INDEX idx_contrato_assinaturas_status ON public.contrato_assinaturas(status);
CREATE INDEX idx_funcionarios_corretora ON public.funcionarios(corretora_id);
CREATE INDEX idx_funcionarios_ativo ON public.funcionarios(ativo);
CREATE INDEX idx_registros_ponto_funcionario ON public.registros_ponto(funcionario_id);
CREATE INDEX idx_registros_ponto_data ON public.registros_ponto(data_hora);
CREATE INDEX idx_banco_horas_funcionario ON public.banco_horas(funcionario_id);
CREATE INDEX idx_alertas_ponto_funcionario ON public.alertas_ponto(funcionario_id);
