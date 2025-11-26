import { Button } from "@/components/ui/button";
import { DollarSign, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";

interface FipeConsultButtonProps {
  onConsult: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  valorFipe?: number | null;
  dataConsulta?: Date | string | null;
}

export function FipeConsultButton({
  onConsult,
  disabled,
  loading,
  valorFipe,
  dataConsulta,
}: FipeConsultButtonProps) {
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={onConsult}
        disabled={disabled || loading}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Consultando...
          </>
        ) : (
          <>
            <DollarSign className="h-4 w-4 mr-2" />
            Consultar Valor FIPE
          </>
        )}
      </Button>
      
      {valorFipe && (
        <div className="p-3 bg-muted rounded-lg space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Valor FIPE:</span>
            <Badge variant="secondary" className="text-base font-semibold">
              {formatCurrency(valorFipe)}
            </Badge>
          </div>
          {dataConsulta && (
            <div className="text-xs text-muted-foreground">
              Consultado em: {formatDate(dataConsulta)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}