import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão moderno do sistema (estilo PPR).
 * Faixa rounded-3xl com gradiente da cor primária, ícone em badge e ações à direita.
 */
export function PageHeader({ icon: Icon, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          {Icon && (
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center shadow-sm shrink-0">
              <Icon className="h-7 w-7 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
