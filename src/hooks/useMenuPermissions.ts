import { usePermissoes } from "@/hooks/usePermissoes";

/**
 * Compatibilidade: telas antigas chamam useMenuPermissions(user?.id).
 * Agora delega para usePermissoes (consulta única, perfil → cargo → usuário).
 * O parâmetro userId é ignorado: sempre se refere ao usuário logado.
 */
export function useMenuPermissions(_userId?: string) {
  const { permissoes, carregando, role, podeVer, podeEditar } = usePermissoes();
  return {
    permissions: permissoes,
    loading: carregando,
    userRole: role,
    canViewMenu: (menuItem: string) => podeVer(menuItem),
    canEditMenu: (menuItem: string) => podeEditar(menuItem),
  };
}
