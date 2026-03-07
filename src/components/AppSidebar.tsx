import { useState, useEffect } from "react";
import { LayoutDashboard, Building2, Users, Calendar, LogOut, FileText, MessageCircle, ClipboardList, AlertTriangle, TrendingUp, DollarSign, Settings, Megaphone, FileSignature, PanelLeftClose, PanelLeftOpen, Briefcase, Headset, Video, MessageSquareWarning, Menu, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useWhatsAppUnread } from "@/hooks/useWhatsAppUnread";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useSignedContracts } from "@/hooks/useSignedContracts";
import { useOuvidoriaPendentes } from "@/hooks/useOuvidoriaPendentes";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

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
      if (!userRole) { setPermissions({}); return; }
      const normalizedRole = userRole.toLowerCase() as RoleType;
      const validRoles: RoleType[] = ["admin", "administrativo", "comercial", "lider", "superintendente"];
      if (!validRoles.includes(normalizedRole)) { setPermissions({}); return; }
      try {
        const { data, error } = await supabase
          .from("role_menu_permissions")
          .select("menu_item, pode_visualizar, pode_editar")
          .eq("role", normalizedRole);
        if (error) { setPermissions({}); return; }
        const map: MenuPermissionMap = {};
        (data || []).forEach((p) => {
          map[p.menu_item] = { pode_visualizar: p.pode_visualizar, pode_editar: p.pode_editar };
        });
        setPermissions(map);
      } catch { setPermissions({}); }
    };
    loadPermissions();
  }, [userRole]);
  const canView = (menuId: string) => {
    const perm = permissions[menuId];
    if (!perm) return true;
    return perm.pode_visualizar;
  };
  return { canView };
}

// ---------------- MENU ITEMS ----------------

interface MenuItem {
  id: string;
  label: string;
  to: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: number;
  group: "nav" | "cadastros" | "ferramentas";
}

function useMenuItems() {
  const unreadMessages = useUnreadMessages();
  const whatsAppUnread = useWhatsAppUnread();
  const signedContracts = useSignedContracts();
  const ouvidoriaPendentes = useOuvidoriaPendentes();

  const items: MenuItem[] = [
    // Navegação
    { id: "dashboard", label: "Painel", to: "/", icon: LayoutDashboard, end: true, group: "nav" },
    { id: "atendimentos", label: "Atendimentos", to: "/atendimentos", icon: ClipboardList, group: "nav" },
    // Cadastros
    { id: "corretoras", label: "Associações", to: "/corretoras", icon: Building2, group: "cadastros" },
    { id: "termos", label: "Termos de Aceite", to: "/termos", icon: FileText, group: "cadastros" },
    { id: "contatos", label: "Contatos", to: "/contatos", icon: Users, group: "cadastros" },
    // Ferramentas
    { id: "sinistros", label: "Sinistros", to: "/sinistros", icon: AlertTriangle, group: "ferramentas" },
    { id: "lancamentos_financeiros", label: "Financeiro", to: "/financeiro", icon: DollarSign, group: "ferramentas" },
    { id: "agenda", label: "Agenda", to: "/agenda", icon: Calendar, group: "ferramentas" },
    { id: "documentos", label: "Documentos", to: "/documentos", icon: FileText, group: "ferramentas" },
    { id: "emails", label: "Central de Atendimento", to: "/central-atendimento", icon: Headset, badge: whatsAppUnread, group: "ferramentas" },
    { id: "mensagens", label: "Mensagens", to: "/mensagens", icon: MessageCircle, badge: unreadMessages, group: "ferramentas" },
    { id: "pid", label: "BI - Indicadores", to: "/pid", icon: TrendingUp, group: "ferramentas" },
    { id: "ouvidoria", label: "Ouvidoria", to: "/ouvidoria-backoffice", icon: MessageSquareWarning, badge: ouvidoriaPendentes, group: "ferramentas" },
    { id: "contratos", label: "Uon1 Sign", to: "/uon1sign", icon: FileSignature, badge: signedContracts.count, group: "ferramentas" },
    { id: "talka", label: "Uon1 Talk", to: "/video", icon: Video, group: "ferramentas" },
    { id: "comunicados", label: "Comunicados", to: "/comunicados", icon: Megaphone, group: "ferramentas" },
    { id: "gestao", label: "Gestão", to: "/gestao", icon: Briefcase, group: "ferramentas" },
    { id: "configuracoes", label: "Configurações", to: "/configuracoes", icon: Settings, group: "ferramentas" },
  ];

  return items;
}

