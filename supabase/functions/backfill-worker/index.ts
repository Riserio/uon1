import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISPATCH_FN: Record<string, string> = {
  cobranca: "disparar-github-workflow",
  eventos: "disparar-sga-workflow",
  mgf: "disparar-mgf-workflow",
};

const EXEC_TABLE: Record<string, string> = {
  cobranca: "cobranca_automacao_execucoes",
  eventos: "sga_automacao_execucoes",
  mgf: "mgf_automacao_execucoes",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1) Sincronizar status de jobs já em execução
    const { data: executing } = await supabase
      .from("backfill_jobs")
      .select("id, modulo, execucao_id, corretora_id, iniciado_em")
      .eq("status", "executando")
      .not("execucao_id", "is", null);

    for (const job of executing || []) {
      const table = EXEC_TABLE[job.modulo];
      if (!table) continue;
      const { data: exec } = await supabase
        .from(table)
        .select("status, erro, registros_processados, finalizado_at, etapa_atual, progresso_download")
        .eq("id", job.execucao_id)
        .maybeSingle();

      if (!exec) continue;

      // Timeout de segurança: 60 minutos sem terminar = falha
      const startedAt = job.iniciado_em ? new Date(job.iniciado_em).getTime() : Date.now();
      const elapsedMin = (Date.now() - startedAt) / 60000;

      if (exec.status === 'sucesso') {
        await supabase.from("backfill_jobs").update({
          status: 'concluido',
          progresso: 100,
          registros_importados: exec.registros_processados ?? null,
          concluido_em: exec.finalizado_at || new Date().toISOString(),
        }).eq("id", job.id);
      } else if (exec.status === 'erro' || exec.status === 'parado') {
        await supabase.from("backfill_jobs").update({
          status: 'falhou',
          erro: exec.erro || 'Execução interrompida',
          concluido_em: exec.finalizado_at || new Date().toISOString(),
        }).eq("id", job.id);
      } else if (elapsedMin > 60) {
        await supabase.from("backfill_jobs").update({
          status: 'falhou',
          erro: 'Tempo limite excedido (60 min)',
          concluido_em: new Date().toISOString(),
        }).eq("id", job.id);
      } else {
        // atualizar progresso aproximado pela etapa
        const stepProgress: Record<string, number> = {
          LOGIN: 15, NAVEGACAO: 25, NAVEGACAO_RELATORIO: 30,
          FILTROS: 40, DOWNLOAD: 60, PROCESSANDO: 80, ENVIANDO: 90, CONCLUIDO: 99
        };
        const step = (exec.etapa_atual || '').toUpperCase();
        const pct = exec.progresso_download ?? stepProgress[step] ?? 10;
        await supabase.from("backfill_jobs").update({ progresso: pct }).eq("id", job.id);
      }
    }

    // 2) Identificar associações disponíveis (sem job 'executando') e claim o próximo pendente
    const { data: pending } = await supabase
      .from("backfill_jobs")
      .select("corretora_id")
      .eq("status", "pendente")
      .order("created_at", { ascending: true });

    const corretorasParaProcessar = Array.from(new Set((pending || []).map((j: any) => j.corretora_id)));
    const claimed: any[] = [];

    for (const corretoraId of corretorasParaProcessar) {
      // claim_next_backfill_job só retorna se não houver 'executando' para esta corretora
      const { data: job } = await supabase.rpc("claim_next_backfill_job", { _corretora_id: corretoraId });
      if (!job || !job.id) continue;
      claimed.push(job);
    }

    // 3) Disparar cada job claimed (chama a função de dispatch correspondente)
    const results: any[] = [];
    for (const job of claimed) {
      const fn = DISPATCH_FN[job.modulo];
      if (!fn) {
        await supabase.from("backfill_jobs").update({
          status: 'falhou', erro: `Módulo desconhecido: ${job.modulo}`,
          concluido_em: new Date().toISOString(),
        }).eq("id", job.id);
        continue;
      }

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          },
          body: JSON.stringify({
            action: 'dispatch',
            corretora_id: job.corretora_id,
            data_inicio: job.data_inicio,
            data_fim: job.data_fim,
            bypass_daily_limit: true,
            backfill_job_id: job.id,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.success) {
          await supabase.from("backfill_jobs").update({
            status: 'falhou',
            erro: data?.message || `HTTP ${resp.status}`,
            concluido_em: new Date().toISOString(),
          }).eq("id", job.id);
          results.push({ job_id: job.id, ok: false, error: data?.message });
        } else {
          await supabase.from("backfill_jobs").update({
            execucao_id: data.execucao_id,
            github_run_id: data.github_run_id || null,
            github_run_url: data.github_run_url || null,
            progresso: 10,
          }).eq("id", job.id);
          results.push({ job_id: job.id, ok: true, execucao_id: data.execucao_id });
        }
      } catch (e: any) {
        await supabase.from("backfill_jobs").update({
          status: 'falhou',
          erro: e?.message || 'Erro de rede',
          concluido_em: new Date().toISOString(),
        }).eq("id", job.id);
        results.push({ job_id: job.id, ok: false, error: e?.message });
      }
    }

    return new Response(JSON.stringify({
      synced: executing?.length || 0,
      dispatched: results.length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[backfill-worker] erro:", e);
    return new Response(JSON.stringify({ error: e?.message || 'erro' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});