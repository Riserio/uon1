import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function PortalLancamentos({ corretoraId }: { corretoraId?: string }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    corretora_id: '',
    competencia: new Date().toISOString().split('T')[0],
    produto: '',
    seguradora: '',
    segurado_nome: '',
    premio_total: '',
    percentual_comissao: '',
    valor_comissao: '',
    repasse_previsto: '',
    repasse_pago: '',
    status: 'ativo',
    observacoes: '',
  });

  useEffect(() => {
    if (corretoraId) {
      fetchLancamentos();
      // Se tem corretora selecionada, pré-preencher o formulário
      setFormData(prev => ({ ...prev, corretora_id: corretoraId }));
    }
    fetchCorretoras();
  }, [corretoraId]);

  const fetchCorretoras = async () => {
    try {
      const { data, error } = await supabase
        .from('corretoras')
        .select('id, nome')
        .order('nome');
      
      if (error) throw error;
      setCorretoras(data || []);
    } catch (error: any) {
      console.error('Error fetching corretoras:', error);
    }
  };

  const fetchLancamentos = async () => {
    if (!corretoraId) return; // Aguardar seleção de corretora
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('producao_financeira')
        .select('*, corretoras(nome)')
        .eq('tipo_origem', 'manual')
        .eq('corretora_id', corretoraId)
        .order('competencia', { ascending: false });

      if (error) throw error;
      setLancamentos(data || []);
    } catch (error: any) {
      console.error('Error fetching lancamentos:', error);
      toast.error('Erro ao carregar lançamentos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.corretora_id) {
      toast.error('Selecione uma corretora');
      return;
    }

    try {
      const dataToSave = {
        corretora_id: formData.corretora_id,
        competencia: formData.competencia,
        tipo_origem: 'manual' as const,
        produto: formData.produto || null,
        seguradora: formData.seguradora || null,
        segurado_nome: formData.segurado_nome || null,
        premio_total: parseFloat(formData.premio_total) || null,
        percentual_comissao: parseFloat(formData.percentual_comissao) || null,
        valor_comissao: parseFloat(formData.valor_comissao) || null,
        repasse_previsto: parseFloat(formData.repasse_previsto) || null,
        repasse_pago: parseFloat(formData.repasse_pago) || null,
        status: formData.status || null,
        observacoes: formData.observacoes || null,
        criado_por_usuario_id: user?.id || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('producao_financeira')
          .update(dataToSave)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('producao_financeira')
          .insert(dataToSave);

        if (error) throw error;
      }

      toast.success(editingId ? 'Lançamento atualizado' : 'Lançamento criado');
      setDialogOpen(false);
      setEditingId(null);
      setFormData({
        corretora_id: '',
        competencia: new Date().toISOString().split('T')[0],
        produto: '',
        seguradora: '',
        segurado_nome: '',
        premio_total: '',
        percentual_comissao: '',
        valor_comissao: '',
        repasse_previsto: '',
        repasse_pago: '',
        status: 'ativo',
        observacoes: '',
      });
      fetchLancamentos();
    } catch (error: any) {
      console.error('Error saving lancamento:', error);
      toast.error('Erro ao salvar lançamento');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este lançamento?')) return;

    try {
      const { error } = await supabase
        .from('producao_financeira')
        .delete()
        .eq('id', id)
        .eq('tipo_origem', 'manual');

      if (error) throw error;

      toast.success('Lançamento excluído');
      fetchLancamentos();
    } catch (error: any) {
      console.error('Error deleting lancamento:', error);
      toast.error('Erro ao excluir lançamento');
    }
  };

  const handleEdit = (lancamento: any) => {
    setEditingId(lancamento.id);
    setFormData({
      corretora_id: lancamento.corretora_id,
      competencia: lancamento.competencia,
      produto: lancamento.produto || '',
      seguradora: lancamento.seguradora || '',
      segurado_nome: lancamento.segurado_nome || '',
      premio_total: lancamento.premio_total || '',
      percentual_comissao: lancamento.percentual_comissao || '',
      valor_comissao: lancamento.valor_comissao || '',
      repasse_previsto: lancamento.repasse_previsto || '',
      repasse_pago: lancamento.repasse_pago || '',
      status: lancamento.status || 'ativo',
      observacoes: lancamento.observacoes || '',
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Lançamentos Manuais</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingId(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingId ? 'Editar' : 'Novo'} Lançamento Manual
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corretora">Corretora *</Label>
                  <Select
                    value={formData.corretora_id}
                    onValueChange={(value) => setFormData({ ...formData, corretora_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {corretoras.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="competencia">Competência *</Label>
                  <Input
                    id="competencia"
                    type="date"
                    value={formData.competencia}
                    onChange={(e) => setFormData({ ...formData, competencia: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="estornado">Estornado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="produto">Produto</Label>
                  <Input
                    id="produto"
                    value={formData.produto}
                    onChange={(e) => setFormData({ ...formData, produto: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seguradora">Seguradora</Label>
                  <Input
                    id="seguradora"
                    value={formData.seguradora}
                    onChange={(e) => setFormData({ ...formData, seguradora: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="segurado_nome">Segurado</Label>
                <Input
                  id="segurado_nome"
                  value={formData.segurado_nome}
                  onChange={(e) => setFormData({ ...formData, segurado_nome: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="premio_total">Prêmio Total *</Label>
                  <Input
                    id="premio_total"
                    type="number"
                    step="0.01"
                    value={formData.premio_total}
                    onChange={(e) => setFormData({ ...formData, premio_total: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="percentual_comissao">% Comissão</Label>
                  <Input
                    id="percentual_comissao"
                    type="number"
                    step="0.01"
                    value={formData.percentual_comissao}
                    onChange={(e) => setFormData({ ...formData, percentual_comissao: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valor_comissao">Comissão</Label>
                  <Input
                    id="valor_comissao"
                    type="number"
                    step="0.01"
                    value={formData.valor_comissao}
                    onChange={(e) => setFormData({ ...formData, valor_comissao: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repasse_previsto">Repasse Previsto</Label>
                  <Input
                    id="repasse_previsto"
                    type="number"
                    step="0.01"
                    value={formData.repasse_previsto}
                    onChange={(e) => setFormData({ ...formData, repasse_previsto: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repasse_pago">Repasse Pago</Label>
                  <Input
                    id="repasse_pago"
                    type="number"
                    step="0.01"
                    value={formData.repasse_pago}
                    onChange={(e) => setFormData({ ...formData, repasse_pago: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Salvar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12">Carregando...</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Corretora</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Segurado</TableHead>
                <TableHead className="text-right">Prêmio</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    Nenhum lançamento manual
                  </TableCell>
                </TableRow>
              ) : (
                lancamentos.map((lancamento) => (
                  <TableRow key={lancamento.id}>
                    <TableCell>
                      {new Date(lancamento.competencia).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>{lancamento.corretoras?.nome}</TableCell>
                    <TableCell>{lancamento.produto}</TableCell>
                    <TableCell>{lancamento.segurado_nome}</TableCell>
                    <TableCell className="text-right">
                      R$ {parseFloat(lancamento.premio_total || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      R$ {parseFloat(lancamento.valor_comissao || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          lancamento.status === 'ativo'
                            ? 'bg-green-100 text-green-800'
                            : lancamento.status === 'cancelado'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {lancamento.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(lancamento)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(lancamento.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
