// Serve o Web App Manifest dinamicamente. Em vez de um /manifest.json
// estático (que exigiria um novo deploy toda vez que o admin trocasse o
// ícone do app em Configurações > Imagens), essa function lê a linha
// única de public.platform_settings e monta o manifest com os ícones
// atuais — caindo para os PNGs estáticos em /pwa/ quando nada foi
// customizado ainda. O <link rel="manifest"> em index.html aponta pra cá
// de forma fixa (nunca precisa mudar), então o navegador sempre busca o
// manifest fresco nesta function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const host =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      "uon1.com.br";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from("platform_settings")
      .select("app_icon_192_url, app_icon_512_url, app_icon_512_maskable_url")
      .eq("id", "global")
      .maybeSingle();

    const icon192 = data?.app_icon_192_url || `https://${host}/pwa/icon-192.png`;
    const icon512 = data?.app_icon_512_url || `https://${host}/pwa/icon-512.png`;
    const icon512Maskable =
      data?.app_icon_512_maskable_url || `https://${host}/pwa/icon-512-maskable.png`;

    const manifest = {
      name: "Vangard - Portal do Parceiro",
      short_name: "Vangard",
      description: "Portal de indicadores e gestão da associação Vangard.",
      start_url: "/portal",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#F5821F",
      orientation: "portrait-primary",
      icons: [
        { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: icon512Maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/manifest+json; charset=utf-8",
        // Cache curto: reflete uma troca de ícone no admin em poucos minutos,
        // sem sobrecarregar a function a cada carregamento de página.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
