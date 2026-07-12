// Envia notificações push via OneSignal REST API.
//
// Segmentação por tags gravadas no SDK do portal (src/hooks/useOneSignalPortal.ts):
//   corretora_id, corretora_nome, estado, cidade, tipo ('parceiro' | 'interno')
//
// Segmentos suportados:
//   geral       -> todos os inscritos (included_segments: Total Subscriptions)
//   associacao  -> corretora_ids[] (OR entre elas)
//   localizacao -> estados[] e/ou cidades[] (OR dentro do grupo)
//   tipo        -> tipos[] ('parceiro' | 'interno')
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  titulo: string;
  mensagem: string;
  url?: string;
  imagem_url?: string;
  send_after?: string; // ISO datetime — agendamento
  segmento: "geral" | "associacao" | "localizacao" | "tipo";
  corretora_ids?: string[];
  estados?: string[];
  cidades?: string[];
  tipos?: string[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Autenticação: precisa ser usuário logado (o RLS de push_envios já limita a admins,
    // mas validamos o JWT aqui para registrar o autor).
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData?.user?.id || null;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.titulo?.trim() || !body?.mensagem?.trim()) {
      throw new Error("Título e mensagem são obrigatórios");
    }

    const { data: cfg } = await supabase
      .from("push_config")
      .select("onesignal_app_id, onesignal_rest_api_key, ativo")
      .eq("id", "global")
      .maybeSingle();
    if (!cfg?.ativo || !cfg.onesignal_app_id || !cfg.onesignal_rest_api_key) {
      throw new Error("OneSignal não configurado. Preencha App ID e REST API Key na aba Push.");
    }

    // deno-lint-ignore no-explicit-any
    const payload: any = {
      app_id: cfg.onesignal_app_id,
      headings: { en: body.titulo, pt: body.titulo },
      contents: { en: body.mensagem, pt: body.mensagem },
    };
    if (body.url?.trim()) payload.url = body.url.trim();
    if (body.imagem_url?.trim()) {
      const img = body.imagem_url.trim();
      payload.chrome_web_image = img;  // web push (Chrome/Android)
      payload.big_picture = img;       // Android nativo
      payload.huawei_big_picture = img;
      payload.ios_attachments = { imagem: img }; // iOS
    }
    if (body.send_after?.trim()) {
      const dt = new Date(body.send_after);
      if (!Number.isNaN(dt.getTime()) && dt.getTime() > Date.now()) {
        payload.send_after = dt.toISOString();
      }
    }

    const orTags = (key: string, values: string[]) => {
      // deno-lint-ignore no-explicit-any
      const f: any[] = [];
      values.forEach((v, i) => {
        if (i > 0) f.push({ operator: "OR" });
        f.push({ field: "tag", key, relation: "=", value: v });
      });
      return f;
    };

    switch (body.segmento) {
      case "geral":
        payload.included_segments = ["Total Subscriptions"];
        break;
      case "associacao": {
        const ids = (body.corretora_ids || []).filter(Boolean);
        if (ids.length === 0) throw new Error("Selecione ao menos uma associação");
        // Alvo determinístico: usuários vinculados às associações no NOSSO
        // banco (corretora_usuarios.profile_id = external_id gravado pelo
        // OneSignal.login no portal). Não depende das tags terem sincronizado.
        const { data: vinculados } = await supabase
          .from("corretora_usuarios")
          .select("profile_id")
          .in("corretora_id", ids)
          .eq("ativo", true)
          .not("profile_id", "is", null);
        const externalIds = [...new Set((vinculados || []).map((v) => String(v.profile_id)))];
        if (externalIds.length > 0) {
          payload.include_aliases = { external_id: externalIds };
          payload.target_channel = "push";
        } else {
          // Fallback: segmentação por tag (dispositivos antigos sem vínculo no banco)
          payload.filters = orTags("corretora_id", ids);
        }
        break;
      }
      case "localizacao": {
        const estados = (body.estados || []).filter(Boolean);
        const cidades = (body.cidades || []).filter(Boolean);
        if (estados.length === 0 && cidades.length === 0) throw new Error("Informe estado(s) ou cidade(s)");
        payload.filters = cidades.length > 0 ? orTags("cidade", cidades) : orTags("estado", estados);
        break;
      }
      case "tipo": {
        const tipos = (body.tipos || []).filter(Boolean);
        if (tipos.length === 0) throw new Error("Selecione ao menos um tipo");
        payload.filters = orTags("tipo", tipos);
        break;
      }
      default:
        throw new Error("Segmento inválido");
    }

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${cfg.onesignal_rest_api_key}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));

    const ok = res.ok && json?.id;
    const erro = ok ? null : JSON.stringify(json?.errors || json || `HTTP ${res.status}`);

    await supabase.from("push_envios").insert({
      titulo: body.titulo,
      mensagem: body.mensagem,
      url: body.url || null,
      imagem_url: body.imagem_url || null,
      send_after: payload.send_after || null,
      segmento: body.segmento,
      filtros: {
        corretora_ids: body.corretora_ids || [],
        estados: body.estados || [],
        cidades: body.cidades || [],
        tipos: body.tipos || [],
      },
      onesignal_id: json?.id || null,
      destinatarios: json?.recipients ?? null,
      status: ok ? (payload.send_after ? "agendado" : "enviado") : "erro",
      erro,
      created_by: userId,
    });

    if (!ok) {
      const msg = /not subscribed/i.test(erro || "")
        ? "Nenhum dispositivo inscrito para os destinatários selecionados. O usuário precisa abrir o portal e ACEITAR as notificações no navegador para virar assinante."
        : `OneSignal recusou o envio: ${erro}`;
      throw new Error(msg);
    }

    return new Response(
      JSON.stringify({ success: true, onesignal_id: json.id, destinatarios: json.recipients ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[enviar-push-onesignal]", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
