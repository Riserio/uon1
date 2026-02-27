import { useState, useEffect } from "react";
import { LayoutDashboard, Building2, Users, Calendar, LogOut, FileText, MessageCircle, ClipboardList, AlertTriangle, TrendingUp, DollarSign, Settings, Megaphone, FileSignature, PanelLeftClose, PanelLeftOpen, Palette, Briefcase, Headset, Video, type LucideIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useWhatsAppUnread } from "@/hooks/useWhatsAppUnread";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useSignedContracts } from "@/hooks/useSignedContracts";

// ---------------- ÍCONE ESTILIZADO ----------------
const iconColors: Record<string, { bg: string; text: string }> = {
  dashboard: { bg: "bg-blue-500/15", text: "text-blue-500" },
  atendimentos: { bg: "bg-amber-500/15", text: "text-amber-500" },
  corretoras: { bg: "bg-violet-500/15", text: "text-violet-500" },
  termos: { bg: "bg-slate-500/15", text: "text-slate-500" },
  contatos: { bg: "bg-cyan-500/15", text: "text-cyan-500" },
  sinistros: { bg: "bg-red-500/15", text: "text-red-500" },
  financeiro: { bg: "bg-emerald-500/15", text: "text-emerald-500" },
  agenda: { bg: "bg-sky-500/15", text: "text-sky-500" },
  documentos: { bg: "bg-orange-500/15", text: "text-orange-500" },
  central: { bg: "bg-teal-500/15", text: "text-teal-500" },
  mensagens: { bg: "bg-pink-500/15", text: "text-pink-500" },
  pid: { bg: "bg-indigo-500/15", text: "text-indigo-500" },
  contratos: { bg: "bg-emerald-600/15", text: "text-emerald-600" },
  talka: { bg: "bg-purple-500/15", text: "text-purple-500" },
  comunicados: { bg: "bg-rose-500/15", text: "text-rose-500" },
  gestao: { bg: "bg-amber-600/15", text: "text-amber-600" },
  configuracoes: { bg: "bg-gray-500/15", text: "text-gray-500" },
};

