-- Fix handle_new_user function to create profiles with 'pendente' status
-- This ensures new user signups are marked as pending and trigger notifications

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, ativo, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    false, -- Initially inactive until approved
    'pendente' -- Status pendente for admin approval
  );
  RETURN new;
END;
$$;