import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface N8NWhatsAppRequest {
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

    const body: N8NWhatsAppRequest = await req.json();
    const { corretora_id, tipo, mensagem, telefone } = body;

    if (!corretora_id) {
      throw new Error('corretora_id é obrigatório');
    }

    console.log(`[n8n-whatsapp] Iniciando envio para corretora ${corretora_id}, tipo: ${tipo}`);

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

    // Check specific missing configurations
    if (!config.n8n_webhook_url) {
      throw new Error('URL do webhook n8n não configurada. Insira a URL e salve antes de testar.');
    }

    if (!config.n8n_ativo) {
      throw new Error('Integração n8n está desativada. Ative o toggle e salve antes de testar.');
    }

    // Get the phone number
    const phoneNumber = telefone || config.telefone_whatsapp;
    if (!phoneNumber) {
      throw new Error('Número de telefone não configurado');
    }

    // Format phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Get message content - either provided or generate based on type
    let messageContent = mensagem;
    
    if (!messageContent) {
      // Generate summary based on type
      if (tipo === 'cobranca') {
        const { data: resumoData, error: resumoError } = await supabase.functions.invoke('gerar-resumo-cobranca', {
          body: { corretora_id }
        });
        
        if (resumoError) {
          console.error('[n8n-whatsapp] Erro ao gerar resumo:', resumoError);
          throw new Error('Erro ao gerar resumo de cobrança');
        }
        
        messageContent = resumoData?.resumo || 'Resumo não disponível';
      } else if (tipo === 'eventos') {
        const { data: resumoData, error: resumoError } = await supabase.functions.invoke('gerar-resumo-eventos', {
          body: { corretora_id }
        });
        
        if (resumoError) {
          console.error('[n8n-whatsapp] Erro ao gerar resumo eventos:', resumoError);
          throw new Error('Erro ao gerar resumo de eventos');
        }
        
        messageContent = resumoData?.resumo || 'Resumo não disponível';
      } else {
        messageContent = 'Mensagem automática do sistema';
      }
    }

    console.log(`[n8n-whatsapp] Enviando para n8n webhook: ${config.n8n_webhook_url}`);
    console.log(`[n8n-whatsapp] Telefone: ${formattedPhone}`);
    console.log(`[n8n-whatsapp] Mensagem: ${(messageContent || '').substring(0, 100)}...`);

    // Send to n8n webhook
    const n8nResponse = await fetch(config.n8n_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telefone: formattedPhone,
        mensagem: messageContent,
        tipo,
        corretora_id,
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('[n8n-whatsapp] Erro n8n:', errorText);

      // Parse n8n error for friendlier message
      let friendlyError = `Erro n8n: ${n8nResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (n8nResponse.status === 404 && errorJson.hint) {
          friendlyError = `Webhook não encontrado (404): ${errorJson.hint}`;
        } else if (errorJson.message) {
          friendlyError = `Erro n8n (${n8nResponse.status}): ${errorJson.message}`;
        }
      } catch {
        friendlyError = `Erro n8n (${n8nResponse.status}): ${errorText.substring(0, 200)}`;
      }
      
      // Update config with error
      await supabase
        .from('whatsapp_config')
        .update({
          ultimo_erro_envio: friendlyError,
        })
        .eq('id', config.id);
      
      throw new Error(friendlyError);
    }

    console.log('[n8n-whatsapp] Mensagem enviada com sucesso!');

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
        message: 'Mensagem enviada via n8n com sucesso',
        telefone: formattedPhone,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[n8n-whatsapp] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
