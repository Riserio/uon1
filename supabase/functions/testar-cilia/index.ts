import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configurações de retry
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 5000;

// Função para delay com backoff exponencial
function getDelayWithBackoff(attempt: number): number {
  const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = Math.random() * 0.3 * delay;
  return delay + jitter;
}

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
  return status >= 500 || status === 408 || status === 429;
}

// Função de teste com retry
async function testConnectionWithRetry(
  testUrl: string,
  cleanToken: string,
  maxRetries: number = MAX_RETRIES
): Promise<{ success: boolean; status: number; data: Record<string, unknown>; tokenExpired?: boolean; is404?: boolean }> {
  let lastError: Error | null = null;
  let lastStatus = 0;
  let lastData: Record<string, unknown> = {};

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`testar-cilia: Tentativa ${attempt + 1}/${maxRetries}`);

      const response = await fetch(testUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authToken: cleanToken,
          Accept: "application/json",
        },
        body: JSON.stringify({ Budget: { test: true } }),
      });

      const responseText = await response.text();
      lastStatus = response.status;

      // Verificar se é página HTML (404)
      if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html>")) {
        return {
          success: false,
          status: 404,
          data: { raw: "Página HTML retornada - endpoint não encontrado" },
          is404: true,
        };
      }

      let responseData: Record<string, unknown>;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }
      lastData = responseData;

      console.log(`testar-cilia: Resposta tentativa ${attempt + 1}`, {
        status: response.status,
        body: responseText.slice(0, 500),
      });

      // Se token expirado, não faz retry
      if (isTokenError(response.status, responseData)) {
        console.error("testar-cilia: Token expirado ou inválido");
        return {
          success: false,
          status: response.status,
          data: responseData,
          tokenExpired: true,
        };
      }

      // 404 não faz retry
      if (response.status === 404) {
        return {
          success: false,
          status: 404,
          data: responseData,
          is404: true,
        };
      }

      // Sucesso ou erro de validação (que prova que a conexão funciona)
      if (response.ok || response.status === 400 || response.status === 422) {
        return {
          success: true,
          status: response.status,
          data: responseData,
        };
      }

      // Se erro é retryable, tenta novamente
      if (isRetryableError(response.status)) {
        if (attempt < maxRetries - 1) {
          const delay = getDelayWithBackoff(attempt);
          console.log(`testar-cilia: Erro retryable, aguardando ${Math.round(delay)}ms`);
          await sleep(delay);
          continue;
        }
      }

      // Erro não retryable
      return {
        success: false,
        status: response.status,
        data: responseData,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`testar-cilia: Erro na tentativa ${attempt + 1}:`, lastError.message);

      if (attempt < maxRetries - 1) {
        const delay = getDelayWithBackoff(attempt);
        console.log(`testar-cilia: Aguardando ${Math.round(delay)}ms antes de retry`);
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    status: lastStatus || 500,
    data: lastError ? { error: lastError.message } : lastData,
  };
}

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

    const cleanToken = auth_token.trim().replace(/^["']|["']$/g, '');
    const cleanUrl = base_url.replace(/\/$/, "");
    
    console.log("testar-cilia: Testando conexão com retry automático", { 
      url: cleanUrl,
      tokenLength: cleanToken.length,
      tokenPreview: `${cleanToken.slice(0, 10)}...${cleanToken.slice(-10)}`,
      maxRetries: MAX_RETRIES,
    });

    const testUrl = `${cleanUrl}/services/generico-ws/rest/v2/integracao/createBudget`;
    
    const result = await testConnectionWithRetry(testUrl, cleanToken);

    // Token expirado
    if (result.tokenExpired) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "⚠️ TOKEN EXPIRADO: O token de acesso é inválido ou expirou. " +
                   "Solicite um novo token à CILIA e atualize nas configurações.",
          tokenExpired: true,
          status: result.status,
          response: result.data
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Endpoint não encontrado
    if (result.is404) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Endpoint não encontrado (404). Verifique a URL base da API.",
          status: 404
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Falha após retries
    if (!result.success) {
      const errorMessage = typeof result.data?.message === 'string' 
        ? result.data.message 
        : `Erro ${result.status} após ${MAX_RETRIES} tentativas`;

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: errorMessage,
          status: result.status,
          retriesAttempted: MAX_RETRIES,
          response: result.data
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sucesso
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "✅ Conexão estabelecida com sucesso!",
        status: result.status,
        response: result.data
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
