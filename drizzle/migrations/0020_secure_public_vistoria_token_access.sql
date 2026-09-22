CREATE OR REPLACE FUNCTION public.get_vistoria_publica(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(v)
    || jsonb_build_object(
      'corretoras', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('nome', c.nome, 'logo_url', c.logo_url, 'slug', c.slug) END,
      'atendimentos', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'corretora_id', a.corretora_id,
        'responsavel_id', a.responsavel_id,
        'corretoras', CASE WHEN ac.id IS NULL THEN NULL ELSE jsonb_build_object('nome', ac.nome, 'slug', ac.slug) END,
        'profiles', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('nome', p.nome) END
      ) END
    )
  FROM public.vistorias v
  LEFT JOIN public.corretoras c ON c.id = v.corretora_id
  LEFT JOIN public.atendimentos a ON a.id = v.atendimento_id
  LEFT JOIN public.corretoras ac ON ac.id = a.corretora_id
  LEFT JOIN public.profiles p ON p.id = a.responsavel_id
  WHERE v.link_token = p_token
    AND (v.link_expires_at > now() OR v.status = 'concluida')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.atualizar_vistoria_publica(p_token uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_key text;
  v_assignments text := '';
  v_allowed constant text[] := ARRAY[
    'tipo_abertura','tipo_vistoria','status','veiculo_placa','veiculo_marca','veiculo_modelo','veiculo_ano','veiculo_cor','veiculo_chassi',
    'cliente_nome','cliente_email','cliente_telefone','cliente_cpf','relato_incidente','data_incidente','latitude','longitude','endereco',
    'completed_at','cnh_url','cnh_dados','crlv_fotos_urls','fez_bo','bo_url','assinatura_url','foi_hospital','laudo_medico_url',
    'motorista_faleceu','atestado_obito_url','policia_foi_local','data_evento','hora_evento','condutor_veiculo','narrar_fatos',
    'vitima_ou_causador','tem_terceiros','placa_terceiro','local_tem_camera','croqui_acidente_url','laudo_alcoolemia_url',
    'estava_chovendo','acionou_assistencia_24h','houve_remocao_veiculo','veiculo_valor_fipe','veiculo_fipe_codigo',
    'veiculo_fipe_data_consulta','veiculo_tipo','quilometragem','tipo_pintura','veiculo_uf','endereco_associado','endereco_local_evento',
    'terceiro_placa','terceiro_marca_modelo','terceiro_nome','terceiro_telefone'
  ];
BEGIN
  SELECT id INTO v_id
  FROM public.vistorias
  WHERE link_token = p_token AND link_expires_at > now()
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Link de vistoria inválido ou expirado';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(COALESCE(p_payload, '{}'::jsonb)) LOOP
    IF v_key = ANY(v_allowed) THEN
      v_assignments := v_assignments || CASE WHEN v_assignments = '' THEN '' ELSE ', ' END
        || format('%I = (jsonb_populate_record(NULL::public.vistorias, jsonb_build_object(%L, $2->%L))).%I', v_key, v_key, v_key, v_key);
    END IF;
  END LOOP;

  IF v_assignments = '' THEN
    RAISE EXCEPTION 'Nenhum campo permitido foi informado';
  END IF;

  EXECUTE format('UPDATE public.vistorias SET %s WHERE id = $1', v_assignments)
    USING v_id, p_payload;

  RETURN public.get_vistoria_publica(p_token);
END
$$;

REVOKE ALL ON FUNCTION public.get_vistoria_publica(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atualizar_vistoria_publica(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vistoria_publica(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_vistoria_publica(uuid, jsonb) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view vistoria by matching token" ON public.vistorias;
DROP POLICY IF EXISTS "Public can update vistoria by matching token" ON public.vistorias;
DROP POLICY IF EXISTS "Public can view atendimentos via valid vistoria token" ON public.atendimentos;
REVOKE ALL ON public.vistorias FROM anon;
REVOKE ALL ON public.atendimentos FROM anon;