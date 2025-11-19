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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Target, TrendingUp, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
}

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
        setMeta(data);
        setFormData({
          nome: data.nome,
          descricao: data.descricao || '',
          meta_minima_atendimentos: data.meta_minima_atendimentos,
          meta_taxa_conclusao: data.meta_taxa_conclusao,
          meta_tempo_medio_horas: data.meta_tempo_medio_horas,
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
        // Atualizar meta existente
        const { error } = await supabase
          .from('performance_metas')
          .update(formData)
          .eq('id', meta.id);

        if (error) throw error;
        toast.success('Metas atualizadas com sucesso!');
      } else {
        // Criar nova meta
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Configuração de Metas de Performance
          </DialogTitle>
          <DialogDescription>
            Defina as metas mínimas de performance. Alertas serão enviados automaticamente quando responsáveis estiverem abaixo das metas.
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
                      setFormData({ ...formData, meta_minima_atendimentos: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantidade mínima em 30 dias
                  </p>
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
                      setFormData({ ...formData, meta_taxa_conclusao: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Percentual de conclusão esperado
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tempo">Tempo Médio Máximo (horas)</Label>
                  <Input
                    id="tempo"
                    type="number"
                    min="1"
                    value={formData.meta_tempo_medio_horas}
                    onChange={(e) =>
                      setFormData({ ...formData, meta_tempo_medio_horas: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Tempo máximo por atendimento
                  </p>
                </div>
              </div>
            </div>

            {/* Info sobre alertas */}
            <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">ℹ️</Badge>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Como funcionam os alertas automáticos:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Os alertas são verificados periodicamente pelo sistema</li>
                      <li>Emails são enviados para: o responsável, seu líder, seu administrativo e todos os superintendentes</li>
                      <li>Alertas são gerados quando qualquer meta não é atingida no período de 30 dias</li>
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
                  'Salvar Metas'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
