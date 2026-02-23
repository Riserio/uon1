
-- Meeting Rooms
CREATE TABLE public.meeting_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'privada' CHECK (tipo IN ('privada', 'publica')),
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'finalizada', 'cancelada')),
  host_id UUID NOT NULL REFERENCES auth.users(id),
  livekit_room_name TEXT NOT NULL UNIQUE,
  max_participantes INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all active rooms" ON public.meeting_rooms
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create rooms" ON public.meeting_rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their rooms" ON public.meeting_rooms
  FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their rooms" ON public.meeting_rooms
  FOR DELETE USING (auth.uid() = host_id);

-- Meeting Invites
CREATE TABLE public.meeting_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.meeting_rooms(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  nome_convidado TEXT,
  email_convidado TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  usado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invites for their rooms" ON public.meeting_invites
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      criado_por = auth.uid() OR
      room_id IN (SELECT id FROM public.meeting_rooms WHERE host_id = auth.uid())
    )
  );

CREATE POLICY "Users can create invites" ON public.meeting_invites
  FOR INSERT WITH CHECK (auth.uid() = criado_por);

CREATE POLICY "Creators can delete invites" ON public.meeting_invites
  FOR DELETE USING (auth.uid() = criado_por);

-- Meeting Participants
CREATE TABLE public.meeting_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.meeting_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  identity TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  is_host BOOLEAN NOT NULL DEFAULT false,
  invite_id UUID REFERENCES public.meeting_invites(id),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view participants" ON public.meeting_participants
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can insert participants" ON public.meeting_participants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Hosts can update participants" ON public.meeting_participants
  FOR UPDATE USING (
    room_id IN (SELECT id FROM public.meeting_rooms WHERE host_id = auth.uid())
    OR user_id = auth.uid()
  );

-- Enable realtime for participants (for pending requests)
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;

-- Triggers
CREATE TRIGGER update_meeting_rooms_updated_at
  BEFORE UPDATE ON public.meeting_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meeting_participants_updated_at
  BEFORE UPDATE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
