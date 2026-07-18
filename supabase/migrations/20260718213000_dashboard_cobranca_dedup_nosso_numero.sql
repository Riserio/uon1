-- calcular_dashboard_cobranca deduplicava por dedup_key, que tem colisao.
-- Em jun/26 (VALECAR) isso derrubava 192 boletos pagos: a funcao devolvia
-- 4.498 pagos quando o SGA e a nossa propria tabela tem 4.690.
--
-- nosso_numero e a chave natural do boleto no SGA e e unica (5.022 distintos
-- para 5.022 linhas em jun/26). Depois da troca:
--   pagos 4.690 / R$ 782.438,56  -> identico ao Relatorio de Boletos do SGA.
--
-- Aplicado por DO block que le a definicao vigente e troca so os dois trechos
-- do DISTINCT ON, para nao reescrever as ~300 linhas da funcao e nao arriscar
-- divergir do que esta em producao. Aborta se os trechos nao forem encontrados.
DO $$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid=p.pronamespace AND nsp.nspname='public'
  WHERE p.proname='calcular_dashboard_cobranca';

  n := 0;
  IF position('DISTINCT ON (cb.dedup_key)' in d) > 0 THEN n := n + 1; END IF;
  IF position('ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST' in d) > 0 THEN n := n + 1; END IF;
  IF n <> 2 THEN
    RAISE NOTICE 'Trechos nao encontrados (%). Nada alterado — provavelmente ja aplicado.', n;
    RETURN;
  END IF;

  d := replace(d, 'DISTINCT ON (cb.dedup_key)',
                  'DISTINCT ON (COALESCE(cb.dados_extras->>''nosso_numero'', cb.dedup_key, cb.id::text))');
  d := replace(d, 'ORDER BY cb.dedup_key, cb.valor DESC NULLS LAST',
                  'ORDER BY COALESCE(cb.dados_extras->>''nosso_numero'', cb.dedup_key, cb.id::text), cb.valor DESC NULLS LAST');
  EXECUTE d;
END $$;
