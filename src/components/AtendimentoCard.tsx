import { Atendimento } from '@/types/atendimento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Archive, Eye, Send, Clock, ExternalLink, FileText, Camera, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo, useEffect } from 'react';
import { EnviarEmailDialog } from './EnviarEmailDialog';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface AtendimentoCardProps {
  atendimento: Atendimento;
  statusPrazo: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArquivar?: () => void;
  onViewAndamentos?: () => void;
  isDragging: boolean;
}

const statusLabels = {
  novo: 'Novo',
  andamento: 'Em andamento',
  aguardo: 'Aguardando retorno',
  concluido: 'Concluído',
};

const priorityColors = {
  Alta: 'bg-priority-alta/10 text-priority-alta border-priority-alta/20',
  Média: 'bg-priority-media/10 text-priority-media border-priority-media/20',
  Baixa: 'bg-priority-baixa/10 text-priority-baixa border-priority-baixa/20',
};

export function AtendimentoCard({
  atendimento,
  statusPrazo,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  onArquivar,
  onViewAndamentos,
  isDragging,
}: AtendimentoCardProps) {
  const navigate = useNavigate();
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [vistoria, setVistoria] = useState<{ 
    id: string; 
    link_token?: string; 
    status: string;
    tipo_sinistro?: string;
    data_incidente?: string;
    relato_incidente?: string;
    veiculo_placa?: string;
    veiculo_marca?: string;
    veiculo_modelo?: string;
    veiculo_ano?: string;
    veiculo_cor?: string;
    veiculo_chassi?: string;
    cliente_nome?: string;
    cliente_cpf?: string;
    cliente_telefone?: string;
    cliente_email?: string;
    cof?: string;
  } | null>(null);
  const [fotosStatus, setFotosStatus] = useState<{
    total: number;
    aprovadas: number;
    reprovadas: number;
    pendentes: number;
  } | null>(null);
  const [corretoraNome, setCorretoraNome] = useState<string>('');
  const [responsavelNome, setResponsavelNome] = useState<string>('');

  useEffect(() => {
    loadVistoria();
    loadCorretora();
    loadResponsavel();
  }, [atendimento.id, atendimento.corretoraId, atendimento.responsavel]);

  const loadVistoria = async () => {
    const { data } = await supabase
      .from('vistorias')
      .select(`
        id, 
        link_token, 
        status, 
        tipo_sinistro,
        data_incidente,
        relato_incidente,
        veiculo_placa, 
        veiculo_marca,
        veiculo_modelo,
        veiculo_ano,
        veiculo_cor,
        veiculo_chassi,
        cliente_nome, 
        cliente_cpf,
        cliente_telefone,
        cliente_email,
        cof
      `)
      .eq('atendimento_id', atendimento.id)
      .limit(1)
      .maybeSingle();
    
    if (data) {
      setVistoria(data);
      
      // Buscar status das fotos
      const { data: fotosData } = await supabase
        .from('vistoria_fotos')
        .select('status_aprovacao')
        .eq('vistoria_id', data.id);
      
      if (fotosData && fotosData.length > 0) {
        const total = fotosData.length;
        const aprovadas = fotosData.filter(f => f.status_aprovacao === 'aprovada').length;
        const reprovadas = fotosData.filter(f => f.status_aprovacao === 'reprovada').length;
        const pendentes = fotosData.filter(f => f.status_aprovacao === 'pendente').length;
        
        setFotosStatus({ total, aprovadas, reprovadas, pendentes });
      }
    }
  };

  const loadCorretora = async () => {
    if (atendimento.corretoraId) {
      const { data } = await supabase
        .from('corretoras')
        .select('nome')
        .eq('id', atendimento.corretoraId)
        .single();
      
      if (data) setCorretoraNome(data.nome);
    }
  };

  const loadResponsavel = async () => {
    if (atendimento.responsavel) {
      // Já temos o nome do responsável no atendimento
      setResponsavelNome(atendimento.responsavel);
    }
  };

  const isOverdue = useMemo(() => {
    if (statusPrazo === 0 || !atendimento.updatedAt) return false;
    const now = new Date();
    const updatedAt = new Date(atendimento.updatedAt);
    const hoursElapsed = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
    return hoursElapsed > statusPrazo;
  }, [statusPrazo, atendimento.updatedAt]);

  const hoursRemaining = useMemo(() => {
    if (statusPrazo === 0 || !atendimento.updatedAt) return null;
    const now = new Date();
    const updatedAt = new Date(atendimento.updatedAt);
    const hoursElapsed = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
    return Math.floor(statusPrazo - hoursElapsed);
  }, [statusPrazo, atendimento.updatedAt]);

  const isConcluido = !!atendimento.dataConcluido;

  return (
    <>
      <EnviarEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        atendimentoId={atendimento.id}
        atendimentoAssunto={atendimento.assunto}
        conteudoInicial={`Status: ${statusLabels[atendimento.status]}\n\nObservações: ${atendimento.observacoes || 'Nenhuma observação'}`}
        emailInicial={atendimento.corretoraEmail}
        status={atendimento.status}
      />
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group bg-card border rounded-lg hover:shadow-sm transition-all duration-150 cursor-grab active:cursor-grabbing",
        isDragging && "scale-[1.02] shadow-md ring-1 ring-primary/20",
        isConcluido && "opacity-50",
        !isConcluido && isOverdue && "border-destructive/40"
      )}
    >
      <div className="px-2.5 py-2 space-y-1.5">
        {/* Title */}
        <h3 
          className="text-[13px] font-medium text-foreground leading-tight line-clamp-1 cursor-pointer hover:text-primary transition-colors"
          onClick={onEdit}
        >
          {atendimento.assunto}
        </h3>
        
        {/* Sinistro Info */}
        {vistoria && (
          <div className="space-y-1.5 text-[11px]">
            {/* Tipo e Data */}
            <div className="flex flex-wrap gap-2">
              {vistoria.tipo_sinistro && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-primary/5 text-primary border-primary/20">
                  {vistoria.tipo_sinistro}
                </Badge>
              )}
              {vistoria.data_incidente && (
                <span className="text-muted-foreground">
                  {new Date(vistoria.data_incidente).toLocaleDateString('pt-BR')}
                </span>
              )}
              {vistoria.cof && (
                <span className="text-muted-foreground">
                  COF: {vistoria.cof}
                </span>
              )}
            </div>

            {/* Veículo */}
            {(vistoria.veiculo_placa || vistoria.veiculo_marca) && (
              <div className="text-muted-foreground border-l-2 border-muted pl-2">
                <div className="font-medium text-foreground">Veículo</div>
                {vistoria.veiculo_placa && <div>Placa: {vistoria.veiculo_placa}</div>}
                {vistoria.veiculo_marca && (
                  <div>
                    {vistoria.veiculo_marca} {vistoria.veiculo_modelo} {vistoria.veiculo_ano}
                  </div>
                )}
                {vistoria.veiculo_cor && <div>Cor: {vistoria.veiculo_cor}</div>}
                {vistoria.veiculo_chassi && <div className="text-[10px]">Chassi: {vistoria.veiculo_chassi}</div>}
              </div>
            )}

            {/* Cliente */}
            {vistoria.cliente_nome && (
              <div className="text-muted-foreground border-l-2 border-muted pl-2">
                <div className="font-medium text-foreground">Cliente</div>
                <div>{vistoria.cliente_nome}</div>
                {vistoria.cliente_cpf && <div>CPF: {vistoria.cliente_cpf}</div>}
                {vistoria.cliente_telefone && <div>Tel: {vistoria.cliente_telefone}</div>}
                {vistoria.cliente_email && <div className="truncate">{vistoria.cliente_email}</div>}
              </div>
            )}

            {/* Relato */}
            {vistoria.relato_incidente && (
              <div className="text-muted-foreground border-l-2 border-muted pl-2">
                <div className="font-medium text-foreground">Relato</div>
                <div className="line-clamp-2">{vistoria.relato_incidente}</div>
              </div>
            )}
          </div>
        )}

        {/* Meta info - incluindo corretora e responsável */}
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="font-mono opacity-60">#{atendimento.numero}</span>
            {corretoraNome && (
              <>
                <span className="opacity-40">•</span>
                <span className="truncate max-w-[120px]" title={corretoraNome}>{corretoraNome}</span>
              </>
            )}
          </div>
          {responsavelNome && (
            <div className="flex items-center gap-1.5">
              <span className="opacity-60">Resp:</span>
              <span className="truncate max-w-[120px]" title={responsavelNome}>{responsavelNome}</span>
            </div>
          )}
          {atendimento.tags && atendimento.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {atendimento.tags.slice(0, 2).map((tag, idx) => (
                <span key={idx} className="truncate px-1 py-0.5 rounded bg-muted/50 text-[10px]">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-1 flex-wrap mt-1.5">
          <Badge 
            className={cn(
              "text-[10px] h-4 px-1.5 font-normal rounded",
              priorityColors[atendimento.prioridade]
            )} 
            variant="outline"
          >
            {atendimento.prioridade}
          </Badge>
          
          {!isConcluido && hoursRemaining !== null && hoursRemaining <= 8 && (
            <Badge 
              variant={isOverdue ? "destructive" : "secondary"}
              className={cn("text-[10px] h-4 px-1.5 rounded", !isOverdue && "bg-muted/50 text-muted-foreground border-0")}
            >
              <Clock className="w-2.5 h-2.5 mr-0.5" />
              {isOverdue ? `${Math.abs(hoursRemaining)}h` : `${hoursRemaining}h`}
            </Badge>
          )}

          {isConcluido && (
            <Badge className="text-[10px] h-4 px-1.5 rounded bg-status-concluido/10 text-status-concluido border-status-concluido/20">
              ✓ Concluído
            </Badge>
          )}

          {/* Ícone de status de vistoria */}
          {fotosStatus && fotosStatus.total > 0 && (
            <Badge 
              variant="outline"
              className={cn(
                "text-[10px] h-4 px-1.5 rounded flex items-center gap-0.5",
                fotosStatus.aprovadas === fotosStatus.total ? "bg-green-500/10 text-green-600 border-green-500/20" :
                fotosStatus.reprovadas > 0 ? "bg-orange-500/10 text-orange-600 border-orange-500/20" :
                "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
              )}
              title={`${fotosStatus.aprovadas}/${fotosStatus.total} aprovadas`}
            >
              <Truck className="w-2.5 h-2.5" />
              {fotosStatus.aprovadas === fotosStatus.total ? 'Aprovada' : 
               fotosStatus.reprovadas > 0 ? 'Pendente' : 'Aguardando'}
            </Badge>
          )}
        </div>
      </div>

      {/* Action buttons - show on hover */}
      <div className="px-2 pb-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity border-t border-border/5 pt-1.5 mt-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-6 w-6 p-0 hover:bg-muted/50 rounded"
          title="Editar"
        >
          <Pencil className="h-3 w-3" />
        </Button>

        {onViewAndamentos && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAndamentos}
            className="h-6 w-6 p-0 hover:bg-muted/50 rounded"
            title="Ver andamentos"
          >
            <Eye className="h-3 w-3" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEmailDialogOpen(true)}
          className="h-6 w-6 p-0 hover:bg-muted/50 rounded"
          title="Enviar email"
        >
          <Send className="h-3 w-3" />
        </Button>

        {vistoria && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/vistorias/${vistoria.id}`)}
              className="h-6 w-6 p-0 hover:bg-muted/50 rounded"
              title="Ver vistoria"
            >
              <Camera className="h-3 w-3" />
            </Button>
            
            {vistoria.link_token && vistoria.status === 'aguardando_fotos' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const link = `${window.location.origin}/vistoria/${vistoria.link_token}`;
                  await navigator.clipboard.writeText(link);
                  toast.success('Link copiado');
                }}
                className="h-6 w-6 p-0 hover:bg-muted/50 rounded"
                title="Copiar link"
              >
                <FileText className="h-3 w-3" />
              </Button>
            )}
          </>
        )}

        <div className="flex-1" />

        {onArquivar && atendimento.status === 'concluido' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onArquivar}
            className="h-6 w-6 p-0 hover:bg-muted/50 rounded"
            title="Arquivar"
          >
            <Archive className="h-3 w-3" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-6 w-6 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded"
          title="Deletar"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
    </>
  );
}
