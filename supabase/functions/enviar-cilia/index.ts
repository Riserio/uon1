import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CiliaBudgetRequest {
  integrationNumber: string;
  body: string; // Chassi
  vehicleName: string;
  vehicleRegionId: number;
  licensePlate: string;
  insuredValue?: number;
  mileage?: number;
  paintType?: string;
  color?: string;
  budgetSet: {
    casualtyNumber: string;
    noticeDate: string;
    casualtyTypeId: string;
    processType: string;
    client: {
      name: string;
      identifier: string;
      clientType: string;
    };
  };
  workshop?: {
    documentIdentifier: string;
    company: string;
    trade: string;
    email?: string;
    administrator?: string;
    insurerCredentialWorkshopType?: string;
    workshopType?: string;
  };
  photos?: Array<{
    url: string;
    album: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { atendimento_id, integration_id } = await req.json();

    if (!atendimento_id || !integration_id) {
      return new Response(
        JSON.stringify({ success: false, message: "Parâmetros obrigatórios não fornecidos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Buscar dados da integração
    const { data: integration, error: integrationError } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (integrationError || !integration) {
      console.error("Erro ao buscar integração:", integrationError);
      return new Response(
        JSON.stringify({ success: false, message: "Integração não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Buscar dados do atendimento
    const { data: atendimento, error: atendimentoError } = await supabase
      .from("atendimentos")
      .select(`
        *,
        corretoras(nome, cnpj),
        contatos(nome, email, telefone)
      `)
      .eq("id", atendimento_id)
      .single();

    if (atendimentoError || !atendimento) {
      console.error("Erro ao buscar atendimento:", atendimentoError);
      return new Response(
        JSON.stringify({ success: false, message: "Atendimento não encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Buscar vistoria vinculada
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

    // Buscar fotos da vistoria
    let photos: Array<{ url: string; album: string }> = [];
    if (vistoria) {
      const { data: fotosData } = await supabase
        .from("vistoria_fotos")
        .select("*")
        .eq("vistoria_id", vistoria.id);

      if (fotosData) {
        photos = fotosData.map((foto: any) => ({
          url: foto.url,
          album: foto.tipo === "cnh" || foto.tipo === "crlv" ? "document" : "vehicle",
        }));
      }
    }

    // Montar payload para o CILIA
    const budgetPayload: CiliaBudgetRequest = {
      integrationNumber: `SIN-${new Date(atendimento.created_at).getFullYear()}-${String(atendimento.numero).padStart(6, "0")}`,
      body: vistoria?.veiculo_chassi || "",
      vehicleName: `${vistoria?.veiculo_marca || ""} ${vistoria?.veiculo_modelo || ""}`.trim() || "Veículo não especificado",
      vehicleRegionId: 1, // Default para Brasil
      licensePlate: vistoria?.veiculo_placa || "",
      insuredValue: vistoria?.valor_indenizacao || 0,
      mileage: vistoria?.quilometragem || 0,
      paintType: "solid", // Default
      color: vistoria?.veiculo_cor || "Não informado",
      budgetSet: {
        casualtyNumber: String(atendimento.numero),
        noticeDate: atendimento.created_at,
        casualtyTypeId: "1", // Default
        processType: "insured",
        client: {
          name: vistoria?.cliente_nome || atendimento.contatos?.nome || "Cliente não identificado",
          identifier: vistoria?.cliente_cpf || "",
          clientType: "insured",
        },
      },
      photos,
    };

    // Adicionar dados da oficina se disponível
    if (acompanhamento?.oficina_nome) {
      budgetPayload.workshop = {
        documentIdentifier: acompanhamento.oficina_cnpj || "",
        company: acompanhamento.oficina_nome,
        trade: acompanhamento.oficina_nome,
        email: "",
        workshopType: acompanhamento.oficina_tipo === "referenciada" ? "drp" : "general",
      };
    }

    console.log("Enviando para CILIA:", JSON.stringify(budgetPayload, null, 2));

    // Fazer requisição para o CILIA
    const ciliaUrl = `${integration.base_url}/services/generico-ws/rest/v2/integracao/createBudget`;

    const ciliaResponse = await fetch(ciliaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authToken: integration.auth_token,
      },
      body: JSON.stringify(budgetPayload),
    });

    const ciliaData = await ciliaResponse.json();

    console.log("Resposta do CILIA:", JSON.stringify(ciliaData, null, 2));

    if (!ciliaResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          message: ciliaData.message || "Erro ao enviar para o CILIA",
          response: ciliaData,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: ciliaResponse.status }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sinistro enviado ao CILIA com sucesso",
        budgetId: ciliaData.budgetId || ciliaData.id,
        response: ciliaData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Erro na função enviar-cilia:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
