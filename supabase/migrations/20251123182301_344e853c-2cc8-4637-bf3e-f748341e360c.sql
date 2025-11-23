-- Adicionar campo slug na tabela corretoras
ALTER TABLE corretoras ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_corretoras_slug ON corretoras(slug) WHERE slug IS NOT NULL;

-- Criar tabela de usuários das corretoras (para login no portal)
CREATE TABLE corretora_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id UUID NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_configurado BOOLEAN DEFAULT FALSE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(corretora_id, email)
);

ALTER TABLE corretora_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superintendente can manage corretora_usuarios"
  ON corretora_usuarios FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Criar tabela de produção financeira (automática + manual)
CREATE TABLE producao_financeira (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id UUID NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,
  tipo_origem TEXT NOT NULL DEFAULT 'automatico' CHECK (tipo_origem IN ('automatico', 'manual')),
  produto TEXT,
  seguradora TEXT,
  segurado_nome TEXT,
  premio_total NUMERIC(15,2),
  percentual_comissao NUMERIC(5,2),
  valor_comissao NUMERIC(15,2),
  repasse_previsto NUMERIC(15,2),
  repasse_pago NUMERIC(15,2),
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'cancelado', 'estornado')),
  criado_por_usuario_id UUID,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_producao_corretora ON producao_financeira(corretora_id);
CREATE INDEX idx_producao_competencia ON producao_financeira(competencia);
CREATE INDEX idx_producao_origem ON producao_financeira(tipo_origem);

ALTER TABLE producao_financeira ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superintendente can manage all producao"
  ON producao_financeira FOR ALL
  USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Criar tabela de auditoria
CREATE TABLE pid_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id UUID NOT NULL REFERENCES corretoras(id) ON DELETE CASCADE,
  usuario_id UUID,
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE pid_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superintendente can view audit log"
  ON pid_audit_log FOR SELECT
  USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Triggers para updated_at
CREATE TRIGGER update_corretora_usuarios_updated_at
  BEFORE UPDATE ON corretora_usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_producao_financeira_updated_at
  BEFORE UPDATE ON producao_financeira
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();