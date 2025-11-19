import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Andamento {
  id: string;
  descricao: string;
  created_at: string;
  created_by: string;
  criador?: {
    nome: string;
  };
}

interface AndamentosListProps {
  atendimentoId: string;
  canEdit?: boolean;
}

export function AndamentosList({ atendimentoId, canEdit = true }: AndamentosListProps) {
  const [andamentos, setAndamentos] = useState<Andamento[]>([]);
  const [novoAndamento, setNovoAndamento] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (atendimentoId) {
      loadAndamentos();
    }
  }, [atendimentoId]);

  const loadAndamentos = async () => {
    const { data, error } = await supabase
      .from('andamentos')
      .select('*')
      .eq('atendimento_id', atendimentoId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar andamentos');
      console.error(error);
      return;
    }

    // Buscar nomes dos criadores
    const userIds = [...new Set(data?.map(a => a.created_by) || [])];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nome')
      .in('id', userIds);

    const profilesMap = new Map(profiles?.map(p => [p.id, p.nome]) || []);

    setAndamentos((data || []).map(item => ({
      id: item.id,
      descricao: item.descricao,
      created_at: item.created_at,
      created_by: item.created_by,
      criador: { nome: profilesMap.get(item.created_by) || 'Usuário' }
    })));
  };

  const handleAddAndamento = async () => {
    if (!novoAndamento.trim()) {
      toast.error('Digite um andamento');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      const { error } = await supabase
        .from('andamentos')
        .insert({
          atendimento_id: atendimentoId,
          descricao: novoAndamento,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('Andamento adicionado');
      setNovoAndamento('');
      loadAndamentos();
    } catch (error) {
      console.error('Erro ao adicionar andamento:', error);
      toast.error('Erro ao adicionar andamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2 p-4 bg-muted/30 rounded-lg border">
          <label className="text-sm font-medium">Adicionar Andamento</label>
          <Textarea
            value={novoAndamento}
            onChange={(e) => setNovoAndamento(e.target.value)}
            placeholder="Descreva o andamento..."
            rows={3}
          />
          <Button
            onClick={handleAddAndamento}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Andamento
              </>
            )}
          </Button>
        </div>
      )}

      <ScrollArea className="h-[400px]">
        {andamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Nenhum andamento registrado</p>
          </div>
        ) : (
          <div className="space-y-3 pr-4">
            {andamentos.map((andamento) => (
              <div key={andamento.id} className="border rounded-lg p-4 bg-card hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {andamento.criador?.nome}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(andamento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{andamento.descricao}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
