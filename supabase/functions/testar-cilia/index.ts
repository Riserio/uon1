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
    const { base_url, auth_token, proxy_url } = await req.json();

    if (!base_url || !auth_token) {
      return new Response(
        JSON.stringify({ success: false, message: "URL base e token são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limpar token
    const cleanToken = auth_token.trim().replace(/^["']|["']$/g, '');
    const cleanUrl = base_url.replace(/\/$/, "");
    const useProxy = proxy_url && proxy_url.trim() !== '';
    
    console.log("testar-cilia: Testando conexão CILIA", { 
      url: cleanUrl,
      endpoint: `${cleanUrl}/services/generico-ws/rest/v2/integracao/createBudget`,
      tokenLength: cleanToken.length,
      tokenPreview: `${cleanToken.slice(0, 10)}...${cleanToken.slice(-10)}`,
      usingProxy: useProxy,
      proxyUrl: useProxy ? proxy_url : 'N/A'
    });

    // Endpoint correto conforme documentação CILIA
    const ciliaEndpoint = `${cleanUrl}/services/generico-ws/rest/v2/integracao/createBudget`;
    
    // Payload completo válido para teste de conexão
    const testPayload = {
      "Budget": {
        "body": "9BWZZZ377VT004251",
        "licensePlate": "ABC-1234",
        "vehicleName": "VW GOL 1.0 2015",
        "mileage": 123456,
        "paintType": "common",
        "color": "PRATA",
        "vehicleRegionId": 1,
        "schedulingDate": "2025-12-01",
        "flowType": "initial",
        "integrationNumber": "TESTE-" + Date.now(),
        "workshop": {
          "administrator": "JOÃO DA OFICINA",
          "company": "OFICINA TESTE LTDA",
          "documentIdentifier": "12345678000199",
          "email": "oficina@teste.com",
          "registrationMunicipal": "",
          "registrationState": "",
          "trade": "OFICINA TESTE",
          "website": "",
          "address": {
            "cep": "04000-000",
            "district": "CENTRO",
            "number": "100",
            "street": "RUA TESTE",
            "city": "SÃO PAULO",
            "state": "SP"
          },
          "phone": {
            "ddd": "11",
            "number": "999999999",
            "contactName": "JOÃO DA OFICINA"
          },
          "insurerCredentialWorkshopType": "drp",
          "workshopType": "general"
        },
        "budgetSet": {
          "noticeDate": "2025-12-01T10:00:00-03:00",
          "casualtyNumber": "SIN-TESTE-001",
          "casualtyTypeId": 1,
          "processType": "insured",
          "client": {
            "name": "CLIENTE TESTE",
            "email": "cliente@teste.com",
            "identifier": "12345678909",
            "clientType": "insured",
            "address": {
              "cep": "04000-000",
              "district": "CENTRO",
              "number": "200",
              "street": "RUA DO CLIENTE",
              "city": "SÃO PAULO",
              "state": "SP"
            },
            "phone": {
              "ddd": "11",
              "number": "988888888",
              "contactName": "CLIENTE TESTE"
            }
          }
        }
      }
    };
    
    console.log("testar-cilia: Enviando requisição com authToken no header");
    console.log("testar-cilia: Payload de teste", {
      integrationNumber: testPayload.Budget.integrationNumber,
      licensePlate: testPayload.Budget.licensePlate,
      vehicleName: testPayload.Budget.vehicleName
    });
    
    let response;
    
    if (useProxy) {
      // Usar proxy Hostinger
      console.log("testar-cilia: Usando proxy Hostinger");
      response = await fetch(proxy_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cilia_url: ciliaEndpoint,
          auth_token: cleanToken,
          payload: testPayload,
        }),
      });
    } else {
      // Chamada direta (vai falhar com IP whitelist)
      console.log("testar-cilia: Chamada direta sem proxy");
      response = await fetch(ciliaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authToken": cleanToken,
          "Accept": "application/json",
        },
        body: JSON.stringify(testPayload),
      });
    }

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
            url: ciliaEndpoint,
            receivedHTML: true,
            usingProxy: useProxy
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
          message: "Erro de autenticação com API CILIA. Verifique o token de acesso.",
          status: 401,
          response: responseData
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
            testedUrl: ciliaEndpoint,
            expectedPath: "/services/generico-ws/rest/v2/integracao/createBudget",
            usingProxy: useProxy
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Status 201 = Budget criado com sucesso
    if (response.status === 201) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "✅ Conexão estabelecida com sucesso! Budget de teste criado na CILIA.",
          status: 201,
          response: responseData,
          budgetId: responseData?.id || responseData?.Budget?.id
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
