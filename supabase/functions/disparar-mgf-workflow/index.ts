import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkflowInput {
  corretora_id: string;
  execucao_id: string;
  webhook_url: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const githubPat = Deno.env.get("GITHUB_PAT");
    const githubRepoOwner = Deno.env.get("GITHUB_REPO_OWNER");
    const githubRepoName = Deno.env.get("GITHUB_REPO_NAME");

    // Verificar autenticação
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Decodificar JWT para obter dados do usuário
    let user: { id: string; email: string };
    try {
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(atob(payloadBase64));
      if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) {
        throw new Error("Token expirado ou inválido");
      }
      user = { id: payload.sub, email: payload.email || "Usuário" };
    } catch (e) {
      console.error("Erro ao decodificar token:", e);
      return new Response(
        JSON.stringify({ success: false, message: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente com service role para operações de banco
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar secrets do GitHub
    if (!githubPat || !githubRepoOwner || !githubRepoName) {
      console.error("GitHub secrets não configurados:", { 
        pat: !!githubPat, 
        owner: !!githubRepoOwner, 
        repo: !!githubRepoName 
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Configuração do GitHub incompleta. Configure GITHUB_PAT, GITHUB_REPO_OWNER e GITHUB_REPO_NAME nos secrets." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, corretora_id, run_id } = body;

    if (action === 'cancel' && run_id) {
      console.log(`[MGF GitHub Workflow] Cancelando run ${run_id}`);
      
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
        
        // 409 = workflow already completed, treat as success
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

    if (action === 'dispatch' || !action) {
      if (!corretora_id) {
        return new Response(
          JSON.stringify({ success: false, message: "corretora_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[MGF GitHub Workflow] Iniciando para corretora: ${corretora_id}`);

      // Verificar se já houve execução com sucesso ou em andamento hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { data: execucoesHoje } = await supabase
        .from("mgf_automacao_execucoes")
        .select("id, status")
        .eq("corretora_id", corretora_id)
        .gte("created_at", `${hoje}T00:00:00`)
        .in("status", ["sucesso", "executando"])
        .limit(1);

      if (execucoesHoje && execucoesHoje.length > 0) {
        const st = execucoesHoje[0].status;
        console.log(`[MGF GitHub Workflow] Corretora ${corretora_id} já tem execução '${st}' hoje, bloqueando disparo`);
        return new Response(
          JSON.stringify({ success: false, message: st === "executando" ? "Já existe uma execução em andamento hoje" : "Já houve uma integração com sucesso hoje. Apenas uma por dia é permitida." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar credenciais unificadas da Hinova
      const { data: creds, error: credsError } = await supabase
        .from("hinova_credenciais")
        .select("*")
        .eq("corretora_id", corretora_id)
        .single();

      if (credsError || !creds) {
        console.error("Credenciais Hinova não encontradas:", credsError);
        return new Response(
          JSON.stringify({ success: false, message: "Credenciais Hinova não encontradas para esta corretora" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!creds.hinova_user || !creds.hinova_pass) {
        return new Response(
          JSON.stringify({ success: false, message: "Credenciais Hinova não configuradas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar ou criar registro em mgf_automacao_config (necessário para FK de execuções)
      let { data: legacyConfig } = await supabase
        .from("mgf_automacao_config")
        .select("id, filtro_centros_custo")
        .eq("corretora_id", corretora_id)
        .maybeSingle();

      if (!legacyConfig) {
        const { data: newConfig } = await supabase
          .from("mgf_automacao_config")
          .insert({
            corretora_id,
            hinova_url: creds.hinova_url,
            hinova_user: creds.hinova_user,
            hinova_pass: creds.hinova_pass,
            hinova_codigo_cliente: creds.hinova_codigo_cliente || '',
            layout_relatorio: creds.layout_mgf || '',
            ativo: true,
          })
          .select("id, filtro_centros_custo")
          .single();
        legacyConfig = newConfig;
      }

      const configId = legacyConfig?.id;
      const { data: execucao, error: execError } = await supabase
        .from("mgf_automacao_execucoes")
        .insert({
          config_id: configId,
          corretora_id: corretora_id,
          status: 'executando',
          etapa_atual: 'disparo',
          mensagem: `Execução iniciada por ${user.email}`,
          iniciado_por: user.id,
          tipo_disparo: 'manual',
          filtros_aplicados: {
            centros_custo: legacyConfig?.filtro_centros_custo || null,
            layout: creds.layout_mgf || '',
          },
        })
        .select()
        .single();

      if (execError) {
        console.error("Erro ao criar registro de execução:", execError);
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao registrar execução" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Atualizar status para executando
      if (legacyConfig?.id) {
        await supabase
          .from("mgf_automacao_config")
          .update({
            ultima_execucao: new Date().toISOString(),
            ultimo_status: 'executando',
            ultimo_erro: null,
          })
          .eq("id", legacyConfig.id);
      }

      // Preparar inputs para o workflow
      // Preparar inputs (SEM credenciais - robô busca via edge function)
      const workflowInputs: WorkflowInput = {
        corretora_id: corretora_id,
        execucao_id: execucao.id,
        webhook_url: `${supabaseUrl}/functions/v1/webhook-mgf-hinova`,
      };

      console.log(`[MGF GitHub Workflow] Disparando workflow para ${corretora_id}`);

      // Disparar workflow via GitHub API
      const dispatchUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/mgf-hinova.yml/dispatches`;
      
      const dispatchResponse = await fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: workflowInputs,
        }),
      });

      if (!dispatchResponse.ok && dispatchResponse.status !== 204) {
        const errorText = await dispatchResponse.text();
        console.error("Erro ao disparar workflow:", dispatchResponse.status, errorText);
        
        await supabase
          .from("mgf_automacao_execucoes")
          .update({
            status: 'erro',
            erro: `Erro ao disparar GitHub Actions: ${dispatchResponse.status}`,
            finalizado_at: new Date().toISOString(),
          })
          .eq("id", execucao.id);

        if (legacyConfig?.id) {
          await supabase
            .from("mgf_automacao_config")
            .update({
              ultimo_status: 'erro',
              ultimo_erro: `Erro ao disparar GitHub Actions: ${dispatchResponse.status}`,
            })
            .eq("id", legacyConfig.id);
        }

        return new Response(
          JSON.stringify({ success: false, message: "Erro ao disparar workflow no GitHub" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Aguardar e buscar o run_id
      await new Promise(resolve => setTimeout(resolve, 3000));

      const runsUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/mgf-hinova.yml/runs?per_page=1`;
      const runsResponse = await fetch(runsUrl, {
        headers: {
          'Authorization': `Bearer ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
        },
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
            .from("mgf_automacao_execucoes")
            .update({
              github_run_id: githubRunId,
              github_run_url: githubRunUrl,
            })
            .eq("id", execucao.id);
        }
      }

      // Registrar log de auditoria
      await supabase.from("bi_audit_logs").insert({
        modulo: "mgf_insights",
        acao: "github_workflow_disparado",
        descricao: `Workflow MGF GitHub disparado por ${user.email}`,
        corretora_id: corretora_id,
        user_id: user.id,
        user_nome: user.email || "Usuário",
        dados_novos: {
          execucao_id: execucao.id,
          github_run_id: githubRunId,
          github_run_url: githubRunUrl,
          filtros: workflowInputs,
        },
      });

      console.log(`[MGF GitHub Workflow] Workflow disparado com sucesso. Run ID: ${githubRunId}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Workflow MGF GitHub disparado com sucesso",
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
    console.error("[MGF GitHub Workflow] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
