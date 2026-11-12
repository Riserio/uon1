import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Nomes de usuários (líderes, gerentes, autores) por id — via RPC do Comercial. */
export function useNomesUsuarios(ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))].sort();
  const { data } = useQuery({
    queryKey: ["comercial_nomes_usuarios", unicos.join(",")],
    enabled: unicos.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("comercial_nomes_usuarios", { _ids: unicos });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  return new Map((data ?? []).map((u) => [u.id, u.nome]));
}
