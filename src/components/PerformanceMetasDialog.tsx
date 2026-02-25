import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Target, TrendingUp, Clock, Activity, AlertTriangle, DollarSign, Shield, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

interface PerformanceMetasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Meta {
  id: string;
  nome: string;
  descricao: string | null;
  meta_minima_atendimentos: number;
  meta_taxa_conclusao: number;
  meta_tempo_medio_horas: number;
  ativo: boolean;
  alertas_inadimplencia: boolean;
  meta_inadimplencia_percentual: number;
  alertas_sinistralidade: boolean;
  meta_sinistralidade_percentual: number;
  alertas_retencao: boolean;
  meta_retencao_percentual: number;
  frequencia_verificacao: string;
  tipos_alerta_ativos: string[];
}

const TIPOS_ALERTA = [
  { id: 'volume_baixo', label: 'Volume Baixo de Atendimentos', icon: Activity },
  { id: 'taxa_conclusao_baixa', label: 'Taxa de Conclusão Baixa', icon: TrendingUp },
  { id: 'tempo_medio_alto', label: 'Tempo Médio Alto', icon: Clock },
];

export function PerformanceMetasDialog({ open, onOpenChange }: PerformanceMetasDialogProps) {
  const [loading, setLoading] = useState(false);
  const [verificandoAlertas, setVerificandoAlertas] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    meta_minima_atendimentos: 5,
    meta_taxa_conclusao: 70,
    meta_tempo_medio_horas: 48,
    alertas_inadimplencia: false,
    meta_inadimplencia_percentual: 30,
    alertas_sinistralidade: false,
    meta_sinistralidade_percentual: 50,
    alertas_retencao: false,
    meta_retencao_percentual: 80,
    frequencia_verificacao: 'diario',
    tipos_alerta_ativos: ['volume_baixo', 'taxa_conclusao_baixa', 'tempo_medio_alto'] as string[],
  });

  useEffect(() => {
    if (open) {
      loadMeta();
    }
  }, [open]);

  const loadMeta = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('performance_metas')
        .select('*')
        .eq('ativo', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setMeta(data as Meta);
        setFormData({
          nome: data.nome,
          descricao: data.descricao || '',
          meta_minima_atendimentos: data.meta_minima_atendimentos,
          meta_taxa_conclusao: data.meta_taxa_conclusao,
          meta_tempo_medio_horas: data.meta_tempo_medio_horas,
          alertas_inadimplencia: data.alertas_inadimplencia ?? false,
          meta_inadimplencia_percentual: data.meta_inadimplencia_percentual ?? 30,
          alertas_sinistralidade: data.alertas_sinistralidade ?? false,
          meta_sinistralidade_percentual: data.meta_sinistralidade_percentual ?? 50,
          alertas_retencao: data.alertas_retencao ?? false,
          meta_retencao_percentual: data.meta_retencao_percentual ?? 80,
          frequencia_verificacao: data.frequencia_verificacao ?? 'diario',
          tipos_alerta_ativos: data.tipos_alerta_ativos ?? ['volume_baixo', 'taxa_conclusao_baixa', 'tempo_medio_alto'],
        });
      }
    } catch (error) {
      console.error('Erro ao carregar metas:', error);
      toast.error('Erro ao carregar configurações de metas');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (meta) {
        const { error } = await supabase
          .from('performance_metas')
          .update(formData)
          .eq('id', meta.id);

        if (error) throw error;
        toast.success('Metas atualizadas com sucesso!');
      } else {
        const { error } = await supabase
          .from('performance_metas')
          .insert({ ...formData, ativo: true });

        if (error) throw error;
        toast.success('Metas criadas com sucesso!');
      }

      loadMeta();
    } catch (error) {
      console.error('Erro ao salvar metas:', error);
      toast.error('Erro ao salvar configurações de metas');
    } finally {
      setLoading(false);
    }
  };

  const handleVerificarAlertas = async () => {
    setVerificandoAlertas(true);
    try {
      const { data, error } = await supabase.functions.invoke('verificar-performance-alertas', {
        body: {},
      });

      if (error) throw error;

      toast.success(
        `Verificação concluída! ${data.alertasEnviados} alertas enviados de ${data.responsaveisAnalisados} responsáveis analisados.`
      );
    } catch (error) {
      console.error('Erro ao verificar alertas:', error);
      toast.error('Erro ao verificar alertas de performance');
    } finally {
      setVerificandoAlertas(false);
    }
  };

  const toggleTipoAlerta = (tipoId: string) => {
    setFormData(prev => ({
      ...prev,
      tipos_alerta_ativos: prev.tipos_alerta_ativos.includes(tipoId)
        ? prev.tipos_alerta_ativos.filter(t => t !== tipoId)
        : [...prev.tipos_alerta_ativos, tipoId],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Configuração de Metas e Alertas Críticos
          </DialogTitle>
          <DialogDescription>
            Defina metas de performance e configure alertas para dados críticos como inadimplência, sinistralidade e retenção.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Volume Mínimo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formData.meta_minima_atendimentos}</p>
                  <p className="text-xs text-muted-foreground mt-1">atendimentos/30 dias</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Taxa de Conclusão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formData.meta_taxa_conclusao}%</p>
                  <p className="text-xs text-muted-foreground mt-1">mínima esperada</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Tempo Médio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formData.meta_tempo_medio_horas}h</p>
                  <p className="text-xs text-muted-foreground mt-1">máximo por atendimento</p>
                </CardContent>
              </Card>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da Meta</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Meta Padrão"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descreva o objetivo desta meta..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volume">Volume Mínimo de Atendimentos</Label>
                  <Input
                    id="volume"
                    type="number"
                    min="1"
                    value={formData.meta_minima_atendimentos}
                    onChange={(e) =>
                      setFormData({ ...formData, meta_minima_atendimentos: parseInt(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Quantidade mínima em 30 dias</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taxa">Taxa de Conclusão Mínima (%)</Label>
                  <Input
                    id="taxa"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.meta_taxa_conclusao}
                    onChange={(e) =>
                      setFormData({ ...formData, meta_taxa_conclusao: parseInt(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Percentual de conclusão esperado</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tempo">Tempo Médio Máximo (horas)</Label>
                  <Input
                    id="tempo"
                    type="number"
                    min="1"
                    value={formData.meta_tempo_medio_horas}
                    onChange={(e) =>
                      setFormData({ ...formData, meta_tempo_medio_horas: parseInt(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">Tempo máximo por atendimento</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tipos de Alerta Ativos */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Tipos de Alerta de Performance
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {TIPOS_ALERTA.map((tipo) => (
                  <label
                    key={tipo.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.tipos_alerta_ativos.includes(tipo.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    <Checkbox
                      checked={formData.tipos_alerta_ativos.includes(tipo.id)}
                      onCheckedChange={() => toggleTipoAlerta(tipo.id)}
                    />
                    <div className="flex items-center gap-2">
                      <tipo.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{tipo.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Alertas de Dados Críticos */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5 text-destructive" />
                Alertas de Dados Críticos
              </h3>
              <p className="text-sm text-muted-foreground">
                Configure alertas automáticos para indicadores operacionais críticos.
              </p>

              {/* Inadimplência */}
              <Card className={formData.alertas_inadimplencia ? 'border-destructive/30' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <p className="font-medium">Alto Índice de Inadimplência</p>
                        <p className="text-xs text-muted-foreground">Alerta quando a inadimplência ultrapassar o limite</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.alertas_inadimplencia}
                      onCheckedChange={(checked) => setFormData({ ...formData, alertas_inadimplencia: checked })}
                    />
                  </div>
                  {formData.alertas_inadimplencia && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                      <Label className="text-sm whitespace-nowrap">Limite máximo:</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        className="w-24"
                        value={formData.meta_inadimplencia_percentual}
                        onChange={(e) =>
                          setFormData({ ...formData, meta_inadimplencia_percentual: parseInt(e.target.value) || 0 })
                        }
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sinistralidade */}
              <Card className={formData.alertas_sinistralidade ? 'border-amber-500/30' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="font-medium">Alta Sinistralidade</p>
                        <p className="text-xs text-muted-foreground">Alerta quando a sinistralidade ultrapassar o limite</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.alertas_sinistralidade}
                      onCheckedChange={(checked) => setFormData({ ...formData, alertas_sinistralidade: checked })}
                    />
                  </div>
                  {formData.alertas_sinistralidade && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                      <Label className="text-sm whitespace-nowrap">Limite máximo:</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        className="w-24"
                        value={formData.meta_sinistralidade_percentual}
                        onChange={(e) =>
                          setFormData({ ...formData, meta_sinistralidade_percentual: parseInt(e.target.value) || 0 })
                        }
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Retenção */}
              <Card className={formData.alertas_retencao ? 'border-blue-500/30' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium">Baixa Retenção</p>
                        <p className="text-xs text-muted-foreground">Alerta quando a taxa de retenção cair abaixo do mínimo</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.alertas_retencao}
                      onCheckedChange={(checked) => setFormData({ ...formData, alertas_retencao: checked })}
                    />
                  </div>
                  {formData.alertas_retencao && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                      <Label className="text-sm whitespace-nowrap">Mínimo esperado:</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        className="w-24"
                        value={formData.meta_retencao_percentual}
                        onChange={(e) =>
                          setFormData({ ...formData, meta_retencao_percentual: parseInt(e.target.value) || 0 })
                        }
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Frequência de Verificação */}
            <div className="space-y-3">
              <Label>Frequência de Verificação dos Alertas</Label>
              <select
                className="w-full border rounded-md p-2 bg-background text-foreground"
                value={formData.frequencia_verificacao}
                onChange={(e) => setFormData({ ...formData, frequencia_verificacao: e.target.value })}
              >
                <option value="diario">Diário</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Define com que frequência o sistema verifica os indicadores e envia alertas.
              </p>
            </div>

            {/* Info sobre alertas */}
            <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">ℹ️</Badge>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Como funcionam os alertas:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Alertas de performance são enviados para: responsável, líder, administrativo e superintendentes</li>
                      <li>Alertas de dados críticos (inadimplência, sinistralidade, retenção) são enviados para todos os superintendentes</li>
                      <li>A verificação ocorre conforme a frequência configurada acima</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={handleVerificarAlertas}
                disabled={verificandoAlertas || !meta}
              >
                {verificandoAlertas ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Verificar Alertas Agora'
                )}
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Configurações'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
