import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
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
        JSON.stringify({ success: false, message: "atendimento_id e integration_id são obrigatórios" }),
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
      return new Response(JSON.stringify({ success: false, message: "Integração não encontrada" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("enviar-cilia: Integração encontrada", {
      nome: integration.nome,
      base_url: integration.base_url,
      ambiente: integration.ambiente,
    });

    // Buscar dados do atendimento
    const { data: atendimento, error: atendimentoError } = await supabase
      .from("atendimentos")
      .select(
        `
        *,
        corretoras(nome, cnpj, email, telefone),
        contatos(nome, email, telefone, cpf_cnpj:cargo)
      `,
      )
      .eq("id", atendimento_id)
      .single();

    if (atendimentoError || !atendimento) {
      console.error("enviar-cilia: Erro ao buscar atendimento", atendimentoError);
      return new Response(JSON.stringify({ success: false, message: "Atendimento não encontrado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar vistoria associada
    const { data: vistoria } = await supabase
      .from("vistorias")
      .select("*")
      .eq("atendimento_id", atendimento_id)
      .maybeSingle();

    // Buscar acompanhamento
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

    // Montar payload interno (seu modelo atual)
    const ciliaPayload = {
      numeroSinistro: `SIN-${new Date(atendimento.created_at).getFullYear()}-${String(atendimento.numero).padStart(6, "0")}`,
      dataAbertura: atendimento.created_at,
      status: atendimento.status,
      assunto: atendimento.assunto,
      observacoes: atendimento.observacoes,
      prioridade: atendimento.prioridade,
      // Dados do veículo
      veiculo: {
        marca: atendimento.veiculo_marca || vistoria?.veiculo_marca,
        modelo: atendimento.veiculo_modelo || vistoria?.veiculo_modelo,
        ano: atendimento.veiculo_ano || vistoria?.veiculo_ano,
        placa: vistoria?.veiculo_placa,
        cor: vistoria?.veiculo_cor,
        chassi: vistoria?.veiculo_chassi,
        valorFipe: atendimento.veiculo_valor_fipe || vistoria?.veiculo_valor_fipe,
      },
      // Dados do cliente
      cliente: {
        nome: vistoria?.cliente_nome,
        cpf: vistoria?.cliente_cpf,
        email: vistoria?.cliente_email,
        telefone: vistoria?.cliente_telefone,
      },
      // Dados do sinistro
      sinistro: {
        tipo: vistoria?.tipo_sinistro,
        dataEvento: vistoria?.data_evento || vistoria?.data_incidente,
        horaEvento: vistoria?.hora_evento,
        endereco: vistoria?.endereco,
        historicoEvento: vistoria?.historico_evento,
        fezBo: vistoria?.fez_bo,
        foiHospital: vistoria?.foi_hospital,
        houveRemocao: vistoria?.houve_remocao_veiculo,
        acionouAssistencia: vistoria?.acionou_assistencia_24h,
      },
      // Dados do acompanhamento (custos, etc)
      acompanhamento: acompanhamento
        ? {
            comiteStatus: acompanhamento.comite_status,
            comiteDecisao: acompanhamento.comite_decisao,
            cotaParticipacao: acompanhamento.cota_participacao,
            cotaPercentual: acompanhamento.cota_percentual,
            custoPecas: acompanhamento.custo_pecas,
            custoMaoObra: acompanhamento.custo_mao_obra,
            custoServicos: acompanhamento.custo_servicos,
            custoOutros: acompanhamento.custo_outros,
            reparoAutorizado: acompanhamento.reparo_autorizado,
            oficinaNome: acompanhamento.oficina_nome,
            oficinaCnpj: acompanhamento.oficina_cnpj,
            financeiroStatus: acompanhamento.financeiro_status,
            financeiroValorAprovado: acompanhamento.financeiro_valor_aprovado,
            financeiroValorPago: acompanhamento.financeiro_valor_pago,
            finalizado: acompanhamento.finalizado,
            finalizadoData: acompanhamento.finalizado_data,
          }
        : null,
      // Corretora
      corretora: atendimento.corretoras
        ? {
            nome: atendimento.corretoras.nome,
            cnpj: atendimento.corretoras.cnpj,
            email: atendimento.corretoras.email,
            telefone: atendimento.corretoras.telefone,
          }
        : null,
    };

    // Limpar token de possíveis aspas ou espaços antes de usar
    const cleanToken = integration.auth_token.trim().replace(/^["']|["']$/g, '');
    
    // Montar URL correta do Cilia (QA ou PROD) a partir de integration.base_url
    // A URL base deve incluir o caminho completo da API
    const baseUrl = (integration.base_url || "https://sistema.cilia.com.br").replace(/\/$/, "");
    
    // Endpoint correto da API CILIA para criação de orçamentos
    // Documentação CILIA usa: /services/generico-ws/rest/v2/integracao/createBudget
    const ciliaUrl = `${baseUrl}/services/generico-ws/rest/v2/integracao/createBudget`;

    console.log("enviar-cilia: Enviando para CILIA", {
      url: ciliaUrl,
      tokenLength: cleanToken.length,
      tokenPreview: `${cleanToken.slice(0, 10)}...${cleanToken.slice(-10)}`,
      payloadPreview: ciliaPayload,
    });

    // Envelopar no formato esperado pela doc: { Budget: { ... } }
    const bodyToSend = {
      Budget: ciliaPayload, // depois você adapta pro modelo exato da Cilia (T1)
    };

    // Enviar para CILIA
    const ciliaResponse = await fetch(ciliaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Cilia usa header "authToken", não Authorization Bearer - SEM ASPAS!
        authToken: cleanToken,
        Accept: "application/json",
      },
      body: JSON.stringify(bodyToSend),
    });

    const responseText = await ciliaResponse.text();
    console.log("enviar-cilia: Resposta CILIA", {
      status: ciliaResponse.status,
      body: responseText,
    });

    let responseData;
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
        responseData?.message || responseData?.error || `Erro ${ciliaResponse.status}: ${responseText}`;

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

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sinistro enviado ao CILIA com sucesso",
        budgetId: responseData?.id || responseData?.budgetId,
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
