import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-robot-secret',
};

/**
 * Edge Function: get-detran-mg-credentials
 *
 * Chamada pelo robô do GitHub Actions para buscar CPF + senha Gov.br de forma
 * segura. A senha nunca fica em coluna de texto puro: ela é guardada no
 * Supabase Vault e só é decifrada aqui, dentro de uma função rodando com
 * service role, nunca exposta ao frontend nem aos logs do GitHub Actions.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const robotSecret = Deno.env.get("ROBOT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!robotSecret) {
      console.error("ROBOT_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestSecret = req.headers.get('x-robot-secret');
    if (!requestSecret || requestSecret !== robotSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { corretora_id } = body;

    if (!corretora_id) {
      return new Response(
        JSON.stringify({ error: "corretora_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: cred, error: credError } = await supabase
      .from("detran_mg_credenciais")
      .select("gov_br_cpf, gov_br_senha_secret_id, ativo")
      .eq("corretora_id", corretora_id)
      .maybeSingle();

    if (credError || !cred) {
      return new Response(
        JSON.stringify({ error: "Credenciais Gov.br não encontradas para esta associação" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cred.ativo) {
      return new Response(
        JSON.stringify({ error: "Consulta automática Gov.br desativada para esta associação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cred.gov_br_cpf || !cred.gov_br_senha_secret_id) {
      return new Response(
        JSON.stringify({ error: "Login Gov.br incompleto (falta CPF ou senha)" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decifra a senha guardada no Vault (só acessível com service role)
    const { data: secretRow, error: secretError } = await supabase
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("id", cred.gov_br_senha_secret_id)
      .maybeSingle();

    if (secretError || !secretRow?.decrypted_secret) {
      console.error("[get-detran-mg-credentials] Erro ao decifrar senha:", secretError);
      return new Response(
        JSON.stringify({ error: "Não foi possível recuperar a senha Gov.br" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[get-detran-mg-credentials] Credenciais servidas para ${corretora_id}`);

    return new Response(
      JSON.stringify({
        gov_br_cpf: cred.gov_br_cpf,
        gov_br_senha: secretRow.decrypted_secret,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[get-detran-mg-credentials] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
