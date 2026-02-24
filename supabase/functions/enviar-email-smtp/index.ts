import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

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

async function sendViaSmtp(config: any, to: string, subject: string, message: string, html: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    
    // Force port 465 with implicit TLS to avoid STARTTLS crashes
    const port = config.smtp_port === 587 ? 465 : config.smtp_port;
    const client = new SMTPClient({
      connection: {
        hostname: config.smtp_host,
        port: port,
        tls: true, // Always use implicit TLS
        auth: {
          username: config.smtp_user,
          password: config.smtp_password,
        },
      },
    });

    await client.send({
      from: `${config.from_name} <${config.from_email}>`,
      to,
      subject,
      content: message,
      html,
      headers: {
        'X-Priority': '3',
        'X-Mailer': 'ATCD Sistema',
        'Reply-To': config.from_email,
      },
    });

    try { await client.close(); } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'SMTP error' };
  }
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

    const { to, subject, message }: EmailRequest = await req.json();
    const emailHtml = message.replace(/\n/g, '<br>');

    // Get SMTP config
    const { data: smtpConfig } = await supabase
      .from('email_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!smtpConfig) {
      return new Response(JSON.stringify({ error: 'Configuração SMTP não encontrada. Configure seu servidor SMTP nas configurações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const recipient of to) {
      console.log(`Sending via SMTP to ${recipient} (${smtpConfig.smtp_host}:465 TLS)...`);
      const result = await sendViaSmtp(smtpConfig, recipient, subject, message, emailHtml);

      let method = '';
      let errorMessage = '';

      if (result.success) {
        method = 'SMTP';
        console.log(`Email sent via SMTP to ${recipient}`);
      } else {
        errorMessage = `SMTP: ${result.error}`;
        console.error(`SMTP failed for ${recipient}: ${result.error}`);
      }

      // Log to history
      await supabase.from('email_historico').insert({
        destinatario: recipient,
        assunto: subject,
        corpo: `[${method || 'FALHA'}] ${message}`,
        enviado_por: user.id,
        status: result.success ? 'enviado' : 'erro',
        erro_mensagem: result.success ? null : errorMessage,
        atendimento_id: '00000000-0000-0000-0000-000000000000',
      });

      results.push({
        email: recipient,
        status: result.success ? 'enviado' : 'erro',
        method: method || 'nenhum',
        error: result.success ? undefined : errorMessage,
      });
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in enviar-email-smtp:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro ao enviar emails.', code: 'EMAIL_SEND_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
