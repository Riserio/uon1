
-- Add duration field to meeting_rooms
ALTER TABLE public.meeting_rooms 
ADD COLUMN IF NOT EXISTS duracao_minutos INTEGER DEFAULT 60;

-- Create meeting chat messages table
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.meeting_rooms(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone in the room can read messages"
ON public.meeting_messages
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can send messages"
ON public.meeting_messages
FOR INSERT
WITH CHECK (true);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
