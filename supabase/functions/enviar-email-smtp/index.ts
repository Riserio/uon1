import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

    const { to, subject, message }: EmailRequest = await req.json();

    const emailHtml = message.replace(/\n/g, '<br>');

    const results = [];

    // Try Resend first (primary)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    let useResend = !!RESEND_API_KEY;
    let resendFromEmail = "Atendimentos <onboarding@resend.dev>";

    if (useResend) {
      const { data: resendConfig } = await supabase
        .from('resend_config')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (resendConfig) {
        resendFromEmail = `${resendConfig.from_name} <${resendConfig.from_email}>`;
      }
    }

    // Get SMTP config as fallback
    let smtpConfig: any = null;
    if (!useResend) {
      const { data } = await supabase
        .from('email_config')
        .select('*')
        .eq('user_id', user.id)
        .single();
      smtpConfig = data;

      if (!smtpConfig) {
        return new Response(JSON.stringify({ error: 'Nenhum provedor de email configurado (Resend ou SMTP)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    for (const recipient of to) {
      let emailSent = false;
      let method = '';
      let errorMessage = '';

      // Try Resend first
      if (useResend) {
        try {
          console.log(`Trying Resend for ${recipient}...`);
          const resend = new Resend(RESEND_API_KEY);
          const { error: resendError } = await resend.emails.send({
            from: resendFromEmail,
            to: recipient,
            subject: subject,
            html: emailHtml,
          });

          if (resendError) throw new Error(resendError.message);

          emailSent = true;
          method = 'Resend';
          console.log(`Email sent via Resend to ${recipient}`);
        } catch (resendErr: any) {
          console.error(`Resend failed for ${recipient}:`, resendErr.message);
          errorMessage = resendErr.message;
        }
      }

      // Fallback to SMTP
      if (!emailSent) {
        if (!smtpConfig) {
          // Load SMTP config on demand as fallback
          const { data } = await supabase
            .from('email_config')
            .select('*')
            .eq('user_id', user.id)
            .single();
          smtpConfig = data;
        }

        if (smtpConfig) {
          try {
            console.log(`Trying SMTP for ${recipient}...`);
            // Sanitize hostname
            let hostname = smtpConfig.smtp_host || '';
            hostname = hostname.replace(/^(ssl|tls|https?):\/\//i, '').trim();

            const client = new SMTPClient({
              connection: {
                hostname,
                port: smtpConfig.smtp_port,
                tls: true,
                auth: {
                  username: smtpConfig.smtp_user,
                  password: smtpConfig.smtp_password,
                },
              },
            });

            await client.send({
              from: `${smtpConfig.from_name} <${smtpConfig.from_email}>`,
              to: recipient,
              subject: subject,
              content: message,
              html: emailHtml,
              headers: {
                'X-Priority': '3',
                'X-Mailer': 'ATCD Sistema',
                'Reply-To': smtpConfig.from_email,
                'List-Unsubscribe': `<mailto:${smtpConfig.from_email}?subject=unsubscribe>`,
              },
            });

            await client.close();
            emailSent = true;
            method = 'SMTP';
            console.log(`Email sent via SMTP to ${recipient}`);
          } catch (smtpErr: any) {
            console.error(`SMTP failed for ${recipient}:`, smtpErr.message);
            errorMessage = errorMessage
              ? `${errorMessage}; SMTP: ${smtpErr.message}`
              : smtpErr.message;
          }
        }
      }

      // Log email history
      await supabase.from('email_historico').insert({
        destinatario: recipient,
        assunto: subject,
        corpo: `[${method || 'FALHA'}] ${message}`,
        enviado_por: user.id,
        status: emailSent ? 'enviado' : 'erro',
        erro_mensagem: emailSent ? null : errorMessage,
        atendimento_id: null,
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
      JSON.stringify({
        error: 'Erro ao enviar emails. Por favor, verifique as configurações e tente novamente.',
        code: 'EMAIL_SEND_ERROR',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
