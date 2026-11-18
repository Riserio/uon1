-- Uon1 Sign: CEP oficial da Vangard (30140-090) no endereço da Contratada dos três modelos.
UPDATE public.contrato_templates
SET contratada = jsonb_set(contratada, '{endereco}', to_jsonb('Rua Gonçalves Dias, nº 89, sala 902, Bairro Funcionários, Belo Horizonte/MG, CEP 30140-090'::text))
WHERE slug IN ('ppr-manutencao', 'assistencia-24h-rastreamento', 'prestacao-servicos-b2b')
  AND contratada->>'endereco' IS DISTINCT FROM 'Rua Gonçalves Dias, nº 89, sala 902, Bairro Funcionários, Belo Horizonte/MG, CEP 30140-090';
