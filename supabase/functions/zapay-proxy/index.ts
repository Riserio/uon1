import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ZAPAY_BASE_URL = "https://api.sandbox.usezapay.com.br";

async function getZapayToken(): Promise<string> {
  const username = Deno.env.get("ZAPAY_USERNAME");
  const password = Deno.env.get("ZAPAY_PASSWORD");

  if (!username || !password) {
    throw new Error("Credenciais Zapay não configuradas");
  }

  const res = await fetch(`${ZAPAY_BASE_URL}/authentication/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao autenticar na Zapay [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return data.token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate user auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, ...params } = body;

    const token = await getZapayToken();
    const headers = {
      Authorization: `JWT ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json; version=v2.0",
    };

    let result: any;

    switch (action) {
      case "vehicle": {
        // Enriquecimento de placa - GET /zapi/vehicle/{license_plate}/
        const { license_plate } = params;
        if (!license_plate) throw new Error("Placa não informada");

        const res = await fetch(
          `${ZAPAY_BASE_URL}/zapi/vehicle/${encodeURIComponent(license_plate)}/`,
          { method: "GET", headers }
        );
        result = await res.json();
        if (!res.ok) throw new Error(`Erro Zapay vehicle [${res.status}]: ${JSON.stringify(result)}`);
        break;
      }

      case "debts": {
        // Consulta de débitos - POST /zapi/debts/
        const res = await fetch(`${ZAPAY_BASE_URL}/zapi/debts/`, {
          method: "POST",
          headers,
          body: JSON.stringify(params),
        });
        result = await res.json();
        if (!res.ok) throw new Error(`Erro Zapay debts [${res.status}]: ${JSON.stringify(result)}`);
        break;
      }

      case "installments": {
        // Simulação de parcelamento - POST /zapi/installments/
        const res = await fetch(`${ZAPAY_BASE_URL}/zapi/installments/`, {
          method: "POST",
          headers,
          body: JSON.stringify(params),
        });
        result = await res.json();
        if (!res.ok) throw new Error(`Erro Zapay installments [${res.status}]: ${JSON.stringify(result)}`);
        break;
      }

      case "checkout": {
        // Pagamento - POST /zapi/checkout/
        const res = await fetch(`${ZAPAY_BASE_URL}/zapi/checkout/`, {
          method: "POST",
          headers,
          body: JSON.stringify(params),
        });
        result = await res.json();
        if (!res.ok) throw new Error(`Erro Zapay checkout [${res.status}]: ${JSON.stringify(result)}`);
        break;
      }

      case "check-order": {
        // Status do pedido - POST /zapi/order/
        const res = await fetch(`${ZAPAY_BASE_URL}/zapi/order/`, {
          method: "POST",
          headers,
          body: JSON.stringify(params),
        });
        result = await res.json();
        if (!res.ok) throw new Error(`Erro Zapay order [${res.status}]: ${JSON.stringify(result)}`);
        break;
      }

      default:
        throw new Error(`Ação inválida: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Zapay proxy error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
