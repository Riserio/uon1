import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, FileText, Calendar, DollarSign, Camera, ClipboardList, Building2, AlertTriangle } from 'lucide-react';
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
  return <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-6">
        {/* Associação em destaque */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {claim.corretoraInfo?.nome ? (
            <Badge variant="secondary" className="text-sm h-6 px-3 font-semibold bg-primary/10 text-primary border-primary/20">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              {claim.corretoraInfo.nome}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-sm h-6 px-3 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Sem associação
            </Badge>
          )}
          {claim.tipo_sinistro && (
            <Badge variant="outline" className="text-sm h-6 px-3 bg-secondary/50">
              {claim.tipo_sinistro}
            </Badge>
          )}
        </div>

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xl font-bold text-foreground">
              SIN-{new Date(claim.created_at).getFullYear()}-{String(claim.numero).padStart(6, '0')}
            </h3>
            <Badge className="text-white border-0" style={{
            backgroundColor: claim.statusColor
          }}>
              {claim.status}
            </Badge>
            {claim.vistoria_numero && <Badge variant="outline" className="gap-1">
                <Camera className="h-3 w-3" />
                Vistoria #{claim.vistoria_numero}
              </Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/sinistros/${claim.id}/deliberacao`)} title="Deliberação do comitê" className="gap-1">
              <ClipboardList className="h-4 w-4" />
              Análise do Evento  
            </Button>
            {claim.vistoria_id && <Button variant="ghost" size="icon" onClick={() => navigate(`/vistorias/${claim.vistoria_id}`)} title="Ver vistoria vinculada">
                <Camera className="h-4 w-4" />
              </Button>}
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground mb-4">
          {claim.assunto}
        </p>

        <div className="grid grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Placa</p>
              <p className="font-medium text-foreground">{claim.veiculo_placa || 'N/A'}</p>
            </div>
          </div>
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
                {format(new Date(claim.created_at), 'dd/MM/yyyy', {
                locale: ptBR
              })}
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

        {isExpanded && <div className="mt-6 border-t border-border pt-6">
            <h4 className="font-semibold text-foreground mb-4">Linha do Tempo</h4>
            <div className="space-y-4">
              {claim.timeline.map((event, index) => <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${index === claim.timeline.length - 1 ? 'bg-primary' : 'bg-muted'}`} />
                    {index < claim.timeline.length - 1 && <div className="w-0.5 h-12 bg-muted" />}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(event.date), 'dd/MM/yyyy', {
                  locale: ptBR
                })}
                    </p>
                    <p className="font-semibold text-foreground">{event.title}</p>
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                  </div>
                </div>)}
            </div>

            

            {claim.observacoes && <div className="mt-6 border-t border-border pt-6">
                <h4 className="font-semibold text-foreground mb-2">Observações</h4>
                <p className="text-sm text-muted-foreground">{claim.observacoes}</p>
              </div>}
          </div>}
      </CardContent>
    </Card>;
}