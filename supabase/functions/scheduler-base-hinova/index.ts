import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Scheduler da BASE de veículos (Cadastro + Estudo de Base) via API Hinova.
 * Roda a cada 15 minutos e, para cada associação com API ativa (usar_api + token),
 * chama importar-api-hinova no módulo "base" APENAS se a última importação foi
 * há mais que `api_intervalo_horas` (default 24h). Respeita `dias_agendados`
 * (0=dom .. 6=sab, em horário de Brasília) quando preenchido.
 * Body { forcar: true } ignora intervalo/dias e força a importação.
 *
 * LOG (integracao_sync_log): toda TENTATIVA real de importação passa a ser
 * registrada — sucesso e, principalmente, FALHA com a mensagem devolvida pela
 * API. Antes o módulo "base" falhava em silêncio: o cron marcava "succeeded"
 * (porque a chamada HTTP respondia 200) e nenhuma importação nova entrava, sem
 * deixar rastro em lugar nenhum. Foi assim que a base de 3 associações ficou
 * parada em 02/08/2026 sem ninguém perceber. Os "pulados" (fora de horário,
 * dedup) NÃO são logados, para o log conter só o que interessa investigar.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Grava uma linha no log de integração. Nunca deixa um erro de log derrubar
  // a importação em si.
  const logSync = async (
    corretoraId: string,
    sucesso: boolean,
    total?: number | null,
    mensagem?: string | null,
    detalhe?: unknown,
  ) => {
    try {
      await supabase.from("integracao_sync_log").insert({
        corretora_id: corretoraId,
        modulo: "base",
        sucesso,
        total: typeof total === "number" ? total : null,
        mensagem: mensagem ? String(mensagem).slice(0, 500) : null,
        detalhe: detalhe ? (detalhe as Record<string, unknown>) : null,
      });
    } catch (e) {
      console.error("[SchedulerBase] falha ao gravar log:", e);
    }
  };

  let forcar = false;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      forcar = !!body?.forcar;
    }
  } catch { /* ignore */ }

  try {
    const { data: creds } = await supabase
      .from("hinova_credenciais")
      .select("corretora_id, usar_api, api_token, api_intervalo_horas, dias_agendados, horarios_sync")
      .eq("usar_api", true);

    const alvos = (creds || []).filter(
      (c: { usar_api: boolean; api_token: string | null }) => !!c.api_token,
    );

    // Dia da semana em Brasília (UTC-3, sem DST atualmente)
    const brtMs = Date.now() - 3 * 60 * 60 * 1000;
    const diaSemanaBrt = new Date(brtMs).getUTCDay(); // 0..6

    const resultados: {
      corretora_id: string;
      ok: boolean;
      total?: number;
      erro?: string;
      pulado?: string;
    }[] = [];

    for (const c of alvos) {
      const intervaloHoras = Number((c as any).api_intervalo_horas) || 24;
      const diasAgendados: number[] | null = (c as any).dias_agendados ?? null;

      if (!forcar) {
        if (
          diasAgendados &&
          Array.isArray(diasAgendados) &&
          diasAgendados.length > 0 &&
          !diasAgendados.includes(diaSemanaBrt)
        ) {
          resultados.push({ corretora_id: c.corretora_id, ok: false, pulado: "fora-dos-dias-agendados" });
          continue;
        }

        // Só importa nas horas configuradas (horarios_sync, em Brasília; default
        // 8/14). O cron roda de hora em hora e o scheduler filtra pela hora.
        const horariosSync: number[] = Array.isArray((c as any).horarios_sync) && (c as any).horarios_sync.length > 0
          ? (c as any).horarios_sync
          : [8, 14];
        const horaBrt = new Date(Date.now() - 3 * 3_600_000).getUTCHours();
        if (!horariosSync.includes(horaBrt)) {
          resultados.push({ corretora_id: c.corretora_id, ok: false, pulado: `fora-dos-horarios (${horaBrt}h)` });
          continue;
        }

        const { data: ultima } = await supabase
          .from("estudo_base_importacoes")
          .select("created_at")
          .eq("corretora_id", c.corretora_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ultima?.created_at) {
          // Dedup: não reimporta duas vezes na mesma hora (o QUANDO é decidido
          // por horarios_sync). Não depende mais do api_intervalo_horas.
          const diffMin = (Date.now() - new Date(ultima.created_at).getTime()) / 60000;
          if (diffMin < 50) {
            resultados.push({ corretora_id: c.corretora_id, ok: false, pulado: "dedup-mesma-hora" });
            continue;
          }
        }
      }

      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/importar-api-hinova`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ corretora_id: c.corretora_id, modulo: "base" }),
        });
        const j = await r.json().catch(() => null);
        const ok = !!j?.success;
        const msg = ok ? null : (j?.message ?? `HTTP ${r.status} sem mensagem`);
        resultados.push({
          corretora_id: c.corretora_id,
          ok,
          total: j?.total,
          erro: ok ? undefined : msg,
        });
        // Registra a tentativa (sucesso e falha) para dar rastro ao que antes
        // era silencioso.
        await logSync(c.corretora_id, ok, j?.total ?? null, msg, {
          http_status: r.status,
          endpoint: j?.endpoint ?? null,
          tentativas: j?.tentativas ?? null,
        });
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        resultados.push({ corretora_id: c.corretora_id, ok: false, erro: msg });
        await logSync(c.corretora_id, false, null, msg, { excecao: true });
      }
    }

    const ok = resultados.filter((r) => r.ok).length;
    const pulados = resultados.filter((r) => r.pulado).length;
    return new Response(
      JSON.stringify({ success: true, associacoes: alvos.length, importadas: ok, pulados, forcar, resultados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
