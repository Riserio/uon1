import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkflowInput {
  corretora_id: string;
  hinova_url: string;
  hinova_relatorio_url: string;
  hinova_user: string;
  hinova_pass: string;
  hinova_codigo_cliente: string;
  hinova_layout: string;
  data_inicio: string;
  data_fim: string;
  execucao_id: string;
  webhook_url: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const githubPat = Deno.env.get("GITHUB_PAT");
    const githubRepoOwner = Deno.env.get("GITHUB_REPO_OWNER");
    const githubRepoName = Deno.env.get("GITHUB_REPO_NAME");

    // Verificar autenticação
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data, error: claimsError } = await authClient.auth.getClaims(token);
    
    if (claimsError || !data?.claims) {
      return new Response(
        JSON.stringify({ success: false, message: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = { id: data.claims.sub as string, email: data.claims.email as string };
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!githubPat || !githubRepoOwner || !githubRepoName) {
      return new Response(
        JSON.stringify({ success: false, message: "Configuração do GitHub incompleta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, corretora_id, run_id } = body;

    // ====================================
    // CANCELAR EXECUÇÃO
    // ====================================
    if (action === 'cancel' && run_id) {
      console.log(`[SGA Workflow] Cancelando run ${run_id}`);
      
      const cancelUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/runs/${run_id}/cancel`;
      const cancelResponse = await fetch(cancelUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!cancelResponse.ok && cancelResponse.status !== 202) {
        const errorText = await cancelResponse.text();
        console.error("Erro ao cancelar workflow:", errorText);
        if (cancelResponse.status === 409) {
          return new Response(
            JSON.stringify({ success: true, message: "Execução já foi finalizada" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao cancelar execução no GitHub" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Solicitação de cancelamento enviada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====================================
    // DISPARAR EXECUÇÃO
    // ====================================
    if (action === 'dispatch' || !action) {
      if (!corretora_id) {
        return new Response(
          JSON.stringify({ success: false, message: "corretora_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[SGA Workflow] Iniciando para corretora: ${corretora_id}`);

      // Verificar execução hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { data: execucoesHoje } = await supabase
        .from("sga_automacao_execucoes")
        .select("id, status")
        .eq("corretora_id", corretora_id)
        .gte("created_at", `${hoje}T00:00:00`)
        .in("status", ["sucesso", "executando"])
        .limit(1);

      if (execucoesHoje && execucoesHoje.length > 0) {
        const st = execucoesHoje[0].status;
        return new Response(
          JSON.stringify({ success: false, message: st === "executando" ? "Já existe uma execução em andamento hoje" : "Já houve uma integração com sucesso hoje." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ====================================================================
      // FONTE DE VERDADE: hinova_credenciais para credenciais e URLs
      // ====================================================================
      const { data: cred } = await supabase
        .from("hinova_credenciais")
        .select("*")
        .eq("corretora_id", corretora_id)
        .maybeSingle();

      // Buscar config de automação
      let { data: config } = await supabase
        .from("sga_automacao_config")
        .select("*")
        .eq("corretora_id", corretora_id)
        .single();

      // Usar credenciais de hinova_credenciais (prioridade) ou sga_automacao_config (fallback)
      const hinovaUrl = cred?.hinova_url || config?.hinova_url;
      const hinovaUser = cred?.hinova_user || config?.hinova_user;
      const hinovaPass = cred?.hinova_pass || config?.hinova_pass;
      const hinovaCodigo = cred?.hinova_codigo_cliente || config?.hinova_codigo_cliente || '';
      const urlEventos = cred?.url_eventos || '';
      const layoutEventos = cred?.layout_eventos || '';

      if (!hinovaUser || !hinovaPass) {
        return new Response(
          JSON.stringify({ success: false, message: "Credenciais Hinova não configuradas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Auto-criar config se não existir
      if (!config) {
        const { data: newConfig } = await supabase
          .from("sga_automacao_config")
          .insert({
            corretora_id,
            ativo: true,
            hinova_url: hinovaUrl,
            hinova_user: hinovaUser,
            hinova_pass: hinovaPass,
            hinova_codigo_cliente: hinovaCodigo,
            hora_agendada: cred?.hora_agendada || '09:00:00',
          })
          .select()
          .single();
        config = newConfig;
      }

      if (!config) {
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao criar configuração" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Criar registro de execução
      const { data: execucao, error: execError } = await supabase
        .from("sga_automacao_execucoes")
        .insert({
          config_id: config.id,
          corretora_id,
          status: 'executando',
          etapa_atual: 'disparo',
          mensagem: `Execução iniciada por ${user.email}`,
          iniciado_por: user.id,
          tipo_disparo: 'manual',
        })
        .select()
        .single();

      if (execError || !execucao) {
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao registrar execução" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("sga_automacao_config")
        .update({ ultima_execucao: new Date().toISOString(), ultimo_status: 'executando', ultimo_erro: null })
        .eq("id", config.id);

      // Calcular datas e derivar URL do relatório
      const dataInicio = '01/01/2023';
      const now = new Date();
      const dataFim = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      let relatorioUrl = urlEventos;
      if (!relatorioUrl && hinovaUrl) {
        try {
          const url = new URL(hinovaUrl);
          const pathParts = url.pathname.split('/');
          const basePathParts = pathParts.filter((p: string) =>
            p && !p.includes('login') && !p.includes('Principal') && p !== 'v5'
          );
          relatorioUrl = `${url.origin}/${basePathParts.join('/')}/relatorio/relatorioEvento.php`;
        } catch {
          relatorioUrl = '';
        }
      }

      const workflowInputs: WorkflowInput = {
        corretora_id,
        hinova_url: hinovaUrl,
        hinova_relatorio_url: relatorioUrl,
        hinova_user: hinovaUser,
        hinova_pass: hinovaPass,
        hinova_codigo_cliente: hinovaCodigo,
        hinova_layout: layoutEventos,
        data_inicio: dataInicio,
        data_fim: dataFim,
        execucao_id: execucao.id,
        webhook_url: `${supabaseUrl}/functions/v1/webhook-sga-hinova`,
      };

      console.log(`[SGA Workflow] Disparando workflow - Período: ${dataInicio} até ${dataFim}, Relatório: ${relatorioUrl}`);

      const dispatchUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/eventos-hinova.yml/dispatches`;
      const dispatchResponse = await fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: workflowInputs }),
      });

      if (!dispatchResponse.ok && dispatchResponse.status !== 204) {
        const errorText = await dispatchResponse.text();
        console.error("Erro ao disparar workflow:", dispatchResponse.status, errorText);

        await supabase
          .from("sga_automacao_execucoes")
          .update({ status: 'erro', erro: `Erro GitHub: ${dispatchResponse.status}`, finalizado_at: new Date().toISOString() })
          .eq("id", execucao.id);

        await supabase
          .from("sga_automacao_config")
          .update({ ultimo_status: 'erro', ultimo_erro: `Erro GitHub: ${dispatchResponse.status}` })
          .eq("id", config.id);

        return new Response(
          JSON.stringify({ success: false, message: "Erro ao disparar workflow no GitHub" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar run_id
      await new Promise(resolve => setTimeout(resolve, 3000));

      const runsUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/eventos-hinova.yml/runs?per_page=1`;
      const runsResponse = await fetch(runsUrl, {
        headers: { 'Authorization': `Bearer ${githubPat}`, 'Accept': 'application/vnd.github.v3+json' },
      });

      let githubRunId = null;
      let githubRunUrl = null;

      if (runsResponse.ok) {
        const runsData = await runsResponse.json();
        if (runsData.workflow_runs?.length > 0) {
          const latestRun = runsData.workflow_runs[0];
          githubRunId = String(latestRun.id);
          githubRunUrl = latestRun.html_url;

          await supabase
            .from("sga_automacao_execucoes")
            .update({ github_run_id: githubRunId, github_run_url: githubRunUrl })
            .eq("id", execucao.id);
        }
      }

      await supabase.from("bi_audit_logs").insert({
        modulo: "sga_insights",
        acao: "github_workflow_disparado",
        descricao: `Workflow SGA disparado por ${user.email}`,
        corretora_id,
        user_id: user.id,
        user_nome: user.email || "Usuário",
        dados_novos: { execucao_id: execucao.id, github_run_id: githubRunId },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Workflow SGA disparado com sucesso",
          execucao_id: execucao.id,
          github_run_id: githubRunId,
          github_run_url: githubRunUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: "Ação não reconhecida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[SGA Workflow] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
