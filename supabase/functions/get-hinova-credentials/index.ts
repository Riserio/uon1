import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-robot-secret',
};

/**
 * Edge Function: get-hinova-credentials
 * 
 * Called by GitHub Actions robots to fetch Hinova credentials securely.
 * Authenticates via a shared ROBOT_SECRET header instead of user JWT.
 * 
 * This replaces the old approach of passing credentials via workflow_dispatch inputs,
 * which exposed them publicly on GitHub Actions for public repositories.
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

    // Validate robot secret
    const requestSecret = req.headers.get('x-robot-secret');
    if (!requestSecret || requestSecret !== robotSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { corretora_id, module } = body;

    if (!corretora_id) {
      return new Response(
        JSON.stringify({ error: "corretora_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!module || !['cobranca', 'eventos', 'mgf'].includes(module)) {
      return new Response(
        JSON.stringify({ error: "module must be one of: cobranca, eventos, mgf" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch from hinova_credenciais (unified source)
    const { data: cred, error: credError } = await supabase
      .from("hinova_credenciais")
      .select("*")
      .eq("corretora_id", corretora_id)
      .maybeSingle();

    // For cobranca, also check cobranca_automacao_config as fallback
    let fallbackConfig: any = null;
    if (module === 'cobranca') {
      const { data } = await supabase
        .from("cobranca_automacao_config")
        .select("hinova_url, hinova_user, hinova_pass, hinova_codigo_cliente, layout_relatorio")
        .eq("corretora_id", corretora_id)
        .maybeSingle();
      fallbackConfig = data;
    }

    const hinovaUrl = cred?.hinova_url || fallbackConfig?.hinova_url;
    const hinovaUser = cred?.hinova_user || fallbackConfig?.hinova_user;
    const hinovaPass = cred?.hinova_pass || fallbackConfig?.hinova_pass;
    const hinovaCodigo = cred?.hinova_codigo_cliente || fallbackConfig?.hinova_codigo_cliente || '';

    if (!hinovaUser || !hinovaPass) {
      return new Response(
        JSON.stringify({ error: "Hinova credentials not configured for this association" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build module-specific response
    let response: any = {
      hinova_url: hinovaUrl,
      hinova_user: hinovaUser,
      hinova_pass: hinovaPass,
      hinova_codigo_cliente: hinovaCodigo,
    };

    if (module === 'cobranca') {
      response.hinova_layout = cred?.layout_cobranca || fallbackConfig?.layout_relatorio || '';
    } else if (module === 'eventos') {
      response.hinova_layout = cred?.layout_eventos || '';
      response.hinova_relatorio_url = cred?.url_eventos || '';
    } else if (module === 'mgf') {
      response.hinova_layout = cred?.layout_mgf || '';
      response.hinova_relatorio_url = cred?.url_mgf || '';
    }

    console.log(`[get-hinova-credentials] Credentials served for ${module}/${corretora_id}`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[get-hinova-credentials] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
