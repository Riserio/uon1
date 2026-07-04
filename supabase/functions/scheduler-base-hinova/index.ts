import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Scheduler diário da BASE de veículos (Cadastro + Estudo de Base) via API Hinova.
 * Para cada associação com API ativa (usar_api + token), chama importar-api-hinova
 * no módulo "base", que preenche cadastro_registros/estudo_base_registros e dispara
 * a agregação (pid_estudo_base). Sem API não há base — é atualização exclusiva por API.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // associações com API ativa
    const { data: creds } = await supabase
      .from("hinova_credenciais")
      .select("corretora_id, usar_api, api_token")
      .eq("usar_api", true);

    const alvos = (creds || []).filter((c: { usar_api: boolean; api_token: string | null }) => !!c.api_token);
    const resultados: { corretora_id: string; ok: boolean; total?: number; erro?: string }[] = [];

    // sequencial para não sobrecarregar a API da Hinova
    for (const c of alvos) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/importar-api-hinova`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ corretora_id: c.corretora_id, modulo: "base" }),
        });
        const j = await r.json().catch(() => null);
        resultados.push({ corretora_id: c.corretora_id, ok: !!j?.success, total: j?.total, erro: j?.success ? undefined : j?.message });
      } catch (e) {
        resultados.push({ corretora_id: c.corretora_id, ok: false, erro: String((e as Error)?.message || e) });
      }
    }

    const ok = resultados.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ success: true, associacoes: alvos.length, importadas: ok, resultados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
