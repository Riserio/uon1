-- 2026-11-14 — uoniSign: mensagens editáveis (e-mail e WhatsApp)
--
-- E-mail: os textos do uoniSign passam a ser templates do sistema
--   (Central de Atendimento → Templates), tipos uonisign_convite,
--   uonisign_codigo, uonisign_lembrete, uonisign_concluido e uonisign_aviso.
--   São únicos para a empresa (não por usuário) e o Administrador uoniSign edita.
-- WhatsApp: qual template aprovado na Meta é usado em cada mensagem e a ordem
--   das variáveis ({{1}}, {{2}}...) ficam em uonisign_config (chave 'whatsapp').
--
-- Depende de 0039. Idempotente. Aplicar sem modificações.

-- ---------------------------------------------------------------------------
-- 1) Tipos novos de template de e-mail
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_tipo_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_tipo_check CHECK (tipo = ANY (ARRAY[
  'atendimento', 'alerta_performance', 'recuperacao', 'boas_vindas', 'relatorio', 'convite_reuniao',
  'ouvidoria', 'ouvidoria_alerta', 'ouvidoria_finalizado', 'contrato_assinatura',
  'uonisign_convite', 'uonisign_codigo', 'uonisign_lembrete', 'uonisign_concluido', 'uonisign_aviso']));

-- Administrador uoniSign vê e edita os templates do uoniSign (de qualquer autor)
DROP POLICY IF EXISTS "uonisign_admin_ve_templates_email" ON public.email_templates;
CREATE POLICY "uonisign_admin_ve_templates_email" ON public.email_templates
  FOR SELECT TO authenticated
  USING (tipo LIKE 'uonisign\_%' AND public.uonisign_nivel(auth.uid()) = 'admin');
DROP POLICY IF EXISTS "uonisign_admin_edita_templates_email" ON public.email_templates;
CREATE POLICY "uonisign_admin_edita_templates_email" ON public.email_templates
  FOR UPDATE TO authenticated
  USING (tipo LIKE 'uonisign\_%' AND public.uonisign_nivel(auth.uid()) = 'admin')
  WITH CHECK (tipo LIKE 'uonisign\_%' AND public.uonisign_nivel(auth.uid()) = 'admin');

-- Textos iniciais (iguais aos que a função já enviava). Só cria se não existir.
DO $$
DECLARE
  v_dono uuid := coalesce(
    (SELECT user_id FROM public.user_roles WHERE role = 'superintendente' LIMIT 1),
    (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1),
    (SELECT id FROM public.profiles LIMIT 1));
  r record;
BEGIN
  IF v_dono IS NULL THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('uonisign_convite', 'uoniSign — Convite para assinatura',
     'Contrato para assinatura: {{contrato}}',
     $t$<p>Olá, {{nome}}.</p>
<p>O contrato <strong>{{contrato}}</strong> (nº {{numero}}) está pronto para a sua assinatura.</p>
<p>Para assinar, abra o link, leia o documento e confirme com o código que enviaremos a você. O link vale até <strong>{{prazo}}</strong>.</p>
<p><a href="{{link}}">Revisar e assinar</a></p>$t$),
    ('uonisign_codigo', 'uoniSign — Código de assinatura',
     'Código de assinatura: {{codigo}}',
     $t$<p>Olá, {{nome}}.</p>
<p>Use o código abaixo para confirmar a assinatura do contrato <strong>{{contrato}}</strong> (nº {{numero}}).</p>
<p style="font-size:28px;letter-spacing:8px;font-weight:700">{{codigo}}</p>
<p>O código vale por {{validade}} minutos e só pode ser usado uma vez. Se você não pediu este código, ignore esta mensagem.</p>$t$),
    ('uonisign_lembrete', 'uoniSign — Lembrete de assinatura',
     'Lembrete: assine o contrato {{numero}}',
     $t$<p>Olá, {{nome}}.</p>
<p>O contrato <strong>{{contrato}}</strong> (nº {{numero}}) foi enviado há {{dias}} dia(s) e ainda aguarda a sua assinatura. O link vale até <strong>{{prazo}}</strong>.</p>
<p><a href="{{link}}">Revisar e assinar</a></p>$t$),
    ('uonisign_concluido', 'uoniSign — Contrato assinado (cópia)',
     'Contrato assinado: {{contrato}}',
     $t$<p>Olá, {{nome}}.</p>
<p>O contrato <strong>{{contrato}}</strong> (nº {{numero}}) foi assinado por todos os signatários. A cópia final, com o relatório de assinaturas, segue anexa.</p>
<p>Você pode conferir a autenticidade do documento em {{url_validacao}}.</p>$t$),
    ('uonisign_aviso', 'uoniSign — Aviso (cancelado, recusado, expirado)',
     '{{assunto}}: {{contrato}}',
     $t$<p>Olá, {{nome}}.</p>
<p>{{mensagem}}</p>$t$)
  ) AS t(tipo, nome, assunto, corpo)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.email_templates WHERE tipo = r.tipo) THEN
      INSERT INTO public.email_templates (user_id, tipo, categoria, nome, assunto, corpo, ativo)
      VALUES (v_dono, r.tipo, 'uonisign', r.nome, r.assunto, r.corpo, true);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Configuração do uoniSign (WhatsApp)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uonisign_config (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.uonisign_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uonisign_config_select" ON public.uonisign_config;
CREATE POLICY "uonisign_config_select" ON public.uonisign_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "uonisign_config_admin" ON public.uonisign_config;
CREATE POLICY "uonisign_config_admin" ON public.uonisign_config FOR ALL TO authenticated
  USING (public.uonisign_nivel(auth.uid()) = 'admin')
  WITH CHECK (public.uonisign_nivel(auth.uid()) = 'admin');

-- Padrão: templates uonisign_* (criados na Meta pelo botão da tela) e a ordem das variáveis
INSERT INTO public.uonisign_config (chave, valor)
VALUES ('whatsapp', '{
  "idioma": "pt_BR",
  "mensagens": {
    "convite":   {"template": "uonisign_convite",   "parametros": ["nome", "contrato", "link"]},
    "codigo":    {"template": "uonisign_codigo",    "parametros": ["codigo"]},
    "lembrete":  {"template": "uonisign_lembrete",  "parametros": ["nome", "contrato", "dias", "link"]},
    "concluido": {"template": "uonisign_concluido", "parametros": ["nome", "contrato", "link"]},
    "aviso":     {"template": "uonisign_aviso",     "parametros": ["nome", "contrato", "assunto"]}
  }
}'::jsonb)
ON CONFLICT (chave) DO NOTHING;
