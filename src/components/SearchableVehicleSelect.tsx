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
  vehicleType?: string; // "carro" | "moto" | "caminhao"
}

// Helper para categorizar marcas por tipo de veículo
// IMPORTANTE: Usa comparação exata para permitir "Ford" (carros) e "FORD" (caminhões) separados
const getBrandCategory = (brand: string): string[] => {
  // Marcas exclusivas de motos (comparação uppercase)
  const motorcycleBrands = [
    "ADLY",
    "APRILIA",
    "AVELLOZ",
    "AMAZONAS",
    "ATALA",
    "BAJAJ",
    "BEE",
    "BENELLI",
    "BETA",
    "BIMOTA",
    "BRANDY",
    "BRAVA",
    "BRAVAX",
    "BUELL",
    "BUENO",
    "BULL",
    "CAGIVA",
    "CALOI",
    "CASAL",
    "DAELIM",
    "DAFRA",
    "DAYUN",
    "DERBI",
    "DUCATI",
    "EMME",
    "FYM",
    "GARELLI",
    "GAS GAS",
    "HARLEY-DAVIDSON",
    "HARTFORD",
    "HONDA",
    "HUSABERG",
    "HUSQVARNA",
    "HYOSUNG",
    "IROS",
    "JIALING",
    "JOHNNYPAG",
    "KAHENA",
    "KASINSKI",
    "KAWASAKI",
    "KEEWAY",
    "KTM",
    "KYMCO",
    "LAVRALE",
    "LERIVO",
    "LIFAN",
    "MALAGUTI",
    "MIZA",
    "MOBILETE",
    "MOTO GUZZI",
    "MRX",
    "MV AGUSTA",
    "ORCA",
    "PEUGEOT",
    "PIAGGIO",
    "SANYANG",
    "SHINERAY",
    "SUNDOWN",
    "SUZUKI",
    "TRAXX",
    "TRIUMPH",
    "VENTO",
    "VESPA",
    "YAMAHA",
    "YUMBO",
    "ZONGSHEN",
    "ZONTES",
  ];

  // Marcas de caminhões/ônibus - comparação exata com o nome no JSON
  // "FORD" maiúsculo = caminhões, "Ford" capitalizado = carros
  const truckBrandsExact = [
    "AGRALE",
    "BEPOBUS",
    "FORD",        // FORD maiúsculo = F-4000, F-350, etc (caminhões)
    "FORD CARGO",
    "FOTON",
    "IVECO",
    "MAN",
    "MERCEDES-BENZ",
    "NAVISTAR",
    "SAAB-SCANIA",
    "SCANIA",
    "SHACMAN",
    "SIAMOTO",
    "SINOTRUCK",
    "VOLKSWAGEN",
    "VOLVO",
    "WALKBUS",
    "DAF",
    "FREIGHTLINER",
    "INTERNATIONAL",
    "KENWORTH",
    "MACK",
    "PETERBILT",
    "STERLING",
    "WESTERN STAR",
  ];

  const categories: string[] = [];

  // Verifica se é moto (comparação uppercase)
  if (motorcycleBrands.includes(brand.toUpperCase())) {
    categories.push("moto");
  }

  // Verifica se é caminhão - usa comparação EXATA para distinguir "FORD" de "Ford"
  if (truckBrandsExact.includes(brand)) {
    categories.push("caminhao");
  }

  // Se não cair em nenhuma categoria específica, considera carro
  if (categories.length === 0) {
    categories.push("carro");
  }

  return categories;
};

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

  const filteredOptions = useMemo(() => {
    let filtered = options;

    // 🔹 Filtra por tipo de veículo, se informado (carro / moto / caminhão)
    if (vehicleType) {
      filtered = filtered.filter((option) => {
        const categories = getBrandCategory(option);
        return categories.includes(vehicleType);
      });
    }

    // 🔹 Sempre permite buscar (sem limite mínimo de caracteres)
    if (search.trim().length > 0) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((option) => option.toLowerCase().includes(searchLower));
    }

    return [...filtered].sort();
  }, [options, search, vehicleType]);

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
