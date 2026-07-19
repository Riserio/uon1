-- Regional e cooperativa vinham como JSON cru nos graficos:
--   {"codigo":"59","descricao":"INFINITY ASSOCIACAO DE AUTO GESTAO"}
--
-- Nao era so cosmetico. A MESMA entidade aparecia duas vezes nos rankings de
-- inadimplencia — uma como texto, outra como JSON — cada uma com sua propria
-- porcentagem, dividindo o denominador e distorcendo a classificacao.
--
-- Origem: sga_eventos (2.470 registros). O enriquecer_cobranca_worker copia
-- regional/cooperativa de la para cobranca_boletos, propagando para 4.609
-- boletos. A API devolve o campo ora como string, ora como objeto
-- {codigo, descricao}, e o importador gravava o objeto serializado.
--
-- Aqui: normaliza o que ja esta gravado. O importador ganhou nomeDe(), que
-- reduz objeto ou JSON serializado ao nome antes de gravar.

UPDATE sga_eventos
SET cooperativa = NULLIF(btrim((cooperativa::jsonb)->>'descricao'), '')
WHERE cooperativa LIKE '{%' AND cooperativa::jsonb ? 'descricao';

UPDATE sga_eventos
SET regional = NULLIF(btrim((regional::jsonb)->>'descricao'), '')
WHERE regional LIKE '{%' AND regional::jsonb ? 'descricao';

UPDATE cobranca_boletos
SET regional_boleto = NULLIF(btrim((regional_boleto::jsonb)->>'descricao'), '')
WHERE regional_boleto LIKE '{%' AND regional_boleto::jsonb ? 'descricao';

UPDATE cobranca_boletos
SET cooperativa = NULLIF(btrim((cooperativa::jsonb)->>'descricao'), '')
WHERE cooperativa LIKE '{%' AND cooperativa::jsonb ? 'descricao';
