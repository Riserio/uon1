import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOuvidoriaPendentes() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      const { count: total, error } = await supabase
        .from("ouvidoria_registros")
        .select("*", { count: "exact", head: true })
        .eq("status", "Recebimento");

      if (!error && total !== null) {
        setCount(total);
      }
    };

    fetchCount();

    const channel = supabase
      .channel("ouvidoria-recebimento-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ouvidoria_registros" },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
