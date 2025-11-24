import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import speakeasy from "https://esm.sh/speakeasy@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to generate TOTP secret
function generateTOTPSecret(): string {
  const buffer = new Uint8Array(20);
  crypto.getRandomValues(buffer);
  // Convert to base32
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < buffer.length; i++) {
    bits += buffer[i].toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substr(i, 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create admin Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    // Setup TOTP - generate QR code
    if (action === 'setup') {
      const { email } = await req.json();

      if (!email) {
        return new Response(
          JSON.stringify({ error: "Missing email" }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Find user by email
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, nome')
        .eq('email', email)
        .single();

      if (profileError || !profile) {
        console.error('Profile not found:', profileError);
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Generate new TOTP secret
      const secret = generateTOTPSecret();
      
      // Create or update TOTP record
      const { error: upsertError } = await supabaseAdmin
        .from('user_totp')
        .upsert({
          user_id: profile.id,
          secret: secret,
          enabled: false // Will be enabled after first successful verification
        }, {
          onConflict: 'user_id'
        });

      if (upsertError) {
        console.error('Error creating TOTP:', upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to setup TOTP" }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Generate QR code URI
      const issuer = 'Portal PID';
      const accountName = `${profile.nome} (${email})`;
      const qrCodeUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

      return new Response(
        JSON.stringify({ 
          qrCodeUri,
          secret
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify TOTP code
    const { email, code } = await req.json();

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "Missing email or code" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Find user by email in profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get TOTP configuration for this user
    const { data: totpData, error: totpError } = await supabaseAdmin
      .from('user_totp')
      .select('secret, enabled')
      .eq('user_id', profile.id)
      .single();

    if (totpError || !totpData) {
      console.error('TOTP not found:', totpError);
      return new Response(
        JSON.stringify({ error: "TOTP not configured" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!totpData.enabled) {
      return new Response(
        JSON.stringify({ error: "TOTP not configured" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify TOTP code using speakeasy
    const isValid = speakeasy.totp.verify({
      secret: totpData.secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    return new Response(
      JSON.stringify({ valid: isValid }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in verify-totp function:', error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
