CREATE TABLE public.whatsapp_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  phone text NOT NULL,
  message text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  flow_id uuid REFERENCES whatsapp_flows(id) ON DELETE SET NULL,
  step_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error_message text
);

CREATE INDEX idx_whatsapp_scheduled_pending ON whatsapp_scheduled_messages(status, scheduled_for) WHERE status = 'pending';

ALTER TABLE whatsapp_scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage scheduled messages"
  ON whatsapp_scheduled_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_scheduled_messages;