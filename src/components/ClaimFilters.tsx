import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

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
}

export function ClaimFilters({
  selectedStatus,
  onStatusChange,
  searchTerm,
  onSearchChange,
  statusOptions,
}: ClaimFiltersProps) {
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por número, tipo ou descrição..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
    </div>
  );
}
