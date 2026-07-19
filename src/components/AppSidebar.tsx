import { useState, useEffect } from "react";
import { LayoutDashboard, Building2, Users, Calendar, LogOut, FileText, MessageCircle, ClipboardList, AlertTriangle, TrendingUp, Search, DollarSign, Settings, Megaphone, FileSignature, PanelLeftClose, PanelLeftOpen, Briefcase, Headset, Video, MessageSquareWarning, Menu, X, HelpCircle, BookOpen, CarFront, SearchCheck, ClipboardCheck, FileEdit, Bug, ChevronDown } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useWhatsAppUnread } from "@/hooks/useWhatsAppUnread";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useSignedContracts } from "@/hooks/useSignedContracts";
import { useModulosDesabilitados } from "@/hooks/useModulosDesabilitados";
import { SYSTEM_MODULES, GRUPO_LABEL, GRUPO_ORDEM, GRUPO_RECOLHIDO_PADRAO, type ModuloGrupo } from "@/config/modulos";
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
  group: ModuloGrupo;
}

function useMenuItems() {
  const unreadMessages = useUnreadMessages();
  const whatsAppUnread = useWhatsAppUnread();
  const signedContracts = useSignedContracts();
  const ouvidoriaPendentes = useOuvidoriaPendentes();

  const items: MenuItem[] = [
    // Navegação
    { id: "dashboard", label: "Painel", to: "/dashboard", icon: LayoutDashboard, end: true, group: "inicio" },
    { id: "atendimentos", label: "Atendimentos", to: "/atendimentos", icon: ClipboardList, group: "relacionamento" },
    // Cadastros
    { id: "corretoras", label: "Associações", to: "/corretoras", icon: Building2, group: "cadastros" },
    { id: "termos", label: "Termos de Aceite", to: "/termos", icon: FileText, group: "documentos" },
    { id: "contatos", label: "Contatos", to: "/contatos", icon: Users, group: "cadastros" },
     // Ferramentas
     { id: "sinistros", label: "Vistorias", to: "/sinistros", icon: SearchCheck, group: "operacao" },
    { id: "lancamentos_financeiros", label: "Financeiro", to: "/financeiro", icon: DollarSign, group: "operacao" },
    { id: "agenda", label: "Agenda", to: "/agenda", icon: Calendar, group: "interno" },
    { id: "documentos", label: "Documentos", to: "/documentos", icon: FileText, group: "documentos" },
    { id: "emails", label: "Central de Atendimento", to: "/central-atendimento", icon: Headset, badge: whatsAppUnread, group: "relacionamento" },
    { id: "mensagens", label: "Mensagens", to: "/mensagens", icon: MessageCircle, badge: unreadMessages, group: "relacionamento" },
    { id: "sga", label: "SGA — Associados", to: "/sga", icon: Search, group: "inteligencia" },
    { id: "pid", label: "BI - Indicadores", to: "/pid", icon: TrendingUp, group: "inteligencia" },
    { id: "ouvidoria", label: "Ouvidoria", to: "/ouvidoria-backoffice", icon: MessageSquareWarning, badge: ouvidoriaPendentes, group: "relacionamento" },
    { id: "contratos", label: "Uon1 Sign", to: "/uon1sign", icon: FileSignature, badge: signedContracts.count, group: "documentos" },
    { id: "talka", label: "Uon1 Talk", to: "/video", icon: Video, group: "relacionamento" },
     { id: "comunicados", label: "Comunicados", to: "/comunicados", icon: Megaphone, group: "relacionamento" },
     { id: "gestao", label: "Gestão", to: "/gestao", icon: Briefcase, group: "interno" },
    { id: "formularios", label: "Formulários", to: "/formularios", icon: FileEdit, group: "operacao" },
      { id: "ppr", label: "PPR", to: "/ppr", icon: ClipboardCheck, group: "interno" },
    { id: "debitos_veiculares", label: "Débitos Veiculares", to: "/debitos-veiculares", icon: CarFront, group: "operacao" },
    { id: "biblioteca", label: "Biblioteca", to: "/biblioteca", icon: BookOpen, group: "documentos" },
  ];

  return items;
}

// ---------------- SIDEBAR CONTENT ----------------

function SidebarMenuContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { signOut, userRole } = useAuth();
  const { canView } = useMenuPermissionsForRole(userRole);
  const { isDesabilitado } = useModulosDesabilitados();
  const items = useMenuItems();

  // Guarda de consistencia: item de menu que nao esta em SYSTEM_MODULES aparece
  // para o usuario mas nao pode ser desabilitado em Configuracoes — a tela de
  // gestao simplesmente nao o lista, entao ninguem percebe que ficou de fora.
  // Aconteceu com "biblioteca". So em desenvolvimento; nao polui producao.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const conhecidos = new Set(SYSTEM_MODULES.map((m) => m.id));
    const orfaos = items.map((i) => i.id).filter((id) => !conhecidos.has(id));
    if (orfaos.length > 0) {
      console.warn(
        "[modulos] itens no menu que faltam em SYSTEM_MODULES (nao serao gerenciaveis em Configuracoes):",
        orfaos,
      );
    }
  }, [items]);
  const groups = GRUPO_ORDEM.map((key) => ({ key, label: GRUPO_LABEL[key] }));

  // Grupos expansíveis. O menu tinha 16 itens soltos em "Ferramentas"; agora
  // são 7 grupos que abrem e fecham. Guardamos a preferência do usuário e
  // sempre abrimos o grupo da rota atual — senão a pessoa navega e "perde" de
  // vista onde está.
  const location = useLocation();
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    try {
      const salvo = localStorage.getItem("menu_grupos_abertos");
      if (salvo) return new Set(JSON.parse(salvo) as string[]);
    } catch { /* preferência corrompida: cai no padrão */ }
    return new Set(GRUPO_ORDEM.filter((g) => !GRUPO_RECOLHIDO_PADRAO.includes(g)));
  });

  const grupoDaRota = items.find((i) => location.pathname.startsWith(i.to))?.group;

  useEffect(() => {
    if (!grupoDaRota) return;
    setAbertos((prev) => (prev.has(grupoDaRota) ? prev : new Set(prev).add(grupoDaRota)));
  }, [grupoDaRota]);

  const alternarGrupo = (key: string) => {
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem("menu_grupos_abertos", JSON.stringify([...next])); } catch { /* sem persistência */ }
      return next;
    });
  };

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
          const groupItems = items.filter((i) => i.group === group.key && canView(i.id) && (i.id === "configuracoes" || !isDesabilitado(i.id)));
          if (groupItems.length === 0) return null;
          const aberto = collapsed || group.key === "inicio" || abertos.has(group.key);
            const temAtivo = groupItems.some((i) => location.pathname.startsWith(i.to));
            return (
            <div key={group.key}>
              {gi > 0 && <div className="mx-3 my-2 border-t border-sidebar-border" />}
              {!collapsed && group.key !== "inicio" && (
                <button
                  onClick={() => alternarGrupo(group.key)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  aria-expanded={aberto}
                >
                  <span className="flex items-center gap-1.5">
                    {group.label}
                    {/* Sem isso, grupo recolhido esconde a tela em que a pessoa está */}
                    {!aberto && temAtivo && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? "" : "-rotate-90"}`} />
                </button>
              )}
              {aberto && (
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
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <NavLink
          to="/reportar-problema"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title="Reportar problema"
        >
          <Bug className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Reportar problema</span>}
        </NavLink>
        {/* Configuracoes fixo no rodape: e acesso frequente e estava perdido no
            meio da lista de ferramentas, que rola. */}
        <NavLink
          to="/configuracoes"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title="Configurações"
        >
          <Settings className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Configurações</span>}
        </NavLink>
        <button
          onClick={() => { signOut(); onNavigate?.(); }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-orange-500 hover:bg-orange-500/10 transition-colors"
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
  // Persistir estado no localStorage
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem("sidebar-expanded");
    return saved === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Salvar no localStorage
  useEffect(() => {
    localStorage.setItem("sidebar-expanded", String(expanded));
  }, [expanded]);

  // Sincronizar margin-left do conteúdo principal
  useEffect(() => {
    const el = document.getElementById("main-content");
    if (!el) return;
    if (isMobile) {
      el.style.marginLeft = "0";
    } else {
      el.style.marginLeft = expanded ? "15.5rem" : "4rem";
    }
  }, [expanded, isMobile]);

  // Fechar mobile sidebar ao navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 right-3 z-[100] h-10 w-10 rounded-xl bg-card border border-border shadow-md flex items-center justify-center hover:bg-accent transition-colors"
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
            "fixed inset-y-0 right-0 z-[120] w-72 bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-out rounded-l-2xl",
            mobileOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 left-3 h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
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
    <div
      className={cn(
        "fixed top-2 bottom-2 left-2 z-[60] flex flex-col bg-card/95 backdrop-blur-md border border-border shadow-xl transition-all duration-300 ease-in-out rounded-2xl",
        expanded ? "w-60" : "w-[3.5rem]"
      )}
    >
      {/* Toggle button — posicionado na borda direita, meio a meio */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="absolute -right-3 top-7 z-[70] h-6 w-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shadow-md"
        aria-label="Alternar sidebar"
      >
        {expanded ? (
          <PanelLeftClose className="h-3 w-3 text-muted-foreground" />
        ) : (
          <PanelLeftOpen className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      <div className="flex-1 overflow-hidden rounded-2xl">
        <SidebarMenuContent collapsed={!expanded} />
      </div>
    </div>
  );
}
