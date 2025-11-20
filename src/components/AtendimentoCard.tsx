import { Atendimento } from '@/types/atendimento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, User, Pencil, Trash2, Archive, Eye, Send, Clock, AlertCircle, Camera, ExternalLink, FileText } from 'lucide-react';
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
        "bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow duration-150 cursor-grab active:cursor-grabbing",
        isDragging && "scale-105 shadow-lg ring-2 ring-primary/20",
        isConcluido && "bg-muted/50 border-muted-foreground/20 opacity-75",
        !isConcluido && isOverdue && "border-destructive bg-destructive/5 shadow-destructive/10"
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="secondary" className="text-xs font-mono">
            #{atendimento.numero}
          </Badge>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm line-clamp-2">{atendimento.assunto}</h4>
          <div className="flex gap-1 shrink-0">
            {statusPrazo > 0 && (
              <Badge 
                variant={isOverdue ? "destructive" : "outline"} 
                className="text-xs font-semibold"
              >
                {isOverdue ? (
                  <><AlertCircle className="h-3 w-3 mr-1" />Vencido</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1" />{hoursRemaining}h</>
                )}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-xs font-semibold", priorityColors[atendimento.prioridade])}>
              {atendimento.prioridade}
            </Badge>
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3" />
            <span className="truncate">{atendimento.corretora}</span>
          </div>
          {atendimento.contato && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              <span className="truncate">{atendimento.contato}</span>
            </div>
          )}
          {atendimento.dataRetorno && (
            <div className="flex items-center gap-1.5 text-primary font-medium">
              <Calendar className="h-3 w-3" />
              <span className="truncate">
                Follow-up: {new Date(atendimento.dataRetorno).toLocaleDateString('pt-BR')}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[10px]">
            <span>
              Criado: {new Date(atendimento.createdAt).toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit',
                year: '2-digit'
              })}
            </span>
            {atendimento.dataConcluido && (
              <span className="text-green-600 font-semibold">
                • Concluído: {new Date(atendimento.dataConcluido).toLocaleDateString('pt-BR', { 
                  day: '2-digit', 
                  month: '2-digit',
                  year: '2-digit'
                })}
                {atendimento.fluxoConcluido && (
                  <span className="ml-1">({atendimento.fluxoConcluido})</span>
                )}
              </span>
            )}
          </div>
        </div>

        {atendimento.tags && atendimento.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {atendimento.tags.slice(0, 3).map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-xs"
              >
                {tag}
              </span>
            ))}
            {atendimento.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{atendimento.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 pt-1">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2">
            <Pencil className="h-3 w-3" />
          </Button>
          {onViewAndamentos && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onViewAndamentos} 
              className="h-7 px-2"
              title="Visualizar andamentos"
            >
              <Eye className="h-3 w-3" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setEmailDialogOpen(true)}
            className="h-7 px-2"
            title="Comunicar cliente"
          >
            <Send className="h-3 w-3" />
          </Button>
          {vistoria && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/vistorias/${vistoria.id}`)}
                className="h-7 px-2 text-purple-600 hover:text-purple-700"
                title="Ver vistoria"
              >
                <Camera className="h-3 w-3" />
              </Button>
              {vistoria.link_token && vistoria.status === 'aguardando_fotos' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const link = `${window.location.origin}/vistoria/${vistoria.link_token}`;
                    navigator.clipboard.writeText(link);
                    toast.success('Link de vistoria copiado!');
                  }}
                  className="h-7 px-2 text-blue-600 hover:text-blue-700"
                  title="Copiar link de vistoria"
                >
                  <FileText className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
          {atendimento.status === 'concluido' && onArquivar && (
            <Button variant="ghost" size="sm" onClick={onArquivar} className="h-7 px-2 text-blue-600 hover:text-blue-700">
              <Archive className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 px-2 text-destructive hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {atendimento.responsavel}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
