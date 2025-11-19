import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CorretoraHistoricoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corretoraId: string;
  corretoraName: string;
}

interface Atendimento {
  id: string;
  numero: number;
  assunto: string;
  status: string;
  prioridade: string;
  created_at: string;
  responsavel?: {
    nome: string;
  };
}

export function CorretoraHistoricoDialog({
  open,
  onOpenChange,
  corretoraId,
  corretoraName
}: CorretoraHistoricoDialogProps) {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && corretoraId) {
      loadAtendimentos();
    }
  }, [open, corretoraId]);

  const loadAtendimentos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('atendimentos')
        .select(`
          id,
          numero,
          assunto,
          status,
          prioridade,
          created_at,
          responsavel:profiles!atendimentos_responsavel_id_fkey(nome)
        `)
        .eq('corretora_id', corretoraId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setAtendimentos(data || []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case 'Alta': return 'destructive';
      case 'Média': return 'default';
      case 'Baixa': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Histórico de Atendimentos - {corretoraName}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Carregando...</p>
            </div>
          ) : atendimentos.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Nenhum atendimento encontrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {atendimentos.map((atendimento) => (
                <div
                  key={atendimento.id}
                  className="border rounded-lg p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{atendimento.numero}</Badge>
                      <Badge variant={getPrioridadeColor(atendimento.prioridade)}>
                        {atendimento.prioridade}
                      </Badge>
                      <Badge>{atendimento.status}</Badge>
                    </div>
                  </div>

                  <h4 className="font-medium mb-2">{atendimento.assunto}</h4>

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(atendimento.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(atendimento.created_at), 'HH:mm')}
                    </div>
                    {atendimento.responsavel && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {atendimento.responsavel.nome}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
