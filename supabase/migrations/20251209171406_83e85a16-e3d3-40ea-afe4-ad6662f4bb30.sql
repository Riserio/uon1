-- Tabela para fechamento mensal de ponto com assinatura do funcionário
CREATE TABLE public.fechamentos_ponto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  dias_trabalhados INTEGER DEFAULT 0,
  dias_uteis INTEGER DEFAULT 0,
  horas_trabalhadas NUMERIC DEFAULT 0,
  horas_esperadas NUMERIC DEFAULT 0,
  saldo_horas NUMERIC DEFAULT 0,
  atrasos INTEGER DEFAULT 0,
  dias_atestado INTEGER DEFAULT 0,
  documento_url TEXT,
  assinatura_funcionario_url TEXT,
  assinado_em TIMESTAMP WITH TIME ZONE,
  ip_assinatura TEXT,
  observacoes TEXT,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado', 'assinado')),
  fechado_por UUID REFERENCES auth.users(id),
  fechado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(funcionario_id, ano, mes)
);

-- Tabela para anexos de ponto (folhas, atestados, documentos)
CREATE TABLE public.anexos_ponto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('folha_ponto', 'atestado', 'documento')),
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  data_referencia DATE,
  dias_abonados INTEGER DEFAULT 0,
  observacao TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fechamentos_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_ponto ENABLE ROW LEVEL SECURITY;

-- RLS policies for fechamentos_ponto
CREATE POLICY "Authenticated users can view fechamentos_ponto"
  ON public.fechamentos_ponto FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin users can manage fechamentos_ponto"
  ON public.fechamentos_ponto FOR ALL
  USING (
    has_role(auth.uid(), 'superintendente'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'administrativo'::app_role)
  );

CREATE POLICY "Employees can sign own fechamento"
  ON public.fechamentos_ponto FOR UPDATE
  USING (
    funcionario_id IN (
      SELECT id FROM funcionarios WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    funcionario_id IN (
      SELECT id FROM funcionarios WHERE profile_id = auth.uid()
    )
  );

-- RLS policies for anexos_ponto
CREATE POLICY "Authenticated users can view anexos_ponto"
  ON public.anexos_ponto FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin users can manage anexos_ponto"
  ON public.anexos_ponto FOR ALL
  USING (
    has_role(auth.uid(), 'superintendente'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'administrativo'::app_role)
  );

-- Create storage bucket for ponto documents
INSERT INTO storage.buckets (id, name, public) VALUES ('ponto-documentos', 'ponto-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ponto documents
CREATE POLICY "Authenticated users can view ponto documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ponto-documentos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admin users can upload ponto documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ponto-documentos' AND
    (
      has_role(auth.uid(), 'superintendente'::app_role) OR 
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'administrativo'::app_role)
    )
  );

CREATE POLICY "Admin users can update ponto documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'ponto-documentos' AND
    (
      has_role(auth.uid(), 'superintendente'::app_role) OR 
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'administrativo'::app_role)
    )
  );

CREATE POLICY "Admin users can delete ponto documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ponto-documentos' AND
    (
      has_role(auth.uid(), 'superintendente'::app_role) OR 
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'administrativo'::app_role)
    )
  );

-- Employees can upload their signature
CREATE POLICY "Employees can upload signature"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ponto-documentos' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = 'assinaturas'
  );