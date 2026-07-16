import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  logo?: string | null;
  nome?: string;
  // Reexibe a splash sempre que mudar (ex.: troca de associação).
  corretoraId?: string;
};

// Splash exibida ao abrir o /portal e a cada troca de associação. ~3s com
// fade-out suave. Co-branding: logo da Vangard | logo da associação.
export default function PortalSplash({ logo, nome, corretoraId }: Props) {
  const [visivel, setVisivel] = useState(true);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    setVisivel(true);
    setSaindo(false);
    const tFade = setTimeout(() => setSaindo(true), 2500);
    const tHide = setTimeout(() => setVisivel(false), 3000);
    return () => {
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
        {logo && (
          <>
            <div className="h-10 w-px bg-border" />
            <img
              src={logo}
              alt={nome || "Associação"}
              className="h-12 max-w-[150px] object-contain"
            />
          </>
        )}
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-primary/70" />
    </div>
  );
}
