// Entrega URLs assinadas das mídias da Central WhatsApp.
//
// POST { message_ids: string[] } (JWT do usuário)
//  → { urls: { [message_id]: string | null } }
//
// - As mensagens são lidas com o JWT do usuário, então o RLS de
//   whatsapp_messages decide quem pode ver cada mídia.
// - Mídia já no bucket: devolve URL assinada (1h).
// - Mídia antiga (media_url nulo ou URL temporária da Meta): baixa da Meta
//   pelo id guardado em raw_payload — só funciona até 7 dias
//   após o recebimento (prazo da Meta para ids vindos do webhook), grava no
//   bucket, atualiza media_url e devolve a URL assinada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  BUCKET_MIDIA,
  PREFIXO_STORAGE,
  midiaDoPayload,
  salvarMidiaWhatsApp,
} from '../_shared/whatsapp-midia.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_IDS = 50;
const VALIDADE_URL = 60 * 60; // 1h

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.message_ids)
      ? [...new Set<string>(body.message_ids.filter((x: unknown) => typeof x === 'string'))].slice(0, MAX_IDS)
      : [];
    if (!ids.length) return json({ urls: {} });

    // RLS do usuário: só volta o que ele pode ver.
    const { data: msgs, error } = await userClient
      .from('whatsapp_messages')
      .select('id, type, media_url, media_mime_type, raw_payload')
      .in('id', ids);
    if (error) return json({ error: error.message }, 400);

    const urls: Record<string, string | null> = {};

    await Promise.all((msgs || []).map(async (m) => {
      let marcador: string | null = m.media_url?.startsWith(PREFIXO_STORAGE) ? m.media_url : null;

      if (!marcador) {
        const midia = midiaDoPayload(m.raw_payload);
        if (midia) {
          marcador = await salvarMidiaWhatsApp(admin, midia.id, midia.mime || m.media_mime_type, midia.nome);
          if (marcador) {
            await admin.from('whatsapp_messages').update({ media_url: marcador }).eq('id', m.id);
          }
        } else if (m.media_url && !/lookaside\.fbsbx\.com|graph\.facebook\.com/.test(m.media_url)) {
          // URL pública já utilizável (ex.: mídia enviada por nós).
          urls[m.id] = m.media_url;
          return;
        }
      }

      if (!marcador) {
        urls[m.id] = null;
        return;
      }
      const caminho = marcador.slice(PREFIXO_STORAGE.length);
      const { data: assinado } = await admin.storage.from(BUCKET_MIDIA).createSignedUrl(caminho, VALIDADE_URL);
      urls[m.id] = assinado?.signedUrl || null;
    }));

    return json({ urls });
  } catch (err) {
    console.error('[whatsapp-midia] erro', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
