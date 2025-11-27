import { useState, useEffect } from "react";
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
  MessageCircle,
  ClipboardList,
  Camera,
  AlertTriangle,
  Mail,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { usePendingUsers } from "@/hooks/usePendingUsers";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
  SidebarSeparator,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useTranslations } from "@/contexts/TranslationsContext";

// ---------------- PERMISSÕES DE MENU POR ROLE ----------------

type MenuPermission = {
  pode_visualizar: boolean;
  pode_editar: boolean;
};

type MenuPermissionMap = Record<string, MenuPermission>;
type RoleType = "admin" | "administrativo" | "comercial" | "lider" | "superintendente";

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

  const canView = (menuId: string) => {
    const perm = permissions[menuId];
    if (!perm) return true; // sem registro = liberado
    return perm.pode_visualizar;
  };

  const canEdit = (menuId: string) => {
    const perm = permissions[menuId];
    if (!perm) return true;
    return perm.pode_editar;
  };

  return { canView, canEdit };
}

// ---------------- SIDEBAR ----------------

export function AppSidebar() {
  const { signOut, userRole } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const { config } = useAppConfig();
  const unreadMessages = useUnreadMessages();
  const pendingUsers = usePendingUsers();
  const collapsed = state === "collapsed";
  const { t } = useTranslations();

  const { canView } = useMenuPermissionsForRole(userRole);

  return (
    <>
      <Sidebar
        collapsible="icon"
        className={collapsed ? "border-r sticky top-0 h-screen z-[60]" : "border-r sticky top-0 h-screen z-[60] w-56"}
      >
        <SidebarHeader className="border-b p-4">
          <div className="flex items-center justify-center">
            {collapsed ? (
              <img src="/images/logo-collapsed.png" alt="Logo" className="h-8 w-8 object-contain" />
            ) : (
              <img src="/images/logo-full.png" alt="Logo" className="h-10 w-auto max-w-[150px] object-contain" />
            )}
          </div>
        </SidebarHeader>

        {/* Botão de toggle */}
        <button
          onClick={toggleSidebar}
          aria-label="Alternar sidebar"
          className="absolute -right-3 top-4 z-[70] h-7 w-7 rounded-full bg-sidebar-accent border border-border items-center justify-center hover:bg-sidebar-accent/80 transition-colors shadow-md flex flex-row"
        >
          {collapsed ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sidebar-foreground">
              <path
                d="M4 2L8 6L4 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sidebar-foreground">
              <path
                d="M8 2L4 6L8 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <SidebarContent>
          {/* NAVIGAÇÃO */}
          <SidebarGroup>
            <SidebarGroupLabel>{t("secao_navegacao")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Dashboard */}
                {canView("dashboard") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/" end activeClassName="bg-primary text-primary-foreground">
                        <LayoutDashboard className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_painel")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Atendimentos */}
                {canView("atendimentos") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/atendimentos" activeClassName="bg-primary text-primary-foreground">
                        <ClipboardList className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_atendimentos")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* CADASTROS */}
          <SidebarGroup>
            <SidebarGroupLabel>{t("secao_cadastros")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Corretoras */}
                {canView("corretoras") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/corretoras" activeClassName="bg-primary text-primary-foreground">
                        <Building2 className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_corretoras")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Termos de Aceite */}
                {canView("termos") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/termos" activeClassName="bg-primary text-primary-foreground">
                        <FileText className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_termos")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Contatos */}
                {canView("contatos") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/contatos" activeClassName="bg-primary text-primary-foreground">
                        <Users className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_contatos")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Usuários */}
                {(userRole === "admin" || userRole === "administrativo" || userRole === "superintendente") &&
                  canView("usuarios") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/usuarios" activeClassName="bg-primary text-primary-foreground">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <UserCircle className="h-4 w-4" />
                              {!collapsed && <span>{t("menu_usuarios")}</span>}
                            </div>
                            {!collapsed && pendingUsers > 0 && (
                              <Badge variant="destructive" className="ml-auto">
                                {pendingUsers}
                              </Badge>
                            )}
                          </div>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* FERRAMENTAS */}
          <SidebarGroup>
            <SidebarGroupLabel>{t("secao_ferramentas")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Sinistros */}
                {canView("sinistros") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/sinistros" activeClassName="bg-primary text-primary-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_sinistros")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Lançamentos Financeiros */}
                {canView("lancamentos_financeiros") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/lancamentos-financeiros" activeClassName="bg-primary text-primary-foreground">
                        <DollarSign className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_lancamentos")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Agenda */}
                {canView("agenda") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/agenda" activeClassName="bg-primary text-primary-foreground">
                        <Calendar className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_agenda")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Documentos */}
                {canView("documentos") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/documentos" activeClassName="bg-primary text-primary-foreground">
                        <FileText className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_documentos")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Mensagens */}
                {canView("mensagens") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/mensagens" activeClassName="bg-primary text-primary-foreground">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4" />
                            {!collapsed && <span>{t("menu_mensagens")}</span>}
                          </div>
                          {!collapsed && unreadMessages > 0 && (
                            <Badge variant="destructive" className="ml-auto">
                              {unreadMessages}
                            </Badge>
                          )}
                        </div>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* PID - Painel de Indicadores */}
                {canView("pid") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/pid" activeClassName="bg-primary text-primary-foreground">
                        <TrendingUp className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_pid")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* E-mails */}
                {canView("emails") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/emails" activeClassName="bg-primary text-primary-foreground">
                        <Mail className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_emails")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Comunicados */}
                {canView("comunicados") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/comunicados" activeClassName="bg-primary text-primary-foreground">
                        <Megaphone className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_comunicados")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Configurações */}
                {canView("configuracoes") && (
                  <SidebarMenuItem>
                    <Link to="/configuracoes">
                      <SidebarMenuButton>
                        <Settings className="h-4 w-4" />
                        {!collapsed && <span>{t("menu_configuracoes")}</span>}
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={signOut}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Sair</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
