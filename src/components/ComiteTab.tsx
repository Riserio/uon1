import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';


import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSinistroPerguntas, calcularPesoRespostas, SinistroPergunta } from '@/hooks/useSinistroPerguntas';
import { PERGUNTAS_COMITE, PARECERES_COMITE, PerguntaComite, getCategoriasPerguntas, ORDEM_CATEGORIAS } from '@/constants/perguntasComite';
import { Save, FileDown, AlertTriangle, FileText, Gavel, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PARECERES_ASSOCIACAO } from '@/pages/ComiteDeliberacao';
import { exportDeliberacaoPDF } from '@/utils/pdfDeliberacao';
import { formatCurrency } from '@/lib/formatters';

interface ComiteTabProps {
  atendimentoId: string;
  tipoSinistro?: string;
  vistoriaData?: {
    id?: string;
    cliente_nome?: string;
    veiculo_placa?: string;
    veiculo_marca?: string;
    veiculo_modelo?: string;
    veiculo_ano?: string;
    tipo_sinistro?: string;
    data_incidente?: string;
    veiculo_valor_fipe?: number;
  };
  onUpdate?: () => void;
  showNavigationButton?: boolean;
  autoSave?: boolean;
  fluxoNome?: string; // Nome do fluxo atual
  statusAtual?: string; // Status atual do atendimento
}

