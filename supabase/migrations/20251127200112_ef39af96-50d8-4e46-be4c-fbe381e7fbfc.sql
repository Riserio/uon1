-- Tabela para configurações de API por corretora (CILIA e outras integrações)
CREATE TABLE public.api_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'cilia', 'outro'
  nome TEXT NOT NULL,
  ambiente TEXT NOT NULL DEFAULT 'producao', -- 'homologacao', 'producao'
  base_url TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(corretora_id, tipo)
);

-- Tabela para acompanhamento de sinistros
CREATE TABLE public.sinistro_acompanhamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atendimento_id UUID NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  -- Comitê
  comite_status TEXT, -- 'pendente', 'aprovado', 'rejeitado', 'em_discussao'
  comite_decisao TEXT,
  comite_data TIMESTAMP WITH TIME ZONE,
  comite_participantes TEXT[],
  comite_observacoes TEXT,
  -- Cota de participação
  cota_participacao NUMERIC DEFAULT 0,
  cota_percentual NUMERIC DEFAULT 0,
  -- Custos detalhados
  custo_pecas NUMERIC DEFAULT 0,
  custo_mao_obra NUMERIC DEFAULT 0,
  custo_servicos NUMERIC DEFAULT 0,
  custo_outros NUMERIC DEFAULT 0,
  -- Peças
  pecas_descricao TEXT,
  pecas_aprovadas BOOLEAN DEFAULT false,
  pecas_valor_total NUMERIC DEFAULT 0,
  -- Autorização de reparo
  reparo_autorizado BOOLEAN DEFAULT false,
  reparo_data_autorizacao TIMESTAMP WITH TIME ZONE,
  reparo_autorizado_por TEXT,
  reparo_observacoes TEXT,
  -- Oficina
  oficina_nome TEXT,
  oficina_cnpj TEXT,
  oficina_endereco TEXT,
  oficina_contato TEXT,
  oficina_tipo TEXT, -- 'referenciada', 'livre_escolha', 'propria'
  -- Financeiro
  financeiro_status TEXT, -- 'pendente', 'em_processamento', 'pago', 'cancelado'
  financeiro_valor_aprovado NUMERIC DEFAULT 0,
  financeiro_valor_pago NUMERIC DEFAULT 0,
  financeiro_data_pagamento TIMESTAMP WITH TIME ZONE,
  financeiro_forma_pagamento TEXT,
  financeiro_comprovante_url TEXT,
  -- Desistência
  desistencia BOOLEAN DEFAULT false,
  desistencia_motivo TEXT,
  desistencia_data TIMESTAMP WITH TIME ZONE,
  -- Finalização
  finalizado BOOLEAN DEFAULT false,
  finalizado_data TIMESTAMP WITH TIME ZONE,
  finalizado_por UUID REFERENCES auth.users(id),
  finalizado_observacoes TEXT,
  -- CILIA
  cilia_enviado BOOLEAN DEFAULT false,
  cilia_enviado_em TIMESTAMP WITH TIME ZONE,
  cilia_response JSONB,
  cilia_budget_id TEXT,
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(atendimento_id)
);

-- Habilitar RLS
ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sinistro_acompanhamento ENABLE ROW LEVEL SECURITY;

-- Policies para api_integrations
CREATE POLICY "Superintendente can manage api_integrations"
ON public.api_integrations FOR ALL
USING (has_role(auth.uid(), 'superintendente'::app_role));

CREATE POLICY "Admin can view api_integrations"
ON public.api_integrations FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policies para sinistro_acompanhamento
CREATE POLICY "Superintendente can manage sinistro_acompanhamento"
ON public.sinistro_acompanhamento FOR ALL
USING (has_role(auth.uid(), 'superintendente'::app_role));

CREATE POLICY "Admin can manage sinistro_acompanhamento"
ON public.sinistro_acompanhamento FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view sinistro_acompanhamento"
ON public.sinistro_acompanhamento FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = sinistro_acompanhamento.atendimento_id
    AND (
      a.user_id = auth.uid()
      OR has_role(auth.uid(), 'lider'::app_role)
      OR has_role(auth.uid(), 'administrativo'::app_role)
    )
  )
);

CREATE POLICY "Parceiros can view own corretora sinistro_acompanhamento"
ON public.sinistro_acompanhamento FOR SELECT
USING (
  has_role(auth.uid(), 'parceiro'::app_role)
  AND EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = sinistro_acompanhamento.atendimento_id
    AND a.corretora_id = get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Parceiros can update comite decisions"
ON public.sinistro_acompanhamento FOR UPDATE
USING (
  has_role(auth.uid(), 'parceiro'::app_role)
  AND EXISTS (
    SELECT 1 FROM atendimentos a
    WHERE a.id = sinistro_acompanhamento.atendimento_id
    AND a.corretora_id = get_user_corretora_id(auth.uid())
  )
);

-- Triggers para updated_at
CREATE TRIGGER update_api_integrations_updated_at
BEFORE UPDATE ON public.api_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sinistro_acompanhamento_updated_at
BEFORE UPDATE ON public.sinistro_acompanhamento
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_api_integrations_corretora ON public.api_integrations(corretora_id);
CREATE INDEX idx_sinistro_acompanhamento_atendimento ON public.sinistro_acompanhamento(atendimento_id);