import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

/**
 * Edge Function: webhook-detran-mg
 *
 * Recebe o resultado do robô (GitHub Actions) que fez login no Gov.br e
 * consultou o Detran-MG. Atualiza detran_mg_execucoes, registra o resultado
 * em consultas_veiculo (auditoria, fonte='detran_mg') e marca o status da
 * última consulta em detran_mg_credenciais.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const requestSecret = req.headers.get('x-webhook-secret');
    if (!webhookSecret || !requestSecret || requestSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      execucao_id,
      corretora_id,
      action, // 'success' | 'error'
      resultado, // { multas, licenciamento, ipva, fonte, situacao, ... }
      error_message,
      github_run_id,
      github_run_url,
    } = body;

    if (!execucao_id) {
      return new Response(
        JSON.stringify({ error: "execucao_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: execucao } = await supabase
      .from("detran_mg_execucoes")
      .select("*")
      .eq("id", execucao_id)
      .maybeSingle();

    if (!execucao) {
      return new Response(
        JSON.stringify({ error: "Execução não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sucesso = action === 'success';
    const statusFinal = sucesso ? 'sucesso' : 'erro';

    await supabase.from("detran_mg_execucoes").update({
      status: statusFinal,
      erro: sucesso ? null : (error_message || 'Erro desconhecido'),
      resultado_json: resultado || null,
      github_run_id: github_run_id || execucao.github_run_id,
      github_run_url: github_run_url || execucao.github_run_url,
      finalizado_at: new Date().toISOString(),
    }).eq("id", execucao_id);

    // Registrar na auditoria unificada de consultas de veículo
    await supabase.from("consultas_veiculo").insert({
      placa: execucao.placa,
      renavam: execucao.renavam,
      uf: "MG",
      usuario_id: execucao.usuario_id,
      corretora_id: execucao.corretora_id || corretora_id,
      fonte: "detran_mg",
      sucesso,
      erro: sucesso ? null : (error_message || 'Erro desconhecido'),
      resultado_json: resultado || null,
    });

    // Atualizar status da última consulta nas credenciais (visível na tela de config)
    await supabase.from("detran_mg_credenciais").update({
      ultima_consulta_status: sucesso ? 'sucesso' : `erro: ${(error_message || 'desconhecido').slice(0, 200)}`,
      ultima_consulta_em: new Date().toISOString(),
    }).eq("corretora_id", execucao.corretora_id || corretora_id);

    console.log(`[webhook-detran-mg] Execução ${execucao_id} finalizada: ${statusFinal}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[webhook-detran-mg] Erro:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
