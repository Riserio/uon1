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
};

// Barra flutuante estilo Instagram, só no mobile: mostra os 4 favoritos do
// usuário + um botão de Configurações (que abre o seletor de favoritos, o
// botão de instalar como PWA, trocar associação e sair). Substitui por
// completo a navegação mobile antiga (hamburger + drawer + carrossel).
export default function PortalMobileNav({
  corretora,
  currentModule,
  availableModules,
  showChangeButton,
  onChangeCorretora,
  onLogout,
}: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const carousel = usePortalCarouselOptional();
  const assocKey = corretora.slug || corretora.id;
  const { favoritos, toggleFavorito, maxFavoritos } = usePortalFavoritos(corretora.id, availableModules);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!isMobile) return null;

  const handleNav = (mod: PortalModule) => {
    if (carousel) {
      carousel.goToModule(mod);
    } else {
      navigate(`${MODULE_CONFIG[mod].path}?associacao=${assocKey}`);
    }
  };

  return (
    <>
      {/* Largura padrão do sistema: barra ocupa praticamente a tela toda
          (igual ao tab bar nativo), com os botões distribuídos igualmente
          (flex-1 + justify-between) em vez de agrupados no centro com
          largura fixa por botão — isso fazia a pill ficar bem mais estreita
          que o padrão esperado. */}
      {/* pointer-events-none no container só serve pra caso alguma página
          coloque um overlay full-screen — os botões dentro do <nav> reativam
          eventos com pointer-events-auto. isolate cria stacking context próprio
          pra que nenhuma section com z-index dentro das páginas fique acima. */}
      {/* Fundo 100% opaco (sem transparência): com bg-card/95 + blur, o
          conteúdo da página passando atrás durante o scroll ficava visível
          por trás da pill, dando a impressão de "duas barras coladas" /
          altura dobrada. Sólido evita esse efeito em qualquer posição de
          scroll. */}
      <nav
        className="fixed bottom-3 inset-x-3 z-[100] isolate rounded-full bg-card border border-border shadow-2xl px-3 flex items-center justify-between gap-1 pointer-events-auto"
        style={{ paddingTop: "0.4rem", paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}
      >
        {favoritos.map((mod) => {
          const cfg = MODULE_CONFIG[mod];
          const Icon = cfg.icon;
          const isActive = mod === currentModule;
          return (
            <button
              key={mod}
              onClick={() => handleNav(mod)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 py-1.5 rounded-full transition-colors",
                isActive ? "text-orange-500" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} />
              <span className="text-[9px] font-medium leading-none truncate max-w-full">
                {cfg.shortLabel}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => setSettingsOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 py-1.5 rounded-full text-muted-foreground"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[9px] font-medium leading-none">Ajustes</span>
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
