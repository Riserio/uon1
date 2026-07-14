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
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

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
      .select("corretora_id, usar_api, api_token, api_intervalo_horas, dias_agendados")
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

        const { data: ultima } = await supabase
          .from("estudo_base_importacoes")
          .select("created_at")
          .eq("corretora_id", c.corretora_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ultima?.created_at) {
          const diffHoras = (Date.now() - new Date(ultima.created_at).getTime()) / 3_600_000;
          if (diffHoras < intervaloHoras) {
            resultados.push({
              corretora_id: c.corretora_id,
              ok: false,
              pulado: `intervalo-nao-atingido (${diffHoras.toFixed(1)}h / ${intervaloHoras}h)`,
            });
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
        resultados.push({
          corretora_id: c.corretora_id,
          ok: !!j?.success,
          total: j?.total,
          erro: j?.success ? undefined : j?.message,
        });
      } catch (e) {
        resultados.push({ corretora_id: c.corretora_id, ok: false, erro: String((e as Error)?.message || e) });
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
