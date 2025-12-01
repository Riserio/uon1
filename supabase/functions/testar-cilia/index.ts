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

    // Limpar token de forma mais agressiva
    const cleanToken = auth_token.trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, '')
      .replace(/\n/g, '');
    const cleanUrl = base_url.replace(/\/$/, "");
    
    console.log("testar-cilia: INÍCIO DO TESTE", { 
      url: cleanUrl,
      tokenOriginalLength: auth_token.length,
      tokenCleanLength: cleanToken.length,
      tokenPreview: `${cleanToken.slice(0, 10)}...${cleanToken.slice(-10)}`,
      tokenFull: cleanToken // LOG COMPLETO DO TOKEN PARA DEBUG
    });

    // Testar com endpoint de criação de budget
    const testUrl = `${cleanUrl}/services/generico-ws/rest/v2/integracao/createBudget`;
    
    // Primeiro teste: com header "authToken" (formato atual)
    console.log("testar-cilia: TESTE 1 - Header authToken");
    const headers1 = {
      "Content-Type": "application/json",
      "authToken": cleanToken,
      "Accept": "application/json",
    };
    console.log("testar-cilia: Headers teste 1", { 
      headers: headers1,
      tokenLength: cleanToken.length
    });
    
    const response = await fetch(testUrl, {
      method: "POST",
      headers: headers1,
      body: JSON.stringify({ Budget: { test: true } }),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log("testar-cilia: RESPOSTA TESTE 1", { 
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText.slice(0, 1000),
      bodyFull: responseData
    });

    // Se o teste 1 falhou com 401, tentar teste 2 com Authorization Bearer
    if (response.status === 401) {
      console.log("testar-cilia: TESTE 2 - Header Authorization Bearer");
      const headers2 = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cleanToken}`,
        "Accept": "application/json",
      };
      
      const response2 = await fetch(testUrl, {
        method: "POST",
        headers: headers2,
        body: JSON.stringify({ Budget: { test: true } }),
      });

      const responseText2 = await response2.text();
      let responseData2;
      try {
        responseData2 = JSON.parse(responseText2);
      } catch {
        responseData2 = { raw: responseText2 };
      }

      console.log("testar-cilia: RESPOSTA TESTE 2", { 
        status: response2.status,
        statusText: response2.statusText,
        body: responseText2.slice(0, 1000),
        bodyFull: responseData2
      });

      // Se teste 2 também falhou, retornar logs detalhados
      if (response2.status === 401) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Ambos formatos de autenticação falharam. Detalhes nos logs.",
            status: 401,
            debug: {
              teste1_authToken: {
                status: response.status,
                response: responseData
              },
              teste2_bearer: {
                status: response2.status,
                response: responseData2
              },
              tokenInfo: {
                length: cleanToken.length,
                preview: `${cleanToken.slice(0, 15)}...${cleanToken.slice(-15)}`
              }
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Teste 2 funcionou!
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Conexão estabelecida com Authorization Bearer!",
          status: response2.status,
          response: responseData2,
          authFormat: "Bearer"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se é página 404 HTML
    if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html>")) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Endpoint não encontrado (404). Verifique a URL base da API.",
          status: 404
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 404) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Endpoint não encontrado. Verifique a URL base.",
          status: 404
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se chegou aqui, a conexão está funcionando (mesmo com erros de validação de dados)
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Conexão estabelecida com sucesso!",
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
