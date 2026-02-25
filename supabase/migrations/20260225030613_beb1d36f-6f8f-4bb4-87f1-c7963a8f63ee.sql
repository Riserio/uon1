-- Corrigir dias concatenados conhecidos para seus valores corretos
UPDATE public.cobranca_boletos
SET dia_vencimento_veiculo = 10
WHERE dia_vencimento_veiculo IN (1010, 101010, 10101015);

UPDATE public.cobranca_boletos
SET dia_vencimento_veiculo = 15
WHERE dia_vencimento_veiculo IN (1515, 1015);

UPDATE public.cobranca_boletos
SET dia_vencimento_veiculo = 20
WHERE dia_vencimento_veiculo IN (2020, 2030, 2020202020);

-- Limpar TODOS os dias que não são do ciclo permitido (1, 5, 10, 15, 20, 25)
UPDATE public.cobranca_boletos
SET dia_vencimento_veiculo = NULL
WHERE dia_vencimento_veiculo IS NOT NULL
  AND dia_vencimento_veiculo NOT IN (1, 5, 10, 15, 20, 25);