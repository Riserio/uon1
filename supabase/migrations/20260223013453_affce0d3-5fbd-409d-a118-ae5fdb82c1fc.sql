
-- Add scheduling fields to meeting_rooms
ALTER TABLE public.meeting_rooms 
ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS convidados JSONB DEFAULT '[]'::jsonb;

-- Create table for meeting notifications tracking
CREATE TABLE IF NOT EXISTS public.meeting_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.meeting_rooms(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'email', 'whatsapp'
  destinatario TEXT NOT NULL,
  nome_destinatario TEXT,
  status TEXT DEFAULT 'pendente', -- 'pendente', 'enviado', 'erro'
  erro TEXT,
  enviado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.meeting_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage meeting notifications"
ON public.meeting_notifications
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.meeting_rooms mr
    WHERE mr.id = meeting_notifications.room_id
    AND mr.host_id = auth.uid()
  )
);
