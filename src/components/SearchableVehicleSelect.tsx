import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

interface SearchableVehicleSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  vehicleType?: string; // Mantido para compatibilidade, mas não é mais usado para filtragem
}

export function SearchableVehicleSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Selecione...",
  disabled = false,
  vehicleType,
}: SearchableVehicleSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // IMPORTANTE: Não filtrar por vehicleType aqui porque a API FIPE já retorna marcas filtradas por tipo.
  // A filtragem por tipo só é necessária quando usamos o fallback JSON, mas isso é feito no hook useFipeVeiculos.
  const filteredOptions = useMemo(() => {
    let filtered = options;

    // 🔹 Apenas filtro de busca por texto
    if (search.trim().length > 0) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((option) => option.toLowerCase().includes(searchLower));
    }

    return [...filtered].sort();
  }, [options, search]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between", !value && "text-muted-foreground")}
          >
            {value || placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="p-0 bg-popover border shadow-md"
          align="start"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <CommandInput
                placeholder={
                  vehicleType ? "Digite para buscar ou role a lista..." : "Selecione o tipo do veículo primeiro"
                }
                value={search}
                onValueChange={setSearch}
                disabled={!vehicleType}
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <CommandList>
              {!vehicleType ? (
                <CommandEmpty>
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Selecione primeiro o tipo de veículo (Carro, Moto ou Caminhão)
                  </div>
                </CommandEmpty>
              ) : filteredOptions.length === 0 ? (
                <CommandEmpty>
                  <div className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredOptions.map((option) => (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => {
                        onChange(option);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                      {option}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
