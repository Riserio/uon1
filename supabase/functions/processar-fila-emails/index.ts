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

    // Get pending emails from queue
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pendente')
      .lte('agendado_para', new Date().toISOString())
      .lt('tentativas', 3)
      .order('prioridade', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) throw fetchError;
    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const email of pendingEmails) {
      processed++;
      
      // Get atendimento details
      let atendimentoAssunto = '';
      if (email.atendimento_id) {
        const { data: atendimento } = await supabase
          .from('atendimentos')
          .select('assunto, status')
          .eq('id', email.atendimento_id)
          .single();
        
        if (atendimento) {
          atendimentoAssunto = atendimento.assunto;
        }
      }

      // Get user's SMTP config
      const { data: userRoles } = await supabase
        .from('email_queue')
        .select('*')
        .eq('id', email.id)
        .single();

      // Get first admin/superintendente user
      const { data: adminUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .or('role.eq.admin,role.eq.superintendente')
        .limit(1);

      let smtpConfig = null;
      if (adminUsers && adminUsers.length > 0) {
        const { data } = await supabase
          .from('email_config')
          .select('*')
          .eq('user_id', adminUsers[0].user_id)
          .single();
        
        smtpConfig = data;
      }

      let emailSent = false;
      let errorMessage = '';
      let method = '';

      // Try SMTP first
      if (smtpConfig) {
        try {
          const useImplicitTls = smtpConfig.smtp_port === 465;
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

          const emailHtml = email.corpo.replace(/\n/g, '<br>');

          await client.send({
            from: `${smtpConfig.from_name} <${smtpConfig.from_email}>`,
            to: email.destinatario,
            subject: email.assunto,
            content: email.corpo,
            html: emailHtml,
            headers: {
              'X-Priority': '3',
              'X-Mailer': 'ATCD Sistema',
              'Reply-To': smtpConfig.from_email,
            },
          });

          await client.close();
          emailSent = true;
          method = 'SMTP';
        } catch (smtpError: any) {
          console.error(`SMTP failed:`, smtpError.message);
          errorMessage = smtpError.message;
        }
      }

      // Fallback to Resend
      if (!emailSent) {
        try {
          let fromEmail = "Atendimentos <onboarding@resend.dev>";
          if (adminUsers && adminUsers.length > 0) {
            const { data: resendConfig } = await supabase
              .from('resend_config')
              .select('*')
              .eq('user_id', adminUsers[0].user_id)
              .single();

            if (resendConfig) {
              fromEmail = `${resendConfig.from_name} <${resendConfig.from_email}>`;
            }
          }

          const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
          const emailHtml = email.corpo.replace(/\n/g, '<br>');
          
          const { error: resendError } = await resend.emails.send({
            from: fromEmail,
            to: email.destinatario,
            subject: email.assunto,
            html: emailHtml,
          });

          if (resendError) throw new Error(resendError.message);

          emailSent = true;
          method = 'Resend';
        } catch (resendError: any) {
          errorMessage = errorMessage ? `${errorMessage}; Resend: ${resendError.message}` : resendError.message;
        }
      }

      // Update queue status
      if (emailSent) {
        await supabase
          .from('email_queue')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            tentativas: email.tentativas + 1,
          })
          .eq('id', email.id);

        // Log to history if there's an atendimento
        if (email.atendimento_id && adminUsers && adminUsers.length > 0) {
          await supabase.from('email_historico').insert({
            destinatario: email.destinatario,
            assunto: email.assunto,
            corpo: `[${method}] ${email.corpo}`,
            enviado_por: adminUsers[0].user_id,
            status: 'enviado',
            atendimento_id: email.atendimento_id,
          });
        }

        succeeded++;
      } else {
        await supabase
          .from('email_queue')
          .update({
            status: email.tentativas + 1 >= 3 ? 'falhou' : 'pendente',
            tentativas: email.tentativas + 1,
            erro_mensagem: errorMessage,
            agendado_para: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Retry in 5 minutes
          })
          .eq('id', email.id);

        failed++;
      }
    }

    return new Response(
      JSON.stringify({ 
        processed,
        succeeded,
        failed,
        message: `Processados: ${processed}, Enviados: ${succeeded}, Falhados: ${failed}` 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in processar-fila-emails:', error);
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
