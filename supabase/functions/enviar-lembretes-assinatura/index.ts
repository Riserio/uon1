import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = Deno.env.get("APP_URL") || "https://uon1.lovable.app";

function buildHtml(opts: {
  signatarioNome: string;
  contratoTitulo: string;
  contratoNumero: string;
  link: string;
  diasAguardando: number;
  logoUrl?: string | null;
  remetenteNome?: string | null;
}) {
  const { signatarioNome, contratoTitulo, contratoNumero, link, diasAguardando, logoUrl, remetenteNome } = opts;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #eef2f7;">
          ${logoUrl ? `<img src="${logoUrl}" alt="logo" style="max-height:40px;"/>` : `<div style="font-weight:700;font-size:18px;color:#362C89;">Uon1 Sign</div>`}
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;">Olá, ${signatarioNome || "tudo bem"}!</h1>
          <p style="margin:0 0 12px;color:#4b5563;line-height:1.6;">
            Notamos que você ainda não assinou o contrato <strong>${contratoTitulo}</strong> (${contratoNumero}) enviado há ${diasAguardando} dia(s).
          </p>
          <p style="margin:0 0 24px;color:#4b5563;line-height:1.6;">
            A assinatura é rápida e segura, basta clicar no botão abaixo:
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${link}" style="display:inline-block;padding:14px 28px;background:#362C89;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Assinar agora</a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;word-break:break-all;">
            Se o botão não funcionar, copie e cole este link no navegador:<br/>${link}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #eef2f7;color:#9ca3af;font-size:12px;text-align:center;">
          Lembrete automático enviado por ${remetenteNome || "Uon1 Sign"}. Por favor, não responda este e-mail.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY ausente" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resend = new Resend(RESEND_API_KEY);

    // Carrega contratos elegíveis: aguardando assinatura + lembretes ativos + não expirados
    const { data: contratos, error } = await supabase
      .from("contratos")
      .select(`
        id, numero, titulo, link_token, link_expires_at, lembrete_dias, lembrete_ativo,
        created_at, corretora_id,
        corretoras:corretora_id(nome, logo_url),
        contrato_assinaturas(*)
      `)
      .eq("status", "aguardando_assinatura")
      .eq("lembrete_ativo", true);

    if (error) throw error;

    const agora = new Date();
    let enviados = 0;
    let pulados = 0;
    const detalhes: any[] = [];

    for (const c of (contratos || []) as any[]) {
      if (!c.link_token) continue;
      if (c.link_expires_at && new Date(c.link_expires_at) < agora) continue;

      const diasConfig: number[] = Array.isArray(c.lembrete_dias) && c.lembrete_dias.length > 0
        ? c.lembrete_dias
        : [3, 7, 14];

      const enviadoEm = new Date(c.created_at);
      const diasDesdeEnvio = Math.floor((agora.getTime() - enviadoEm.getTime()) / (1000 * 60 * 60 * 24));

      // Pega o gatilho do dia mais alto já alcançado
      const gatilho = [...diasConfig].sort((a, b) => b - a).find((d) => diasDesdeEnvio >= d);
      if (!gatilho) { pulados++; continue; }

      const pendentes = (c.contrato_assinaturas || []).filter((a: any) => a.status === "pendente" && a.email);
      if (pendentes.length === 0) continue;

      const link = `${APP_URL}/contrato/${c.link_token}`;
      const logo = c.corretoras?.logo_url || null;
      const remetente = c.corretoras?.nome || "Uon1 Sign";

      for (const a of pendentes) {
        // já lembrado em janela do mesmo gatilho? (evita duplicar dentro do mesmo "tier")
        if (a.ultimo_lembrete_em) {
          const ultimo = new Date(a.ultimo_lembrete_em);
          const diasDesdeUltimo = Math.floor((agora.getTime() - ultimo.getTime()) / (1000 * 60 * 60 * 24));
          // Procura o próximo gatilho após o último envio
          const diasDesdeEnvioNoUltimo = Math.floor((ultimo.getTime() - enviadoEm.getTime()) / (1000 * 60 * 60 * 24));
          const proximoGatilho = diasConfig.find((d) => d > diasDesdeEnvioNoUltimo);
          if (!proximoGatilho || diasDesdeEnvio < proximoGatilho || diasDesdeUltimo < 1) {
            pulados++; continue;
          }
        }

        try {
          const html = buildHtml({
            signatarioNome: a.nome || a.email,
            contratoTitulo: c.titulo || "seu contrato",
            contratoNumero: c.numero || "",
            link,
            diasAguardando: diasDesdeEnvio,
            logoUrl: logo,
            remetenteNome: remetente,
          });

          await resend.emails.send({
            from: `${remetente} <onboarding@resend.dev>`,
            to: [a.email],
            subject: `Lembrete: assine o contrato ${c.numero || c.titulo}`,
            html,
          });

          await supabase
            .from("contrato_assinaturas")
            .update({ ultimo_lembrete_em: agora.toISOString() })
            .eq("id", a.id);

          await supabase.from("contrato_historico").insert({
            contrato_id: c.id,
            acao: "lembrete_enviado",
            descricao: `Lembrete automático enviado para ${a.email} (${diasDesdeEnvio} dias aguardando)`,
          });

          enviados++;
          detalhes.push({ contrato: c.numero, email: a.email, dias: diasDesdeEnvio });
        } catch (e: any) {
          console.error("Erro ao enviar lembrete:", e?.message);
          detalhes.push({ contrato: c.numero, email: a.email, erro: e?.message });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, enviados, pulados, detalhes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("enviar-lembretes-assinatura:", e);
    return new Response(JSON.stringify({ error: e?.message || "erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});