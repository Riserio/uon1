import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, FileSearch, CheckCircle2, Clock, AlertCircle, Car, User, Calendar, Phone, Mail, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCPF, formatPlaca } from '@/lib/validators';
import { StatusPrazo } from '@/components/StatusPrazo';
import { CriarDadosTesteButton } from '@/components/CriarDadosTesteButton';

export default function AcompanhamentoSinistro() {
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [vistoriaData, setVistoriaData] = useState<any>(null);
  const [atendimento, setAtendimento] = useState<any>(null);
  const [statusPublicos, setStatusPublicos] = useState<any[]>([]);
  const [andamentos, setAndamentos] = useState<any[]>([]);

  const handleInputChange = (value: string) => {
    const cleaned = value.replace(/[^\w]/g, '');
    
    if (/^\d+$/.test(cleaned)) {
      if (cleaned.length <= 11) {
        setBusca(formatCPF(cleaned));
        return;
      }
    }
    
    if (/[a-zA-Z]/.test(cleaned)) {
      setBusca(formatPlaca(cleaned));
      return;
    }
    
    setBusca(value);
  };

  const handleBuscar = async () => {
    if (!busca.trim()) {
      toast.error('Digite uma placa, CPF ou número do protocolo');
      return;
    }

    setLoading(true);
    try {
      const cleanBusca = busca.replace(/[^\w]/g, '');
      let vistoriaResult = null;
      let atendimentoData = null;
      
      // Tentar buscar por número de protocolo primeiro
      if (/^\d+$/.test(cleanBusca)) {
        const numeroProtocolo = parseInt(cleanBusca);
        
        // Buscar atendimento pelo número
        const { data: atendimentoResult } = await supabase
          .from('atendimentos')
          .select('*')
          .eq('numero', numeroProtocolo)
          .maybeSingle();

        if (atendimentoResult) {
          atendimentoData = atendimentoResult;
          
          // Buscar vistoria pelo atendimento_id
          const { data: vistoriaData } = await supabase
            .from('vistorias')
            .select('*')
            .eq('atendimento_id', atendimentoResult.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (vistoriaData) {
            vistoriaResult = vistoriaData;
          }
        }
      }
      
      // Se não encontrou por protocolo, buscar vistoria pela placa ou CPF
      if (!vistoriaResult) {
        const { data: vistoriaData } = await supabase
          .from('vistorias')
          .select('*')
          .or(`veiculo_placa.ilike.%${cleanBusca}%,cliente_cpf.ilike.%${cleanBusca}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (vistoriaData) {
          vistoriaResult = vistoriaData;
          
          // Buscar atendimento vinculado
          if (vistoriaResult.atendimento_id) {
            const { data: atendimentoResult } = await supabase
              .from('atendimentos')
              .select('*')
              .eq('id', vistoriaResult.atendimento_id)
              .single();
            
            atendimentoData = atendimentoResult;
          }
        }
      }

      if (!vistoriaResult && !atendimentoData) {
        toast.error('Nenhum sinistro encontrado com esses dados');
        setVistoriaData(null);
        setAtendimento(null);
        setStatusPublicos([]);
        setAndamentos([]);
        return;
      }

      setVistoriaData(vistoriaResult);
      setAtendimento(atendimentoData);

      // Buscar andamentos e histórico
      if (atendimentoData) {
        const { data: andamentosData } = await supabase
          .from('andamentos')
          .select('*, profiles!andamentos_created_by_fkey(nome)')
          .eq('atendimento_id', atendimentoData.id)
          .order('created_at', { ascending: true });

        const { data: historicoData } = await supabase
          .from('atendimentos_historico')
          .select('*')
          .eq('atendimento_id', atendimentoData.id)
          .contains('campos_alterados', ['status'])
          .order('created_at', { ascending: true });

        // Combinar andamentos e histórico de status
        const combinedTimeline = [
          ...(andamentosData || []).map((a: any) => ({
            id: a.id,
            type: 'andamento',
            descricao: a.descricao,
            created_at: a.created_at,
            created_by: a.profiles?.nome || 'Sistema'
          })),
          ...(historicoData || []).map((h: any) => ({
            id: h.id,
            type: 'status_change',
            descricao: `Status alterado: ${(h.valores_anteriores as any)?.status || 'N/A'} → ${(h.valores_novos as any)?.status || 'N/A'}`,
            created_at: h.created_at,
            created_by: h.user_nome
          }))
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        setAndamentos(combinedTimeline);

        // Buscar status públicos configurados para o fluxo
        if (atendimentoData.fluxo_id) {
          const { data: statusData } = await supabase
            .from('status_publicos_config')
            .select('*')
            .eq('fluxo_id', atendimentoData.fluxo_id)
            .eq('visivel_publico', true)
            .order('ordem_exibicao');

          setStatusPublicos(statusData || []);
        }
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
      return <CheckCircle2 className="h-6 w-6 text-white" />;
    } else if (thisIndex === currentIndex) {
      return <Clock className="h-6 w-6 text-white" />;
    } else {
      return <AlertCircle className="h-6 w-6 text-muted-foreground/50" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-2xl mb-6 animate-in zoom-in duration-500">
            <FileSearch className="h-12 w-12 text-primary-foreground" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            Acompanhamento de Sinistro
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            Acompanhe em tempo real todas as etapas do seu processo
          </p>
        </div>

        {/* Botão de teste */}
        <div className="flex justify-end mb-4">
          <CriarDadosTesteButton />
        </div>

        {/* Busca */}
        <Card className="shadow-2xl mb-10 border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-1">
            <CardContent className="p-8 bg-card">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative group">
                  <Input
                    placeholder="Digite a placa (ABC-1234), CPF (000.000.000-00) ou protocolo (#00)"
                    value={busca}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleBuscar()}
                    className="h-14 text-lg pr-12 border-2 transition-all group-hover:border-primary/50 focus:border-primary"
                  />
                  {busca && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      {busca.includes('.') ? 
                        <User className="h-5 w-5 text-primary" /> : 
                        <Car className="h-5 w-5 text-primary" />
                      }
                    </div>
                  )}
                </div>
                <Button 
                  onClick={handleBuscar}
                  disabled={loading}
                  className="h-14 px-10 text-lg shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-foreground" />
                  ) : (
                    <>
                      <Search className="mr-2 h-6 w-6" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Resultados */}
        {atendimento && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            {/* Informações do Sinistro */}
            <Card className="shadow-2xl border-0 overflow-hidden">
              <div className="bg-gradient-to-r from-primary to-primary/60 p-1">
                <CardHeader className="bg-card">
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    Informações do Sinistro
                  </CardTitle>
                </CardHeader>
              </div>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Veículo */}
                  {vistoriaData?.veiculo_placa && (
                    <div className="space-y-4 p-6 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/10">
                      <h3 className="font-bold text-lg flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Car className="h-5 w-5 text-primary" />
                        </div>
                        Veículo
                      </h3>
                      <div className="space-y-3 pl-2">
                        <p className="text-base"><span className="font-semibold text-foreground">Placa:</span> <span className="text-muted-foreground">{formatPlaca(vistoriaData.veiculo_placa)}</span></p>
                        {vistoriaData.veiculo_marca && <p className="text-base"><span className="font-semibold text-foreground">Marca:</span> <span className="text-muted-foreground">{vistoriaData.veiculo_marca}</span></p>}
                        {vistoriaData.veiculo_modelo && <p className="text-base"><span className="font-semibold text-foreground">Modelo:</span> <span className="text-muted-foreground">{vistoriaData.veiculo_modelo}</span></p>}
                        {vistoriaData.veiculo_ano && <p className="text-base"><span className="font-semibold text-foreground">Ano:</span> <span className="text-muted-foreground">{vistoriaData.veiculo_ano}</span></p>}
                        {vistoriaData.veiculo_cor && <p className="text-base"><span className="font-semibold text-foreground">Cor:</span> <span className="text-muted-foreground">{vistoriaData.veiculo_cor}</span></p>}
                      </div>
                    </div>
                  )}

                  {/* Cliente */}
                  {vistoriaData?.cliente_nome && (
                    <div className="space-y-4 p-6 rounded-xl bg-gradient-to-br from-secondary/5 to-transparent border border-secondary/10">
                      <h3 className="font-bold text-lg flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-secondary/10">
                          <User className="h-5 w-5 text-secondary-foreground" />
                        </div>
                        Cliente
                      </h3>
                      <div className="space-y-3 pl-2">
                        <p className="text-base"><span className="font-semibold text-foreground">Nome:</span> <span className="text-muted-foreground">{vistoriaData.cliente_nome}</span></p>
                        {vistoriaData.cliente_cpf && <p className="text-base"><span className="font-semibold text-foreground">CPF:</span> <span className="text-muted-foreground">{formatCPF(vistoriaData.cliente_cpf)}</span></p>}
                        {vistoriaData.cliente_telefone && (
                          <p className="text-base flex items-center gap-2">
                            <Phone className="h-4 w-4 text-primary" />
                            <span className="text-muted-foreground">{vistoriaData.cliente_telefone}</span>
                          </p>
                        )}
                        {vistoriaData.cliente_email && (
                          <p className="text-base flex items-center gap-2">
                            <Mail className="h-4 w-4 text-primary" />
                            <span className="text-muted-foreground">{vistoriaData.cliente_email}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Informações Adicionais */}
                <div className="mt-8 pt-8 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/20 shadow-sm">
                      <div className="p-3 rounded-lg bg-primary/20">
                        <Calendar className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Protocolo</p>
                        <p className="text-xl font-bold text-foreground">#{atendimento.numero}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl border border-green-500/20 shadow-sm">
                      <div className="p-3 rounded-lg bg-green-500/20">
                        <div className="w-4 h-4 rounded-full bg-green-500 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status Atual</p>
                        <p className="text-lg font-bold text-foreground">{atendimento.status}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl border border-purple-500/20 shadow-sm">
                      <div className="p-3 rounded-lg bg-purple-500/20">
                        <AlertCircle className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prioridade</p>
                        <Badge 
                          variant={atendimento.prioridade === 'Alta' ? 'destructive' : 'secondary'}
                          className="mt-1 text-sm"
                        >
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
              <Card className="shadow-2xl border-0 overflow-hidden">
                <div className="bg-gradient-to-r from-primary to-primary/60 p-1">
                  <CardHeader className="bg-card">
                    <CardTitle className="flex items-center gap-3 text-2xl">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Clock className="h-6 w-6 text-primary" />
                      </div>
                      Linha do Tempo do Processo
                    </CardTitle>
                  </CardHeader>
                </div>
                <CardContent className="p-8">
                  <div className="space-y-8">
                    {statusPublicos.map((status, index) => {
                      const isCompleted = statusPublicos.findIndex(s => s.status_nome === atendimento.status) > index;
                      const isCurrent = status.status_nome === atendimento.status;
                      
                      return (
                        <div key={status.id} className="flex gap-6 relative group">
                          {index < statusPublicos.length - 1 && (
                            <div 
                              className={`absolute left-6 top-14 w-[3px] h-full transition-all duration-500 ${
                                isCompleted ? 'bg-gradient-to-b from-green-500 to-green-400' : 'bg-border'
                              }`}
                            />
                          )}
                          
                          <div className={`relative z-10 p-3 rounded-2xl transition-all duration-500 ${
                            isCompleted 
                              ? 'bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/30' 
                              : isCurrent 
                              ? 'bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30 animate-pulse' 
                              : 'bg-muted/30 border-2 border-border'
                          }`}>
                            {getStatusIcon(status.status_nome, atendimento.status)}
                          </div>
                          
                          <div className="flex-1 pt-2">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-bold text-xl text-foreground">{status.status_nome}</h3>
                              {isCurrent && (
                                <Badge className="bg-primary text-primary-foreground shadow-lg">
                                  EM ANDAMENTO
                                </Badge>
                              )}
                              {isCompleted && (
                                <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                                  CONCLUÍDO
                                </Badge>
                              )}
                            </div>
                            {status.descricao_publica && (
                              <p className="text-muted-foreground mb-3 text-base leading-relaxed">
                                {status.descricao_publica}
                              </p>
                            )}
                            {!isCompleted && atendimento?.fluxo_id && (
                              <StatusPrazo statusNome={status.status_nome} fluxoId={atendimento.fluxo_id} />
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
              <Card className="shadow-2xl border-0 overflow-hidden">
                <div className="bg-gradient-to-r from-primary to-primary/60 p-1">
                  <CardHeader className="bg-card">
                    <CardTitle className="flex items-center gap-3 text-2xl">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      Histórico de Atualizações
                    </CardTitle>
                  </CardHeader>
                </div>
                <CardContent className="p-8">
                  <div className="space-y-6">
                    {andamentos.map((andamento, index) => (
                      <div key={andamento.id} className="flex gap-4 group">
                        <div className="relative">
                          <div className={`p-2 rounded-full ${
                            andamento.type === 'status_change' 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-secondary/10 text-secondary-foreground'
                          }`}>
                            {andamento.type === 'status_change' ? (
                              <Clock className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </div>
                          {index < andamentos.length - 1 && (
                            <div className="absolute left-1/2 top-10 w-[2px] h-full -translate-x-1/2 bg-border" />
                          )}
                        </div>
                        <div className="flex-1 pb-6">
                          <p className="font-medium text-foreground mb-1">{andamento.descricao}</p>
                          <p className="text-sm text-muted-foreground">
                            {andamento.created_by} • {new Date(andamento.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !atendimento && (
          <div className="text-center py-20 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
            <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-muted/50 mb-6">
              <Search className="h-16 w-16 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-semibold text-foreground mb-2">
              Nenhum sinistro encontrado
            </h3>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Digite a placa do veículo, CPF do cliente ou número do protocolo para começar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
