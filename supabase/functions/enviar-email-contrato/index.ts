import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function defaultHtml(nome: string, titulo: string, link: string, empresa: string) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:20px">
      <h2 style="color:#2563eb;margin:0">Contrato para assinatura</h2>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px">
      <p>Olá <strong>${nome}</strong>,</p>
      <p>Você foi convidado(a) a assinar o contrato <strong>${titulo}</strong>.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Assinar contrato</a>
      </p>
      <p style="font-size:12px;color:#666">Ou copie este link: <br>${link}</p>
    </div>
    <div style="margin-top:20px;text-align:center;color:#6b7280;font-size:12px">
      <p>${empresa}</p>
    </div>
  </body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth (allow service-role calls without token for triggers)
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "").trim();
      const { data } = await supabase.auth.getUser(token);
      if (data?.user) userId = data.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const { contrato_id, assinatura_ids, trigger_user_id } = body as {
      contrato_id?: string;
      assinatura_ids?: string[];
      trigger_user_id?: string;
    };

    if (!contrato_id) {
      return new Response(JSON.stringify({ error: "contrato_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load contract + signatories
    const { data: contrato, error: contratoErr } = await supabase
      .from("contratos")
      .select("*, contrato_assinaturas(*), corretoras:corretora_id(nome, logo_url)")
      .eq("id", contrato_id)
      .maybeSingle();

    if (contratoErr || !contrato) {
      return new Response(JSON.stringify({ error: "Contrato não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contrato.link_token) {
      return new Response(JSON.stringify({ error: "Contrato sem link de assinatura" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerUserId = userId || trigger_user_id || contrato.user_id;

    // Filter signatories
    const todas: any[] = contrato.contrato_assinaturas || [];
    const alvo = todas
      .filter((a) => a.status !== "assinado" && a.email)
      .filter((a) => !assinatura_ids || assinatura_ids.length === 0 || assinatura_ids.includes(a.id));

    if (alvo.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum signatário pendente com e-mail" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve template + resend config (per user)
    const { data: template } = await supabase
      .from("email_templates")
      .select("*")
      .eq("user_id", ownerUserId)
      .eq("tipo", "contrato_assinatura")
      .eq("ativo", true)
      .maybeSingle();

    const { data: resendConfig } = await supabase
      .from("resend_config")
      .select("*")
      .eq("user_id", ownerUserId)
      .maybeSingle();

    const fromEmail = resendConfig
      ? `${resendConfig.from_name} <${resendConfig.from_email}>`
      : "Contratos <vangard@uon1.com.br>";
    const empresa = (contrato.corretoras as any)?.nome || resendConfig?.from_name || "Uon1";
    const baseUrl = (Deno.env.get("APP_URL") || "https://vangard.uon1.com.br").replace(/\/$/, "");

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resend = new Resend(RESEND_API_KEY);

    const results: any[] = [];
    for (const a of alvo) {
      const link = `${baseUrl}/contrato/${contrato.link_token}?s=${a.id}`;
      const vars: Record<string, string> = {
        nome: a.nome || "",
        titulo: contrato.titulo || "",
        numero: contrato.numero || "",
        link,
        empresa,
        vencimento: contrato.link_expires_at
          ? new Date(contrato.link_expires_at).toLocaleDateString("pt-BR")
          : "",
      };

      const assunto = template?.assunto
        ? renderTemplate(template.assunto, vars)
        : `Contrato para assinatura: ${contrato.titulo}`;
      const corpoTpl = template?.corpo ? renderTemplate(template.corpo, vars) : null;
      const isHtml = !!corpoTpl && /<\/?[a-z][\s\S]*>/i.test(corpoTpl);
      const corpoRender = corpoTpl
        ? (isHtml ? corpoTpl : corpoTpl.replace(/\n/g, "<br>"))
        : null;
      const ctaButton = `<p style="text-align:center;margin:28px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;font-family:Arial,sans-serif">Assinar contrato</a></p>`;
      // Append CTA only if the template body doesn't already include the link
      const incluiCta = corpoTpl ? corpoTpl.includes(link) : false;
      const html = corpoRender
        ? `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5"><div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333;line-height:1.6;background:#ffffff">${corpoRender}${incluiCta ? "" : ctaButton}</div></body></html>`
        : defaultHtml(a.nome || "", contrato.titulo || "", link, empresa);

      let status = "enviado";
      let erro: string | null = null;
      try {
        const { error: sendErr } = await resend.emails.send({
          from: fromEmail,
          to: a.email,
          subject: assunto,
          html,
        });
        if (sendErr) throw new Error(sendErr.message);
      } catch (e: any) {
        status = "erro";
        erro = e?.message || String(e);
      }

      await supabase.from("email_historico").insert({
        destinatario: a.email,
        assunto,
        corpo: corpoTpl || `Link de assinatura enviado para ${a.nome}: ${link}`,
        enviado_por: ownerUserId,
        status,
        erro_mensagem: erro,
        contrato_id: contrato.id,
        contrato_assinatura_id: a.id,
      });

      if (status === "enviado") {
        await supabase.from("contrato_historico").insert({
          contrato_id: contrato.id,
          acao: "email_enviado",
          descricao: `E-mail de assinatura enviado para ${a.nome} <${a.email}>`,
          user_id: ownerUserId,
        });
      }

      results.push({ assinatura_id: a.id, email: a.email, status, erro });
    }

    const enviados = results.filter((r) => r.status === "enviado").length;
    return new Response(
      JSON.stringify({ success: true, enviados, total: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("enviar-email-contrato error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});