import { Button } from "@/components/ui/button";
import { Bookmark, RotateCcw } from "lucide-react";

type Props = {
  onSalvar: () => void;
  onRestaurar: () => void;
  temPadrao: boolean;
};

/** Botões "Salvar como padrão" / "Restaurar padrão" usados em todas as telas de BI. */
export default function FiltrosPadraoBotoes({ onSalvar, onRestaurar, temPadrao }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onSalvar}>
        <Bookmark className="mr-1 h-3.5 w-3.5" /> Salvar como padrão
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={onRestaurar}
        title={temPadrao ? "Volta aos filtros que você salvou" : "Volta aos filtros iniciais da tela"}
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar padrão
      </Button>
    </div>
  );
}
