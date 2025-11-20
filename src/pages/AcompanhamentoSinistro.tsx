import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, FileSearch, CheckCircle2, Clock, AlertCircle, Car, User, Calendar, Phone, Mail, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCPF, formatPlaca } from '@/lib/validators';
import { cn } from '@/lib/utils';

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
      toast.error('Digite uma placa, CPF ou número do protocolo');
      return;
    }

    setLoading(true);
    try {
      const cleanBusca = busca.replace(/[^\w]/g, '');
      let vistoriaResult = null;
      
      // Tentar buscar por número de protocolo primeiro
      if (/^\d+$/.test(cleanBusca)) {
        const numeroProtocolo = parseInt(cleanBusca);
        
        // Buscar atendimento pelo número
        const { data: atendimentoResult } = await supabase
          .from('atendimentos')
          .select('id')
          .eq('numero', numeroProtocolo)
          .maybeSingle();

        if (atendimentoResult) {
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
        const { data: vistoriaData, error: vistoriaError } = await supabase
          .from('vistorias')
          .select('*')
          .or(`veiculo_placa.ilike.%${cleanBusca}%,cliente_cpf.ilike.%${cleanBusca}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (vistoriaError || !vistoriaData) {
          toast.error('Nenhum sinistro encontrado com esses dados');
          setVistoriaData(null);
          setAtendimento(null);
          return;
        }
        
        vistoriaResult = vistoriaData;
      }

      setVistoriaData(vistoriaResult);

      // Buscar atendimento vinculado
      if (vistoriaResult.atendimento_id) {
        const { data: atendimentoData } = await supabase
          .from('atendimentos')
          .select('*')
          .eq('id', vistoriaResult.atendimento_id)
          .single();
        
        setAtendimento(atendimentoData);
      } else {
        setAtendimento(null);
      }

      // Buscar andamentos e histórico
      if (vistoriaResult.atendimento_id) {
        const { data: andamentosData } = await supabase
          .from('andamentos')
          .select('*, profiles!andamentos_created_by_fkey(nome)')
          .eq('atendimento_id', vistoriaResult.atendimento_id)
          .order('created_at', { ascending: true });

        const { data: historicoData } = await supabase
          .from('atendimentos_historico')
          .select('*')
          .eq('atendimento_id', vistoriaResult.atendimento_id)
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
      }

      // Buscar status públicos
      if (vistoriaResult.atendimento_id) {
        const { data: atendimentoFluxo } = await supabase
          .from('atendimentos')
          .select('fluxo_id')
          .eq('id', vistoriaResult.atendimento_id)
          .single();

        if (atendimentoFluxo?.fluxo_id) {
          const { data: statusData } = await supabase
            .from('status_publicos_config')
            .select('*')
            .eq('fluxo_id', atendimentoFluxo.fluxo_id)
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
        {/* Header Modernizado */}
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

        {/* Busca Modernizada */}
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

        {/* Resultados Modernizados */}
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
                          {/* Linha conectora */}
                          {index < statusPublicos.length - 1 && (
                            <div 
                              className={`absolute left-6 top-14 w-[3px] h-full transition-all duration-500 ${
                                isCompleted ? 'bg-gradient-to-b from-green-500 to-green-400' : 'bg-border'
                              }`}
                            />
                          )}
                          
                          {/* Ícone */}
                          <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all duration-500 ${
                            isCompleted ? 'bg-gradient-to-br from-green-500 to-green-600 scale-110' : 
                            isCurrent ? 'bg-gradient-to-br from-primary to-primary/60 animate-pulse scale-110 ring-4 ring-primary/20' : 
                            'bg-muted scale-100'
                          }`}>
                            {getStatusIcon(status.status_nome, atendimento.status)}
                          </div>
                          
                          {/* Conteúdo */}
                          <div className="flex-1 pb-8">
                            <div className={`text-xl font-bold mb-2 transition-colors ${
                              isCurrent ? 'text-primary' : 
                              isCompleted ? 'text-green-600' : 
                              'text-muted-foreground'
                            }`}>
                              {status.status_nome}
                            </div>
                            {status.descricao_publica && (
                              <p className="text-base text-muted-foreground leading-relaxed mb-3">{status.descricao_publica}</p>
                            )}
                            {isCurrent && (
                              <Badge className="mt-2 text-sm py-1 px-3 bg-primary/10 text-primary border-primary/20" variant="outline">
                                ✓ Status Atual
                              </Badge>
                            )}
                            {isCompleted && (
                              <Badge className="mt-2 text-sm py-1 px-3 bg-green-500/10 text-green-600 border-green-500/20" variant="outline">
                                ✓ Concluído
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

            {/* Histórico de Andamentos e Mudanças de Status */}
            {andamentos.length > 0 && (
              <Card className="shadow-2xl border-0 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-1">
                  <CardHeader className="bg-card">
                    <CardTitle className="flex items-center gap-3 text-2xl">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <FileText className="h-6 w-6 text-purple-600" />
                      </div>
                      Histórico Completo de Andamentos
                    </CardTitle>
                  </CardHeader>
                </div>
                <CardContent className="p-8">
                  <div className="space-y-6">
                    {andamentos.map((item: any, index: number) => (
                      <div 
                        key={item.id}
                        className={cn(
                          "p-6 rounded-xl relative transition-all hover:shadow-lg",
                          item.type === 'status_change' 
                            ? "border-l-4 border-primary bg-gradient-to-r from-primary/10 to-transparent" 
                            : "border-l-4 border-purple-500 bg-gradient-to-r from-purple-500/10 to-transparent"
                        )}
                      >
                        {/* Linha conectora */}
                        {index < andamentos.length - 1 && (
                          <div className="absolute left-0 top-full w-[4px] h-6 bg-border" />
                        )}
                        
                        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className={cn(
                              "text-base font-bold",
                              item.type === 'status_change' ? "text-primary" : "text-purple-600"
                            )}>
                              {item.created_by}
                            </span>
                            {item.type === 'status_change' && (
                              <Badge variant="outline" className="text-xs border-primary text-primary bg-primary/5">
                                🔄 Mudança de Status
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground font-medium">
                            {new Date(item.created_at).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap pl-1">
                          {item.descricao}
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
