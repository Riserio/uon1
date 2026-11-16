import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

/**
 * Área com rolagem própria. Enquanto houver conteúdo abaixo, mostra um
 * esmaecido e uma seta que desce a lista. `onFim` é chamado quando a pessoa
 * chega perto do fim (para carregar a próxima página).
 */
export function ListaRolavel({
  children,
  className = "",
  onFim,
  carregando,
  rotuloSeta = "Ver mais abaixo",
}: {
  children: React.ReactNode;
  className?: string;
  onFim?: () => void;
  carregando?: boolean;
  rotuloSeta?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [temMais, setTemMais] = useState(false);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const resta = el.scrollHeight - el.scrollTop - el.clientHeight;
    setTemMais(resta > 8);
    if (resta < 120) onFim?.();
  }, [onFim]);

  useEffect(() => {
    medir();
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    Array.from(el.children).forEach((c) => obs.observe(c));
    return () => obs.disconnect();
  }, [medir, children]);

  const descer = () => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.8, behavior: "smooth" });

  return (
    <div className={`relative min-h-0 ${className}`}>
      <div ref={ref} onScroll={medir} className="h-full overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {children}
        {carregando && (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>
      {temMais && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />
          <button
            type="button"
            onClick={descer}
            aria-label={rotuloSeta}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-background border border-border/70 shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground motion-safe:animate-bounce"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
