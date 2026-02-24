import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN')!;
    const metaPhoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')!;

    // Get pending messages whose scheduled time has passed
    const { data: pendingMessages, error } = await supabase
      .from('whatsapp_scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (error) throw error;
    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[scheduled-sender] Processing ${pendingMessages.length} scheduled messages`);
    let sentCount = 0;

    for (const msg of pendingMessages) {
      try {
        // Verify 24h window is still open
        const { data: lastIncoming } = await supabase
          .from('whatsapp_messages')
          .select('created_at')
          .eq('contact_id', msg.contact_id)
          .eq('direction', 'in')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastIncoming) {
          const windowEnd = new Date(lastIncoming.created_at).getTime() + 24 * 60 * 60 * 1000;
          if (Date.now() > windowEnd) {
            // Window expired - mark as expired
            await supabase.from('whatsapp_scheduled_messages')
              .update({ status: 'expired', error_message: 'Janela de 24h expirada' })
              .eq('id', msg.id);
            console.log(`[scheduled-sender] Message ${msg.id} expired (24h window)`);
            continue;
          }
        }

        // Send via Meta API
        const formattedPhone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
        const metaResponse = await fetch(
          `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${metaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: formattedPhone,
              type: 'text',
              text: { preview_url: false, body: msg.message },
            }),
          }
        );

        const metaData = await metaResponse.json();

        if (metaResponse.ok) {
          const metaMessageId = metaData.messages?.[0]?.id || null;

          // Log in whatsapp_messages
          await supabase.from('whatsapp_messages').insert({
            contact_id: msg.contact_id,
            direction: 'out',
            body: msg.message,
            type: 'text',
            status: 'sent',
            meta_message_id: metaMessageId,
          });

          // Update contact
          await supabase.from('whatsapp_contacts').update({
            last_message_at: new Date().toISOString(),
            last_message_preview: msg.message.substring(0, 100),
          }).eq('id', msg.contact_id);

          // Mark as sent
          await supabase.from('whatsapp_scheduled_messages')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', msg.id);

          sentCount++;
          console.log(`[scheduled-sender] Sent message ${msg.id}`);
        } else {
          const errorMsg = metaData?.error?.message || 'Erro API Meta';
          await supabase.from('whatsapp_scheduled_messages')
            .update({ status: 'failed', error_message: errorMsg })
            .eq('id', msg.id);
          console.error(`[scheduled-sender] Failed message ${msg.id}: ${errorMsg}`);
        }
      } catch (msgErr: any) {
        await supabase.from('whatsapp_scheduled_messages')
          .update({ status: 'failed', error_message: msgErr.message })
          .eq('id', msg.id);
        console.error(`[scheduled-sender] Error processing ${msg.id}:`, msgErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, total: pendingMessages.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[scheduled-sender] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
