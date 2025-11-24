import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import speakeasy from "https://esm.sh/speakeasy@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to generate TOTP secret
function generateTOTPSecret(): string {
  // Nota: Para maior robustez, você pode usar:
  // return speakeasy.generateSecret({ encoding: 'base32' }).base32;

  const buffer = new Uint8Array(20);
  crypto.getRandomValues(buffer);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (let i = 0; i < buffer.length; i++) {
    bits += buffer[i].toString(2).padStart(8, "0");
  }
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5).padEnd(5, "0"); // Corrigido substr para substring para evitar erros em alguns ambientes Deno
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

serve(async (req) => {
  // 1. Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Define o cliente Supabase Admin fora do try/catch para melhor legibilidade
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  try {
    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();

    // 2. CORREÇÃO PRINCIPAL: Leitura e validação do JSON body uma única vez
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.error("Error parsing request body:", e);
      // Retorna 400 se o corpo não for JSON válido ou estiver vazio
      return new Response(JSON.stringify({ error: "Invalid or empty request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- ROTA: /verify-totp/setup ---
    if (action === "setup") {
      const { email } = body;

      if (!email) {
        return new Response(JSON.stringify({ error: "Missing email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find user by email
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, nome")
        .eq("email", email)
        .single();

      if (profileError || !profile) {
        console.error("Profile not found:", profileError);
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate new TOTP secret
      const secret = generateTOTPSecret();

      // Create or update TOTP record
      const { error: upsertError } = await supabaseAdmin.from("user_totp").upsert(
        {
          user_id: profile.id,
          secret: secret,
          enabled: false, // Will be enabled after first successful verification
        },
        {
          onConflict: "user_id",
        },
      );

      if (upsertError) {
        console.error("Error creating TOTP:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to setup TOTP in database" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate QR code URI
      const issuer = "Portal PID";
      const accountName = `${profile.nome || profile.id} (${email})`;
      const qrCodeUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

      return new Response(
        JSON.stringify({
          qrCodeUri,
          secret,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- ROTA: /verify-totp ---

    // Se não for 'setup', assume que é a rota de verificação
    const { email, code } = body; // Usa o corpo lido

    if (!email || !code) {
      return new Response(JSON.stringify({ error: "Missing email or code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find user by email in profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (profileError || !profile) {
      console.error("Profile not found:", profileError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get TOTP configuration for this user
    const { data: totpData, error: totpError } = await supabaseAdmin
      .from("user_totp")
      .select("secret, enabled")
      .eq("user_id", profile.id)
      .single();

    if (totpError || !totpData) {
      console.error("TOTP not found:", totpError);
      // Retorna 400 se TOTP não está configurado para o usuário
      return new Response(JSON.stringify({ error: "TOTP not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se o TOTP não estiver habilitado, mas estiver na rota de verificação,
    // significa que o usuário está finalizando a configuração (handleSetupTotp).
    // O frontend é responsável por verificar totpData.enabled.
    // A função de backend deve tentar verificar o código em ambos os casos.
    // Nota: O seu frontend só passa para esta etapa se `isParceiro` for true e a verificação inicial falhar.

    // Verify TOTP code using speakeasy
    const isValid = speakeasy.totp.verify({
      secret: totpData.secret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    // A verificação retorna o status 200 com a validade
    return new Response(JSON.stringify({ valid: isValid }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    // 3. Este catch agora pega APENAS erros lógicos/inesperados do servidor
    console.error("Fatal Error in verify-totp function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, // Non-2xx
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
