import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '').trim();
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) userId = user.id;
      } catch (e) {
        console.error('Error decoding token:', e);
      }
    }

    const { to, subject, message, atendimentoAssunto, atendimentoId, status } = await req.json();
    const recipients = Array.isArray(to) ? to : [to];

    const statusLabels: Record<string, string> = {
      novo: "Novo",
      andamento: "Em andamento",
      aguardo: "Aguardando retorno",
      concluido: "Concluído"
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #2563eb; margin: 0 0 10px 0;">Atualização de Atendimento</h2>
            ${status ? `<p style="margin: 0; color: #666; font-size: 14px;">Status: <strong>${statusLabels[status] || status}</strong></p>` : ''}
          </div>
          
          <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
            ${atendimentoAssunto ? `<h3 style="color: #374151; margin-top: 0;">Assunto: ${atendimentoAssunto}</h3>` : ''}
            <div style="border-left: 4px solid #2563eb; padding-left: 16px; margin: 20px 0;">
              <p style="margin: 0; white-space: pre-wrap;">${message}</p>
            </div>
          </div>
          
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
            <p>Esta é uma mensagem automática do sistema de atendimentos. Por favor, não responda este e-mail.</p>
          </div>
        </body>
      </html>
    `;

    const results = [];
    let smtpConfig = null;
    
    if (userId) {
      const { data } = await supabase
        .from('email_config')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      smtpConfig = data;
    }

    for (const recipient of recipients) {
      let emailSent = false;
      let method = '';
      let errorMessage = '';

      if (smtpConfig) {
        try {
          console.log(`Trying SMTP for ${recipient}...`);
          const client = new SMTPClient({
            connection: {
              hostname: smtpConfig.smtp_host,
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
        } catch (smtpError: any) {
          console.error(`SMTP failed for ${recipient}:`, smtpError.message);
          errorMessage = smtpError.message;
        }
      }

      if (!emailSent) {
        try {
          console.log(`Trying Resend for ${recipient}...`);
          
          let fromEmail = "Atendimentos <onboarding@resend.dev>";
          if (userId) {
            const { data: resendConfig } = await supabase
              .from('resend_config')
              .select('*')
              .eq('user_id', userId)
              .single();

            if (resendConfig) {
              fromEmail = `${resendConfig.from_name} <${resendConfig.from_email}>`;
            }
          }

          const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
          const { error: resendError } = await resend.emails.send({
            from: fromEmail,
            to: recipient,
            subject: subject,
            html: emailHtml,
          });

          if (resendError) {
            throw new Error(resendError.message);
          }

          emailSent = true;
          method = 'Resend';
          console.log(`Email sent via Resend to ${recipient}`);
        } catch (resendError: any) {
          console.error(`Resend failed for ${recipient}:`, resendError.message);
          errorMessage = errorMessage ? `${errorMessage}; Resend: ${resendError.message}` : resendError.message;
        }
      }

      if (userId && atendimentoId) {
        await supabase.from('email_historico').insert({
          destinatario: recipient,
          assunto: subject,
          corpo: `[${method || 'FALHA'}] ${message}`,
          enviado_por: userId,
          status: emailSent ? 'enviado' : 'erro',
          erro_mensagem: emailSent ? null : errorMessage,
          atendimento_id: atendimentoId,
        });
      }

      results.push({
        email: recipient,
        status: emailSent ? 'enviado' : 'erro',
        method: method || 'nenhum',
        error: emailSent ? undefined : errorMessage
      });
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in enviar-email-atendimento:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
