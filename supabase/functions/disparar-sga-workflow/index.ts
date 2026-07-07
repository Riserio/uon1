import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RequestUser = { id: string; email: string };

// Executa a API oficial em background para não estourar o limite da Edge Function
// quando o fallback GitHub está desativado.
// deno-lint-ignore no-explicit-any
async function startEventosApiImport(supabase: any, corretoraId: string, user: RequestUser) {
  const { data: config } = await supabase
    .from("sga_automacao_config")
    .select("id")
    .eq("corretora_id", corretoraId)
    .maybeSingle();

  const { data: execucao } = await supabase
    .from("sga_automacao_execucoes")
    .insert({
      config_id: config?.id ?? null,
      corretora_id: corretoraId,
      status: "executando",
      etapa_atual: "api",
      mensagem: `Importação via API Hinova iniciada por ${user.email}`,
      iniciado_por: user.id,
      tipo_disparo: "api",
    })
    .select("id")
    .maybeSingle();

  await supabase.from("sga_automacao_config").update({
    ultimo_status: "executando",
    ultimo_erro: null,
    ultima_execucao: new Date().toISOString(),
    ultima_origem: "api",
  }).eq("corretora_id", corretoraId);

  const task = (async () => {
    try {
      const { data, error } = await supabase.rpc("importar_eventos_api", { p_corretora_id: corretoraId });
      if (error || data?.success === false) {
        const msg = error?.message || data?.message || "Importação via API falhou";
        await supabase.from("sga_automacao_execucoes").update({
          status: "erro",
          etapa_atual: "api",
          erro: msg,
          mensagem: "Importação via API falhou; fallback GitHub está desativado.",
          finalizado_at: new Date().toISOString(),
        }).eq("id", execucao?.id);
        await supabase.from("sga_automacao_config").update({
          ultimo_status: "erro",
          ultimo_erro: msg,
          ultima_execucao: new Date().toISOString(),
          ultima_origem: "api",
        }).eq("corretora_id", corretoraId);
        return;
      }

      const total = data?.total ?? data?.novos ?? null;
      await supabase.from("sga_automacao_execucoes").update({
        status: "sucesso",
        etapa_atual: "concluido",
        mensagem: `Importado via API Hinova${total !== null ? ` (${total} registros)` : ""}`,
        registros_processados: total,
        finalizado_at: new Date().toISOString(),
      }).eq("id", execucao?.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido na API";
      await supabase.from("sga_automacao_execucoes").update({
        status: "erro",
        etapa_atual: "api",
        erro: msg,
        mensagem: "Importação via API falhou; fallback GitHub está desativado.",
        finalizado_at: new Date().toISOString(),
      }).eq("id", execucao?.id);
      await supabase.from("sga_automacao_config").update({
        ultimo_status: "erro",
        ultimo_erro: msg,
        ultima_execucao: new Date().toISOString(),
        ultima_origem: "api",
      }).eq("corretora_id", corretoraId);
    }
  })();

  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task);
  else task.catch((err) => console.error("[SGA Workflow] Erro em background API:", err));
}

