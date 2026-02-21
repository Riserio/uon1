import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SendRequest {
  contact_id: string;
  message: string;
  type?: 'text' | 'template';
  template_name?: string;
  template_variables?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN')!;
    const metaPhoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')!;

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: authError } = await authClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = authUser.id;

    const body: SendRequest = await req.json();
    const { contact_id, message, type = 'text' } = body;

    if (!contact_id || !message) {
      return new Response(JSON.stringify({ error: 'contact_id e message são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get contact
    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('id', contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(JSON.stringify({ error: 'Contato não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phone = contact.phone.startsWith('55') ? contact.phone : `55${contact.phone}`;

    // Check 24h window
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentInbound } = await supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contact_id)
      .eq('direction', 'in')
      .gte('created_at', twentyFourHoursAgo);

    const insideWindow = (recentInbound || 0) > 0;

    let metaBody: any;

    if (type === 'template' || !insideWindow) {
      // Outside 24h window or explicit template - use template
      const templateName = body.template_name || 'hello_world';
      metaBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          components: body.template_variables ? [
            {
              type: 'body',
              parameters: Object.values(body.template_variables).map(v => ({ type: 'text', text: v })),
            },
          ] : undefined,
        },
      };
    } else {
      // Inside 24h window - send text
      metaBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { preview_url: false, body: message },
      };
    }

    const metaResponse = await fetch(
      `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaBody),
      }
    );

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      const errorMsg = metaData?.error?.message || `Erro Meta API: ${metaResponse.status}`;
      console.error('[send-message] Erro:', errorMsg);

      await supabase.from('whatsapp_messages').insert({
        contact_id,
        direction: 'out',
        body: message,
        type,
        status: 'failed',
        error_message: errorMsg,
        sent_by: userId,
      });

      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metaMessageId = metaData.messages?.[0]?.id || null;

    // Save message
    await supabase.from('whatsapp_messages').insert({
      contact_id,
      direction: 'out',
      body: message,
      type: insideWindow ? 'text' : 'template',
      status: 'sent',
      meta_message_id: metaMessageId,
      template_name: !insideWindow ? (body.template_name || 'hello_world') : null,
      sent_by: userId,
    });

    // Update contact
    await supabase.from('whatsapp_contacts').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: message.substring(0, 100),
    }).eq('id', contact_id);

    return new Response(JSON.stringify({
      success: true,
      message_id: metaMessageId,
      sent_as: insideWindow ? 'text' : 'template',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[send-message] Erro:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
