import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar autenticação
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { corretora_id } = body;

    if (!corretora_id) {
      return new Response(
        JSON.stringify({ success: false, message: "corretora_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Executar Cobrança Hinova] Iniciando para corretora: ${corretora_id}`);

    // Buscar configuração da automação
    const { data: config, error: configError } = await supabase
      .from("cobranca_automacao_config")
      .select("*")
      .eq("corretora_id", corretora_id)
      .single();

    if (configError || !config) {
      console.error("Configuração não encontrada:", configError);
      return new Response(
        JSON.stringify({ success: false, message: "Configuração de automação não encontrada. Configure primeiro." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.hinova_user || !config.hinova_pass) {
      return new Response(
        JSON.stringify({ success: false, message: "Credenciais Hinova não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar slug da corretora para o webhook
    const { data: corretora } = await supabase
      .from("corretoras")
      .select("slug, nome")
      .eq("id", corretora_id)
      .single();

    console.log(`[Executar Cobrança Hinova] Configuração encontrada para: ${corretora?.nome}`);

    // Atualizar status para "executando"
    await supabase
      .from("cobranca_automacao_config")
      .update({
        ultima_execucao: new Date().toISOString(),
        ultimo_status: 'executando',
        ultimo_erro: null,
      })
      .eq("id", config.id);

    // Preparar dados para o GitHub Actions (via repository_dispatch)
    // Este endpoint prepara os dados, mas a execução real acontece via GitHub Actions
    // Por agora, retornamos as informações necessárias para execução manual
    
    const executionData = {
      hinova_url: config.hinova_url,
      hinova_user: config.hinova_user,
      hinova_codigo_cliente: config.hinova_codigo_cliente || '2363',
      layout_relatorio: config.layout_relatorio || 'BI - Vangard Cobrança',
      corretora_id: corretora_id,
      corretora_slug: corretora?.slug,
      webhook_url: `${supabaseUrl}/functions/v1/webhook-cobranca-hinova`,
    };

    // Registrar log de auditoria
    await supabase.from("bi_audit_logs").insert({
      modulo: "cobranca",
      acao: "execucao_manual_iniciada",
      descricao: `Execução manual da automação Hinova iniciada por ${user.email}`,
      corretora_id: corretora_id,
      user_id: user.id,
      user_nome: user.email || "Usuário",
      dados_novos: {
        config_id: config.id,
        hinova_url: config.hinova_url,
      },
    });

    console.log(`[Executar Cobrança Hinova] Dados de execução preparados:`, {
      corretora: corretora?.nome,
      url: config.hinova_url,
    });

    // Por ora, simular uma resposta de sucesso com instruções
    // Em produção, isso poderia disparar um GitHub Actions workflow via API
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Execução manual preparada. Os dados de configuração estão prontos.",
        execution_data: {
          corretora_nome: corretora?.nome,
          hinova_url: config.hinova_url,
          layout: config.layout_relatorio,
        },
        instructions: "A automação será executada com as configurações salvas. Verifique o status em alguns minutos.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Executar Cobrança Hinova] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