// ---------------- SIDEBAR CONTENT ----------------

function SidebarMenuContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { signOut, userRole } = useAuth();
  const { canView } = useMenuPermissionsForRole(userRole);
  const items = useMenuItems();

  const groups = [
    { key: "nav", label: "Navegação" },
    { key: "cadastros", label: "Cadastros" },
    { key: "ferramentas", label: "Ferramentas" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="border-b border-sidebar-border p-4 flex items-center justify-center">
        {collapsed ? (
          <img src="/images/logo-collapsed.png" alt="Logo" className="h-8 w-8 object-contain" />
        ) : (
          <img src="/images/logo-full.png" alt="Logo" className="h-10 w-auto max-w-[150px] object-contain" />
        )}
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
        {groups.map((group, gi) => {
          const groupItems = items.filter((i) => i.group === group.key && canView(i.id));
          if (groupItems.length === 0) return null;
          return (
            <div key={group.key}>
              {gi > 0 && <div className="mx-3 my-2 border-t border-sidebar-border" />}
              {!collapsed && (
                <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5 px-2">
                {groupItems.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeClassName="bg-primary/10 text-primary font-medium"
                  >
                    <div className="relative flex-shrink-0">
                      <item.icon className="h-4 w-4" />
                      {collapsed && item.badge && item.badge > 0 ? (
                        <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white h-4 min-w-4 flex items-center justify-center text-[9px] rounded-full px-0.5 font-bold shadow-sm border border-sidebar-background">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      ) : null}
                    </div>
                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {!collapsed && item.badge && item.badge > 0 ? (
                      <Badge className="bg-orange-500 text-white h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full px-1.5 shadow-sm ml-auto">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => { signOut(); onNavigate?.(); }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </div>
  );
}

// ---------------- SIDEBAR PRINCIPAL ----------------

export function AppSidebar() {
  const isMobile = useIsMobile();
  const [pinned, setPinned] = useState(false); // estado definitivo via botão
  const [hovered, setHovered] = useState(false); // hover temporário
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const expanded = pinned || hovered;

  // Sincronizar margin-left do conteúdo principal (só respeita o pinned, não o hover)
  useEffect(() => {
    if (isMobile) return;
    const el = document.getElementById("main-content");
    if (el) {
      el.style.marginLeft = pinned ? "15rem" : "3.5rem";
    }
  }, [pinned, isMobile]);

  // Fechar mobile sidebar ao navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-[100] h-10 w-10 rounded-xl bg-card border border-border shadow-md flex items-center justify-center hover:bg-accent transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div
          className={cn(
            "fixed inset-y-0 left-0 z-[120] w-72 bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-out rounded-r-2xl",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 right-3 h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <SidebarMenuContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </div>
      </>
    );
  }

  // Desktop: sidebar flutuante com bordas arredondadas
  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "fixed top-2 bottom-2 left-2 z-[60] flex flex-col bg-card/95 backdrop-blur-md border border-border shadow-xl transition-all duration-300 ease-in-out rounded-2xl",
          expanded ? "w-60" : "w-[3.5rem]"
        )}
      >
        <div className="flex-1 overflow-hidden rounded-2xl">
          <SidebarMenuContent collapsed={!expanded} />
        </div>
      </div>

      {/* Toggle button — fora do container para não ser cortado */}
      <button
        onClick={() => setPinned((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="fixed top-7 z-[70] h-6 w-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-all duration-300 ease-in-out shadow-sm"
        style={{ left: expanded ? "calc(15rem + 0.5rem - 0.25rem)" : "calc(3.5rem + 0.5rem - 0.25rem)" }}
        aria-label="Fixar sidebar"
      >
        {pinned ? (
          <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <PanelLeftOpen className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </>
  );
}
