import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Archive, Calendar, User, Building2, Tag, FileText, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Atendimento } from '@/types/atendimento';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ArquivoDialogProps {
  onRestaurar: (atendimento: Atendimento) => void;
  refreshKey?: number;
}

export function ArquivoDialog({ onRestaurar, refreshKey }: ArquivoDialogProps) {
  const [arquivados, setArquivados] = useState<Atendimento[]>([]);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadArquivados();
    }
  }, [open, refreshKey]);

  const loadArquivados = async () => {
    try {
      const { data, error } = await supabase
        .from('atendimentos')
        .select(`
          *,
          corretora:corretoras(nome),
          contato:contatos(nome),
          responsavel:profiles(nome)
        `)
        .eq('arquivado', true)
        .order('data_concluido', { ascending: false });

      if (error) throw error;

      const mappedData: Atendimento[] = data.map((item: any) => ({
        id: item.id,
        numero: item.numero,
        corretora: item.corretora?.nome || '',
        corretoraId: item.corretora_id,
        contato: item.contato?.nome || '',
        assunto: item.assunto,
        prioridade: item.prioridade,
        responsavel: item.responsavel?.nome || '',
        status: item.status,
        tags: item.tags || [],
        observacoes: item.observacoes || '',
        dataRetorno: item.data_retorno,
        dataConcluido: item.data_concluido,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));

      setArquivados(mappedData);
    } catch (error: any) {
      console.error('Erro ao carregar arquivados:', error);
      toast.error('Erro ao carregar arquivados');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('atendimentos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadArquivados();
      setDeleteId(null);
      toast.success('Atendimento excluído permanentemente');
    } catch (error: any) {
      console.error('Erro ao excluir atendimento:', error);
      toast.error('Erro ao excluir atendimento');
    }
  };

  const handleRestaurar = (atendimento: Atendimento) => {
    onRestaurar(atendimento);
    loadArquivados();
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case 'Alta': return 'bg-red-500';
      case 'Média': return 'bg-yellow-500';
      case 'Baixa': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon">
            <Archive className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Atendimentos Arquivados
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {arquivados.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Archive className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Nenhum atendimento arquivado</p>
              </div>
            ) : (
              arquivados.map((atendimento) => (
                <div
                  key={atendimento.id}
                  className="border rounded-lg p-4 space-y-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-8 rounded ${getPrioridadeColor(atendimento.prioridade)}`} />
                        <div className="flex-1">
                          <h4 className="font-semibold">{atendimento.assunto}</h4>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              <span>{atendimento.corretora}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>{atendimento.contato}</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          Concluído
                        </Badge>
                      </div>

                      {atendimento.observacoes && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                          <p className="line-clamp-2">{atendimento.observacoes}</p>
                        </div>
                      )}

                      {atendimento.tags && atendimento.tags.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          {atendimento.tags.map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Criado: {format(new Date(atendimento.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Concluído: {format(new Date(atendimento.updatedAt), 'dd/MM/yyyy', { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestaurar(atendimento)}
                      >
                        Restaurar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteId(atendimento.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {arquivados.length > 0 && (
            <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
              Total: {arquivados.length} atendimento{arquivados.length !== 1 ? 's' : ''} arquivado{arquivados.length !== 1 ? 's' : ''}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O atendimento será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
