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
import { PARECERES_COMITE, PARECERES_ASSOCIACAO, PARECERES_ANALISTA } from '@/constants/perguntasComite';
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
  const { perguntas: perguntasDb, categorias, loading: loadingPerguntas } = useSinistroPerguntas(tipoFinal);

  // Função para mapear tags auto_preenchivel para valores da vistoria
  const getAutoFillValue = (tag: string, vistoria: any, atendimento: any): string => {
    if (!vistoria && !atendimento) return '';
    
    const mappings: Record<string, () => string> = {
      // Dados do cliente
      cliente_nome: () => vistoria?.cliente_nome || atendimento?.contato?.nome || '',
      cliente_cpf: () => vistoria?.cliente_cpf || '',
      cliente_telefone: () => vistoria?.cliente_telefone || atendimento?.contato?.telefone || '',
      cliente_email: () => vistoria?.cliente_email || atendimento?.contato?.email || '',
      cliente_endereco: () => vistoria?.endereco || '',
      
      // Dados do veículo
      veiculo_placa: () => vistoria?.veiculo_placa || '',
      veiculo_marca: () => vistoria?.veiculo_marca || atendimento?.veiculo_marca || '',
      veiculo_modelo: () => vistoria?.veiculo_modelo || atendimento?.veiculo_modelo || '',
      veiculo_ano: () => vistoria?.veiculo_ano || atendimento?.veiculo_ano || '',
      veiculo_cor: () => vistoria?.veiculo_cor || '',
      veiculo_chassi: () => vistoria?.veiculo_chassi || '',
      veiculo_valor_fipe: () => vistoria?.veiculo_valor_fipe ? formatCurrency(vistoria.veiculo_valor_fipe) : (atendimento?.veiculo_valor_fipe ? formatCurrency(atendimento.veiculo_valor_fipe) : ''),
      veiculo_tipo: () => vistoria?.veiculo_tipo || atendimento?.veiculo_tipo || '',
      veiculo_quilometragem: () => vistoria?.quilometragem?.toString() || '',
      veiculo_uf: () => vistoria?.veiculo_uf || '',
      
      // Dados do sinistro
      sinistro_data: () => {
        const data = vistoria?.data_incidente || vistoria?.data_evento;
        return data ? new Date(data).toLocaleDateString('pt-BR') : '';
      },
      sinistro_hora: () => vistoria?.hora_evento || '',
      sinistro_local: () => vistoria?.endereco || '',
      sinistro_tipo: () => vistoria?.tipo_sinistro || atendimento?.tipo_atendimento || '',
      sinistro_descricao: () => vistoria?.relato_incidente || vistoria?.narrar_fatos || '',
      
      // Dados do condutor
      condutor_nome: () => vistoria?.condutor_veiculo || vistoria?.cliente_nome || '',
      condutor_cpf: () => vistoria?.cnh_dados?.cpf || vistoria?.cliente_cpf || '',
      condutor_cnh: () => vistoria?.cnh_dados?.numero || '',
      condutor_telefone: () => vistoria?.cliente_telefone || '',
      
      // Dados da associação
      associacao_nome: () => atendimento?.corretora?.nome || '',
      numero_sinistro: () => vistoria?.numero ? `SIN-${new Date().getFullYear()}-${String(vistoria.numero).padStart(6, '0')}` : '',
      
      // Perguntas da vistoria (boolean para sim/não)
      fez_bo: () => vistoria?.fez_bo === true ? 'Sim' : vistoria?.fez_bo === false ? 'Não' : '',
      foi_hospital: () => vistoria?.foi_hospital === true ? 'Sim' : vistoria?.foi_hospital === false ? 'Não' : '',
      policia_foi_local: () => vistoria?.policia_foi_local === true ? 'Sim' : vistoria?.policia_foi_local === false ? 'Não' : '',
      motorista_faleceu: () => vistoria?.motorista_faleceu === true ? 'Sim' : vistoria?.motorista_faleceu === false ? 'Não' : '',
      tem_terceiros: () => vistoria?.tem_terceiros === true ? 'Sim' : vistoria?.tem_terceiros === false ? 'Não' : '',
      local_tem_camera: () => vistoria?.local_tem_camera === true ? 'Sim' : vistoria?.local_tem_camera === false ? 'Não' : '',
      estava_chovendo: () => vistoria?.estava_chovendo === true ? 'Sim' : vistoria?.estava_chovendo === false ? 'Não' : '',
      acionou_assistencia_24h: () => vistoria?.acionou_assistencia_24h === true ? 'Sim' : vistoria?.acionou_assistencia_24h === false ? 'Não' : '',
      houve_remocao_veiculo: () => vistoria?.houve_remocao_veiculo === true ? 'Sim' : vistoria?.houve_remocao_veiculo === false ? 'Não' : '',
      vitima_ou_causador: () => vistoria?.vitima_ou_causador || '',
      placa_terceiro: () => vistoria?.placa_terceiro || '',
    };
    
    const getValue = mappings[tag];
    return getValue ? getValue() : '';
  };

  // Auto-preencher respostas baseado nos dados da vistoria
  const autoFillRespostas = (perguntas: SinistroPergunta[], vistoria: any, atendimento: any, existingRespostas: Record<string, string>) => {
    const novasRespostas = { ...existingRespostas };
    let hasNewValues = false;
    
    perguntas.forEach(pergunta => {
      if (pergunta.auto_preenchivel && !novasRespostas[pergunta.id]) {
        const valor = getAutoFillValue(pergunta.auto_preenchivel, vistoria, atendimento);
        if (valor) {
          novasRespostas[pergunta.id] = valor;
          hasNewValues = true;
        }
      }
    });
    
    return { novasRespostas, hasNewValues };
  };

  useEffect(() => {
    if (atendimentoId) {
      loadData();
    }
  }, [atendimentoId]);

  // Auto-preencher quando perguntas e vistoria forem carregados
  useEffect(() => {
    if (!loadingPerguntas && perguntasDb.length > 0 && (vistoriaData || atendimentoData) && !loading) {
      const { novasRespostas, hasNewValues } = autoFillRespostas(perguntasDb, vistoriaData, atendimentoData, respostas);
      if (hasNewValues) {
        setRespostas(novasRespostas);
        // Salvar automaticamente as respostas auto-preenchidas
        saveRespostas(novasRespostas);
      }
    }
  }, [loadingPerguntas, perguntasDb, vistoriaData, atendimentoData, loading]);

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
        // Respostas serão filtradas pelo useEffect abaixo após perguntas carregarem
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

  // Filtrar respostas antigas quando perguntas do banco forem carregadas
  useEffect(() => {
    if (!loadingPerguntas && perguntasDb.length > 0 && Object.keys(respostas).length > 0) {
      const perguntaIdsValidos = new Set(perguntasDb.map(p => p.id));
      const respostasFiltradas = Object.fromEntries(
        Object.entries(respostas).filter(([key]) => perguntaIdsValidos.has(key))
      );
      // Só atualizar se houver diferença (evita loop infinito)
      if (Object.keys(respostasFiltradas).length !== Object.keys(respostas).length) {
        setRespostas(respostasFiltradas);
      }
    }
  }, [loadingPerguntas, perguntasDb]);

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

  // Filtrar respostas para considerar APENAS perguntas cadastradas no banco
  const perguntaIds = new Set(perguntasDb.map(p => p.id));
  const respostasFiltradas = Object.fromEntries(
    Object.entries(respostas).filter(([k]) => perguntaIds.has(k))
  );

  const totalPerguntas = perguntasDb.length;
  const perguntasRespondidas = Object.keys(respostasFiltradas).filter(k => respostasFiltradas[k]).length;
  const percentualPreenchido = totalPerguntas > 0 ? Math.round((perguntasRespondidas / totalPerguntas) * 100) : 0;

  const { total: pesoTotal, maxPossivel, percentual: percentualPeso, alertas } = calcularPesoRespostas(respostasFiltradas, perguntasDb);

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
              <Label className="text-xs text-muted-foreground">Associação</Label>
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
          {pesoTotal > 0 && (
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
                  {loadingPerguntas ? (
                    <p className="text-muted-foreground text-center py-8">Carregando perguntas...</p>
                  ) : perguntasDb.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Nenhuma pergunta cadastrada para este tipo de sinistro. Configure as perguntas em Configurações de Sinistro.
                    </p>
                  ) : categorias.length > 0 ? (
                    categorias.map(categoria => (
                      <div key={categoria.id} className="space-y-4">
                        <h3 className="font-semibold text-sm border-b pb-2">{categoria.nome}</h3>
                        <div className="space-y-4">
                          {(categoria.perguntas || []).map(renderPerguntaDb)}
                        </div>
                      </div>
                    ))
                  ) : (
                    perguntasDb.map(renderPerguntaDb)
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Pareceres */}
        <div className="space-y-6">
          {/* Resultado da Análise */}
          {perguntasDb.length > 0 && (
            <Card className={`border-2 ${
              percentualPeso <= 30 ? 'bg-green-600 border-green-600' :
              percentualPeso <= 50 ? 'bg-lime-500 border-lime-500' :
              percentualPeso <= 70 ? 'bg-yellow-400 border-yellow-400' :
              percentualPeso <= 85 ? 'bg-orange-500 border-orange-500' :
              'bg-red-600 border-red-600'
            }`}>
              <CardContent className="pt-4 pb-4">
                <h3 className={`font-bold text-lg mb-2 ${
                  percentualPeso <= 70 && percentualPeso > 50 ? 'text-black' : 'text-white'
                }`}>Resultado da Análise</h3>
                <p className={`text-sm font-semibold ${
                  percentualPeso <= 70 && percentualPeso > 50 ? 'text-black' : 'text-white'
                }`}>
                  {percentualPeso <= 30 ? 'Evento passivo de aprovação - Nenhuma das respostas informadas indicam indícios de atenção' :
                   percentualPeso <= 50 ? 'Evento passível de ressarcimento' :
                   percentualPeso <= 70 ? 'Evento requer atenção - Mudanças no andamento' :
                   percentualPeso <= 85 ? 'Evento requer atenção - Análise jurídica/sindicância/perícia' :
                   'Evento requer atenção - Passível de negativa/análise jurídica'}
                </p>
                {alertas.length > 0 && (
                  <div className={`mt-3 p-2 rounded ${
                    percentualPeso <= 70 && percentualPeso > 50 ? 'bg-black/10' : 'bg-white/20'
                  }`}>
                    <p className={`text-xs font-medium mb-1 ${
                      percentualPeso <= 70 && percentualPeso > 50 ? 'text-black' : 'text-white'
                    }`}>Pontos de atenção ({alertas.length}):</p>
                    <ul className={`text-xs list-disc list-inside ${
                      percentualPeso <= 70 && percentualPeso > 50 ? 'text-black/80' : 'text-white/90'
                    }`}>
                      {alertas.slice(0, 5).map((alerta, i) => (
                        <li key={i} className="truncate">{alerta}</li>
                      ))}
                      {alertas.length > 5 && (
                        <li>...e mais {alertas.length - 5} item(s)</li>
                      )}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Parecer do Analista */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                Parecer do Analista
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Esta é uma informação baseada na opinião do analista, fica sob responsabilidade da associação a definição do evento.
              </p>
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
