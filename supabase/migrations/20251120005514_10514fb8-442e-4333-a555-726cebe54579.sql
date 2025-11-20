-- Criar tabela de vistorias
CREATE TABLE IF NOT EXISTS public.vistorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero SERIAL NOT NULL,
  tipo_abertura TEXT NOT NULL CHECK (tipo_abertura IN ('digital', 'manual')),
  tipo_vistoria TEXT NOT NULL CHECK (tipo_vistoria IN ('sinistro', 'reativacao')),
  status TEXT NOT NULL DEFAULT 'aguardando_fotos' CHECK (status IN ('aguardando_fotos', 'em_analise', 'concluida', 'cancelada')),
  link_token UUID DEFAULT gen_random_uuid(),
  link_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  
  -- Dados do veículo
  veiculo_placa TEXT,
  veiculo_marca TEXT,
  veiculo_modelo TEXT,
  veiculo_ano TEXT,
  veiculo_cor TEXT,
  veiculo_chassi TEXT,
  
  -- Dados do cliente
  cliente_nome TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  cliente_cpf TEXT,
  
  -- Dados do sinistro
  relato_incidente TEXT,
  data_incidente TIMESTAMP WITH TIME ZONE,
  
  -- Geolocalização
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  endereco TEXT,
  
  -- Análise IA
  analise_ia JSONB,
  danos_detectados TEXT[],
  observacoes_ia TEXT,
  
  -- Relatório
  relatorio_url TEXT,
  
  -- Vinculação com atendimento
  atendimento_id UUID REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  
  -- Auditoria
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Criar tabela de fotos da vistoria
CREATE TABLE IF NOT EXISTS public.vistoria_fotos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vistoria_id UUID NOT NULL REFERENCES public.vistorias(id) ON DELETE CASCADE,
  posicao TEXT NOT NULL CHECK (posicao IN ('frontal', 'traseira', 'lateral_esquerda', 'lateral_direita')),
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_tamanho BIGINT,
  ordem INTEGER NOT NULL,
  analise_ia JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar índices
CREATE INDEX idx_vistorias_link_token ON public.vistorias(link_token);
CREATE INDEX idx_vistorias_created_by ON public.vistorias(created_by);
CREATE INDEX idx_vistorias_atendimento_id ON public.vistorias(atendimento_id);
CREATE INDEX idx_vistoria_fotos_vistoria_id ON public.vistoria_fotos(vistoria_id);

-- Trigger para updated_at
CREATE TRIGGER update_vistorias_updated_at
  BEFORE UPDATE ON public.vistorias
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Habilitar RLS
ALTER TABLE public.vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_fotos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para vistorias
CREATE POLICY "Users can insert own vistorias"
  ON public.vistorias FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view own vistorias"
  ON public.vistorias FOR SELECT
  USING (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'superintendente'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Users can update own vistorias"
  ON public.vistorias FOR UPDATE
  USING (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'superintendente'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Public can view vistoria by token"
  ON public.vistorias FOR SELECT
  USING (link_token IS NOT NULL AND link_expires_at > now());

CREATE POLICY "Public can update vistoria by token"
  ON public.vistorias FOR UPDATE
  USING (link_token IS NOT NULL AND link_expires_at > now());

-- Políticas RLS para vistoria_fotos
CREATE POLICY "Users can insert fotos in own vistorias"
  ON public.vistoria_fotos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vistorias v
      WHERE v.id = vistoria_fotos.vistoria_id
      AND (v.created_by = auth.uid() OR v.link_token IS NOT NULL)
    )
  );

CREATE POLICY "Users can view fotos of accessible vistorias"
  ON public.vistoria_fotos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vistorias v
      WHERE v.id = vistoria_fotos.vistoria_id
      AND (
        v.created_by = auth.uid() 
        OR has_role(auth.uid(), 'superintendente'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR v.link_token IS NOT NULL
      )
    )
  );

CREATE POLICY "Users can delete fotos from own vistorias"
  ON public.vistoria_fotos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.vistorias v
      WHERE v.id = vistoria_fotos.vistoria_id
      AND (v.created_by = auth.uid() OR v.link_token IS NOT NULL)
    )
  );

-- Criar bucket de storage para vistorias
INSERT INTO storage.buckets (id, name, public)
VALUES ('vistorias', 'vistorias', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para vistorias
CREATE POLICY "Users can upload vistoria photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vistorias' 
    AND (auth.uid() IS NOT NULL OR true)
  );

CREATE POLICY "Anyone can view vistoria photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vistorias');

CREATE POLICY "Users can delete own vistoria photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'vistorias' 
    AND (auth.uid() IS NOT NULL OR true)
  );