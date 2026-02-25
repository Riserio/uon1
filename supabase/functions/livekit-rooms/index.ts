import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── helpers ──────────────────────────────────────────────────────────
function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createLiveKitToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  roomName: string,
  grants: Record<string, unknown>,
  ttlSeconds = 3600
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: apiKey,
    sub: identity,
    nbf: now,
    exp: now + ttlSeconds,
    video: grants,
  };
  if (grants.name) {
    payload.name = grants.name;
    delete (grants as any).name;
  }

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerB64}.${payloadB64}`));
  return `${headerB64}.${payloadB64}.${base64url(new Uint8Array(sig))}`;
}

// ── main ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const livekitUrl = Deno.env.get("LIVEKIT_URL")!;
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // helper: get authed user
    const getUser = async () => {
      const { data: { user }, error } = await supabaseAnon.auth.getUser();
      if (error || !user) throw new Error("Não autenticado");
      return user;
    };

    // ── CREATE ROOM ──
    if (action === "createRoom") {
      const user = await getUser();
      const body = await req.json();
      const roomName = `uon1-${crypto.randomUUID().substring(0, 12)}`;

      const { data, error } = await supabaseAdmin.from("meeting_rooms").insert({
        nome: body.nome,
        descricao: body.descricao || null,
        tipo: body.tipo || "privada",
        host_id: user.id,
        livekit_room_name: roomName,
        max_participantes: body.max_participantes || 50,
        agendado_para: body.agendado_para || null,
        convidados: body.convidados || [],
      }).select().single();

      if (error) throw error;

      // Register host as participant
      await supabaseAdmin.from("meeting_participants").insert({
        room_id: data.id,
        user_id: user.id,
        identity: user.id,
        display_name: user.user_metadata?.nome || user.email || "Host",
        status: "approved",
        is_host: true,
        joined_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ room: data, livekitUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST ROOMS ──
    if (action === "listRooms") {
      await getUser();
      const { data, error } = await supabaseAdmin
        .from("meeting_rooms")
        .select("*, meeting_participants(id, display_name, status, is_host)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ rooms: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET TOKEN (authenticated user) ──
    if (action === "getToken") {
      const user = await getUser();
      const body = await req.json();
      const roomId = body.roomId;

      const { data: room, error } = await supabaseAdmin
        .from("meeting_rooms")
        .select("*")
        .eq("id", roomId)
        .single();
      if (error || !room) throw new Error("Sala não encontrada");

      const isHost = room.host_id === user.id;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("nome")
        .eq("id", user.id)
        .single();
      const displayName = profile?.nome || user.email || "Participante";

      // Check if participant already exists
      const { data: existingParticipant } = await supabaseAdmin
        .from("meeting_participants")
        .select("id, status")
        .eq("room_id", roomId)
        .eq("identity", user.id)
        .single();

      let participantStatus: string;
      if (existingParticipant) {
        // Keep existing status (don't reset approved back to pending)
        participantStatus = existingParticipant.status;
        await supabaseAdmin.from("meeting_participants").update({
          display_name: displayName,
          joined_at: new Date().toISOString(),
        }).eq("id", existingParticipant.id);
      } else {
        participantStatus = isHost ? "approved" : "pending";
        await supabaseAdmin.from("meeting_participants").insert({
          room_id: roomId,
          user_id: user.id,
          identity: user.id,
          display_name: displayName,
          status: participantStatus,
          is_host: isHost,
          joined_at: new Date().toISOString(),
        });
      }

      const canPublish = isHost || participantStatus === "approved";
      const token = await createLiveKitToken(livekitApiKey, livekitApiSecret, user.id, room.livekit_room_name, {
        roomJoin: true,
        room: room.livekit_room_name,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
        name: displayName,
      });

      return new Response(
        JSON.stringify({ token, livekitUrl, room, isHost, participantStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── CREATE INVITE ──
    if (action === "createInvite") {
      const user = await getUser();
      const body = await req.json();

      const { data, error } = await supabaseAdmin.from("meeting_invites").insert({
        room_id: body.roomId,
        criado_por: user.id,
        nome_convidado: body.nome || null,
        email_convidado: body.email || null,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ invite: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── JOIN VIA INVITE (public, no auth needed) ──
    if (action === "joinViaInvite") {
      const body = await req.json();
      const { inviteId, displayName } = body;

      const { data: invite, error: invErr } = await supabaseAdmin
        .from("meeting_invites")
        .select("*, meeting_rooms(*)")
        .eq("id", inviteId)
        .single();

      if (invErr || !invite) throw new Error("Convite inválido");
      if (new Date(invite.expires_at) < new Date()) throw new Error("Convite expirado");

      const room = invite.meeting_rooms;
      const guestIdentity = `guest-${crypto.randomUUID().substring(0, 8)}`;

      // Insert participant as pending
      await supabaseAdmin.from("meeting_participants").insert({
        room_id: room.id,
        identity: guestIdentity,
        display_name: displayName || "Convidado",
        status: "pending",
        is_host: false,
        invite_id: invite.id,
      });

      // Token with canPublish=false (pending)
      const token = await createLiveKitToken(livekitApiKey, livekitApiSecret, guestIdentity, room.livekit_room_name, {
        roomJoin: true,
        room: room.livekit_room_name,
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
        name: displayName || "Convidado",
      });

      return new Response(
        JSON.stringify({ token, livekitUrl, room, participantIdentity: guestIdentity }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── APPROVE PARTICIPANT ──
    if (action === "approveParticipant") {
      const user = await getUser();
      const body = await req.json();

      // Verify host
      const { data: room } = await supabaseAdmin
        .from("meeting_rooms")
        .select("*")
        .eq("id", body.roomId)
        .eq("host_id", user.id)
        .single();
      if (!room) throw new Error("Apenas o host pode aprovar");

      // Update participant status
      await supabaseAdmin
        .from("meeting_participants")
        .update({ status: "approved", joined_at: new Date().toISOString() })
        .eq("id", body.participantId);

      // Get participant info for new token
      const { data: participant } = await supabaseAdmin
        .from("meeting_participants")
        .select("*")
        .eq("id", body.participantId)
        .single();

      if (!participant) throw new Error("Participante não encontrado");

      // Generate new token with publish permissions
      const newToken = await createLiveKitToken(
        livekitApiKey, livekitApiSecret,
        participant.identity, room.livekit_room_name,
        {
          roomJoin: true,
          room: room.livekit_room_name,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          name: participant.display_name,
        }
      );

      return new Response(
        JSON.stringify({ success: true, newToken, participant }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DENY PARTICIPANT ──
    if (action === "denyParticipant") {
      const user = await getUser();
      const body = await req.json();

      const { data: room } = await supabaseAdmin
        .from("meeting_rooms")
        .select("*")
        .eq("id", body.roomId)
        .eq("host_id", user.id)
        .single();
      if (!room) throw new Error("Apenas o host pode recusar");

      await supabaseAdmin
        .from("meeting_participants")
        .update({ status: "denied" })
        .eq("id", body.participantId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── UPDATE ROOM ──
    if (action === "updateRoom") {
      const user = await getUser();
      const body = await req.json();
      const { roomId, nome, descricao, tipo, agendado_para, duracao_minutos, convidados } = body;

      const updateData: Record<string, unknown> = {};
      if (nome !== undefined) updateData.nome = nome;
      if (descricao !== undefined) updateData.descricao = descricao;
      if (tipo !== undefined) updateData.tipo = tipo;
      if (agendado_para !== undefined) updateData.agendado_para = agendado_para;
      if (duracao_minutos !== undefined) updateData.duracao_minutos = duracao_minutos;
      if (convidados !== undefined) updateData.convidados = convidados;

      const { data, error } = await supabaseAdmin
        .from("meeting_rooms")
        .update(updateData)
        .eq("id", roomId)
        .eq("host_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ room: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ROOM (permanent) ──
    if (action === "deleteRoom") {
      const user = await getUser();
      const body = await req.json();

      await supabaseAdmin
        .from("meeting_rooms")
        .delete()
        .eq("id", body.roomId)
        .eq("host_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── END ROOM ──
    if (action === "endRoom") {
      const user = await getUser();
      const body = await req.json();

      await supabaseAdmin
        .from("meeting_rooms")
        .update({ status: "finalizada" })
        .eq("id", body.roomId)
        .eq("host_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── VALIDATE INVITE (public) ──
    if (action === "validateInvite") {
      const inviteId = url.searchParams.get("inviteId");
      const { data: invite, error } = await supabaseAdmin
        .from("meeting_invites")
        .select("id, room_id, expires_at, usado, meeting_rooms(id, nome, descricao, status)")
        .eq("id", inviteId)
        .single();

      if (error || !invite) throw new Error("Convite não encontrado");
      if (new Date(invite.expires_at) < new Date()) throw new Error("Convite expirado");
      if (invite.meeting_rooms?.status !== "ativa") throw new Error("Sala não está ativa");

      return new Response(
        JSON.stringify({ valid: true, room: invite.meeting_rooms }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── NOTIFY MEETING (email + whatsapp) ──
    if (action === "notifyMeeting") {
      const user = await getUser();
      const body = await req.json();
      const { roomId, roomName, agendadoPara, descricao, meetingLink, convidados, enviarEmail, enviarWhatsApp } = body;

      const { data: profile } = await supabaseAdmin.from("profiles").select("nome").eq("id", user.id).single();
      const hostName = profile?.nome || user.email || "Organizador";

      const dataFormatada = agendadoPara
        ? new Date(agendadoPara).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" })
        : "Imediata";

      const results: { tipo: string; destinatario: string; status: string; erro?: string }[] = [];

      // Pre-load email configs
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      let resendFromEmail = "Reuniões <onboarding@resend.dev>";
      if (RESEND_API_KEY) {
        const { data: resendConfig } = await supabaseAdmin.from("resend_config").select("*").eq("user_id", user.id).single();
        if (resendConfig) resendFromEmail = `${resendConfig.from_name} <${resendConfig.from_email}>`;
      }
      const { data: smtpConfig } = await supabaseAdmin.from("email_config").select("*").eq("user_id", user.id).single();

      for (const convidado of convidados || []) {
        // Email
        if (enviarEmail && convidado.email) {
          const subject = `Convite: ${roomName} - ${dataFormatada}`;

          // Google Calendar link
          const calStart = agendadoPara ? new Date(agendadoPara).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
          const calEnd = agendadoPara ? new Date(new Date(agendadoPara).getTime() + (body.duracaoMinutos || 60) * 60000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
          const googleCalUrl = agendadoPara
            ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(roomName)}&dates=${calStart}/${calEnd}&details=${encodeURIComponent(`Entrar na reunião: ${meetingLink}\n\n${descricao || ''}`)}&location=${encodeURIComponent(meetingLink)}`
            : '';

          const htmlBody = `
            <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
              <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:28px 32px;border-radius:12px 12px 0 0;">
                <table style="width:100%;"><tr>
                  <td><span style="color:#fff;font-size:20px;font-weight:700;">📹 Convite para Reunião</span></td>
                  <td style="text-align:right;"><span style="color:#94a3b8;font-size:12px;">Talk by Uon1</span></td>
                </tr></table>
              </div>
              <div style="padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="color:#334155;font-size:15px;margin:0 0 6px;">Olá <strong>${convidado.nome || "convidado(a)"}</strong>,</p>
                <p style="color:#64748b;font-size:14px;margin:0 0 24px;"><strong style="color:#334155;">${hostName}</strong> convidou você para uma reunião.</p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
                  <table style="width:100%;border-collapse:collapse;">
                    <tr>
                      <td style="width:70px;vertical-align:top;padding-right:16px;">
                        <div style="background:#2563eb;border-radius:8px;text-align:center;padding:8px 0;width:60px;">
                          <span style="color:#93c5fd;font-size:10px;text-transform:uppercase;letter-spacing:1px;">${agendadoPara ? new Date(agendadoPara).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }) : 'Agora'}</span><br/>
                          <span style="color:#fff;font-size:22px;font-weight:700;">${agendadoPara ? new Date(agendadoPara).toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'}</span><br/>
                          <span style="color:#93c5fd;font-size:10px;">${agendadoPara ? new Date(agendadoPara).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }) : ''}</span>
                        </div>
                      </td>
                      <td style="vertical-align:top;">
                        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#1e293b;">${roomName}</p>
                        ${agendadoPara ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b;">📅 ${dataFormatada}</p>` : '<p style="margin:0 0 4px;font-size:13px;color:#64748b;">⚡ Reunião imediata</p>'}
                        ${descricao ? `<p style="margin:0;font-size:13px;color:#64748b;">📋 ${descricao}</p>` : ''}
                        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">👤 Organizador: ${hostName}</p>
                      </td>
                    </tr>
                  </table>
                </div>
                <div style="margin-bottom:24px;">
                  <table style="border-collapse:separate;border-spacing:8px 0;">
                    <tr>
                      <td><a href="${meetingLink}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">✓ Sim, participar</a></td>
                      <td><a href="${meetingLink}" style="display:inline-block;background:#fff;color:#334155;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;border:1px solid #cbd5e1;">Talvez</a></td>
                      <td><span style="display:inline-block;color:#64748b;padding:10px 12px;font-size:14px;">Não</span></td>
                    </tr>
                  </table>
                </div>
                <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">
                  <tr>
                    <td style="width:50%;"><a href="${meetingLink}" style="display:block;text-align:center;background:#2563eb;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">🎥 Entrar na Reunião</a></td>
                    ${googleCalUrl ? `<td style="width:50%;"><a href="${googleCalUrl}" target="_blank" style="display:block;text-align:center;background:#fff;color:#334155;padding:14px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;border:1px solid #cbd5e1;">📅 Adicionar ao Google Agenda</a></td>` : ''}
                  </tr>
                </table>
                ${(convidados || []).length > 1 ? `
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;">
                  <p style="font-size:12px;font-weight:600;color:#475569;margin:0 0 8px;">Convidados</p>
                  <p style="font-size:12px;color:#64748b;margin:0;">
                    ${hostName} - organizador<br/>
                    ${(convidados || []).filter((c: any) => c.email !== convidado.email).map((c: any) => c.nome || c.email).join('<br/>')}
                  </p>
                </div>` : ''}
                <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
                  <p style="font-size:11px;color:#94a3b8;margin:0;">Link da reunião: <a href="${meetingLink}" style="color:#2563eb;">${meetingLink}</a></p>
                  <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Convite enviado via Talk by Uon1</p>
                </div>
              </div>
            </div>
          `;

          let emailSent = false;
          let emailMethod = '';
          let emailError = '';

          // Try Resend first
          if (RESEND_API_KEY) {
            try {
              const { Resend } = await import("https://esm.sh/resend@2.0.0");
              const resend = new Resend(RESEND_API_KEY);
              const { error: resendErr } = await resend.emails.send({
                from: resendFromEmail,
                to: convidado.email,
                subject,
                html: htmlBody,
              });
              if (resendErr) throw new Error(resendErr.message);
              emailSent = true;
              emailMethod = 'Resend';
            } catch (resendErr: any) {
              console.error(`Resend failed for ${convidado.email}:`, resendErr.message);
              emailError = resendErr.message;
            }
          }

          // Fallback to SMTP
          if (!emailSent && smtpConfig) {
            try {
              const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
              let hostname = smtpConfig.smtp_host || '';
              hostname = hostname.replace(/^(ssl|tls|https?):\/\//i, '').trim();
              const client = new SMTPClient({
                connection: { hostname, port: smtpConfig.smtp_port, tls: true, auth: { username: smtpConfig.smtp_user, password: smtpConfig.smtp_password } },
              });
              await client.send({ from: `${smtpConfig.from_name} <${smtpConfig.from_email}>`, to: convidado.email, subject, html: htmlBody });
              await client.close();
              emailSent = true;
              emailMethod = 'SMTP';
            } catch (smtpErr: any) {
              emailError = emailError ? `${emailError}; SMTP: ${smtpErr.message}` : smtpErr.message;
            }
          }

          if (!emailSent && !RESEND_API_KEY && !smtpConfig) {
            emailError = "Nenhum provedor de email configurado";
          }

          results.push({ tipo: "email", destinatario: convidado.email, status: emailSent ? "enviado" : "erro", erro: emailSent ? undefined : emailError });

          // Log to email_historico for dashboard visibility
          try {
            await supabaseAdmin.from("email_historico").insert({
              destinatario: convidado.email,
              assunto: subject,
              corpo: `[${emailMethod || 'FALHA'}] Convite para reunião: ${roomName}`,
              enviado_por: user.id,
              status: emailSent ? 'enviado' : 'erro',
              erro_mensagem: emailSent ? null : emailError,
              atendimento_id: '00000000-0000-0000-0000-000000000000',
            });
          } catch (logErr) {
            console.error("Error logging email to historico:", logErr);
          }
        }

        // WhatsApp
        if (enviarWhatsApp && convidado.telefone) {
          try {
            const metaToken = Deno.env.get("META_WHATSAPP_TOKEN");
            const metaPhoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");
            if (!metaToken || !metaPhoneNumberId) throw new Error("WhatsApp não configurado");

            const phone = convidado.telefone.replace(/\D/g, "");
            const formattedPhone = phone.startsWith("55") ? phone : `55${phone}`;

            const msg = `📹 *Convite para Reunião*\n\n*${roomName}*\n📅 ${dataFormatada}\n${descricao ? `📋 ${descricao}\n` : ""}\n👤 Organizador: ${hostName}\n\n🔗 Acesse: ${meetingLink}`;

            const metaRes = await fetch(
              `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${metaToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: formattedPhone,
                  type: "text",
                  text: { preview_url: true, body: msg },
                }),
              }
            );
            const metaData = await metaRes.json();
            if (!metaRes.ok) throw new Error(metaData?.error?.message || "Erro Meta API");

            results.push({ tipo: "whatsapp", destinatario: formattedPhone, status: "enviado" });
          } catch (wpErr: any) {
            results.push({ tipo: "whatsapp", destinatario: convidado.telefone, status: "erro", erro: wpErr.message });
          }
        }

        // Log notification to meeting_notifications
        for (const r of results.filter(r2 => r2.destinatario === convidado.email || r2.destinatario === convidado.telefone?.replace(/\D/g, "") || r2.destinatario === `55${convidado.telefone?.replace(/\D/g, "")}`)) {
          await supabaseAdmin.from("meeting_notifications").insert({
            room_id: roomId,
            tipo: r.tipo,
            destinatario: r.destinatario,
            nome_destinatario: convidado.nome || null,
            status: r.status === "enviado" ? "enviado" : "erro",
            erro: r.erro || null,
            enviado_em: r.status === "enviado" ? new Date().toISOString() : null,
          });
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CHECK GUEST STATUS (public, no auth - polling) ──
    if (action === "checkGuestStatus") {
      const body = await req.json();
      const { roomId, identity } = body;
      if (!roomId || !identity) throw new Error("roomId e identity são obrigatórios");

      const { data: participant } = await supabaseAdmin
        .from("meeting_participants")
        .select("status")
        .eq("room_id", roomId)
        .eq("identity", identity)
        .single();

      if (!participant) throw new Error("Participante não encontrado");

      return new Response(
        JSON.stringify({ status: participant.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── GET GUEST TOKEN (public, no auth - for approved guests) ──
    if (action === "getGuestToken") {
      const body = await req.json();
      const { roomId, identity } = body;

      if (!roomId || !identity) throw new Error("roomId e identity são obrigatórios");

      const { data: participant } = await supabaseAdmin
        .from("meeting_participants")
        .select("*")
        .eq("room_id", roomId)
        .eq("identity", identity)
        .single();

      if (!participant) throw new Error("Participante não encontrado");
      if (participant.status !== "approved") throw new Error("Participante não aprovado");

      const { data: room } = await supabaseAdmin
        .from("meeting_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (!room) throw new Error("Sala não encontrada");

      const newToken = await createLiveKitToken(
        livekitApiKey, livekitApiSecret,
        identity, room.livekit_room_name,
        {
          roomJoin: true,
          room: room.livekit_room_name,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          name: participant.display_name,
        }
      );

      return new Response(
        JSON.stringify({ token: newToken, livekitUrl, room, participantStatus: "approved" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
