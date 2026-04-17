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
 * Cabeçalho padrão do sistema — estilo limpo e sóbrio.
 * Ícone + título à esquerda, ações no meio e logo Vangard fixa no canto superior direito.
 */
export function PageHeader({ icon: Icon, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-border/60", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap lg:justify-end">
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        <img
          src="/images/logo-vg.png"
          alt="Vangard"
          className="h-8 w-auto opacity-90 shrink-0"
        />
      </div>
    </div>
  );
}
