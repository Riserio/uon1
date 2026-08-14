import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OpcaoSelect = { valor: string; rotulo: string };

/**
 * Lista suspensa com busca e numeração das opções.
 *
 * O Select comum vira um problema quando a lista passa de uma dúzia: quem
 * responde precisa rolar procurando, e em formulário longo isso cansa. Aqui a
 * pessoa digita parte do texto e a opção aparece.
 *
 * As opções vêm numeradas para poder citar "a 7" em reunião e todo mundo achar
 * a mesma linha.
 */
export function SelectBuscavel({
  opcoes,
  valor,
  onChange,
  placeholder = "Selecione...",
  cor,
  className,
}: {
  opcoes: OpcaoSelect[];
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  cor?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const selecionada = opcoes.find((o) => o.valor === valor);
  const indice = opcoes.findIndex((o) => o.valor === valor);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          className={cn(
            "w-full justify-between font-normal",
            !selecionada && "text-muted-foreground",
            className,
          )}
          style={selecionada && cor ? { borderColor: cor } : undefined}
        >
          <span className="truncate text-left">
            {selecionada ? (
              <>
                <span className="tabular-nums opacity-60 mr-2">{indice + 1}.</span>
                {selecionada.rotulo}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Buscar..." />
          <CommandList>
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandGroup>
              {opcoes.map((o, i) => (
                <CommandItem
                  key={o.valor}
                  value={`${i + 1} ${o.rotulo} ${o.valor}`}
                  onSelect={() => {
                    onChange(o.valor);
                    setAberto(false);
                  }}
                  className="gap-2"
                >
                  <span className="tabular-nums text-xs text-muted-foreground w-6 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="flex-1">{o.rotulo}</span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      valor === o.valor ? "opacity-100" : "opacity-0",
                    )}
                    style={cor ? { color: cor } : undefined}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default SelectBuscavel;
