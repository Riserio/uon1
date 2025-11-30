import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSinistroPerguntas, calcularPesoRespostas, SinistroPergunta } from '@/hooks/useSinistroPerguntas';
import { PERGUNTAS_COMITE, PARECERES_COMITE, PARECERES_ASSOCIACAO, PARECERES_ANALISTA, PerguntaComite, ORDEM_CATEGORIAS } from '@/constants/perguntasComite';
import { Save, FileDown, ArrowLeft, Gavel, CheckCircle2, XCircle, HelpCircle, AlertTriangle } from 'lucide-react';
import { exportDeliberacaoPDF } from '@/utils/pdfDeliberacao';
import { formatCurrency } from '@/lib/formatters';

export default function ComiteDeliberacao() {
  const { atendimentoId } = useParams<{ atendimentoId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [acompanhamentoData, setAcompanhamentoData] = useState<any>(null);
  const [atendimentoData, setAtendimentoData] = useState<any>(null);
  const [vistoriaData, setVistoriaData] = useState<any>(null);
  
  // Pareceres separados
  const [parecerAnalista, setParecerAnalista] = useState({
    parecer: '',
    justificativa: ''
  });
  
  const [parecerAssociacao, setParecerAssociacao] = useState({
    parecer: '',
    justificativa: '',
    valor_aprovado: ''
  });

  const tipoFinal = vistoriaData?.tipo_sinistro || atendimentoData?.tipo_atendimento || '';
  const { perguntas: perguntasDb, loading: loadingPerguntas } = useSinistroPerguntas(tipoFinal);
  const usarPerguntasDb = perguntasDb.length > 0;

  useEffect(() => {
    if (atendimentoId) {
      loadData();
    }
  }, [atendimentoId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar atendimento
      const { data: atendimento, error: atendError } = await supabase
        .from('atendimentos')
        .select('*, corretora:corretoras(*), contato:contatos(*)')
        .eq('id', atendimentoId)
        .maybeSingle();

      if (atendError) throw atendError;
      setAtendimentoData(atendimento);

      // Carregar vistoria vinculada
      const { data: vistoria } = await supabase
        .from('vistorias')
        .select('*')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      setVistoriaData(vistoria);

      // Carregar acompanhamento
      const { data: acompanhamento, error: acompError } = await supabase
        .from('sinistro_acompanhamento')
        .select('*')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      if (acompError) throw acompError;

      if (acompanhamento) {
        setAcompanhamentoData(acompanhamento);
        if (acompanhamento.entrevista_respostas) {
          setRespostas(acompanhamento.entrevista_respostas as Record<string, string>);
        }
        setParecerAnalista({
          parecer: acompanhamento.parecer_analista || acompanhamento.comite_status || '',
          justificativa: acompanhamento.parecer_analista_justificativa || ''
        });
        setParecerAssociacao({
          parecer: acompanhamento.parecer_associacao || '',
          justificativa: acompanhamento.parecer_associacao_justificativa || acompanhamento.comite_observacoes || '',
          valor_aprovado: acompanhamento.financeiro_valor_aprovado?.toString() || ''
        });
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados da deliberação');
    } finally {
      setLoading(false);
    }
  };

  const saveRespostas = useCallback(async (novasRespostas: Record<string, string>) => {
    try {
      const { data: existing } = await supabase
        .from('sinistro_acompanhamento')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      const payload = {
        entrevista_respostas: novasRespostas,
        entrevista_data: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from('sinistro_acompanhamento')
          .update(payload)
          .eq('atendimento_id', atendimentoId);
      } else {
        await supabase
          .from('sinistro_acompanhamento')
          .insert({
            ...payload,
            atendimento_id: atendimentoId,
          });
      }
    } catch (error) {
      console.error('Erro ao salvar respostas:', error);
    }
  }, [atendimentoId]);

  const handleRespostaChange = (perguntaId: string, valor: string) => {
    setRespostas(prev => {
      const novas = { ...prev, [perguntaId]: valor };
      saveRespostas(novas);
      return novas;
    });
  };

  const handleSalvarParecerAnalista = async () => {
    try {
      setSaving(true);
      
      const { data: existing } = await supabase
        .from('sinistro_acompanhamento')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      const payload = {
        parecer_analista: parecerAnalista.parecer,
        parecer_analista_justificativa: parecerAnalista.justificativa,
        parecer_analista_data: new Date().toISOString(),
        comite_status: parecerAnalista.parecer, // Manter compatibilidade
        entrevista_respostas: respostas,
      };

      if (existing) {
        await supabase
          .from('sinistro_acompanhamento')
          .update(payload)
          .eq('atendimento_id', atendimentoId);
      } else {
        await supabase
          .from('sinistro_acompanhamento')
          .insert({
            ...payload,
            atendimento_id: atendimentoId,
          });
      }

      toast.success('Parecer do analista salvo com sucesso');
      loadData();
    } catch (error) {
      console.error('Erro ao salvar parecer:', error);
      toast.error('Erro ao salvar parecer do analista');
    } finally {
      setSaving(false);
    }
  };

  const handleSalvarParecerAssociacao = async () => {
    try {
      setSaving(true);
      
      const { data: existing } = await supabase
        .from('sinistro_acompanhamento')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      const payload = {
        parecer_associacao: parecerAssociacao.parecer,
        parecer_associacao_justificativa: parecerAssociacao.justificativa,
        parecer_associacao_data: new Date().toISOString(),
        financeiro_valor_aprovado: parseFloat(parecerAssociacao.valor_aprovado) || null,
        comite_data: new Date().toISOString(),
        comite_observacoes: parecerAssociacao.justificativa,
      };

      if (existing) {
        await supabase
          .from('sinistro_acompanhamento')
          .update(payload)
          .eq('atendimento_id', atendimentoId);
      } else {
        await supabase
          .from('sinistro_acompanhamento')
          .insert({
            ...payload,
            atendimento_id: atendimentoId,
          });
      }

      toast.success('Parecer da associação salvo com sucesso');
      loadData();
    } catch (error) {
      console.error('Erro ao salvar parecer:', error);
      toast.error('Erro ao salvar parecer da associação');
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (!vistoriaData && !atendimentoData) return;

    try {
      const comiteData = {
        parecer_analista: parecerAnalista.parecer,
        decisao: parecerAssociacao.parecer,
        valor_aprovado: parseFloat(parecerAssociacao.valor_aprovado) || undefined,
        justificativa: parecerAssociacao.justificativa,
        data_deliberacao: new Date().toISOString(),
      };

      const { data: vistoriaFotos } = await supabase
        .from('vistoria_fotos')
        .select('foto_url, tipo_foto')
        .eq('vistoria_id', vistoriaData?.id || atendimentoId);

      const fotos = (vistoriaFotos || []).map((f: any) => ({
        url: f.foto_url || '',
        tipo: f.tipo_foto || 'Foto',
      }));

      const exportData = vistoriaData || { 
        ...atendimentoData, 
        cliente_nome: atendimentoData?.contato?.nome,
        veiculo_placa: atendimentoData?.veiculo_placa,
        veiculo_marca: atendimentoData?.veiculo_marca,
        veiculo_modelo: atendimentoData?.veiculo_modelo,
        veiculo_ano: atendimentoData?.veiculo_ano,
        tipo_sinistro: atendimentoData?.tipo_atendimento,
      };

      await exportDeliberacaoPDF(exportData, respostas, comiteData, fotos);
      toast.success('PDF gerado com sucesso');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao gerar PDF');
    }
  };

  const renderPerguntaConstante = (pergunta: PerguntaComite) => {
    const valor = respostas[pergunta.id] || '';

    return (
      <div key={pergunta.id} className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-2">
          {pergunta.pergunta}
          {pergunta.obrigatoria && <span className="text-destructive">*</span>}
        </Label>

        {pergunta.tipo === 'select' && pergunta.opcoes && (
          <Select value={valor} onValueChange={(v) => handleRespostaChange(pergunta.id, v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {pergunta.opcoes.map((opcao) => (
                <SelectItem key={opcao} value={opcao} className="text-xs">{opcao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pergunta.tipo === 'text' && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            className="h-8 text-xs"
          />
        )}

        {pergunta.tipo === 'textarea' && (
          <Textarea
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            rows={2}
            className="text-xs"
          />
        )}

        {pergunta.tipo === 'date' && (
          <Input
            type="date"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            className="h-8 text-xs"
          />
        )}

        {pergunta.tipo === 'valor' && (
          <Input
            type="number"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="0,00"
            className="h-8 text-xs"
          />
        )}
      </div>
    );
  };

  const renderPerguntaDb = (pergunta: SinistroPergunta) => {
    const valor = respostas[pergunta.id] || '';

    return (
      <div key={pergunta.id} className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-2">
          {pergunta.pergunta}
          {pergunta.obrigatoria && <span className="text-destructive">*</span>}
        </Label>

        {pergunta.tipo_campo === 'select' && pergunta.opcoes && (
          <Select value={valor} onValueChange={(v) => handleRespostaChange(pergunta.id, v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {(pergunta.opcoes as string[]).filter(opcao => opcao?.trim()).map((opcao) => (
                <SelectItem key={opcao} value={opcao} className="text-xs">{opcao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pergunta.tipo_campo === 'text' && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            className="h-8 text-xs"
          />
        )}

        {pergunta.tipo_campo === 'textarea' && (
          <Textarea
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            rows={2}
            className="text-xs"
          />
        )}

        {pergunta.tipo_campo === 'date' && (
          <Input
            type="date"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            className="h-8 text-xs"
          />
        )}

        {pergunta.tipo_campo === 'valor' && (
          <Input
            type="number"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="0,00"
            className="h-8 text-xs"
          />
        )}
      </div>
    );
  };

  // Agrupar perguntas por categoria
  const perguntasFiltradas = tipoFinal 
    ? PERGUNTAS_COMITE.filter(p => !p.tiposSinistro || p.tiposSinistro.includes(tipoFinal))
    : PERGUNTAS_COMITE;

  const perguntasPorCategoria = perguntasFiltradas.reduce((acc, pergunta) => {
    const cat = pergunta.categoria || 'Geral';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(pergunta);
    return acc;
  }, {} as Record<string, PerguntaComite[]>);

  const categoriasOrdenadas = ORDEM_CATEGORIAS.filter(cat => perguntasPorCategoria[cat]);

  const totalPerguntas = usarPerguntasDb ? perguntasDb.length : perguntasFiltradas.length;
  const perguntasRespondidas = Object.keys(respostas).filter(k => respostas[k]).length;
  const percentualPreenchido = totalPerguntas > 0 ? Math.round((perguntasRespondidas / totalPerguntas) * 100) : 0;

  const { total: pesoTotal, maxPossivel, percentual: percentualPeso, alertas } = usarPerguntasDb 
    ? calcularPesoRespostas(respostas, perguntasDb)
    : { total: 0, maxPossivel: 0, percentual: 0, alertas: [] };

  const getParecerAnalistaInfo = () => {
    const config = PARECERES_ANALISTA.find(p => p.value === parecerAnalista.parecer);
    return config || { cor: 'bg-muted', textCor: 'text-foreground', label: 'Pendente' };
  };

  const getParecerAssociacaoInfo = () => {
    const config = PARECERES_ASSOCIACAO.find(p => p.value === parecerAssociacao.parecer);
    return config || { cor: 'bg-muted', textCor: 'text-foreground', label: 'Pendente' };
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Deliberação do Comitê</h1>
            <p className="text-sm text-muted-foreground">
              {atendimentoData?.assunto} - #{atendimentoData?.numero}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <FileDown className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Resumo do Sinistro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Informações do Sinistro</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <p className="font-medium">{vistoriaData?.cliente_nome || atendimentoData?.contato?.nome || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Veículo</Label>
              <p className="font-medium">
                {vistoriaData?.veiculo_marca || atendimentoData?.veiculo_marca} {vistoriaData?.veiculo_modelo || atendimentoData?.veiculo_modelo}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Placa</Label>
              <p className="font-medium">{vistoriaData?.veiculo_placa || atendimentoData?.veiculo_placa || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <p className="font-medium">{vistoriaData?.tipo_sinistro || atendimentoData?.tipo_atendimento || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Valor FIPE</Label>
              <p className="font-medium">
                {formatCurrency(vistoriaData?.veiculo_valor_fipe || atendimentoData?.veiculo_valor_fipe || 0)}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Corretora</Label>
              <p className="font-medium">{atendimentoData?.corretora?.nome || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progresso */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progresso do Questionário</span>
              <span>{perguntasRespondidas}/{totalPerguntas} ({percentualPreenchido}%)</span>
            </div>
            <Progress value={percentualPreenchido} className="h-2" />
          </div>
          {usarPerguntasDb && pesoTotal > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Peso Total das Respostas</span>
                <span className={percentualPeso > 50 ? 'text-destructive' : 'text-green-600'}>
                  {pesoTotal} / {maxPossivel} ({percentualPeso.toFixed(0)}%)
                </span>
              </div>
              <Progress 
                value={percentualPeso} 
                className={`h-2 ${percentualPeso > 50 ? '[&>div]:bg-destructive' : '[&>div]:bg-green-500'}`} 
              />
            </div>
          )}
          {alertas.length > 0 && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium text-sm">Alertas</span>
              </div>
              <ul className="text-xs space-y-1">
                {alertas.map((alerta, idx) => (
                  <li key={idx}>• {alerta}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Perguntas */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Questionário do Comitê</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  {usarPerguntasDb ? (
                    perguntasDb.map(renderPerguntaDb)
                  ) : (
                    categoriasOrdenadas.map(categoria => (
                      <div key={categoria} className="space-y-4">
                        <h3 className="font-semibold text-sm border-b pb-2">{categoria}</h3>
                        <div className="space-y-4">
                          {perguntasPorCategoria[categoria].map(renderPerguntaConstante)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Pareceres */}
        <div className="space-y-6">
          {/* Parecer do Analista */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                Parecer do Analista
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Parecer</Label>
                <Select 
                  value={parecerAnalista.parecer} 
                  onValueChange={(v) => setParecerAnalista(prev => ({ ...prev, parecer: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o parecer...">
                      {parecerAnalista.parecer && (
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getParecerAnalistaInfo().cor}`} />
                          <span className="text-xs truncate">{getParecerAnalistaInfo().label}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PARECERES_ANALISTA.map((parecer) => (
                      <SelectItem key={parecer.value} value={parecer.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${parecer.cor}`} />
                          <span className="text-xs">{parecer.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Justificativa do Analista</Label>
                <Textarea
                  value={parecerAnalista.justificativa}
                  onChange={(e) => setParecerAnalista(prev => ({ ...prev, justificativa: e.target.value }))}
                  placeholder="Descreva sua análise..."
                  rows={4}
                  className="text-sm"
                />
              </div>

              <Button 
                className="w-full" 
                onClick={handleSalvarParecerAnalista}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar Parecer do Analista
              </Button>
            </CardContent>
          </Card>

          {/* Parecer da Associação */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-3 bg-primary/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Parecer da Associação
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Decisão final exibida na tela de sinistros
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-xs">Decisão</Label>
                <Select 
                  value={parecerAssociacao.parecer} 
                  onValueChange={(v) => setParecerAssociacao(prev => ({ ...prev, parecer: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a decisão...">
                      {parecerAssociacao.parecer && (
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getParecerAssociacaoInfo().cor}`} />
                          <span className="font-medium">{getParecerAssociacaoInfo().label}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PARECERES_ASSOCIACAO.map((parecer) => (
                      <SelectItem key={parecer.value} value={parecer.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${parecer.cor}`} />
                          <span>{parecer.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {parecerAssociacao.parecer === 'aprovado' && (
                <div className="space-y-2">
                  <Label className="text-xs">Valor Aprovado</Label>
                  <Input
                    type="number"
                    value={parecerAssociacao.valor_aprovado}
                    onChange={(e) => setParecerAssociacao(prev => ({ ...prev, valor_aprovado: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Justificativa da Associação</Label>
                <Textarea
                  value={parecerAssociacao.justificativa}
                  onChange={(e) => setParecerAssociacao(prev => ({ ...prev, justificativa: e.target.value }))}
                  placeholder="Descreva a decisão da associação..."
                  rows={4}
                  className="text-sm"
                />
              </div>

              <Button 
                className="w-full" 
                onClick={handleSalvarParecerAssociacao}
                disabled={saving}
                variant={parecerAssociacao.parecer === 'aprovado' ? 'default' : 
                         parecerAssociacao.parecer === 'negado' ? 'destructive' : 'secondary'}
              >
                {parecerAssociacao.parecer === 'aprovado' && <CheckCircle2 className="h-4 w-4 mr-2" />}
                {parecerAssociacao.parecer === 'negado' && <XCircle className="h-4 w-4 mr-2" />}
                {parecerAssociacao.parecer === 'mais_informacoes' && <HelpCircle className="h-4 w-4 mr-2" />}
                {!parecerAssociacao.parecer && <Save className="h-4 w-4 mr-2" />}
                Salvar Parecer da Associação
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
