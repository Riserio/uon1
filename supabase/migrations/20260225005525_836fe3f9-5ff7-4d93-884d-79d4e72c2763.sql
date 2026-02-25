
-- RSVP tracking for meeting invitations
CREATE TABLE IF NOT EXISTS public.meeting_rsvp (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.meeting_rooms(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  email TEXT NOT NULL,
  nome TEXT,
  resposta TEXT CHECK (resposta IN ('sim', 'talvez', 'nao')) DEFAULT NULL,
  respondido_em TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for token lookups
CREATE INDEX idx_meeting_rsvp_token ON public.meeting_rsvp(token);
CREATE INDEX idx_meeting_rsvp_room ON public.meeting_rsvp(room_id);

-- RLS
ALTER TABLE public.meeting_rsvp ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read RSVPs for their rooms
CREATE POLICY "Users can read RSVPs for their rooms" ON public.meeting_rsvp
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.meeting_rooms mr WHERE mr.id = room_id AND mr.host_id = auth.uid())
  );

-- Service role inserts (via edge function)
CREATE POLICY "Service role manages RSVPs" ON public.meeting_rsvp
  FOR ALL USING (true) WITH CHECK (true);
