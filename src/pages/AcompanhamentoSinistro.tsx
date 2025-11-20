import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, FileSearch, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function AcompanhamentoSinistro() {
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [atendimento, setAtendimento] = useState<any>(null);
  const [statusPublicos, setStatusPublicos] = useState<any[]>([]);

  const handleBuscar = async () => {
    if (!busca.trim()) {
      toast.error('Digite uma placa ou CPF');
      return;
    }

    setLoading(true);
    try {
      // Buscar atendimento pela placa ou CPF
      const { data: vistoriaData, error: vistoriaError } = await supabase
        .from('vistorias')
        .select('*, atendimentos(*)')
        .or(`veiculo_placa.ilike.%${busca}%,cliente_cpf.ilike.%${busca}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (vistoriaError || !vistoriaData) {
        toast.error('Nenhum sinistro encontrado com esses dados');
        setAtendimento(null);
        return;
      }

      // Buscar configuração de status públicos do fluxo
      if (vistoriaData.atendimentos?.fluxo_id) {
        const { data: statusData } = await supabase
          .from('status_publicos_config')
          .select('*')
          .eq('fluxo_id', vistoriaData.atendimentos.fluxo_id)
          .eq('visivel_publico', true)
          .order('ordem_exibicao');

        setStatusPublicos(statusData || []);
      }

      setAtendimento(vistoriaData.atendimentos);
      toast.success('Sinistro encontrado!');
    } catch (error) {
      console.error('Erro ao buscar:', error);
      toast.error('Erro ao buscar sinistro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4">
            <FileSearch className="h-8 w-8 md:h-10 md:w-10 text-white" />
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2">
            Acompanhamento de Sinistro
          </h1>
          <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
            Consulte o status do seu processo informando a placa do veículo ou CPF
          </p>
        </div>

        {/* Busca */}
        <Card className="shadow-xl mb-8">
          <CardContent className="p-4 sm:p-6">
            <div className="flex gap-2">
              <Input
                placeholder="Digite a placa (ex: ABC-1234) ou CPF (ex: 000.000.000-00)"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleBuscar()}
                className="flex-1"
              />
              <Button 
                onClick={handleBuscar}
                disabled={loading}
                className="min-w-[100px]"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Resultado */}
        {atendimento && (
          <Card className="shadow-xl">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 sm:p-6 text-white">
              <h2 className="text-xl md:text-2xl font-bold mb-2">{atendimento.assunto}</h2>
              <p className="text-blue-100 text-sm md:text-base">Protocolo: #{atendimento.numero}</p>
            </div>
            
            <CardContent className="p-4 sm:p-6">
              {/* Status Atual */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Status Atual</h3>
                <Badge className="text-sm px-3 py-1.5" variant="default">
                  {atendimento.status}
                </Badge>
              </div>

              {/* Timeline de Status Públicos */}
              {statusPublicos.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Andamento do Processo</h3>
                  <div className="space-y-3">
                    {statusPublicos.map((status, idx) => {
                      const isCurrent = status.status_nome === atendimento.status;
                      const isPast = statusPublicos.findIndex(s => s.status_nome === atendimento.status) > idx;
                      
                      return (
                        <div key={status.id} className="flex gap-3 items-start">
                          <div className="flex flex-col items-center">
                            <div 
                              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                isCurrent 
                                  ? 'bg-blue-500 text-white' 
                                  : isPast 
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-200 text-gray-400'
                              }`}
                            >
                              {isPast ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : isCurrent ? (
                                <Clock className="h-4 w-4" />
                              ) : (
                                <AlertCircle className="h-4 w-4" />
                              )}
                            </div>
                            {idx < statusPublicos.length - 1 && (
                              <div className={`w-0.5 h-8 ${isPast ? 'bg-green-500' : 'bg-gray-200'}`} />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <p className={`font-medium ${isCurrent ? 'text-blue-600' : isPast ? 'text-green-600' : 'text-gray-400'}`}>
                              {status.status_nome}
                            </p>
                            {status.descricao_publica && (
                              <p className="text-sm text-gray-500 mt-1">{status.descricao_publica}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Info adicional */}
              <div className="mt-6 pt-6 border-t space-y-2 text-sm text-gray-600">
                <p><strong>Prioridade:</strong> {atendimento.prioridade}</p>
                {atendimento.responsavel_id && (
                  <p><strong>Responsável:</strong> {atendimento.responsavel}</p>
                )}
                <p><strong>Criado em:</strong> {new Date(atendimento.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
