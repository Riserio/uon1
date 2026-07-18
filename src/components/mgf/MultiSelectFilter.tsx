import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Texto quando nada está selecionado (= todos). Ex.: "Todas SubOp." */
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  className?: string;
};

// Filtro de seleção múltipla (pedido do dossiê: escolher mais de uma
// subOperação, e Entrada+Saída no mesmo filtro). Lista vazia = todos.
export default function MultiSelectFilter({ allLabel, options, selected, onChange, className }: Props) {
  const resumo =
    selected.length === 0
      ? allLabel
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selecionados`;

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 justify-between text-xs font-normal", className)}
        >
          <span className="truncate">{resumo}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "w-full rounded px-2 py-2 text-left text-xs hover:bg-muted",
            selected.length === 0 && "font-semibold text-primary"
          )}
        >
          {allLabel}
        </button>
        <div className="max-h-64 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted"
            >
              <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
