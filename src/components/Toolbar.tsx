import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, LayoutGrid, List, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';

interface ToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (value: string) => void;
  filterResponsavel: string;
  onFilterResponsavelChange: (value: string) => void;
  viewMode: 'kanban' | 'list';
  onViewModeChange: (mode: 'kanban' | 'list') => void;
  onNewAtendimento: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onManageCorretoras: () => void;
  onManageContatos: () => void;
  responsaveis: string[];
}

export function Toolbar({
  searchTerm,
  onSearchChange,
  filterPriority,
  onFilterPriorityChange,
  filterResponsavel,
  onFilterResponsavelChange,
  viewMode,
  onViewModeChange,
  onNewAtendimento,
  onExportJSON,
  onImportJSON,
  onManageCorretoras,
  onManageContatos,
  responsaveis,
}: ToolbarProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className="bg-gradient-to-r from-card/95 via-card to-card/95 backdrop-blur-sm border-b border-border/50 sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-1">
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('kanban')}
                className="h-8"
                title="Visualização Kanban"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('list')}
                className="h-8"
                title="Visualização Lista"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            <Link to="/dashboard-analytics">
              <Button 
                variant="outline" 
                size="sm" 
                className="hover:bg-primary/10"
                title="Dashboard Analítico"
              >
                <BarChart3 className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Dashboard</span>}
              </Button>
            </Link>

            <Button onClick={onNewAtendimento} className="ml-auto lg:hidden">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
            {/* Filtros */}
            <div className="flex items-center gap-2">
              <Select value={filterPriority} onValueChange={onFilterPriorityChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterResponsavel} onValueChange={onFilterResponsavelChange}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {responsaveis.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={onNewAtendimento} className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
