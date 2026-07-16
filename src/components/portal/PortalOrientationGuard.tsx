import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

// No mobile, o Portal do Parceiro é feito para o modo retrato. Em paisagem,
// mostramos uma tela pedindo para girar o aparelho (bloqueando a navegação).
// Detecção: touch (pointer coarse) + orientação paisagem + altura baixa — pega
// celular em paisagem sem afetar desktop/tablet grande.
const QUERY = "(orientation: landscape) and (max-height: 600px) and (pointer: coarse)";

export default function PortalOrientationGuard() {
  const [bloquear, setBloquear] = useState(false);

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