export function ComiteTab({ 
  atendimentoId, 
  tipoSinistro, 
  vistoriaData, 
  onUpdate,
  showNavigationButton = true,
  autoSave = true,
  fluxoNome,
  statusAtual
}: ComiteTabProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [deliberacao, setDeliberacao] = useState({
    decisao: '',
    valor_aprovado: '',
    justificativa: ''
  });
  const [acompanhamentoData, setAcompanhamentoData] = useState<any>(null);
  
  const tipoFinal = tipoSinistro || vistoriaData?.tipo_sinistro || '';
  const { categorias: categoriasDb, perguntas: perguntasDb, loading: loadingPerguntas } = useSinistroPerguntas(tipoFinal);
  
  // Usar perguntas do banco se existirem, senão usar constante
  const usarPerguntasDb = perguntasDb.length > 0;

  // Verificar se pode deliberar: fluxo deve ser "Comitê" e não pode estar já deliberado
  const podeDeliberar = () => {
    if (!fluxoNome) return true; // Se não tiver fluxo, permitir
    const fluxoLower = fluxoNome.toLowerCase();
    const isFluxoComite = fluxoLower.includes('comit') || fluxoLower.includes('comite');
    const jaDeliberado = acompanhamentoData?.comite_status && 
      (acompanhamentoData.comite_status.toLowerCase().includes('aprovado') ||
       acompanhamentoData.comite_status.toLowerCase().includes('negado') ||
       acompanhamentoData.comite_status.toLowerCase().includes('aprovacao'));
    return isFluxoComite && !jaDeliberado;
  };

  useEffect(() => {
    loadRespostas();
  }, [atendimentoId]);

  // Auto-preencher campos da vistoria
  useEffect(() => {
    if (vistoriaData) {
      setRespostas(prev => {
        const novas = { ...prev };
        
        // Preencher valor FIPE automaticamente
        if (vistoriaData.veiculo_valor_fipe && !novas['tabela_fipe']) {
          novas['tabela_fipe'] = String(vistoriaData.veiculo_valor_fipe);
        }
        
        // Para perguntas do banco
        if (usarPerguntasDb) {
          perguntasDb.forEach(pergunta => {
            if (pergunta.auto_preenchivel && !novas[pergunta.id]) {
              const valor = vistoriaData[pergunta.auto_preenchivel as keyof typeof vistoriaData];
              if (valor) {
                novas[pergunta.id] = String(valor);
              }
            }
          });
        }

        return novas;
      });
    }
  }, [vistoriaData, perguntasDb, usarPerguntasDb]);

  const loadRespostas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sinistro_acompanhamento')
        .select('*')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAcompanhamentoData(data);
        if (data.entrevista_respostas) {
          setRespostas(data.entrevista_respostas as Record<string, string>);
        }
        setDeliberacao({
          decisao: data.comite_status || '',
          valor_aprovado: data.financeiro_valor_aprovado?.toString() || '',
          justificativa: data.comite_observacoes || ''
        });
      }
    } catch (error) {
      console.error('Erro ao carregar respostas:', error);
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
        const { error } = await supabase
          .from('sinistro_acompanhamento')
          .update(payload)
          .eq('atendimento_id', atendimentoId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sinistro_acompanhamento')
          .insert({
            ...payload,
            atendimento_id: atendimentoId,
          });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Erro ao salvar respostas:', error);
    }
  }, [atendimentoId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveRespostas(respostas);
      toast.success('Comitê salvo com sucesso');
      onUpdate?.();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar comitê');
    } finally {
      setSaving(false);
    }
  };

  const handleDeliberar = async () => {
    try {
      setSaving(true);

      const { data: existing } = await supabase
        .from('sinistro_acompanhamento')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      const acompanhamentoPayload = {
        entrevista_respostas: respostas,
        entrevista_data: new Date().toISOString(),
        comite_status: deliberacao.decisao || null,
        comite_decisao: deliberacao.justificativa || null,
        comite_observacoes: deliberacao.justificativa || null,
        comite_data: new Date().toISOString(),
        financeiro_valor_aprovado: parseFloat(deliberacao.valor_aprovado) || null,
      };

      if (existing) {
        const { error } = await supabase
          .from('sinistro_acompanhamento')
          .update(acompanhamentoPayload)
          .eq('atendimento_id', atendimentoId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sinistro_acompanhamento')
          .insert({
            ...acompanhamentoPayload,
            atendimento_id: atendimentoId,
          });

        if (error) throw error;
      }

      toast.success('Deliberação salva com sucesso');
      loadRespostas();
      onUpdate?.();
    } catch (error) {
      console.error('Erro ao deliberar:', error);
      toast.error('Erro ao salvar deliberação');
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (!vistoriaData) return;

    try {
      const comiteData = {
        parecer_analista: respostas.parecer_analista,
        decisao: deliberacao.decisao,
        valor_aprovado: parseFloat(deliberacao.valor_aprovado) || undefined,
        justificativa: deliberacao.justificativa,
        data_deliberacao: new Date().toISOString(),
      };

      // Buscar fotos se houver
      const { data: vistoriaFotos } = await supabase
        .from('vistoria_fotos')
        .select('foto_url, tipo_foto')
        .eq('vistoria_id', vistoriaData.id || atendimentoId);

      const fotos = (vistoriaFotos || []).map((f: any) => ({
        url: f.foto_url || '',
        tipo: f.tipo_foto || 'Foto',
      }));

      await exportDeliberacaoPDF({ ...vistoriaData, numero: 0 } as any, respostas, comiteData, fotos);
      toast.success('PDF gerado com sucesso');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao gerar PDF');
    }
  };

  const handleRespostaChange = (perguntaId: string, valor: string) => {
    setRespostas(prev => {
      const novas = {
        ...prev,
        [perguntaId]: valor
      };
      
      if (autoSave) {
        saveRespostas(novas);
      }
      
      return novas;
    });
  };

  // Renderizar pergunta do banco
  const renderPerguntaDb = (pergunta: SinistroPergunta) => {
    const valor = respostas[pergunta.id] || '';

    return (
      <div key={pergunta.id} className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-2">
          {pergunta.pergunta}
          {pergunta.obrigatoria && <span className="text-destructive">*</span>}
          {pergunta.peso > 0 && (
            <Badge variant="outline" className="text-xs">
              Peso: {pergunta.peso}
            </Badge>
          )}
        </Label>

        {pergunta.tipo_campo === 'select' && pergunta.opcoes && (
          <Select
            value={valor}
            onValueChange={(v) => handleRespostaChange(pergunta.id, v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {(pergunta.opcoes as string[])
                .filter((opcao) => opcao && opcao.trim() !== '')
                .map((opcao) => (
                  <SelectItem key={opcao} value={opcao} className="text-xs">
                    {opcao}
                  </SelectItem>
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

        {pergunta.tipo_campo === 'mapa' && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Cole o link do Google Maps..."
            className="h-8 text-xs"
          />
        )}
      </div>
    );
  };

  // Renderizar pergunta da constante (igual ao PortalComite)
  const renderPerguntaConstante = (pergunta: PerguntaComite) => {
    const valor = respostas[pergunta.id] || '';
    const isParecer = pergunta.id === 'parecer_analista';

    return (
      <div key={pergunta.id} className="space-y-1.5">
        <Label className="text-xs font-medium">
          {pergunta.pergunta}
          {pergunta.obrigatoria && <span className="text-destructive ml-1">*</span>}
          {pergunta.peso && pergunta.peso > 0 && (
            <Badge variant="outline" className="text-xs ml-2">
              Peso: {pergunta.peso}
            </Badge>
          )}
        </Label>

        {pergunta.tipo === 'select' && pergunta.opcoes && (
          <Select
            value={valor}
            onValueChange={(v) => handleRespostaChange(pergunta.id, v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione...">
                {isParecer && valor ? (
                  (() => {
                    const parecerConfig = PARECERES_COMITE.find(p => p.value === valor);
                    return parecerConfig ? (
                      <span className="font-medium text-xs">
                        {parecerConfig.label}
                      </span>
                    ) : valor;
                  })()
                ) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {isParecer ? (
                PARECERES_COMITE.map((parecer) => (
                  <SelectItem key={parecer.value} value={parecer.value} className="text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${parecer.cor}`}></div>
                      <span className="text-xs">{parecer.label}</span>
                    </div>
                  </SelectItem>
                ))
              ) : (
                pergunta.opcoes.map((opcao) => (
                  <SelectItem key={opcao} value={opcao} className="text-xs">
                    {opcao}
                  </SelectItem>
                ))
              )}
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

        {pergunta.tipo === 'mapa' && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Cole o link do Google Maps..."
            className="h-8 text-xs"
          />
        )}
      </div>
    );
  };

  // Calcular estatísticas
  const perguntasFiltradas = tipoFinal ? PERGUNTAS_COMITE.filter(p => 
    !p.tiposSinistro || p.tiposSinistro.includes(tipoFinal)
  ) : PERGUNTAS_COMITE;
  
  const totalPerguntas = usarPerguntasDb ? perguntasDb.length : perguntasFiltradas.length;
  const perguntasRespondidas = Object.keys(respostas).filter(k => respostas[k]).length;
  const percentualPreenchido = totalPerguntas > 0 ? Math.round((perguntasRespondidas / totalPerguntas) * 100) : 0;
  
  const { total: pesoTotal, maxPossivel, percentual: percentualPeso, alertas } = usarPerguntasDb 
    ? calcularPesoRespostas(respostas, perguntasDb)
    : { total: 0, maxPossivel: 0, percentual: 0, alertas: [] };

  // Determinar parecer
  const parecer = respostas['parecer_analista'];

  const getParecerInfo = () => {
    if (!parecer) return { cor: 'bg-muted', textCor: 'text-foreground', label: 'Pendente' };
    const parecerConfig = PARECERES_COMITE.find(p => p.value === parecer);
    if (parecerConfig) {
      return { cor: parecerConfig.cor, textCor: parecerConfig.textCor, label: parecerConfig.label };
    }
    return { cor: 'bg-muted', textCor: 'text-foreground', label: parecer };
  };

  const parecerInfo = getParecerInfo();

  // Agrupar perguntas por categoria (filtradas por tipo de sinistro)
  const categoriasPerguntasConstante = getCategoriasPerguntas(tipoFinal);

  if (loading || loadingPerguntas) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com progresso e pesos */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="outline" className="text-xs">
            {perguntasRespondidas}/{totalPerguntas} respondidas ({percentualPreenchido}%)
          </Badge>
          
          {usarPerguntasDb && maxPossivel > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Pontuação:</span>
              <Badge variant={percentualPeso >= 70 ? 'default' : percentualPeso >= 40 ? 'secondary' : 'destructive'} className="text-xs">
                {pesoTotal}/{maxPossivel} ({percentualPeso.toFixed(0)}%)
              </Badge>
            </div>
          )}

          {parecer && (
            <Badge className={`${parecerInfo.cor} ${parecerInfo.textCor} text-xs`}>
              {parecerInfo.label}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="gap-2 text-xs"
          >
            <FileDown className="h-3 w-3" />
            PDF
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2 text-xs">
            <Save className="h-3 w-3" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-destructive font-medium mb-2 text-sm">
              <AlertTriangle className="h-4 w-4" />
              Alertas Identificados
            </div>
            <ul className="text-xs space-y-1">
              {alertas.map((alerta, i) => (
                <li key={i}>{alerta}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Barra de progresso */}
      <Progress value={percentualPreenchido} className="h-2" />

      {/* Grid de duas colunas: Perguntas + Deliberação */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Coluna de Perguntas (2/3) */}
        <div className="lg:col-span-2">
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {usarPerguntasDb ? (
                // Perguntas do banco agrupadas por categoria
                categoriasDb.map((categoria) => {
                  const perguntasCategoria = categoria.perguntas || [];
                  if (perguntasCategoria.length === 0) return null;

                  return (
                    <Card key={categoria.id}>
                      <CardHeader className="pb-2 py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {categoria.nome}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {perguntasCategoria.map(renderPerguntaDb)}
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                // Perguntas da constante agrupadas por categoria
                ORDEM_CATEGORIAS.map((categoria) => {
                  const perguntas = categoriasPerguntasConstante[categoria];
                  if (!perguntas || perguntas.length === 0) return null;

                  return (
                    <Card key={categoria}>
                      <CardHeader className="pb-2 py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {categoria}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {perguntas.map(renderPerguntaConstante)}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Coluna de Deliberação (1/3) */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gavel className="h-4 w-4" />
                Deliberação do Comitê
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status da Associação (decisão final) */}
              {acompanhamentoData?.parecer_associacao && (
                <div className="p-3 rounded-lg border bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Status da Associação</Label>
                  {(() => {
                    const parecerAssoc = PARECERES_ASSOCIACAO.find(p => p.value === acompanhamentoData.parecer_associacao);
                    return parecerAssoc ? (
                      <Badge className={`${parecerAssoc.cor} ${parecerAssoc.textCor} mt-1`}>
                        {parecerAssoc.label}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="mt-1">{acompanhamentoData.parecer_associacao}</Badge>
                    );
                  })()}
                  {acompanhamentoData.financeiro_valor_aprovado && (
                    <p className="text-xs font-medium mt-2">
                      Valor: {formatCurrency(acompanhamentoData.financeiro_valor_aprovado)}
                    </p>
                  )}
                </div>
              )}

              {/* Parecer do Analista (resumo) */}
              {acompanhamentoData?.parecer_analista && (
                <div className="p-3 rounded-lg border">
                  <Label className="text-xs text-muted-foreground">Parecer do Analista</Label>
                  {(() => {
                    const parecerAnal = PARECERES_COMITE.find(p => p.value === acompanhamentoData.parecer_analista);
                    return parecerAnal ? (
                      <Badge className={`${parecerAnal.cor} ${parecerAnal.textCor} mt-1`}>
                        {parecerAnal.label}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="mt-1">{acompanhamentoData.parecer_analista}</Badge>
                    );
                  })()}
                </div>
              )}

              {/* Botão para abrir página de deliberação */}
              {podeDeliberar() && (
                <Button
                  onClick={() => navigate(`/sinistros/${atendimentoId}/deliberacao`)}
                  className="w-full gap-2"
                  size="sm"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir Deliberação
                </Button>
              )}

              {!podeDeliberar() && acompanhamentoData?.parecer_associacao && (
                <div className="p-3 rounded-lg bg-muted text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-green-500" />
                  <p className="text-xs font-medium">Deliberação Concluída</p>
                </div>
              )}

              {!acompanhamentoData?.parecer_associacao && !podeDeliberar() && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/sinistros/${atendimentoId}/deliberacao`)}
                  className="w-full gap-2"
                  size="sm"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver Deliberação
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Card de Resumo do Evento */}
          {vistoriaData && (
            <Card>
              <CardHeader className="pb-2 py-3">
                <CardTitle className="text-sm">Resumo do Evento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {vistoriaData.cliente_nome && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-medium">{vistoriaData.cliente_nome}</span>
                  </div>
                )}
                {vistoriaData.veiculo_placa && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Placa:</span>
                    <span className="font-medium">{vistoriaData.veiculo_placa}</span>
                  </div>
                )}
                {(vistoriaData.veiculo_marca || vistoriaData.veiculo_modelo) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Veículo:</span>
                    <span className="font-medium">
                      {vistoriaData.veiculo_marca} {vistoriaData.veiculo_modelo}
                    </span>
                  </div>
                )}
                {vistoriaData.tipo_sinistro && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="font-medium">{vistoriaData.tipo_sinistro}</span>
                  </div>
                )}
                {vistoriaData.veiculo_valor_fipe && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FIPE:</span>
                    <span className="font-medium">{formatCurrency(vistoriaData.veiculo_valor_fipe)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
