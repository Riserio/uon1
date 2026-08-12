CREATE OR REPLACE FUNCTION public.resumo_base_corretora(p_corretora_id uuid, p_mes_referencia text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_placas int := 0; v_cadastros int := 0; v_imp uuid; v_ref date; v_mes text := NULL;
  v_is_atual boolean := true;
BEGIN
  IF p_mes_referencia IS NOT NULL THEN
    v_is_atual := (to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_mes_referencia);
  END IF;

  SELECT id INTO v_imp FROM estudo_base_importacoes
  WHERE corretora_id = p_corretora_id AND ativo = true ORDER BY created_at DESC LIMIT 1;

  -- Mês corrente: conta ao vivo na base ativa (acompanha a importação diária).
  IF v_is_atual AND v_imp IS NOT NULL THEN
    SELECT count(*) INTO v_placas
    FROM estudo_base_registros er
    WHERE er.importacao_id = v_imp
      AND public.eh_veiculo_ativo(er.situacao_veiculo);
  END IF;

  -- Meses passados (ou base sem registros): usa o consolidado do PID.
  IF coalesce(v_placas,0) = 0 THEN
    IF p_mes_referencia IS NOT NULL THEN
      SELECT coalesce(placas_ativas,0) INTO v_placas FROM pid_operacional
      WHERE corretora_id = p_corretora_id
        AND ano = split_part(p_mes_referencia,'-',1)::int
        AND mes = split_part(p_mes_referencia,'-',2)::int;
    ELSE
      SELECT coalesce(placas_ativas,0) INTO v_placas FROM pid_operacional
      WHERE corretora_id = p_corretora_id ORDER BY ano DESC, mes DESC LIMIT 1;
    END IF;
  END IF;

  IF v_imp IS NOT NULL THEN
    IF p_mes_referencia IS NOT NULL THEN
      v_ref := to_date(p_mes_referencia||'-01','YYYY-MM-DD');
    ELSE
      SELECT max(data_contrato) INTO v_ref FROM estudo_base_registros
      WHERE importacao_id = v_imp AND data_contrato IS NOT NULL;
    END IF;

    IF v_ref IS NOT NULL THEN
      v_mes := to_char(v_ref,'YYYY-MM');
      SELECT count(*) INTO v_cadastros FROM estudo_base_registros
      WHERE importacao_id = v_imp
        AND data_contrato >= date_trunc('month', v_ref)
        AND data_contrato <  (date_trunc('month', v_ref) + interval '1 month');
    END IF;
  END IF;

  RETURN jsonb_build_object('placas_ativas', coalesce(v_placas,0),
                            'cadastros_mes', coalesce(v_cadastros,0),
                            'mes_referencia', v_mes);
END;
$function$;