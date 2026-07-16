import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";

// No mobile, o Portal do Parceiro é feito para o modo retrato. Em paisagem,
// mostramos uma tela pedindo para girar o aparelho (bloqueando a navegação).
// Detecção: qualquer dispositivo touch (pointer: coarse) em orientação paisagem.
const QUERY = "(orientation: landscape) and (pointer: coarse)";

export default function PortalOrientationGuard() {
  const [bloquear, setBloquear] = useState(false);
  const lockedRef = useRef(false);

  // Tenta travar a orientação em retrato via Screen Orientation API.
  // Onde não for suportada (iOS, alguns navegadores), o overlay abaixo
  // continua impedindo o uso em paisagem.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const orientation = (window.screen as ScreenOrientationAPI).orientation;
    if (orientation && typeof orientation.lock === "function") {
      orientation
        .lock("portrait")
        .then(() => {
          lockedRef.current = true;
        })
        .catch(() => {
          // Lock pode exigir interação/tela cheia — ignoramos e deixamos o overlay.
        });
    }
    return () => {
      if (lockedRef.current && orientation && typeof orientation.unlock === "function") {
        orientation.unlock();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const update = () => setBloquear(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  if (!bloquear) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Smartphone className="h-8 w-8 animate-pulse" />
      </div>
      <h2 className="text-lg font-semibold">Gire o dispositivo</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        O portal foi feito para o modo retrato. Vire o celular na vertical para continuar.
      </p>
    </div>
  );
}

// Tipagem mínima para a Screen Orientation API (nem todos os targets a expõem).
interface ScreenOrientationAPI {
  orientation?: {
    lock?: (orientation: "portrait" | "portrait-primary" | "portrait-secondary" | "landscape") => Promise<void>;
    unlock?: () => void;
  };
}
