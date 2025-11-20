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
    <div className="flex flex-col bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden h-full">
      <div 
        className="px-4 py-3 flex items-center justify-between bg-muted/30"
        style={{ 
          borderTop: `3px solid ${color}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div 
            className="w-2 h-2 rounded-full animate-pulse" 
            style={{ backgroundColor: color }} 
          />
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          <span className="bg-background text-muted-foreground px-2 py-0.5 rounded-md text-xs font-medium border">
            {count}
          </span>
        </div>
        {/* Botão para expandir/recolher no mobile */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="lg:hidden h-7 w-7 p-0"
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>
      
      <div
        className={cn(
          "flex-1 p-3 space-y-3 overflow-y-auto transition-all duration-300",
          isDragOver && "bg-primary/5 ring-2 ring-primary/20 ring-inset",
          isCollapsed ? "max-h-0 p-0 opacity-0 lg:max-h-none lg:p-3 lg:opacity-100" : "min-h-[200px] lg:min-h-[calc(100vh-280px)]"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!isCollapsed && children}
      </div>
    </div>
  );
}
