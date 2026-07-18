-- ============================================================================
-- Limpeza das duplicatas do MGF (dossiê "MGF x Uoni").
--
-- Causa: o mergeIncremental do importar-api-hinova (a) só conhecia UM id por
-- chave natural, apagando apenas uma das cópias existentes, e (b) inseria as
-- linhas novas sem deduplicar. A cada importação a base crescia.
-- Corrigido no código (commits 144a2ad + 84f445b). Esta migration remove o
-- passivo que já está no banco.
--
-- Regra: por importação ativa, mantém a linha MAIS RECENTE de cada
-- (codigo_lancamento, parcela) e remove as demais. Linhas sem esses códigos
-- não são tocadas (não há chave natural para deduplicar com segurança).
--
-- Idempotente: rodar de novo depois de limpo não remove mais nada.
-- ============================================================================

WITH ranqueadas AS (
  SELECT d.id,
         row_number() OVER (
           PARTITION BY d.importacao_id,
                        d.dados_extras->>'codigo_lancamento',
                        d.dados_extras->>'parcela'
           ORDER BY d.created_at DESC, d.id DESC
         ) AS rn
  FROM mgf_dados d
  JOIN mgf_importacoes i ON i.id = d.importacao_id AND i.ativo
  WHERE d.dados_extras->>'codigo_lancamento' IS NOT NULL
    AND d.dados_extras->>'parcela' IS NOT NULL
)
DELETE FROM mgf_dados
WHERE id IN (SELECT id FROM ranqueadas WHERE rn > 1);

-- Recalcula o total_registros das importações ativas do MGF após a limpeza,
-- para o cabeçalho ("N registros") não ficar mostrando o número inflado.
UPDATE mgf_importacoes i
SET total_registros = sub.qtd
FROM (
  SELECT importacao_id, count(*) AS qtd
  FROM mgf_dados
  GROUP BY importacao_id
) sub
WHERE i.id = sub.importacao_id AND i.ativo;

-- Invalida o cache do dashboard MGF para não exibir os valores antigos
-- (o cache tem validade de 20 min).
DELETE FROM mgf_dashboard_cache;
