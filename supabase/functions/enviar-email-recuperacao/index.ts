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
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9fafb;
              border-radius: 8px;
              padding: 30px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .header h1 {
              color: #1f2937;
              margin: 0;
            }
            .content {
              background-color: white;
              border-radius: 6px;
              padding: 25px;
              margin-bottom: 20px;
            }
            .button {
              display: inline-block;
              background-color: #3b82f6;
              color: white;
              text-decoration: none;
              padding: 12px 30px;
              border-radius: 6px;
              font-weight: 500;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              color: #6b7280;
              font-size: 14px;
            }
            .link {
              color: #3b82f6;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Recuperação de Senha</h1>
            </div>
            <div class="content">
              <p>Olá,</p>
              <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
              <p>Clique no botão abaixo para criar uma nova senha:</p>
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Redefinir Senha</a>
              </div>
              <p style="margin-top: 20px;">Ou copie e cole este link no seu navegador:</p>
              <p class="link">${resetLink}</p>
              <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <strong>Este link expira em 1 hora.</strong>
              </p>
              <p style="color: #6b7280; font-size: 14px;">
                Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança.
              </p>
            </div>
            <div class="footer">
              <p>Este é um e-mail automático, por favor não responda.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailText = `
Recuperação de Senha

Olá,

Recebemos uma solicitação para redefinir a senha da sua conta.

Clique no link abaixo para criar uma nova senha:
${resetLink}

Este link expira em 1 hora.

Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança.

---
Este é um e-mail automático, por favor não responda.
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
          subject: "Recuperação de Senha - ATCD",
          content: emailText,
          html: emailHtml,
          headers: {
            "X-Priority": "1",
            "X-MSMail-Priority": "High",
            Importance: "high",
            "X-Mailer": "ATCD Sistema",
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

        let resendFromEmail = "ATCD Sistema <vangard@uon1.com.br>";
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
          subject: "Recuperação de Senha - ATCD",
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
