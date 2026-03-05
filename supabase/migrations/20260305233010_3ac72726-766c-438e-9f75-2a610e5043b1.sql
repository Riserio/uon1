
-- Tabela de configuração da ouvidoria por associação
CREATE TABLE public.ouvidoria_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  cor_primaria TEXT DEFAULT '#1e40af',
  cor_secundaria TEXT DEFAULT '#3b82f6',
  cor_botao TEXT DEFAULT '#1e40af',
  cor_botao_texto TEXT DEFAULT '#ffffff',
  dominios_permitidos TEXT[] DEFAULT '{}',
  embed_token TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(corretora_id)
);

-- Tabela principal de registros de ouvidoria
CREATE TABLE public.ouvidoria_registros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  protocolo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT,
  email TEXT NOT NULL,
  telefone TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('reclamacao', 'sugestao', 'elogio', 'denuncia')),
  descricao TEXT NOT NULL,
  placa_veiculo TEXT,
  status TEXT NOT NULL DEFAULT 'Recebimento' CHECK (status IN ('Recebimento', 'Levantamento', 'Acionamento Setor', 'Contato Associado', 'Monitoramento', 'Resolvido', 'Sem Resolução')),
  observacoes_internas TEXT,
  responsavel_id UUID REFERENCES public.profiles(id),
  ip_origem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sequência para protocolo
CREATE SEQUENCE ouvidoria_protocolo_seq START 1;

-- Função para gerar protocolo
CREATE OR REPLACE FUNCTION public.gerar_protocolo_ouvidoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.protocolo IS NULL OR NEW.protocolo = '' THEN
    NEW.protocolo := 'OUV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('ouvidoria_protocolo_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ouvidoria_protocolo
  BEFORE INSERT ON public.ouvidoria_registros
  FOR EACH ROW EXECUTE FUNCTION public.gerar_protocolo_ouvidoria();

-- Trigger para updated_at
CREATE TRIGGER update_ouvidoria_registros_updated_at
  BEFORE UPDATE ON public.ouvidoria_registros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ouvidoria_config_updated_at
  BEFORE UPDATE ON public.ouvidoria_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.ouvidoria_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ouvidoria_config ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem ver registros
CREATE POLICY "Authenticated users can view ouvidoria registros"
  ON public.ouvidoria_registros FOR SELECT TO authenticated
  USING (true);

-- Política: usuários autenticados podem atualizar registros
CREATE POLICY "Authenticated users can update ouvidoria registros"
  ON public.ouvidoria_registros FOR UPDATE TO authenticated
  USING (true);

-- Política: anônimos podem inserir (formulário público)
CREATE POLICY "Anyone can insert ouvidoria registros"
  ON public.ouvidoria_registros FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Config: leitura para todos (público precisa das cores), escrita para autenticados
CREATE POLICY "Anyone can view ouvidoria config"
  ON public.ouvidoria_config FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage ouvidoria config"
  ON public.ouvidoria_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Histórico de movimentação
CREATE TABLE public.ouvidoria_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registro_id UUID NOT NULL REFERENCES public.ouvidoria_registros(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  observacao TEXT,
  user_id UUID REFERENCES auth.users(id),
  user_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ouvidoria_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ouvidoria historico"
  ON public.ouvidoria_historico FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert ouvidoria historico"
  ON public.ouvidoria_historico FOR INSERT TO authenticated WITH CHECK (true);

-- Tabela de rate limiting por IP
CREATE TABLE public.ouvidoria_rate_limit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT NOT NULL,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ouvidoria_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert rate limit" ON public.ouvidoria_rate_limit FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can select rate limit" ON public.ouvidoria_rate_limit FOR SELECT TO anon, authenticated USING (true);
