import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCircle,
  Calendar,
  LogOut,
  Megaphone,
  Settings,
  FileText,
  Mail,
  ClipboardList,
  Camera,
  FileX,
  TrendingUp,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { usePendingUsers } from "@/hooks/usePendingUsers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

// ---- tipos de permissão de menu ----
type MenuPermission = {
  pode_visualizar: boolean;
  pode_editar: boolean;
};

type MenuPermissionMap = Record<string, MenuPermission>;
type RoleType = "admin" | "administrativo" | "comercial" | "lider" | "superintendente";

// ---- hook que busca permissões baseado no userRole do useAuth ----
function useMenuPermissionsForRole(userRole: string | null) {
  const [permissions, setPermissions] = useState<MenuPermissionMap>({});

  useEffect(() => {
    const loadPermissions = async () => {
      if (!userRole) {
        setPermissions({});
        return;
      }

      const normalizedRole = userRole.toLowerCase() as RoleType;

      const validRoles: RoleType[] = ["admin", "administrativo", "comercial", "lider", "superintendente"];
      if (!validRoles.includes(normalizedRole)) {
        console.warn("Role inválido ou não mapeado em permissões:", userRole);
        setPermissions({});
        return;
      }

      try {
        const { data, error } = await supabase
          .from("role_menu_permissions")
          .select("menu_item, pode_visualizar, pode_editar")
          .eq("role", normalizedRole);

        if (error) {
          console.error("Erro ao carregar permissões de menu:", error);
          setPermissions({});
          return;
        }

        const map: MenuPermissionMap = {};
        (data || []).forEach((p) => {
          map[p.menu_item] = {
            pode_visualizar: p.pode_visualizar,
            pode_editar: p.pode_editar,
          };
        });

        setPermissions(map);
      } catch (err) {
        console.error("Erro inesperado ao carregar permissões de menu:", err);
        setPermissions({});
      }
    };

    loadPermissions();
  }, [userRole]);

  // mesma regra do Dialog:
  // se não tem registro -> acesso total
  const canView = (menuId: string) => {
    const perm = permissions[menuId];
    if (!perm) return true;
    return perm.pode_visualizar;
  };

  const canEdit = (menuId: string) => {
    const perm = permissions[menuId];
    if (!perm) return true;
    return perm.pode_editar;
  };

  return { canView, canEdit };
}

// ---- componente principal ----

