import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LogOut, ArrowLeftRight, Settings, PanelLeftClose, PanelLeftOpen,
  Building2, Play, Pause, ChevronLeft, ChevronRight, Monitor, Eye,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePortalCarouselOptional } from "@/contexts/PortalCarouselContext";
import { usePortalDataPrefetch } from "@/hooks/usePortalDataPrefetch";
import { MODULE_CONFIG, PortalModule } from "@/lib/portalModules";
import { usePortalLayout } from "@/contexts/PortalLayoutContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Corretora = {
  id: string;
  nome: string;
  slug?: string | null;
  logo_url?: string | null;
  logo_collapsed_url?: string | null;
  logo_expanded_url?: string | null;
  modulos_bi: string[];
};

type Props = {
  corretora: Corretora;
  currentModule: PortalModule;
  showChangeButton?: boolean;
  onChangeCorretora?: () => void;
  onLogout: () => void;
  hidden?: boolean;
};

// Diálogo de configurações do carrossel de apresentação — só usado no
// desktop. No mobile, o carrossel/apresentação não existe mais: a
// navegação é a barra flutuante (PortalMobileNav), com suas próprias
// configurações (favoritos + PWA) em PortalMobileSettingsSheet.
function PortalSettingsDialog({ open, onOpenChange, availableModules }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  availableModules: PortalModule[];
}) {
  const carousel = usePortalCarouselOptional();
  const { menuPosition, setMenuPosition } = usePortalLayout();
  if (!carousel) return null;

  const { config, setEnabled, setInterval, setVisibleModules } = carousel;
  const activeModules = config.visibleModules.filter(m => availableModules.includes(m));

  const handleModuleToggle = (module: PortalModule, checked: boolean) => {
    if (checked) {
      const newModules = availableModules.filter(m => config.visibleModules.includes(m) || m === module);
      setVisibleModules(newModules);
    } else {
      const newModules = config.visibleModules.filter(m => m !== module);
      if (newModules.length >= 2) setVisibleModules(newModules);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurações do Portal
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          {/* Posição do menu */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Posição do menu</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMenuPosition('inferior')}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  menuPosition === 'inferior'
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted"
                )}
              >
                Inferior (padrão)
              </button>
              <button
                type="button"
                onClick={() => setMenuPosition('vertical')}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  menuPosition === 'vertical'
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:bg-muted"
                )}
              >
                Vertical
              </button>
            </div>
          </div>

          {/* Carousel section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Modo Apresentação</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
              <div>
                <p className="text-sm font-medium">Rotação automática</p>
                <p className="text-xs text-muted-foreground">Alternar módulos automaticamente</p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={setEnabled} disabled={activeModules.length <= 1} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Tempo por tela</Label>
                <span className="text-sm font-medium text-primary">{config.interval}s</span>
              </div>
              <Slider value={[config.interval]} onValueChange={([val]) => setInterval(val)} min={10} max={120} step={5} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10s</span>
                <span>60s</span>
                <span>120s</span>
              </div>
            </div>
          </div>

          {/* Visible modules */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Módulos no carrossel</Label>
            </div>
            <div className="space-y-2">
              {availableModules.map((mod) => {
                const isVisible = config.visibleModules.includes(mod);
                const canDisable = config.visibleModules.filter(m => availableModules.includes(m)).length > 2;
                return (
                  <label key={mod} htmlFor={`cfg-mod-${mod}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer">
                    <Checkbox
                      id={`cfg-mod-${mod}`}
                      checked={isVisible}
                      onCheckedChange={(checked) => handleModuleToggle(mod, !!checked)}
                      disabled={isVisible && !canDisable}
                    />
                    <span className="text-sm flex-1">{MODULE_CONFIG[mod].label}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Mínimo de 2 módulos para o carrossel funcionar.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarContent({
  corretora,
  currentModule,
  collapsed,
  showChangeButton,
  onChangeCorretora,
  onLogout,
  onNavigate,
  onOpenSettings,
}: Props & { collapsed: boolean; onNavigate?: () => void; onOpenSettings: () => void }) {
  const navigate = useNavigate();
  const carousel = usePortalCarouselOptional();
  const assocKey = corretora.slug || corretora.id;

  const availableModules = (Object.keys(MODULE_CONFIG) as PortalModule[]).filter(m =>
    corretora.modulos_bi.includes(m)
  );

  const handleNav = (mod: PortalModule) => {
    if (carousel?.config.enabled) return;
    if (carousel) {
      carousel.goToModule(mod);
    } else {
      navigate(`${MODULE_CONFIG[mod].path}?associacao=${assocKey}`);
    }
    onNavigate?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div className="border-b border-border/50 p-3 flex items-center justify-center">
        {collapsed ? (
          // Collapsed: use logo_collapsed_url > logo_url > fallback
          (corretora.logo_collapsed_url || corretora.logo_url) ? (
            <div className="h-9 w-9 flex items-center justify-center overflow-hidden">
              <img
                src={corretora.logo_collapsed_url || corretora.logo_url!}
                alt={corretora.nome}
                className="h-9 w-9 rounded-full object-cover"
              />
            </div>
          ) : (
            <div className="h-9 w-9 flex items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
          )
        ) : (
          // Expanded: use logo_expanded_url > logo_url > fallback
          (corretora.logo_expanded_url || corretora.logo_url) ? (
            <div className="h-12 w-full px-2 flex items-center justify-center overflow-hidden">
              <img
                src={corretora.logo_expanded_url || corretora.logo_url!}
                alt={corretora.nome}
                className="h-12 max-w-[140px] rounded-lg object-contain"
              />
            </div>
          ) : (
            <div className="h-12 w-12 flex items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          )
        )}
      </div>

      {/* Association name (expanded only) */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-border/30">
          <p className="text-sm font-semibold truncate">{corretora.nome}</p>
          <p className="text-[10px] text-muted-foreground">Portal de Gestão</p>
        </div>
      )}

      {/* Module navigation */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
        {!collapsed && (
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Módulos
          </div>
        )}
        <div className="space-y-0.5 px-2">
          {availableModules.map((mod) => {
            const cfg = MODULE_CONFIG[mod];
            const isActive = mod === currentModule;
            const Icon = cfg.icon;
            const isDisabled = carousel?.config.enabled && mod !== currentModule;

            return (
              <button
                key={mod}
                onClick={() => handleNav(mod)}
                disabled={isDisabled}
                title={collapsed ? cfg.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground",
                  isDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{cfg.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Carousel controls (collapsed: just dots, expanded: full) */}
        {carousel && availableModules.length > 1 && (
          <>
            <div className="mx-3 my-3 border-t border-border/30" />
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Apresentação
              </div>
            )}
            <div className="px-2 space-y-1">
              <button
                onClick={() => carousel.setEnabled(!carousel.config.enabled)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full transition-colors",
                  carousel.config.enabled
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/70 hover:bg-muted"
                )}
                title={collapsed ? (carousel.config.enabled ? "Pausar" : "Auto") : undefined}
              >
                {carousel.config.enabled ? (
                  <Pause className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <Play className="h-4 w-4 flex-shrink-0" />
                )}
                {!collapsed && <span>{carousel.config.enabled ? "Pausar" : "Auto"}</span>}
              </button>

              {!collapsed && (
                <div className="flex items-center justify-center gap-1 py-1">
                  <button onClick={carousel.goToPrevious} disabled={carousel.config.enabled} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-40">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center gap-1">
                    {availableModules.filter(m => carousel.config.visibleModules.includes(m)).map((mod) => (
                      <button
                        key={mod}
                        onClick={() => !carousel.config.enabled && carousel.goToModule(mod)}
                        disabled={carousel.config.enabled}
                        title={MODULE_CONFIG[mod].label}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          mod === currentModule ? "bg-primary w-4" : "bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/50",
                          carousel.config.enabled && "cursor-not-allowed"
                        )}
                      />
                    ))}
                  </div>
                  <button onClick={carousel.goToNext} disabled={carousel.config.enabled} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-40">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Settings */}
        <div className="mx-3 my-3 border-t border-border/30" />
        {!collapsed && (
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Opções
          </div>
        )}
        <div className="px-2 space-y-0.5">
          <button
            onClick={onOpenSettings}
            title={collapsed ? "Configurações" : undefined}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Configurações</span>}
          </button>
          {showChangeButton && onChangeCorretora && (
            <button
              onClick={() => { onChangeCorretora(); onNavigate?.(); }}
              title={collapsed ? "Trocar" : undefined}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
            >
              <ArrowLeftRight className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>Trocar Associação</span>}
            </button>
          )}
        </div>
      </div>

      {/* Footer: Logout */}
      <div className="border-t border-border/50 p-2">
        <button
          onClick={() => { onLogout(); onNavigate?.(); }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-orange-500 hover:bg-orange-500/10 transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </div>
  );
}

// No mobile, a navegação passou a ser a barra flutuante (PortalMobileNav,
// renderizada em PortalLayout) — este componente não desenha mais nada no
// mobile (hamburger/drawer/carrossel antigos foram removidos), mas segue
// montado pra manter o hook usePortalDataPrefetch (regras de hooks) e o
// efeito que sincroniza o espaçamento do conteúdo principal.
export default function PortalSidebar(props: Props) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem("portal-sidebar-expanded");
    return saved === "true";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const availableModules = (Object.keys(MODULE_CONFIG) as PortalModule[]).filter(m =>
    props.corretora.modulos_bi.includes(m)
  );

  // Prefetch data for other modules
  const prefetchModule: 'indicadores' | 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' =
    (props.currentModule === 'acompanhamento-eventos' || props.currentModule === 'ouvidoria')
      ? 'indicadores' : props.currentModule;
  // 'cobranca' é excluída do pré-carregamento: a tela de Cobrança usa RPCs
  // server-side (rápidas o suficiente) e não consome mais o cache de
  // pré-carregamento — mantê-la aqui só gerava uma chamada "vazia" (log de
  // início/fim sem buscar nada) toda vez que o parceiro navegava por outro
  // módulo do portal.
  const prefetchAvailableModules = availableModules.filter(m => m !== 'cobranca');
  usePortalDataPrefetch(props.corretora.id, prefetchModule, prefetchAvailableModules);

  useEffect(() => {
    localStorage.setItem("portal-sidebar-expanded", String(expanded));
  }, [expanded]);

  // Sync main content margin/padding: desktop reserva espaço à esquerda pra
  // sidebar; mobile reserva espaço em cima (header fixo com a logo) e
  // embaixo (barra flutuante) pra nada ficar coberto.
  //
  // paddingTop precisa bater exatamente com a altura do PortalMobileHeader
  // (2.75rem + safe-area) — reduzida de 3.5rem porque a barra estava
  // "gordinha" tomando espaço demais da tela.
  useEffect(() => {
    const el = document.getElementById("portal-main-content");
    if (!el) return;
    if (isMobile || props.hidden) {
      el.style.marginLeft = "0";
      if (isMobile || props.hidden) {
        el.style.paddingTop = "calc(2.75rem + env(safe-area-inset-top))";
        el.style.paddingBottom = "5.75rem";
      }
    } else {
      el.style.marginLeft = expanded ? "15.5rem" : "4rem";
      el.style.paddingTop = "0";
      el.style.paddingBottom = "0";
    }
  }, [expanded, isMobile, props.hidden]);

  if (isMobile || props.hidden) {
    return null;
  }

  return (
    <>
      <div className={cn(
        "fixed top-2 bottom-2 left-2 z-[60] flex flex-col bg-card/95 backdrop-blur-md border border-border shadow-xl transition-all duration-300 ease-in-out rounded-2xl",
        expanded ? "w-60" : "w-[3.5rem]"
      )}>
        <button
          onClick={() => setExpanded(v => !v)}
          className="absolute -right-3 top-7 z-[70] h-6 w-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shadow-md"
          aria-label="Alternar sidebar"
        >
          {expanded ? <PanelLeftClose className="h-3 w-3 text-muted-foreground" /> : <PanelLeftOpen className="h-3 w-3 text-muted-foreground" />}
        </button>
        <div className="flex-1 overflow-hidden rounded-2xl">
          <SidebarContent {...props} collapsed={!expanded} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>

      <PortalSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} availableModules={availableModules} />
    </>
  );
}
