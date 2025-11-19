import { Atendimento } from '@/types/atendimento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Archive, Eye, Send, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { EnviarEmailDialog } from './EnviarEmailDialog';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours } from 'date-fns';

interface ListViewProps {
  atendimentos: Atendimento[];
  onEdit: (atendimento: Atendimento) => void;
  onDelete: (id: string) => void;
  onArquivar?: (id: string) => void;
  onViewAndamentos?: (atendimento: Atendimento) => void;
}

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  prazo_horas: number;
  ordem: number;
  ativo: boolean;
}

const priorityColors = {
  Alta: 'bg-priority-alta/10 text-priority-alta border-priority-alta/20',
  Média: 'bg-priority-media/10 text-priority-media border-priority-media/20',
  Baixa: 'bg-priority-baixa/10 text-priority-baixa border-priority-baixa/20',
};

export function ListView({ atendimentos, onEdit, onDelete, onArquivar, onViewAndamentos }: ListViewProps) {
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [selectedAtendimento, setSelectedAtendimento] = useState<Atendimento | null>(null);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);

  useEffect(() => {
    loadStatusConfigs();
  }, []);

  const loadStatusConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('status_config')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (error) throw error;
      setStatusConfigs(data || []);
    } catch (error) {
      console.error('Erro ao carregar configurações de status:', error);
    }
  };

  const getStatusConfig = (statusNome: string) => {
    return statusConfigs.find(config => 
      config.nome.toLowerCase() === statusNome.toLowerCase()
    );
  };

  const isOverdue = (atendimento: Atendimento): { overdue: boolean; horasVencidas?: number } => {
    const statusConfig = getStatusConfig(atendimento.status);
    
    if (!statusConfig || statusConfig.prazo_horas === 0) {
      return { overdue: false };
    }

    const statusChangedAt = new Date(atendimento.updatedAt);
    const now = new Date();
    const horasDecorridas = differenceInHours(now, statusChangedAt);
    const horasVencidas = horasDecorridas - statusConfig.prazo_horas;

    return {
      overdue: horasVencidas > 0,
      horasVencidas: horasVencidas > 0 ? horasVencidas : undefined,
    };
  };

  // Group atendimentos by status
  const groupedAtendimentos = statusConfigs.reduce((acc, statusConfig) => {
    const items = atendimentos.filter(a => 
      a.status.toLowerCase() === statusConfig.nome.toLowerCase()
    );
    if (items.length > 0) {
      acc[statusConfig.id] = { config: statusConfig, items };
    }
    return acc;
  }, {} as Record<string, { config: StatusConfig; items: Atendimento[] }>);

  return (
    <>
      {selectedAtendimento && (
        <EnviarEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          atendimentoId={selectedAtendimento.id}
          atendimentoAssunto={selectedAtendimento.assunto}
          conteudoInicial={`Status: ${selectedAtendimento.status}\n\nObservações: ${selectedAtendimento.observacoes || 'Nenhuma observação'}`}
          emailInicial={selectedAtendimento.corretoraEmail}
          status={selectedAtendimento.status}
        />
      )}
      
      <div className="space-y-6">
        {Object.entries(groupedAtendimentos).map(([statusId, { config, items }]) => (
          <div key={statusId} className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.cor }}
              />
              <h3 className="font-semibold text-lg">{config.nome}</h3>
              <Badge variant="secondary" className="ml-auto">
                {items.length}
              </Badge>
            </div>

            <div className="space-y-3">
              {items.map((atendimento) => {
                const overdueInfo = isOverdue(atendimento);
                const statusConfig = getStatusConfig(atendimento.status);

                return (
                  <div
                    key={atendimento.id}
                    className={cn(
                      "bg-card border rounded-lg p-4 shadow-sm hover:shadow-md transition-all",
                      overdueInfo.overdue && "border-l-4 border-l-destructive bg-destructive/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start gap-3 flex-wrap">
                          <h4 className="font-semibold text-base">{atendimento.assunto}</h4>
                          <div className="flex gap-2 items-center">
                            <Badge 
                              variant="outline" 
                              className="text-xs"
                              style={{
                                backgroundColor: `${statusConfig?.cor}15`,
                                color: statusConfig?.cor,
                                borderColor: `${statusConfig?.cor}40`,
                              }}
                            >
                              {atendimento.status}
                            </Badge>
                            <Badge variant="outline" className={cn("text-xs font-semibold", priorityColors[atendimento.prioridade])}>
                              {atendimento.prioridade}
                            </Badge>
                            
                            {overdueInfo.overdue && overdueInfo.horasVencidas && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Vencido há {overdueInfo.horasVencidas}h
                              </Badge>
                            )}
                            
                            {!overdueInfo.overdue && statusConfig && statusConfig.prazo_horas > 0 && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Clock className="h-3 w-3" />
                                Prazo: {statusConfig.prazo_horas}h
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Corretora:</span> {atendimento.corretora}
                          </div>
                          {atendimento.contato && (
                            <div>
                              <span className="font-medium">Contato:</span> {atendimento.contato}
                            </div>
                          )}
                          {atendimento.responsavel && (
                            <div>
                              <span className="font-medium">Responsável:</span> {atendimento.responsavel}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Criado:</span>{' '}
                            {new Date(atendimento.createdAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>

                        {atendimento.tags && atendimento.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {atendimento.tags.map((tag, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {atendimento.observacoes && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {atendimento.observacoes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {onViewAndamentos && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewAndamentos(atendimento)}
                            className="h-8"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(atendimento)}
                          className="h-8"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedAtendimento(atendimento);
                            setEmailDialogOpen(true);
                          }}
                          className="h-8"
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Email
                        </Button>
                        {onArquivar && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onArquivar(atendimento.id)}
                            className="h-8"
                          >
                            <Archive className="h-4 w-4 mr-1" />
                            Arquivar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(atendimento.id)}
                          className="h-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {Object.keys(groupedAtendimentos).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum atendimento encontrado
          </div>
        )}
      </div>
    </>
  );
}
