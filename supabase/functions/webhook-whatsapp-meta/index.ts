import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Meta webhook verification (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get('META_WHATSAPP_VERIFY_TOKEN') || 'uon1_whatsapp_verify';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[webhook-whatsapp-meta] Verificação OK');
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }

    console.error('[webhook-whatsapp-meta] Verificação falhou:', { mode, token });
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  // Process webhook notifications (POST)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log('[webhook-whatsapp-meta] Payload recebido:', JSON.stringify(body).substring(0, 500));

    const entry = body?.entry?.[0];
    if (!entry) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const statuses = change.value?.statuses || [];

      for (const status of statuses) {
        const messageId = status.id;
        const statusValue = status.status; // sent, delivered, read, failed
        const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
        const recipientId = status.recipient_id;

        console.log(`[webhook-whatsapp-meta] Status: ${statusValue} para msg ${messageId} (dest: ${recipientId})`);

        // Map Meta statuses to our status
        let statusEntrega: string;
        const updateFields: Record<string, any> = {};

        switch (statusValue) {
          case 'sent':
            statusEntrega = 'enviado';
            break;
          case 'delivered':
            statusEntrega = 'entregue';
            updateFields.entregue_em = timestamp;
            break;
          case 'read':
            statusEntrega = 'lido';
            updateFields.lido_em = timestamp;
            break;
          case 'failed':
            statusEntrega = 'erro';
            const errorMsg = status.errors?.[0]?.title || 'Erro de entrega';
            updateFields.erro_mensagem = errorMsg;
            break;
          default:
            statusEntrega = statusValue;
        }

        // Update whatsapp_historico
        const { error } = await supabase
          .from('whatsapp_historico')
          .update({
            status_entrega: statusEntrega,
            status: statusEntrega === 'erro' ? 'erro' : 'enviado',
            ...updateFields,
          })
          .eq('meta_message_id', messageId);

        if (error) {
          console.error(`[webhook-whatsapp-meta] Erro ao atualizar msg ${messageId}:`, error);
        } else {
          console.log(`[webhook-whatsapp-meta] Msg ${messageId} atualizada para ${statusEntrega}`);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[webhook-whatsapp-meta] Erro:', error);
    // Always return 200 to Meta to avoid retries
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
