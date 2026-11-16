// Radar do mercado: troca o link do Google Notícias pelo endereço real da matéria.
// O Google às vezes barra quem abre os links dele ("We're sorry... automated
// queries"); com o link direto a notícia abre no site de origem.
//
// Em duas etapas, porque o Google barra a página da notícia vinda daqui:
//  1. o banco pede a página de cada notícia (mercado_radar_links_pedir, agendado);
//  2. esta função lê a assinatura dessas páginas e pede ao Google o endereço real.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enderecoReal(gid: string, ts: number, sg: string): Promise<string | null> {
  const interno = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    gid, ts, sg,
  ]);
  const r = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", interno, null, "generic"]]]) }),
    signal: AbortSignal.timeout(15_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google respondeu ${r.status}`);
  const m = txt.match(/\\"garturlres\\",\\"(https?:[^"\\]+(?:\\\\.[^"\\]*)*)\\"/);
  return m ? m[1].replace(/\\\\u003d/g, "=").replace(/\\\\u0026/g, "&").replace(/\\\\\//g, "/") : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await s.rpc("mercado_radar_links_assinaturas");
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  let resolvidos = 0, falhas = 0;
  const erros = new Set<string>();
  for (const [i, n] of ((data ?? []) as { id: string; gid: string | null; sg: string | null; ts: number | null }[]).entries()) {
    if (!n.gid || !n.sg || !n.ts) { falhas++; continue; }
    if (i) await pausa(800);
    try {
      const real = await enderecoReal(n.gid, Number(n.ts), n.sg);
      if (real && /^https?:\/\//i.test(real) && !real.includes("news.google.com")) {
        await s.from("mercado_noticias").update({ link: real, link_req_id: null }).eq("id", n.id);
        resolvidos++;
      } else falhas++;
    } catch (e) {
      falhas++;
      erros.add((e as Error).message);
      if ((e as Error).message.includes("429")) break; // Google barrou: tenta na próxima rodada
    }
  }
  const r = { resolvidos, falhas, erros: [...erros] };
  console.log("[radar-resolver-links]", r);
  return Response.json(r, { headers: corsHeaders });
});