function StyledIcon({ icon: Icon, colorKey }: { icon: LucideIcon; colorKey: string }) {
  const colors = iconColors[colorKey] || { bg: "bg-primary/15", text: "text-primary" };
  return (
    <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg ${colors.bg} ${colors.text} shrink-0`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}
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
        (data || []).forEach((p) => {
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
  const whatsAppUnread = useWhatsAppUnread();
  const signedContracts = useSignedContracts();
  const collapsed = state === "collapsed";
  const {
    canView
  } = useMenuPermissionsForRole(userRole);
  return <div className="relative">
      {/* Botão de toggle - fora do sidebar para não ser cortado */}
      <button onClick={toggleSidebar} aria-label="Alternar sidebar" className="fixed top-6 z-[80] h-6 w-6 rounded-full bg-background border border-border items-center justify-center hover:bg-accent transition-all shadow-sm flex" style={{ left: collapsed ? 'calc(var(--sidebar-width-icon) - 12px)' : 'calc(14rem - 12px)' }}>
        {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5 text-muted-foreground" /> : <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      <Sidebar collapsible="icon" className="border-r fixed top-0 left-0 h-screen z-[60] overflow-hidden">
        <SidebarHeader className="border-b p-4">
          <div className="flex items-center justify-center">
            {collapsed ? <img src="/images/logo-collapsed.png" alt="Logo" className="h-8 w-8 object-contain" /> : <img src="/images/logo-full.png" alt="Logo" className="h-10 w-auto max-w-[150px] object-contain" />}
          </div>
        </SidebarHeader>

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
                        <StyledIcon icon={LayoutDashboard} colorKey="dashboard" />
                        {!collapsed && <span>Painel</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Atendimentos */}
                {canView("atendimentos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/atendimentos" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={ClipboardList} colorKey="atendimentos" />
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
                        <StyledIcon icon={Building2} colorKey="corretoras" />
                        {!collapsed && <span>Associações</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Termos de Aceite */}
                {canView("termos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/termos" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={FileText} colorKey="termos" />
                        {!collapsed && <span>Termos de Aceite</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Contatos */}
                {canView("contatos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/contatos" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={Users} colorKey="contatos" />
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
                        <StyledIcon icon={AlertTriangle} colorKey="sinistros" />
                        {!collapsed && <span>Sinistros</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Financeiro */}
                {canView("lancamentos_financeiros") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/financeiro" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={DollarSign} colorKey="financeiro" />
                        {!collapsed && <span>Financeiro</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Agenda */}
                {canView("agenda") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/agenda" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={Calendar} colorKey="agenda" />
                        {!collapsed && <span>Agenda</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Documentos */}
                {canView("documentos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/documentos" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={FileText} colorKey="documentos" />
                        {!collapsed && <span>Documentos</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Central de Atendimento */}
                {canView("emails") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/central-atendimento" activeClassName="bg-primary text-primary-foreground">
                        <div className="relative flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <StyledIcon icon={Headset} colorKey="central" />
                              {collapsed && whatsAppUnread > 0 &&
                          <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white h-4 min-w-4 flex items-center justify-center text-[9px] rounded-full px-1 font-bold shadow-sm border border-background">
                                  {whatsAppUnread > 99 ? '99+' : whatsAppUnread}
                                </span>
                          }
                            </div>
                            {!collapsed && <span>Central de Atendimento</span>}
                          </div>
                          {!collapsed && whatsAppUnread > 0 &&
                      <Badge className="bg-emerald-500 text-white h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full px-1.5 shadow-sm">
                              {whatsAppUnread}
                            </Badge>
                      }
                        </div>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Mensagens */}
                {canView("mensagens") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/mensagens" activeClassName="bg-primary text-primary-foreground">
                        <div className="flex items-center justify-between w-full">
                           <div className="flex items-center gap-2">
                            <StyledIcon icon={MessageCircle} colorKey="mensagens" />
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
                        <StyledIcon icon={TrendingUp} colorKey="pid" />
                        {!collapsed && <span>BI - Indicadores</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Uon1Sign - visibilidade controlada pela tabela role_menu_permissions */}
                {canView("contratos") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/uon1sign" activeClassName="bg-primary text-primary-foreground">
                        <div className="relative flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <StyledIcon icon={FileSignature} colorKey="contratos" />
                              {collapsed && signedContracts.count > 0 &&
                          <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white h-4 min-w-4 flex items-center justify-center text-[9px] rounded-full px-1 font-bold">
                                  {signedContracts.count > 99 ? '99+' : signedContracts.count}
                                </span>
                          }
                            </div>
                            {!collapsed && <span>Uon1 Sign</span>}
                          </div>
                          {!collapsed && signedContracts.count > 0 &&
                      <Badge className="bg-emerald-500 text-white h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full px-1.5">
                              {signedContracts.count}
                            </Badge>
                      }
                        </div>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* UON1 Talk */}
                {canView("talka") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/video" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={Video} colorKey="talka" />
                        {!collapsed && <span>Uon1 Talk</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Comunicados - visibilidade controlada pela tabela role_menu_permissions */}
                {canView("comunicados") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/comunicados" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={Megaphone} colorKey="comunicados" />
                        {!collapsed && <span>Comunicados</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Gestão */}
                {canView("gestao") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/gestao" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={Briefcase} colorKey="gestao" />
                        {!collapsed && <span>Gestão</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>}

                {/* Configurações */}
                {canView("configuracoes") && <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/configuracoes" activeClassName="bg-primary text-primary-foreground">
                        <StyledIcon icon={Settings} colorKey="configuracoes" />
                        {!collapsed && <span>Configurações</span>}
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
    </div>;
}