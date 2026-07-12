-- Recalcula o Estudo de Base (pid_estudo_base) automaticamente sempre que uma
-- importação de Eventos (SGA), Cobrança ou MGF finaliza com sucesso.
-- O cálculo é feito pela RPC agregar_estudo_base sobre os registros locais
-- (estudo_base_registros) — nada é puxado de API.

CREATE OR REPLACE FUNCTION public.recalc_estudo_base_apos_importacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sucesso'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sucesso')
     AND NEW.corretora_id IS NOT NULL THEN
    BEGIN
      -- Mês de referência: primeiro dia do mês atual (coluna NOT NULL)
      PERFORM public.agregar_estudo_base(NEW.corretora_id, (date_trunc('month', now()))::date);
    EXCEPTION WHEN OTHERS THEN
      -- Nunca bloqueia a importação: só registra o aviso
      RAISE WARNING 'recalc_estudo_base_apos_importacao (%): %', TG_TABLE_NAME, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_estudo_base ON public.sga_automacao_execucoes;
CREATE TRIGGER trg_recalc_estudo_base
AFTER INSERT OR UPDATE OF status ON public.sga_automacao_execucoes
FOR EACH ROW EXECUTE FUNCTION public.recalc_estudo_base_apos_importacao();

DROP TRIGGER IF EXISTS trg_recalc_estudo_base ON public.cobranca_automacao_execucoes;
CREATE TRIGGER trg_recalc_estudo_base
AFTER INSERT OR UPDATE OF status ON public.cobranca_automacao_execucoes
FOR EACH ROW EXECUTE FUNCTION public.recalc_estudo_base_apos_importacao();

DROP TRIGGER IF EXISTS trg_recalc_estudo_base ON public.mgf_automacao_execucoes;
CREATE TRIGGER trg_recalc_estudo_base
AFTER INSERT OR UPDATE OF status ON public.mgf_automacao_execucoes
FOR EACH ROW EXECUTE FUNCTION public.recalc_estudo_base_apos_importacao();
