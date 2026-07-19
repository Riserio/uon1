-- Identidade do veiculo passa a ser PLACA ou CHASSI.
--
-- Veiculo 0km entra na base antes de ser emplacado: vem sem placa e so com
-- chassi. Como toda a contagem distinta usava placa, esses registros ficavam
-- sem identidade e caiam fora — o que produzia a divergencia entre telas:
--   Visao Geral (placas distintas)  4.757
--   Estudo de Base (linhas)         4.794
-- A diferenca de 37 nao era duplicacao, como eu supus a principio: eram 37
-- veiculos sem placa. VALECAR 37, EXCLUSIVE 42, KM PV 40, D3 279.
--
-- Duplicacao real existia e era outra: a API repetia registros entre paginas.
-- KM PV e EXCLUSIVE vinham com 10.000 linhas para ~5.000 veiculos. Isso foi
-- removido em migration anterior; aqui tratamos so a questao da identidade.
--
-- O importador tambem passa a gravar o chassi (a API ja devolvia, nos e que
-- descartavamos) e a deduplicar por placa OU chassi.

ALTER TABLE public.estudo_base_registros   ADD COLUMN IF NOT EXISTS chassi text;
ALTER TABLE public.cadastro_registros      ADD COLUMN IF NOT EXISTS chassi text;
ALTER TABLE public.veiculo_snapshot_diario ADD COLUMN IF NOT EXISTS chassi text;
CREATE INDEX IF NOT EXISTS idx_ebr_chassi ON public.estudo_base_registros (chassi) WHERE chassi IS NOT NULL;

-- capturar_snapshot_veiculos e derivar_indicadores passam a usar
-- COALESCE(placa, chassi) como chave de identidade.
