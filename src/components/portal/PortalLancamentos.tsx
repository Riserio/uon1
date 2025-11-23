import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function PortalLancamentos() {
  const { token } = usePortalAuth();
  const [loading, setLoading] = useState(true);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
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

  const fetchLancamentos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('portal-lancamentos', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;
      setLancamentos(data.data);
    } catch (error: any) {
      console.error('Error fetching lancamentos:', error);
      toast.error('Erro ao carregar lançamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLancamentos();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingId ? 'PUT' : 'POST';
      const { error } = await supabase.functions.invoke('portal-lancamentos', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: editingId ? { id: editingId, ...formData } : formData,
      });

      if (error) throw error;

      toast.success(editingId ? 'Lançamento atualizado' : 'Lançamento criado');
      setDialogOpen(false);
      setEditingId(null);
      setFormData({
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
      const { error } = await supabase.functions.invoke(`portal-lancamentos?id=${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
                  <Label htmlFor="competencia">Competência</Label>
                  <Input
                    id="competencia"
                    type="date"
                    value={formData.competencia}
                    onChange={(e) => setFormData({ ...formData, competencia: e.target.value })}
                    required
                  />
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
                  <Label htmlFor="premio_total">Prêmio Total</Label>
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
                    required
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
                  <TableCell colSpan={7} className="text-center">
                    Nenhum lançamento manual
                  </TableCell>
                </TableRow>
              ) : (
                lancamentos.map((lancamento) => (
                  <TableRow key={lancamento.id}>
                    <TableCell>
                      {new Date(lancamento.competencia).toLocaleDateString('pt-BR')}
                    </TableCell>
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
