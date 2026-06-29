
-- ============================================================
-- FORMULÁRIOS (Google Forms-like)
-- ============================================================

CREATE TABLE public.formularios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id uuid REFERENCES public.corretoras(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  slug text NOT NULL UNIQUE,
  cor_tema text DEFAULT '#362C89',
  logo_url text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado','arquivado')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_formularios_corretora ON public.formularios(corretora_id);
CREATE INDEX idx_formularios_slug ON public.formularios(slug);

GRANT SELECT ON public.formularios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formularios TO authenticated;
GRANT ALL ON public.formularios TO service_role;
ALTER TABLE public.formularios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Form público leitura quando publicado" ON public.formularios
  FOR SELECT TO anon, authenticated USING (status = 'publicado');
CREATE POLICY "Auth ver formulários" ON public.formularios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth criar formulários" ON public.formularios
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth editar formulários" ON public.formularios
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth excluir formulários" ON public.formularios
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_formularios_updated_at BEFORE UPDATE ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Perguntas
CREATE TABLE public.formulario_perguntas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id uuid NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  tipo text NOT NULL CHECK (tipo IN ('texto_curto','texto_longo','radio','checkbox','dropdown','numero','data','email','telefone')),
  enunciado text NOT NULL,
  descricao text,
  obrigatorio boolean NOT NULL DEFAULT false,
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  validacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_perguntas_formulario ON public.formulario_perguntas(formulario_id, ordem);

GRANT SELECT ON public.formulario_perguntas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formulario_perguntas TO authenticated;
GRANT ALL ON public.formulario_perguntas TO service_role;
ALTER TABLE public.formulario_perguntas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perguntas públicas quando form publicado" ON public.formulario_perguntas
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.status = 'publicado')
  );
CREATE POLICY "Auth ver perguntas" ON public.formulario_perguntas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth gerenciar perguntas" ON public.formulario_perguntas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Respostas
CREATE TABLE public.formulario_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id uuid NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  ip text,
  user_agent text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_respostas_formulario ON public.formulario_respostas(formulario_id, enviado_em DESC);

GRANT INSERT ON public.formulario_respostas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formulario_respostas TO authenticated;
GRANT ALL ON public.formulario_respostas TO service_role;
ALTER TABLE public.formulario_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer um envia resposta a form publicado" ON public.formulario_respostas
  FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.formularios f WHERE f.id = formulario_id AND f.status = 'publicado')
  );
CREATE POLICY "Auth lê respostas" ON public.formulario_respostas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth exclui respostas" ON public.formulario_respostas
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- APROVAÇÃO DE DISPOSITIVO PARA PONTO
-- ============================================================

CREATE TABLE public.dispositivos_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  user_agent text,
  plataforma text,
  navegador text,
  ip text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','bloqueado')),
  exigir_ip boolean NOT NULL DEFAULT false,
  ip_aprovado text,
  observacao text,
  apelido text,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  ultimo_uso_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dispositivos_funcionario ON public.dispositivos_ponto(funcionario_id, status);
CREATE UNIQUE INDEX uniq_dispositivo_funcionario_fp
  ON public.dispositivos_ponto(funcionario_id, fingerprint)
  WHERE status <> 'bloqueado';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispositivos_ponto TO authenticated;
GRANT ALL ON public.dispositivos_ponto TO service_role;
ALTER TABLE public.dispositivos_ponto ENABLE ROW LEVEL SECURITY;

-- Colaborador vê os próprios
CREATE POLICY "Colaborador vê próprios dispositivos" ON public.dispositivos_ponto
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.profile_id = auth.uid())
  );
-- Colaborador cria o próprio (primeira batida)
CREATE POLICY "Colaborador cria próprio dispositivo" ON public.dispositivos_ponto
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.profile_id = auth.uid())
  );
-- Gestores veem/gerenciam tudo
CREATE POLICY "Gestores veem todos dispositivos" ON public.dispositivos_ponto
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
  );
CREATE POLICY "Gestores atualizam dispositivos" ON public.dispositivos_ponto
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
  );
CREATE POLICY "Gestores excluem dispositivos" ON public.dispositivos_ponto
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superintendente'::app_role)
  );

CREATE TRIGGER trg_dispositivos_ponto_updated_at BEFORE UPDATE ON public.dispositivos_ponto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Configuração global de aprovação de dispositivos no ponto
ALTER TABLE public.jornada_config
  ADD COLUMN IF NOT EXISTS exigir_aprovacao_dispositivo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exigir_ip_dispositivo boolean NOT NULL DEFAULT false;
