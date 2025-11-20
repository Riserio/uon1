-- Remover tabela de contratos e criar sistema de termos
DROP TABLE IF EXISTS contratos CASCADE;

-- Criar tabela de termos
CREATE TABLE IF NOT EXISTS termos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  arquivo_url text NOT NULL,
  arquivo_nome text NOT NULL,
  ativo boolean DEFAULT true,
  obrigatorio boolean DEFAULT true,
  ordem integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid NOT NULL
);

-- Criar tabela para registrar termos aceitos
CREATE TABLE IF NOT EXISTS termos_aceitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  termo_id uuid REFERENCES termos(id) ON DELETE CASCADE NOT NULL,
  vistoria_id uuid REFERENCES vistorias(id) ON DELETE CASCADE NOT NULL,
  aceito_em timestamp with time zone DEFAULT now(),
  ip_address text,
  user_agent text,
  UNIQUE(termo_id, vistoria_id)
);

-- Remover coluna contrato_id das vistorias
ALTER TABLE vistorias DROP COLUMN IF EXISTS contrato_id;

-- Habilitar RLS
ALTER TABLE termos ENABLE ROW LEVEL SECURITY;
ALTER TABLE termos_aceitos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para termos
CREATE POLICY "Authenticated users can view active termos"
ON termos FOR SELECT
TO authenticated
USING (ativo = true);

CREATE POLICY "Public can view active termos"
ON termos FOR SELECT
TO anon
USING (ativo = true);

CREATE POLICY "Superintendente can manage termos"
ON termos FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Políticas RLS para termos_aceitos
CREATE POLICY "Public can insert termos aceitos"
ON termos_aceitos FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Authenticated users can view termos aceitos"
ON termos_aceitos FOR SELECT
TO authenticated
USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_termos_updated_at
BEFORE UPDATE ON termos
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- Criar bucket para termos se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('termos', 'termos', true)
ON CONFLICT (id) DO NOTHING;