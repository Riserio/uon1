import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  to: string[];
  subject: string;
  message: string;
  corretoraId?: string;
  contatoId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { to, subject, message, corretoraId, contatoId }: EmailRequest = await req.json();

    // Get SMTP configuration
    const { data: smtpConfig, error: configError } = await supabase
      .from('email_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (configError || !smtpConfig) {
      return new Response(JSON.stringify({ error: 'SMTP não configurado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create SMTP client with proper SSL/TLS configuration
    const useSsl = smtpConfig.smtp_port === 465;
    const client = new SMTPClient({
      connection: {
        hostname: smtpConfig.smtp_host,
        port: smtpConfig.smtp_port,
        tls: useSsl ? true : true, // Always use secure connection
        auth: {
          username: smtpConfig.smtp_user,
          password: smtpConfig.smtp_password,
        },
      },
    });

    // Send emails
    const results = [];
    for (const recipient of to) {
      try {
        await client.send({
          from: `${smtpConfig.from_name} <${smtpConfig.from_email}>`,
          to: recipient,
          subject: subject,
          content: message,
          html: message.replace(/\n/g, '<br>'),
          headers: {
            'X-Priority': '3',
            'X-Mailer': 'ATCD Sistema',
            'Reply-To': smtpConfig.from_email,
            'List-Unsubscribe': `<mailto:${smtpConfig.from_email}?subject=unsubscribe>`,
          },
        });

        // Log email history
        await supabase.from('email_historico').insert({
          destinatario: recipient,
          assunto: subject,
          corpo: message,
          enviado_por: user.id,
          status: 'enviado',
          atendimento_id: '00000000-0000-0000-0000-000000000000', // Placeholder for manual emails
        });

        results.push({ email: recipient, status: 'enviado' });
      } catch (error: any) {
        console.error(`Error sending to ${recipient}:`, error);
        
        // Log error
        await supabase.from('email_historico').insert({
          destinatario: recipient,
          assunto: subject,
          corpo: message,
          enviado_por: user.id,
          status: 'erro',
          erro_mensagem: error.message || 'Erro desconhecido',
          atendimento_id: '00000000-0000-0000-0000-000000000000',
        });

        results.push({ email: recipient, status: 'erro', error: error.message || 'Erro desconhecido' });
      }
    }

    try { await client.close(); } catch (_) { /* connection may not have been established */ }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in enviar-email-smtp:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao enviar emails. Por favor, verifique as configurações e tente novamente.',
        code: 'EMAIL_SEND_ERROR'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
