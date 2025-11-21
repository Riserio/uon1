import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ClaimCard, Claim, ClaimTimeline } from '@/components/ClaimCard';
import { ClaimStats } from '@/components/ClaimStats';
import { ClaimFilters } from '@/components/ClaimFilters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, FileText, TrendingUp, Check } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useAuth } from '@/hooks/useAuth';
import { useFluxoPermissions } from '@/hooks/useFluxoPermissions';

interface StatusConfig {
  nome: string;
  cor: string;
  ordem: number;
}

export default function AcompanhamentoSinistrosInterno() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canViewFluxo, canEditFluxo } = useFluxoPermissions(user?.id);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusConfigs, setStatusConfigs] = useState<StatusConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null);
  const [editForm, setEditForm] = useState({
    custo_oficina: 0,
    custo_reparo: 0,
    custo_acordo: 0,
    custo_terceiros: 0,
    custo_perda_total: 0,
    custo_perda_parcial: 0,
    valor_franquia: 0,
    valor_indenizacao: 0,
  });

  useEffect(() => {
    loadData();

    // Subscribe to realtime changes
    const atendimentosChannel = supabase
      .channel('atendimentos_sinistros_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'atendimentos'
      }, () => {
        if (!editingClaim) {
          loadData();
        }
      })
      .subscribe();

    const vistoriasChannel = supabase
      .channel('vistorias_sinistros_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vistorias'
      }, () => {
        if (!editingClaim) {
          loadData();
        }
      })
      .subscribe();

    const historicoChannel = supabase
      .channel('historico_sinistros_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'atendimentos_historico'
      }, () => {
        if (!editingClaim) {
          loadData();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(atendimentosChannel);
      supabase.removeChannel(vistoriasChannel);
      supabase.removeChannel(historicoChannel);
    };
  }, [editingClaim]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Buscar configurações de status
      const { data: statusData, error: statusError } = await supabase
        .from('status_config')
        .select('nome, cor, ordem')
        .eq('ativo', true)
        .order('ordem');

      if (statusError) throw statusError;
      setStatusConfigs(statusData || []);

      // Buscar atendimentos (sinistros) com vistorias relacionadas
      const { data: atendimentosData, error: atendimentosError } = await supabase
        .from('atendimentos')
        .select(`
          id,
          numero,
          assunto,
          status,
          observacoes,
          created_at,
          updated_at,
          fluxo_id
        `)
        .order('created_at', { ascending: false });

      if (atendimentosError) throw atendimentosError;

      // Buscar vistorias relacionadas aos atendimentos
      const atendimentoIds = (atendimentosData || []).map(a => a.id);
      const { data: vistoriasData } = await supabase
        .from('vistorias')
        .select(`
          atendimento_id,
          veiculo_placa,
          custo_oficina,
          custo_reparo,
          custo_acordo,
          custo_terceiros,
          custo_perda_total,
          custo_perda_parcial,
          valor_franquia,
          valor_indenizacao
        `)
        .in('atendimento_id', atendimentoIds);

      // Buscar histórico para timeline
      const { data: historicoData } = await supabase
        .from('atendimentos_historico')
        .select('atendimento_id, acao, created_at, campos_alterados')
        .in('atendimento_id', atendimentoIds)
        .order('created_at', { ascending: true });

      // Transformar dados
      const claimsWithTimeline: Claim[] = (atendimentosData || [])
        .filter((atendimento) => {
          // Filtrar por permissões de fluxo
          return canViewFluxo(atendimento.fluxo_id);
        })
        .map((atendimento) => {
          const statusConfig = statusData?.find(s => s.nome === atendimento.status);
          const vistoria = vistoriasData?.find(v => v.atendimento_id === atendimento.id);
        
        // Criar timeline do histórico
        const historico = historicoData?.filter(h => h.atendimento_id === atendimento.id) || [];
        const timeline: ClaimTimeline[] = [
          {
            date: atendimento.created_at,
            title: 'Sinistro Registrado',
            description: 'Protocolo aberto automaticamente'
          },
          ...historico.map(h => ({
            date: h.created_at,
            title: h.acao,
            description: Array.isArray(h.campos_alterados) 
              ? `Campos alterados: ${h.campos_alterados.join(', ')}`
              : 'Atualização realizada'
          }))
        ];

        return {
          id: atendimento.id,
          numero: atendimento.numero,
          assunto: atendimento.assunto,
          created_at: atendimento.created_at,
          status: atendimento.status,
          statusColor: statusConfig?.cor || '#6b7280',
          observacoes: atendimento.observacoes,
          veiculo_placa: vistoria?.veiculo_placa,
          custo_oficina: vistoria?.custo_oficina,
          custo_reparo: vistoria?.custo_reparo,
          custo_acordo: vistoria?.custo_acordo,
          custo_terceiros: vistoria?.custo_terceiros,
          custo_perda_total: vistoria?.custo_perda_total,
          custo_perda_parcial: vistoria?.custo_perda_parcial,
          valor_franquia: vistoria?.valor_franquia,
          valor_indenizacao: vistoria?.valor_indenizacao,
          timeline
        };
      });

      setClaims(claimsWithTimeline);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar sinistros');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (claim: Claim) => {
    // Verificar se pode editar
    const atendimento = claims.find(c => c.id === claim.id);
    if (atendimento && !canEditFluxo((atendimento as any).fluxo_id)) {
      toast.error('Você não tem permissão para editar atendimentos deste fluxo');
      return;
    }
    setEditingClaim(claim);
    setEditForm({
      custo_oficina: claim.custo_oficina || 0,
      custo_reparo: claim.custo_reparo || 0,
      custo_acordo: claim.custo_acordo || 0,
      custo_terceiros: claim.custo_terceiros || 0,
      custo_perda_total: claim.custo_perda_total || 0,
      custo_perda_parcial: claim.custo_perda_parcial || 0,
      valor_franquia: claim.valor_franquia || 0,
      valor_indenizacao: claim.valor_indenizacao || 0,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingClaim) return;

    try {
      // Buscar vistoria relacionada ao atendimento
      const { data: vistoriaExistente, error: fetchError } = await supabase
        .from('vistorias')
        .select('id')
        .eq('atendimento_id', editingClaim.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (vistoriaExistente) {
        // Atualizar vistoria existente
        const { error } = await supabase
          .from('vistorias')
          .update(editForm)
          .eq('id', vistoriaExistente.id);

        if (error) throw error;
      } else {
        // Criar nova vistoria
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Usuário não autenticado');
          return;
        }

        const { error } = await supabase
          .from('vistorias')
          .insert({
            atendimento_id: editingClaim.id,
            created_by: user.id,
            tipo_vistoria: 'digital',
            tipo_abertura: 'interno',
            status: 'rascunho',
            ...editForm,
          });

        if (error) throw error;
      }

      toast.success('Sinistro atualizado com sucesso');
      setEditingClaim(null);
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar sinistro');
    }
  };

  const filteredClaims = claims.filter((claim) => {
    const matchesStatus = selectedStatus === 'all' || claim.status === selectedStatus;
    const matchesSearch =
      claim.numero.toString().includes(searchTerm.toLowerCase()) ||
      claim.assunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (claim.observacoes?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    return matchesStatus && matchesSearch;
  });

  const statusOptions = statusConfigs.map(config => ({
    value: config.nome,
    label: config.nome,
    color: config.cor
  }));

  const statusCounts = statusConfigs.map(config => ({
    status: config.nome,
    count: claims.filter(c => c.status === config.nome).length,
    color: config.cor
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => navigate(-1)}
                variant="ghost"
                size="icon"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="rounded-lg bg-primary p-2">
                <FileText className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Acompanhamento de Sinistros</h1>
                <p className="text-sm text-muted-foreground">Gerencie e acompanhe seus processos</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <ClaimStats claims={claims} statusCounts={statusCounts} />

            {/* Filters */}
            <ClaimFilters
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusOptions={statusOptions}
            />

            {/* Claims List */}
            <div className="space-y-4">
              {filteredClaims.length > 0 ? (
                filteredClaims.map((claim) => (
                  <ClaimCard 
                    key={claim.id} 
                    claim={claim} 
                    onEdit={handleEditClick}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-border bg-card p-12 text-center">
                  <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    Nenhum sinistro encontrado
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tente ajustar os filtros ou termo de busca
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={!!editingClaim} onOpenChange={() => setEditingClaim(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Custos e Valores</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Custo Oficina</Label>
                <CurrencyInput
                  value={editForm.custo_oficina}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, custo_oficina: values.floatValue || 0 })
                  }
                />
              </div>
              <div>
                <Label>Custo Reparo</Label>
                <CurrencyInput
                  value={editForm.custo_reparo}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, custo_reparo: values.floatValue || 0 })
                  }
                />
              </div>
              <div>
                <Label>Custo Acordo</Label>
                <CurrencyInput
                  value={editForm.custo_acordo}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, custo_acordo: values.floatValue || 0 })
                  }
                />
              </div>
              <div>
                <Label>Custo Terceiros</Label>
                <CurrencyInput
                  value={editForm.custo_terceiros}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, custo_terceiros: values.floatValue || 0 })
                  }
                />
              </div>
              <div>
                <Label>Custo Perda Total</Label>
                <CurrencyInput
                  value={editForm.custo_perda_total}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, custo_perda_total: values.floatValue || 0 })
                  }
                />
              </div>
              <div>
                <Label>Custo Perda Parcial</Label>
                <CurrencyInput
                  value={editForm.custo_perda_parcial}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, custo_perda_parcial: values.floatValue || 0 })
                  }
                />
              </div>
              <div>
                <Label>Valor Franquia</Label>
                <CurrencyInput
                  value={editForm.valor_franquia}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, valor_franquia: values.floatValue || 0 })
                  }
                />
              </div>
              <div>
                <Label>Valor Indenização</Label>
                <CurrencyInput
                  value={editForm.valor_indenizacao}
                  onValueChange={(values) => 
                    setEditForm({ ...editForm, valor_indenizacao: values.floatValue || 0 })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingClaim(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit}>
                <Check className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
