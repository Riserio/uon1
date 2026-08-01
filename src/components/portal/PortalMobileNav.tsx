import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULE_CONFIG, PortalModule } from "@/lib/portalModules";
import { usePortalFavoritos } from "@/hooks/usePortalFavoritos";
import { usePortalCarouselOptional } from "@/contexts/PortalCarouselContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import PortalMobileSettingsSheet from "./PortalMobileSettingsSheet";

type Corretora = {
  id: string;
  nome: string;
  slug?: string | null;
  modulos_bi: string[];
};

type Props = {
  corretora: Corretora;
  currentModule: PortalModule;
  availableModules: PortalModule[];
  showChangeButton?: boolean;
  onChangeCorretora?: () => void;
  onLogout: () => void;
  force?: boolean;
};

// Cor de destaque (laranja da marca) usada no item ativo.
const ACCENT = "#FF6B1A";

// Barra flutuante moderna estilo "pill": só ícones, item ativo num círculo
// laranja preenchido, tooltip com o nome ao passar o mouse, e um botão de
// sair separado por um divisor. Responsiva: mobile mostra os favoritos
// (default = primeiros 4), desktop mostra todos os módulos disponíveis
// (editável pelo botão de Configurações). As duas listas são independentes.
export default function PortalMobileNav({
  corretora,
  currentModule,
  availableModules,
  showChangeButton,
  onChangeCorretora,
  onLogout,
  force = false,
}: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const carousel = usePortalCarouselOptional();
  const assocKey = corretora.slug || corretora.id;
  const mobileFav = usePortalFavoritos(corretora.id, availableModules);
  const desktopNav = usePortalFavoritos(corretora.id, availableModules, {
    storageKeyPrefix: "portal-nav-desktop",
    maxFavoritos: availableModules.length || 1,
    defaultAll: true,
  });
  const { favoritos, toggleFavorito, maxFavoritos } = isMobile ? mobileFav : desktopNav;
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!isMobile && !force) return null;

  const handleNav = (mod: PortalModule) => {
    if (carousel) {
      carousel.goToModule(mod);
    } else {
      const cfg = MODULE_CONFIG[mod];
      if (cfg) navigate(`${cfg.path}?associacao=${assocKey}`);
    }
  };

  // Botão-ícone com tooltip. Círculo preenchido em laranja quando ativo.
  const IconButton = ({
    label,
    active,
    danger,
    onClick,
    children,
  }: {
    label: string;
    active?: boolean;
    danger?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className="shrink-0 rounded-full transition-transform active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B1A]/50"
        >
          <span
            className={cn(
              "flex items-center justify-center h-11 w-11 rounded-full transition-all duration-200",
              active
                ? "text-white shadow-md"
                : danger
                  ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            style={active ? { backgroundColor: ACCENT, boxShadow: `0 6px 16px -4px ${ACCENT}66` } : undefined}
          >
            {children}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <>
      <nav
        className="fixed inset-x-0 mx-auto z-[100] isolate rounded-full bg-card border border-border/70 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.22)] px-2.5 py-2 flex items-center gap-1 w-fit max-w-[calc(100vw-1.5rem)] pointer-events-auto"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {favoritos.map((mod) => {
          const cfg = MODULE_CONFIG[mod];
          if (!cfg) return null;
          const Icon = cfg.icon;
          const isActive = mod === currentModule;
          return (
            <IconButton key={mod} label={cfg.label} active={isActive} onClick={() => handleNav(mod)}>
              <Icon className={cn("h-5 w-5 transition-transform duration-200", isActive && "scale-105")} />
            </IconButton>
          );
        })}

        <IconButton label="Configurações" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-5 w-5" />
        </IconButton>

        <span className="mx-1 h-6 w-px bg-border shrink-0" aria-hidden="true" />

        <IconButton label="Sair" danger onClick={onLogout}>
          <LogOut className="h-5 w-5" />
        </IconButton>
      </nav>

      <PortalMobileSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        availableModules={availableModules}
        favoritos={favoritos}
        toggleFavorito={toggleFavorito}
        maxFavoritos={maxFavoritos}
        showChangeButton={showChangeButton}
        onChangeCorretora={onChangeCorretora}
        onLogout={onLogout}
        onNavigateModule={(mod) => {
          handleNav(mod);
          setSettingsOpen(false);
        }}
      />
    </>
  );
}
