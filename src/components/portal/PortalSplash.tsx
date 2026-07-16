import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  logo?: string | null;
  nome?: string;
};

// Splash exibida ao abrir o /portal — uma vez por sessão do navegador.
// Mostra a logo da associação (fallback: logo do app), com fade-out suave.
export default function PortalSplash({ logo, nome }: Props) {
  const [visivel, setVisivel] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("portal-splash-shown") !== "1";
    } catch {
      return true;
    }
  });
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    try {
      sessionStorage.setItem("portal-splash-shown", "1");
    } catch {
      // sem persistência — segue exibindo só nesta montagem
    }
    const t1 = setTimeout(() => setSaindo(true), 1300);
    const t2 = setTimeout(() => setVisivel(false), 1850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visivel]);

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
