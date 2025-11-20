-- Adicionar logo_url na tabela corretoras
ALTER TABLE public.corretoras 
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Criar tabela administradora
CREATE TABLE IF NOT EXISTS public.administradora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.administradora ENABLE ROW LEVEL SECURITY;

-- Policy para visualizar administradora (todos autenticados)
CREATE POLICY "Authenticated users can view administradora"
  ON public.administradora
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policy para gerenciar administradora (apenas superintendente)
CREATE POLICY "Superintendente can manage administradora"
  ON public.administradora
  FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Adicionar campos na tabela vistorias
ALTER TABLE public.vistorias
ADD COLUMN IF NOT EXISTS corretora_id UUID REFERENCES public.corretoras(id),
ADD COLUMN IF NOT EXISTS cliente_cpf TEXT;

-- Criar bucket para logos se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para logos
CREATE POLICY "Public can view logos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "Authenticated can upload logos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated can update logos"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'logos' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated can delete logos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'logos' 
    AND auth.uid() IS NOT NULL
  );

-- Trigger para updated_at da administradora
CREATE TRIGGER update_administradora_updated_at
  BEFORE UPDATE ON public.administradora
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();