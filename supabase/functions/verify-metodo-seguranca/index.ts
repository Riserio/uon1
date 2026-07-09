import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mesmo algoritmo usado no front (Configuracoes.tsx) para gerar o hash da
// palavra-chave: SHA-256("<palavra normalizada>:<corretora_id>"). O
// "corretora_id" funciona como salt simples (evita rainbow tables óbvias
// entre associações diferentes que usem a mesma palavra).
async function hashPalavraChave(palavra: string, corretoraId: string): Promise<string> {
  const normalizada = palavra.trim().toLowerCase();
  const data = new TextEncoder().encode(`${normalizada}:${corretoraId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json();
    const { action, email } = body;

    if (!action || !email) {
      return new Response(JSON.stringify({ error: "Missing action or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve o profile (usuário) e a associação (corretora) vinculada a ele.
    // OBS: alguns profiles de teste têm MAIS DE UM vínculo ativo simultâneo
    // em corretora_usuarios — nesse caso a escolha precisa ser determinística
    // (senão a config de 2FA "muda sozinha" a cada login, dependendo de qual
    // linha o Postgres devolve). Usa a corretora mais recentemente acessada
    // como critério — mesmo critério agora usado em get_user_corretora_id().
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let corretoraId: string | null = null;
    let profileId: string | null = profile?.id ?? null;

    if (profileId) {
      const { data: vinculo } = await supabaseAdmin
        .from("corretora_usuarios")
        .select("corretora_id")
        .eq("profile_id", profileId)
        .eq("ativo", true)
        .order("ultimo_acesso", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      corretoraId = vinculo?.corretora_id ?? null;
    }

    // ===== Determina qual método a associação usa =====
    if (action === "metodo") {
      if (!corretoraId) {
        // Usuário sem associação vinculada (ou não encontrado): cai no
        // padrão histórico (TOTP), que sempre funciona sem depender de
        // configuração adicional.
        return new Response(JSON.stringify({ metodo: "totp", corretoraId: null }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: config } = await supabaseAdmin
        .from("corretora_seguranca_config")
        .select("metodo")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      return new Response(
        JSON.stringify({ metodo: config?.metodo || "totp", corretoraId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===== Valida a palavra-chave digitada =====
    if (action === "palavra-chave") {
      const { palavra } = body;
      if (!palavra || !corretoraId) {
        return new Response(JSON.stringify({ valid: false, error: "Dados insuficientes" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: config } = await supabaseAdmin
        .from("corretora_seguranca_config")
        .select("palavra_chave_hash")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      if (!config?.palavra_chave_hash) {
        return new Response(
          JSON.stringify({ valid: false, error: "Palavra-chave não configurada para esta associação" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const hashDigitado = await hashPalavraChave(palavra, corretoraId);
      const valid = hashDigitado === config.palavra_chave_hash;

      return new Response(JSON.stringify({ valid }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Solicita acesso por dispositivo (aprovação persistente + IP) =====
    // Diferente do modelo antigo (1 pedido por login), agora o dispositivo é
    // identificado por fingerprint e o registro é PERSISTENTE: uma vez
    // aprovado, os próximos logins do mesmo aparelho não pedem aprovação de
    // novo (mesmo padrão do módulo Ponto — dispositivos_ponto). Quando a
    // associação exige IP fixo pra aquele dispositivo (exigir_ip), o IP
    // atual precisa bater com o IP salvo na aprovação.
    if (action === "dispositivo-solicitar") {
      const { deviceInfo, fingerprint } = body;
      const ipAddress =
        body.ip ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        null;

      if (!corretoraId) {
        return new Response(JSON.stringify({ error: "Associação não encontrada para este usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Dispositivo sem fingerprint (navegador bloqueando canvas/etc) —
      // segue no modelo antigo, sempre pede aprovação nova.
      const { data: existente } = fingerprint
        ? await supabaseAdmin
            .from("device_approval_requests")
            .select("id, status, exigir_ip, ip_aprovado")
            .eq("corretora_id", corretoraId)
            .eq("profile_id", profileId)
            .eq("fingerprint", fingerprint)
            .maybeSingle()
        : { data: null };

      if (existente) {
        if (existente.status === "approved") {
          if (existente.exigir_ip && existente.ip_aprovado && existente.ip_aprovado !== ipAddress) {
            return new Response(
              JSON.stringify({
                status: "blocked",
                message: `Este dispositivo só está liberado para o IP ${existente.ip_aprovado}. Seu IP atual é ${ipAddress ?? "desconhecido"} — peça nova aprovação ao administrador.`,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          await supabaseAdmin
            .from("device_approval_requests")
            .update({ ultimo_uso_em: new Date().toISOString(), ip_address: ipAddress, device_info: deviceInfo || null })
            .eq("id", existente.id);
          return new Response(JSON.stringify({ status: "approved", requestId: existente.id }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (existente.status === "blocked") {
          return new Response(
            JSON.stringify({ status: "blocked", message: "Este dispositivo foi bloqueado pelo administrador." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // pending / denied / expired -> reabre como pendente e atualiza dados
        await supabaseAdmin
          .from("device_approval_requests")
          .update({
            status: "pending",
            device_info: deviceInfo || null,
            ip_address: ipAddress,
            requested_at: new Date().toISOString(),
            resolved_at: null,
            resolved_by: null,
          })
          .eq("id", existente.id);
        return new Response(JSON.stringify({ status: "pending", requestId: existente.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: created, error: insertError } = await supabaseAdmin
        .from("device_approval_requests")
        .insert({
          corretora_id: corretoraId,
          profile_id: profileId,
          email,
          device_info: deviceInfo || null,
          fingerprint: fingerprint || null,
          ip_address: ipAddress,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError || !created) {
        console.error("Erro ao criar solicitação de dispositivo:", insertError);
        return new Response(JSON.stringify({ error: "Falha ao criar solicitação" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ status: "pending", requestId: created.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Consulta o status de uma solicitação (usado no polling) =====
    if (action === "dispositivo-status") {
      const { requestId } = body;
      if (!requestId) {
        return new Response(JSON.stringify({ error: "Missing requestId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: reqRow } = await supabaseAdmin
        .from("device_approval_requests")
        .select("status")
        .eq("id", requestId)
        .maybeSingle();

      return new Response(JSON.stringify({ status: reqRow?.status || "expired" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in verify-metodo-seguranca function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
