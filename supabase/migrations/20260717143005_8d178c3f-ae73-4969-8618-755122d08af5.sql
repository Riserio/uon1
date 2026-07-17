BEGIN;

-- ============================================================
-- whatsapp_messages: adicionar e popular corretora_id
-- ============================================================
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS corretora_id UUID;

UPDATE public.whatsapp_messages m
SET corretora_id = c.corretora_id
FROM public.whatsapp_contacts c
WHERE m.contact_id = c.id
  AND m.corretora_id IS NULL;

-- Trigger para preencher corretora_id automaticamente em inserts
CREATE OR REPLACE FUNCTION public.whatsapp_messages_set_corretora_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretora_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT corretora_id INTO NEW.corretora_id
    FROM public.whatsapp_contacts
    WHERE id = NEW.contact_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_messages_set_corretora_id_trigger ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_messages_set_corretora_id_trigger
BEFORE INSERT OR UPDATE ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.whatsapp_messages_set_corretora_id();

-- ============================================================
-- whatsapp_config
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Authenticated users can insert whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Authenticated users can update whatsapp_config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Authenticated users can delete whatsapp_config" ON public.whatsapp_config;

CREATE POLICY "whatsapp_config_tenant_select"
  ON public.whatsapp_config
  FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_config_tenant_insert"
  ON public.whatsapp_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_config_tenant_update"
  ON public.whatsapp_config
  FOR UPDATE
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  )
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_config_tenant_delete"
  ON public.whatsapp_config
  FOR DELETE
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

-- ============================================================
-- whatsapp_contacts
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON public.whatsapp_contacts;

CREATE POLICY "whatsapp_contacts_tenant_select"
  ON public.whatsapp_contacts
  FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_contacts_tenant_insert"
  ON public.whatsapp_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_contacts_tenant_update"
  ON public.whatsapp_contacts
  FOR UPDATE
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  )
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

-- ============================================================
-- whatsapp_messages
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Authenticated users can update messages" ON public.whatsapp_messages;

CREATE POLICY "whatsapp_messages_tenant_select"
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_messages_tenant_insert"
  ON public.whatsapp_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_messages_tenant_update"
  ON public.whatsapp_messages
  FOR UPDATE
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  )
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

-- ============================================================
-- whatsapp_historico
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_historico" ON public.whatsapp_historico;
DROP POLICY IF EXISTS "Authenticated users can insert whatsapp_historico" ON public.whatsapp_historico;

CREATE POLICY "whatsapp_historico_tenant_select"
  ON public.whatsapp_historico
  FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_historico_tenant_insert"
  ON public.whatsapp_historico
  FOR INSERT
  TO authenticated
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

-- ============================================================
-- whatsapp_queue
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_queue" ON public.whatsapp_queue;
DROP POLICY IF EXISTS "Authenticated users can manage whatsapp_queue" ON public.whatsapp_queue;

CREATE POLICY "whatsapp_queue_tenant_select"
  ON public.whatsapp_queue
  FOR SELECT
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

CREATE POLICY "whatsapp_queue_tenant_all"
  ON public.whatsapp_queue
  FOR ALL
  TO authenticated
  USING (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  )
  WITH CHECK (
    corretora_id = public.get_user_corretora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

COMMIT;