import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const _anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const { data: cred } = await supabase.from("hinova_credenciais")
    .select("api_token, api_base_url, hinova_user, hinova_pass").eq("corretora_id", body.corretora_id).maybeSingle();
  const base = (cred?.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");
  const auth = await (await fetch(`${base}/usuario/autenticar`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred!.api_token}` },
    body: JSON.stringify({ usuario: cred!.hinova_user, senha: cred!.hinova_pass }),
  })).json();
  const token = auth?.token_usuario;
  if (!token) return new Response(JSON.stringify({ error: "falha auth", auth }), { headers: corsHeaders });
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const out: Record<string, unknown> = {};

  if (!body.skip_lists) {
  const vr = await fetch(`${base}/listar/veiculo`, { method: "POST", headers: H, body: JSON.stringify({ codigo_situacao: "1", pagina: "1" }) });
  const vj = await vr.json().catch(() => null);
  const varr = Array.isArray(vj) ? vj : (vj?.veiculos || vj?.dados || vj?.data || []);
  out.veiculo_status = vr.status;
  out.veiculo_keys = varr?.[0] ? Object.keys(varr[0]) : null;

  const ar = await fetch(`${base}/listar/associado`, { method: "POST", headers: H, body: JSON.stringify({ codigo_situacao: "1", pagina: "1" }) });
  const aj = await ar.json().catch(() => null);
  const aarr = Array.isArray(aj) ? aj : (aj?.associados || aj?.dados || aj?.data || []);
  out.associado_status = ar.status;
  out.associado_keys = aarr?.[0] ? Object.keys(aarr[0]) : null;
  }

  const probes: string[] = Array.isArray(body.probes) ? body.probes : [];
  const probeRes: Record<string, unknown> = {};
  for (const p of probes) {
    for (const method of ["POST"]) {
      try {
        const r = await fetch(`${base}${p}`, { method, headers: H, ...(method === "POST" ? { body: JSON.stringify({ pagina: "1" }) } : {}) });
        const t = (await r.text()).slice(0, 400);
        probeRes[`${method} ${p}`] = { status: r.status, body: t };
      } catch (e) { probeRes[`${method} ${p}`] = { erro: String(e) }; }
    }
  }
  out.probes = probeRes;
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
