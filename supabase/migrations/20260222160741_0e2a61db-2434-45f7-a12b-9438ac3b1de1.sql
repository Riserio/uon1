
-- Add google_email column to identify which Google account is connected
ALTER TABLE public.google_calendar_integrations 
ADD COLUMN google_email TEXT;

-- Remove unique constraint on user_id to allow multiple accounts
ALTER TABLE public.google_calendar_integrations 
DROP CONSTRAINT google_calendar_integrations_user_id_key;

-- Add unique constraint on user_id + google_email instead
ALTER TABLE public.google_calendar_integrations 
ADD CONSTRAINT google_calendar_integrations_user_email_unique UNIQUE (user_id, google_email);

-- Add an "ativo" column to allow enabling/disabling sync per account
ALTER TABLE public.google_calendar_integrations 
ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT true;

-- Add a label column for user-friendly account names
ALTER TABLE public.google_calendar_integrations 
ADD COLUMN label TEXT;
