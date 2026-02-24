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

async function sendViaResend(apiKey: string, from: string, to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return { success: false, error: errorData?.message || `Resend HTTP ${response.status}` };
  }

  return { success: true };
}

async function sendViaSmtp(config: any, to: string, subject: string, message: string, html: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Dynamic import to avoid crashing the runtime if denomailer fails to load
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    
    const useImplicitTls = config.smtp_port === 465;
    const client = new SMTPClient({
      connection: {
        hostname: config.smtp_host,
        port: config.smtp_port,
        tls: useImplicitTls,
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

    // Get configs
    const { data: smtpConfig } = await supabase
      .from('email_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const { data: resendConfig } = await supabase
      .from('resend_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const results = [];

    for (const recipient of to) {
      let emailSent = false;
      let method = '';
      let errorMessage = '';

      // Try Resend first (more reliable in edge functions)
      if (resendApiKey) {
        const fromEmail = resendConfig
          ? `${resendConfig.from_name} <${resendConfig.from_email}>`
          : smtpConfig
            ? `${smtpConfig.from_name} <onboarding@resend.dev>`
            : 'Atendimentos <onboarding@resend.dev>';

        console.log(`Trying Resend for ${recipient}...`);
        const result = await sendViaResend(resendApiKey, fromEmail, recipient, subject, emailHtml);
        
        if (result.success) {
          emailSent = true;
          method = 'Resend';
          console.log(`Email sent via Resend to ${recipient}`);
        } else {
          errorMessage = `Resend: ${result.error}`;
          console.error(`Resend failed: ${result.error}`);
        }
      }

      // Fallback to SMTP
      if (!emailSent && smtpConfig) {
        console.log(`Trying SMTP for ${recipient} (${smtpConfig.smtp_host}:${smtpConfig.smtp_port})...`);
        const result = await sendViaSmtp(smtpConfig, recipient, subject, message, emailHtml);
        
        if (result.success) {
          emailSent = true;
          method = 'SMTP';
          console.log(`Email sent via SMTP to ${recipient}`);
        } else {
          errorMessage = errorMessage ? `${errorMessage}; SMTP: ${result.error}` : `SMTP: ${result.error}`;
          console.error(`SMTP failed: ${result.error}`);
        }
      }

      // Log to history
      await supabase.from('email_historico').insert({
        destinatario: recipient,
        assunto: subject,
        corpo: `[${method || 'FALHA'}] ${message}`,
        enviado_por: user.id,
        status: emailSent ? 'enviado' : 'erro',
        erro_mensagem: emailSent ? null : errorMessage,
        atendimento_id: '00000000-0000-0000-0000-000000000000',
      });

      results.push({
        email: recipient,
        status: emailSent ? 'enviado' : 'erro',
        method: method || 'nenhum',
        error: emailSent ? undefined : errorMessage,
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
