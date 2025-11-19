import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Clock, TrendingDown, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database } from '@/integrations/supabase/types';

interface Alerta {
  id: string;
  tipo_alerta: string;
  valor_atual: number;
  meta_esperada: number;
  periodo_analise: string;
  created_at: string;
  enviado_para: string[] | Database['public']['Tables']['performance_alertas']['Row']['enviado_para'];
}

export function HistoricoAlertasCard() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlertas();
  }, []);

  const loadAlertas = async () => {
    try {
      const { data, error } = await supabase
        .from('performance_alertas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setAlertas(data || []);
    } catch (error) {
      console.error('Erro ao carregar alertas:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTipoAlertaInfo = (tipo: string) => {
    switch (tipo) {
      case 'volume_baixo':
        return {
          label: 'Volume Baixo',
          icon: Activity,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10',
        };
      case 'taxa_conclusao_baixa':
        return {
          label: 'Taxa de Conclusão',
          icon: TrendingDown,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
        };
      case 'tempo_medio_alto':
        return {
          label: 'Tempo Médio Alto',
          icon: Clock,
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10',
        };
      default:
        return {
          label: tipo,
          icon: AlertCircle,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
        };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Histórico de Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  if (alertas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Histórico de Alertas
          </CardTitle>
          <CardDescription>Últimos alertas de performance enviados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Nenhum alerta registrado ainda</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Histórico de Alertas
        </CardTitle>
        <CardDescription>Últimos 10 alertas de performance enviados</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {alertas.map((alerta) => {
              const info = getTipoAlertaInfo(alerta.tipo_alerta);
              const Icon = info.icon;

              return (
                <div
                  key={alerta.id}
                  className={`p-4 rounded-lg border ${info.bgColor} border-border/50 hover:shadow-sm transition-shadow`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${info.bgColor}`}>
                      <Icon className={`h-4 w-4 ${info.color}`} />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={info.color}>
                          {info.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(alerta.created_at), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Valor atual: </span>
                        <span className="font-semibold">
                          {alerta.tipo_alerta === 'taxa_conclusao_baixa'
                            ? `${alerta.valor_atual}%`
                            : alerta.tipo_alerta === 'tempo_medio_alto'
                              ? `${alerta.valor_atual}h`
                              : alerta.valor_atual}
                        </span>
                        <span className="text-muted-foreground"> | Meta: </span>
                        <span className="font-semibold">
                          {alerta.tipo_alerta === 'taxa_conclusao_baixa'
                            ? `${alerta.meta_esperada}%`
                            : alerta.tipo_alerta === 'tempo_medio_alto'
                              ? `${alerta.meta_esperada}h`
                              : alerta.meta_esperada}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Enviado para {Array.isArray(alerta.enviado_para) ? alerta.enviado_para.length : 0} destinatário(s)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
