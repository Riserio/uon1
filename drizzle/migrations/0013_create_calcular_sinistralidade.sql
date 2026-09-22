CREATE OR REPLACE FUNCTION public.calcular_sinistralidade(p_corretora_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
WITH imp AS (
  SELECT id FROM mgf_importacoes WHERE corretora_id = p_corretora_id AND ativo = true
  ORDER BY created_at DESC LIMIT 1
),
base AS (
  SELECT d.*, COALESCE(d.data_pagamento, d.data_vencimento) AS data_ref
  FROM mgf_dados d
  WHERE d.importacao_id = (SELECT id FROM imp)
),
mensal AS (
  SELECT to_char(data_ref,'YYYY-MM') AS mes,
    COALESCE(sum(valor) FILTER (WHERE operacao = 'SAIDA' AND upper(coalesce(centro_custo,'')) LIKE 'EVENTOS%'),0) AS custo_eventos,
    COALESCE(sum(valor_pagamento) FILTER (WHERE operacao = 'ENTRADA' AND upper(coalesce(situacao_pagamento,'')) = 'PAGA'),0) AS recebido
  FROM base WHERE data_ref IS NOT NULL GROUP BY 1 ORDER BY 1
),
tot AS (
  SELECT
    COALESCE(sum(valor) FILTER (WHERE operacao = 'SAIDA' AND upper(coalesce(centro_custo,'')) LIKE 'EVENTOS%'),0) AS custo_eventos,
    COALESCE(sum(valor_pagamento) FILTER (WHERE operacao = 'ENTRADA' AND upper(coalesce(situacao_pagamento,'')) = 'PAGA'),0) AS recebido
  FROM base
)
SELECT jsonb_build_object(
  'totalCustoEventos', (SELECT custo_eventos FROM tot),
  'totalRecebido', (SELECT recebido FROM tot),
  'sinistralidade', CASE WHEN (SELECT recebido FROM tot) > 0 THEN round(((SELECT custo_eventos FROM tot)/(SELECT recebido FROM tot))*100, 1) ELSE 0 END,
  'mensalData', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'mes', mes,
      'custo', custo_eventos,
      'recebido', recebido,
      'sinistralidade', CASE WHEN recebido > 0 THEN round(custo_eventos/recebido*100, 1) ELSE 0 END
    )) FROM mensal), '[]'::jsonb)
);
$fn$;
GRANT EXECUTE ON FUNCTION public.calcular_sinistralidade(uuid) TO authenticated;