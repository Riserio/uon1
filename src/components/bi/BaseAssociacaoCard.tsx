import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Car, UserPlus, Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

/**
 * Card "Base da associação" — placas ativas, cadastros do mês e veículos 0km.
 *
 * Fica ACIMA dos filtros e é compartilhado por todos os BIs (Indicadores,
 * Eventos, MGF e Cobrança), para que o contexto da base seja o mesmo em
 * qualquer tela. Antes existia só dentro do dashboard de Cobrança.
 *
 * Fontes (todas no banco, via RPC):
 *  - resumo_base_corretora: placas ativas (pid_operacional/pid_estudo_base) e
 *    cadastros do mês (estudo_base_registros por data de contrato);
 *  - contar_veiculos_zero_km: veículos protegidos ainda sem placa (0km).
 */

const HelpTip = ({ text }: { text: string }) => (
  <UITooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label="Como este número é calculado"
        onClick={(e) => e.preventDefault()}
        className="inline-flex items-center text-muted-foreground/50 hover:text-muted-foreground transition-colors align-middle"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-[280px] text-xs leading-snug">
      {text}
    </TooltipContent>
  </UITooltip>
);

type BaseInfo = {
  placas_ativas: number;
  cadastros_mes: number;
  mes_referencia: string | null;
};

type ZeroKm = {
  total_veiculos: number;
  zero_km_total: number;
  zero_km_mes: number;
};

export default function BaseAssociacaoCard({
  corretoraId,
  mesReferencia,
}: {
  corretoraId?: string;
  mesReferencia?: string | null;
}) {
  const [base, setBase] = useState<BaseInfo | null>(null);
  const [zeroKm, setZeroKm] = useState<ZeroKm | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!corretoraId) {
        setBase(null);
        setZeroKm(null);
        return;
      }
      try {
        const { data, error } = await supabase.rpc("resumo_base_corretora", {
          p_corretora_id: corretoraId,
          p_mes_referencia: mesReferencia || null,
        } as never);
        const baseData = data as unknown as BaseInfo | null;
        if (!cancelado && !error) setBase(baseData);

        // Sem mês explícito, usa o mês de referência que a própria base
        // devolveu (o mais recente com dados). Sem isso a contagem de 0km caía
        // no acumulado da base inteira (38) em vez do que entrou no mês (1).
        const mesZk = mesReferencia || baseData?.mes_referencia || null;
        const { data: zk, error: zkErr } = await supabase.rpc("contar_veiculos_zero_km", {
          p_corretora_id: corretoraId,
          p_mes_referencia: mesZk,
        } as never);
        if (!cancelado && !zkErr) setZeroKm(zk as unknown as ZeroKm);
      } catch (e) {
        console.error("[BaseAssociacaoCard] erro ao carregar base:", e);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [corretoraId, mesReferencia]);

  if (!base) return null;

  return (
    <Card className="rounded-2xl border-border/40">
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold">Base da associação</span>
            <HelpTip text="Todos os números seguem o mês selecionado no filtro. Placas ativas: veículos ativos da associação no mês (mesma fonte do Estudo de Base, já incluindo os 0km). Cadastros do mês: novos contratos com data de contrato dentro do mês. 0km: veículos protegidos ainda sem placa que entraram no mês." />
            {base.mes_referencia && (
              <span className="text-[11px] text-muted-foreground">
                ref. {base.mes_referencia.split("-").reverse().join("/")}
              </span>
            )}
          </div>
          {/* Mobile: grade de 2 colunas (não estoura a largura). Desktop: linha.
              Os 0km ficam agrupados dentro de "placas ativas", já que são parte
              do mesmo total — e não como um número solto ao lado. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-6">
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden sm:flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 shrink-0">
                <Car className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-base sm:text-lg font-bold tracking-tight tabular-nums leading-none">
                    {(base.placas_ativas ?? 0).toLocaleString("pt-BR")}
                  </span>
                  {zeroKm && (
                    <HelpTip
                      text={
                        `Total de veículos ativos da associação no mês (mesma fonte do Estudo de Base). ` +
                        `Inclui ${(zeroKm.zero_km_total ?? 0).toLocaleString("pt-BR")} veículos 0km / ainda não emplacados` +
                        `${(zeroKm.zero_km_mes ?? 0) > 0 ? `, sendo ${(zeroKm.zero_km_mes ?? 0).toLocaleString("pt-BR")} que entraram neste mês` : ""}. ` +
                        `Eles estão protegidos e contam no total, mas ainda não têm placa cadastrada.`
                      }
                    />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  placas ativas
                  {zeroKm && (zeroKm.zero_km_total ?? 0) > 0 &&
                    ` · inclui ${(zeroKm.zero_km_total ?? 0).toLocaleString("pt-BR")} 0km`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden sm:flex items-center justify-center h-9 w-9 rounded-full bg-emerald-500/10 shrink-0">
                <UserPlus className="h-4 w-4 text-emerald-600" />
              </span>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-bold tracking-tight tabular-nums leading-none">
                  {(base.cadastros_mes ?? 0).toLocaleString("pt-BR")}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">cadastros do mês</div>
              </div>
            </div>

          </div>
        </div>
      </CardContent>
    </Card>
  );
}
