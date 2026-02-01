import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppRequest {
  telefone: string;
  mensagem: string;
  corretora_id?: string;
  template_id?: string;
  tipo: 'cobranca' | 'eventos' | 'mgf' | 'manual';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: WhatsAppRequest = await req.json();
    const { telefone, mensagem, corretora_id, template_id, tipo } = body;

    if (!telefone || !mensagem) {
      throw new Error('Telefone e mensagem são obrigatórios');
    }

    // Format phone number
    const cleanPhone = telefone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Create WhatsApp URL using the official API
    const encodedMessage = encodeURIComponent(mensagem);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;

    // Get user info for tracking
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Log the message in history
    const { error: historyError } = await supabase
      .from('whatsapp_historico')
      .insert({
        corretora_id,
        template_id,
        telefone_destino: formattedPhone,
        mensagem,
        tipo,
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        enviado_por: userId,
      });

    if (historyError) {
      console.error('Error logging WhatsApp history:', historyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        whatsapp_url: whatsappUrl,
        telefone: formattedPhone,
        message: 'Mensagem preparada para envio via WhatsApp',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in enviar-whatsapp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
