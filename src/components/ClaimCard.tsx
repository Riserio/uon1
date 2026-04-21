import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Calendar, DollarSign, Camera, ClipboardList, Building2, AlertTriangle, Car, Tag } from 'lucide-react';
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
  veiculo_placa?: string | null;
  custo_oficina?: number | null;
  custo_reparo?: number | null;
  custo_acordo?: number | null;
  custo_terceiros?: number | null;
  custo_perda_total?: number | null;
  custo_perda_parcial?: number | null;
  valor_franquia?: number | null;
  valor_indenizacao?: number | null;
  timeline: ClaimTimeline[];
  corretoraInfo?: {
    nome: string;
  } | null;
  vistoria_id?: string | null;
  vistoria_numero?: number | null;
  corretora_id?: string | null;
  tipo_sinistro?: string | null;
}
interface ClaimCardProps {
  claim: Claim;
}
export function ClaimCard({
  claim
}: ClaimCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };
  const calculateTotal = () => {
    return (claim.custo_oficina || 0) + (claim.custo_reparo || 0) + (claim.custo_acordo || 0) + (claim.custo_terceiros || 0) + (claim.custo_perda_total || 0) + (claim.custo_perda_parcial || 0);
  };
  const total = calculateTotal();
  return <Card className="overflow-hidden transition-all hover:shadow-md hover:border-primary/40">
      <CardContent className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-foreground tabular-nums">
              SIN-{new Date(claim.created_at).getFullYear()}-{String(claim.numero).padStart(6, '0')}
            </span>
            <span
              className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: claim.statusColor }}
            >
              {claim.status}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground ml-auto flex-wrap">
            {claim.corretoraInfo?.nome ? (
              <span className="inline-flex items-center gap-1 max-w-[200px]">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate text-foreground font-medium">{claim.corretoraInfo.nome}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Sem associação
              </span>
            )}
            {claim.tipo_sinistro && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                <span className="text-foreground">{claim.tipo_sinistro}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Car className="h-3.5 w-3.5" />
              <span className="text-foreground font-medium tabular-nums">{claim.veiculo_placa || 'N/A'}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-foreground tabular-nums">
                {format(new Date(claim.created_at), 'dd/MM/yy', { locale: ptBR })}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-foreground font-semibold tabular-nums">{formatCurrency(total)}</span>
            </span>
            {claim.vistoria_numero && (
              <Badge variant="outline" className="h-5 px-1.5 gap-1 text-[10px]">
                <Camera className="h-3 w-3" />#{claim.vistoria_numero}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => navigate(`/sinistros/${claim.id}/deliberacao`)}
              title="Deliberação do comitê"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Análise
            </Button>
            {claim.vistoria_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => navigate(`/vistorias/${claim.vistoria_id}`)}
                title="Ver vistoria vinculada"
              >
                <Camera className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {claim.assunto && (
          <p className="text-xs text-muted-foreground mt-1.5 truncate">
            {claim.assunto}
          </p>
        )}

        {isExpanded && <div className="mt-3 border-t border-border pt-3">
            <h4 className="text-sm font-semibold text-foreground mb-3">Linha do Tempo</h4>
            <div className="space-y-3">
              {claim.timeline.map((event, index) => <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${index === claim.timeline.length - 1 ? 'bg-primary' : 'bg-muted'}`} />
                    {index < claim.timeline.length - 1 && <div className="w-0.5 h-10 bg-muted" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(event.date), 'dd/MM/yyyy', {
                  locale: ptBR
                })}
                    </p>
                    <p className="text-sm font-semibold text-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  </div>
                </div>)}
            </div>

            

            {claim.observacoes && <div className="mt-4 border-t border-border pt-3">
                <h4 className="text-sm font-semibold text-foreground mb-1">Observações</h4>
                <p className="text-xs text-muted-foreground">{claim.observacoes}</p>
              </div>}
          </div>}
      </CardContent>
    </Card>;
}