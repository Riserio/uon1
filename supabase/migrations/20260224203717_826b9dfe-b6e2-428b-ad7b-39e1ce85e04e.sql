
-- Merge duplicate contacts by 9th digit variation
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT c1.id as canonical_id, c2.id as duplicate_id
    FROM whatsapp_contacts c1
    JOIN whatsapp_contacts c2 ON c2.id != c1.id
    WHERE LENGTH(c1.phone) > LENGTH(c2.phone)
      AND c1.phone LIKE '55%'
      AND c2.phone LIKE '55%'
      AND RIGHT(c1.phone, 8) = RIGHT(c2.phone, 8)
      AND SUBSTRING(c1.phone FROM LENGTH(c1.phone)-9 FOR 2) = SUBSTRING(c2.phone FROM LENGTH(c2.phone)-9 FOR 2)
  LOOP
    UPDATE whatsapp_messages SET contact_id = dup.canonical_id WHERE contact_id = dup.duplicate_id;
    UPDATE whatsapp_contact_flow_state SET status = 'expired', completed_at = now() WHERE contact_id = dup.duplicate_id AND status = 'active';
    UPDATE whatsapp_contact_flow_state SET contact_id = dup.canonical_id WHERE contact_id = dup.duplicate_id;
    DELETE FROM whatsapp_contacts WHERE id = dup.duplicate_id;
  END LOOP;
END $$;
