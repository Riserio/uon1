import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ========== META WEBHOOK VERIFICATION (GET) ==========
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('META_WHATSAPP_VERIFY_TOKEN') || 'uon1_whatsapp_verify';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[webhook] Verificação OK');
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  // ========== PROCESS WEBHOOK (POST) ==========
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log('[webhook] Payload:', JSON.stringify(body).substring(0, 500));

    const entry = body?.entry?.[0];
    if (!entry) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      // ---- PROCESS INCOMING MESSAGES ----
      const messages = value?.messages || [];
      for (const msg of messages) {
        const from = msg.from; // phone number
        const messageId = msg.id;
        const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
        const profileName = value?.contacts?.[0]?.profile?.name || null;

        // Determine message type and body
        let msgBody = '';
        let msgType = 'text';
        let mediaUrl: string | null = null;
        let mediaMime: string | null = null;

        if (msg.type === 'text') {
          msgBody = msg.text?.body || '';
          msgType = 'text';
        } else if (msg.type === 'interactive') {
          msgType = 'interactive';
          if (msg.interactive?.type === 'button_reply') {
            msgBody = msg.interactive.button_reply?.title || '';
          } else if (msg.interactive?.type === 'list_reply') {
            msgBody = msg.interactive.list_reply?.title || '';
          }
        } else if (['image', 'audio', 'video', 'document'].includes(msg.type)) {
          msgType = msg.type;
          msgBody = msg[msg.type]?.caption || `[${msg.type}]`;
          mediaUrl = msg[msg.type]?.id || null; // media ID - would need download
          mediaMime = msg[msg.type]?.mime_type || null;
        } else if (msg.type === 'reaction') {
          msgType = 'reaction';
          msgBody = msg.reaction?.emoji || '';
        } else {
          msgType = msg.type || 'text';
          msgBody = `[${msgType}]`;
        }

        console.log(`[webhook] Msg recebida de ${from}: ${msgBody.substring(0, 100)}`);

        // Idempotency check
        const { data: existingMsg } = await supabase
          .from('whatsapp_messages')
          .select('id')
          .eq('meta_message_id', messageId)
          .maybeSingle();

        if (existingMsg) {
          console.log(`[webhook] Msg ${messageId} já existe, ignorando`);
          continue;
        }

        // Upsert contact
        const { data: contact, error: contactError } = await supabase
          .from('whatsapp_contacts')
          .upsert(
            {
              phone: from,
              profile_name: profileName,
              name: profileName,
              last_message_at: timestamp,
              last_message_preview: msgBody.substring(0, 100),
            },
            { onConflict: 'phone' }
          )
          .select('id, human_mode, unread_count')
          .single();

        if (contactError || !contact) {
          console.error('[webhook] Erro ao upsert contato:', contactError);
          continue;
        }

        // Update unread count and last message
        await supabase
          .from('whatsapp_contacts')
          .update({
            unread_count: (contact.unread_count || 0) + 1,
            last_message_at: timestamp,
            last_message_preview: msgBody.substring(0, 100),
          })
          .eq('id', contact.id);

        // Insert message
        const { error: msgError } = await supabase
          .from('whatsapp_messages')
          .insert({
            contact_id: contact.id,
            direction: 'in',
            body: msgBody,
            type: msgType,
            status: 'delivered',
            meta_message_id: messageId,
            media_url: mediaUrl,
            media_mime_type: mediaMime,
            raw_payload: msg,
            created_at: timestamp,
          });

        if (msgError) {
          console.error('[webhook] Erro ao inserir msg:', msgError);
          continue;
        }

        // Trigger flow engine if NOT in human mode
        if (!contact.human_mode) {
          try {
            await supabase.functions.invoke('whatsapp-flow-engine', {
              body: {
                contact_id: contact.id,
                message_body: msgBody,
                message_type: msgType,
                phone: from,
              },
            });
          } catch (flowErr) {
            console.error('[webhook] Erro ao disparar flow engine:', flowErr);
          }
        }
      }

      // ---- PROCESS STATUS UPDATES ----
      const statuses = value?.statuses || [];
      for (const status of statuses) {
        const messageId = status.id;
        const statusValue = status.status;
        const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();

        let dbStatus: string;
        const updateFields: Record<string, unknown> = {};

        switch (statusValue) {
          case 'sent':
            dbStatus = 'sent';
            break;
          case 'delivered':
            dbStatus = 'delivered';
            break;
          case 'read':
            dbStatus = 'read';
            break;
          case 'failed':
            dbStatus = 'failed';
            updateFields.error_message = status.errors?.[0]?.title || 'Erro de entrega';
            break;
          default:
            dbStatus = statusValue;
        }

        // Update in whatsapp_messages
        await supabase
          .from('whatsapp_messages')
          .update({ status: dbStatus, ...updateFields })
          .eq('meta_message_id', messageId);

        // Also update legacy whatsapp_historico if applicable
        let statusEntrega: string;
        switch (statusValue) {
          case 'sent': statusEntrega = 'enviado'; break;
          case 'delivered': statusEntrega = 'entregue'; break;
          case 'read': statusEntrega = 'lido'; break;
          case 'failed': statusEntrega = 'erro'; break;
          default: statusEntrega = statusValue;
        }

        const legacyUpdate: Record<string, unknown> = {
          status_entrega: statusEntrega,
          status: statusEntrega === 'erro' ? 'erro' : 'enviado',
        };
        if (statusValue === 'delivered') legacyUpdate.entregue_em = timestamp;
        if (statusValue === 'read') legacyUpdate.lido_em = timestamp;
        if (statusValue === 'failed') legacyUpdate.erro_mensagem = status.errors?.[0]?.title || 'Erro';

        await supabase
          .from('whatsapp_historico')
          .update(legacyUpdate)
          .eq('meta_message_id', messageId);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[webhook] Erro:', error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
