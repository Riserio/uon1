
-- Remove duplicate checkpoints, keeping the oldest one (or the completed one if any)
DELETE FROM ouvidoria_checkpoints
WHERE id NOT IN (
  SELECT DISTINCT ON (registro_id, etapa, checkpoint_label)
    id
  FROM ouvidoria_checkpoints
  ORDER BY registro_id, etapa, checkpoint_label, concluido DESC, created_at ASC
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE ouvidoria_checkpoints
ADD CONSTRAINT ouvidoria_checkpoints_unique_per_registro
UNIQUE (registro_id, etapa, checkpoint_label);
