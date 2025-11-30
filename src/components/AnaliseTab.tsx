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
import { Save, ExternalLink, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AnaliseTabProps {
  atendimentoId: string;
  tipoSinistro?: string;
  vistoriaData?: {
    cliente_nome?: string;
    veiculo_placa?: string;
    veiculo_marca?: string;
    veiculo_modelo?: string;
    veiculo_ano?: string;
    tipo_sinistro?: string;
    data_incidente?: string;
  };
  onUpdate?: () => void;
}

export function AnaliseTab({ atendimentoId, tipoSinistro, vistoriaData, onUpdate }: AnaliseTabProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  
  const tipoFinal = tipoSinistro || vistoriaData?.tipo_sinistro || '';
  const { categorias, perguntas, loading: loadingPerguntas } = useSinistroPerguntas(tipoFinal);

  useEffect(() => {
    loadRespostas();
  }, [atendimentoId]);

  // Auto-preencher campos da vistoria
  useEffect(() => {
    if (vistoriaData && perguntas.length > 0) {
      setRespostas(prev => {
        const novas = { ...prev };
        
        perguntas.forEach(pergunta => {
          if (pergunta.auto_preenchivel && !novas[pergunta.id]) {
            const valor = vistoriaData[pergunta.auto_preenchivel as keyof typeof vistoriaData];
            if (valor) {
              novas[pergunta.id] = String(valor);
            }
          }
        });

        return novas;
      });
    }
  }, [vistoriaData, perguntas]);

  const loadRespostas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sinistro_acompanhamento')
        .select('entrevista_respostas')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      if (error) throw error;

      if (data?.entrevista_respostas) {
        setRespostas(data.entrevista_respostas as Record<string, string>);
      }
    } catch (error) {
      console.error('Erro ao carregar respostas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);

      const { data: existing } = await supabase
        .from('sinistro_acompanhamento')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('sinistro_acompanhamento')
          .update({
            entrevista_respostas: respostas,
            entrevista_data: new Date().toISOString(),
          })
          .eq('atendimento_id', atendimentoId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sinistro_acompanhamento')
          .insert({
            atendimento_id: atendimentoId,
            entrevista_respostas: respostas,
            entrevista_data: new Date().toISOString(),
          });

        if (error) throw error;
      }

      toast.success('Análise salva com sucesso');
      onUpdate?.();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar análise');
    } finally {
      setSaving(false);
    }
  }, [atendimentoId, respostas, onUpdate]);

  const handleRespostaChange = (perguntaId: string, valor: string) => {
    setRespostas(prev => ({
      ...prev,
      [perguntaId]: valor
    }));
  };

  const renderPergunta = (pergunta: SinistroPergunta) => {
    const valor = respostas[pergunta.id] || '';

    return (
      <div key={pergunta.id} className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2">
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
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {(pergunta.opcoes as string[])
                .filter((opcao) => opcao && opcao.trim() !== '')
                .map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
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
          />
        )}

        {pergunta.tipo_campo === 'textarea' && (
          <Textarea
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            rows={3}
          />
        )}

        {pergunta.tipo_campo === 'date' && (
          <Input
            type="date"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
          />
        )}

        {pergunta.tipo_campo === 'valor' && (
          <Input
            type="number"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="0,00"
          />
        )}

        {pergunta.tipo_campo === 'mapa' && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Cole o link do Google Maps..."
          />
        )}
      </div>
    );
  };

  // Calcular estatísticas
  const perguntasRespondidas = Object.keys(respostas).filter(k => respostas[k]).length;
  const totalPerguntas = perguntas.length;
  const percentualPreenchido = totalPerguntas > 0 ? Math.round((perguntasRespondidas / totalPerguntas) * 100) : 0;
  
  const { total: pesoTotal, maxPossivel, percentual: percentualPeso, alertas } = calcularPesoRespostas(respostas, perguntas);

  // Determinar status baseado no parecer
  const parecer = respostas['parecer_analista'] || Object.values(respostas).find(v => 
    ['Aprovado', 'Negado', 'Sindicância', 'Necessário Analise Juridica', 'Pericia técnica'].includes(v)
  );

  const getParecerColor = () => {
    if (!parecer) return 'bg-muted';
    if (parecer === 'Aprovado') return 'bg-green-500';
    if (parecer === 'Negado') return 'bg-red-500';
    if (parecer === 'Sindicância') return 'bg-purple-500';
    if (parecer.includes('Juridica')) return 'bg-orange-500';
    if (parecer.includes('técnica')) return 'bg-blue-500';
    return 'bg-muted';
  };

  if (loading || loadingPerguntas) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!tipoFinal) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Tipo de sinistro não definido.</p>
        <p className="text-sm">Defina o tipo de sinistro para carregar as perguntas.</p>
      </div>
    );
  }

  if (perguntas.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhuma pergunta configurada para este tipo de sinistro.</p>
        <p className="text-sm">Configure as perguntas em Sinistros → Configurações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com progresso e pesos */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="outline">
            {perguntasRespondidas}/{totalPerguntas} respondidas ({percentualPreenchido}%)
          </Badge>
          
          {maxPossivel > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Pontuação:</span>
              <Badge variant={percentualPeso >= 70 ? 'default' : percentualPeso >= 40 ? 'secondary' : 'destructive'}>
                {pesoTotal}/{maxPossivel} ({percentualPeso.toFixed(0)}%)
              </Badge>
            </div>
          )}

          {parecer && (
            <Badge className={`${getParecerColor()} text-white`}>
              {parecer}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/pid?tab=comite')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Ir para Comitê PID
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-destructive font-medium mb-2">
              <AlertTriangle className="h-4 w-4" />
              Alertas Identificados
            </div>
            <ul className="text-sm space-y-1">
              {alertas.map((alerta, i) => (
                <li key={i}>{alerta}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Barra de progresso */}
      <Progress value={percentualPreenchido} className="h-2" />

      {/* Perguntas agrupadas por categoria */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-6">
          {categorias.map((categoria) => {
            const perguntasCategoria = categoria.perguntas || [];
            if (perguntasCategoria.length === 0) return null;

            return (
              <Card key={categoria.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{categoria.nome}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {perguntasCategoria.map(renderPergunta)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
