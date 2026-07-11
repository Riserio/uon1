-- A importação diária da BASE de veículos (Cadastro + Estudo de Base, fonte
-- das Placas Ativas) não tinha NENHUM agendamento no pg_cron — cobrança,
-- eventos e MGF tinham, mas a base ficava parada (VALECAR estava com base de
-- 09/07 enquanto o SGA mostrava dados de 10/07). Agenda o scheduler-base-hinova
-- diariamente às 12:10 UTC (09:10 BRT), após os demais módulos.
DO $$
BEGIN
  PERFORM cron.unschedule('scheduler-base-hinova');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- Nota: o Authorization usa a anon key do projeto (mesmo padrão dos demais
-- jobs de scheduler já existentes no cron).
