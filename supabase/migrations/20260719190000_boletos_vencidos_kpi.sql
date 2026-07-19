-- KPI de boletos vencidos, ao lado de "em aberto" — nao no lugar.
--
-- Contexto: "Inadimplentes" segue a definicao do SGA (todo boleto em aberto do
-- mes, vencido ou nao), porque e o numero que a associacao confere. Mas no mes
-- corrente isso e enganoso do ponto de vista operacional: em jul/26 havia 1.538
-- boletos em aberto e 1.423 deles sequer tinham vencido — venciam dia 25, e o
-- painel dizia "1.536 inadimplentes" no dia 19.
--
-- A saida foi manter a metrica do SGA e acrescentar a de cobranca:
--   mai/26   em aberto 164   vencidos 164   (mes fechado: iguais)
--   jun/26   em aberto 187   vencidos 187   (mes fechado: iguais)
--   jul/26   em aberto 1.538 vencidos 160   R$ 26.509 realmente em atraso
--
-- Em mes fechado as duas coincidem, entao nada muda na conferencia. No mes
-- corrente elas se separam e cada uma responde a sua pergunta.

ALTER TABLE public.pid_operacional ADD COLUMN IF NOT EXISTS boletos_vencidos int;
ALTER TABLE public.pid_operacional ADD COLUMN IF NOT EXISTS valor_boletos_vencidos numeric;

-- derivar_indicadores e calcular_dashboard_cobranca passam a calcular e expor
-- boletos_vencidos / valor_boletos_vencidos (qtdeVencidosMes / totalVencidoMes).
