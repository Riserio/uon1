-- =============================================================================
-- Radar do mercado: prospects (associações de proteção veicular que ainda não
-- assinaram a newsletter) e público das campanhas. Idempotente.
--
-- Prospects entram pela tela de gestão (importação da planilha de prospecção).
-- Cada prospect tem um token próprio para o link de descadastro; quem se
-- descadastra não recebe mais campanhas. Quem cancelou a assinatura da
-- newsletter nunca recebe como prospect (o envio confere pelo e-mail).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.radar_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  associacao text NOT NULL,
  email text NOT NULL,
  email_alternativo text,
  cidade_uf text,
  uf text,
  site text,
  cnpj text,
  fonte text,
  observacoes text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'descadastrado', 'invalido')),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  ultimo_envio_em timestamptz,
  descadastrado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_prospects_email_uk ON public.radar_prospects (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS radar_prospects_token_uk ON public.radar_prospects (token);
CREATE INDEX IF NOT EXISTS radar_prospects_ativos_idx ON public.radar_prospects (status) WHERE status = 'ativo';

REVOKE ALL ON public.radar_prospects FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.radar_prospects TO authenticated;
GRANT ALL ON public.radar_prospects TO service_role;
ALTER TABLE public.radar_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Radar prospects - admin ve" ON public.radar_prospects;
CREATE POLICY "Radar prospects - admin ve" ON public.radar_prospects
  FOR SELECT TO authenticated USING (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar prospects - admin inclui" ON public.radar_prospects;
CREATE POLICY "Radar prospects - admin inclui" ON public.radar_prospects
  FOR INSERT TO authenticated WITH CHECK (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar prospects - admin edita" ON public.radar_prospects;
CREATE POLICY "Radar prospects - admin edita" ON public.radar_prospects
  FOR UPDATE TO authenticated USING (public.painel_admin(auth.uid())) WITH CHECK (public.painel_admin(auth.uid()));
DROP POLICY IF EXISTS "Radar prospects - admin exclui" ON public.radar_prospects;
CREATE POLICY "Radar prospects - admin exclui" ON public.radar_prospects
  FOR DELETE TO authenticated USING (public.painel_admin(auth.uid()));

-- Público de cada campanha
ALTER TABLE public.radar_campanhas
  ADD COLUMN IF NOT EXISTS publico text NOT NULL DEFAULT 'assinantes',
  ADD COLUMN IF NOT EXISTS assinantes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prospects int NOT NULL DEFAULT 0;
