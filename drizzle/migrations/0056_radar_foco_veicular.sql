-- =============================================================================
-- Radar do mercado: foco em proteção patrimonial de VEÍCULOS.
--
-- "Proteção patrimonial" sozinha trazia matérias de seguro residencial (ex.:
-- Allseg). Agora as palavras se dividem em:
--   fortes   bastam sozinhas (mutualista, proteção veicular, LC 213...)
--   fracas   só valem com outra fraca ou com uma palavra de contexto
--            (veículo, carro, moto, caminhão, mutual, SUSEP...)
--   excluir  derrubam a matéria (residencial, imóvel, condomínio, vida,
--            saúde, rural...), a não ser que ela fale de veículo/mutualismo
-- Fontes com palavras próprias (mercado_fontes.palavras) seguem a regra antiga.
-- Matérias já publicadas no Radar continuam lá. Idempotente.
-- =============================================================================

ALTER TABLE public.mercado_radar_config
  ADD COLUMN IF NOT EXISTS fracas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contexto text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluir text[] NOT NULL DEFAULT '{}';

UPDATE public.mercado_radar_config SET
  palavras = ARRAY['mutualista', 'mutualismo', 'protecao veicular', 'protecao patrimonial mutualista',
                   'lei complementar 213', 'lc 213', 'resolucao cnsp 491'],
  fracas   = ARRAY['protecao patrimonial', 'associacao de protecao', 'associacoes de protecao',
                   'cooperativa de seguro', 'cooperativas de seguro'],
  contexto = ARRAY['veicul', 'automov', 'carro', 'moto', 'caminh', 'frota', 'mutual', 'ppm', 'susep',
                   'rastreamento', 'assistencia 24'],
  excluir  = ARRAY['residencial', 'residencia', 'imovel', 'imoveis', 'condominio', 'seguro de vida', 'saude',
                   'rural', 'agricola', 'empresarial']
WHERE id = 1;

-- A matéria interessa ao Radar? (_alvo já normalizado, com espaço nas pontas)
CREATE OR REPLACE FUNCTION public.mercado_radar_relevante(_alvo text, _fonte uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  cfg record;
  proprias text[];
  n_fracas int;
  ctx boolean;
BEGIN
  SELECT palavras INTO proprias FROM mercado_fontes WHERE id = _fonte;
  IF proprias IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM unnest(proprias) p WHERE _alvo LIKE '% ' || p || '%');
  END IF;

  SELECT * INTO cfg FROM mercado_radar_config WHERE id = 1;
  ctx := EXISTS (SELECT 1 FROM unnest(cfg.contexto) p WHERE _alvo LIKE '% ' || p || '%');
  -- fala de residência, vida, saúde...? só passa se também falar de veículo ou mutualismo
  IF NOT ctx AND EXISTS (SELECT 1 FROM unnest(cfg.excluir) p WHERE _alvo LIKE '% ' || p || '%') THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(cfg.palavras) p WHERE _alvo LIKE '% ' || p || '%') THEN
    RETURN true;
  END IF;
  SELECT count(*) INTO n_fracas FROM unnest(cfg.fracas) p WHERE _alvo LIKE '% ' || p || '%';
  RETURN n_fracas >= 2 OR (n_fracas = 1 AND ctx);
END
$f$;
REVOKE ALL ON FUNCTION public.mercado_radar_relevante(text, uuid) FROM PUBLIC, anon, authenticated;

-- Troca só a linha do filtro dentro da função de coleta (o resto dela não muda)
DO $do$
DECLARE
  d text;
  antiga text := $a$CONTINUE WHEN NOT EXISTS (SELECT 1 FROM unnest(c.palavras) p WHERE v_alvo LIKE '% ' || p || '%');$a$;
  nova text := $b$CONTINUE WHEN NOT public.mercado_radar_relevante(v_alvo, c.fonte_id);$b$;
BEGIN
  d := pg_get_functiondef('public.mercado_radar_processar()'::regprocedure);
  IF position(nova IN d) > 0 THEN RETURN; END IF;
  IF position(antiga IN d) = 0 THEN RAISE EXCEPTION 'filtro da coleta não encontrado'; END IF;
  EXECUTE replace(d, antiga, nova);
END $do$;
