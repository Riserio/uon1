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

    // Get the phone number(s) - may be comma-separated
    const phoneRaw = telefone || config.telefone_whatsapp;
    if (!phoneRaw) {
      throw new Error('Número de telefone não configurado');
    }

    // Split multiple numbers and clean each one
    const phoneNumbers = phoneRaw.split(',').map((p: string) => {
      const clean = p.trim().replace(/\D/g, '');
      return clean.startsWith('55') ? clean : `55${clean}`;
    }).filter((p: string) => p.length >= 12);

    if (phoneNumbers.length === 0) {
      throw new Error('Nenhum número de telefone válido encontrado');
    }

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

    // Get user id for logging
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Send to each number individually
    const results: { phone: string; success: boolean; message_id?: string; error?: string }[] = [];

    for (const formattedPhone of phoneNumbers) {
      console.log(`[meta-whatsapp] Enviando para: ${formattedPhone}`);

      try {
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
          console.error(`[meta-whatsapp] Erro para ${formattedPhone}:`, JSON.stringify(metaData));

          let friendlyError = errorMsg;
          if (errorCode === 131047) {
            friendlyError = 'Número não iniciou conversa nas últimas 24h.';
          } else if (errorCode === 100) {
            friendlyError = `Parâmetro inválido: ${errorMsg}`;
          }

          results.push({ phone: formattedPhone, success: false, error: friendlyError });
        } else {
          const metaMessageId = metaData.messages?.[0]?.id || null;
          console.log(`[meta-whatsapp] Enviado para ${formattedPhone}: ${metaMessageId}`);

          // Log in history
          await supabase.from('whatsapp_historico').insert({
            corretora_id,
            telefone_destino: formattedPhone,
            mensagem: messageContent,
            tipo,
            status: 'enviado',
            status_entrega: 'enviado',
            meta_message_id: metaMessageId,
            enviado_em: new Date().toISOString(),
            enviado_por: userId,
          });

          results.push({ phone: formattedPhone, success: true, message_id: metaMessageId });
        }
      } catch (sendError: unknown) {
        const errMsg = sendError instanceof Error ? sendError.message : 'Erro desconhecido';
        console.error(`[meta-whatsapp] Erro ao enviar para ${formattedPhone}:`, errMsg);
        results.push({ phone: formattedPhone, success: false, error: errMsg });
      }
    }

    const allSuccess = results.every(r => r.success);
    const anySuccess = results.some(r => r.success);

    // Update config status
    if (anySuccess) {
      await supabase.from('whatsapp_config').update({
        ultimo_envio_automatico: new Date().toISOString(),
        ultimo_erro_envio: allSuccess ? null : results.filter(r => !r.success).map(r => `${r.phone}: ${r.error}`).join('; '),
      }).eq('id', config.id);
    } else {
      await supabase.from('whatsapp_config').update({
        ultimo_erro_envio: results.map(r => `${r.phone}: ${r.error}`).join('; '),
      }).eq('id', config.id);
    }

    return new Response(
      JSON.stringify({
        success: anySuccess,
        message: allSuccess
          ? `Mensagem enviada para ${results.length} número(s)`
          : anySuccess
            ? `Enviado para ${results.filter(r => r.success).length}/${results.length} números`
            : 'Falha ao enviar para todos os números',
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: anySuccess ? 200 : 500 }
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
