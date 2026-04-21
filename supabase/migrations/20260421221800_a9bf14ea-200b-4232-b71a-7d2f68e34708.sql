
-- Tabela de clientes do módulo de gestão
CREATE TABLE public.clientes_gestao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  documento TEXT,
  tipo_documento TEXT DEFAULT 'CPF' CHECK (tipo_documento IN ('CPF', 'CNPJ')),
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de cobranças
CREATE TABLE public.cobrancas_gestao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes_gestao(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','vencido','cancelado')),
  recorrencia TEXT NOT NULL DEFAULT 'unica' CHECK (recorrencia IN ('unica','mensal','trimestral','semestral','anual')),
  recorrencia_pai_id UUID REFERENCES public.cobrancas_gestao(id) ON DELETE SET NULL,
  link_pagamento TEXT,
  metodo_pagamento TEXT,
  observacoes TEXT,
  aviso_enviado BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cobrancas_gestao_cliente ON public.cobrancas_gestao(cliente_id);
CREATE INDEX idx_cobrancas_gestao_vencimento ON public.cobrancas_gestao(data_vencimento);
CREATE INDEX idx_cobrancas_gestao_status ON public.cobrancas_gestao(status);

-- Tabela de notas fiscais
CREATE TABLE public.notas_fiscais_gestao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes_gestao(id) ON DELETE SET NULL,
  cobranca_id UUID REFERENCES public.cobrancas_gestao(id) ON DELETE SET NULL,
  numero TEXT,
  data_emissao DATE,
  valor NUMERIC(12,2),
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_tipo TEXT,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notas_fiscais_gestao_cliente ON public.notas_fiscais_gestao(cliente_id);
CREATE INDEX idx_notas_fiscais_gestao_cobranca ON public.notas_fiscais_gestao(cobranca_id);

-- Triggers de updated_at
CREATE TRIGGER trg_clientes_gestao_updated_at
  BEFORE UPDATE ON public.clientes_gestao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cobrancas_gestao_updated_at
  BEFORE UPDATE ON public.cobrancas_gestao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.clientes_gestao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobrancas_gestao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais_gestao ENABLE ROW LEVEL SECURITY;

-- Função helper: usuário pode gerenciar gestão (admin ou superintendente)
CREATE OR REPLACE FUNCTION public.can_manage_gestao(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'superintendente'::app_role);
$$;

-- Policies clientes_gestao
CREATE POLICY "gestao_clientes_select" ON public.clientes_gestao
  FOR SELECT TO authenticated USING (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_clientes_insert" ON public.clientes_gestao
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_clientes_update" ON public.clientes_gestao
  FOR UPDATE TO authenticated USING (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_clientes_delete" ON public.clientes_gestao
  FOR DELETE TO authenticated USING (public.can_manage_gestao(auth.uid()));

-- Policies cobrancas_gestao
CREATE POLICY "gestao_cobrancas_select" ON public.cobrancas_gestao
  FOR SELECT TO authenticated USING (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_cobrancas_insert" ON public.cobrancas_gestao
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_cobrancas_update" ON public.cobrancas_gestao
  FOR UPDATE TO authenticated USING (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_cobrancas_delete" ON public.cobrancas_gestao
  FOR DELETE TO authenticated USING (public.can_manage_gestao(auth.uid()));

-- Policies notas_fiscais_gestao
CREATE POLICY "gestao_nf_select" ON public.notas_fiscais_gestao
  FOR SELECT TO authenticated USING (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_nf_insert" ON public.notas_fiscais_gestao
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_nf_update" ON public.notas_fiscais_gestao
  FOR UPDATE TO authenticated USING (public.can_manage_gestao(auth.uid()));
CREATE POLICY "gestao_nf_delete" ON public.notas_fiscais_gestao
  FOR DELETE TO authenticated USING (public.can_manage_gestao(auth.uid()));

-- Bucket de notas fiscais (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-fiscais', 'notas-fiscais', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gestao_nf_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'notas-fiscais' AND public.can_manage_gestao(auth.uid()));

CREATE POLICY "gestao_nf_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notas-fiscais' AND public.can_manage_gestao(auth.uid()));

CREATE POLICY "gestao_nf_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'notas-fiscais' AND public.can_manage_gestao(auth.uid()));

CREATE POLICY "gestao_nf_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'notas-fiscais' AND public.can_manage_gestao(auth.uid()));
