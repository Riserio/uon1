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

    // Limpar token de possíveis aspas ou espaços
    const cleanToken = auth_token.trim().replace(/^["']|["']$/g, '');
    const cleanUrl = base_url.replace(/\/$/, "");
    
    console.log("testar-cilia: Testando conexão", { 
      url: cleanUrl,
      tokenLength: cleanToken.length,
      tokenPreview: `${cleanToken.slice(0, 10)}...${cleanToken.slice(-10)}`
    });

    // Testar com endpoint de criação de budget (teste)
    const testUrl = `${cleanUrl}/services/generico-ws/rest/v2/integracao/createBudget`;
    
    console.log("testar-cilia: Headers enviados", { 
      "Content-Type": "application/json",
      "authToken": `${cleanToken.slice(0, 20)}...${cleanToken.slice(-20)}`,
      "Accept": "application/json",
    });
    
    const response = await fetch(testUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authToken": cleanToken,
        "Accept": "application/json",
      },
      body: JSON.stringify({ Budget: { test: true } }),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log("testar-cilia: Resposta completa", { 
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText.slice(0, 1000),
      bodyFull: responseData
    });

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

    // Verificar resposta
    if (response.status === 401 || responseData?.code === 2 || responseData?.messageType === "error_invalid_token") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Token de acesso inválido ou expirado. Solicite um novo token à CILIA.",
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
