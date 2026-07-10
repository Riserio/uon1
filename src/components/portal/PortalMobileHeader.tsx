import { useIsMobile } from "@/hooks/use-mobile";
import { Building2 } from "lucide-react";

type Corretora = {
  nome: string;
  logo_url?: string | null;
  logo_collapsed_url?: string | null;
  logo_expanded_url?: string | null;
};

// Header fixo no topo, só no mobile: mostra a logo da associação (mesma
// prioridade de logos usada na sidebar desktop: expanded > url > collapsed).
// Fica entre a barra do navegador (que não dá pra controlar fora do modo
// PWA instalado) e o conteúdo, dando identidade visual à associação.
export default function PortalMobileHeader({ corretora }: { corretora: Corretora }) {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  const logo = corretora.logo_expanded_url || corretora.logo_url || corretora.logo_collapsed_url;

  return (
    <header
      // bg-card sólido (sem transparência) pra preencher de verdade a faixa
      // do relógio/status bar do celular — com viewport-fit=cover +
      // status-bar-style black-translucent no index.html, essa área passa a
      // ser desenhada pelo app, então o fundo aqui precisa ser opaco, senão
      // fica um "vazado" mostrando o que está atrás.
      className="fixed top-0 inset-x-0 z-[90] flex items-center justify-center bg-card border-b border-border/50"
      style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
    >
      {logo ? (
        <img src={logo} alt={corretora.nome} className="h-8 max-w-[55%] object-contain" />
      ) : (
        <div className="flex items-center gap-2 text-foreground">
          <Building2 className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold truncate max-w-[70vw]">{corretora.nome}</span>
        </div>
      )}
    </header>
  );
}
