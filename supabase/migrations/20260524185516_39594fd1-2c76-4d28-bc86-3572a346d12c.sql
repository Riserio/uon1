
-- =========================================================
-- Security hardening migration
-- =========================================================

-- 1. funcionarios: restrict broad authenticated read.
-- Salary, CPF, bank info should only be visible to admin/superintendente/administrativo
-- (already a manage policy exists) and to the employee themselves.
DROP POLICY IF EXISTS "Authenticated users can view funcionarios" ON public.funcionarios;

CREATE POLICY "Admins and HR can view funcionarios"
ON public.funcionarios
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR profile_id = auth.uid()
);

-- 2. contrato_assinaturas: scope by contract's corretora.
DROP POLICY IF EXISTS "Authenticated users can view contrato_assinaturas" ON public.contrato_assinaturas;

CREATE POLICY "Users view contrato_assinaturas of their corretora"
ON public.contrato_assinaturas
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = contrato_assinaturas.contrato_id
      AND c.corretora_id = get_user_corretora_id(auth.uid())
  )
);

-- 3. estudo_base_registros: restrict public RW; scope via importacao.corretora_id
DROP POLICY IF EXISTS "Users can view estudo_base_registros" ON public.estudo_base_registros;
DROP POLICY IF EXISTS "Users can insert estudo_base_registros" ON public.estudo_base_registros;
DROP POLICY IF EXISTS "Users can delete estudo_base_registros" ON public.estudo_base_registros;

CREATE POLICY "Auth users view estudo_base_registros of their corretora"
ON public.estudo_base_registros
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.estudo_base_importacoes i
    WHERE i.id = estudo_base_registros.importacao_id
      AND i.corretora_id = get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Auth users insert estudo_base_registros for their corretora"
ON public.estudo_base_registros
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.estudo_base_importacoes i
    WHERE i.id = estudo_base_registros.importacao_id
      AND i.corretora_id = get_user_corretora_id(auth.uid())
  )
);

CREATE POLICY "Admins delete estudo_base_registros"
ON public.estudo_base_registros
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'superintendente'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 4. meeting_rsvp: fix overly broad "service role" policy applied to public.
DROP POLICY IF EXISTS "Service role manages RSVPs" ON public.meeting_rsvp;

CREATE POLICY "Service role manages RSVPs"
ON public.meeting_rsvp
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. meeting_messages: require participant or host to read.
DROP POLICY IF EXISTS "Anyone in the room can read messages" ON public.meeting_messages;

CREATE POLICY "Room participants can read messages"
ON public.meeting_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meeting_rooms mr
    WHERE mr.id = meeting_messages.room_id AND mr.host_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.meeting_participants mp
    WHERE mp.room_id = meeting_messages.room_id
      AND (mp.user_id = auth.uid() OR mp.identity = auth.uid()::text)
  )
);

-- 6. contrato_historico: fix tautological insert policy.
DROP POLICY IF EXISTS "Authenticated users can insert contrato_historico" ON public.contrato_historico;

CREATE POLICY "Authenticated users can insert contrato_historico"
ON public.contrato_historico
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 7. hinova_credenciais: remove from Realtime publication to prevent credential broadcast.
ALTER PUBLICATION supabase_realtime DROP TABLE public.hinova_credenciais;
