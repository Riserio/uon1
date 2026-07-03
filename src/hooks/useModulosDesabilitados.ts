import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Módulos desabilitados globalmente (para todos os usuários).
 * Fonte: tabela `modulos_desabilitados` (presença da linha = desabilitado).
 * Leitura liberada a qualquer autenticado; escrita restrita a admin/superintendente via RLS.
 */
export function useModulosDesabilitados() {
  const [desabilitados, setDesabilitados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("modulos_desabilitados").select("modulo_id");
    if (error) {
      // Tabela ainda não migrada → não quebra o app, apenas trata como "nada desabilitado"
      console.warn("[modulos] não foi possível carregar módulos desabilitados:", error.message);
      setDesabilitados(new Set());
    } else {
      setDesabilitados(new Set((data ?? []).map((r: { modulo_id: string }) => r.modulo_id)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
    const channel = supabase
      .channel("modulos_desabilitados_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "modulos_desabilitados" }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const isDesabilitado = useCallback((moduloId: string) => desabilitados.has(moduloId), [desabilitados]);

  /** Habilita/desabilita um módulo globalmente (apenas admin/superintendente pelo RLS) */
  const definirModulo = useCallback(
    async (moduloId: string, desabilitar: boolean) => {
      const SEM_PERMISSAO =
        "Sem permissão para alterar módulos. Apenas admin, administrativo ou superintendente podem gerir.";
      if (desabilitar) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("modulos_desabilitados")
          .upsert(
            { modulo_id: moduloId, desabilitado_por: (await supabase.auth.getUser()).data.user?.id ?? null },
            { onConflict: "modulo_id" },
          )
          .select("modulo_id");
        if (error) throw error;
        // RLS bloqueia DELETE/UPDATE sem erro (0 linhas). No upsert, sem retorno = bloqueado.
        if (!data || data.length === 0) throw new Error(SEM_PERMISSAO);
        setDesabilitados((prev) => new Set(prev).add(moduloId));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("modulos_desabilitados")
          .delete()
          .eq("modulo_id", moduloId)
          .select("modulo_id");
        if (error) throw error;
        // DELETE barrado pelo RLS retorna sucesso com 0 linhas. Mas 0 linhas também
        // ocorre se já estava reativado (benigno). Reconfirma: se a linha ainda existe,
        // foi o RLS que bloqueou.
        if (!data || data.length === 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: ainda } = await (supabase as any)
            .from("modulos_desabilitados")
            .select("modulo_id")
            .eq("modulo_id", moduloId)
            .maybeSingle();
          if (ainda) throw new Error(SEM_PERMISSAO);
        }
        setDesabilitados((prev) => {
          const next = new Set(prev);
          next.delete(moduloId);
          return next;
        });
      }
    },
    [],
  );

  return { desabilitados, isDesabilitado, definirModulo, loading, recarregar: carregar };
}
