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

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

const MAX_RETRIES = 3; // teto de tentativas automáticas antes de parar

// Espaça os disparos: no modo cron (roda a cada minuto) dispara poucas por
// ciclo para nao martelar o Hinova/GitHub com todas as associacoes ao mesmo tempo.
const MAX_DISPATCH_PER_RUN = 3;

// Tenta a API oficial do SGA Hinova antes de qualquer coisa — o crawl via GitHub
// Actions é só o fallback. Retorna true se a API já resolveu (nada mais a fazer).
// deno-lint-ignore no-explicit-any
async function tentarViaApi(supabase: any, supabaseUrl: string, supabaseKey: string, corretoraId: string, configId: string | undefined, nomeAssociacao: string): Promise<boolean> {
  const { data: cred } = await supabase
    .from("hinova_credenciais")
    .select("usar_api, api_token, git_fallback_ativo")
    .eq("corretora_id", corretoraId)
    .maybeSingle();

  if (!cred?.usar_api || !cred?.api_token) return false;

  try {
    const apiResp = await fetch(`${supabaseUrl}/functions/v1/importar-api-hinova`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ corretora_id: corretoraId, modulo: "cobranca" }),
    });
    const apiJson = await apiResp.json().catch(() => ({}));
    if (apiJson?.success) {
      console.log(`[Scheduler] ${nomeAssociacao} importado via API (${apiJson.total} registros) — crawl dispensado`);
      await supabase.from("cobranca_automacao_execucoes").insert({
        config_id: configId ?? null,
        corretora_id: corretoraId,
        status: "sucesso",
        etapa_atual: "concluido",
        tipo_disparo: "api",
        mensagem: `Importado via API SGA Hinova (${apiJson.total ?? 0} registros)`,
        registros_processados: apiJson.total ?? null,
        finalizado_at: new Date().toISOString(),
      });
      return true;
    }
    console.warn(`[Scheduler] ${nomeAssociacao}: API falhou (${apiJson?.message}) — fallback para crawl`);
  } catch (apiErr) {
    console.warn(`[Scheduler] ${nomeAssociacao}: erro ao chamar API — fallback para crawl:`, apiErr);
  }
  // Respeita a configuração: se o fallback via GitHub está desativado,
  // registra erro e sinaliza "tratado" para o caller não disparar o crawl.
  if (cred.git_fallback_ativo === false) {
    console.warn(`[Scheduler] ${nomeAssociacao}: git_fallback_ativo=false — crawl NÃO será disparado`);
    await supabase.from("cobranca_automacao_execucoes").insert({
      config_id: configId ?? null,
      corretora_id: corretoraId,
      status: "erro",
      etapa_atual: "api",
      tipo_disparo: "api",
      mensagem: "Importação via API falhou e o fallback via GitHub está desativado.",
      erro: "API Hinova indisponível e git_fallback_ativo=false",
      finalizado_at: new Date().toISOString(),
    });
    return true;
  }
  return false;
}

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
      console.error("[Scheduler] GitHub secrets não configurados");
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

    console.log(`[Scheduler] Verificando agendamentos para ${currentTimeStr} (Brasília)${forceMode ? ' [MODO FORÇADO]' : ''}`);

    // Buscar todas as configurações ativas
    let query = supabase
      .from("cobranca_automacao_config")
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
      console.error("[Scheduler] Erro ao buscar configurações:", configsError);
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao buscar configurações" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!configs || configs.length === 0) {
      console.log("[Scheduler] Nenhuma configuração ativa encontrada");
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
      .from("cobranca_automacao_execucoes")
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
      .lt("retry_count", MAX_RETRIES)
      .order("proxima_tentativa_at", { ascending: true });

    if (execucoesParaRetry && execucoesParaRetry.length > 0) {
      console.log(`[Scheduler] Encontradas ${execucoesParaRetry.length} execuções para retry`);

      for (const execFalha of execucoesParaRetry) {
        // Buscar config da corretora
        const { data: config } = await supabase
          .from("cobranca_automacao_config")
          .select(`
            *,
            corretora:corretoras(nome, slug)
          `)
          .eq("id", execFalha.config_id)
          .eq("ativo", true)
          .single();

        if (!config) {
          console.log(`[Scheduler] Config não encontrada ou inativa para retry, limpando agendamento`);
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar flag ativo_cobranca em hinova_credenciais
        const { data: credRetry } = await supabase
          .from("hinova_credenciais")
          .select("ativo_cobranca")
          .eq("corretora_id", config.corretora_id)
          .maybeSingle();

        if (credRetry && credRetry.ativo_cobranca === false) {
          console.log(`[Scheduler] ${config.corretora?.nome} módulo cobrança desativado, cancelando retry`);
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar se já há uma execução com sucesso hoje (não precisa retry)
        const hoje = new Date().toISOString().split('T')[0];
        const { data: execucoesHojeSucesso } = await supabase
          .from("cobranca_automacao_execucoes")
          .select("id")
          .eq("config_id", config.id)
          .gte("created_at", `${hoje}T00:00:00`)
          .eq("status", "sucesso")
          .limit(1);

        if (execucoesHojeSucesso && execucoesHojeSucesso.length > 0) {
          console.log(`[Scheduler] ${config.corretora?.nome} já tem sucesso hoje, cancelando retry`);
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          continue;
        }

        // Verificar se não há execução em andamento
        const { data: execucaoEmAndamento } = await supabase
          .from("cobranca_automacao_execucoes")
          .select("id")
          .eq("config_id", config.id)
          .eq("status", "executando")
          .limit(1);

        if (execucaoEmAndamento && execucaoEmAndamento.length > 0) {
          console.log(`[Scheduler] ${config.corretora?.nome} já tem execução em andamento, pulando retry`);
          continue;
        }

        console.log(`[Scheduler] Executando retry para ${config.corretora?.nome} (tentativa ${execFalha.retry_count + 1})`);

        // API-first: tenta a API antes de reagendar o crawl no retry
        if (await tentarViaApi(supabase, supabaseUrl, supabaseKey, config.corretora_id, config.id, config.corretora?.nome || config.corretora_id)) {
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);
          retryDisparados.push(config.corretora_id);
          continue;
        }

        try {
          // Limpar o agendamento de retry da execução antiga
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({ proxima_tentativa_at: null })
            .eq("id", execFalha.id);

          // Criar nova execução de retry
          const { data: novaExecucao, error: execError } = await supabase
            .from("cobranca_automacao_execucoes")
            .insert({
              config_id: config.id,
              corretora_id: config.corretora_id,
              status: 'executando',
              etapa_atual: 'disparo',
              mensagem: `Retry automático (tentativa ${execFalha.retry_count + 1}) após erro: ${execFalha.erro?.substring(0, 100) || 'desconhecido'}`,
              iniciado_por: null,
              tipo_disparo: 'retry',
              retry_count: (execFalha.retry_count || 0) + 1,
            })
            .select()
            .single();

          if (execError) {
            console.error(`[Scheduler] Erro ao criar execução de retry:`, execError);
            continue;
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

          // Preparar inputs para o workflow (credenciais buscadas pelo robô via edge function)
          const workflowInputs = {
            corretora_id: config.corretora_id,
            corretora_nome: config.corretora?.nome || config.corretora_id,
            execucao_id: novaExecucao.id,
            webhook_url: `${supabaseUrl}/functions/v1/webhook-cobranca-hinova`,
          };

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
            body: JSON.stringify({
              ref: 'main',
              inputs: workflowInputs,
            }),
          });

          if (!dispatchResponse.ok && dispatchResponse.status !== 204) {
            const errorText = await dispatchResponse.text();
            console.error(`[Scheduler] Erro ao disparar retry para ${config.corretora_id}:`, errorText);

            // Só reagenda se ainda houver tentativas — evita loop infinito de retries
            const novoRetryCount = (execFalha.retry_count || 0) + 1;
            const podeReagendar = novoRetryCount < MAX_RETRIES;
            const proximoRetry = podeReagendar ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() : null;
            await supabase
              .from("cobranca_automacao_execucoes")
              .update({
                status: 'erro',
                erro: podeReagendar
                  ? `Erro ao disparar GitHub Actions no retry: ${dispatchResponse.status}`
                  : `Erro ao disparar GitHub Actions (limite de ${MAX_RETRIES} tentativas atingido): ${dispatchResponse.status}`,
                finalizado_at: new Date().toISOString(),
                proxima_tentativa_at: proximoRetry,
              })
              .eq("id", novaExecucao.id);
            continue;
          }

          // Registrar log de auditoria
          await supabase.from("bi_audit_logs").insert({
            modulo: "cobranca",
            acao: "github_workflow_retry",
            descricao: `Retry automático disparado para ${config.corretora?.nome || config.corretora_id} (tentativa ${execFalha.retry_count + 1})`,
            corretora_id: config.corretora_id,
            user_id: SYSTEM_USER_ID,
            user_nome: "Sistema (Scheduler Retry)",
            dados_novos: {
              execucao_id: novaExecucao.id,
              retry_count: execFalha.retry_count + 1,
              erro_anterior: execFalha.erro?.substring(0, 200),
            },
          });

          console.log(`[Scheduler] Retry disparado para ${config.corretora?.nome}`);
          retryDisparados.push(config.corretora_id);

        } catch (err) {
          console.error(`[Scheduler] Erro inesperado no retry para ${config.corretora_id}:`, err);
        }
      }
    }

    // ====================================
    // FASE 2: Agendamentos normais
    // ====================================
    const disparados: string[] = [];
    const erros: string[] = [];

    for (const config of configs) {
      // Cap de disparos por ciclo (evita martelar Hinova/GitHub com todas de uma vez).
      // Não se aplica quando corretoras específicas foram pedidas explicitamente.
      if (!forceMode && specificCorretoras.length === 0 &&
          (disparados.length + retryDisparados.length) >= MAX_DISPATCH_PER_RUN) {
        console.log(`[Scheduler] Cap de ${MAX_DISPATCH_PER_RUN} disparos/ciclo atingido — restante no próximo ciclo`);
        break;
      }

      // Verificar flag ativo_cobranca na tabela hinova_credenciais
      const { data: credenciaisFlag } = await supabase
        .from("hinova_credenciais")
        .select("ativo_cobranca")
        .eq("corretora_id", config.corretora_id)
        .maybeSingle();

      if (credenciaisFlag && credenciaisFlag.ativo_cobranca === false) {
        console.log(`[Scheduler] ${config.corretora?.nome || config.corretora_id} módulo cobrança desativado em hinova_credenciais, pulando`);
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
            console.log(`[Scheduler] ${config.corretora?.nome || config.corretora_id} não agendado para hoje (dia ${currentDayOfWeek}), pulando`);
            continue;
          }
        }
      }

      // Respeita a frequência configurável (api_intervalo_horas), unificado
      // com a base: só reimporta se a última execução (sucesso ou em curso)
      // foi há mais que o intervalo. Antes era fixo em 1x/dia.
      {
        const { data: credInt } = await supabase
          .from("hinova_credenciais")
          .select("horarios_sync")
          .eq("corretora_id", config.corretora_id)
          .maybeSingle();
        // Só importa nas horas configuradas (horarios_sync, em Brasília; default
        // 8/14). O cron roda de hora em hora e cada scheduler filtra pela hora.
        const horariosSync: number[] = Array.isArray((credInt as any)?.horarios_sync) && (credInt as any).horarios_sync.length > 0
          ? (credInt as any).horarios_sync
          : [8, 14];
        const horaBrt = new Date(Date.now() - 3 * 3_600_000).getUTCHours();
        if (!horariosSync.includes(horaBrt)) {
          continue;
        }
        // Dedup: evita reimportar duas vezes na mesma hora (o QUANDO já é
        // decidido por horarios_sync acima). Não depende mais do intervalo.
        const { data: ultimaExec } = await supabase
          .from("cobranca_automacao_execucoes")
          .select("created_at")
          .eq("config_id", config.id)
          .in("status", ["sucesso", "executando"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ultimaExec?.created_at) {
          const diffMin = (Date.now() - new Date(ultimaExec.created_at).getTime()) / 60000;
          if (diffMin < 50) {
            continue;
          }
        }
      }

      // Verificar credenciais (agora em hinova_credenciais, não mais em cobranca_automacao_config)
      const { data: credCheck } = await supabase
        .from("hinova_credenciais")
        .select("hinova_user, hinova_pass")
        .eq("corretora_id", config.corretora_id)
        .maybeSingle();

      if (!credCheck?.hinova_user || !credCheck?.hinova_pass) {
        // Fallback: verificar em cobranca_automacao_config
        if (!config.hinova_user || !config.hinova_pass) {
          console.warn(`[Scheduler] ${config.corretora?.nome || config.corretora_id} sem credenciais configuradas`);
          continue;
        }
      }

      const horaAgendadaConfig = config.hora_agendada || "09:00:00";
      console.log(`[Scheduler] Disparando para ${config.corretora?.nome || config.corretora_id}`);

      // API-first: só cai pro crawl/GitHub Actions se a API não resolver.
      if (await tentarViaApi(supabase, supabaseUrl, supabaseKey, config.corretora_id, config.id, config.corretora?.nome || config.corretora_id)) {
        disparados.push(config.corretora_id);
        continue;
      }

      try {
        // Criar registro de execução
        const { data: execucao, error: execError } = await supabase
          .from("cobranca_automacao_execucoes")
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
          console.error(`[Scheduler] Erro ao criar execução para ${config.corretora_id}:`, execError);
          erros.push(config.corretora_id);
          continue;
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

        // Preparar inputs para o workflow (credenciais são buscadas pelo robô via edge function)
        const workflowInputs: WorkflowInput = {
          corretora_id: config.corretora_id,
          corretora_nome: config.corretora?.nome || config.corretora_id,
          execucao_id: execucao.id,
          webhook_url: `${supabaseUrl}/functions/v1/webhook-cobranca-hinova`,
        };

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
          body: JSON.stringify({
            ref: 'main',
            inputs: workflowInputs,
          }),
        });

        if (!dispatchResponse.ok && dispatchResponse.status !== 204) {
          const errorText = await dispatchResponse.text();
          console.error(`[Scheduler] Erro ao disparar workflow para ${config.corretora_id}:`, errorText);

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

          erros.push(config.corretora_id);
          continue;
        }

        // Aguardar e buscar o run_id
        await new Promise(resolve => setTimeout(resolve, 2000));

        const runsUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/cobranca-hinova.yml/runs?per_page=5`;
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
              .from("cobranca_automacao_execucoes")
              .update({
                github_run_id: githubRunId,
                github_run_url: githubRunUrl,
              })
              .eq("id", execucao.id);
          }
        }

        // Registrar log de auditoria
        await supabase.from("bi_audit_logs").insert({
          modulo: "cobranca",
          acao: "github_workflow_agendado",
          descricao: `Workflow GitHub agendado disparado automaticamente para ${config.corretora?.nome || config.corretora_id}`,
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

        console.log(`[Scheduler] Workflow disparado para ${config.corretora?.nome || config.corretora_id}. Run ID: ${githubRunId}`);
        disparados.push(config.corretora_id);

      } catch (err) {
        console.error(`[Scheduler] Erro inesperado para ${config.corretora_id}:`, err);
        erros.push(config.corretora_id);
      }
    }

    const resultado = {
      success: true,
      message: `Scheduler executado às ${currentTimeStr} (Brasília)`,
      disparados: disparados.length,
      retries: retryDisparados.length,
      erros: erros.length,
      detalhes: {
        disparados,
        retries: retryDisparados,
        erros,
      },
    };

    console.log("[Scheduler] Resultado:", resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Scheduler] Erro geral:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
