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

    const { to, subject, message, corretoraId, contatoId }: EmailRequest = await req.json();
    const emailHtml = message.replace(/\n/g, '<br>');

    // Get SMTP configuration
    const { data: smtpConfig } = await supabase
      .from('email_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get Resend configuration
    const { data: resendConfig } = await supabase
      .from('resend_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const results = [];

    for (const recipient of to) {
      let emailSent = false;
      let method = '';
      let errorMessage = '';

      // Try SMTP first
      if (smtpConfig) {
        try {
          const useImplicitTls = smtpConfig.smtp_port === 465;
          console.log(`Trying SMTP for ${recipient} (host=${smtpConfig.smtp_host}, port=${smtpConfig.smtp_port}, tls=${useImplicitTls})`);

          const client = new SMTPClient({
            connection: {
              hostname: smtpConfig.smtp_host,
              port: smtpConfig.smtp_port,
              tls: useImplicitTls,
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
            },
          });

          try { await client.close(); } catch (_) {}
          emailSent = true;
          method = 'SMTP';
          console.log(`Email sent via SMTP to ${recipient}`);
        } catch (smtpError: any) {
          console.error(`SMTP failed for ${recipient}:`, smtpError.message);
          errorMessage = smtpError.message;
        }
      }

      // Fallback to Resend
      if (!emailSent) {
        try {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (resendApiKey) {
            let fromEmail = "Atendimentos <onboarding@resend.dev>";
            if (resendConfig) {
              fromEmail = `${resendConfig.from_name} <${resendConfig.from_email}>`;
            } else if (smtpConfig) {
              fromEmail = `${smtpConfig.from_name} <onboarding@resend.dev>`;
            }

            console.log(`Trying Resend for ${recipient}...`);
            const resend = new Resend(resendApiKey);
            const { error: resendError } = await resend.emails.send({
              from: fromEmail,
              to: recipient,
              subject: subject,
              html: emailHtml,
            });

            if (resendError) throw new Error(resendError.message);

            emailSent = true;
            method = 'Resend';
            console.log(`Email sent via Resend to ${recipient}`);
          }
        } catch (resendError: any) {
          console.error(`Resend failed for ${recipient}:`, resendError.message);
          errorMessage = errorMessage ? `SMTP: ${errorMessage}; Resend: ${resendError.message}` : resendError.message;
        }
      }

      // Log to email_historico
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
      JSON.stringify({ 
        error: error.message || 'Erro ao enviar emails.',
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
