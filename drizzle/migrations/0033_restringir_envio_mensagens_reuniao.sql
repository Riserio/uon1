-- 2026-10-27 — meeting_messages: envio de chat restrito a quem pertence à sala.
-- Antes: INSERT aceito de qualquer origem, em qualquer sala. Agora: só o anfitrião da
-- sala ou um participante registrado (o identity do participante tem que bater com o
-- sender_id da mensagem). Convidados entram como anônimos, então a policy cobre anon
-- e authenticated; leitura já era restrita a participantes da sala.
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.meeting_messages;
CREATE POLICY "Hosts and room participants can send messages"
  ON public.meeting_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_rooms mr
      WHERE mr.id = meeting_messages.room_id
        AND mr.host_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.meeting_participants mp
      WHERE mp.room_id = meeting_messages.room_id
        AND mp.identity = meeting_messages.sender_id
    )
  );