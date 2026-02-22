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

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: "Google OAuth credentials missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    let bodyData: Record<string, unknown> = {};
    
    if (!action && req.method === "POST") {
      bodyData = await req.json();
      action = bodyData.action as string;
    }

    async function authenticateUser() {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { error: "Missing or invalid Authorization header" };
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return { error: "Invalid authentication" };
      return { user };
    }

    // ====== AÇÃO: authorize ======
    if (action === "authorize") {
      const { user, error: authError } = await authenticateUser();
      if (authError || !user)
        return new Response(JSON.stringify({ error: authError || "Invalid user" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=callback`;
      const scope = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email";
      const state = `${user.id}:${crypto.randomUUID()}`;

      // Detect the app origin from the Referer or Origin header for redirect after callback
      const referer = req.headers.get("referer") || req.headers.get("origin") || "";
      let appOrigin = "";
      try {
        const refUrl = new URL(referer);
        appOrigin = refUrl.origin;
      } catch { /* ignore */ }

      // Store app origin in state so callback can redirect back
      const statePayload = `${user.id}:${crypto.randomUUID()}:${appOrigin}`;

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(statePayload)}`;

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== AÇÃO: callback ======
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, "Location": "/agenda" },
        });
      }
      if (!code || !state) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, "Location": "/agenda" },
        });
      }

      // Parse state: userId:uuid:appOrigin
      const stateParts = state.split(":");
      const userId = stateParts[0];
      const appOrigin = stateParts.slice(2).join(":"); // rejoin in case origin has colons
      const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=callback`;
      const redirectBack = appOrigin ? `${appOrigin}/agenda?google_connected=true` : "/agenda?google_connected=true";

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
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, "Location": redirectBack },
        });
      }

      const tokens = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Fetch Google user email
      let googleEmail = null;
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          googleEmail = userInfo.email;
        }
      } catch (e) {
        console.error("Failed to fetch Google user info:", e);
      }

      const { error: dbError } = await supabaseAdmin.from("google_calendar_integrations").upsert(
        {
          user_id: userId,
          google_email: googleEmail,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          label: googleEmail,
          ativo: true,
        },
        { onConflict: "user_id,google_email" }
      );

      if (dbError) {
        console.error("Failed to store tokens:", dbError);
      }

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, "Location": redirectBack },
      });
    }

    // ====== AÇÃO: disconnect (specific account by id) ======
    if (action === "disconnect") {
      const { user, error: authError } = await authenticateUser();
      if (authError || !user)
        return new Response(JSON.stringify({ error: authError || "Invalid user" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const integrationId = bodyData.integration_id as string;
      
      let query = supabaseAdmin.from("google_calendar_integrations").delete().eq("user_id", user.id);
      if (integrationId) {
        query = query.eq("id", integrationId);
      }

      const { error: deleteError } = await query;

      if (deleteError)
        return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== AÇÃO: toggle (enable/disable specific account) ======
    if (action === "toggle") {
      const { user, error: authError } = await authenticateUser();
      if (authError || !user)
        return new Response(JSON.stringify({ error: authError || "Invalid user" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const integrationId = bodyData.integration_id as string;
      const ativo = bodyData.ativo as boolean;

      if (!integrationId) {
        return new Response(JSON.stringify({ error: "integration_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseAdmin
        .from("google_calendar_integrations")
        .update({ ativo })
        .eq("id", integrationId)
        .eq("user_id", user.id);

      if (updateError)
        return new Response(JSON.stringify({ error: "Failed to toggle" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