interface WorkflowInput {
  corretora_nome?: string;
  corretora_id: string;
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
    let user: { id: string; email: string };
    if (token === supabaseKey) {
      // Chamada interna via service role (ex: backfill-worker)
      user = { id: '00000000-0000-0000-0000-000000000000', email: 'system@backfill' };
    } else {
      const { data, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !data?.claims) {
        return new Response(
          JSON.stringify({ success: false, message: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user = { id: data.claims.sub as string, email: data.claims.email as string };
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, corretora_id, run_id, data_inicio: bodyDataInicio, data_fim: bodyDataFim, bypass_daily_limit, backfill_job_id } = body;
    const isServiceRole = authHeader.includes(supabaseKey);

    // ====================================
    // CANCELAR EXECUÇÃO
    // ====================================
    if (action === 'cancel' && run_id) {
      if (!githubPat || !githubRepoOwner || !githubRepoName) {
        return new Response(
          JSON.stringify({ success: false, message: "Configuração do GitHub incompleta" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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

      // Verificar execução hoje — precisa ocorrer ANTES da tentativa via API para que uma
      // integração já concluída com sucesso não seja sobrescrita por uma nova tentativa.
      const skipDailyGate = bypass_daily_limit === true && isServiceRole;
      // "Hoje" no fuso de São Paulo (created_at é UTC) — evita gate diário errado na virada do dia
      const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data: execucoesHoje } = skipDailyGate ? { data: [] as any[] } : await supabase
        .from("sga_automacao_execucoes")
        .select("id, status")
        .eq("corretora_id", corretora_id)
        .gte("created_at", `${hoje}T03:00:00.000Z`)
        .in("status", ["sucesso", "executando"])
        .limit(1);

      if (!skipDailyGate && execucoesHoje && execucoesHoje.length > 0) {
        const st = execucoesHoje[0].status;
        return new Response(
          JSON.stringify({ success: false, message: st === "executando" ? "Já existe uma execução em andamento hoje" : "Já houve uma integração com sucesso hoje." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // === API-FIRST: se a associação tem API habilitada, importa via API; crawl é fallback ===
      // A prioridade é sempre a integração via API — tentamos algumas vezes com backoff
      // antes de aceitar a falha e cair para o crawl via GitHub Actions.
      const { data: apiCred } = await supabase
        .from("hinova_credenciais")
        .select("usar_api, api_token, git_fallback_ativo")
        .eq("corretora_id", corretora_id)
        .maybeSingle();
      if (apiCred?.usar_api && apiCred?.api_token) {
        if (apiCred.git_fallback_ativo === false) {
          await startEventosApiImport(supabase, corretora_id, user);
          return new Response(
            JSON.stringify({ success: true, via: "api", async: true, message: "Importação via API iniciada. O fallback GitHub está desativado e não será acionado." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const MAX_API_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
          try {
            const apiResp = await fetch(`${supabaseUrl}/functions/v1/importar-api-hinova`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
              body: JSON.stringify({ corretora_id, modulo: "eventos" }),
            });
            const apiJson = await apiResp.json().catch(() => ({}));
            if (apiJson?.success) {
              console.log(`[SGA Workflow] Importado via API (${apiJson.total} eventos) — crawl dispensado (tentativa ${attempt}/${MAX_API_ATTEMPTS})`);
              return new Response(
                JSON.stringify({ success: true, via: "api", total: apiJson.total, message: `Importado via API: ${apiJson.total} eventos` }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
            console.warn(`[SGA Workflow] API falhou na tentativa ${attempt}/${MAX_API_ATTEMPTS} (${apiJson?.message})`);
          } catch (apiErr) {
            console.warn(`[SGA Workflow] Erro ao chamar API na tentativa ${attempt}/${MAX_API_ATTEMPTS}:`, apiErr);
          }
          if (attempt < MAX_API_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          }
        }
        console.warn(`[SGA Workflow] API esgotou ${MAX_API_ATTEMPTS} tentativas — fallback para crawl`);
        if (apiCred.git_fallback_ativo === false) {
          console.warn(`[SGA Workflow] git_fallback_ativo=false — abortando (sem crawl) para ${corretora_id}`);
          return new Response(
            JSON.stringify({ success: false, message: "Importação via API falhou e o fallback via GitHub está desativado nas configurações desta associação." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // A partir daqui é fallback/crawl GitHub de fato; só agora exige secrets GitHub.
      if (!githubPat || !githubRepoOwner || !githubRepoName) {
        return new Response(
          JSON.stringify({ success: false, message: "Configuração do GitHub incompleta. A API não está disponível para esta associação e o fallback exige GitHub configurado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      // Calcular datas: desde 01/01/2000 até último dia do mês atual
      // Se vier do backfill, usar período recebido (formato ISO YYYY-MM-DD -> DD/MM/YYYY)
      const toBR = (iso: string) => {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
      };
      let dataInicio: string;
      if (bodyDataInicio) {
        // Backfill: usa o periodo recebido
        dataInicio = toBR(bodyDataInicio);
      } else {
        // Importacao incremental: 1a carga => 01/01/2000; depois => evento aberto mais antigo
        let smart: string | null = null;
        try {
          const { data: rpc } = await supabase.rpc('sga_proxima_data_inicio', { _corretora_id: corretora_id });
          smart = (rpc as string | null) ?? null;
        } catch (e) {
          console.warn('[SGA Workflow] Falha ao calcular data incremental, usando 01/01/2000:', e);
        }
        if (smart) {
          const [yy, mm, dd] = smart.split('-');
          dataInicio = `${dd}/${mm}/${yy}`;
          console.log(`[SGA Workflow] Importacao incremental a partir de ${dataInicio}`);
        } else {
          dataInicio = '01/01/2000';
          console.log('[SGA Workflow] Primeira carga: 01/01/2000');
        }
      }
      let dataFim: string;
      if (bodyDataFim) {
        dataFim = toBR(bodyDataFim);
      } else {
        const now = new Date();
        const ultimoDiaMes = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        dataFim = `${String(ultimoDiaMes.getDate()).padStart(2, '0')}/${String(ultimoDiaMes.getMonth() + 1).padStart(2, '0')}/${ultimoDiaMes.getFullYear()}`;
      }

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

      // Preparar inputs (SEM credenciais - robô busca via edge function)
      const { data: corRun } = await supabase.from("corretoras").select("nome").eq("id", corretora_id).maybeSingle();
      const corretoraNomeRun = (corRun as { nome?: string } | null)?.nome || corretora_id;
      const workflowInputs: WorkflowInput = {
        corretora_nome: corretoraNomeRun,
        corretora_id,
        data_inicio: dataInicio,
        data_fim: dataFim,
        execucao_id: execucao.id,
        webhook_url: `${supabaseUrl}/functions/v1/webhook-sga-hinova`,
      };
      // backfill_job_id NÃO é enviado ao GitHub (workflow não declara esse input).
      // O vínculo é mantido via execucao_id na tabela backfill_jobs.

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
        signal: AbortSignal.timeout(20000),
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

      // Associar o run correto de forma determinística: o run-name contém o execucao_id
      let githubRunId: string | null = null;
      let githubRunUrl: string | null = null;
      for (let attempt = 0; attempt < 4 && !githubRunId; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          const runsUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/eventos-hinova.yml/runs?event=workflow_dispatch&per_page=10`;
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
          console.warn(`[SGA Workflow] Tentativa ${attempt + 1} de localizar run falhou:`, e);
        }
      }

      if (githubRunId) {
        await supabase
          .from("sga_automacao_execucoes")
          .update({ github_run_id: githubRunId, github_run_url: githubRunUrl })
          .eq("id", execucao.id);
      } else {
        console.warn(`[SGA Workflow] Não foi possível associar github_run_id à execução ${execucao.id}`);
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
