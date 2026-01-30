import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkflowInput {
  corretora_id: string;
  hinova_url: string;
  hinova_user: string;
  hinova_pass: string;
  hinova_codigo_cliente: string;
  hinova_layout: string;
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
      console.error("[Scheduler] GitHub secrets não configurados");
      return new Response(
        JSON.stringify({ success: false, message: "GitHub não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obter hora atual em Brasília (UTC-3)
    const nowUtc = new Date();
    const brasiliaOffset = -3 * 60; // -3 horas em minutos
    const brasiliaTime = new Date(nowUtc.getTime() + brasiliaOffset * 60 * 1000);
    
    const currentHour = brasiliaTime.getUTCHours();
    const currentMinute = brasiliaTime.getUTCMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;

    console.log(`[Scheduler] Verificando agendamentos para ${currentTimeStr} (Brasília)`);

    // Buscar todas as configurações ativas que devem executar agora
    // Considera uma janela de 5 minutos para tolerância
    const { data: configs, error: configsError } = await supabase
      .from("cobranca_automacao_config")
      .select(`
        *,
        corretora:corretoras(nome, slug)
      `)
      .eq("ativo", true);

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

    const disparados: string[] = [];
    const erros: string[] = [];

    for (const config of configs) {
      // Verificar se o horário agendado corresponde ao horário atual
      const horaAgendada = config.hora_agendada || "09:00:00";
      const [agendadoHora, agendadoMinuto] = horaAgendada.split(":").map(Number);

      // Verificar se está dentro da janela de 1 minuto (scheduler roda a cada minuto)
      if (currentHour !== agendadoHora || currentMinute !== agendadoMinuto) {
        continue;
      }

      // Verificar se já executou hoje (evitar duplicatas)
      const hoje = new Date().toISOString().split('T')[0];
      const { data: execucoesHoje } = await supabase
        .from("cobranca_automacao_execucoes")
        .select("id")
        .eq("config_id", config.id)
        .eq("tipo_disparo", "agendado")
        .gte("created_at", `${hoje}T00:00:00`)
        .limit(1);

      if (execucoesHoje && execucoesHoje.length > 0) {
        console.log(`[Scheduler] ${config.corretora?.nome || config.corretora_id} já executou hoje, pulando`);
        continue;
      }

      // Verificar credenciais
      if (!config.hinova_user || !config.hinova_pass) {
        console.warn(`[Scheduler] ${config.corretora?.nome || config.corretora_id} sem credenciais configuradas`);
        continue;
      }

      console.log(`[Scheduler] Disparando para ${config.corretora?.nome || config.corretora_id}`);

      try {
        // Criar registro de execução
        const { data: execucao, error: execError } = await supabase
          .from("cobranca_automacao_execucoes")
          .insert({
            config_id: config.id,
            corretora_id: config.corretora_id,
            status: 'executando',
            etapa_atual: 'disparo',
            mensagem: `Execução agendada automática (${horaAgendada} Brasília)`,
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

        // Preparar inputs para o workflow
        const workflowInputs: WorkflowInput = {
          corretora_id: config.corretora_id,
          hinova_url: config.hinova_url,
          hinova_user: config.hinova_user,
          hinova_pass: config.hinova_pass,
          hinova_codigo_cliente: config.hinova_codigo_cliente || '',
          hinova_layout: config.layout_relatorio || '',
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
            hora_agendada: horaAgendada,
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
      erros: erros.length,
      detalhes: {
        disparados,
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
