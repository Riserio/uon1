// Serve uma página com meta tags Open Graph para preview ao compartilhar
// o link de um formulário público. Bots recebem HTML com OG; humanos são
// redirecionados para a página real do formulário (/f/:slug) no host
// indicado por ?host= (ou no host original do request, quando possível).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BOT_REGEX =
  /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|TelegramBot|Discordbot|Pinterest|Googlebot|Embedly|redditbot|Applebot|SkypeUriPreview|vkShare|W3C_Validator|Iframely)/i;

function esc(s: string | null | undefined) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const hostParam = url.searchParams.get("host");
    if (!slug) {
      return new Response("missing slug", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: form } = await supabase
      .from("formularios")
      .select(
        "titulo, descricao, slug, status, logo_url, cor_tema, corretora_id",
      )
      .eq("slug", slug)
      .eq("status", "publicado")
      .maybeSingle();

    let corretora: any = null;
    if (form?.corretora_id) {
      const { data: c } = await supabase
        .from("corretoras")
        .select(
          "nome, slug, logo_url, logo_expanded_url, og_titulo, og_descricao, og_imagem_url",
        )
        .eq("id", form.corretora_id)
        .maybeSingle();
      corretora = c;
    }

    const host =
      hostParam ||
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      "uon1.com.br";

    const destino = `https://${host}/f/${slug}`;

    // Padrão institucional: Vangard (administradora da plataforma)
    const VANGARD_NOME = "Vangard";
    const VANGARD_LOGO = `https://${host}/images/vangard-logo.png`;

    const titulo = corretora?.og_titulo || VANGARD_NOME;
    const descricao =
      corretora?.og_descricao ||
      form?.descricao ||
      form?.titulo ||
      "Preencha o formulário online.";
    const imagem = corretora?.og_imagem_url || VANGARD_LOGO;
    const siteName = corretora?.og_titulo || VANGARD_NOME;

    const ua = req.headers.get("user-agent") || "";
    const isBot = BOT_REGEX.test(ua);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}" />
<link rel="canonical" href="${esc(destino)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(siteName)}" />
<meta property="og:title" content="${esc(titulo)}" />
<meta property="og:description" content="${esc(descricao)}" />
<meta property="og:url" content="${esc(destino)}" />
<meta property="og:image" content="${esc(imagem)}" />
<meta property="og:image:alt" content="${esc(titulo)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(titulo)}" />
<meta name="twitter:description" content="${esc(descricao)}" />
<meta name="twitter:image" content="${esc(imagem)}" />
${isBot ? "" : `<meta http-equiv="refresh" content="0; url=${esc(destino)}" />`}
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;color:#111;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{max-width:420px;padding:32px;text-align:center}
  img{max-height:56px;margin-bottom:16px}
  h1{font-size:20px;margin:0 0 8px}
  p{font-size:14px;color:#666;margin:0 0 16px}
  a{color:${esc(form?.cor_tema || "#362C89")};text-decoration:none;font-weight:600}
</style>
</head>
<body>
  <div class="card">
    <img src="${esc(imagem)}" alt="${esc(titulo)}" />
    <h1>${esc(titulo)}</h1>
    <p>${esc(descricao)}</p>
    <a href="${esc(destino)}">Abrir formulário →</a>
  </div>
  ${isBot ? "" : `<script>location.replace(${JSON.stringify(destino)});</script>`}
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (e: any) {
    return new Response(`error: ${e?.message || e}`, { status: 500 });
  }
});