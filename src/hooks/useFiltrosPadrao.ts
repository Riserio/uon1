import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Filtros padrão por USUÁRIO + tela + associação (tabela bi_filtros_padrao).
 * - 1 SELECT ao abrir a tela (cache react-query 30 min, sem polling/realtime).
 * - Grava apenas no clique de "Salvar como padrão" (upsert); nada de autosave.
 */
export function useFiltrosPadrao<T extends Record<string, unknown>>(tela: string, corretoraId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ["bi_filtros_padrao", tela, corretoraId ?? null];

  const query = useQuery({
    queryKey: key,
    enabled: !!tela,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Partial<T> | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      let q = supabase.from("bi_filtros_padrao").select("filtros").eq("user_id", auth.user.id).eq("tela", tela);
      q = corretoraId ? q.eq("corretora_id", corretoraId) : q.is("corretora_id", null);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data?.filtros as Partial<T>) ?? null;
    },
  });

  const salvar = useCallback(
    async (filtros: T) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { error } = await supabase.from("bi_filtros_padrao").upsert(
        {
          user_id: auth.user.id,
          tela,
          corretora_id: corretoraId ?? null,
          filtros: filtros as never,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,tela,corretora_id" },
      );
      if (error) {
        toast.error("Não foi possível salvar o padrão de filtros.");
        return;
      }
      qc.setQueryData(key, filtros);
      toast.success("Filtros salvos como padrão.");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tela, corretoraId, qc],
  );

  return { padrao: query.data ?? null, carregado: query.isFetched || !tela, salvar };
}
