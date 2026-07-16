-- A base (placas) só reimporta quando passa `api_intervalo_horas` desde a
-- última importação (scheduler-base-hinova). Com o padrão de 24h, o cron de
-- 08–18 a cada 2h "verifica" mas quase sempre pula (intervalo não atingido),
-- então atualizava ~1x/dia. Baixa o intervalo da VALECAR para 2h para o
-- de-2-em-2h valer de fato dentro da janela 08–18.
UPDATE public.hinova_credenciais hc
SET api_intervalo_horas = 2
FROM public.corretoras c
WHERE hc.corretora_id = c.id
  AND c.nome ILIKE 'valecar';
