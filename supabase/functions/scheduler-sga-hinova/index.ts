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

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const githubPat = Deno.env.get("GITHUB_PAT");
    const githubRepoOwner = Deno.env.get("GITHUB_REPO_OWNER");
    const githubRepoName = Deno.env.get("GITHUB_REPO_NAME");
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!githubPat || !githubRepoOwner || !githubRepoName) {
      console.error("[Scheduler SGA] GitHub secrets não configurados");
      return new Response(
        JSON.stringify({ success: false, message: "GitHub não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let forceMode = false;
    let specificCorretoras: string[] = [];
    
    try {
      const body = await req.json();
      forceMode = body.force === true;
      if (body.corretora_ids && Array.isArray(body.corretora_ids)) {
        specificCorretoras = body.corretora_ids;
      }
    } catch {
      // Body vazio é ok - modo normal do cron
    }

    // Hora atual em Brasília (UTC-3)
    const nowUtc = new Date();
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(nowUtc.getTime() + brasiliaOffset * 60 * 1000);
    
    const currentHour = brasiliaTime.getUTCHours();
    const currentMinute = brasiliaTime.getUTCMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;

    console.log(`[Scheduler SGA] Verificando agendamentos para ${currentTimeStr} (Brasília)${forceMode ? ' [MODO FORÇADO]' : ''}`);

    // ====================================================================
    // FONTE DE VERDADE: hinova_credenciais (credenciais + URLs + flags)
    // sga_automacao_config: apenas scheduling e estado de execução
    // ====================================================================

    // Buscar todas as credenciais com módulo eventos ativo
    let credQuery = supabase
      .from("hinova_credenciais")
      .select(`
        *,
        corretora:corretoras(id, nome, slug)
      `)
      .eq("ativo_eventos", true);
    
    if (specificCorretoras.length > 0) {
      credQuery = credQuery.in("corretora_id", specificCorretoras);
    }

    const { data: credenciais, error: credError } = await credQuery;

    if (credError) {
      console.error("[Scheduler SGA] Erro ao buscar credenciais:", credError);
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao buscar credenciais" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!credenciais || credenciais.length === 0) {
      console.log("[Scheduler SGA] Nenhuma associação com módulo eventos ativo");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma configuração ativa", disparados: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar todas as configs de automação SGA de uma vez (batch)
    const corretoraIds = credenciais.map((c: any) => c.corretora_id);
    const { data: allConfigs } = await supabase
      .from("sga_automacao_config")
      .select("*")
      .in("corretora_id", corretoraIds);

    const configMap = new Map<string, any>();
    (allConfigs || []).forEach((c: any) => configMap.set(c.corretora_id, c));

    // ====================================
    // FASE 1: Verificar retries pendentes
    // ====================================
    const retryDisparados: string[] = [];
    
    const { data: execucoesParaRetry } = await supabase
      .from("sga_automacao_execucoes")
      .select("id, config_id, corretora_id, retry_count, erro")
      .eq("status", "erro")
      .not("proxima_tentativa_at", "is", null)
      .lte("proxima_tentativa_at", new Date().toISOString())
      .in("corretora_id", corretoraIds)
      .order("proxima_tentativa_at", { ascending: true });

    if (execucoesParaRetry && execucoesParaRetry.length > 0) {
      console.log(`[Scheduler SGA] Encontradas ${execucoesParaRetry.length} execuções para retry`);
      
      for (const execFalha of execucoesParaRetry) {
        const cred = credenciais.find((c: any) => c.corretora_id === execFalha.corretora_id);
        const config = configMap.get(execFalha.corretora_id);
        
        if (!cred || !config) {
          await supabase
            .from("sga_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar se já há sucesso hoje
        const hoje = new Date().toISOString().split('T')[0];
        const { data: execucoesHojeSucesso } = await supabase
          .from("sga_automacao_execucoes")
          .select("id")
          .eq("corretora_id", execFalha.corretora_id)
          .gte("created_at", `${hoje}T00:00:00`)
          .eq("status", "sucesso")
          .limit(1);

        if (execucoesHojeSucesso && execucoesHojeSucesso.length > 0) {
          console.log(`[Scheduler SGA] ${cred.corretora?.nome} já tem sucesso hoje, cancelando retry`);
          await supabase
            .from("sga_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar execução em andamento
        const { data: execucaoEmAndamento } = await supabase
          .from("sga_automacao_execucoes")
          .select("id")
          .eq("corretora_id", execFalha.corretora_id)
          .eq("status", "executando")
          .limit(1);

        if (execucaoEmAndamento && execucaoEmAndamento.length > 0) {
          continue;
        }

        console.log(`[Scheduler SGA] Executando retry para ${cred.corretora?.nome} (tentativa ${(execFalha.retry_count || 0) + 1})`);

        try {
          await supabase
            .from("sga_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);

          const { dataInicio, dataFim } = calcularDatas();

          const { data: novaExecucao, error: execError } = await supabase
            .from("sga_automacao_execucoes")
            .insert({
              config_id: config.id,
              corretora_id: cred.corretora_id,
              status: 'executando',
              etapa_atual: 'disparo',
              mensagem: `Retry automático (tentativa ${(execFalha.retry_count || 0) + 1})`,
              iniciado_por: null,
              tipo_disparo: 'retry',
              retry_count: execFalha.retry_count || 0,
              filtros_aplicados: { data_inicio: dataInicio, data_fim: dataFim },
            })
            .select()
            .single();

          if (execError || !novaExecucao) {
            console.error(`[Scheduler SGA] Erro ao criar execução de retry:`, execError);
            continue;
          }

          await supabase
            .from("sga_automacao_config")
            .update({
              ultima_execucao: new Date().toISOString(),
              ultimo_status: 'executando',
              ultimo_erro: null,
            })
            .eq("id", config.id);

          const workflowInputs = buildWorkflowInputs(cred, dataInicio, dataFim, novaExecucao.id, supabaseUrl);

          const dispatchOk = await dispatchGitHub(githubPat!, githubRepoOwner!, githubRepoName!, workflowInputs);

          if (!dispatchOk) {
            const proximoRetry = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
            await supabase
              .from("sga_automacao_execucoes")
              .update({
                status: 'erro',
                erro: 'Erro ao disparar GitHub Actions no retry',
                finalizado_at: new Date().toISOString(),
                proxima_tentativa_at: proximoRetry,
              })
              .eq("id", novaExecucao.id);
            continue;
          }

          await buscarEVincularRunId(githubPat!, githubRepoOwner!, githubRepoName!, novaExecucao.id, supabase);

          await supabase.from("bi_audit_logs").insert({
            modulo: "sga_insights",
            acao: "github_workflow_retry",
            descricao: `Retry SGA disparado para ${cred.corretora?.nome}`,
            corretora_id: cred.corretora_id,
            user_id: SYSTEM_USER_ID,
            user_nome: "Sistema (Scheduler Retry)",
          });

          retryDisparados.push(cred.corretora_id);
        } catch (err) {
          console.error(`[Scheduler SGA] Erro inesperado no retry:`, err);
        }
      }
    }

    // ====================================
    // FASE 2: Agendamentos normais
    // ====================================
    const disparados: string[] = [];
    const erros: string[] = [];

    for (const cred of credenciais) {
      const config = configMap.get(cred.corretora_id);
      const nomeAssociacao = cred.corretora?.nome || cred.corretora_id;

      // Verificar horário agendado
      if (!forceMode) {
        const horaAgendada = cred.hora_agendada || config?.hora_agendada || "09:00:00";
        const [agendadoHora, agendadoMinuto] = horaAgendada.split(":").map(Number);

        if (currentHour !== agendadoHora || currentMinute !== agendadoMinuto) {
          continue;
        }

        // Verificar dia da semana
        const currentDayOfWeek = brasiliaTime.getUTCDay();
        if (cred.dias_agendados && Array.isArray(cred.dias_agendados) && cred.dias_agendados.length > 0) {
          if (!cred.dias_agendados.includes(currentDayOfWeek)) {
            console.log(`[Scheduler SGA] ${nomeAssociacao} não agendado para hoje (dia ${currentDayOfWeek}), pulando`);
            continue;
          }
        }
      }

      // Verificar se já executou hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { data: execucoesHoje } = await supabase
        .from("sga_automacao_execucoes")
        .select("id, status")
        .eq("corretora_id", cred.corretora_id)
        .gte("created_at", `${hoje}T00:00:00`)
        .in("status", ["sucesso", "executando"])
        .limit(1);

      if (execucoesHoje && execucoesHoje.length > 0) {
        console.log(`[Scheduler SGA] ${nomeAssociacao} já executou hoje, pulando`);
        continue;
      }

      // Verificar credenciais (da tabela hinova_credenciais)
      if (!cred.hinova_user || !cred.hinova_pass) {
        console.warn(`[Scheduler SGA] ${nomeAssociacao} sem credenciais configuradas`);
        continue;
      }

      console.log(`[Scheduler SGA] Disparando para ${nomeAssociacao}`);

      try {
        const { dataInicio, dataFim } = calcularDatas();

        // Garantir que existe config de automação (auto-criar se necessário)
        let configId = config?.id;
        if (!config) {
          const { data: newConfig } = await supabase
            .from("sga_automacao_config")
            .insert({
              corretora_id: cred.corretora_id,
              ativo: true,
              hinova_url: cred.hinova_url,
              hinova_user: cred.hinova_user,
              hinova_pass: cred.hinova_pass,
              hinova_codigo_cliente: cred.hinova_codigo_cliente || '',
              hora_agendada: cred.hora_agendada || '09:00:00',
            })
            .select()
            .single();
          configId = newConfig?.id;
          if (!configId) {
            console.error(`[Scheduler SGA] Falha ao criar config para ${nomeAssociacao}`);
            erros.push(cred.corretora_id);
            continue;
          }
        }

        const { data: execucao, error: execError } = await supabase
          .from("sga_automacao_execucoes")
          .insert({
            config_id: configId,
            corretora_id: cred.corretora_id,
            status: 'executando',
            etapa_atual: 'disparo',
            mensagem: forceMode
              ? `Execução forçada (pendente)`
              : `Execução agendada automática`,
            iniciado_por: null,
            tipo_disparo: 'agendado',
            filtros_aplicados: { data_inicio: dataInicio, data_fim: dataFim },
          })
          .select()
          .single();

        if (execError || !execucao) {
          console.error(`[Scheduler SGA] Erro ao criar execução:`, execError);
          erros.push(cred.corretora_id);
          continue;
        }

        await supabase
          .from("sga_automacao_config")
          .update({
            ultima_execucao: new Date().toISOString(),
            ultimo_status: 'executando',
            ultimo_erro: null,
          })
          .eq("id", configId);

        const workflowInputs = buildWorkflowInputs(cred, dataInicio, dataFim, execucao.id, supabaseUrl);

        const dispatchOk = await dispatchGitHub(githubPat!, githubRepoOwner!, githubRepoName!, workflowInputs);

        if (!dispatchOk) {
          await supabase
            .from("sga_automacao_execucoes")
            .update({
              status: 'erro',
              erro: 'Erro ao disparar GitHub Actions',
              finalizado_at: new Date().toISOString(),
              proxima_tentativa_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            })
            .eq("id", execucao.id);

          await supabase
            .from("sga_automacao_config")
            .update({ ultimo_status: 'erro', ultimo_erro: 'Erro ao disparar GitHub Actions' })
            .eq("id", configId);

          erros.push(cred.corretora_id);
          continue;
        }

        await buscarEVincularRunId(githubPat!, githubRepoOwner!, githubRepoName!, execucao.id, supabase);

        await supabase.from("bi_audit_logs").insert({
          modulo: "sga_insights",
          acao: "github_workflow_agendado",
          descricao: `Workflow SGA agendado para ${nomeAssociacao}`,
          corretora_id: cred.corretora_id,
          user_id: SYSTEM_USER_ID,
          user_nome: "Sistema (Scheduler)",
        });

        console.log(`[Scheduler SGA] Workflow disparado para ${nomeAssociacao}`);
        disparados.push(cred.corretora_id);

      } catch (err) {
        console.error(`[Scheduler SGA] Erro inesperado para ${cred.corretora_id}:`, err);
        erros.push(cred.corretora_id);
      }
    }

    const resultado = {
      success: true,
      message: `Scheduler SGA executado às ${currentTimeStr} (Brasília)`,
      disparados: disparados.length,
      retries: retryDisparados.length,
      erros: erros.length,
      detalhes: { disparados, retries: retryDisparados, erros },
    };

    console.log("[Scheduler SGA] Resultado:", resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Scheduler SGA] Erro geral:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ====================================
// HELPERS
// ====================================

function calcularDatas() {
  const dataInicio = '01/01/2000';
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dataFim = `${String(lastDay.getDate()).padStart(2, '0')}/${String(lastDay.getMonth() + 1).padStart(2, '0')}/${lastDay.getFullYear()}`;
  return { dataInicio, dataFim };
}

function buildWorkflowInputs(cred: any, dataInicio: string, dataFim: string, execucaoId: string, supabaseUrl: string): WorkflowInput {
  // Derivar URL do relatório se não estiver configurada
  let relatorioUrl = cred.url_eventos || '';
  if (!relatorioUrl && cred.hinova_url) {
    try {
      const url = new URL(cred.hinova_url);
      const pathParts = url.pathname.split('/');
      const basePathParts = pathParts.filter((p: string) =>
        p && !p.includes('login') && !p.includes('Principal') && p !== 'v5'
      );
      const basePath = '/' + basePathParts.join('/');
      relatorioUrl = `${url.origin}${basePath}/relatorio/relatorioEvento.php`;
    } catch {
      relatorioUrl = '';
    }
  }

  return {
    corretora_id: cred.corretora_id,
    hinova_url: cred.hinova_url || '',
    hinova_relatorio_url: relatorioUrl,
    hinova_user: cred.hinova_user || '',
    hinova_pass: cred.hinova_pass || '',
    hinova_codigo_cliente: cred.hinova_codigo_cliente || '',
    hinova_layout: cred.layout_eventos || '',
    data_inicio: dataInicio,
    data_fim: dataFim,
    execucao_id: execucaoId,
    webhook_url: `${supabaseUrl}/functions/v1/webhook-sga-hinova`,
  };
}

async function dispatchGitHub(pat: string, owner: string, repo: string, inputs: WorkflowInput): Promise<boolean> {
  const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/eventos-hinova.yml/dispatches`;
  
  const response = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs }),
  });

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    console.error(`[Scheduler SGA] Erro GitHub dispatch:`, response.status, errorText);
    return false;
  }

  return true;
}

async function buscarEVincularRunId(pat: string, owner: string, repo: string, execucaoId: string, supabase: any) {
  await new Promise(resolve => setTimeout(resolve, 2000));

  const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/eventos-hinova.yml/runs?per_page=5`;
  const runsResponse = await fetch(runsUrl, {
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (runsResponse.ok) {
    const runsData = await runsResponse.json();
    const recentRun = runsData.workflow_runs?.find((run: { created_at: string }) => {
      const diff = Date.now() - new Date(run.created_at).getTime();
      return diff < 30000;
    });

    if (recentRun) {
      await supabase
        .from("sga_automacao_execucoes")
        .update({
          github_run_id: String(recentRun.id),
          github_run_url: recentRun.html_url,
        })
        .eq("id", execucaoId);
    }
  }
}
