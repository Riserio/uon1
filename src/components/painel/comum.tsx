import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const CARTAO = "rounded-3xl border border-border/40 bg-card shadow-sm";

/** Cabeçalho dos blocos do painel: título, linha de apoio e ação à direita. */
export function Cabecalho({
  icone: Icone,
  cor,
  titulo,
  subtitulo,
  direita,
}: {
  icone: LucideIcon;
  cor: string;
  titulo: string;
  subtitulo?: React.ReactNode;
  direita?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${cor}`}>
          <Icone className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight leading-tight truncate">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted-foreground truncate">{subtitulo}</p>}
        </div>
      </div>
      {direita}
    </div>
  );
}

export const Rotulo = ({ children }: { children: React.ReactNode }) => <p className="text-xs font-semibold text-muted-foreground mb-2">{children}</p>;

/** Número com rótulo; vira link quando recebe `para`. */
export function Indicador({ valor, rotulo, detalhe, cor, para }: { valor: React.ReactNode; rotulo: string; detalhe?: React.ReactNode; cor?: string; para?: string }) {
  const corpo = (
    <>
      <p className={`text-2xl font-bold tabular-nums leading-tight ${cor ?? ""}`}>{valor}</p>
      <p className="text-xs font-medium mt-1">{rotulo}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{detalhe}</p>}
    </>
  );
  const classe = "rounded-2xl bg-muted/40 p-3.5 block min-w-0";
  return para ? (
    <Link to={para} className={`${classe} hover:bg-muted/70 transition-colors`}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

export interface Etapa {
  rotulo: string;
  valor: number;
  detalhe?: string;
  /** classes de cor do topo e do número, ex.: "bg-blue-500" / "text-blue-600" */
  barra: string;
  texto: string;
}

/**
 * Caminho em etapas, da esquerda para a direita: cada bloco é um passo do
 * fluxo (a ordem é real), com o volume que está parado nele.
 */
export function Caminho({ etapas, para }: { etapas: Etapa[]; para: string }) {
  return (
    <Link to={para} className="flex items-stretch rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors overflow-hidden">
      {etapas.map((e, i) => (
        <div key={e.rotulo} className="relative flex-1 min-w-0 px-3 sm:px-4 py-3.5">
          <span className={`absolute left-0 right-0 top-0 h-1 ${e.valor ? e.barra : "bg-transparent"}`} />
          <p className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${e.valor ? e.texto : "text-muted-foreground/50"}`}>{e.valor}</p>
          <p className="text-xs font-medium mt-1.5 leading-tight">{e.rotulo}</p>
          {e.detalhe && <p className="text-[11px] text-muted-foreground truncate">{e.detalhe}</p>}
          {i < etapas.length - 1 && <ChevronRight className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 z-10" aria-hidden />}
        </div>
      ))}
    </Link>
  );
}

/** Contagens que ficam fora do caminho principal (vencidas, recusadas, canceladas). */
export function Laterais({ itens, para }: { itens: { rotulo: string; valor: number; tom?: "alerta" | "atencao" }[]; para: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <Link
          key={i.rotulo}
          to={para}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
            !i.valor
              ? "bg-muted/50 text-muted-foreground"
              : i.tom === "alerta"
                ? "bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20"
                : i.tom === "atencao"
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25"
                  : "bg-muted text-foreground hover:bg-muted/70"
          }`}
        >
          <strong className="tabular-nums">{i.valor}</strong> {i.rotulo}
        </Link>
      ))}
    </div>
  );
}
