import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { base_url, auth_token } = await req.json();

    if (!base_url || !auth_token) {
      return new Response(
        JSON.stringify({ success: false, message: "URL base e token são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limpar token
    const cleanToken = auth_token.trim().replace(/^["']|["']$/g, '');
    const cleanUrl = base_url.replace(/\/$/, "");
    
    console.log("testar-cilia: Testando conexão CILIA", { 
      url: cleanUrl,
      endpoint: `${cleanUrl}/services/generico-ws/rest/v2/integracao/createBudget`,
      tokenLength: cleanToken.length,
      tokenPreview: `${cleanToken.slice(0, 10)}...${cleanToken.slice(-10)}`
    });

    // Endpoint correto conforme documentação CILIA
    const testUrl = `${cleanUrl}/services/generico-ws/rest/v2/integracao/createBudget`;
    
    // Payload mínimo válido conforme documentação
    const minimalPayload = {
      "Budget": {
        "integrationNumber": "TEST-" + Date.now(),
        "body": "00000000000000000",
        "licensePlate": "AAA-0000",
        "vehicleName": "Teste Conexao",
        "vehicleRegionId": 1,
        "insuredValue": 10000.00,
        "mileage": 0,
        "paintType": "common",
        "color": "Preto",
        "budgetSet": {
          "casualtyNumber": "TEST-001",
          "noticeDate": new Date().toISOString(),
          "casualtyTypeId": "1",
          "processType": "insured",
          "client": {
            "name": "Teste",
            "identifier": "00000000000",
            "clientType": "insured"
          }
        }
      }
    };
    
    console.log("testar-cilia: Enviando requisição com authToken no header");
    
    const response = await fetch(testUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authToken": cleanToken,
        "Accept": "application/json",
      },
      body: JSON.stringify(minimalPayload),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log("testar-cilia: Resposta da API", { 
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      bodyPreview: responseText.slice(0, 500),
      bodyFull: responseData
    });

    // Verificar se é página HTML (404)
    if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html>")) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Endpoint não encontrado (404). Verifique se a URL base está correta.",
          status: 404,
          debug: {
            url: testUrl,
            receivedHTML: true
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analisar resposta
    if (response.status === 401 || responseData?.code === 2 || responseData?.messageType === "error_invalid_token") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Erro de autenticação com API CILIA. Verifique se: (1) Token está correto, (2) URL base corresponde ao ambiente do token (Produção/Homologação), (3) Whitelist de IPs permite Edge Functions do Supabase.",
          status: 401,
          response: responseData,
          debug: {
            endpoint: testUrl,
            tokenLength: cleanToken.length,
            tokenPreview: `${cleanToken.slice(0, 15)}...${cleanToken.slice(-15)}`,
            ciliaError: responseData?.message || "Token de acesso inválido",
            suggestion: "Contate suporte CILIA para: (1) Confirmar token está ativo, (2) Verificar whitelist de IPs, (3) Confirmar URL do ambiente"
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 404) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Endpoint não encontrado. Verifique a URL base da API.",
          status: 404,
          debug: {
            testedUrl: testUrl,
            expectedPath: "/services/generico-ws/rest/v2/integracao/createBudget"
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se chegou aqui, conexão funcionou (mesmo que tenha outros erros de validação)
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Conexão estabelecida com sucesso! API CILIA respondeu corretamente.",
        status: response.status,
        response: responseData
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("testar-cilia: Erro:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: `Erro de conexão: ${errorMessage}`,
        error: String(error)
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
