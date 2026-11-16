DELETE FROM public.mercado_noticias WHERE categoria = 'vangard' OR fonte_id IN (SELECT id FROM public.mercado_fontes WHERE nome = 'Vangard e Fenaprove');
DELETE FROM public.mercado_radar_coletas WHERE fonte_id IN (SELECT id FROM public.mercado_fontes WHERE nome = 'Vangard e Fenaprove');
DELETE FROM public.mercado_fontes WHERE nome = 'Vangard e Fenaprove';