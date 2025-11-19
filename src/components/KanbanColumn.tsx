import { ReactNode, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KanbanColumnProps {
  title: string;
  count: number;
  color: string;
  children: ReactNode;
  onDrop: () => void;
}

export function KanbanColumn({ title, count, color, children, onDrop }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Detectar se é mobile e recolher por padrão
  useEffect(() => {
    const checkMobile = () => {
      setIsCollapsed(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop();
  };

  return (
    <div className="flex flex-col bg-card rounded-lg border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between border-t-4" style={{ borderTopColor: color }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-medium">
            {count}
          </span>
        </div>
        {/* Botão para expandir/recolher no mobile */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="lg:hidden h-6 w-6 p-0"
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>
      
      <div
        className={cn(
          "flex-1 p-3 space-y-3 overflow-y-auto transition-all duration-300",
          isDragOver && "bg-primary/5",
          isCollapsed ? "max-h-0 p-0 opacity-0 lg:max-h-none lg:p-3 lg:opacity-100" : "min-h-[200px] lg:min-h-[600px]"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!isCollapsed && children}
        {!isCollapsed && children && (
          <div className="h-2" />
        )}
      </div>
    </div>
  );
}
