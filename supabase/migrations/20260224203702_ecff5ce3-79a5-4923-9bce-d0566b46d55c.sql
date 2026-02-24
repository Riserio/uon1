
-- Step 1: Fix check constraint to include 'expired'
ALTER TABLE public.whatsapp_contact_flow_state DROP CONSTRAINT IF EXISTS whatsapp_contact_flow_state_status_check;
ALTER TABLE public.whatsapp_contact_flow_state ADD CONSTRAINT whatsapp_contact_flow_state_status_check CHECK (status IN ('active', 'completed', 'paused', 'cancelled', 'expired'));

-- Step 2: Drop conflicting unique constraint
ALTER TABLE public.whatsapp_contact_flow_state DROP CONSTRAINT IF EXISTS whatsapp_contact_flow_state_contact_id_flow_id_status_key;

-- Step 3: Sanitize duplicate active states
WITH ranked AS (
  SELECT id, contact_id, ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY started_at DESC) as rn
  FROM public.whatsapp_contact_flow_state
  WHERE status = 'active'
)
UPDATE public.whatsapp_contact_flow_state
SET status = 'expired', completed_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 4: Partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_flow_per_contact
ON public.whatsapp_contact_flow_state (contact_id)
WHERE status = 'active';
