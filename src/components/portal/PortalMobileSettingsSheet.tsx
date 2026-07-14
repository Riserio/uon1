import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Settings, Star, ArrowLeftRight, LogOut, Download, CheckCircle2, Share, SquarePlus, X, Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MODULE_CONFIG, PortalModule } from "@/lib/portalModules";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { usePortalLayout } from "@/contexts/PortalLayoutContext";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  availableModules: PortalModule[];
  favoritos: PortalModule[];
  toggleFavorito: (mod: PortalModule) => void;
  maxFavoritos: number;
  showChangeButton?: boolean;
  onChangeCorretora?: () => void;
  onLogout: () => void;
  onNavigateModule: (mod: PortalModule) => void;
};

// Tela de Configurações do mobile, aberta pelo 5º ícone da barra flutuante.
// Reúne: seleção de favoritos (máx. 4, com atalho pra abrir o módulo),
// instalação como PWA, trocar associação e sair — antes espalhado entre o
// drawer genérico e o diálogo de configurações do carrossel (removidos do
// mobile).
export default function PortalMobileSettingsSheet({
  open,
  onOpenChange,
  availableModules,
  favoritos,
  toggleFavorito,
  maxFavoritos,
  showChangeButton,
  onChangeCorretora,
  onLogout,
  onNavigateModule,
}: Props) {
  const { canInstall, isIos, isStandalone, promptInstall } = usePwaInstall();
  const [showIosSteps, setShowIosSteps] = useState(false);
  const { menuPosition, setMenuPosition } = usePortalLayout();

  // ---- Notificações push (OneSignal) ----
  // O sino flutuante do OneSignal foi desativado; o controle vive aqui.
  const [pushDisponivel, setPushDisponivel] = useState(false);
  const [pushAtivado, setPushAtivado] = useState(false);
  const [pushBloqueado, setPushBloqueado] = useState(false);
  const [pushOcupado, setPushOcupado] = useState(false);

  useEffect(() => {
    if (!open) return;
    // deno-lint-ignore no-explicit-any
    const osd = (window as any).OneSignalDeferred;
    if (!osd) return;
    // deno-lint-ignore no-explicit-any
    osd.push(async (OneSignal: any) => {
      try {
        setPushDisponivel(true);
        setPushAtivado(!!OneSignal.User?.PushSubscription?.optedIn);
        setPushBloqueado(typeof Notification !== "undefined" && Notification.permission === "denied");
      } catch { /* opcional */ }
    });
  }, [open]);

  const handleTogglePush = async (ligar: boolean) => {
    setPushOcupado(true);
    // deno-lint-ignore no-explicit-any
    const osd = (window as any).OneSignalDeferred;
    // deno-lint-ignore no-explicit-any
    osd?.push(async (OneSignal: any) => {
      try {
        if (ligar) {
          if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
            await OneSignal.Notifications.requestPermission();
          }
          if (typeof Notification !== "undefined" && Notification.permission === "denied") {
            setPushBloqueado(true);
            toast.error("Notificações bloqueadas no navegador. Libere nas configurações do aparelho.");
            return;
          }
          await OneSignal.User.PushSubscription.optIn();
          setPushAtivado(true);
          toast.success("Notificações ativadas");
        } else {
          await OneSignal.User.PushSubscription.optOut();
          setPushAtivado(false);
          toast.success("Notificações desativadas");
        }
      } catch {
        toast.error("Não foi possível alterar as notificações");
      } finally {
        setPushOcupado(false);
      }
    });
  };

  const handleToggleFavorito = (mod: PortalModule) => {
    if (!favoritos.includes(mod) && favoritos.length >= maxFavoritos) {
      toast.error(`Você já tem ${maxFavoritos} favoritos. Remova um antes de adicionar outro.`);
      return;
    }
    toggleFavorito(mod);
  };

  const handleInstall = async () => {
    if (isStandalone) {
      toast.info("O app já está instalado neste dispositivo.");
      return;
    }
    if (canInstall) {
      // Android/Chrome: instalação real em 1 toque, sem sair do app.
      const accepted = await promptInstall();
      if (accepted) toast.success("App instalado!");
      return;
    }
    if (isIos) {
      // iOS/Safari não expõe API de instalação programática (restrição da
      // Apple) — não existe forma de instalar com 1 toque como no Android.
      // Em vez de um toast que some, mostramos um passo a passo fixo aqui
      // dentro do diálogo, com os ícones reais do Safari, pra deixar claro
      // o caminho sem precisar "ficar procurando" no navegador.
      setShowIosSteps(true);
      return;
    }
    toast.info("Instalação não disponível neste navegador. Tente pelo Chrome ou Safari.");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col p-0 gap-0 rounded-t-2xl border-t max-h-[88vh] focus:outline-none [&>button]:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Alça visual de arrastar — deixa claro que é um painel deslizável,
            estilo folha/bottom-sheet nativa, em vez de um modal "preso". */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
        </div>

        <SheetHeader className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-left">
              <Settings className="h-5 w-5 text-primary" />
              Configurações
            </SheetTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 -mr-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Fechar configurações"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </SheetHeader>

        {/* Scroll nativo (overflow-y-auto + momentum do iOS) em vez do
            Radix ScrollArea: no bottom sheet mobile o ScrollArea tinha
            conflito de gesto com o próprio arrasto do sheet e não rolava
            de forma confiável. Overflow nativo do navegador é mais robusto
            aqui. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="space-y-6 pb-6">
            {/* Posição do menu */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Posição do menu</p>
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

            <div className="border-t border-border/50" />

            {/* Favoritos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Favoritos da barra</p>
                <span className="text-xs text-muted-foreground">
                  {favoritos.length}/{maxFavoritos}
                </span>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Toque na estrela pra escolher até {maxFavoritos} atalhos. Toque no módulo pra abrir.
              </p>
              <div className="space-y-1">
                {availableModules.map((mod) => {
                  const cfg = MODULE_CONFIG[mod];
                  if (!cfg) return null;
                  const Icon = cfg.icon;
                  const isFav = favoritos.includes(mod);
                  return (
                    <div key={mod} className="flex items-center gap-1 rounded-lg hover:bg-muted/50 transition-colors">
                      <button
                        onClick={() => onNavigateModule(mod)}
                        className="flex items-center gap-3 flex-1 px-2 py-2.5 text-sm text-left"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>{cfg.label}</span>
                      </button>
                      <button
                        onClick={() => handleToggleFavorito(mod)}
                        className="p-2.5 mr-1"
                        aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            isFav ? "fill-primary text-primary" : "text-muted-foreground/40"
                          )}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border/50" />

            {/* App */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Aplicativo</p>
              <button
                onClick={handleInstall}
                className="flex items-center gap-3 w-full px-2 py-2.5 rounded-lg text-sm hover:bg-muted/50 transition-colors"
              >
                {isStandalone ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span>{isStandalone ? "App já instalado" : "Adicionar à tela inicial"}</span>
              </button>

              {showIosSteps && !isStandalone && (
                <div className="relative rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
                  <button
                    onClick={() => setShowIosSteps(false)}
                    className="absolute top-2 right-2 p-1 text-muted-foreground/60 hover:text-muted-foreground"
                    aria-label="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-xs text-muted-foreground pr-5">
                    O Safari não permite instalar com 1 toque — é uma restrição da Apple,
                    não do app. Siga os 2 passos abaixo (leva 5 segundos):
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      1
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span>Toque no ícone</span>
                      <Share className="h-4 w-4 text-blue-500" />
                      <span>Compartilhar, na barra do Safari</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      2
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <SquarePlus className="h-4 w-4 text-foreground" />
                      <span>Toque em "Adicionar à Tela de Início"</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {pushDisponivel && (
              <>
                <div className="border-t border-border/50" />

                {/* Notificações */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Notificações</p>
                  <div className="flex items-center justify-between px-2 py-2.5 rounded-lg">
                    <div className="flex items-center gap-3">
                      {pushAtivado ? (
                        <Bell className="h-4 w-4 text-primary flex-shrink-0" />
                      ) : (
                        <BellOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm">Notificações push</p>
                        <p className="text-xs text-muted-foreground">
                          {pushBloqueado
                            ? "Bloqueadas no navegador — libere nas configurações do aparelho"
                            : "Avisos e comunicados da associação"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={pushAtivado}
                      disabled={pushOcupado || pushBloqueado}
                      onCheckedChange={handleTogglePush}
                      aria-label="Ativar ou desativar notificações push"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="border-t border-border/50" />

            {/* Conta */}
            <div className="space-y-1 pb-1">
              <p className="text-sm font-semibold mb-1">Conta</p>
              {showChangeButton && onChangeCorretora && (
                <button
                  onClick={() => {
                    onChangeCorretora();
                    onOpenChange(false);
                  }}
                  className="flex items-center gap-3 w-full px-2 py-2.5 rounded-lg text-sm hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeftRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>Trocar associação</span>
                </button>
              )}
              <button
                onClick={() => {
                  onLogout();
                  onOpenChange(false);
                }}
                className="flex items-center gap-3 w-full px-2 py-2.5 rounded-lg text-sm text-orange-500 hover:bg-orange-500/10 transition-colors"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
