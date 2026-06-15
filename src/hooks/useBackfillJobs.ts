import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BackfillModulo = "cobranca" | "eventos" | "mgf";
export type BackfillStatus = "pendente" | "executando" | "concluido" | "falhou" | "cancelado";

export interface BackfillJob {
  id: string;
  corretora_id: string;
  modulo: BackfillModulo;
  data_inicio: string;
  data_fim: string;
  status: BackfillStatus;
  progresso: number;
  registros_importados: number | null;
  erro: string | null;
  github_run_url: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  created_at: string;
}

export function useBackfillJobs(corretoraId: string | null, modulo?: BackfillModulo) {
  const [jobs, setJobs] = useState<BackfillJob[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!corretoraId) return;
    setLoading(true);
    let q = supabase
      .from("backfill_jobs" as any)
      .select("*")
      .eq("corretora_id", corretoraId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (modulo) q = q.eq("modulo", modulo);
    const { data } = await q;
    setJobs((data as any) || []);
    setLoading(false);
  }, [corretoraId, modulo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!corretoraId) return;
    const ch = supabase
      .channel(`backfill-${corretoraId}-${modulo || 'all'}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'backfill_jobs', filter: `corretora_id=eq.${corretoraId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [corretoraId, modulo, load]);

  return { jobs, loading, reload: load };
}