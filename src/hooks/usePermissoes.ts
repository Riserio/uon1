import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ACESSO_TOTAL_ROLES,
  linhasParaMapa,
  mesclarPermissoes,
  resolver,
  type MapaPermissoes,
} from "@/lib/permissoes";

export const PERMISSOES_QUERY_KEY = "permissoes_efetivas";

interface Efetivas {
  role: string | null;
  cargoId: string | null;
  mapa: MapaPermissoes;
}

async function carregar(userId: string): Promise<Efetivas> {
  const [{ data: roleRow }, { data: profile }, { data: userPerms }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("cargo_id").eq("id", userId).maybeSingle(),
    supabase.from("user_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("user_id", userId),
  ]);
  const role = (roleRow?.role as string) ?? null;
  const cargoId = (profile as any)?.cargo_id ?? null;

  if (role && ACESSO_TOTAL_ROLES.includes(role)) return { role, cargoId, mapa: {} };

  const [{ data: rolePerms }, cargoRes] = await Promise.all([
    role
      ? supabase.from("role_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("role", role as any)
      : Promise.resolve({ data: [] as any[] }),
    cargoId
      ? supabase.from("cargo_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("cargo_id", cargoId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return {
    role,
    cargoId,
    mapa: mesclarPermissoes(linhasParaMapa(rolePerms as any), linhasParaMapa(cargoRes.data as any), linhasParaMapa(userPerms as any)),
  };
}

/**
 * Permissões efetivas do usuário logado (perfil → cargo → ajuste individual).
 * Uma única consulta compartilhada por toda a aplicação (react-query), em vez
 * de cada tela abrir suas próprias requisições e canais realtime.
 */
export function usePermissoes() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: [PERMISSOES_QUERY_KEY, user?.id],
    queryFn: () => carregar(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });

  const acessoTotal = !!data?.role && ACESSO_TOTAL_ROLES.includes(data.role);

  const podeVer = useCallback(
    (modulo: string, subitem?: string) => {
      // Enquanto carrega, não esconde nada (evita "piscar" o menu vazio).
      if (!data || acessoTotal) return true;
      return resolver(data.mapa, modulo, subitem).pode_visualizar;
    },
    [data, acessoTotal],
  );

  const podeEditar = useCallback(
    (modulo: string, subitem?: string) => {
      if (!data || acessoTotal) return true;
      return resolver(data.mapa, modulo, subitem).pode_editar;
    },
    [data, acessoTotal],
  );

  return {
    carregando: isLoading,
    role: data?.role ?? null,
    cargoId: data?.cargoId ?? null,
    permissoes: data?.mapa ?? {},
    acessoTotal,
    podeVer,
    podeEditar,
  };
}

/** Para recarregar após salvar cargo/usuário. */
export function useInvalidarPermissoes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [PERMISSOES_QUERY_KEY] });
}
