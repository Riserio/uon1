-- Add finalizado_em column to track when meetings ended
ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS finalizado_em timestamptz;