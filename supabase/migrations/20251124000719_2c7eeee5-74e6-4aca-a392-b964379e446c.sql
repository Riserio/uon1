-- Create user_totp table for TOTP authentication
CREATE TABLE IF NOT EXISTS public.user_totp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT user_totp_user_id_unique UNIQUE (user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_totp_user_id ON public.user_totp(user_id);

-- Enable RLS
ALTER TABLE public.user_totp ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own TOTP settings
CREATE POLICY "Users can view own TOTP settings"
ON public.user_totp
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own TOTP settings
CREATE POLICY "Users can insert own TOTP settings"
ON public.user_totp
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own TOTP settings
CREATE POLICY "Users can update own TOTP settings"
ON public.user_totp
FOR UPDATE
USING (auth.uid() = user_id);