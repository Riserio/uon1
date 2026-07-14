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
//
// Altura reduzida (2.75rem, padrão de toolbar fina tipo iOS) — estava em
// 3.5rem e ficou "gordinha" tomando espaço demais da tela no mobile.
export default function PortalMobileHeader({ corretora, force = false }: { corretora: Corretora; force?: boolean }) {
  const isMobile = useIsMobile();
  if (!isMobile && !force) return null;

  const logo = corretora.logo_expanded_url || corretora.logo_url || corretora.logo_collapsed_url;

  return (
    <header
      // bg-card sólido (sem transparência) pra preencher de verdade a faixa
      // do relógio/status bar do celular — com viewport-fit=cover +
      // status-bar-style black-translucent no index.html, essa área passa a
      // ser desenhada pelo app, então o fundo aqui precisa ser opaco, senão
      // fica um "vazado" mostrando o que está atrás.
      className="fixed top-0 inset-x-0 z-[90] flex items-center justify-center bg-card border-b border-border/50"
      style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(2.75rem + env(safe-area-inset-top))" }}
    >
      {logo ? (
        <img src={logo} alt={corretora.nome} className="h-6 max-w-[50%] object-contain" />
      ) : (
        <div className="flex items-center gap-2 text-foreground">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold truncate max-w-[70vw]">{corretora.nome}</span>
        </div>
      )}
    </header>
  );
}
