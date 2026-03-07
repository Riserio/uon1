import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  corretora_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { to, subject, html, corretora_id }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Campos to, subject e html são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailSent = false;
    let method = "";
    let errorMessage = "";

    // Try Resend first
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      try {
        let fromEmail = "Ouvidoria <vangard@uon1.com.br>";

        // Try to get Resend config from first admin
        const { data: adminUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .or("role.eq.admin,role.eq.superintendente")
          .limit(1);

        if (adminUsers && adminUsers.length > 0) {
          const { data: resendConfig } = await supabase
            .from("resend_config")
            .select("*")
            .eq("user_id", adminUsers[0].user_id)
            .single();

          if (resendConfig) {
            fromEmail = `${resendConfig.from_name} <${resendConfig.from_email}>`;
          }
        }

        console.log(`[Ouvidoria Email] Sending via Resend to ${to}`);
        const resend = new Resend(RESEND_API_KEY);
        const { error: resendError } = await resend.emails.send({
          from: fromEmail,
          to,
          subject,
          html,
        });

        if (resendError) throw new Error(resendError.message);
        emailSent = true;
        method = "Resend";
        console.log(`[Ouvidoria Email] Sent via Resend to ${to}`);
      } catch (err: any) {
        console.error(`[Ouvidoria Email] Resend failed:`, err.message);
        errorMessage = err.message;
      }
    }

    // Fallback to SMTP
    if (!emailSent) {
      try {
        const { data: adminUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .or("role.eq.admin,role.eq.superintendente")
          .limit(1);

        if (adminUsers && adminUsers.length > 0) {
          const { data: smtpConfig } = await supabase
            .from("email_config")
            .select("*")
            .eq("user_id", adminUsers[0].user_id)
            .single();

          if (smtpConfig) {
            const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
            let hostname = smtpConfig.smtp_host || "";
            hostname = hostname.replace(/^(ssl|tls|https?):\/\//i, "").trim();

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
              to,
              subject,
              html,
              content: subject,
            });

            await client.close();
            emailSent = true;
            method = "SMTP";
            console.log(`[Ouvidoria Email] Sent via SMTP to ${to}`);
          }
        }
      } catch (smtpErr: any) {
        console.error(`[Ouvidoria Email] SMTP failed:`, smtpErr.message);
        errorMessage = errorMessage ? `${errorMessage}; SMTP: ${smtpErr.message}` : smtpErr.message;
      }
    }

    // Log to email_historico
    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .or("role.eq.admin,role.eq.superintendente")
      .limit(1);

    await supabase.from("email_historico").insert({
      destinatario: to,
      assunto: subject,
      corpo: `[${method || "FALHA"}][Ouvidoria] ${subject}`,
      enviado_por: adminUsers?.[0]?.user_id || null,
      status: emailSent ? "enviado" : "erro",
      erro_mensagem: emailSent ? null : errorMessage,
      atendimento_id: null,
    });

    return new Response(
      JSON.stringify({
        success: emailSent,
        method: method || "nenhum",
        error: emailSent ? undefined : errorMessage,
      }),
      {
        status: emailSent ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("[Ouvidoria Email] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
