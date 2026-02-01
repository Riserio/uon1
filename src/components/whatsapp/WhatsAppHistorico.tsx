import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { History, RefreshCw, CheckCircle2, XCircle, Clock, Eye, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface HistoricoItem {
  id: string;
  corretora_id: string;
  telefone_destino: string;
  mensagem: string;
  tipo: string;
  status: string;
  enviado_em: string | null;
  created_at: string;
  corretoras?: { nome: string } | null;
}

export function WhatsAppHistorico() {
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<HistoricoItem | null>(null);

  useEffect(() => {
    loadHistorico();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('whatsapp_historico_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_historico' },
        () => loadHistorico()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadHistorico = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_historico')
      .select(`
        *,
        corretoras (nome)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) {
      setHistorico(data as HistoricoItem[]);
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'enviado':
        return (
          <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Enviado
          </Badge>
        );
      case 'erro':
        return (
          <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Erro
          </Badge>
        );
      case 'pendente':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pendente
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'cobranca':
        return <Badge className="bg-blue-100 text-blue-800">Cobrança</Badge>;
      case 'eventos':
        return <Badge className="bg-orange-100 text-orange-800">Eventos</Badge>;
      case 'mgf':
        return <Badge className="bg-purple-100 text-purple-800">MGF</Badge>;
      default:
        return <Badge variant="secondary">Manual</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Histórico de Envios
              </CardTitle>
              <CardDescription>
                Acompanhe todas as mensagens enviadas via WhatsApp
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadHistorico} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma mensagem enviada ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-medium">
                          {item.corretoras?.nome || 'Associação não encontrada'}
                        </span>
                        {getTipoBadge(item.tipo)}
                        {getStatusBadge(item.status)}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {item.telefone_destino}
                        </p>
                        <p className="line-clamp-2">{item.mensagem}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMessage(item)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Mensagem</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {getTipoBadge(selectedMessage.tipo)}
                {getStatusBadge(selectedMessage.status)}
              </div>
              <div className="grid gap-2 text-sm">
                <div>
                  <strong>Associação:</strong> {selectedMessage.corretoras?.nome}
                </div>
                <div>
                  <strong>Telefone:</strong> {selectedMessage.telefone_destino}
                </div>
                <div>
                  <strong>Data:</strong>{' '}
                  {format(new Date(selectedMessage.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              </div>
              <div className="border rounded-lg p-4 bg-muted/50">
                <strong className="block mb-2">Mensagem:</strong>
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {selectedMessage.mensagem}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
