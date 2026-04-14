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

    // Verificar secrets do GitHub
    if (!githubPat || !githubRepoOwner || !githubRepoName) {
      console.error("[Scheduler MGF] GitHub secrets não configurados");
      return new Response(
        JSON.stringify({ success: false, message: "GitHub não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se é uma chamada forçada (executar pendentes)
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

    // Obter hora atual em Brasília (UTC-3)
    const nowUtc = new Date();
    const brasiliaOffset = -3 * 60; // -3 horas em minutos
    const brasiliaTime = new Date(nowUtc.getTime() + brasiliaOffset * 60 * 1000);
    
    const currentHour = brasiliaTime.getUTCHours();
    const currentMinute = brasiliaTime.getUTCMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;

    console.log(`[Scheduler MGF] Verificando agendamentos para ${currentTimeStr} (Brasília)${forceMode ? ' [MODO FORÇADO]' : ''}`);

    // Buscar todas as configurações ativas
    let query = supabase
      .from("mgf_automacao_config")
      .select(`
        *,
        corretora:corretoras(nome, slug)
      `)
      .eq("ativo", true);
    
    // Se há corretoras específicas, filtrar
    if (specificCorretoras.length > 0) {
      query = query.in("corretora_id", specificCorretoras);
    }
    
    const { data: configs, error: configsError } = await query;

    if (configsError) {
      console.error("[Scheduler MGF] Erro ao buscar configurações:", configsError);
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao buscar configurações" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!configs || configs.length === 0) {
      console.log("[Scheduler MGF] Nenhuma configuração ativa encontrada");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma configuração ativa", disparados: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====================================
    // FASE 1: Verificar retries pendentes
    // ====================================
    const retryDisparados: string[] = [];
    
    // Buscar execuções com erro que precisam de retry
    const { data: execucoesParaRetry } = await supabase
      .from("mgf_automacao_execucoes")
      .select(`
        id,
        config_id,
        corretora_id,
        retry_count,
        erro
      `)
      .eq("status", "erro")
      .not("proxima_tentativa_at", "is", null)
      .lte("proxima_tentativa_at", new Date().toISOString())
      .order("proxima_tentativa_at", { ascending: true });

    if (execucoesParaRetry && execucoesParaRetry.length > 0) {
      console.log(`[Scheduler MGF] Encontradas ${execucoesParaRetry.length} execuções para retry`);
      
      for (const execFalha of execucoesParaRetry) {
        // Buscar config da corretora
        const { data: config } = await supabase
          .from("mgf_automacao_config")
          .select(`
            *,
            corretora:corretoras(nome, slug)
          `)
          .eq("id", execFalha.config_id)
          .eq("ativo", true)
          .single();

        if (!config) {
          console.log(`[Scheduler MGF] Config não encontrada ou inativa para retry, limpando agendamento`);
          await supabase
            .from("mgf_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar flag ativo_mgf em hinova_credenciais
        const { data: credRetry } = await supabase
          .from("hinova_credenciais")
          .select("ativo_mgf")
          .eq("corretora_id", config.corretora_id)
          .maybeSingle();
        
        if (credRetry && credRetry.ativo_mgf === false) {
          console.log(`[Scheduler MGF] ${config.corretora?.nome} módulo MGF desativado, cancelando retry`);
          await supabase
            .from("mgf_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar se já há uma execução com sucesso hoje
        const hoje = new Date().toISOString().split('T')[0];
        const { data: execucoesHojeSucesso } = await supabase
          .from("mgf_automacao_execucoes")
          .select("id")
          .eq("config_id", config.id)
          .gte("created_at", `${hoje}T00:00:00`)
          .eq("status", "sucesso")
          .limit(1);

        if (execucoesHojeSucesso && execucoesHojeSucesso.length > 0) {
          console.log(`[Scheduler MGF] ${config.corretora?.nome} já tem sucesso hoje, cancelando retry`);
          await supabase
            .from("mgf_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar se não há execução em andamento
        const { data: execucaoEmAndamento } = await supabase
          .from("mgf_automacao_execucoes")
          .select("id")
          .eq("config_id", config.id)
          .eq("status", "executando")
          .limit(1);

        if (execucaoEmAndamento && execucaoEmAndamento.length > 0) {
          console.log(`[Scheduler MGF] ${config.corretora?.nome} já tem execução em andamento, pulando retry`);
          continue;
        }

        console.log(`[Scheduler MGF] Executando retry para ${config.corretora?.nome} (tentativa ${execFalha.retry_count + 1})`);

        try {
          // Limpar o agendamento de retry da execução antiga
          await supabase
            .from("mgf_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);

          // Criar nova execução de retry
          const { data: novaExecucao, error: execError } = await supabase
            .from("mgf_automacao_execucoes")
            .insert({
              config_id: config.id,
              corretora_id: config.corretora_id,
              status: 'executando',
              etapa_atual: 'disparo',
              mensagem: `Retry automático (tentativa ${execFalha.retry_count + 1}) após erro: ${execFalha.erro?.substring(0, 100) || 'desconhecido'}`,
              iniciado_por: null,
              tipo_disparo: 'retry',
              retry_count: execFalha.retry_count,
            })
            .select()
            .single();

          if (execError) {
            console.error(`[Scheduler MGF] Erro ao criar execução de retry:`, execError);
            continue;
          }

          // Atualizar status para executando
          await supabase
            .from("mgf_automacao_config")
            .update({
              ultima_execucao: new Date().toISOString(),
              ultimo_status: 'executando',
              ultimo_erro: null,
            })
            .eq("id", config.id);

          // Preparar inputs para o workflow (credenciais buscadas pelo robô via edge function)
          const workflowInputs = {
            corretora_id: config.corretora_id,
            execucao_id: novaExecucao.id,
            webhook_url: `${supabaseUrl}/functions/v1/webhook-mgf-hinova`,
          };

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
            console.error(`[Scheduler MGF] Erro ao disparar retry para ${config.corretora_id}:`, errorText);
            
            // Agendar próximo retry em 1 hora
            const proximoRetry = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
            await supabase
              .from("mgf_automacao_execucoes")
              .update({
                status: 'erro',
                erro: `Erro ao disparar GitHub Actions no retry: ${dispatchResponse.status}`,
                finalizado_at: new Date().toISOString(),
                proxima_tentativa_at: proximoRetry,
              })
              .eq("id", novaExecucao.id);
            continue;
          }

          // Registrar log de auditoria
          await supabase.from("bi_audit_logs").insert({
            modulo: "mgf_insights",
            acao: "github_workflow_retry",
            descricao: `Retry automático MGF disparado para ${config.corretora?.nome || config.corretora_id} (tentativa ${execFalha.retry_count + 1})`,
            corretora_id: config.corretora_id,
            user_id: SYSTEM_USER_ID,
            user_nome: "Sistema (Scheduler Retry)",
            dados_novos: {
              execucao_id: novaExecucao.id,
              retry_count: execFalha.retry_count + 1,
              erro_anterior: execFalha.erro?.substring(0, 200),
            },
          });

          console.log(`[Scheduler MGF] Retry disparado para ${config.corretora?.nome}`);
          retryDisparados.push(config.corretora_id);

        } catch (err) {
          console.error(`[Scheduler MGF] Erro inesperado no retry para ${config.corretora_id}:`, err);
        }
      }
    }

    // ====================================
    // FASE 2: Agendamentos normais
    // ====================================
    const disparados: string[] = [];
    const erros: string[] = [];

    for (const config of configs) {
      // Verificar flag ativo_mgf na tabela hinova_credenciais
      const { data: credenciaisFlag } = await supabase
        .from("hinova_credenciais")
        .select("ativo_mgf")
        .eq("corretora_id", config.corretora_id)
        .maybeSingle();
      
      if (credenciaisFlag && credenciaisFlag.ativo_mgf === false) {
        console.log(`[Scheduler MGF] ${config.corretora?.nome || config.corretora_id} módulo MGF desativado em hinova_credenciais, pulando`);
        continue;
      }

      // Verificar se o horário agendado corresponde ao horário atual (apenas se não for modo forçado)
      if (!forceMode) {
        const horaAgendada = config.hora_agendada || "09:00:00";
        const [agendadoHora, agendadoMinuto] = horaAgendada.split(":").map(Number);

        // Verificar se está dentro da janela de 1 minuto (scheduler roda a cada minuto)
        if (currentHour !== agendadoHora || currentMinute !== agendadoMinuto) {
          continue;
        }

        // Verificar dia da semana (dias_agendados em hinova_credenciais)
        const currentDayOfWeek = brasiliaTime.getUTCDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
        const { data: credRow } = await supabase
          .from("hinova_credenciais")
          .select("dias_agendados")
          .eq("corretora_id", config.corretora_id)
          .maybeSingle();
        
        if (credRow?.dias_agendados && Array.isArray(credRow.dias_agendados) && credRow.dias_agendados.length > 0) {
          if (!credRow.dias_agendados.includes(currentDayOfWeek)) {
            console.log(`[Scheduler MGF] ${config.corretora?.nome || config.corretora_id} não agendado para hoje (dia ${currentDayOfWeek}), pulando`);
            continue;
          }
        }
      }

      // Verificar se já executou hoje (evitar duplicatas)
      const hoje = new Date().toISOString().split('T')[0];
      const { data: execucoesHoje } = await supabase
        .from("mgf_automacao_execucoes")
        .select("id, status")
        .eq("config_id", config.id)
        .gte("created_at", `${hoje}T00:00:00`)
        .in("status", ["sucesso", "executando"])
        .limit(1);

      if (execucoesHoje && execucoesHoje.length > 0) {
        console.log(`[Scheduler MGF] ${config.corretora?.nome || config.corretora_id} já executou hoje com sucesso, pulando`);
        continue;
      }

      // Verificar credenciais em hinova_credenciais
      const { data: credCheck } = await supabase
        .from("hinova_credenciais")
        .select("hinova_user, hinova_pass")
        .eq("corretora_id", config.corretora_id)
        .maybeSingle();
      
      if (!credCheck?.hinova_user && !config.hinova_user) {
        console.warn(`[Scheduler MGF] ${config.corretora?.nome || config.corretora_id} sem credenciais configuradas`);
        continue;
      }

      const horaAgendadaConfig = config.hora_agendada || "09:00:00";
      console.log(`[Scheduler MGF] Disparando para ${config.corretora?.nome || config.corretora_id}`);

      try {
        // Criar registro de execução
        const { data: execucao, error: execError } = await supabase
          .from("mgf_automacao_execucoes")
          .insert({
            config_id: config.id,
            corretora_id: config.corretora_id,
            status: 'executando',
            etapa_atual: 'disparo',
            mensagem: forceMode 
              ? `Execução forçada (pendente de ${horaAgendadaConfig} Brasília)` 
              : `Execução agendada automática (${horaAgendadaConfig} Brasília)`,
            iniciado_por: null,
            tipo_disparo: 'agendado',
          })
          .select()
          .single();

        if (execError) {
          console.error(`[Scheduler MGF] Erro ao criar execução para ${config.corretora_id}:`, execError);
          erros.push(config.corretora_id);
          continue;
        }

        // Atualizar status para executando
        await supabase
          .from("mgf_automacao_config")
          .update({
            ultima_execucao: new Date().toISOString(),
            ultimo_status: 'executando',
            ultimo_erro: null,
          })
          .eq("id", config.id);

        // Preparar inputs para o workflow (credenciais buscadas pelo robô via edge function)
        const workflowInputs: WorkflowInput = {
          corretora_id: config.corretora_id,
          execucao_id: execucao.id,
          webhook_url: `${supabaseUrl}/functions/v1/webhook-mgf-hinova`,
        };

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
          console.error(`[Scheduler MGF] Erro ao disparar workflow para ${config.corretora_id}:`, errorText);
          
          await supabase
            .from("mgf_automacao_execucoes")
            .update({
              status: 'erro',
              erro: `Erro ao disparar GitHub Actions: ${dispatchResponse.status}`,
              finalizado_at: new Date().toISOString(),
            })
            .eq("id", execucao.id);

          await supabase
            .from("mgf_automacao_config")
            .update({
              ultimo_status: 'erro',
              ultimo_erro: `Erro ao disparar GitHub Actions: ${dispatchResponse.status}`,
            })
            .eq("id", config.id);

          erros.push(config.corretora_id);
          continue;
        }

        // Aguardar e buscar o run_id
        await new Promise(resolve => setTimeout(resolve, 2000));

        const runsUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/mgf-hinova.yml/runs?per_page=5`;
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
          // Encontrar o run mais recente que foi disparado agora
          const recentRun = runsData.workflow_runs?.find((run: { created_at: string }) => {
            const runTime = new Date(run.created_at);
            const diff = Date.now() - runTime.getTime();
            return diff < 30000; // Últimos 30 segundos
          });
          
          if (recentRun) {
            githubRunId = String(recentRun.id);
            githubRunUrl = recentRun.html_url;
            
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
          acao: "github_workflow_agendado",
          descricao: `Workflow MGF GitHub agendado disparado automaticamente para ${config.corretora?.nome || config.corretora_id}`,
          corretora_id: config.corretora_id,
          user_id: SYSTEM_USER_ID,
          user_nome: "Sistema (Scheduler)",
          dados_novos: {
            execucao_id: execucao.id,
            github_run_id: githubRunId,
            github_run_url: githubRunUrl,
            hora_agendada: horaAgendadaConfig,
            modo_forcado: forceMode,
          },
        });

        console.log(`[Scheduler MGF] Workflow disparado para ${config.corretora?.nome || config.corretora_id}. Run ID: ${githubRunId}`);
        disparados.push(config.corretora_id);

      } catch (err) {
        console.error(`[Scheduler MGF] Erro inesperado para ${config.corretora_id}:`, err);
        erros.push(config.corretora_id);
      }
    }

    const resultado = {
      success: true,
      message: `Scheduler MGF executado às ${currentTimeStr} (Brasília)`,
      disparados: disparados.length,
      retries: retryDisparados.length,
      erros: erros.length,
      detalhes: {
        disparados,
        retries: retryDisparados,
        erros,
      },
    };

    console.log("[Scheduler MGF] Resultado:", resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Scheduler MGF] Erro geral:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
