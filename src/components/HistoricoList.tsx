import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Clock, User, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HistoricoItem {
  id: string;
  user_nome: string;
  acao: string;
  campos_alterados: any;
  valores_anteriores: any;
  valores_novos: any;
  created_at: string;
}

interface HistoricoListProps {
  atendimentoId: string;
}

// Cache para nomes já buscados
const nameCache: Record<string, string> = {};

export function HistoricoList({ atendimentoId }: HistoricoListProps) {
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (atendimentoId) {
      loadHistorico();
    }
  }, [atendimentoId]);

  const loadHistorico = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('atendimentos_historico')
        .select('*')
        .eq('atendimento_id', atendimentoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistorico(data || []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  const isUUID = (value: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  };

  const fetchName = async (id: string, type: 'corretora' | 'contato' | 'responsavel'): Promise<string> => {
    const cacheKey = `${type}_${id}`;
    
    if (nameCache[cacheKey]) {
      return nameCache[cacheKey];
    }

    try {
      let name = id;
      
      if (type === 'corretora') {
        const { data } = await supabase
          .from('corretoras')
          .select('nome')
          .eq('id', id)
          .single();
        name = data?.nome || id;
      } else if (type === 'contato') {
        const { data } = await supabase
          .from('contatos')
          .select('nome')
          .eq('id', id)
          .single();
        name = data?.nome || id;
      } else if (type === 'responsavel') {
        const { data } = await supabase
          .from('profiles')
          .select('nome')
          .eq('id', id)
          .single();
        name = data?.nome || id;
      }

      nameCache[cacheKey] = name;
      return name;
    } catch (error) {
      console.error(`Erro ao buscar nome do ${type}:`, error);
      return id;
    }
  };

  const formatValue = async (value: any, fieldName: string): Promise<string> => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    
    const valueStr = String(value);
    
    if (isUUID(valueStr)) {
      if (fieldName === 'corretora_id') {
        return await fetchName(valueStr, 'corretora');
      } else if (fieldName === 'contato_id') {
        return await fetchName(valueStr, 'contato');
      } else if (fieldName === 'responsavel_id') {
        return await fetchName(valueStr, 'responsavel');
      }
    }
    
    return valueStr;
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      assunto: 'Assunto',
      status: 'Status',
      prioridade: 'Prioridade',
      observacoes: 'Observações',
      data_retorno: 'Data de Retorno',
      responsavel_id: 'Responsável',
      contato_id: 'Contato',
      corretora_id: 'Corretora',
      tags: 'Tags',
      arquivado: 'Arquivado',
    };
    return labels[field] || field;
  };

  const HistoricoItemComponent = ({ item }: { item: HistoricoItem }) => {
    const [formattedValues, setFormattedValues] = useState<Record<string, { anterior: string; novo: string }>>({});

    useEffect(() => {
      const loadFormattedValues = async () => {
        if (item.campos_alterados && item.campos_alterados.length > 0) {
          const formatted: Record<string, { anterior: string; novo: string }> = {};
          
          for (const campo of item.campos_alterados) {
            const anterior = await formatValue(item.valores_anteriores?.[campo], campo);
            const novo = await formatValue(item.valores_novos?.[campo], campo);
            formatted[campo] = { anterior, novo };
          }
          
          setFormattedValues(formatted);
        }
      };

      loadFormattedValues();
    }, [item]);

    return (
      <div className="border rounded-lg p-4 space-y-3 bg-card hover:shadow-md transition-all">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium text-foreground">{item.user_nome}</span>
          </div>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>

        <div>
          <Badge variant="secondary" className="font-medium">
            {item.acao}
          </Badge>
        </div>

        {item.campos_alterados && item.campos_alterados.length > 0 && (
          <div className="space-y-3 mt-3">
            {item.campos_alterados.map((campo) => (
              <div key={campo} className="bg-muted/30 p-3 rounded-md border">
                <div className="font-medium text-sm mb-2 text-foreground">{getFieldLabel(campo)}</div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex-1 bg-background p-2 rounded border">
                    <span className="text-xs text-muted-foreground block mb-1">Anterior:</span>
                    <div className="text-destructive/80 line-through">
                      {formattedValues[campo]?.anterior || '-'}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 bg-background p-2 rounded border">
                    <span className="text-xs text-muted-foreground block mb-1">Novo:</span>
                    <div className="text-green-600 dark:text-green-400 font-medium">
                      {formattedValues[campo]?.novo || '-'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ScrollArea className="h-[500px] pr-4">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Carregando histórico...</p>
          </div>
        </div>
      ) : historico.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <p className="text-muted-foreground">Nenhuma alteração registrada</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {historico.map((item) => (
            <HistoricoItemComponent key={item.id} item={item} />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
