-- 2026-11-06 — PID sem meses futuros.
--
-- derivar_indicadores agrega boletos com vencimento até now()+18 meses
-- (parcelas já emitidas) e eventos; com isso gravava linhas em
-- pid_operacional para meses que ainda não aconteceram (dez/2026, jan/2027...)
-- com placas_ativas = total atual. Essas linhas apareciam como "mês mais
-- recente" no BI e no resumo do WhatsApp (ex.: União com 22.266 placas e 2
-- cadastros). A agregação continua olhando os boletos futuros para a regra de
-- "boletos anteriores", mas só GRAVA meses até o mês corrente (fuso SP).

DO $mig$
DECLARE
  d text;
  antigo text := E'  WHERE m.ano IS NOT NULL\n  ON CONFLICT';
  novo text := E'  WHERE m.ano IS NOT NULL\n    AND make_date(m.ano, m.mes, 1) <= date_trunc(''month'', (now() AT TIME ZONE ''America/Sao_Paulo''))::date\n  ON CONFLICT';
BEGIN
  d := pg_get_functiondef('public.derivar_indicadores(uuid,integer)'::regprocedure);
  IF position(novo IN d) > 0 THEN
    RAISE NOTICE 'derivar_indicadores já corrigida';
  ELSIF position(antigo IN d) = 0 THEN
    RAISE EXCEPTION 'derivar_indicadores: trecho esperado não encontrado — revisar manualmente';
  ELSE
    EXECUTE replace(d, antigo, novo);
  END IF;
END
$mig$;

-- Remove as linhas de meses futuros já gravadas (só têm dados derivados).
DELETE FROM public.pid_operacional
WHERE make_date(ano, mes, 1) > date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;

-- Resumo de cobrança: "Sem cooperativa" (placas fora da base — em geral
-- veículos já cancelados, com inadimplência alta) não é cooperativa e não deve
-- aparecer como "maior/menor inadimplência" no relatório.
DO $mig2$
DECLARE
  d text;
  antigo text := 'FROM sga GROUP BY cooperativa HAVING count(*) >= 5';
  novo text := 'FROM sga WHERE cooperativa <> ''Sem cooperativa'' GROUP BY cooperativa HAVING count(*) >= 5';
BEGIN
  d := pg_get_functiondef('public.calcular_resumo_cobranca(uuid[],text,boolean,text[])'::regprocedure);
  IF position(novo IN d) > 0 THEN
    RAISE NOTICE 'calcular_resumo_cobranca já corrigida';
  ELSIF position(antigo IN d) = 0 THEN
    RAISE EXCEPTION 'calcular_resumo_cobranca: trecho esperado não encontrado — revisar manualmente';
  ELSE
    EXECUTE replace(d, antigo, novo);
  END IF;
END
$mig2$;
