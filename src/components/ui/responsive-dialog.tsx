import * as React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogContent>;

interface ResponsiveDialogContentProps extends DialogContentProps {
  children: React.ReactNode;
}

export function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  );
}

export function ResponsiveDialogContent({ children, className, ...props }: ResponsiveDialogContentProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    // Detecta se a sidebar está aberta verificando o estado do localStorage e a presença da classe no body
    const checkSidebar = () => {
      try {
        const sidebarState = localStorage.getItem('sidebar:state');
        const isOpen = sidebarState === 'true';
        setSidebarOpen(isOpen && !isMobile);
      } catch {
        setSidebarOpen(false);
      }
    };

    checkSidebar();

    // Observa mudanças no localStorage para detectar quando a sidebar abre/fecha
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sidebar:state') {
        checkSidebar();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Também verifica periodicamente para mudanças locais
    const interval = setInterval(checkSidebar, 100);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [isMobile]);

  return (
    <DialogContent 
      className={className}
      style={sidebarOpen ? {
        marginLeft: '128px', // metade da largura da sidebar (256px / 2)
      } : undefined}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

ResponsiveDialog.Content = ResponsiveDialogContent;
