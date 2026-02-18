import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetaWhatsAppRequest {
  corretora_id: string;
  tipo: 'cobranca' | 'eventos' | 'mgf';
  mensagem?: string;
  telefone?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN');
    const metaPhoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');

    if (!metaToken) {
      throw new Error('META_WHATSAPP_TOKEN não configurado');
    }
    if (!metaPhoneNumberId) {
      throw new Error('META_WHATSAPP_PHONE_NUMBER_ID não configurado');
    }

    const body: MetaWhatsAppRequest = await req.json();
    const { corretora_id, tipo, mensagem, telefone } = body;

    if (!corretora_id) {
      throw new Error('corretora_id é obrigatório');
    }

    console.log(`[meta-whatsapp] Iniciando envio para corretora ${corretora_id}, tipo: ${tipo}`);

    // Get WhatsApp config for this corretora
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('corretora_id', corretora_id)
      .eq('ativo', true)
      .single();

    if (configError || !config) {
      throw new Error('Configuração de WhatsApp não encontrada ou inativa para esta associação');
    }

    // Get the phone number
    const phoneNumber = telefone || config.telefone_whatsapp;
    if (!phoneNumber) {
      throw new Error('Número de telefone não configurado');
    }

    // Format phone number (remove non-digits, add 55 if needed)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Get message content - either provided or generate based on type
    let messageContent = mensagem;

    if (!messageContent) {
      if (tipo === 'cobranca') {
        const { data: resumoData, error: resumoError } = await supabase.functions.invoke('gerar-resumo-cobranca', {
          body: { corretora_id }
        });
        if (resumoError) throw new Error('Erro ao gerar resumo de cobrança');
        messageContent = resumoData?.resumo || 'Resumo não disponível';
      } else if (tipo === 'eventos') {
        const { data: resumoData, error: resumoError } = await supabase.functions.invoke('gerar-resumo-eventos', {
          body: { corretora_id }
        });
        if (resumoError) throw new Error('Erro ao gerar resumo de eventos');
        messageContent = resumoData?.resumo || 'Resumo não disponível';
      } else {
        messageContent = 'Mensagem automática do sistema';
      }
    }

    console.log(`[meta-whatsapp] Enviando para: ${formattedPhone}`);
    console.log(`[meta-whatsapp] Phone Number ID: ${metaPhoneNumberId}`);

    // Send via Meta WhatsApp Business API
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
          text: {
            preview_url: false,
            body: messageContent,
          },
        }),
      }
    );

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      const errorMsg = metaData?.error?.message || `Erro Meta API: ${metaResponse.status}`;
      const errorCode = metaData?.error?.code;
      
      console.error('[meta-whatsapp] Erro Meta API:', JSON.stringify(metaData));
      
      let friendlyError = errorMsg;
      if (errorCode === 131047) {
        friendlyError = 'Mensagem não enviada: o número de destino não iniciou conversa nas últimas 24h. Use um template aprovado ou peça ao destinatário para mandar uma mensagem primeiro.';
      } else if (errorCode === 100) {
        friendlyError = `Parâmetro inválido: ${errorMsg}. Verifique o Phone Number ID e o número de destino.`;
      }

      await supabase
        .from('whatsapp_config')
        .update({ ultimo_erro_envio: friendlyError })
        .eq('id', config.id);

      throw new Error(friendlyError);
    }

    console.log('[meta-whatsapp] Mensagem enviada com sucesso!', metaData.messages?.[0]?.id);

    // Update config with success
    await supabase
      .from('whatsapp_config')
      .update({
        ultimo_envio_automatico: new Date().toISOString(),
        ultimo_erro_envio: null,
      })
      .eq('id', config.id);

    // Log in history
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    await supabase
      .from('whatsapp_historico')
      .insert({
        corretora_id,
        telefone_destino: formattedPhone,
        mensagem: messageContent,
        tipo,
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        enviado_por: userId,
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mensagem enviada via Meta WhatsApp API com sucesso',
        telefone: formattedPhone,
        message_id: metaData.messages?.[0]?.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[meta-whatsapp] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
