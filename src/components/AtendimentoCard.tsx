import { Atendimento } from '@/types/atendimento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Archive, Eye, Send, Clock, ExternalLink, FileText, Camera } from 'lucide-react';
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
  const [vistoria, setVistoria] = useState<{ id: string; link_token?: string; status: string } | null>(null);

  useEffect(() => {
    loadVistoria();
  }, [atendimento.id]);

  const loadVistoria = async () => {
    const { data } = await supabase
      .from('vistorias')
      .select('id, link_token, status')
      .eq('atendimento_id', atendimento.id)
      .limit(1)
      .single();
    
    if (data) {
      setVistoria(data);
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
          className="text-[13px] font-medium text-foreground leading-tight line-clamp-2 cursor-pointer hover:text-primary transition-colors"
          onClick={onEdit}
        >
          {atendimento.assunto}
        </h3>

        {/* Meta info - compact row */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono opacity-60">#{atendimento.numero}</span>
          <span className="opacity-40">•</span>
          <span className="truncate max-w-[120px]">{atendimento.responsavel}</span>
          {atendimento.tags && atendimento.tags.length > 0 && (
            <>
              <span className="opacity-40">•</span>
              <span className="truncate px-1 py-0.5 rounded bg-muted/50 text-[10px]">{atendimento.tags[0]}</span>
            </>
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
