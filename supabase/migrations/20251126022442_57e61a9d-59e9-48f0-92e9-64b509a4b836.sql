-- Unificar numeração de sinistros e vistorias (mesma contagem)
-- Criar tabela de lançamentos financeiros para seguradoras

-- 1. Criar sequência compartilhada para numeração de sinistros/vistorias
CREATE SEQUENCE IF NOT EXISTS sinistro_vistoria_numero_seq START 1;

-- 2. Ajustar trigger para usar numeração compartilhada em vistorias
CREATE OR REPLACE FUNCTION public.set_vistoria_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Se não tem número, pegar próximo da sequência compartilhada
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    NEW.numero := nextval('sinistro_vistoria_numero_seq');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_vistoria_numero_trigger ON vistorias;
CREATE TRIGGER set_vistoria_numero_trigger
  BEFORE INSERT ON vistorias
  FOR EACH ROW
  EXECUTE FUNCTION set_vistoria_numero();

-- 3. Ajustar trigger para usar numeração compartilhada em atendimentos (quando tipo sinistro)
CREATE OR REPLACE FUNCTION public.set_atendimento_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Se for sinistro e não tem número, usar sequência compartilhada
  IF NEW.tipo_atendimento = 'sinistro' AND (NEW.numero IS NULL OR NEW.numero = 0) THEN
    NEW.numero := nextval('sinistro_vistoria_numero_seq');
  ELSIF NEW.numero IS NULL OR NEW.numero = 0 THEN
    -- Para outros tipos, usar sequência própria
    NEW.numero := nextval('atendimentos_numero_seq');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_atendimento_numero_trigger ON atendimentos;
CREATE TRIGGER set_atendimento_numero_trigger
  BEFORE INSERT ON atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION set_atendimento_numero();

-- 4. Criar tabela de lançamentos financeiros (padrão seguradoras)
CREATE TABLE IF NOT EXISTS public.lancamentos_financeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  numero_lancamento TEXT NOT NULL UNIQUE,
  data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_competencia DATE NOT NULL,
  
  -- Vinculação
  corretora_id UUID REFERENCES corretoras(id) ON DELETE SET NULL,
  sinistro_id UUID REFERENCES atendimentos(id) ON DELETE SET NULL,
  apolice_numero TEXT,
  
  -- Tipo e categoria
  tipo_lancamento TEXT NOT NULL CHECK (tipo_lancamento IN ('receita', 'despesa', 'provisao', 'ajuste')),
  categoria TEXT NOT NULL CHECK (categoria IN (
    'premio', 'comissao', 'sinistro', 'indenizacao', 'salvados', 'ressarcimento',
    'taxa_administrativa', 'custo_operacional', 'ajuste_tecnico', 'estorno', 'outros'
  )),
  subcategoria TEXT,
  
  -- Valores
  valor_bruto DECIMAL(15,2) NOT NULL,
  valor_desconto DECIMAL(15,2) DEFAULT 0,
  valor_liquido DECIMAL(15,2) NOT NULL,
  moeda TEXT DEFAULT 'BRL' NOT NULL,
  
  -- Detalhes do lançamento
  descricao TEXT NOT NULL,
  observacoes TEXT,
  documento_fiscal TEXT, -- Nota fiscal, recibo, etc
  documento_url TEXT,
  
  -- Status e controle
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'aprovado', 'rejeitado', 'pago', 'cancelado', 'estornado'
  )),
  data_vencimento DATE,
  data_pagamento DATE,
  forma_pagamento TEXT CHECK (forma_pagamento IN (
    'boleto', 'transferencia', 'pix', 'cheque', 'cartao', 'dinheiro', 'outros'
  )),
  
  -- Dados bancários
  banco_codigo TEXT,
  banco_agencia TEXT,
  banco_conta TEXT,
  banco_favorecido TEXT,
  
  -- Conciliação
  conciliado BOOLEAN DEFAULT FALSE,
  data_conciliacao TIMESTAMP WITH TIME ZONE,
  conciliado_por UUID REFERENCES profiles(id),
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  
  -- Aprovação
  aprovado_por UUID REFERENCES profiles(id),
  aprovado_em TIMESTAMP WITH TIME ZONE,
  rejeitado_por UUID REFERENCES profiles(id),
  rejeitado_em TIMESTAMP WITH TIME ZONE,
  motivo_rejeicao TEXT
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lancamentos_data_lancamento ON lancamentos_financeiros(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data_competencia ON lancamentos_financeiros(data_competencia);
CREATE INDEX IF NOT EXISTS idx_lancamentos_corretora ON lancamentos_financeiros(corretora_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_sinistro ON lancamentos_financeiros(sinistro_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON lancamentos_financeiros(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_tipo ON lancamentos_financeiros(tipo_lancamento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_categoria ON lancamentos_financeiros(categoria);
CREATE INDEX IF NOT EXISTS idx_lancamentos_numero ON lancamentos_financeiros(numero_lancamento);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_lancamentos_financeiros_updated_at
  BEFORE UPDATE ON lancamentos_financeiros
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies para lancamentos_financeiros
ALTER TABLE lancamentos_financeiros ENABLE ROW LEVEL SECURITY;

-- Superintendente pode tudo
CREATE POLICY "Superintendente pode gerenciar todos os lançamentos"
  ON lancamentos_financeiros
  FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Admin pode visualizar e criar
CREATE POLICY "Admin pode visualizar lançamentos"
  ON lancamentos_financeiros
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin pode criar lançamentos"
  ON lancamentos_financeiros
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = created_by);

CREATE POLICY "Admin pode atualizar lançamentos não aprovados"
  ON lancamentos_financeiros
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    AND status IN ('pendente', 'rejeitado')
  );

-- Parceiros podem ver apenas seus lançamentos
CREATE POLICY "Parceiros podem ver seus lançamentos"
  ON lancamentos_financeiros
  FOR SELECT
  USING (
    has_role(auth.uid(), 'parceiro'::app_role)
    AND corretora_id = get_user_corretora_id(auth.uid())
  );

-- Usuários com permissão específica podem visualizar
CREATE POLICY "Usuarios com permissao podem visualizar lancamentos"
  ON lancamentos_financeiros
  FOR SELECT
  USING (
    user_can_access_menu(auth.uid(), 'lancamentos_financeiros', false)
  );

-- Criar sequência para numeração automática de lançamentos
CREATE SEQUENCE IF NOT EXISTS lancamento_numero_seq START 1;

-- Função para gerar número de lançamento automático
CREATE OR REPLACE FUNCTION public.generate_lancamento_numero()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ano TEXT;
  sequencia TEXT;
BEGIN
  ano := TO_CHAR(CURRENT_DATE, 'YYYY');
  sequencia := LPAD(nextval('lancamento_numero_seq')::TEXT, 6, '0');
  RETURN 'LAN-' || ano || '-' || sequencia;
END;
$function$;

-- Trigger para gerar número automaticamente
CREATE OR REPLACE FUNCTION public.set_lancamento_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.numero_lancamento IS NULL OR NEW.numero_lancamento = '' THEN
    NEW.numero_lancamento := generate_lancamento_numero();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_lancamento_numero_trigger ON lancamentos_financeiros;
CREATE TRIGGER set_lancamento_numero_trigger
  BEFORE INSERT ON lancamentos_financeiros
  FOR EACH ROW
  EXECUTE FUNCTION set_lancamento_numero();