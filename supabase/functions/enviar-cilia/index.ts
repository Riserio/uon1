import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper: formata DateTime no padrão do Cilia: "YYYY-MM-DDTHH:mm:ss-03:00"
function toCiliaDateTime(dateInput: string | Date | null | undefined): string | null {
  if (!dateInput) return null;
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss (UTC)
  // Aqui assumimos fuso -03:00; ajuste se precisar
  return `${iso}-03:00`;
}

// Helper: formata Data simples "YYYY-MM-DD"
function toCiliaDate(dateInput: string | Date | null | undefined): string | null {
  if (!dateInput) return null;
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Helper: garante string não vazia, com fallback
function safeString(value: any, fallback: string = "NAO_INFORMADO"): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { atendimento_id, integration_id } = await req.json();

    console.log("enviar-cilia: Recebido request", { atendimento_id, integration_id });

    if (!atendimento_id || !integration_id) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "atendimento_id e integration_id são obrigatórios",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Buscar integração
    const { data: integration, error: integrationError } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (integrationError || !integration) {
      console.error("enviar-cilia: Erro ao buscar integração", integrationError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Integração não encontrada",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!integration.auth_token) {
      console.error("enviar-cilia: auth_token não configurado na integração");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Token de autenticação da integração (auth_token) não configurado",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("enviar-cilia: Integração encontrada", {
      nome: integration.nome,
      base_url: integration.base_url,
      ambiente: integration.ambiente,
    });

    // Buscar dados do atendimento + corretora
    const { data: atendimento, error: atendimentoError } = await supabase
      .from("atendimentos")
      .select(
        `
        *,
        corretoras(nome, cnpj, email, telefone)
      `,
      )
      .eq("id", atendimento_id)
      .single();

    if (atendimentoError || !atendimento) {
      console.error("enviar-cilia: Erro ao buscar atendimento", atendimentoError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Atendimento não encontrado",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Buscar vistoria associada
    const { data: vistoria } = await supabase
      .from("vistorias")
      .select("*")
      .eq("atendimento_id", atendimento_id)
      .maybeSingle();

    // Buscar acompanhamento (custos, oficina, etc)
    const { data: acompanhamento } = await supabase
      .from("sinistro_acompanhamento")
      .select("*")
      .eq("atendimento_id", atendimento_id)
      .maybeSingle();

    console.log("enviar-cilia: Dados carregados", {
      atendimento: atendimento?.numero,
      vistoria: vistoria?.id,
      acompanhamento: acompanhamento?.id,
    });

    // ==============================
    // MAPEAMENTO PARA Budget (T1)
    // ==============================

    // Dados básicos do veículo
    const veiculoMarca = atendimento.veiculo_marca || vistoria?.veiculo_marca;
    const veiculoModelo = atendimento.veiculo_modelo || vistoria?.veiculo_modelo;
    const veiculoAno = atendimento.veiculo_ano || vistoria?.veiculo_ano;
    const veiculoNome = [veiculoMarca, veiculoModelo, veiculoAno].filter(Boolean).join(" ");

    const veiculoChassi = vistoria?.veiculo_chassi || atendimento.veiculo_chassi;
    const veiculoPlaca = vistoria?.veiculo_placa || atendimento.veiculo_placa;
    const veiculoCor = vistoria?.veiculo_cor || atendimento.veiculo_cor;
    const veiculoKm = vistoria?.veiculo_km || atendimento.veiculo_km || 0;

    // Tipo de pintura (RF01): common | metallic | pearled
    // TODO: se você tiver o tipo de pintura no banco, mapeie aqui.
    const paintType = vistoria?.veiculo_tipo_pintura || "common";

    // Região do veículo (RF02) – 1 = Casco
    const vehicleRegionId = 1;

    // Data de agendamento da vistoria (YYYY-MM-DD)
    const schedulingDate =
      toCiliaDate(vistoria?.data_agendamento || vistoria?.data_evento || atendimento.created_at) ||
      toCiliaDate(new Date());

    // Número de sinistro / processo interno
    const casualtyNumber =
      atendimento.numero ||
      `SIN-${new Date(atendimento.created_at).getFullYear()}-${String(atendimento.id).padStart(6, "0")}`;

    // noticeDate - data de aviso do sinistro (DateTime Cilia)
    const noticeDate = toCiliaDateTime(atendimento.created_at) || toCiliaDateTime(new Date());

    // Tipo de sinistro (RF03) – por enquanto fixo em 1 (Colisão)
    // TODO: mapear vistoria.tipo_sinistro -> casualtyTypeId conforme tabela do manual.
    const casualtyTypeId = 1;

    // Tipo de processo (RF04): insured | third_party
    // TODO: se você tiver no banco, mapeie; por enquanto deixo "insured".
    const processType = "insured";

    // Dados do cliente (vem da vistoria pública normalmente)
    const clienteNome = vistoria?.cliente_nome || atendimento.cliente_nome;
    const clienteEmail = vistoria?.cliente_email || atendimento.cliente_email;
    const clienteCpfCnpj = vistoria?.cliente_cpf || atendimento.cliente_cpf_cnpj;

    // Endereço do cliente – se você não tiver quebrado por campos,
    // use o que tiver e depois vai refinando.
    const clienteCep = vistoria?.cliente_cep || atendimento.cliente_cep || "00000-000";
    const clienteBairro = vistoria?.cliente_bairro || "NAO_INFORMADO";
    const clienteNumero = vistoria?.cliente_numero || "SN";
    const clienteLogradouro = vistoria?.cliente_logradouro || vistoria?.endereco || "NAO_INFORMADO";
    const clienteCidade = vistoria?.cliente_cidade || "NAO_INFORMADO";
    const clienteEstado = vistoria?.cliente_estado || "NA";

    const clienteDDD = vistoria?.cliente_telefone_ddd || "00";
    const clienteTelefoneNumero = vistoria?.cliente_telefone || atendimento.telefone || "000000000";
    const clienteTelefoneContato = clienteNome || "Cliente";

    // Oficina – se existir acompanhamento, usa; senão tenta corretora como fallback
    const oficinaDocumento = acompanhamento?.oficina_cnpj || atendimento.corretoras?.cnpj || "00000000000000";
    const oficinaRazaoSocial = acompanhamento?.oficina_nome || atendimento.corretoras?.nome || "Oficina não informada";
    const oficinaFantasia = oficinaRazaoSocial;
    const oficinaEmail =
      acompanhamento?.oficina_email || atendimento.corretoras?.email || clienteEmail || "contato@exemplo.com";
    const oficinaResponsavel = acompanhamento?.oficina_responsavel || oficinaFantasia;

    const oficinaCep = acompanhamento?.oficina_cep || clienteCep;
    const oficinaBairro = acompanhamento?.oficina_bairro || clienteBairro;
    const oficinaNumero = acompanhamento?.oficina_numero || clienteNumero;
    const oficinaLogradouro = acompanhamento?.oficina_logradouro || "NAO_INFORMADO";
    const oficinaCidade = acompanhamento?.oficina_cidade || clienteCidade;
    const oficinaEstado = acompanhamento?.oficina_estado || clienteEstado;

    const oficinaDDD = acompanhamento?.oficina_ddd || clienteDDD;
    const oficinaTelefoneNumero =
      acompanhamento?.oficina_telefone || atendimento.corretoras?.telefone || clienteTelefoneNumero;
    const oficinaTelefoneContato = oficinaResponsavel;

    // Tipo de credenciamento da oficina (RF05): referenced | credential | drp
    // Para vistoria online, faz sentido usar "drp"
    const insurerCredentialWorkshopType = "drp";

    // Tipo de oficina (RF06): general | dealership | multi_brand_dealership
    const workshopType = "general";

    // LossDetails – opcional, mas já aproveitamos alguns campos da vistoria
    const lossDetails = vistoria
      ? {
          responsibleInsured: true, // TODO: mapear se tiver essa info
          lossDate: toCiliaDateTime(vistoria.data_evento || vistoria.data_incidente) || noticeDate,
          eventPlace: vistoria.endereco || "Local não informado",
          address: {
            cep: clienteCep,
            district: clienteBairro,
            number: clienteNumero,
            street: clienteLogradouro,
            city: clienteCidade,
            state: clienteEstado,
          },
          driverName: vistoria.condutor_nome || clienteNome || "Não informado",
          driverLicense: vistoria.condutor_cnh || "",
          driverLicenseExpirationDate: toCiliaDate(vistoria.condutor_cnh_validade) || null,
          policeReport: !!vistoria.fez_bo,
          policeReportNumber: vistoria.numero_bo || "",
          details: vistoria.historico_evento || "",
          observations: vistoria.observacoes || atendimento.observacoes || "",
          damageDescription: vistoria.descricao_avarias || "",
          requesterName: clienteNome || "",
          requesterEmail: clienteEmail || "",
          requesterPhone: clienteTelefoneNumero || "",
          noticeNumber: casualtyNumber,
        }
      : undefined;

    // BudgetSet (obrigatório)
    const budgetSet: any = {
      noticeDate,
      casualtyNumber: safeString(casualtyNumber),
      casualtyTypeId,
      processType,
      client: {
        name: safeString(clienteNome),
        email: safeString(clienteEmail),
        identifier: safeString(clienteCpfCnpj),
        clientType: processType, // insured / third_party
        address: {
          cep: safeString(clienteCep),
          district: safeString(clienteBairro),
          number: safeString(clienteNumero),
          street: safeString(clienteLogradouro),
          city: safeString(clienteCidade),
          state: safeString(clienteEstado),
        },
        phone: {
          ddd: safeString(clienteDDD),
          number: safeString(clienteTelefoneNumero),
          contactName: safeString(clienteTelefoneContato),
        },
      },
    };

    if (lossDetails) {
      budgetSet.lossDetails = lossDetails;
    }

    // Workshop (obrigatório)
    const workshop = {
      administrator: safeString(oficinaResponsavel),
      company: safeString(oficinaRazaoSocial),
      documentIdentifier: safeString(oficinaDocumento),
      email: safeString(oficinaEmail),
      registrationMunicipal: "",
      registrationState: "",
      trade: safeString(oficinaFantasia),
      website: "",
      address: {
        cep: safeString(oficinaCep),
        district: safeString(oficinaBairro),
        number: safeString(oficinaNumero),
        street: safeString(oficinaLogradouro),
        city: safeString(oficinaCidade),
        state: safeString(oficinaEstado),
      },
      phone: {
        ddd: safeString(oficinaDDD),
        number: safeString(oficinaTelefoneNumero),
        contactName: safeString(oficinaTelefoneContato),
      },
      insurerCredentialWorkshopType,
      workshopType,
    };

    // Budget (raiz)
    const budget: any = {
      body: safeString(veiculoChassi),
      licensePlate: safeString(veiculoPlaca),
      vehicleName: safeString(veiculoNome || veiculoModelo || "Veículo"),
      mileage: Number(veiculoKm) || 0,
      paintType,
      color: safeString(veiculoCor),
      vehicleRegionId,
      schedulingDate: safeString(schedulingDate),
      flowType: "initial", // RN07: se não informado, assume initial – aqui já mandamos explícito
      integrationNumber: `ATD-${atendimento.id}`,
      fipeValue: atendimento.veiculo_valor_fipe || vistoria?.veiculo_valor_fipe || null,
      fipeCode: atendimento.veiculo_codigo_fipe || vistoria?.veiculo_codigo_fipe || null,
      workshop,
      budgetSet,
      extraInfo: safeString(`Origem BP: atendimento ${atendimento.id} / número ${atendimento.numero ?? ""}`.trim()),
    };

    // Se quiser enviar fotos, aqui é o lugar:
    // budget.photos = [
    //   { url: "<url pública da foto>", album: "vehicle" },
    // ];

    const baseUrl = (integration.base_url || "https://sistema.cilia.com.br").replace(/\/$/, "");
    const ciliaUrl = `${baseUrl}/services/generico-ws/rest/v2/integracao/createBudget`;
    const proxyUrl = integration.proxy_url;
    const useProxy = proxyUrl && proxyUrl.trim() !== '';

    const bodyToSend = {
      Budget: budget,
    };

    console.log("enviar-cilia: Enviando para CILIA", {
      url: ciliaUrl,
      usingProxy: useProxy,
      proxyUrl: useProxy ? proxyUrl : 'N/A',
      payloadPreview: bodyToSend,
    });

    let ciliaResponse;
    
    if (useProxy) {
      // Usar proxy Hostinger
      console.log("enviar-cilia: Usando proxy Hostinger");
      ciliaResponse = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cilia_url: ciliaUrl,
          auth_token: integration.auth_token,
          payload: bodyToSend,
        }),
      });
    } else {
      // Chamada direta (vai falhar com IP whitelist)
      console.log("enviar-cilia: Chamada direta sem proxy");
      ciliaResponse = await fetch(ciliaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authToken: integration.auth_token,
          Accept: "application/json",
        },
        body: JSON.stringify(bodyToSend),
      });
    }

    const responseText = await ciliaResponse.text();
    console.log("enviar-cilia: Resposta CILIA", {
      status: ciliaResponse.status,
      body: responseText,
    });

    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!ciliaResponse.ok) {
      console.error("enviar-cilia: Erro na resposta CILIA", {
        status: ciliaResponse.status,
        response: responseData,
      });

      const errorMessage =
        responseData?.message ||
        responseData?.genericWsResponse?.message ||
        `Erro ${ciliaResponse.status}: ${responseText}`;

      return new Response(
        JSON.stringify({
          success: false,
          message: errorMessage,
          ciliaStatus: ciliaResponse.status,
          response: responseData,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("enviar-cilia: Sucesso!", responseData);

    const successMessage =
      responseData?.message || responseData?.genericWsResponse?.message || "Orçamento enviado ao CILIA com sucesso";

    return new Response(
      JSON.stringify({
        success: true,
        message: successMessage,
        ciliaStatus: ciliaResponse.status,
        response: responseData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("enviar-cilia: Erro não tratado", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno ao processar requisição";
    return new Response(
      JSON.stringify({
        success: false,
        message: errorMessage,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
