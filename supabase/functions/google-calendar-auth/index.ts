import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ====== DEBUG - VERIFICAÇÃO DE VARIÁVEIS ======
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("Google OAuth credentials missing or incorrect");
      return new Response(
        JSON.stringify({
          error: "Google OAuth credentials missing or incorrect",
          client_id_present: !!GOOGLE_CLIENT_ID,
          client_secret_present: !!GOOGLE_CLIENT_SECRET,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    if (!action && req.method === "POST") {
      const body = await req.json();
      action = body.action;
    }

    // ====== FUNÇÃO AUXILIAR: AUTENTICA USUÁRIO ======
    async function authenticateUser() {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { error: "Missing or invalid Authorization header" };
      }

      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);
      if (error || !user) return { error: "Invalid authentication" };
      return { user };
    }

    // ====== AÇÃO: authorize ======
    if (action === "authorize") {
      const { user, error: authError } = await authenticateUser();
      if (authError || !user)
        return new Response(JSON.stringify({ error: authError || "Invalid user" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const userId = user.id;
      const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=callback`;
      const scope = "https://www.googleapis.com/auth/calendar";
      const state = `${userId}:${crypto.randomUUID()}`;

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${state}`;

      // ===== DEBUG: MOSTRA PARCIALMENTE O CLIENT_ID =====
      console.log(`authorize requested - user: ${userId}, client_id: ${GOOGLE_CLIENT_ID.slice(0, 10)}...`);

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== AÇÃO: callback ======
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error)
        return new Response(`<html><body><script>window.close();</script><p>Autorização cancelada.</p></body></html>`, {
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        });
      if (!code || !state || !state.includes(":"))
        return new Response(`<html><body><script>window.close();</script><p>Erro na autorização.</p></body></html>`, {
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        });

      const userId = state.split(":")[0];
      const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=callback`;

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error("Token exchange failed:", errorData);
        return new Response(`<html><body><script>window.close();</script><p>Falha ao conectar.</p></body></html>`, {
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        });
      }

      const tokens = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Use service role client to bypass RLS for callback (no user token available)
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: dbError } = await supabaseAdmin.from("google_calendar_integrations").upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
      });

      if (dbError) {
        console.error("Failed to store tokens:", dbError);
        return new Response(
          `<html><body><script>window.close();</script><p>Erro ao salvar credenciais.</p></body></html>`,
          { headers: { ...corsHeaders, "Content-Type": "text/html" } },
        );
      }

      return new Response(`<html><body><script>window.close();</script><p>Conectado com sucesso!</p></body></html>`, {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    // ====== AÇÃO: disconnect ======
    if (action === "disconnect") {
      const { user, error: authError } = await authenticateUser();
      if (authError || !user)
        return new Response(JSON.stringify({ error: authError || "Invalid user" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const userId = user.id;
      const { error: deleteError } = await supabase.from("google_calendar_integrations").delete().eq("user_id", userId);

      if (deleteError)
        return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: "Internal server error", details: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
