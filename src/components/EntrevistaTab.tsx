import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PERGUNTAS_COMITE, CATEGORIAS_PERGUNTAS, ORDEM_CATEGORIAS, PerguntaComite } from '@/constants/perguntasComite';
import { Save, ExternalLink, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EntrevistaTabProps {
  atendimentoId: string;
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

export function EntrevistaTab({ atendimentoId, vistoriaData, onUpdate }: EntrevistaTabProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  useEffect(() => {
    loadRespostas();
  }, [atendimentoId]);

  // Auto-preencher campos da vistoria
  useEffect(() => {
    if (vistoriaData) {
      setRespostas(prev => {
        const novas = { ...prev };
        
        if (vistoriaData.cliente_nome && !novas.nome_associado) {
          novas.nome_associado = vistoriaData.cliente_nome;
        }
        if (vistoriaData.veiculo_placa && !novas.placa) {
          novas.placa = vistoriaData.veiculo_placa;
        }
        if (vistoriaData.veiculo_marca && vistoriaData.veiculo_modelo && !novas.marca_modelo) {
          novas.marca_modelo = `${vistoriaData.veiculo_marca} ${vistoriaData.veiculo_modelo}`;
        }
        if (vistoriaData.veiculo_ano && !novas.ano_fabricacao) {
          novas.ano_fabricacao = vistoriaData.veiculo_ano;
        }
        if (vistoriaData.tipo_sinistro && !novas.tipo_evento) {
          novas.tipo_evento = vistoriaData.tipo_sinistro;
        }
        if (vistoriaData.data_incidente && !novas.data_evento) {
          novas.data_evento = vistoriaData.data_incidente.split('T')[0];
        }

        return novas;
      });
    }
  }, [vistoriaData]);

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

  const handleSave = async () => {
    try {
      setSaving(true);

      // Verificar se já existe registro
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

      toast.success('Entrevista salva com sucesso');
      onUpdate?.();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar entrevista');
    } finally {
      setSaving(false);
    }
  };

  const handleRespostaChange = (perguntaId: string, valor: string) => {
    setRespostas(prev => ({
      ...prev,
      [perguntaId]: valor
    }));
  };

  const renderPergunta = (pergunta: PerguntaComite) => {
    const valor = respostas[pergunta.id] || '';

    return (
      <div key={pergunta.id} className="space-y-2">
        <Label className="text-sm font-medium">
          {pergunta.pergunta}
          {pergunta.obrigatoria && <span className="text-destructive ml-1">*</span>}
        </Label>

        {pergunta.tipo === 'select' && pergunta.opcoes && (
          <Select
            value={valor}
            onValueChange={(v) => handleRespostaChange(pergunta.id, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {pergunta.opcoes.map((opcao) => (
                <SelectItem key={opcao} value={opcao}>
                  {opcao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pergunta.tipo === 'text' && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
          />
        )}

        {pergunta.tipo === 'textarea' && (
          <Textarea
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            rows={3}
          />
        )}

        {pergunta.tipo === 'date' && (
          <Input
            type="date"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
          />
        )}
      </div>
    );
  };

  const perguntasRespondidas = Object.keys(respostas).filter(k => respostas[k]).length;
  const totalPerguntas = PERGUNTAS_COMITE.length;
  const percentualPreenchido = Math.round((perguntasRespondidas / totalPerguntas) * 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com progresso */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge variant="outline">
            {perguntasRespondidas}/{totalPerguntas} respondidas ({percentualPreenchido}%)
          </Badge>
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

      {/* Perguntas agrupadas por categoria */}
      <ScrollArea className="h-[600px] pr-4">
        <div className="space-y-6">
          {ORDEM_CATEGORIAS.map((categoria) => {
            const perguntas = CATEGORIAS_PERGUNTAS[categoria];
            if (!perguntas || perguntas.length === 0) return null;

            return (
              <Card key={categoria}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {categoria}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {perguntas.map(renderPergunta)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
