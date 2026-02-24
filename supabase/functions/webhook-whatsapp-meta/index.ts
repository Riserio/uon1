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
        } else if (['image', 'audio', 'video', 'document', 'sticker'].includes(msg.type)) {
          msgType = msg.type;
          msgBody = msg[msg.type]?.caption || `[${msg.type}]`;
          const mediaId = msg[msg.type]?.id || null;
          mediaMime = msg[msg.type]?.mime_type || null;

          // Download media URL from Meta API
          if (mediaId) {
            try {
              const whatsappToken = Deno.env.get('META_WHATSAPP_TOKEN');
              if (whatsappToken) {
                const mediaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
                  headers: { 'Authorization': `Bearer ${whatsappToken}` },
                });
                const mediaData = await mediaRes.json();
                if (mediaData.url) {
                  mediaUrl = mediaData.url;
                }
              }
            } catch (mediaErr) {
              console.error('[webhook] Erro ao obter URL da mídia:', mediaErr);
            }
          }
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

        // Upsert contact (find or create) — handles 9th digit variation
        let contact: any;
        
        // Build all possible phone variants for this number
        const digits = from.replace(/\D/g, '');
        const last8 = digits.slice(-8);
        const areaCode = digits.length >= 10 ? digits.slice(-10, -8) : '';
        const pattern9 = areaCode ? `55${areaCode}9${last8}` : '';
        const patternNo9 = areaCode ? `55${areaCode}${last8}` : '';
        
        // Search for ALL matching contacts (exact + 9th digit variants) in one query
        const phoneVariants = [from];
        if (pattern9 && pattern9 !== from) phoneVariants.push(pattern9);
        if (patternNo9 && patternNo9 !== from) phoneVariants.push(patternNo9);
        
        const { data: matchingContacts } = await supabase
          .from('whatsapp_contacts')
          .select('id, human_mode, unread_count, audio_blocked, phone')
          .in('phone', phoneVariants);
        
        if (matchingContacts && matchingContacts.length > 0) {
          // Prefer the canonical number (with 9th digit), then exact match
          contact = matchingContacts.find((c: any) => c.phone === pattern9)
            || matchingContacts.find((c: any) => c.phone === from)
            || matchingContacts[0];
          
          if (matchingContacts.length > 1) {
            console.log(`[webhook] Found ${matchingContacts.length} contacts for ${from}, using ${contact.phone}`);
          }
        }

        if (contact) {
          // Update unread count, last message, and profile name
          await supabase
            .from('whatsapp_contacts')
            .update({
              profile_name: profileName || undefined,
              last_message_at: timestamp,
              last_message_preview: msgBody.substring(0, 100),
              unread_count: (contact.unread_count || 0) + 1,
            })
            .eq('id', contact.id);
        } else {
          // Create new contact
          const { data: newContact, error: contactError } = await supabase
            .from('whatsapp_contacts')
            .insert({
              phone: from,
              profile_name: profileName,
              name: profileName,
              last_message_at: timestamp,
              last_message_preview: msgBody.substring(0, 100),
              unread_count: 1,
            })
            .select('id, human_mode, unread_count, audio_blocked')
            .single();

          if (contactError || !newContact) {
            console.error('[webhook] Erro ao criar contato:', contactError);
            continue;
          }
          contact = newContact;
        }

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

        // ---- AUTO-REPLY IF AUDIO IS BLOCKED ----
        if (msgType === 'audio' && contact.audio_blocked) {
          try {
            const whatsappToken = Deno.env.get('META_WHATSAPP_TOKEN');
            const phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
            if (whatsappToken && phoneNumberId) {
              const replyBody = '⚠️ Este número não está habilitado para receber mensagens de áudio. Por favor, envie sua mensagem por texto.';
              await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${whatsappToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: from,
                  type: 'text',
                  text: { body: replyBody },
                }),
              });
              await supabase.from('whatsapp_messages').insert({
                contact_id: contact.id,
                direction: 'out',
                body: replyBody,
                type: 'text',
                status: 'sent',
                sent_by: 'system',
              });
              console.log(`[webhook] Auto-reply: áudio bloqueado para ${from}`);
            }
          } catch (audioErr) {
            console.error('[webhook] Erro ao responder bloqueio de áudio:', audioErr);
          }
        }

        // ---- NOTIFY EXTERNAL NUMBER (global, not per-corretora) ----
        try {
          const { data: notifConfigs } = await supabase
            .from('whatsapp_notificacao_global')
            .select('notificar_numero, notificar_ativo')
            .eq('notificar_ativo', true);

          if (notifConfigs && notifConfigs.length > 0) {
            const whatsappToken = Deno.env.get('META_WHATSAPP_TOKEN');
            const phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');

            if (whatsappToken && phoneNumberId) {
              for (const nc of notifConfigs) {
                const notifNum = nc.notificar_numero?.replace(/\D/g, '');
                if (!notifNum || notifNum === from) continue; // don't notify the sender

                const contactName = profileName || from;
                const notifBody = `📩 *Nova mensagem no WhatsApp*\n\nDe: ${contactName} (${from})\nMensagem: ${msgBody.substring(0, 200)}`;

                await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${whatsappToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: notifNum,
                    type: 'text',
                    text: { body: notifBody },
                  }),
                });
                console.log(`[webhook] Notificação enviada para ${notifNum}`);
              }
            }
          }
        } catch (notifErr) {
          console.error('[webhook] Erro ao notificar:', notifErr);
        }

        // Trigger flow engine if NOT in human mode
        if (!contact.human_mode) {
          try {
            const { data: flowResult, error: flowError } = await supabase.functions.invoke('whatsapp-flow-engine', {
              body: {
                contact_id: contact.id,
                message_body: msgBody,
                message_type: msgType,
                phone: from,
              },
            });
            if (flowError) {
              console.error(`[webhook] Flow engine invoke error for contact ${contact.id}:`, flowError);
            } else {
              console.log(`[webhook] Flow engine result for ${from}:`, JSON.stringify(flowResult).substring(0, 200));
            }
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
