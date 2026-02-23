import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Returns the count of contracts that have been fully signed
 * but not yet "viewed" by the current user.
 * Uses localStorage to track which signed contracts were already seen.
 */
export function useSignedContracts() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const getViewedIds = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem("viewed-signed-contracts") || "[]");
    } catch { return []; }
  };

  const markAsViewed = (contractId: string) => {
    const viewed = getViewedIds();
    if (!viewed.includes(contractId)) {
      viewed.push(contractId);
      localStorage.setItem("viewed-signed-contracts", JSON.stringify(viewed));
      setCount((prev) => Math.max(0, prev - 1));
    }
  };

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const { data } = await supabase
        .from("contratos")
        .select("id")
        .eq("status", "assinado")
        .eq("arquivado", false)
        .gte("updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const signedIds = (data || []).map((c) => c.id);
      const viewed = getViewedIds();
      const unseen = signedIds.filter((id) => !viewed.includes(id));
      setCount(unseen.length);
    };

    load();

    const channel = supabase
      .channel("signed-contracts-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "contratos" }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const isViewed = (contractId: string) => getViewedIds().includes(contractId);

  return { count, markAsViewed, isViewed };
}
