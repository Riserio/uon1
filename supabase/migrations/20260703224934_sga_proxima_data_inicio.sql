-- Importação incremental de eventos SGA.
-- Retorna a data de início dinâmica por associação:
--   * NULL  => primeira carga (o dispatcher usa 01/01/2000)
--   * senão => data_cadastro_item do evento ABERTO (nao finalizado) mais antigo, com 5 dias de folga
--   * fallback (tudo finalizado) => ultimos 90 dias a partir do ultimo cadastro
-- "Finalizado" = situacao_evento contendo FINALIZAD/ARQUIVAD/CANCELAD/NEGAD/DESISTENC/INDENIZ.
-- Piso de 2005-01-01 descarta datas-lixo (epoch ~1899) de linhas de rodape do relatorio.
CREATE OR REPLACE FUNCTION public.sga_proxima_data_inicio(_corretora_id uuid)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT e.data_cadastro_item AS d, coalesce(e.situacao_evento,'') AS s
    FROM public.sga_eventos e
    JOIN public.sga_importacoes i ON i.id = e.importacao_id
    WHERE i.corretora_id = _corretora_id
      AND e.data_cadastro_item >= DATE '2005-01-01'
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM ev) THEN NULL::date
    ELSE COALESCE(
      ((SELECT min(d) FROM ev
        WHERE s !~* 'FINALIZAD|ARQUIVAD|CANCELAD|NEGAD|DESISTENC|INDENIZ') - INTERVAL '5 days')::date,
      ((SELECT max(d) FROM ev) - INTERVAL '90 days')::date
    )
  END;
$$;
