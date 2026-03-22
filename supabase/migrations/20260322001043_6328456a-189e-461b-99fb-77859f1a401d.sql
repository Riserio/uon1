ALTER TABLE public.hinova_credenciais
ADD COLUMN IF NOT EXISTS session_cookies text,
ADD COLUMN IF NOT EXISTS session_cookies_updated_at timestamptz;