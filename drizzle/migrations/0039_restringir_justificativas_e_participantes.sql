CREATE OR REPLACE FUNCTION public.meeting_pode_ver_sala(_uid uuid, _room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM meeting_rooms WHERE id = _room_id AND host_id = _uid)
    OR EXISTS (SELECT 1 FROM meeting_participants WHERE room_id = _room_id AND user_id = _uid)
    OR has_role(_uid, 'admin'::app_role) OR has_role(_uid, 'superintendente'::app_role))
$$;

DROP POLICY IF EXISTS "Authenticated users can view participants" ON public.meeting_participants;
CREATE POLICY "Participants of the room can view participants" ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (public.meeting_pode_ver_sala(auth.uid(), room_id));

DROP POLICY IF EXISTS "Authenticated users can insert justificativas_ausencia" ON public.justificativas_ausencia;
CREATE POLICY "Authenticated users can insert justificativas_ausencia" ON public.justificativas_ausencia
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      funcionario_id IN (SELECT f.id FROM funcionarios f WHERE f.profile_id = auth.uid())
      OR (has_role(auth.uid(), 'administrativo'::app_role) AND funcionario_id IN (
            SELECT f.id FROM funcionarios f WHERE f.corretora_id = get_user_corretora_id(auth.uid())))
      OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superintendente'::app_role)
    ));