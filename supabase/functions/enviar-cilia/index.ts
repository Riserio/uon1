import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configurações de retry
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

// Função para delay com backoff exponencial
function getDelayWithBackoff(attempt: number): number {
  const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  // Adicionar jitter para evitar thundering herd
  const jitter = Math.random() * 0.3 * delay;
  return delay + jitter;
}

// Função para aguardar
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Verifica se o erro indica token inválido/expirado
function isTokenError(status: number, responseData: Record<string, unknown>): boolean {
  if (status === 401 || status === 403) return true;
  if (responseData?.code === 2) return true;
  if (responseData?.messageType === "error_invalid_token") return true;
  if (typeof responseData?.message === "string" && 
      (responseData.message.toLowerCase().includes("token") || 
       responseData.message.toLowerCase().includes("unauthorized") ||
       responseData.message.toLowerCase().includes("não autorizado"))) return true;
  return false;
}

// Verifica se o erro é temporário e pode tentar retry
function isRetryableError(status: number): boolean {
  // Erros de servidor (5xx) ou timeout são retryable
  return status >= 500 || status === 408 || status === 429;
}

// Função principal de envio com retry
async function sendToCiliaWithRetry(
  ciliaUrl: string,
  cleanToken: string,
  bodyToSend: Record<string, unknown>,
  maxRetries: number = MAX_RETRIES
): Promise<{ success: boolean; status: number; data: Record<string, unknown>; tokenExpired?: boolean }> {
  let lastError: Error | null = null;
  let lastStatus = 0;
  let lastData: Record<string, unknown> = {};

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`enviar-cilia: Tentativa ${attempt + 1}/${maxRetries}`);

      const response = await fetch(ciliaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authToken: cleanToken,
          Accept: "application/json",
        },
        body: JSON.stringify(bodyToSend),
      });

      const responseText = await response.text();
      lastStatus = response.status;

      let responseData: Record<string, unknown>;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }
      lastData = responseData;

      console.log(`enviar-cilia: Resposta tentativa ${attempt + 1}`, {
        status: response.status,
        body: responseText.slice(0, 500),
      });

      // Se token expirado, não faz retry - precisa atualizar manualmente
      if (isTokenError(response.status, responseData)) {
        console.error("enviar-cilia: Token expirado ou inválido - requer atualização manual");
        return {
          success: false,
          status: response.status,
          data: responseData,
          tokenExpired: true,
        };
      }

      // Sucesso!
      if (response.ok) {
        return {
          success: true,
          status: response.status,
          data: responseData,
        };
      }

      // Se erro não é retryable, retorna imediatamente
      if (!isRetryableError(response.status)) {
        return {
          success: false,
          status: response.status,
          data: responseData,
        };
      }

      // Erro retryable - aguarda e tenta novamente
      if (attempt < maxRetries - 1) {
        const delay = getDelayWithBackoff(attempt);
        console.log(`enviar-cilia: Erro retryable, aguardando ${Math.round(delay)}ms antes de retry`);
        await sleep(delay);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`enviar-cilia: Erro na tentativa ${attempt + 1}:`, lastError.message);

      if (attempt < maxRetries - 1) {
        const delay = getDelayWithBackoff(attempt);
        console.log(`enviar-cilia: Aguardando ${Math.round(delay)}ms antes de retry`);
        await sleep(delay);
      }
    }
  }

  // Todas as tentativas falharam
  return {
    success: false,
    status: lastStatus || 500,
    data: lastError ? { error: lastError.message } : lastData,
  };
}

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

    // Montar payload interno
    const ciliaPayload = {
      numeroSinistro: `SIN-${new Date(atendimento.created_at).getFullYear()}-${String(atendimento.numero).padStart(6, "0")}`,
      dataAbertura: atendimento.created_at,
      status: atendimento.status,
      assunto: atendimento.assunto,
      observacoes: atendimento.observacoes,
      prioridade: atendimento.prioridade,
      veiculo: {
        marca: atendimento.veiculo_marca || vistoria?.veiculo_marca,
        modelo: atendimento.veiculo_modelo || vistoria?.veiculo_modelo,
        ano: atendimento.veiculo_ano || vistoria?.veiculo_ano,
        placa: vistoria?.veiculo_placa,
        cor: vistoria?.veiculo_cor,
        chassi: vistoria?.veiculo_chassi,
        valorFipe: atendimento.veiculo_valor_fipe || vistoria?.veiculo_valor_fipe,
      },
      cliente: {
        nome: vistoria?.cliente_nome,
        cpf: vistoria?.cliente_cpf,
        email: vistoria?.cliente_email,
        telefone: vistoria?.cliente_telefone,
      },
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
      corretora: atendimento.corretoras
        ? {
            nome: atendimento.corretoras.nome,
            cnpj: atendimento.corretoras.cnpj,
            email: atendimento.corretoras.email,
            telefone: atendimento.corretoras.telefone,
          }
        : null,
    };

    // Limpar token
    const cleanToken = integration.auth_token.trim().replace(/^["']|["']$/g, '');
    const baseUrl = (integration.base_url || "https://sistema.cilia.com.br").replace(/\/$/, "");
    const ciliaUrl = `${baseUrl}/services/generico-ws/rest/v2/integracao/createBudget`;

    console.log("enviar-cilia: Enviando para CILIA com retry automático", {
      url: ciliaUrl,
      tokenLength: cleanToken.length,
      tokenPreview: `${cleanToken.slice(0, 10)}...${cleanToken.slice(-10)}`,
      maxRetries: MAX_RETRIES,
    });

    const bodyToSend = {
      Budget: ciliaPayload,
    };

    // Enviar com retry automático
    const result = await sendToCiliaWithRetry(ciliaUrl, cleanToken, bodyToSend);

    // Token expirado - mensagem clara para o usuário
    if (result.tokenExpired) {
      // Marcar integração como inativa para alertar o usuário
      await supabase
        .from("api_integrations")
        .update({ ativo: false })
        .eq("id", integration_id);

      return new Response(
        JSON.stringify({
          success: false,
          message: "⚠️ TOKEN EXPIRADO: O token de acesso à CILIA expirou ou é inválido. " +
                   "Acesse Configurações → API/Integrações → CILIA e atualize o token. " +
                   "A integração foi desativada automaticamente.",
          tokenExpired: true,
          ciliaStatus: result.status,
          response: result.data,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!result.success) {
      console.error("enviar-cilia: Falha após todas as tentativas", {
        status: result.status,
        response: result.data,
      });

      const errorMessage =
        typeof result.data?.message === 'string' ? result.data.message :
        typeof result.data?.error === 'string' ? result.data.error :
        `Erro ${result.status} após ${MAX_RETRIES} tentativas`;

      return new Response(
        JSON.stringify({
          success: false,
          message: errorMessage,
          ciliaStatus: result.status,
          response: result.data,
          retriesAttempted: MAX_RETRIES,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("enviar-cilia: Sucesso!", result.data);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sinistro enviado ao CILIA com sucesso",
        budgetId: result.data?.id || result.data?.budgetId,
        response: result.data,
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
