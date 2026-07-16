-- Aplica o intervalo de 5h a TODAS as associações (não só VALECAR), para que
-- os crons de 08h e 14h reimportem 2x/dia em toda a base. O gap 08h→14h é 6h
-- (> 5h), então os dois horários passam. Para deixar alguma associação em
-- 1x/dia, basta subir o api_intervalo_horas dela (> 6h) nas configurações.
UPDATE public.hinova_credenciais
SET api_intervalo_horas = 5;
