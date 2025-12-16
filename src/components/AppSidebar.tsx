import { useState, useEffect } from "react";
import { LayoutDashboard, Building2, Users, Calendar, LogOut, FileText, MessageCircle, ClipboardList, AlertTriangle, Mail, TrendingUp, DollarSign, Settings, Megaphone, FileSignature } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useAppConfig } from "@/hooks/useAppConfig";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar, SidebarSeparator, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

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
        const {
          data,
          error
        } = await supabase.from("role_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("role", normalizedRole);
        if (error) {
          console.error("Erro ao carregar permissões de menu:", error);
          setPermissions({});
          return;
        }
        const map: MenuPermissionMap = {};
        (data || []).forEach(p => {
          map[p.menu_item] = {
            pode_visualizar: p.pode_visualizar,
            pode_editar: p.pode_editar
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
  return {
    canView,
    canEdit
  };
}

// ---------------- SIDEBAR ----------------

export function AppSidebar() {
  const {
    signOut,
    userRole
  } = useAuth();
  const {
    state,
    toggleSidebar
  } = useSidebar();
  const {
    config
  } = useAppConfig();
  const unreadMessages = useUnreadMessages();
  const collapsed = state === "collapsed";
  const {
    canView
  } = useMenuPermissionsForRole(userRole);
  return <>
      <Sidebar collapsible="icon" className={collapsed ? "border-r sticky top-0 h-screen z-[60]" : "border-r sticky top-0 h-screen z-[60] w-56"}>
        <SidebarHeader className="border-b p-4">
          <div className="flex items-center justify-center">
            {collapsed ? <img src="/images/logo-collapsed.png" alt="Logo" className="h-8 w-8 object-contain" /> : <img src="/images/logo-full.png" alt="Logo" className="h-10 w-auto max-w-[150px] object-contain" />}
          </div>
        </SidebarHeader>

        {/* Botão de toggle */}
        <button onClick={toggleSidebar} aria-label="Alternar sidebar" className="absolute -right-3 top-4 z-[70] h-7 w-7 rounded-full bg-sidebar-accent border border-border items-center justify-center hover:bg-sidebar-accent/80 transition-colors shadow-md flex flex-row">
          {collapsed ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sidebar-foreground">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg> : <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sidebar-foreground">
              <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>}
        </button>

        <SidebarContent>
          {/* NAVIGAÇÃO */}
          <SidebarGroup>
            <SidebarGroupLabel>Navegação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Dashboard */}
                {canView("dashboard") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/" end activeClassName="bg-primary text-primary-foreground">
                        <LayoutDashboard className="h-4 w-4" />
                        {!collapsed && <span>Painel</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Atendimentos */}
                {canView("atendimentos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/atendimentos" activeClassName="bg-primary text-primary-foreground">
                        <ClipboardList className="h-4 w-4" />
                        {!collapsed && <span>Atendimentos</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* CADASTROS */}
          <SidebarGroup>
            <SidebarGroupLabel>Cadastros</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Associações */}
                {canView("corretoras") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/corretoras" activeClassName="bg-primary text-primary-foreground">
                        <Building2 className="h-4 w-4" />
                        {!collapsed && <span>Associações</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Termos de Aceite */}
                {canView("termos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/termos" activeClassName="bg-primary text-primary-foreground">
                        <FileText className="h-4 w-4" />
                        {!collapsed && <span>Termos de Aceite</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Contatos */}
                {canView("contatos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/contatos" activeClassName="bg-primary text-primary-foreground">
                        <Users className="h-4 w-4" />
                        {!collapsed && <span>Contatos</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* FERRAMENTAS */}
          <SidebarGroup>
            <SidebarGroupLabel>Ferramentas</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Sinistros */}
                {canView("sinistros") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/sinistros" activeClassName="bg-primary text-primary-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        {!collapsed && <span>Sinistros</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Lançamentos Financeiros */}
                {canView("lancamentos_financeiros") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/lancamentos-financeiros" activeClassName="bg-primary text-primary-foreground">
                        <DollarSign className="h-4 w-4" />
                        {!collapsed && <span>Lançamentos Financeiros</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Agenda */}
                {canView("agenda") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/agenda" activeClassName="bg-primary text-primary-foreground">
                        <Calendar className="h-4 w-4" />
                        {!collapsed && <span>Agenda</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Documentos */}
                {canView("documentos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/documentos" activeClassName="bg-primary text-primary-foreground">
                        <FileText className="h-4 w-4" />
                        {!collapsed && <span>Documentos</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* E-mails */}
                {canView("emails") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/emails" activeClassName="bg-primary text-primary-foreground">
                        <Mail className="h-4 w-4" />
                        {!collapsed && <span>E-mails</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Mensagens */}
                {canView("mensagens") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/mensagens" activeClassName="bg-primary text-primary-foreground">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4" />
                            {!collapsed && <span>Mensagens</span>}
                          </div>
                          {!collapsed && unreadMessages > 0 && <Badge variant="destructive" className="ml-auto">
                              {unreadMessages}
                            </Badge>}
                        </div>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* BI - Indicadores */}
                {canView("pid") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/pid" activeClassName="bg-primary text-primary-foreground">
                        <TrendingUp className="h-4 w-4" />
                        {!collapsed && <span>BI - Indicadores</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Uon1Sign */}
                {canView("contratos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/uon1sign" activeClassName="bg-primary text-primary-foreground">
                        <FileSignature className="h-4 w-4" />
                        {!collapsed && <span>Uon1Sign</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Comunicados */}
                {canView("comunicados") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/comunicados" activeClassName="bg-primary text-primary-foreground">
                        <Megaphone className="h-4 w-4" />
                        {!collapsed && <span>Comunicados</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Gestão */}
                {canView("gestao") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/gestao" activeClassName="bg-primary text-primary-foreground">
                        <Settings className="h-4 w-4" />
                        {!collapsed && <span>Gestão</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Sair</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </>;
}