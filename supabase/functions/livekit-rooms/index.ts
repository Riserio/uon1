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

      // Upsert participant
      await supabaseAdmin.from("meeting_participants").upsert(
        {
          room_id: roomId,
          user_id: user.id,
          identity: user.id,
          display_name: displayName,
          status: isHost ? "approved" : "pending",
          is_host: isHost,
          joined_at: new Date().toISOString(),
        },
        { onConflict: "room_id,identity", ignoreDuplicates: false }
      );

      const canPublish = isHost; // guests start muted until approved
      const token = await createLiveKitToken(livekitApiKey, livekitApiSecret, user.id, room.livekit_room_name, {
        roomJoin: true,
        room: room.livekit_room_name,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
        name: displayName,
      });

      return new Response(
        JSON.stringify({ token, livekitUrl, room, isHost, participantStatus: isHost ? "approved" : "pending" }),
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
