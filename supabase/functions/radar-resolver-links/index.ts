// Radar do mercado: troca o link do Google Notícias pelo endereço real da matéria.
// O Google bloqueia quem abre muitos links dele ("We're sorry... automated
// queries") — com o link direto, a notícia abre no site de origem.
// Chamado pelo agendamento logo depois da coleta; cada chamada resolve poucas
// notícias, com pausa entre elas, para não ser barrado pelo Google.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const POR_CHAMADA = 15;
const MAX_TENTATIVAS = 5;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

function idGoogle(link: string): string | null {
  const m = link.match(/^https?:\/\/news\.google\.com\/(?:rss\/)?articles\/([^?#/]+)/i);
  return m ? m[1] : null;
}

/** Formato antigo: o endereço vem dentro do próprio id (base64). */
function decodificarAntigo(id: string): string | null {
  try {
    const b = atob(id.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((id.length + 3) % 4));
    const m = b.match(/https?:\/\/[\x21-\x7e]+/);
    if (m && !b.includes("AU_yqL")) return m[0].replace(/[\x00-\x1f\xd2].*$/, "");
  } catch { /* formato novo */ }
  return null;
}

async function resolver(id: string): Promise<string | null> {
  const antigo = decodificarAntigo(id);
  if (antigo) return antigo;
  const pag = await fetch(`https://news.google.com/rss/articles/${id}`, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(15_000) });
  const html = await pag.text();
  if (!pag.ok) throw new Error(`Google respondeu ${pag.status}`);
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) throw new Error("página do Google sem assinatura");
  const interno = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id, Number(ts), sg,
  ]);
  const r = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", interno, null, "generic"]]]) }),
    signal: AbortSignal.timeout(15_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google respondeu ${r.status}`);
  const m = txt.match(/\\"garturlres\\",\\"(https?:[^\\"]+)\\"/);
  return m ? JSON.parse(`"${m[1]}"`) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await s
    .from("mercado_noticias")
    .select("id, link, link_tentativas")
    .like("link", "https://news.google.com/%")
    .lt("link_tentativas", MAX_TENTATIVAS)
    .order("publicado_em", { ascending: false })
    .limit(POR_CHAMADA);
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  let resolvidos = 0, falhas = 0;
  const erros: string[] = [];
  for (const [i, n] of (data ?? []).entries()) {
    if (i) await pausa(1500);
    const id = idGoogle(n.link);
    let real: string | null = null;
    try {
      real = id ? await resolver(id) : null;
    } catch (e) {
      erros.push((e as Error).message);
    }
    if (real && /^https?:\/\//i.test(real) && !real.includes("news.google.com")) {
      await s.from("mercado_noticias").update({ link: real }).eq("id", n.id);
      resolvidos++;
    } else {
      await s.from("mercado_noticias").update({ link_tentativas: (n.link_tentativas ?? 0) + 1 }).eq("id", n.id);
      falhas++;
      if (erros.at(-1)?.includes("429")) break; // Google barrou: tenta na próxima rodada
    }
  }
  console.log("[radar-resolver-links]", { resolvidos, falhas, erros: [...new Set(erros)] });
  return Response.json({ resolvidos, falhas, erros: [...new Set(erros)] }, { headers: corsHeaders });
});
