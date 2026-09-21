import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function gerarSenha(): string {
  const maiusc = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const minusc = "abcdefghijkmnopqrstuvwxyz";
  const nums = "23456789";
  const simb = "!@#$%&*";
  const all = maiusc + minusc + nums + simb;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let senha = pick(maiusc) + pick(minusc) + pick(nums) + pick(simb);
  for (let i = 0; i < 6; i++) senha += pick(all);
  return senha
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Autorização: quem chama precisa ser admin / superintendente / administrativo
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!userRole || !["admin", "superintendente", "administrativo"].includes(userRole.role)) {
      return new Response(JSON.stringify({ error: "Sem permissão para enviar acessos" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email: string = (body.email ?? "").trim();
    const nome: string = body.nome ?? "";
    const userId: string | null = body.userId ?? null;
    const loginUrl: string = body.loginUrl || "https://uon1.lovable.app/auth";
    let senha: string | null = body.senha ?? null;

    if (!email) throw new Error("E-mail do usuário não informado");

    // Reenvio manual: gera uma nova senha temporária
    if (!senha) {
      senha = gerarSenha();
      let alvoId = userId;
      if (!alvoId) {
        const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        alvoId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
      }
      if (!alvoId) throw new Error("Usuário não encontrado");

      const { error: updErr } = await supabase.auth.admin.updateUserById(alvoId, {
        password: senha,
        email_confirm: true,
      });
      if (updErr) throw new Error(`Não foi possível definir a nova senha: ${updErr.message}`);

      await supabase.from("profiles").update({ status: "primeiro_login" }).eq("id", alvoId);
    }

    const primeiroNome = (nome || email).split(" ")[0];

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background-color:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
            <div style="background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8ee;">
              <div style="padding:28px 32px 24px;border-bottom:1px solid #eeeef4;text-align:center;">
                <img src="https://uon1.lovable.app/images/logo-full.png" alt="uon1" style="max-height:44px;display:inline-block;" />
              </div>
              <div style="padding:32px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#F06F19;">Acesso ao sistema</p>
                <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#1f1b2d;">Bem-vindo(a) ao uon1</h1>
                <p style="margin:0 0 12px;color:#3f3d4d;font-size:15px;line-height:1.6;">Olá, ${primeiroNome}!</p>
                <p style="margin:0 0 24px;color:#3f3d4d;font-size:15px;line-height:1.6;">Sua conta foi criada. Use os dados abaixo para entrar:</p>
                <div style="background:#f7f6fb;border:1px solid #eeeef4;border-radius:12px;padding:20px 22px;margin:0 0 24px;">
                  <p style="margin:0 0 10px;color:#6b6a7a;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Login</p>
                  <p style="margin:0 0 18px;color:#1f1b2d;font-size:16px;font-weight:600;">${email}</p>
                  <p style="margin:0 0 10px;color:#6b6a7a;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Senha temporária</p>
                  <p style="margin:0;color:#1f1b2d;font-size:20px;font-weight:700;letter-spacing:1px;font-family:'Courier New',monospace;">${senha}</p>
                </div>
                <div style="text-align:center;margin:8px 0 24px;">
                  <a href="${loginUrl}" style="display:inline-block;background-color:#362C89;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:600;font-size:15px;">Acessar o sistema</a>
                </div>
                <p style="margin:0 0 8px;color:#6b6a7a;font-size:13px;">Ou copie e cole este link no seu navegador:</p>
                <p style="margin:0 0 24px;color:#362C89;font-size:12px;word-break:break-all;">${loginUrl}</p>
                <div style="border-top:1px solid #eeeef4;padding-top:20px;">
                  <p style="margin:0;color:#6b6a7a;font-size:13px;line-height:1.6;">Por segurança, altere a senha no primeiro acesso e não compartilhe estes dados com ninguém.</p>
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

    const emailText = `Bem-vindo(a) ao uon1

Olá, ${primeiroNome}!

Sua conta foi criada. Use os dados abaixo para entrar:

Login: ${email}
Senha temporária: ${senha}

Acesse: ${loginUrl}

Por segurança, altere a senha no primeiro acesso.`;

    const assunto = "Seus dados de acesso — uon1";

    let emailSent = false;
    let method = "";
    let errorMessage = "";

    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .or("role.eq.admin,role.eq.superintendente")
      .limit(1);

    let smtpConfig: any = null;
    if (adminUsers && adminUsers.length > 0) {
      const { data } = await supabase
        .from("email_config")
        .select("*")
        .eq("user_id", adminUsers[0].user_id)
        .maybeSingle();
      smtpConfig = data;
    }

    if (smtpConfig) {
      try {
        const client = new SMTPClient({
          connection: {
            hostname: smtpConfig.smtp_host,
            port: smtpConfig.smtp_port,
            tls: true,
            auth: { username: smtpConfig.smtp_user, password: smtpConfig.smtp_password },
          },
        });
        await client.send({
          from: `${smtpConfig.from_name} <${smtpConfig.from_email}>`,
          to: email,
          subject: assunto,
          content: emailText,
          html: emailHtml,
        });
        await client.close();
        emailSent = true;
        method = "SMTP";
      } catch (smtpError: any) {
        console.error("SMTP falhou:", smtpError.message);
        errorMessage = smtpError.message;
      }
    }

    if (!emailSent) {
      try {
        let resendFrom = "uon1 <vangard@uon1.com.br>";
        if (adminUsers && adminUsers.length > 0) {
          const { data: resendConfig } = await supabase
            .from("resend_config")
            .select("*")
            .eq("user_id", adminUsers[0].user_id)
            .maybeSingle();
          if (resendConfig) resendFrom = `${resendConfig.from_name} <${resendConfig.from_email}>`;
        }

        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
        const { error: resendError } = await resend.emails.send({
          from: resendFrom,
          to: [email],
          subject: assunto,
          html: emailHtml,
          text: emailText,
        });
        if (resendError) throw new Error(resendError.message);
        emailSent = true;
        method = "Resend";
      } catch (e: any) {
        console.error("Resend falhou:", e.message);
        errorMessage = e.message;
      }
    }

    if (!emailSent) {
      return new Response(JSON.stringify({ success: false, error: errorMessage || "Falha ao enviar e-mail" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, method }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("enviar-email-acesso erro:", error);
    return new Response(JSON.stringify({ success: false, error: error?.message ?? "Erro inesperado" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
