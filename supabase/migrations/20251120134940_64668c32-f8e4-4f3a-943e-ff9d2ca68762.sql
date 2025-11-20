-- Adicionar campo de cor na tabela fluxos
ALTER TABLE fluxos ADD COLUMN IF NOT EXISTS cor TEXT DEFAULT '#3b82f6';

-- Atualizar alguns fluxos existentes com cores diferentes (exemplo)
UPDATE fluxos SET cor = '#3b82f6' WHERE nome ILIKE '%sindicância%' OR nome ILIKE '%jurídico%';
UPDATE fluxos SET cor = '#f59e0b' WHERE nome ILIKE '%oficina%';
UPDATE fluxos SET cor = '#ef4444' WHERE nome ILIKE '%financeiro%';
UPDATE fluxos SET cor = '#10b981' WHERE nome ILIKE '%finalizado%' OR nome ILIKE '%desistência%';