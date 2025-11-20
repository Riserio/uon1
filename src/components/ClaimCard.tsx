import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, FileText, Calendar, DollarSign, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface ClaimTimeline {
  date: string;
  title: string;
  description: string;
}

export interface Claim {
  id: string;
  numero: number;
  assunto: string;
  created_at: string;
  status: string;
  statusColor: string;
  observacoes: string | null;
  custo_oficina?: number | null;
  custo_reparo?: number | null;
  custo_acordo?: number | null;
  custo_terceiros?: number | null;
  custo_perda_total?: number | null;
  custo_perda_parcial?: number | null;
  valor_franquia?: number | null;
  valor_indenizacao?: number | null;
  timeline: ClaimTimeline[];
}

interface ClaimCardProps {
  claim: Claim;
  onEdit: (claim: Claim) => void;
}

export function ClaimCard({ claim, onEdit }: ClaimCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const calculateTotal = () => {
    return (
      (claim.custo_oficina || 0) +
      (claim.custo_reparo || 0) +
      (claim.custo_acordo || 0) +
      (claim.custo_terceiros || 0) +
      (claim.custo_perda_total || 0) +
      (claim.custo_perda_parcial || 0)
    );
  };

  const total = calculateTotal();

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-foreground">
              SIN-{new Date(claim.created_at).getFullYear()}-{String(claim.numero).padStart(6, '0')}
            </h3>
            <Badge 
              className="text-white border-0"
              style={{ backgroundColor: claim.statusColor }}
            >
              {claim.status}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(claim)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground mb-4">
          {claim.assunto}
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Tipo</p>
              <p className="font-medium text-foreground">{claim.assunto}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="font-medium text-foreground">
                {format(new Date(claim.created_at), 'dd/MM/yyyy', { locale: ptBR })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="font-medium text-foreground">{formatCurrency(total)}</p>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-6 border-t border-border pt-6">
            <h4 className="font-semibold text-foreground mb-4">Linha do Tempo</h4>
            <div className="space-y-4">
              {claim.timeline.map((event, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div 
                      className={`w-3 h-3 rounded-full ${
                        index === claim.timeline.length - 1 ? 'bg-primary' : 'bg-muted'
                      }`} 
                    />
                    {index < claim.timeline.length - 1 && (
                      <div className="w-0.5 h-12 bg-muted" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(event.date), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                    <p className="font-semibold text-foreground">{event.title}</p>
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <h4 className="font-semibold text-foreground mb-4">Detalhes Financeiros</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Custo Oficina</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.custo_oficina)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Custo Reparo</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.custo_reparo)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Custo Acordo</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.custo_acordo)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Custo Terceiros</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.custo_terceiros)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Perda Total</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.custo_perda_total)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Perda Parcial</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.custo_perda_parcial)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Franquia</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.valor_franquia)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Indenização</p>
                  <p className="font-medium text-foreground">{formatCurrency(claim.valor_indenizacao)}</p>
                </div>
              </div>
            </div>

            {claim.observacoes && (
              <div className="mt-6 border-t border-border pt-6">
                <h4 className="font-semibold text-foreground mb-2">Observações</h4>
                <p className="text-sm text-muted-foreground">{claim.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
