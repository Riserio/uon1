-- Drop and recreate the insert policy to allow any authenticated user to send messages
DROP POLICY IF EXISTS "Users can insert messages" ON public.mensagens;

CREATE POLICY "Users can insert messages" 
ON public.mensagens 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = remetente_id);

-- Add delete policy for messages
DROP POLICY IF EXISTS "Users can delete own messages" ON public.mensagens;

CREATE POLICY "Users can delete own messages"
ON public.mensagens
FOR DELETE
USING (auth.uid() = remetente_id OR auth.uid() = destinatario_id);