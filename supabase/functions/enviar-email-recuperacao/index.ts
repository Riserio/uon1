import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RecuperacaoEmailRequest {
  to: string;
  resetLink: string;
  fromEmail?: string;
  fromName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { to, resetLink: redirectTo, fromEmail, fromName }: RecuperacaoEmailRequest = await req.json();

    // Gera link real de recuperação (com token) via Admin API
    let resetLink = redirectTo;
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: to,
        options: { redirectTo },
      });
      if (linkError) {
        console.error("generateLink error:", linkError.message);
      } else if (linkData?.properties?.action_link) {
        resetLink = linkData.properties.action_link;
      }
    } catch (e: any) {
      console.error("generateLink exception:", e.message);
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
            <div style="background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8ee;">
              <div style="padding:28px 32px 24px;border-bottom:1px solid #eeeef4;text-align:center;">
                <img src="https://uon1.lovable.app/images/logo-full.png" alt="uon1" style="max-height:44px;display:inline-block;" />
              </div>
              <div style="padding:32px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#F06F19;">Segurança da conta</p>
                <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#1f1b2d;">Recuperação de senha</h1>
                <p style="margin:0 0 12px;color:#3f3d4d;font-size:15px;line-height:1.6;">Olá,</p>
                <p style="margin:0 0 24px;color:#3f3d4d;font-size:15px;line-height:1.6;">Recebemos uma solicitação para redefinir a senha da sua conta no <strong>uon1</strong>. Clique no botão abaixo para criar uma nova senha:</p>
                <div style="text-align:center;margin:8px 0 24px;">
                  <a href="${resetLink}" style="display:inline-block;background-color:#362C89;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:600;font-size:15px;">Redefinir senha</a>
                </div>
                <p style="margin:0 0 8px;color:#6b6a7a;font-size:13px;">Ou copie e cole este link no seu navegador:</p>
                <p style="margin:0 0 24px;color:#362C89;font-size:12px;word-break:break-all;">${resetLink}</p>
                <div style="border-top:1px solid #eeeef4;padding-top:20px;">
                  <p style="margin:0 0 12px;color:#1f1b2d;font-size:14px;"><strong>Este link expira em 1 hora.</strong></p>
                  <p style="margin:0;color:#6b6a7a;font-size:13px;line-height:1.6;">Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança — sua senha atual permanece a mesma.</p>
                </div>
              </div>
            </div>
            <div style="text-align:center;padding:20px 0;color:#9b99a8;font-size:12px;line-height:1.6;">
              <p style="margin:0;">Este é um e-mail automático enviado pelo uon1, por favor não responda.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailText = `
Recuperação de Senha — uon1

Olá,

Recebemos uma solicitação para redefinir a senha da sua conta no uon1.

Clique no link abaixo para criar uma nova senha:
${resetLink}

Este link expira em 1 hora.

Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança.

---
Este é um e-mail automático enviado pelo uon1, por favor não responda.
    `.trim();

    let emailSent = false;
    let method = "";
    let errorMessage = "";

    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .or("role.eq.admin,role.eq.superintendente")
      .limit(1);

    let smtpConfig = null;
    if (adminUsers && adminUsers.length > 0) {
      const { data } = await supabase.from("email_config").select("*").eq("user_id", adminUsers[0].user_id).single();

      smtpConfig = data;
    }

    if (smtpConfig) {
      try {
        console.log(`Trying SMTP for password recovery to ${to}...`);
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

        const fromAddress =
          fromEmail && fromName ? `${fromName} <${fromEmail}>` : `${smtpConfig.from_name} <${smtpConfig.from_email}>`;

        await client.send({
          from: fromAddress,
          to: to,
          subject: "Recuperação de Senha — uon1",
          content: emailText,
          html: emailHtml,
          headers: {
            "X-Priority": "1",
            "X-MSMail-Priority": "High",
            Importance: "high",
            "X-Mailer": "uon1",
            "Reply-To": smtpConfig.from_email,
          },
        });

        await client.close();

        emailSent = true;
        method = "SMTP";
        console.log(`Password recovery email sent via SMTP to ${to}`);
      } catch (smtpError: any) {
        console.error(`SMTP failed for ${to}:`, smtpError.message);
        errorMessage = smtpError.message;
      }
    }

    if (!emailSent) {
      try {
        console.log(`Trying Resend for password recovery to ${to}...`);

        let resendFromEmail = "uon1 <vangard@uon1.com.br>";
        if (adminUsers && adminUsers.length > 0) {
          const { data: resendConfig } = await supabase
            .from("resend_config")
            .select("*")
            .eq("user_id", adminUsers[0].user_id)
            .single();

          if (resendConfig) {
            resendFromEmail = `${resendConfig.from_name} <${resendConfig.from_email}>`;
          }
        }

        if (fromEmail && fromName) {
          resendFromEmail = `${fromName} <${fromEmail}>`;
        }

        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
        const { error: resendError } = await resend.emails.send({
          from: resendFromEmail,
          to: [to],
          subject: "Recuperação de Senha — uon1",
          html: emailHtml,
          text: emailText,
          headers: {
            "X-Priority": "1",
            "X-Entity-Ref-ID": `pwd-reset-${Date.now()}`,
          },
        });

        if (resendError) {
          throw new Error(resendError.message);
        }

        emailSent = true;
        method = "Resend";
        console.log(`Password recovery email sent via Resend to ${to}`);
      } catch (resendError: any) {
        console.error(`Resend failed for ${to}:`, resendError.message);
        errorMessage = errorMessage ? `${errorMessage}; Resend: ${resendError.message}` : resendError.message;
      }
    }

    if (!emailSent) {
      console.error(`Failed to send password recovery email to ${to}: ${errorMessage}`);
      return new Response(
        JSON.stringify({
          error: "Falha ao enviar email de recuperação",
          details: errorMessage,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Password recovery email sent successfully via ${method} to ${to}`);

    return new Response(
      JSON.stringify({
        success: true,
        method: method,
        message: "Email de recuperação enviado com sucesso",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error in enviar-email-recuperacao:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
