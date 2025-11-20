import { Card, CardContent } from '@/components/ui/card';
import { FileText, DollarSign } from 'lucide-react';
import { Claim } from './ClaimCard';

interface StatusCount {
  status: string;
  count: number;
  color: string;
}

interface ClaimStatsProps {
  claims: Claim[];
  statusCounts: StatusCount[];
}

export function ClaimStats({ claims, statusCounts }: ClaimStatsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const totalAmount = claims.reduce((sum, claim) => {
    return sum + (
      (claim.custo_oficina || 0) +
      (claim.custo_reparo || 0) +
      (claim.custo_acordo || 0) +
      (claim.custo_terceiros || 0) +
      (claim.custo_perda_total || 0) +
      (claim.custo_perda_parcial || 0)
    );
  }, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Total de Processos</p>
          </div>
          <div className="text-3xl font-bold text-foreground">{claims.length}</div>
        </CardContent>
      </Card>

      {statusCounts.slice(0, 2).map((statusCount, index) => (
        <Card key={index} className="border-l-4" style={{ borderLeftColor: statusCount.color }}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: statusCount.color }}
              />
              <p className="text-sm font-medium text-muted-foreground">{statusCount.status}</p>
            </div>
            <div className="text-3xl font-bold text-foreground">{statusCount.count}</div>
          </CardContent>
        </Card>
      ))}

      <Card className="border-l-4 border-l-green-500">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Valor Total</p>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatCurrency(totalAmount)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
