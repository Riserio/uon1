-- 2026-10-15 — Resumo de cobrança (relatório diário):
-- * "Boletos por dia de vencimento" saía zerado: boletos vindos da API não
--   trazem dia_vencimento_veiculo. Cai para o dia do vencimento original.
-- * Cooperativa aparecia como código ("7"): quando o boleto/base só tem o
--   código, traduz pelo mapa hinova_lookups.
DO $$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.calcular_resumo_cobranca(uuid[],text,boolean,text[])'::regprocedure);
  IF position('hinova_lookups' in v) = 0 THEN
    n := replace(v,
      $a$    cb.dia_vencimento_veiculo,
    upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa,
    COALESCE(nullif(upper(btrim(cb.dados_extras->>'tipo_boleto')),''), 'SEM TIPO') AS tipo$a$,
      $a$    COALESCE(cb.dia_vencimento_veiculo, date_part('day', COALESCE(cb.data_vencimento_original, cb.data_vencimento))::int) AS dia_vencimento_veiculo,
    upper(regexp_replace(split_part(cb.placas, ',', 1), '[^A-Za-z0-9]', '', 'g')) AS placa,
    COALESCE(nullif(upper(btrim(cb.dados_extras->>'tipo_boleto')),''), 'SEM TIPO') AS tipo$a$);
    n := replace(n,
      $a$      bp.cooperativa,
      'Sem cooperativa'
    ) AS cooperativa$a$,
      $a$      CASE WHEN btrim(d.cooperativa_original) ~ '^[0-9]+$' THEN
        (SELECT l.descricao FROM public.hinova_lookups l, corretora_alvo ca
          WHERE l.corretora_id = ca.corretora_id AND l.tipo = 'cooperativa' AND l.codigo = btrim(d.cooperativa_original)) END,
      CASE WHEN bp.cooperativa ~ '^[0-9]+$' THEN
        COALESCE((SELECT l.descricao FROM public.hinova_lookups l, corretora_alvo ca
          WHERE l.corretora_id = ca.corretora_id AND l.tipo = 'cooperativa' AND l.codigo = bp.cooperativa), 'Cooperativa ' || bp.cooperativa)
        ELSE bp.cooperativa END,
      'Sem cooperativa'
    ) AS cooperativa$a$);
    IF position('hinova_lookups' in n) = 0 OR position('date_part(''day''' in n) = 0 THEN
      RAISE EXCEPTION 'calcular_resumo_cobranca: trechos não encontrados';
    END IF;
    EXECUTE n;
  END IF;
END $$;
