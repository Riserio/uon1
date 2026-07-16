import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  logo?: string | null;
  nome?: string;
  // Reexibe a splash sempre que mudar (ex.: troca de associação).
  corretoraId?: string;
};

// Splash em duas fases, ao abrir o /portal e a cada troca de associação:
//   1) ~2s exibindo só a logo da Vangard;
//   2) a logo da associação aparece ao lado (co-branding) e então some com
//      fade-out suave.
export default function PortalSplash({ logo, nome, corretoraId }: Props) {
  const [visivel, setVisivel] = useState(true);
  const [saindo, setSaindo] = useState(false);
  const [mostrarAssoc, setMostrarAssoc] = useState(false);

  useEffect(() => {
    setVisivel(true);
    setSaindo(false);
    setMostrarAssoc(false);
    const tAssoc = setTimeout(() => setMostrarAssoc(true), 2000); // 2s só Vangard
    const tFade = setTimeout(() => setSaindo(true), 3000);
    const tHide = setTimeout(() => setVisivel(false), 3500);
    return () => {
      clearTimeout(tAssoc);
      clearTimeout(tFade);
      clearTimeout(tHide);
    };
  }, [corretoraId]);

  if (!visivel) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[300] flex flex-col items-center justify-center gap-8 bg-gradient-to-br from-background via-background to-muted/30 transition-opacity duration-500 ease-out",
        saindo ? "opacity-0" : "opacity-100"
      )}
    >
      <div className="flex items-center gap-5 animate-in fade-in zoom-in-95 duration-700">
        <img
          src="/images/vangard-logo.png"
          alt="Vangard"
          className="h-12 max-w-[150px] object-contain"
        />
        {logo && mostrarAssoc && (
          <>
            <div className="h-10 w-px bg-border animate-in fade-in duration-500" />
            <img
              src={logo}
              alt={nome || "Associação"}
              className="h-12 max-w-[150px] object-contain animate-in fade-in slide-in-from-right-4 duration-500"
            />
          </>
        )}
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-primary/70" />
    </div>
  );
}
