ALTER TABLE public._debug_hinova ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._sync_queue  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._debug_hinova FROM anon, authenticated;
REVOKE ALL ON public._sync_queue  FROM anon, authenticated;

GRANT ALL ON public._debug_hinova TO service_role;
GRANT ALL ON public._sync_queue  TO service_role;

DROP POLICY IF EXISTS "service role only" ON public._debug_hinova;
CREATE POLICY "service role only"
  ON public._debug_hinova
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service role only" ON public._sync_queue;
CREATE POLICY "service role only"
  ON public._sync_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);