export default function MenuNav() {
  const location = useLocation();
  const { signOut, userRole } = useAuth();
  const unreadMessages = useUnreadMessages();
  const pendingUsers = usePendingUsers();

  const { canView } = useMenuPermissionsForRole(userRole);

  const isActive = (path: string) => location.pathname === path;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Navegação</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Dashboard */}
        {canView("dashboard") && (
          <DropdownMenuItem asChild>
            <Link to="/" className="cursor-pointer">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Painel</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Atendimentos */}
        {canView("atendimentos") && (
          <DropdownMenuItem asChild>
            <Link to="/atendimentos" className="cursor-pointer">
              <ClipboardList className="mr-2 h-4 w-4" />
              <span>Atendimentos</span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Cadastros</DropdownMenuLabel>

        {/* Corretoras */}
        {canView("corretoras") && (
          <DropdownMenuItem asChild>
            <Link to="/corretoras" className="cursor-pointer">
              <Building2 className="mr-2 h-4 w-4" />
              <span>Corretoras</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Termos de Aceite (id: "termos") */}
        {canView("termos") && (
          <DropdownMenuItem asChild>
            <Link to="/termos" className="cursor-pointer">
              <FileText className="mr-2 h-4 w-4" />
              <span>Termos de Aceite</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Contatos */}
        {canView("contatos") && (
          <DropdownMenuItem asChild>
            <Link to="/contatos" className="cursor-pointer">
              <Users className="mr-2 h-4 w-4" />
              <span>Contatos</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Usuários - precisa de role + permissão de menu */}
        {(userRole === "admin" || userRole === "administrativo" || userRole === "superintendente") &&
          canView("usuarios") && (
            <DropdownMenuItem asChild>
              <Link to="/usuarios" className="cursor-pointer flex items-center justify-between w-full">
                <div className="flex items-center">
                  <UserCircle className="mr-2 h-4 w-4" />
                  <span>Usuários</span>
                </div>
                {pendingUsers > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {pendingUsers}
                  </Badge>
                )}
              </Link>
            </DropdownMenuItem>
          )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Sinistros</DropdownMenuLabel>

        {/* Sinistro novo – se quiser controlar com id próprio, depois criamos "sinistros" */}
        <DropdownMenuItem asChild>
          <Link to="/sinistros/novo" className="cursor-pointer">
            <FileX className="mr-2 h-4 w-4" />
            <span>Sinistro</span>
          </Link>
        </DropdownMenuItem>

        {/* Acompanhamento (id "acompanhamento") */}
        {canView("acompanhamento") && (
          <DropdownMenuItem asChild>
            <Link to="/sinistros/acompanhamento" className="cursor-pointer">
              <ClipboardList className="mr-2 h-4 w-4" />
              <span>Acompanhamento</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Vistorias */}
        {canView("vistorias") && (
          <DropdownMenuItem asChild>
            <Link to="/vistorias" className="cursor-pointer">
              <Camera className="mr-2 h-4 w-4" />
              <span>Vistorias</span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Desempenho</DropdownMenuLabel>

        {/* Usa id "performance" para os dois */}
        {canView("performance") && (
          <>
            <DropdownMenuItem asChild>
              <Link to="/desempenho/individual" className="cursor-pointer">
                <TrendingUp className="mr-2 h-4 w-4" />
                <span>Desempenho Individual</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/desempenho/corretoras" className="cursor-pointer">
                <Building2 className="mr-2 h-4 w-4" />
                <span>Desempenho por Corretora</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Ferramentas</DropdownMenuLabel>

        {/* Agenda */}
        {canView("agenda") && (
          <DropdownMenuItem asChild>
            <Link to="/agenda" className="cursor-pointer">
              <Calendar className="mr-2 h-4 w-4" />
              <span>Agenda</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Documentos */}
        {canView("documentos") && (
          <DropdownMenuItem asChild>
            <Link to="/documentos" className="cursor-pointer">
              <FileText className="mr-2 h-4 w-4" />
              <span>Documentos</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Mensagens */}
        {canView("mensagens") && (
          <DropdownMenuItem asChild>
            <Link to="/mensagens" className="cursor-pointer flex items-center justify-between w-full">
              <div className="flex items-center">
                <Mail className="mr-2 h-4 w-4" />
                <span>Mensagens</span>
              </div>
              {unreadMessages > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  {unreadMessages}
                </Badge>
              )}
            </Link>
          </DropdownMenuItem>
        )}

        {/* E-mails */}
        {(userRole === "admin" || userRole === "superintendente") && canView("emails") && (
          <DropdownMenuItem asChild>
            <Link to="/emails" className="cursor-pointer">
              <Mail className="mr-2 h-4 w-4" />
              <span>E-mails</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Comunicados */}
        {(userRole === "admin" || userRole === "superintendente") && canView("comunicados") && (
          <DropdownMenuItem asChild>
            <Link to="/comunicados" className="cursor-pointer">
              <Megaphone className="mr-2 h-4 w-4" />
              <span>Comunicados</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* PID - Painel de Indicadores */}
        {(userRole === "admin" || userRole === "superintendente") && canView("pid") && (
          <DropdownMenuItem asChild>
            <Link to="/pid" className="cursor-pointer">
              <TrendingUp className="mr-2 h-4 w-4" />
              <span>PID</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Configurações */}
        {(userRole === "admin" || userRole === "superintendente") && canView("configuracoes") && (
          <DropdownMenuItem asChild>
            <Link to="/configuracoes" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Configurações</span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
