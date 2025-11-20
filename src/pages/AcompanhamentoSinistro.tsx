import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, FileSearch, CheckCircle2, Clock, AlertCircle, Car, User, Calendar, Phone, Mail, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCPF, formatPlaca } from '@/lib/validators';

export default function AcompanhamentoSinistro() {
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [vistoriaData, setVistoriaData] = useState<any>(null);
  const [atendimento, setAtendimento] = useState<any>(null);
  const [statusPublicos, setStatusPublicos] = useState<any[]>([]);
  const [andamentos, setAndamentos] = useState<any[]>([]);

  // Detecta automaticamente se é CPF ou Placa e formata
  const handleInputChange = (value: string) => {
    const cleaned = value.replace(/[^\w]/g, '');
    
    // Se só tem números e tem 11 dígitos, é CPF
    if (/^\d+$/.test(cleaned)) {
      if (cleaned.length <= 11) {
        setBusca(formatCPF(cleaned));
        return;
      }
    }
    
    // Se tem letras, é placa
    if (/[a-zA-Z]/.test(cleaned)) {
      setBusca(formatPlaca(cleaned));
      return;
    }
    
    setBusca(value);
  };

  const handleBuscar = async () => {
    if (!busca.trim()) {
      toast.error('Digite uma placa ou CPF');
      return;
    }

    setLoading(true);
    try {
      const cleanBusca = busca.replace(/[^\w]/g, '');
      
      // Buscar vistoria pela placa ou CPF
      const { data: vistoriaResult, error: vistoriaError } = await supabase
        .from('vistorias')
        .select('*, atendimentos(*)')
        .or(`veiculo_placa.ilike.%${cleanBusca}%,cliente_cpf.ilike.%${cleanBusca}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vistoriaError || !vistoriaResult) {
        toast.error('Nenhum sinistro encontrado com esses dados');
        setVistoriaData(null);
        setAtendimento(null);
        return;
      }

      setVistoriaData(vistoriaResult);
      setAtendimento(vistoriaResult.atendimentos);

      // Buscar andamentos
      if (vistoriaResult.atendimentos?.id) {
        const { data: andamentosData } = await supabase
          .from('andamentos')
          .select('*, profiles!andamentos_created_by_fkey(nome)')
          .eq('atendimento_id', vistoriaResult.atendimentos.id)
          .order('created_at', { ascending: false });

        setAndamentos(andamentosData || []);
      }

      // Buscar status públicos
      if (vistoriaResult.atendimentos?.fluxo_id) {
        const { data: statusData } = await supabase
          .from('status_publicos_config')
          .select('*')
          .eq('fluxo_id', vistoriaResult.atendimentos.fluxo_id)
          .eq('visivel_publico', true)
          .order('ordem_exibicao');

        setStatusPublicos(statusData || []);
      }

      toast.success('Sinistro encontrado!');
    } catch (error) {
      console.error('Erro ao buscar:', error);
      toast.error('Erro ao buscar sinistro');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (statusNome: string, currentStatus: string) => {
    const currentIndex = statusPublicos.findIndex(s => s.status_nome === currentStatus);
    const thisIndex = statusPublicos.findIndex(s => s.status_nome === statusNome);
    
    if (thisIndex < currentIndex) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    } else if (thisIndex === currentIndex) {
      return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
    } else {
      return <AlertCircle className="h-5 w-5 text-gray-300" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl mb-4">
            <FileSearch className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Acompanhamento de Sinistro
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Consulte o status do seu processo em tempo real
          </p>
        </div>

        {/* Busca */}
        <Card className="shadow-xl mb-8 border-0">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Input
                  placeholder="Digite a placa (ABC-1234) ou CPF (000.000.000-00)"
                  value={busca}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleBuscar()}
                  className="h-12 text-lg pr-10"
                />
                {busca && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {busca.includes('.') ? <User className="h-4 w-4" /> : <Car className="h-4 w-4" />}
                  </div>
                )}
              </div>
              <Button 
                onClick={handleBuscar}
                disabled={loading}
                className="h-12 px-8 text-base"
                size="lg"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <>
                    <Search className="mr-2 h-5 w-5" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        {atendimento && (
          <div className="space-y-6">
            {/* Informações do Sinistro */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-blue-600" />
                  Informações do Sinistro
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Veículo */}
                  {vistoriaData?.veiculo_placa && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Car className="h-5 w-5 text-blue-600" />
                        Veículo
                      </h3>
                      <div className="space-y-2 pl-7">
                        <p className="text-sm"><span className="font-medium">Placa:</span> {vistoriaData.veiculo_placa}</p>
                        {vistoriaData.veiculo_marca && <p className="text-sm"><span className="font-medium">Marca:</span> {vistoriaData.veiculo_marca}</p>}
                        {vistoriaData.veiculo_modelo && <p className="text-sm"><span className="font-medium">Modelo:</span> {vistoriaData.veiculo_modelo}</p>}
                        {vistoriaData.veiculo_ano && <p className="text-sm"><span className="font-medium">Ano:</span> {vistoriaData.veiculo_ano}</p>}
                        {vistoriaData.veiculo_cor && <p className="text-sm"><span className="font-medium">Cor:</span> {vistoriaData.veiculo_cor}</p>}
                      </div>
                    </div>
                  )}

                  {/* Cliente */}
                  {vistoriaData?.cliente_nome && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <User className="h-5 w-5 text-blue-600" />
                        Cliente
                      </h3>
                      <div className="space-y-2 pl-7">
                        <p className="text-sm"><span className="font-medium">Nome:</span> {vistoriaData.cliente_nome}</p>
                        {vistoriaData.cliente_cpf && <p className="text-sm"><span className="font-medium">CPF:</span> {formatCPF(vistoriaData.cliente_cpf)}</p>}
                        {vistoriaData.cliente_telefone && (
                          <p className="text-sm flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {vistoriaData.cliente_telefone}
                          </p>
                        )}
                        {vistoriaData.cliente_email && (
                          <p className="text-sm flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {vistoriaData.cliente_email}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Informações Adicionais */}
                <div className="mt-6 pt-6 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-xs text-gray-600">Protocolo</p>
                        <p className="font-semibold">#{atendimento.numero}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <div>
                        <p className="text-xs text-gray-600">Status Atual</p>
                        <p className="font-semibold">{atendimento.status}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="text-xs text-gray-600">Prioridade</p>
                        <Badge variant={atendimento.prioridade === 'Alta' ? 'destructive' : 'secondary'}>
                          {atendimento.prioridade}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Linha do Tempo de Status */}
            {statusPublicos.length > 0 && (
              <Card className="shadow-lg border-0">
                <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50">
                  <CardTitle className="flex items-center gap-3">
                    <Clock className="h-6 w-6 text-indigo-600" />
                    Linha do Tempo
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-6">
                    {statusPublicos.map((status, index) => {
                      const isCompleted = statusPublicos.findIndex(s => s.status_nome === atendimento.status) > index;
                      const isCurrent = status.status_nome === atendimento.status;
                      
                      return (
                        <div key={status.id} className="flex gap-4 relative">
                          {/* Linha conectora */}
                          {index < statusPublicos.length - 1 && (
                            <div 
                              className={`absolute left-5 top-10 w-[2px] h-full ${
                                isCompleted ? 'bg-green-500' : 'bg-gray-200'
                              }`}
                            />
                          )}
                          
                          {/* Ícone */}
                          <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                            isCompleted ? 'bg-green-500' : 
                            isCurrent ? 'bg-blue-500 animate-pulse' : 
                            'bg-gray-200'
                          }`}>
                            {getStatusIcon(status.status_nome, atendimento.status)}
                          </div>
                          
                          {/* Conteúdo */}
                          <div className="flex-1 pb-6">
                            <div className={`font-semibold ${isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                              {status.status_nome}
                            </div>
                            {status.descricao_publica && (
                              <p className="text-sm text-gray-600 mt-1">{status.descricao_publica}</p>
                            )}
                            {isCurrent && (
                              <Badge className="mt-2" variant="default">
                                Status Atual
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Histórico de Andamentos */}
            {andamentos.length > 0 && (
              <Card className="shadow-lg border-0">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                  <CardTitle className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-purple-600" />
                    Histórico de Andamentos
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {andamentos.map((andamento) => (
                      <div 
                        key={andamento.id}
                        className="p-4 border-l-4 border-purple-500 bg-purple-50/50 rounded-r-lg"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-sm font-medium text-purple-900">
                            {andamento.profiles?.nome || 'Sistema'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(andamento.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {andamento.descricao}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
