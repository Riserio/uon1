-- Tabela para dados operacionais do PID (mensal por corretora)
CREATE TABLE public.pid_operacional (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  
  -- MOVIMENTAÇÃO DE BASE
  placas_ativas INTEGER DEFAULT 0,
  total_cotas NUMERIC(12,2) DEFAULT 0,
  total_associados INTEGER DEFAULT 0,
  cadastros_realizados INTEGER DEFAULT 0,
  indice_crescimento_bruto NUMERIC(8,4) DEFAULT 0,
  cancelamentos INTEGER DEFAULT 0,
  inadimplentes INTEGER DEFAULT 0,
  reativacao INTEGER DEFAULT 0,
  churn NUMERIC(8,4) DEFAULT 0,
  saldo_placas INTEGER DEFAULT 0,
  percentual_inadimplencia NUMERIC(8,4) DEFAULT 0,
  percentual_cancelamentos NUMERIC(8,4) DEFAULT 0,
  percentual_adesoes NUMERIC(8,4) DEFAULT 0,
  crescimento_liquido NUMERIC(8,4) DEFAULT 0,
  
  -- INDICADORES FINANCEIROS
  boletos_emitidos INTEGER DEFAULT 0,
  boletos_liquidados INTEGER DEFAULT 0,
  boletos_abertos INTEGER DEFAULT 0,
  boletos_cancelados INTEGER DEFAULT 0,
  faturamento_operacional NUMERIC(14,2) DEFAULT 0,
  total_recebido NUMERIC(14,2) DEFAULT 0,
  baixado_pendencia NUMERIC(14,2) DEFAULT 0,
  valor_boletos_abertos NUMERIC(14,2) DEFAULT 0,
  valor_boletos_cancelados NUMERIC(14,2) DEFAULT 0,
  recebimento_operacional NUMERIC(14,2) DEFAULT 0,
  arrecadamento_juros NUMERIC(14,2) DEFAULT 0,
  descontado_banco NUMERIC(14,2) DEFAULT 0,
  percentual_emissao_boleto NUMERIC(8,4) DEFAULT 0,
  percentual_inadimplencia_boletos NUMERIC(8,4) DEFAULT 0,
  percentual_cancelamento_boletos NUMERIC(8,4) DEFAULT 0,
  ticket_medio_boleto NUMERIC(12,2) DEFAULT 0,
  percentual_inadimplencia_financeira NUMERIC(8,4) DEFAULT 0,
  percentual_arrecadacao_juros NUMERIC(8,4) DEFAULT 0,
  percentual_descontado_banco NUMERIC(8,4) DEFAULT 0,
  percentual_crescimento_faturamento NUMERIC(8,4) DEFAULT 0,
  percentual_crescimento_recebido NUMERIC(8,4) DEFAULT 0,
  
  -- EVENTOS / SINISTROS - ABERTURA
  abertura_indenizacao_parcial_associado INTEGER DEFAULT 0,
  abertura_indenizacao_parcial_terceiro INTEGER DEFAULT 0,
  abertura_indenizacao_integral_associado INTEGER DEFAULT 0,
  abertura_indenizacao_integral_terceiro INTEGER DEFAULT 0,
  abertura_vidros INTEGER DEFAULT 0,
  abertura_carro_reserva INTEGER DEFAULT 0,
  abertura_total_eventos INTEGER DEFAULT 0,
  
  -- EVENTOS / SINISTROS - PAGAMENTO (QUANTIDADE)
  pagamento_qtd_parcial_associado INTEGER DEFAULT 0,
  pagamento_qtd_parcial_terceiro INTEGER DEFAULT 0,
  pagamento_qtd_integral_associado INTEGER DEFAULT 0,
  pagamento_qtd_integral_terceiro INTEGER DEFAULT 0,
  pagamento_qtd_vidros INTEGER DEFAULT 0,
  pagamento_qtd_carro_reserva INTEGER DEFAULT 0,
  
  -- EVENTOS / SINISTROS - PAGAMENTO (VALOR)
  pagamento_valor_parcial_associado NUMERIC(14,2) DEFAULT 0,
  pagamento_valor_parcial_terceiro NUMERIC(14,2) DEFAULT 0,
  pagamento_valor_integral_associado NUMERIC(14,2) DEFAULT 0,
  pagamento_valor_integral_terceiro NUMERIC(14,2) DEFAULT 0,
  pagamento_valor_vidros NUMERIC(14,2) DEFAULT 0,
  pagamento_valor_carro_reserva NUMERIC(14,2) DEFAULT 0,
  custo_total_eventos NUMERIC(14,2) DEFAULT 0,
  
  -- EVENTOS - TICKETS MÉDIOS E ÍNDICES
  ticket_medio_parcial NUMERIC(12,2) DEFAULT 0,
  ticket_medio_integral NUMERIC(12,2) DEFAULT 0,
  ticket_medio_vidros NUMERIC(12,2) DEFAULT 0,
  ticket_medio_carro_reserva NUMERIC(12,2) DEFAULT 0,
  indice_dano_parcial NUMERIC(8,4) DEFAULT 0,
  indice_dano_integral NUMERIC(8,4) DEFAULT 0,
  sinistralidade_financeira NUMERIC(8,4) DEFAULT 0,
  sinistralidade_geral NUMERIC(8,4) DEFAULT 0,
  
  -- ASSISTÊNCIA 24H
  acionamentos_assistencia INTEGER DEFAULT 0,
  custo_assistencia NUMERIC(14,2) DEFAULT 0,
  comprometimento_assistencia NUMERIC(8,4) DEFAULT 0,
  
  -- RASTREAMENTO
  veiculos_rastreados INTEGER DEFAULT 0,
  instalacoes_rastreamento INTEGER DEFAULT 0,
  custo_rastreamento NUMERIC(14,2) DEFAULT 0,
  comprometimento_rastreamento NUMERIC(8,4) DEFAULT 0,
  
  -- RATEIO
  custo_total_rateavel NUMERIC(14,2) DEFAULT 0,
  rateio_periodo NUMERIC(12,2) DEFAULT 0,
  percentual_rateio NUMERIC(8,4) DEFAULT 0,
  cme_explit NUMERIC(8,4) DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Unique constraint por corretora/ano/mês
  CONSTRAINT pid_operacional_unique_period UNIQUE (corretora_id, ano, mes)
);

