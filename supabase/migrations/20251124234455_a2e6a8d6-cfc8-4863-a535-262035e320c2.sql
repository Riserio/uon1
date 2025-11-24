-- Create user_logs table for tracking all user changes
CREATE TABLE IF NOT EXISTS public.user_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_logs ENABLE ROW LEVEL SECURITY;

-- Policy for admins and superintendente to view logs
CREATE POLICY "Admins can view user logs"
ON public.user_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'superintendente'::app_role)
);

-- Policy for system to insert logs
CREATE POLICY "System can insert user logs"
ON public.user_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Add force_password_change flag to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

-- Add PID menu to role_menu_permissions if not exists
INSERT INTO public.role_menu_permissions (role, menu_item, pode_visualizar, pode_editar)
VALUES 
  ('admin'::app_role, 'pid', true, true),
  ('superintendente'::app_role, 'pid', true, true),
  ('lider'::app_role, 'pid', true, false),
  ('comercial'::app_role, 'pid', true, false),
  ('administrativo'::app_role, 'pid', true, false),
  ('parceiro'::app_role, 'pid', true, false)
ON CONFLICT (role, menu_item) DO UPDATE
SET pode_visualizar = EXCLUDED.pode_visualizar,
    pode_editar = EXCLUDED.pode_editar;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_logs_target_user_id ON public.user_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON public.user_logs(created_at DESC);