
-- =============================================
-- CENTRAL DE ATENDIMENTO WHATSAPP - SCHEMA
-- =============================================

-- 1. Contatos WhatsApp
CREATE TABLE public.whatsapp_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  profile_name TEXT,
  avatar_url TEXT,
  tags TEXT[] DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT NOT NULL DEFAULT 0,
  human_mode BOOLEAN NOT NULL DEFAULT false,
  human_mode_by UUID REFERENCES public.profiles(id),
  human_mode_at TIMESTAMPTZ,
  corretora_id UUID REFERENCES public.corretoras(id),
  assigned_to UUID REFERENCES public.profiles(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_contacts_phone ON public.whatsapp_contacts(phone);
CREATE INDEX idx_whatsapp_contacts_last_msg ON public.whatsapp_contacts(last_message_at DESC NULLS LAST);
CREATE INDEX idx_whatsapp_contacts_unread ON public.whatsapp_contacts(unread_count) WHERE unread_count > 0;

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contacts"
  ON public.whatsapp_contacts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert contacts"
  ON public.whatsapp_contacts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update contacts"
  ON public.whatsapp_contacts FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 2. Mensagens WhatsApp
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  body TEXT,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'template', 'image', 'audio', 'video', 'document', 'reaction', 'interactive', 'system')),
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  meta_message_id TEXT UNIQUE,
  template_name TEXT,
  template_variables JSONB,
  media_url TEXT,
  media_mime_type TEXT,
  error_message TEXT,
  sent_by UUID REFERENCES public.profiles(id),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_contact ON public.whatsapp_messages(contact_id, created_at DESC);
CREATE INDEX idx_whatsapp_messages_meta_id ON public.whatsapp_messages(meta_message_id) WHERE meta_message_id IS NOT NULL;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view messages"
  ON public.whatsapp_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert messages"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update messages"
  ON public.whatsapp_messages FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 3. Fluxos de automação
CREATE TABLE public.whatsapp_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  priority INT NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'first_message', 'all', 'manual')),
  trigger_config JSONB DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage flows"
  ON public.whatsapp_flows FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 4. Passos do fluxo
CREATE TABLE public.whatsapp_flow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.whatsapp_flows(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_order INT NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('send_text', 'send_template', 'ask_input', 'condition', 'transfer_human', 'end', 'wait', 'set_variable')),
  config JSONB NOT NULL DEFAULT '{}',
  next_step_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, step_key)
);

ALTER TABLE public.whatsapp_flow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage flow steps"
  ON public.whatsapp_flow_steps FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 5. Estado do fluxo por contato
CREATE TABLE public.whatsapp_contact_flow_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.whatsapp_flows(id) ON DELETE CASCADE,
  current_step_key TEXT,
  variables JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_interaction_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  UNIQUE(contact_id, flow_id, status) 
);

CREATE INDEX idx_contact_flow_active ON public.whatsapp_contact_flow_state(contact_id) WHERE status = 'active';

ALTER TABLE public.whatsapp_contact_flow_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage flow state"
  ON public.whatsapp_contact_flow_state FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 6. Trigger para updated_at
CREATE TRIGGER update_whatsapp_contacts_updated_at
  BEFORE UPDATE ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_flows_updated_at
  BEFORE UPDATE ON public.whatsapp_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
