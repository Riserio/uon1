import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, CheckCircle2, Clock, AlertCircle, Car, User, Calendar, Workflow } from 'lucide-react';
import { formatCPF, formatPlaca } from '@/lib/validators';
import { CriarDadosTesteButton } from '@/components/CriarDadosTesteButton';

export default function AcompanhamentoSinistro() {
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [vistoriaData, setVistoriaData] = useState<any>(null);
  const [atendimento, setAtendimento] = useState<any>(null);
  const [fluxoNome, setFluxoNome] = useState<string>('');
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
      
      // Se não encontrou por protocolo, buscar vistoria pela placa ou CPF (busca exata)
      if (!vistoriaResult) {
        const { data: vistoriaData } = await supabase
          .from('vistorias')
          .select('*')
          .or(`veiculo_placa.eq.${cleanBusca.toUpperCase()},cliente_cpf.eq.${cleanBusca}`)
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
        console.log('❌ Nenhum resultado encontrado');
        toast.error('Nenhum sinistro encontrado com esses dados');
        setVistoriaData(null);
        setAtendimento(null);
        setStatusPublicos([]);
        setAndamentos([]);
        return;
      }

      console.log('✅ Dados encontrados:', { 
        vistoria: !!vistoriaResult, 
        atendimento: !!atendimentoData,
        fluxo_id: atendimentoData?.fluxo_id 
      });

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

        console.log('📋 Andamentos combinados:', combinedTimeline.length);

        // Buscar status públicos configurados para o fluxo
        if (atendimentoData.fluxo_id) {
          // Buscar nome do fluxo
          const { data: fluxoData } = await supabase
            .from('fluxos')
            .select('nome')
            .eq('id', atendimentoData.fluxo_id)
            .single();
          
          if (fluxoData) {
            setFluxoNome(fluxoData.nome);
          }

          const { data: statusData, error: statusError } = await supabase
            .from('status_publicos_config')
            .select('*')
            .eq('fluxo_id', atendimentoData.fluxo_id)
            .eq('visivel_publico', true)
            .order('ordem_exibicao');

          if (statusError) {
            console.error('❌ Erro ao buscar status públicos:', statusError);
          } else {
            console.log('📊 Status públicos encontrados:', statusData?.length || 0);
            setStatusPublicos(statusData || []);
          }
        } else {
          console.warn('⚠️  Atendimento sem fluxo_id configurado');
        }
      } else {
        console.warn('⚠️  Vistoria encontrada mas sem atendimento vinculado');
      }

      toast.success('Sinistro encontrado!');
    } catch (error) {
      console.error('Erro ao buscar:', error);
      toast.error('Erro ao buscar sinistro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header Minimalista */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">
            Acompanhamento de Sinistro
          </h1>
          <p className="text-sm text-muted-foreground">
            Consulte o status do seu processo
          </p>
        </div>

        {/* Botão de teste */}
        <div className="flex justify-end mb-4">
          <CriarDadosTesteButton />
        </div>

        {/* Busca Minimalista */}
        <Card className="mb-8 border shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Placa, CPF ou Protocolo"
                  value={busca}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleBuscar()}
                  className="h-11"
                />
              </div>
              <Button 
                onClick={handleBuscar}
                disabled={loading}
                className="h-11 px-8"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
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

        {/* Resultados */}
        {atendimento && (
          <div className="space-y-6">
            {/* Card com Fluxo e Status */}
            <Card className="border shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
                    <Workflow className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">{fluxoNome || 'Fluxo'}</span>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{atendimento.status}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Veículo */}
                  {vistoriaData?.veiculo_placa && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Car className="h-4 w-4" />
                        Veículo
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Placa</span>
                          <span className="font-medium">{formatPlaca(vistoriaData.veiculo_placa)}</span>
                        </div>
                        {vistoriaData.veiculo_marca && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Marca</span>
                            <span className="font-medium">{vistoriaData.veiculo_marca}</span>
                          </div>
                        )}
                        {vistoriaData.veiculo_modelo && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Modelo</span>
                            <span className="font-medium">{vistoriaData.veiculo_modelo}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cliente */}
                  {vistoriaData?.cliente_nome && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <User className="h-4 w-4" />
                        Cliente
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nome</span>
                          <span className="font-medium">{vistoriaData.cliente_nome}</span>
                        </div>
                        {vistoriaData.cliente_telefone && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Telefone</span>
                            <span className="font-medium">{vistoriaData.cliente_telefone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Protocolo</span>
                    <span className="font-semibold">#{atendimento.numero}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Linha do Tempo de Status */}
            {statusPublicos.length > 0 ? (
              <Card className="border shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold">Progresso</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <div className="space-y-4">
                    {statusPublicos.map((status, index) => {
                      const currentIndex = statusPublicos.findIndex(s => s.status_nome === atendimento.status);
                      const thisIndex = index;
                      const isCompleted = currentIndex >= thisIndex;
                      const isCurrent = currentIndex === thisIndex;
                      const isLast = index === statusPublicos.length - 1;

                      return (
                        <div key={status.id} className="flex items-start gap-4">
                          <div className="flex flex-col items-center">
                            <div 
                              className={`
                                w-8 h-8 rounded-full flex items-center justify-center transition-all
                                ${isCompleted 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted text-muted-foreground'
                                }
                              `}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                <div className="w-2 h-2 rounded-full bg-current" />
                              )}
                            </div>
                            {!isLast && (
                              <div className={`w-px h-12 mt-1 ${isCompleted ? 'bg-primary' : 'bg-border'}`} />
                            )}
                          </div>

                          <div className="flex-1 pb-6">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className={`font-medium ${isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {status.status_nome}
                                </p>
                                {status.descricao_publica && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {status.descricao_publica}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Histórico de Andamentos */}
            {andamentos.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold">Histórico</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <div className="space-y-3">
                    {andamentos.map((andamento) => (
                      <div key={andamento.id} className="border-l-2 border-muted pl-4 py-2">
                        <p className="text-sm text-foreground">{andamento.descricao}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span>{andamento.created_by}</span>
                          <span>•</span>
                          <span>
                            {new Date(andamento.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {!atendimento && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Digite a placa, CPF ou protocolo para consultar
          </div>
        )}
      </div>
    </div>
  );
}
