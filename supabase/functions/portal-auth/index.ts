import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

function base32Decode(secret: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";

  for (const char of secret.toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }

  return bytes;
}

function generateTOTPSecret(): string {
  const buffer = new Uint8Array(20);
  crypto.getRandomValues(buffer);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";

  for (let i = 0; i < buffer.length; i++) {
    bits += buffer[i].toString(2).padStart(8, "0");
  }

  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substr(i, 5).padEnd(5, "0");
    result += alphabet[parseInt(chunk, 2)];
  }

  return result;
}

async function validateTOTP(secret: string, token: string, window = 1): Promise<boolean> {
  const keyData = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = 30;

  for (let i = -window; i <= window; i++) {
    const time = Math.floor(epoch / timeStep) + i;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setBigUint64(0, BigInt(time), false);

    const keyBuffer = new Uint8Array(new ArrayBuffer(keyData.length));
    keyBuffer.set(keyData);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer.buffer,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, timeBuffer);
    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1000000;

    if (code.toString().padStart(6, "0") === token) {
      return true;
    }
  }

  return false;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();

    if (action === "login") {
      const { slug, email, password, totpCode } = await req.json();

      const { data: corretora } = await supabaseClient
        .from("corretoras")
        .select("id, nome, slug")
        .eq("slug", slug)
        .single();

      if (!corretora) {
        return new Response(JSON.stringify({ error: "Corretora não encontrada" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      const normalizedEmail = String(email ?? "").trim().toLowerCase();

      const { data: usuario } = await supabaseClient
        .from("corretora_usuarios")
        .select("*")
        .eq("corretora_id", corretora.id)
        .eq("email", normalizedEmail)
        .eq("ativo", true)
        .single();

      if (!usuario) {
        return new Response(JSON.stringify({ error: "Credenciais inválidas" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      const senhaValida = compareSync(password, usuario.senha_hash);
      if (!senhaValida) {
        return new Response(JSON.stringify({ error: "Credenciais inválidas" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      await supabaseClient
        .from("corretora_usuarios")
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq("id", usuario.id);

      if (!usuario.totp_configurado) {
        return new Response(
          JSON.stringify({
            needsTotp: true,
            requiresSetup: true,
            userId: usuario.id,
            message: "Configure o Google Authenticator primeiro",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      if (!totpCode) {
        return new Response(
          JSON.stringify({
            needsTotp: true,
            requiresSetup: false,
            userId: usuario.id,
            message: "Informe o código do Google Authenticator",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      const totpValido = await validateTOTP(usuario.totp_secret, String(totpCode));

      if (!totpValido) {
        return new Response(JSON.stringify({ error: "Código TOTP inválido" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      const jwtSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const encoder = new TextEncoder();
      const keyData = encoder.encode(jwtSecret);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign", "verify"]
      );

      const jwt = await create(
        { alg: "HS512", typ: "JWT" },
        {
          userId: usuario.id,
          corretoraId: corretora.id,
          slug: corretora.slug,
          exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        },
        key
      );

      return new Response(
        JSON.stringify({
          token: jwt,
          corretora: {
            id: corretora.id,
            nome: corretora.nome,
            slug: corretora.slug,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "configure-totp") {
      const { userId } = await req.json();

      const { data: usuario } = await supabaseClient
        .from("corretora_usuarios")
        .select("*")
        .eq("id", userId)
        .single();

      if (!usuario) {
        return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      const secret = generateTOTPSecret();

      const { data: corretora } = await supabaseClient
        .from("corretoras")
        .select("nome")
        .eq("id", usuario.corretora_id)
        .single();

      const issuer = corretora?.nome || "Portal PID";
      const qrCodeUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(usuario.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

      await supabaseClient
        .from("corretora_usuarios")
        .update({
          totp_secret: secret,
          totp_configurado: true,
        })
        .eq("id", userId);

      return new Response(
        JSON.stringify({
          secret,
          qrCodeUri,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação não encontrada" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});