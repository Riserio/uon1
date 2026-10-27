-- 2026-10-27 — Ajuste fino de privilégios: escrita não usada pelo app.
-- meeting_participants: INSERT/DELETE não têm policy para authenticated (a gravação
--   acontece via service_role na edge function livekit-rooms).
REVOKE INSERT, DELETE ON public.meeting_participants FROM authenticated;
-- vistoria_prazo_config: DELETE não é usado em nenhuma tela.
REVOKE DELETE ON public.vistoria_prazo_config FROM authenticated;