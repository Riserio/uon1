import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Returns the count of contracts that have been fully signed
 * but not yet "viewed" (visualizado_em is null on contrato_assinaturas).
 * For the sidebar badge on Uon1 Sign.
 */
export function useSignedContracts() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Count contracts where status = 'assinado' created recently (last 30 days)
      const { count: signedCount } = await supabase
        .from("contratos")
        .select("id", { count: "exact", head: true })
        .eq("status", "assinado")
        .eq("arquivado", false)
        .gte("updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      setCount(signedCount || 0);
    };

    load();

    // Subscribe to contract changes
    const channel = supabase
      .channel("signed-contracts-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "contratos" }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}
