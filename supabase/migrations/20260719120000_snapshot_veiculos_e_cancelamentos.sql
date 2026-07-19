-- Cancelamentos sem custo de API.
--
-- O SGA reporta 72 cancelamentos em jun/26 e o nosso PID gravava 0: o campo
-- nunca foi calculado. A origem seria importar veiculos em situacao INATIVA,
-- mas o importador busca so codigo_situacao=1 e ainda nao sabemos se o filtro
-- da API funciona (situacao=4 devolveu quase a base inteira uma vez).
--
-- Este caminho nao depende disso. Guardamos o CONJUNTO de placas ativas por dia
-- (pid_placas_diario so guardava a contagem) e cancelamento vira a diferenca
-- entre dois snapshots. Nao faz nenhuma chamada de API: le a base ja importada.
--
-- Limitacao honesta: so vale a partir do primeiro snapshot (19/07/2026). Nao
-- reconstroi junho. Para junho continuamos dependendo do relatorio do SGA.

CREATE TABLE IF NOT EXISTS public.veiculo_snapshot_diario (
  corretora_id uuid NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  data date NOT NULL,
  placa text NOT NULL,
  situacao text,
  PRIMARY KEY (corretora_id, data, placa)
);
CREATE INDEX IF NOT EXISTS idx_vsd_corretora_data ON public.veiculo_snapshot_diario (corretora_id, data);
ALTER TABLE public.veiculo_snapshot_diario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vsd_leitura ON public.veiculo_snapshot_diario;
CREATE POLICY vsd_leitura ON public.veiculo_snapshot_diario FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.capturar_snapshot_veiculos(p_data date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_data date := COALESCE(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
        v_linhas int;
BEGIN
  INSERT INTO veiculo_snapshot_diario (corretora_id, data, placa, situacao)
  SELECT DISTINCT ON (ei.corretora_id, upper(regexp_replace(eb.placa,'[^A-Za-z0-9]','','g')))
         ei.corretora_id, v_data,
         upper(regexp_replace(eb.placa,'[^A-Za-z0-9]','','g')),
         eb.situacao_veiculo
  FROM estudo_base_registros eb
  JOIN estudo_base_importacoes ei ON ei.id = eb.importacao_id AND ei.ativo
  WHERE eb.placa IS NOT NULL AND btrim(eb.placa) <> ''
  ORDER BY ei.corretora_id, upper(regexp_replace(eb.placa,'[^A-Za-z0-9]','','g')), eb.id
  ON CONFLICT (corretora_id, data, placa) DO UPDATE SET situacao = EXCLUDED.situacao;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'data', v_data, 'placas', v_linhas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelamentos_periodo(
  p_corretora_id uuid, p_inicio date, p_fim date
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH dias AS (
  SELECT DISTINCT data FROM veiculo_snapshot_diario
  WHERE corretora_id = p_corretora_id AND data BETWEEN p_inicio AND p_fim
),
lim AS (SELECT min(data) AS d0, max(data) AS d1 FROM dias),
antes AS (SELECT placa FROM veiculo_snapshot_diario, lim WHERE corretora_id=p_corretora_id AND data=lim.d0),
depois AS (SELECT placa FROM veiculo_snapshot_diario, lim WHERE corretora_id=p_corretora_id AND data=lim.d1)
SELECT jsonb_build_object(
  'inicio',(SELECT d0 FROM lim), 'fim',(SELECT d1 FROM lim),
  'dias_com_snapshot',(SELECT count(*) FROM dias),
  'placas_inicio',(SELECT count(*) FROM antes), 'placas_fim',(SELECT count(*) FROM depois),
  'cancelamentos',(SELECT count(*) FROM antes a WHERE NOT EXISTS (SELECT 1 FROM depois d WHERE d.placa=a.placa)),
  'adesoes',(SELECT count(*) FROM depois d WHERE NOT EXISTS (SELECT 1 FROM antes a WHERE a.placa=d.placa)),
  'confiavel',(SELECT count(*) FROM dias) >= 2
);
$function$;

GRANT EXECUTE ON FUNCTION public.cancelamentos_periodo(uuid, date, date) TO authenticated;

DO $$ BEGIN PERFORM cron.unschedule('snapshot-veiculos-diario'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('snapshot-veiculos-diario','20 22 * * *',
  $cron$ SELECT public.capturar_snapshot_veiculos(); $cron$);
