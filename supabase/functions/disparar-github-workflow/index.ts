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
    const { corretora_id, action } = body; // action: 'start' | 'cancel'

    if (!corretora_id) {
      return new Response(
        JSON.stringify({ success: false, message: "corretora_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const githubPat = Deno.env.get("GITHUB_PAT");
    const repoOwner = Deno.env.get("GITHUB_REPO_OWNER");
    const repoName = Deno.env.get("GITHUB_REPO_NAME");

    if (!githubPat || !repoOwner || !repoName) {
      console.error("GitHub secrets não configurados");
      return new Response(
        JSON.stringify({ success: false, message: "Configuração do GitHub não encontrada. Configure os secrets GITHUB_PAT, GITHUB_REPO_OWNER e GITHUB_REPO_NAME." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Disparar GitHub] Ação: ${action} para corretora: ${corretora_id}`);

    // Buscar configuração da automação
    const { data: config, error: configError } = await supabase
      .from("cobranca_automacao_config")
      .select("*")
      .eq("corretora_id", corretora_id)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, message: "Configuração de automação não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar nome da corretora
    const { data: corretora } = await supabase
      .from("corretoras")
      .select("nome, slug")
      .eq("id", corretora_id)
      .single();

    // Processar filtros
    let filtroSituacoes = config.filtro_situacoes;
    if (typeof filtroSituacoes === 'string') {
      try {
        filtroSituacoes = JSON.parse(filtroSituacoes);
      } catch {
        filtroSituacoes = ['ABERTO', 'BAIXADO'];
      }
    }

    // Preparar objeto de filtros
    const filtrosAplicados = {
      periodo_tipo: config.filtro_periodo_tipo || 'mes_atual',
      data_inicio: config.filtro_data_inicio,
      data_fim: config.filtro_data_fim,
      situacoes: filtroSituacoes || ['ABERTO', 'BAIXADO'],
      boletos_anteriores: config.filtro_boletos_anteriores || 'nao_possui',
      referencia: config.filtro_referencia || 'vencimento_original',
      layout: config.layout_relatorio || 'BI - VANGARD COBRANÇA',
    };

    if (action === 'start') {
      // Atualizar status para "executando"
      await supabase
        .from("cobranca_automacao_config")
        .update({
          ultima_execucao: new Date().toISOString(),
          ultimo_status: 'executando',
          ultimo_erro: null,
        })
        .eq("id", config.id);

      // Criar registro de execução
      const { data: execucao, error: execError } = await supabase
        .from("cobranca_automacao_execucoes")
        .insert({
          config_id: config.id,
          corretora_id: corretora_id,
          status: 'executando',
          mensagem: `Disparo via GitHub Actions por ${user.email}`,
          iniciado_por: user.id,
          tipo_disparo: 'github_actions',
          filtros_aplicados: filtrosAplicados,
        })
        .select()
        .single();

      if (execError) {
        console.error("Erro ao criar registro de execução:", execError);
      }

      // Disparar workflow do GitHub Actions
      const workflowDispatchUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/cobranca-hinova.yml/dispatches`;
      
      const githubResponse = await fetch(workflowDispatchUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${githubPat}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            corretora_id: corretora_id,
            execucao_id: execucao?.id || '',
          },
        }),
      });

      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        console.error("Erro ao disparar GitHub Actions:", errorText);
        
        // Atualizar status para erro
        if (execucao) {
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({
              status: 'erro',
              erro: `Falha ao disparar GitHub Actions: ${githubResponse.status}`,
              finalizado_at: new Date().toISOString(),
            })
            .eq("id", execucao.id);
        }

        await supabase
          .from("cobranca_automacao_config")
          .update({
            ultimo_status: 'erro',
            ultimo_erro: `Falha ao disparar GitHub Actions: ${githubResponse.status}`,
          })
          .eq("id", config.id);

        return new Response(
          JSON.stringify({ success: false, message: `Erro ao disparar workflow: ${githubResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Registrar log de auditoria
      await supabase.from("bi_audit_logs").insert({
        modulo: "cobranca",
        acao: "github_workflow_disparado",
        descricao: `Workflow GitHub Actions disparado por ${user.email} para ${corretora?.nome || corretora_id}`,
        corretora_id: corretora_id,
        user_id: user.id,
        user_nome: user.email || "Usuário",
        dados_novos: {
          config_id: config.id,
          execucao_id: execucao?.id,
          filtros: filtrosAplicados,
        },
      });

      console.log(`[Disparar GitHub] Workflow disparado com sucesso para: ${corretora?.nome}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Workflow GitHub Actions disparado com sucesso!",
          execucao_id: execucao?.id,
          filtros_aplicados: filtrosAplicados,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === 'cancel') {
      // Buscar execução em andamento
      const { data: execucaoAtual } = await supabase
        .from("cobranca_automacao_execucoes")
        .select("id, github_run_id")
        .eq("config_id", config.id)
        .eq("status", "executando")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (execucaoAtual?.github_run_id) {
        // Tentar cancelar o workflow run
        const cancelUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/runs/${execucaoAtual.github_run_id}/cancel`;
        
        const cancelResponse = await fetch(cancelUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${githubPat}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });

        if (!cancelResponse.ok) {
          console.warn("Não foi possível cancelar workflow no GitHub:", await cancelResponse.text());
        }
      }

      // Atualizar status local
      await supabase
        .from("cobranca_automacao_config")
        .update({
          ultimo_status: 'parado',
          ultimo_erro: 'Execução cancelada pelo usuário',
        })
        .eq("id", config.id);

      if (execucaoAtual) {
        await supabase
          .from("cobranca_automacao_execucoes")
          .update({
            status: 'parado',
            erro: 'Execução cancelada pelo usuário',
            finalizado_at: new Date().toISOString(),
          })
          .eq("id", execucaoAtual.id);
      }

      // Registrar log de auditoria
      await supabase.from("bi_audit_logs").insert({
        modulo: "cobranca",
        acao: "github_workflow_cancelado",
        descricao: `Workflow cancelado por ${user.email}`,
        corretora_id: corretora_id,
        user_id: user.id,
        user_nome: user.email || "Usuário",
        dados_novos: {
          config_id: config.id,
          execucao_id: execucaoAtual?.id,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Execução cancelada com sucesso!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: "Ação inválida. Use 'start' ou 'cancel'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Disparar GitHub] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
