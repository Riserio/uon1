import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useDispositivosPendentes() {
  const { user, userRole } = useAuth();
  const isGestor =
    userRole === "admin" || userRole === "administrativo" || userRole === "superintendente";

  const { data } = useQuery({
    queryKey: ["dispositivos_pendentes_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("dispositivos_ponto")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user && isGestor,
    refetchInterval: 60_000,
  });

  return data || 0;
}