import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULE_CONFIG, PortalModule } from "@/lib/portalModules";
import { usePortalFavoritos } from "@/hooks/usePortalFavoritos";
import { usePortalCarouselOptional } from "@/contexts/PortalCarouselContext";
import { useIsMobile } from "@/hooks/use-mobile";
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

// Barra flutuante estilo Instagram, responsiva: compacta e centralizada no
// mobile (4 favoritos + Ajustes), mais larga e distribuída no desktop, onde
// por padrão exibe TODOS os módulos disponíveis — mas segue editável (o
// usuário pode ocultar alguns pelo botão de Configurações). As duas listas
// são independentes (chaves distintas no localStorage).
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
  // Mobile: 4 favoritos (default = primeiros 4). Desktop: todos os módulos
  // por padrão, editável, sem limite. Os dois hooks rodam sempre (nada de
  // hook condicional); só a lista usada muda conforme o tamanho de tela.
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

  return (
    <>
      {/* Mobile: pill compacta e centralizada, com botões de largura fixa
          (w-14) para não estourar a tela. Desktop: barra mais larga, com
          max-width sensato, distribuindo os 5 itens ao longo da largura
          disponível sem colar nas bordas. */}
      {/* pointer-events-none no container só serve pra caso alguma página
          coloque um overlay full-screen — os botões dentro do <nav> reativam
          eventos com pointer-events-auto. isolate cria stacking context próprio
          pra que nenhuma section com z-index dentro das páginas fique acima. */}
      {/* Fundo 100% opaco (sem transparência/blur): com bg-card/95 + blur, o
          conteúdo da página (ex.: as abas Financeiro/Permanência) passando
          atrás durante o scroll ficava visível por trás da pill, dando a
          impressão de uma segunda barra colada/vazamento. */}
      <nav
        className="fixed bottom-3 inset-x-0 mx-auto z-[100] isolate rounded-full bg-card border border-border/70 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.18)] px-2 md:px-3 lg:px-5 flex items-center justify-center md:justify-between gap-0.5 md:gap-1.5 lg:gap-3 w-fit max-w-[calc(100vw-1.5rem)] md:w-full md:max-w-4xl lg:max-w-5xl pointer-events-auto"
        style={{ paddingTop: "0.25rem", paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        {favoritos.map((mod) => {
          const cfg = MODULE_CONFIG[mod];
          if (!cfg) return null;
          const Icon = cfg.icon;
          const isActive = mod === currentModule;
          return (
            <button
              key={mod}
              onClick={() => handleNav(mod)}
              aria-current={isActive ? "page" : undefined}
              className="group flex flex-col items-center justify-center gap-1 w-14 md:w-auto md:flex-1 md:max-w-[10rem] shrink-0 py-1 landscape:py-0.5 rounded-2xl transition-transform active:scale-90"
            >
              <span
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full transition-all duration-200",
                  isActive
                    ? "bg-accent-brand/12 text-accent-brand"
                    : "text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform duration-200", isActive && "scale-110")} />
              </span>
              <span
                className={cn(
                  "text-[9px] md:text-[11px] leading-none truncate max-w-[52px] md:max-w-[8rem] transition-colors",
                  isActive ? "font-semibold text-accent-brand" : "font-medium text-muted-foreground"
                )}
              >
                {cfg.shortLabel}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => setSettingsOpen(true)}
          className="group flex flex-col items-center justify-center gap-1 w-14 md:w-auto md:flex-1 md:max-w-[10rem] shrink-0 py-1 landscape:py-0.5 rounded-2xl transition-transform active:scale-90"
        >
          <span className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground transition-all duration-200 group-hover:bg-muted group-hover:text-foreground">
            <Settings className="h-5 w-5" />
          </span>
          <span className="text-[9px] md:text-[11px] font-medium leading-none text-muted-foreground">Ajustes</span>
        </button>
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
