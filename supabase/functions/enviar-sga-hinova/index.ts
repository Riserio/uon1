import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { atendimento_id, integration_id } = await req.json();

    if (!atendimento_id || !integration_id) {
      return new Response(
        JSON.stringify({ success: false, message: "Parâmetros obrigatórios não fornecidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar configuração da integração
    const { data: integration, error: integrationError } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (integrationError || !integration) {
      console.error("Erro ao buscar integração:", integrationError);
      return new Response(
        JSON.stringify({ success: false, message: "Integração não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados do sinistro
    const { data: atendimento, error: atendimentoError } = await supabase
      .from("atendimentos")
      .select(`
        *,
        corretoras(nome, cnpj),
        contatos(nome, cpf, telefone, email)
      `)
      .eq("id", atendimento_id)
      .single();

    if (atendimentoError || !atendimento) {
      console.error("Erro ao buscar atendimento:", atendimentoError);
      return new Response(
        JSON.stringify({ success: false, message: "Sinistro não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados de acompanhamento
    const { data: acompanhamento, error: acompError } = await supabase
      .from("sinistro_acompanhamento")
      .select("*")
      .eq("atendimento_id", atendimento_id)
      .maybeSingle();

    if (acompError) {
      console.error("Erro ao buscar acompanhamento:", acompError);
    }

    // Buscar dados da vistoria vinculada
    const { data: vistoria, error: vistoriaError } = await supabase
      .from("vistorias")
      .select("*")
      .eq("atendimento_id", atendimento_id)
      .maybeSingle();

    if (vistoriaError) {
      console.error("Erro ao buscar vistoria:", vistoriaError);
    }

    // Montar payload para o SGA Hinova
    // Baseado nas rotas documentadas: /sincronismo-produto-fornecedor
    const sgaPayload = {
      // Dados do sinistro
      numero_sinistro: `SIN-${new Date(atendimento.created_at).getFullYear()}-${String(atendimento.numero).padStart(6, '0')}`,
      tipo_sinistro: atendimento.assunto,
      data_abertura: atendimento.created_at,
      data_conclusao: acompanhamento?.finalizado_data || null,
      status: acompanhamento?.finalizado ? 'FINALIZADO' : 'EM_ANDAMENTO',
      
      // Dados do veículo
      veiculo: {
        placa: vistoria?.veiculo_placa || atendimento.veiculo_placa || null,
        marca: vistoria?.veiculo_marca || atendimento.veiculo_marca || null,
        modelo: vistoria?.veiculo_modelo || atendimento.veiculo_modelo || null,
        ano: vistoria?.veiculo_ano || atendimento.veiculo_ano || null,
        chassi: vistoria?.veiculo_chassi || null,
        valor_fipe: vistoria?.veiculo_valor_fipe || atendimento.veiculo_valor_fipe || null,
      },
      
      // Dados do cliente/associado
      associado: {
        nome: vistoria?.cliente_nome || atendimento.contatos?.nome || null,
        cpf: vistoria?.cliente_cpf || atendimento.contatos?.cpf || null,
        telefone: vistoria?.cliente_telefone || atendimento.contatos?.telefone || null,
        email: vistoria?.cliente_email || atendimento.contatos?.email || null,
      },
      
      // Dados financeiros
      financeiro: {
        custo_pecas: acompanhamento?.custo_pecas || 0,
        custo_mao_obra: acompanhamento?.custo_mao_obra || 0,
        custo_servicos: acompanhamento?.custo_servicos || 0,
        custo_outros: acompanhamento?.custo_outros || 0,
        valor_aprovado: acompanhamento?.financeiro_valor_aprovado || 0,
        valor_pago: acompanhamento?.financeiro_valor_pago || 0,
        cota_participacao: acompanhamento?.cota_participacao || 0,
      },
      
      // Dados da oficina
      oficina: {
        nome: acompanhamento?.oficina_nome || null,
        cnpj: acompanhamento?.oficina_cnpj || null,
        tipo: acompanhamento?.oficina_tipo || null,
      },
      
      // Dados do comitê
      comite: {
        status: acompanhamento?.comite_status || null,
        decisao: acompanhamento?.comite_decisao || null,
        data: acompanhamento?.comite_data || null,
      },
      
      // Observações
      observacoes: acompanhamento?.finalizado_observacoes || atendimento.observacoes || null,
      desistencia: acompanhamento?.desistencia || false,
      desistencia_motivo: acompanhamento?.desistencia_motivo || null,
    };

    console.log("Enviando para SGA Hinova:", JSON.stringify(sgaPayload, null, 2));

    // Fazer requisição para a API do SGA Hinova
    const sgaResponse = await fetch(`${integration.base_url}/sincronismo-sinistro`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${integration.auth_token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(sgaPayload),
    });

    const responseText = await sgaResponse.text();
    let sgaResult;
    
    try {
      sgaResult = JSON.parse(responseText);
    } catch {
      sgaResult = { raw: responseText };
    }

    console.log("Resposta SGA Hinova:", sgaResponse.status, sgaResult);

    if (!sgaResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Erro na API SGA Hinova: ${sgaResponse.status}`,
          details: sgaResult 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Sinistro sincronizado com sucesso",
        response: sgaResult 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro na função enviar-sga-hinova:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error instanceof Error ? error.message : "Erro interno" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
