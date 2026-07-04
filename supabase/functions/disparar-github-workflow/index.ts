import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkflowInput {
  corretora_nome?: string;
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
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decodificar JWT para obter dados do usuário
    const token = authHeader.replace('Bearer ', '');
    let user: { id: string; email: string };
    if (token === supabaseServiceKey) {
      // Chamada interna via service role (ex: backfill-worker/scheduler)
      user = { id: '00000000-0000-0000-0000-000000000000', email: 'system@backfill' };
    } else {
      // Validação REAL do JWT (assinatura verificada pelo Auth server) — nunca decodificar manualmente
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(
          JSON.stringify({ success: false, message: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user = { id: claimsData.claims.sub as string, email: (claimsData.claims.email as string) || "Usuário" };
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
    const { action, corretora_id, run_id, data_inicio, data_fim, bypass_daily_limit, backfill_job_id } = body;
    const isServiceRole = authHeader.includes(supabaseServiceKey);

    if (action === 'cancel' && run_id) {
      // Cancelar workflow em execução
      console.log(`[GitHub Workflow] Cancelando run ${run_id}`);
      
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

    if (action === 'dispatch' || !action) {
      // Disparar novo workflow
      if (!corretora_id) {
        return new Response(
          JSON.stringify({ success: false, message: "corretora_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[GitHub Workflow] Iniciando para corretora: ${corretora_id}`);

      // === API-FIRST: se a associação tem API habilitada, importa cobrança via API; crawl é fallback ===
      const { data: apiCredC } = await supabase
        .from("hinova_credenciais")
        .select("usar_api, api_token")
        .eq("corretora_id", corretora_id)
        .maybeSingle();
      if (apiCredC?.usar_api && apiCredC?.api_token) {
        try {
          const apiResp = await fetch(`${supabaseUrl}/functions/v1/importar-api-hinova`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ corretora_id, modulo: "cobranca" }),
          });
          const apiJson = await apiResp.json().catch(() => ({}));
          if (apiJson?.success) {
            console.log(`[GitHub Workflow] Importado via API (${apiJson.total} boletos) — crawl dispensado`);
            return new Response(
              JSON.stringify({ success: true, via: "api", total: apiJson.total, message: `Importado via API: ${apiJson.total} boletos` }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          console.warn(`[GitHub Workflow] API falhou (${apiJson?.message}) — fallback para crawl`);
        } catch (apiErr) {
          console.warn(`[GitHub Workflow] Erro ao chamar API — fallback para crawl:`, apiErr);
        }
      }

      // Verificar se já houve execução com sucesso ou em andamento hoje
      const skipDailyGate = bypass_daily_limit === true && isServiceRole;
      // "Hoje" no fuso de São Paulo (created_at é UTC) — evita gate diário errado na virada do dia
      const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data: execucoesHoje } = skipDailyGate ? { data: [] as any[] } : await supabase
        .from("cobranca_automacao_execucoes")
        .select("id, status")
        .eq("corretora_id", corretora_id)
        .gte("created_at", `${hoje}T03:00:00.000Z`)
        .in("status", ["sucesso", "executando"])
        .limit(1);

      if (!skipDailyGate && execucoesHoje && execucoesHoje.length > 0) {
        const st = execucoesHoje[0].status;
        console.log(`[GitHub Workflow] Corretora ${corretora_id} já tem execução '${st}' hoje, bloqueando disparo`);
        return new Response(
          JSON.stringify({ success: false, message: st === "executando" ? "Já existe uma execução em andamento hoje" : "Já houve uma integração com sucesso hoje. Apenas uma por dia é permitida." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar configuração da automação
      const { data: config, error: configError } = await supabase
        .from("cobranca_automacao_config")
        .select("*")
        .eq("corretora_id", corretora_id)
        .single();

      if (configError || !config) {
        console.error("Configuração não encontrada:", configError);
        return new Response(
          JSON.stringify({ success: false, message: "Configuração de automação não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar credenciais (prioriza hinova_credenciais, fallback para config)
      const { data: credCheck } = await supabase
        .from("hinova_credenciais")
        .select("hinova_user, hinova_pass")
        .eq("corretora_id", corretora_id)
        .maybeSingle();
      
      if (!credCheck?.hinova_user && !config.hinova_user) {
        return new Response(
          JSON.stringify({ success: false, message: "Credenciais Hinova não configuradas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Criar registro de execução
      const { data: execucao, error: execError } = await supabase
        .from("cobranca_automacao_execucoes")
        .insert({
          config_id: config.id,
          corretora_id: corretora_id,
          status: 'executando',
          etapa_atual: 'disparo',
          mensagem: `Execução iniciada por ${user.email}`,
          iniciado_por: user.id,
          tipo_disparo: 'manual',
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
      await supabase
        .from("cobranca_automacao_config")
        .update({
          ultima_execucao: new Date().toISOString(),
          ultimo_status: 'executando',
          ultimo_erro: null,
        })
        .eq("id", config.id);

      // Preparar inputs para o workflow (SEM credenciais - robô busca via edge function)
      const { data: corRun } = await supabase.from("corretoras").select("nome").eq("id", corretora_id).maybeSingle();
      const corretoraNomeRun = (corRun as { nome?: string } | null)?.nome || corretora_id;
      const workflowInputs: WorkflowInput = {
        corretora_nome: corretoraNomeRun,
        corretora_id: corretora_id,
        execucao_id: execucao.id,
        webhook_url: `${supabaseUrl}/functions/v1/webhook-cobranca-hinova`,
      };
      // Datas em DD/MM/YYYY (formato dos robôs); backfill envia ISO YYYY-MM-DD
      const toBR = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
      if (data_inicio) (workflowInputs as any).data_inicio = toBR(data_inicio);
      if (data_fim) (workflowInputs as any).data_fim = toBR(data_fim);
      // backfill_job_id não é input do workflow GitHub; vínculo via execucao_id.

      console.log(`[GitHub Workflow] Disparando workflow para ${corretora_id}`);

      // Disparar workflow via GitHub API
      const dispatchUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/cobranca-hinova.yml/dispatches`;
      
      const dispatchResponse = await fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          ref: 'main',
          inputs: workflowInputs,
        }),
      });

      if (!dispatchResponse.ok && dispatchResponse.status !== 204) {
        const errorText = await dispatchResponse.text();
        console.error("Erro ao disparar workflow:", dispatchResponse.status, errorText);
        
        // Atualizar status de erro
        await supabase
          .from("cobranca_automacao_execucoes")
          .update({
            status: 'erro',
            erro: `Erro ao disparar GitHub Actions: ${dispatchResponse.status}`,
            finalizado_at: new Date().toISOString(),
          })
          .eq("id", execucao.id);

        await supabase
          .from("cobranca_automacao_config")
          .update({
            ultimo_status: 'erro',
            ultimo_erro: `Erro ao disparar GitHub Actions: ${dispatchResponse.status}`,
          })
          .eq("id", config.id);

        return new Response(
          JSON.stringify({ success: false, message: "Erro ao disparar workflow no GitHub" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Associar o run correto de forma determinística: o run-name contém o execucao_id
      let githubRunId: string | null = null;
      let githubRunUrl: string | null = null;
      for (let attempt = 0; attempt < 4 && !githubRunId; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          const runsUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/cobranca-hinova.yml/runs?event=workflow_dispatch&per_page=10`;
          const runsResponse = await fetch(runsUrl, {
            headers: { 'Authorization': `Bearer ${githubPat}`, 'Accept': 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(20000),
          });
          if (!runsResponse.ok) continue;
          const runsData = await runsResponse.json();
          const match = (runsData.workflow_runs || []).find((r: { display_title?: string }) =>
            r.display_title?.includes(execucao.id),
          );
          if (match) {
            githubRunId = String((match as { id: number }).id);
            githubRunUrl = (match as { html_url: string }).html_url;
          }
        } catch (e) {
          console.warn(`[Cobranca Workflow] Tentativa ${attempt + 1} de localizar run falhou:`, e);
        }
      }

      if (githubRunId) {
        await supabase
          .from("cobranca_automacao_execucoes")
          .update({ github_run_id: githubRunId, github_run_url: githubRunUrl })
          .eq("id", execucao.id);
      } else {
        console.warn(`[Cobranca Workflow] Não foi possível associar github_run_id à execução ${execucao.id}`);
      }

            // Registrar log de auditoria
      await supabase.from("bi_audit_logs").insert({
        modulo: "cobranca",
        acao: "github_workflow_disparado",
        descricao: `Workflow GitHub disparado por ${user.email}`,
        corretora_id: corretora_id,
        user_id: user.id,
        user_nome: user.email || "Usuário",
        dados_novos: {
          execucao_id: execucao.id,
          github_run_id: githubRunId,
          github_run_url: githubRunUrl,
        },
      });

      console.log(`[GitHub Workflow] Workflow disparado com sucesso. Run ID: ${githubRunId}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Workflow GitHub disparado com sucesso",
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
    console.error("[GitHub Workflow] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
