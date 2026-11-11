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
  /** Só o que cargo + ajuste individual dizem (sem o padrão do perfil). */
  mapaCargoUsuario: MapaPermissoes;
}

async function carregar(userId: string): Promise<Efetivas> {
  const [{ data: roleRow }, { data: profile }, { data: userPerms }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("cargo_id").eq("id", userId).maybeSingle(),
    supabase.from("user_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("user_id", userId),
  ]);
  const role = (roleRow?.role as string) ?? null;
  const cargoId = (profile as any)?.cargo_id ?? null;

  if (role && ACESSO_TOTAL_ROLES.includes(role)) return { role, cargoId, mapa: {}, mapaCargoUsuario: {} };

  const [{ data: rolePerms }, cargoRes] = await Promise.all([
    role
      ? supabase.from("role_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("role", role as any)
      : Promise.resolve({ data: [] as any[] }),
    cargoId
      ? supabase.from("cargo_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("cargo_id", cargoId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const mapaCargoUsuario = mesclarPermissoes(linhasParaMapa(cargoRes.data as any), linhasParaMapa(userPerms as any));
  return {
    role,
    cargoId,
    mapa: mesclarPermissoes(linhasParaMapa(rolePerms as any), mapaCargoUsuario),
    mapaCargoUsuario,
  };
}

/**
 * Permissões efetivas do usuário logado (perfil → cargo → ajuste individual).
 * Uma única consulta compartilhada por toda a aplicação (react-query), em vez
 * de cada tela abrir suas próprias requisições e canais realtime.
 */
const CHAVE_CACHE = (uid: string) => `uon1_permissoes_v1_${uid}`;

function lerCache(uid?: string): Efetivas | undefined {
  if (!uid) return undefined;
  try {
    const raw = localStorage.getItem(CHAVE_CACHE(uid));
    return raw ? (JSON.parse(raw) as Efetivas) : undefined;
  } catch {
    return undefined;
  }
}

function gravarCache(uid: string, e: Efetivas) {
  try {
    localStorage.setItem(CHAVE_CACHE(uid), JSON.stringify(e));
  } catch {
    /* modo privado / cota: segue sem cache */
  }
}

export function usePermissoes() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: [PERMISSOES_QUERY_KEY, user?.id],
    queryFn: async () => {
      const e = await carregar(user!.id);
      gravarCache(user!.id, e);
      return e;
    },
    enabled: !!user?.id,
    // Última permissão conhecida deste usuário: o menu já abre certo, sem
    // mostrar tudo e depois esconder. initialDataUpdatedAt=0 força buscar a
    // versão atual do banco logo em seguida.
    initialData: () => lerCache(user?.id),
    initialDataUpdatedAt: 0,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });

  const acessoTotal = !!data?.role && ACESSO_TOTAL_ROLES.includes(data.role);

  const podeVer = useCallback(
    (modulo: string, subitem?: string) => {
      // Sem permissão carregada ainda: não mostra nada. Mostrar tudo e depois
      // esconder fazia o menu "piscar" com módulos que a pessoa não tem.
      if (!data) return false;
      if (acessoTotal) return true;
      return resolver(data.mapa, modulo, subitem).pode_visualizar;
    },
    [data, acessoTotal],
  );

  const podeEditar = useCallback(
    (modulo: string, subitem?: string) => {
      if (!data) return false;
      if (acessoTotal) return true;
      return resolver(data.mapa, modulo, subitem).pode_editar;
    },
    [data, acessoTotal],
  );

  /**
   * Configurações: superintendente/admin sempre entram. Os demais só quando o
   * cargo (ou ajuste individual) libera EXPLICITAMENTE — ausência de regra não
   * abre as configurações do sistema para ninguém.
   */
  const podeAcessarConfiguracoes = useCallback(
    (subitem?: string) => {
      if (acessoTotal) return true;
      if (!data) return false;
      const explicito = data.mapaCargoUsuario["configuracoes"];
      if (!explicito?.pode_visualizar) return false;
      return subitem ? resolver(data.mapaCargoUsuario, "configuracoes", subitem).pode_visualizar : true;
    },
    [data, acessoTotal],
  );

  return {
    carregando: isLoading,
    podeAcessarConfiguracoes,
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