-- Tabela para estudo de base (frota por categoria)
CREATE TABLE public.pid_estudo_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  data_referencia DATE NOT NULL,
  
  -- TOTAL GERAL
  total_veiculos_geral INTEGER DEFAULT 0,
  total_veiculos_ativos INTEGER DEFAULT 0,
  
  -- QUANTIDADE POR CATEGORIA
  qtd_passeio INTEGER DEFAULT 0,
  qtd_motocicletas INTEGER DEFAULT 0,
  qtd_utilitarios_suvs_vans INTEGER DEFAULT 0,
  qtd_caminhoes INTEGER DEFAULT 0,
  qtd_taxi_app INTEGER DEFAULT 0,
  qtd_especiais_importados INTEGER DEFAULT 0,
  qtd_carretas INTEGER DEFAULT 0,
  
  -- TICKET MÉDIO POR CATEGORIA
  tm_geral NUMERIC(12,2) DEFAULT 0,
  tm_passeio NUMERIC(12,2) DEFAULT 0,
  tm_motocicletas NUMERIC(12,2) DEFAULT 0,
  tm_utilitarios_suvs_vans NUMERIC(12,2) DEFAULT 0,
  tm_caminhoes NUMERIC(12,2) DEFAULT 0,
  tm_taxi_app NUMERIC(12,2) DEFAULT 0,
  tm_especiais_importados NUMERIC(12,2) DEFAULT 0,
  tm_carretas NUMERIC(12,2) DEFAULT 0,
  
  -- TOTAL PROTEGIDO POR CATEGORIA
  protegido_geral INTEGER DEFAULT 0,
  protegido_passeio INTEGER DEFAULT 0,
  protegido_motocicletas INTEGER DEFAULT 0,
  protegido_utilitarios_suvs_vans INTEGER DEFAULT 0,
  protegido_caminhoes INTEGER DEFAULT 0,
  protegido_taxi_app INTEGER DEFAULT 0,
  protegido_especiais_importados INTEGER DEFAULT 0,
  protegido_carretas INTEGER DEFAULT 0,
  
  -- VALOR TOTAL PROTEGIDO POR CATEGORIA
  valor_protegido_geral NUMERIC(16,2) DEFAULT 0,
  valor_protegido_passeio NUMERIC(16,2) DEFAULT 0,
  valor_protegido_motocicletas NUMERIC(16,2) DEFAULT 0,
  valor_protegido_utilitarios_suvs_vans NUMERIC(16,2) DEFAULT 0,
  valor_protegido_caminhoes NUMERIC(16,2) DEFAULT 0,
  valor_protegido_taxi_app NUMERIC(16,2) DEFAULT 0,
  valor_protegido_especiais_importados NUMERIC(16,2) DEFAULT 0,
  valor_protegido_carretas NUMERIC(16,2) DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT pid_estudo_base_unique_date UNIQUE (corretora_id, data_referencia)
);

-- Enable RLS
ALTER TABLE public.pid_operacional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pid_estudo_base ENABLE ROW LEVEL SECURITY;

-- Policies for pid_operacional
CREATE POLICY "Superintendente can manage pid_operacional"
ON public.pid_operacional FOR ALL
USING (has_role(auth.uid(), 'superintendente'::app_role));

CREATE POLICY "Admin can manage pid_operacional"
ON public.pid_operacional FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users with PID permission can view pid_operacional"
ON public.pid_operacional FOR SELECT
USING (user_can_access_menu(auth.uid(), 'pid'::text, false));

CREATE POLICY "Parceiros podem ver dados de sua corretora"
ON public.pid_operacional FOR SELECT
USING (has_role(auth.uid(), 'parceiro'::app_role) AND corretora_id = get_user_corretora_id(auth.uid()));

-- Policies for pid_estudo_base
CREATE POLICY "Superintendente can manage pid_estudo_base"
ON public.pid_estudo_base FOR ALL
USING (has_role(auth.uid(), 'superintendente'::app_role));

CREATE POLICY "Admin can manage pid_estudo_base"
ON public.pid_estudo_base FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users with PID permission can view pid_estudo_base"
ON public.pid_estudo_base FOR SELECT
USING (user_can_access_menu(auth.uid(), 'pid'::text, false));

CREATE POLICY "Parceiros podem ver estudo base de sua corretora"
ON public.pid_estudo_base FOR SELECT
USING (has_role(auth.uid(), 'parceiro'::app_role) AND corretora_id = get_user_corretora_id(auth.uid()));

-- Indexes
CREATE INDEX idx_pid_operacional_corretora ON public.pid_operacional(corretora_id);
CREATE INDEX idx_pid_operacional_periodo ON public.pid_operacional(ano, mes);
CREATE INDEX idx_pid_estudo_base_corretora ON public.pid_estudo_base(corretora_id);
CREATE INDEX idx_pid_estudo_base_data ON public.pid_estudo_base(data_referencia);

-- Trigger for updated_at
CREATE TRIGGER update_pid_operacional_updated_at
BEFORE UPDATE ON public.pid_operacional
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pid_estudo_base_updated_at
BEFORE UPDATE ON public.pid_estudo_base
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();