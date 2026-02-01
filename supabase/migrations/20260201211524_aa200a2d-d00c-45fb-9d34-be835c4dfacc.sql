-- Tabela de configuração do WhatsApp por corretora
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id UUID REFERENCES public.corretoras(id) ON DELETE CASCADE,
  telefone_whatsapp VARCHAR(20) NOT NULL,
  nome_exibicao VARCHAR(100),
  ativo BOOLEAN DEFAULT true,
  envio_automatico_cobranca BOOLEAN DEFAULT false,
  envio_automatico_eventos BOOLEAN DEFAULT false,
  envio_automatico_mgf BOOLEAN DEFAULT false,
  horario_envio TIME DEFAULT '08:00:00',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(corretora_id)
);

-- Tabela de templates de mensagens WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('cobranca', 'eventos', 'mgf', 'manual')),
  mensagem TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela de histórico de envios WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id UUID REFERENCES public.corretoras(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  telefone_destino VARCHAR(20) NOT NULL,
  mensagem TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro', 'entregue', 'lido')),
  erro_mensagem TEXT,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  enviado_por UUID REFERENCES auth.users(id)
);

-- Tabela de fila de envios WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id UUID REFERENCES public.corretoras(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  telefone_destino VARCHAR(20) NOT NULL,
  mensagem TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  agendado_para TIMESTAMPTZ,
  prioridade INTEGER DEFAULT 0,
  tentativas INTEGER DEFAULT 0,
  max_tentativas INTEGER DEFAULT 3,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'enviado', 'erro')),
  erro_mensagem TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_config
CREATE POLICY "Authenticated users can view whatsapp_config" 
  ON public.whatsapp_config FOR SELECT 
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert whatsapp_config" 
  ON public.whatsapp_config FOR INSERT 
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update whatsapp_config" 
  ON public.whatsapp_config FOR UPDATE 
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete whatsapp_config" 
  ON public.whatsapp_config FOR DELETE 
  TO authenticated USING (true);

-- RLS Policies for whatsapp_templates
CREATE POLICY "Authenticated users can view whatsapp_templates" 
  ON public.whatsapp_templates FOR SELECT 
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert whatsapp_templates" 
  ON public.whatsapp_templates FOR INSERT 
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update whatsapp_templates" 
  ON public.whatsapp_templates FOR UPDATE 
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete whatsapp_templates" 
  ON public.whatsapp_templates FOR DELETE 
  TO authenticated USING (true);

-- RLS Policies for whatsapp_historico
CREATE POLICY "Authenticated users can view whatsapp_historico" 
  ON public.whatsapp_historico FOR SELECT 
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert whatsapp_historico" 
  ON public.whatsapp_historico FOR INSERT 
  TO authenticated WITH CHECK (true);

-- RLS Policies for whatsapp_queue
CREATE POLICY "Authenticated users can view whatsapp_queue" 
  ON public.whatsapp_queue FOR SELECT 
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage whatsapp_queue" 
  ON public.whatsapp_queue FOR ALL 
  TO authenticated USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_whatsapp_config_updated_at
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER trigger_whatsapp_queue_updated_at
  BEFORE UPDATE ON public.whatsapp_queue
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

-- Inserir templates padrão
INSERT INTO public.whatsapp_templates (nome, tipo, mensagem, ativo) VALUES 
(
  'Resumo Diário de Cobrança',
  'cobranca',
  '📊 *RESUMO DE COBRANÇA*

📅 *{data_atual}*

💰 Inadimplência geral: *{percentual_inadimplencia}%*
📄 Total boletos gerados: *{total_gerados}* boletos
✅ Total baixados: *{total_baixados}* boletos

💵 Faturamento esperado: *R$ {faturamento_esperado}*
💵 Faturamento recebido: *R$ {faturamento_recebido}*
⏳ Total em aberto: *R$ {total_aberto}*

📊 *Boletos por dia de vencimento:*
{boletos_por_dia}

🔴 *Maior inadimplência:* {cooperativa_maior_inadimplencia}
🟢 *Menor inadimplência:* {cooperativa_menor_inadimplencia}',
  true
),
(
  'Resumo Mensal de Eventos',
  'eventos',
  '📊 *RESUMO DE EVENTOS NO MÊS*

📅 *{mes_referencia}*

📈 Total de eventos abertos: *{total_eventos}* eventos

🚗 Colisão: *{eventos_colisao}*
🪟 Vidros: *{eventos_vidros}*
🔒 Furto/Roubo: *{eventos_furto_roubo}*
📋 Outros: *{eventos_outros}*

📍 *Cidade com mais eventos:* {cidade_mais_eventos}
🏢 *Cooperativa com mais eventos:* {cooperativa_mais_eventos}',
  true
),
(
  'Resumo MGF',
  'mgf',
  '📊 *RESUMO MGF*

📅 *{mes_referencia}*

💰 Total lançamentos: *{total_lancamentos}*
💵 Valor total: *R$ {valor_total}*

📊 *Por categoria:*
{lancamentos_por_categoria}',
  true
);

-- Enable realtime for whatsapp_historico
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_historico;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_queue;