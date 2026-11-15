import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { CardTitle } from "@/components/ui/card";

export const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const CARTAO = "rounded-2xl border-border/40 shadow-sm";

/** Cabeçalho padrão dos blocos do painel: ícone em chip + título + ação à direita. */
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
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cor}`}>
          <Icone className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold truncate">{titulo}</CardTitle>
          {subtitulo && <p className="text-xs text-muted-foreground truncate">{subtitulo}</p>}
        </div>
      </div>
      {direita}
    </div>
  );
}

/** Número com rótulo; vira link quando recebe `para`. */
export function Indicador({
  valor,
  rotulo,
  detalhe,
  cor,
  para,
}: {
  valor: React.ReactNode;
  rotulo: string;
  detalhe?: React.ReactNode;
  cor?: string;
  para?: string;
}) {
  const corpo = (
    <>
      <p className={`text-2xl font-bold tabular-nums leading-tight ${cor ?? ""}`}>{valor}</p>
      <p className="text-xs font-medium mt-1">{rotulo}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{detalhe}</p>}
    </>
  );
  const classe = "rounded-xl border border-border/50 bg-background/60 p-3 block min-w-0";
  return para ? (
    <Link to={para} className={`${classe} hover:bg-muted/50 transition-colors`}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}
