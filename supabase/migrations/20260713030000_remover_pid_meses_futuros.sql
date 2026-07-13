-- Remove linhas de meses FUTUROS no PID (ex.: Agosto/Setembro criadas com
-- placas antigas), que faziam o Indicadores exibir um mês à frente. O período
-- do PID nunca deve passar do mês corrente. Idempotente: roda a limpeza sempre.
DELETE FROM public.pid_operacional
 WHERE (ano * 100 + mes) > (extract(year from now())::int * 100 + extract(month from now())::int);

DELETE FROM public.pid_estudo_base
 WHERE data_referencia > date_trunc('month', now())::date;
