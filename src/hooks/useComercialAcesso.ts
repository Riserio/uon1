import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ComercialAcesso, ComercialLead, ComercialNivel } from "@/components/comercial/types";

/**
 * Nível do usuário no Comercial (Vendedor → Líder → Gerente → Admin) e o que ele
 * pode fazer. A regra de verdade está no banco (RLS); aqui a tela só se adapta.
 */
export function useComercialAcesso() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["comercial_meu_acesso", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("comercial_meu_acesso");
      if (error) throw error;
      return data as ComercialAcesso;
    },
  });

  const nivel: ComercialNivel = data?.nivel ?? "nenhum";
  const editaveis = new Set(data?.vendedores_editaveis ?? []);
  const gestor = nivel === "gerente" || nivel === "admin";

  return {
    acesso: data ?? null,
    carregando: isLoading,
    nivel,
    gestor,
    /** Pode alterar os registros deste vendedor (líder só os próprios). */
    podeEditarVendedor: (vendedorId: string | null | undefined) =>
      nivel === "admin" || (!!vendedorId && editaveis.has(vendedorId)),
    podeEditarLead: (lead: Pick<ComercialLead, "vendedor_id"> | null) =>
      !lead ? nivel !== "nenhum" : nivel === "admin" || (!!lead.vendedor_id && editaveis.has(lead.vendedor_id)),
    /** Transferir, arquivar, cancelar, exportar, auditoria, configurar funil/vendedores. */
    podeGerir: gestor,
  };
}
