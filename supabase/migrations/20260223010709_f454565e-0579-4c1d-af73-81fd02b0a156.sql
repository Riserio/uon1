
-- Add unique constraint for upsert on meeting_participants
ALTER TABLE public.meeting_participants ADD CONSTRAINT meeting_participants_room_identity_unique UNIQUE (room_id, identity);
