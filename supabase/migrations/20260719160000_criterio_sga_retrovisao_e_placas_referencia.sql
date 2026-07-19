-- Consolida as correcoes aplicadas no banco em 19/07/2026.
-- (definicoes completas ja estao em producao; este arquivo documenta o que mudou)
--
-- 1) RETROVISAO DE 6 MESES no criterio "Boletos Anteriores: NAO POSSUI"
--    Sem limite de retrovisao, boletos abertos muito antigos — que no SGA ja
--    foram baixados, cancelados ou viraram acordo — faziam o veiculo ser
--    excluido indevidamente. Resultado (nosso / SGA):
--      pagos    jun 4.652 -> 4.670 / 4.675
--      emitidos jun 4.838 -> 4.857 / 4.859   (residuo -2 nos tres meses)
--    Aplicado em derivar_indicadores e calcular_kpis_cobranca_sga.
--
-- 2) PLACAS ATIVAS: nova tabela placas_ativas_referencia
--    Reconstruir mes passado a partir da base de hoje e impossivel: perde quem
--    saiu depois. Medido em jun/26 — reconstrucao dava 4.648 contra 4.757 do
--    SGA, e a diferenca sao exatamente os 109 veiculos que sairam desde entao.
--    Tentar completar por boleto tambem nao serve: 590 placas tiveram boleto em
--    junho e ja nao estao na base, o que levaria a 5.238.
--    Ordem de preferencia agora: referencia oficial > snapshot diario >
--    reconstrucao. Junho/26 VALECAR registrado com 4.757 (Relatorio de
--    Produtividade, validado pela associacao no dossie).
--    NULLIF no fallback de snapshot: count() devolve 0 e nao NULL, e sem isso o
--    COALESCE parava no zero (maio ficou zerado).
--
-- 3) JANELA PLAUSIVEL DE DATAS
--    O SGA aceita vencimento digitado errado (2055 no lugar de 2025). Eram 38
--    boletos na VALECAR, mas cada um criava um MES inteiro no pid_operacional e
--    os graficos plotavam Abr/42, Set/45, Mai/55. Agora descarta o que estiver
--    fora de 2015 ate 18 meses a frente, e as 32 linhas fantasma foram apagadas.

CREATE TABLE IF NOT EXISTS public.placas_ativas_referencia (
  corretora_id uuid NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  ano int NOT NULL, mes int NOT NULL,
  placas_ativas int NOT NULL,
  fonte text NOT NULL DEFAULT 'SGA - Relatorio de Produtividade',
  observacao text,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora_id, ano, mes)
);
ALTER TABLE public.placas_ativas_referencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS par_leitura ON public.placas_ativas_referencia;
CREATE POLICY par_leitura ON public.placas_ativas_referencia FOR SELECT TO authenticated USING (true);
