-- Backfill do histórico de inadimplentes em pid_operacional a partir da Cobrança.
-- Inadimplente = placa distinta com boleto JÁ VENCIDO e ainda em aberto, pelo
-- mês de vencimento. Para meses passados equivale ao total em aberto do mês;
-- para o mês corrente, só os já vencidos.
UPDATE public.pid_operacional p
SET inadimplentes = sub.inad, updated_at = now()
FROM (
  SELECT corretora_id,
         extract(year  from data_vencimento)::int AS ano,
         extract(month from data_vencimento)::int AS mes,
         count(DISTINCT placas) AS inad
  FROM public.cobranca_boletos_ativos
  WHERE upper(coalesce(situacao,'')) = 'ABERTO'
    AND data_pagamento IS NULL
    AND data_vencimento < current_date
  GROUP BY 1,2,3
) sub
WHERE p.corretora_id = sub.corretora_id AND p.ano = sub.ano AND p.mes = sub.mes;
