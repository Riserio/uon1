import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Building2, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusOption {
  value: string;
  label: string;
  color: string;
}

interface ClaimFiltersProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  statusOptions: StatusOption[];
  selectedCorretora: string;
  onCorretoraChange: (corretora: string) => void;
  corretoras: string[];
  selectedPriority: string;
  onPriorityChange: (priority: string) => void;
}

export function ClaimFilters({
  selectedStatus,
  onStatusChange,
  searchTerm,
  onSearchChange,
  statusOptions,
  selectedCorretora,
  onCorretoraChange,
  corretoras,
  selectedPriority,
  onPriorityChange,
}: ClaimFiltersProps) {
  const [corretoraSearchOpen, setCorretoraSearchOpen] = useState(false);
  const [corretoraSearch, setCorretoraSearch] = useState('');
  const [filteredCorretoras, setFilteredCorretoras] = useState<string[]>([]);

  useEffect(() => {
    if (corretoraSearch.length >= 3) {
      const filtered = corretoras.filter((c) =>
        c.toLowerCase().includes(corretoraSearch.toLowerCase())
      );
      setFilteredCorretoras(filtered);
    } else {
      setFilteredCorretoras([]);
    }
  }, [corretoraSearch, corretoras]);

  return (
    <div className="mb-8 space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => onStatusChange('all')}
          variant={selectedStatus === 'all' ? 'default' : 'outline'}
          size="sm"
        >
          Todos
        </Button>
        {statusOptions.map((option) => (
          <Button
            key={option.value}
            onClick={() => onStatusChange(option.value)}
            variant={selectedStatus === option.value ? 'default' : 'outline'}
            size="sm"
            className={selectedStatus === option.value ? '' : 'hover:border-current'}
            style={
              selectedStatus === option.value
                ? { backgroundColor: option.color, borderColor: option.color }
                : {}
            }
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Filtro de Corretora */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Filtro Corretora
          </label>
          <Popover open={corretoraSearchOpen} onOpenChange={setCorretoraSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={corretoraSearchOpen}
                className="w-full justify-between"
              >
                {selectedCorretora === 'all' ? 'Todas as corretoras' : selectedCorretora}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command>
                <CommandInput
                  placeholder="Digite pelo menos 3 caracteres..."
                  value={corretoraSearch}
                  onValueChange={setCorretoraSearch}
                />
                <CommandEmpty>
                  {corretoraSearch.length < 3
                    ? 'Digite pelo menos 3 caracteres para buscar'
                    : 'Nenhuma corretora encontrada'}
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      onCorretoraChange('all');
                      setCorretoraSearchOpen(false);
                      setCorretoraSearch('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedCorretora === 'all' ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    Todas as corretoras
                  </CommandItem>
                </CommandGroup>
                {filteredCorretoras.length > 0 && (
                  <CommandGroup>
                    {filteredCorretoras.map((c) => (
                      <CommandItem
                        key={c}
                        value={c}
                        onSelect={(currentValue) => {
                          onCorretoraChange(currentValue);
                          setCorretoraSearchOpen(false);
                          setCorretoraSearch('');
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedCorretora === c ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {c}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Filtro de Prioridade */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Filtro Prioridade
          </label>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => onPriorityChange('all')}
              variant={selectedPriority === 'all' ? 'default' : 'outline'}
              size="sm"
            >
              Todas
            </Button>
            <Button
              onClick={() => onPriorityChange('Alta')}
              variant={selectedPriority === 'Alta' ? 'default' : 'outline'}
              size="sm"
            >
              Alta
            </Button>
            <Button
              onClick={() => onPriorityChange('Média')}
              variant={selectedPriority === 'Média' ? 'default' : 'outline'}
              size="sm"
            >
              Média
            </Button>
            <Button
              onClick={() => onPriorityChange('Baixa')}
              variant={selectedPriority === 'Baixa' ? 'default' : 'outline'}
              size="sm"
            >
              Baixa
            </Button>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por número, assunto ou descrição..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
    </div>
  );
}
