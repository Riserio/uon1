import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync, hashSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// Função para gerar secret TOTP
function generateTOTPSecret(): string {
  const buffer = new Uint8Array(20);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Função para validar TOTP
function validateTOTP(secret: string, token: string): boolean {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  const counter = Math.floor(epoch / timeStep);
  
  // Verificar token atual e adjacentes (window = 1)
  for (let i = -1; i <= 1; i++) {
    const testCounter = counter + i;
    const calculatedToken = generateTOTPToken(secret, testCounter);
    if (calculatedToken === token) {
      return true;
    }
  }
  return false;
}

function generateTOTPToken(secret: string, counter: number): string {
  // Implementação simplificada de TOTP (RFC 6238)
  const key = base32Decode(secret);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(counter), false);
  
  const hmac = createHMAC(key, new Uint8Array(buffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) |
                 ((hmac[offset + 1] & 0xff) << 16) |
                 ((hmac[offset + 2] & 0xff) << 8) |
                 (hmac[offset + 3] & 0xff);
  
  const otp = binary % 1000000;
  return String(otp).padStart(6, '0');
}

function base32Decode(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  base32 = base32.toUpperCase().replace(/=+$/, '');
  const bits = base32.split('').map(c => {
    const val = alphabet.indexOf(c);
    return val === -1 ? 0 : val;
  }).map(v => v.toString(2).padStart(5, '0')).join('');
  
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return new Uint8Array(bytes);
}

function createHMAC(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  if (key.length > blockSize) {
    key = sha1(key);
  }
  if (key.length < blockSize) {
    const paddedKey = new Uint8Array(blockSize);
    paddedKey.set(key);
    key = paddedKey;
  }
  
  const opad = new Uint8Array(blockSize);
  const ipad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    opad[i] = 0x5c ^ key[i];
    ipad[i] = 0x36 ^ key[i];
  }
  
  const innerHash = sha1(concat(ipad, message));
  return sha1(concat(opad, innerHash));
}

function sha1(data: Uint8Array): Uint8Array {
  // Implementação simplificada de SHA-1
  // Para produção, use crypto.subtle.digest
  const h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
  const padded = padSHA1(data);
  
  for (let i = 0; i < padded.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) {
      w[j] = (padded[i + j * 4] << 24) |
             (padded[i + j * 4 + 1] << 16) |
             (padded[i + j * 4 + 2] << 8) |
             padded[i + j * 4 + 3];
    }
    
    for (let j = 16; j < 80; j++) {
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    }
    
    let [a, b, c, d, e] = h;
    
    for (let j = 0; j < 80; j++) {
      const [f, k] = j < 20 ? [(b & c) | (~b & d), 0x5A827999] :
                     j < 40 ? [b ^ c ^ d, 0x6ED9EBA1] :
                     j < 60 ? [(b & c) | (b & d) | (c & d), 0x8F1BBCDC] :
                     [b ^ c ^ d, 0xCA62C1D6];
      
      const temp = (rotl(a, 5) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
  }
  
  const result = new Uint8Array(20);
  for (let i = 0; i < 5; i++) {
    result[i * 4] = (h[i] >>> 24) & 0xff;
    result[i * 4 + 1] = (h[i] >>> 16) & 0xff;
    result[i * 4 + 2] = (h[i] >>> 8) & 0xff;
    result[i * 4 + 3] = h[i] & 0xff;
  }
  return result;
}

function padSHA1(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8;
  const paddingLength = (56 - (data.length + 1) % 64 + 64) % 64;
  const padded = new Uint8Array(data.length + 1 + paddingLength + 8);
  padded.set(data);
  padded[data.length] = 0x80;
  
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, BigInt(bitLength), false);
  return padded;
}

function rotl(n: number, b: number): number {
  return (n << b) | (n >>> (32 - b));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    if (action === 'login') {
      const { slug, email, password, totpCode } = await req.json();

      // Buscar corretora pelo slug
      const { data: corretora } = await supabaseClient
        .from('corretoras')
        .select('id, nome, slug')
        .eq('slug', slug)
        .single();

      if (!corretora) {
        return new Response(
          JSON.stringify({ error: 'Corretora não encontrada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Buscar usuário
      const { data: usuario } = await supabaseClient
        .from('corretora_usuarios')
        .select('*')
        .eq('corretora_id', corretora.id)
        .eq('email', email)
        .eq('ativo', true)
        .single();

      if (!usuario) {
        return new Response(
          JSON.stringify({ error: 'Credenciais inválidas' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // Verificar senha
      const senhaValida = compareSync(password, usuario.senha_hash);
      if (!senhaValida) {
        return new Response(
          JSON.stringify({ error: 'Credenciais inválidas' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // Registrar ultimo_acesso logo após senha válida
      await supabaseClient
        .from('corretora_usuarios')
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq('id', usuario.id);

      // Verificar se TOTP está configurado
      if (!usuario.totp_configurado) {
        return new Response(
          JSON.stringify({ 
            needsTotp: true,
            userId: usuario.id,
            message: 'Configure o Google Authenticator primeiro' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Validar TOTP
      const totpValido = validateTOTP(usuario.totp_secret, totpCode);
      
      if (!totpValido) {
        return new Response(
          JSON.stringify({ error: 'Código TOTP inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // Gerar JWT usando SERVICE_ROLE_KEY como secret
      const jwtSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const encoder = new TextEncoder();
      const keyData = encoder.encode(jwtSecret);
      
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign', 'verify']
      );

      const jwt = await create(
        { alg: "HS512", typ: "JWT" },
        {
          userId: usuario.id,
          corretoraId: corretora.id,
          slug: corretora.slug,
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 horas
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'configure-totp') {
      const { userId } = await req.json();

      const { data: usuario } = await supabaseClient
        .from('corretora_usuarios')
        .select('*')
        .eq('id', userId)
        .single();

      if (!usuario) {
        return new Response(
          JSON.stringify({ error: 'Usuário não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Gerar novo secret TOTP
      const secret = generateTOTPSecret();
      
      // Buscar corretora para nome no QR
      const { data: corretora } = await supabaseClient
        .from('corretoras')
        .select('nome')
        .eq('id', usuario.corretora_id)
        .single();
      
      const issuer = corretora?.nome || 'Portal PID';
      const qrCodeUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(usuario.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

      // Atualizar no banco
      await supabaseClient
        .from('corretora_usuarios')
        .update({ 
          totp_secret: secret,
          totp_configurado: true 
        })
        .eq('id', userId);

      return new Response(
        JSON.stringify({
          secret,
          qrCodeUri,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não encontrada' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
