import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ConfiguracaoStatusPublico() {
  const navigate = useNavigate();
  const [fluxos, setFluxos] = useState<any[]>([]);
  const [selectedFluxoId, setSelectedFluxoId] = useState<string>('');
  const [statusConfig, setStatusConfig] = useState<any[]>([]);
  const [statusPublicos, setStatusPublicos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFluxos();
  }, []);

  useEffect(() => {
    if (selectedFluxoId) {
      loadStatusConfig();
      loadStatusPublicos();
    }
  }, [selectedFluxoId]);

  const loadFluxos = async () => {
    const { data } = await supabase
      .from('fluxos')
      .select('*')
      .eq('ativo', true)
      .order('ordem');
    
    setFluxos(data || []);
  };

  const loadStatusConfig = async () => {
    const { data } = await supabase
      .from('status_config')
      .select('*')
      .eq('fluxo_id', selectedFluxoId)
      .eq('ativo', true)
      .order('ordem');
    
    setStatusConfig(data || []);
  };

  const loadStatusPublicos = async () => {
    const { data } = await supabase
      .from('status_publicos_config')
      .select('*')
      .eq('fluxo_id', selectedFluxoId)
      .order('ordem_exibicao');
    
    setStatusPublicos(data || []);
  };

  const handleAddStatus = async (statusNome: string) => {
    // Verificar se já existe
    const exists = statusPublicos.find(s => s.status_nome === statusNome);
    if (exists) {
      toast.error('Este status já foi adicionado');
      return;
    }

    const newStatus = {
      fluxo_id: selectedFluxoId,
      status_nome: statusNome,
      visivel_publico: true,
      ordem_exibicao: statusPublicos.length,
      descricao_publica: ''
    };

    const { error } = await supabase
      .from('status_publicos_config')
      .insert([newStatus]);

    if (error) {
      toast.error('Erro ao adicionar status');
      return;
    }

    toast.success('Status adicionado');
    loadStatusPublicos();
  };

  const handleUpdateStatus = async (id: string, updates: any) => {
    const { error } = await supabase
      .from('status_publicos_config')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar status');
      return;
    }

    toast.success('Status atualizado');
    loadStatusPublicos();
  };

  const handleDeleteStatus = async (id: string) => {
    const { error } = await supabase
      .from('status_publicos_config')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao remover status');
      return;
    }

    toast.success('Status removido');
    loadStatusPublicos();
  };

  const handleSaveAll = async () => {
    setLoading(true);
    try {
      // Reordenar
      const updates = statusPublicos.map((status, idx) => ({
        ...status,
        ordem_exibicao: idx
      }));

      for (const status of updates) {
        await supabase
          .from('status_publicos_config')
          .update({ ordem_exibicao: status.ordem_exibicao })
          .eq('id', status.id);
      }

      toast.success('Configurações salvas com sucesso');
      navigate('/atendimentos');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/atendimentos')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">Configuração de Status Públicos</h1>
            <p className="text-muted-foreground mt-1">
              Configure quais status serão exibidos na página de acompanhamento de sinistro
            </p>
          </div>
          <Button onClick={handleSaveAll} disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
        </div>

        {/* Seletor de Fluxo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Selecione o Fluxo</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedFluxoId} onValueChange={setSelectedFluxoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um fluxo" />
              </SelectTrigger>
              <SelectContent>
                {fluxos.map((fluxo) => (
                  <SelectItem key={fluxo.id} value={fluxo.id}>
                    {fluxo.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedFluxoId && (
          <>
            {/* Adicionar Status */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Adicionar Status à Visualização Pública</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {statusConfig
                    .filter(sc => !statusPublicos.find(sp => sp.status_nome === sc.nome))
                    .map((status) => (
                      <Button
                        key={status.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddStatus(status.nome)}
                      >
                        <Plus className="mr-2 h-3 w-3" />
                        {status.nome}
                      </Button>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Lista de Status Públicos */}
            <Card>
              <CardHeader>
                <CardTitle>Status Visíveis ao Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {statusPublicos.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum status configurado ainda. Adicione status acima.
                  </p>
                ) : (
                  statusPublicos.map((status) => (
                    <div key={status.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{status.status_nome}</h3>
                          <Switch
                            checked={status.visivel_publico}
                            onCheckedChange={(checked) =>
                              handleUpdateStatus(status.id, { visivel_publico: checked })
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {status.visivel_publico ? 'Visível' : 'Oculto'}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteStatus(status.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div>
                        <Label>Descrição para o Cliente</Label>
                        <Textarea
                          value={status.descricao_publica || ''}
                          onChange={(e) =>
                            handleUpdateStatus(status.id, { descricao_publica: e.target.value })
                          }
                          placeholder="Ex: Seu sinistro está em análise pela seguradora"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
