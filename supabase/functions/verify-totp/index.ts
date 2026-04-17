import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Base32 decoding
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

// Generate TOTP secret
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

// TOTP verification using Web Crypto API
async function verifyTOTP(secret: string, token: string, window = 1): Promise<boolean> {
  const keyData = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  
  // Check current time and ±window time steps
  for (let i = -window; i <= window; i++) {
    const time = Math.floor(epoch / timeStep) + i;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setBigUint64(0, BigInt(time), false);
    
    // Create a proper Uint8Array with ArrayBuffer
    const keyBuffer = new Uint8Array(new ArrayBuffer(keyData.length));
    keyBuffer.set(keyData);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer.buffer,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      timeBuffer
    );
    
    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1000000;
    
    const codeStr = code.toString().padStart(6, "0");
    if (codeStr === token) {
      return true;
    }
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();
    
    // Setup TOTP
    if (action === "setup") {
      const { email, forceReset } = await req.json();
      
      if (!email) {
        return new Response(JSON.stringify({ error: "Missing email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, nome")
        .eq("email", email)
        .single();
      
      if (profileError || !profile) {
        console.error("Profile not found:", profileError);
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Check if user already has a TOTP secret configured
      const { data: existingTotp } = await supabaseAdmin
        .from("user_totp")
        .select("secret, enabled")
        .eq("user_id", profile.id)
        .single();
      
      let secret: string;
      
      // Only generate new secret if: no existing secret OR forceReset is true
      if (!existingTotp?.secret || forceReset) {
        secret = generateTOTPSecret();
        
        const { error: upsertError } = await supabaseAdmin.from("user_totp").upsert(
          {
            user_id: profile.id,
            secret: secret,
            enabled: false,
          },
          { onConflict: "user_id" }
        );
        
        if (upsertError) {
          console.error("Error creating TOTP:", upsertError);
          return new Response(JSON.stringify({ error: "Failed to setup TOTP" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Also reset corretora_usuarios totp status if forceReset
        if (forceReset) {
          await supabaseAdmin
            .from("corretora_usuarios")
            .update({ totp_configurado: false, totp_secret: secret })
            .eq("email", email);
        }
      } else {
        // Use existing secret
        secret = existingTotp.secret;
      }
      
      const issuer = "Portal PID";
      const accountName = `${profile.nome} (${email})`;
      const qrCodeUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
      
      console.log("TOTP setup successful for user:", profile.id, "isExisting:", !!existingTotp?.secret && !forceReset);
      return new Response(
        JSON.stringify({ 
          success: true, 
          qrCodeUri, 
          secret,
          isExisting: !!existingTotp?.enabled && !forceReset
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    // Verify TOTP
    const { email, code } = await req.json();
    
    if (!email || !code) {
      return new Response(JSON.stringify({ error: "Missing email or code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();
    
    if (profileError || !profile) {
      console.error("Profile not found:", profileError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const { data: totpData, error: totpError } = await supabaseAdmin
      .from("user_totp")
      .select("secret, enabled")
      .eq("user_id", profile.id)
      .single();
    
    if (totpError || !totpData) {
      console.error("TOTP not found:", totpError);
      return new Response(JSON.stringify({ error: "TOTP not configured" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const isValid = await verifyTOTP(totpData.secret, code, 1);
    
    // If valid and not yet enabled, enable TOTP and update corretora_usuarios
    if (isValid && !totpData.enabled) {
      // Update user_totp table
      await supabaseAdmin
        .from("user_totp")
        .update({ enabled: true })
        .eq("user_id", profile.id);

      // Update corretora_usuarios table to mark TOTP as configured
      const { error: corretoraError } = await supabaseAdmin
        .from("corretora_usuarios")
        .update({ totp_configurado: true })
        .eq("profile_id", profile.id);

      if (corretoraError) {
        console.error("Error updating corretora_usuarios:", corretoraError);
      } else {
        console.log("TOTP enabled and corretora_usuarios updated for user:", profile.id);
      }
    }
    
    console.log("TOTP verification for user:", profile.id, "result:", isValid);
    return new Response(JSON.stringify({ success: true, valid: isValid }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in verify-totp function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
