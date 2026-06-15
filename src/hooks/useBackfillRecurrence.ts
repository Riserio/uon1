import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BackfillModulo } from "./useBackfillJobs";

export interface BackfillRecurrence {
  id: string;
  corretora_id: string;
  modulo: BackfillModulo;
  ativo: boolean;
  offset_dias: number;
  ultima_execucao_em: string | null;
}

export function useBackfillRecurrence(corretoraId: string, modulo: BackfillModulo) {
  const [rec, setRec] = useState<BackfillRecurrence | null>(null);
  const [horaAgendada, setHoraAgendada] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const configTable =
    modulo === "cobranca" ? "cobranca_automacao_config" :
    modulo === "eventos" ? "sga_automacao_config" : "mgf_automacao_config";

  const fetchAll = useCallback(async () => {
    if (!corretoraId) return;
    setLoading(true);
    const [{ data: rData }, { data: cData }] = await Promise.all([
      supabase.from("backfill_recurrences" as any).select("*")
        .eq("corretora_id", corretoraId).eq("modulo", modulo).maybeSingle(),
      supabase.from(configTable as any).select("hora_agendada")
        .eq("corretora_id", corretoraId).maybeSingle(),
    ]);
    setRec((rData as any) || null);
    setHoraAgendada((cData as any)?.hora_agendada || null);
    setLoading(false);
  }, [corretoraId, modulo, configTable]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const enable = async (offset_dias = 1) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("backfill_recurrences" as any).upsert({
      corretora_id: corretoraId,
      modulo,
      ativo: true,
      offset_dias,
      created_by: u.user?.id,
    } as any, { onConflict: "corretora_id,modulo" });
    if (!error) await fetchAll();
    return error;
  };

  const disable = async () => {
    if (!rec) return;
    const { error } = await supabase.from("backfill_recurrences" as any)
      .update({ ativo: false } as any).eq("id", rec.id);
    if (!error) await fetchAll();
    return error;
  };

  return { rec, horaAgendada, loading, enable, disable, refresh: fetchAll };
}
