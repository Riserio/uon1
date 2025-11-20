import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function Contratos() {
  const [contratos, setContratos] = useState<any[]>([]);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContrato, setEditingContrato] = useState<any>(null);
  const [formData, setFormData] = useState({
    corretora_id: '',
    numero_contrato: '',
    descricao: '',
    data_inicio: '',
    data_fim: '',
    valor_mensal: '',
    ativo: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contratosRes, corretorasRes] = await Promise.all([
        supabase
          .from('contratos')
          .select('*, corretoras(nome)')
          .order('created_at', { ascending: false }),
        supabase
          .from('corretoras')
          .select('id, nome')
          .order('nome'),
      ]);

      if (contratosRes.data) setContratos(contratosRes.data);
      if (corretorasRes.data) setCorretoras(corretorasRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const contratoData = {
        ...formData,
        valor_mensal: formData.valor_mensal ? parseFloat(formData.valor_mensal) : null,
        created_by: user.id,
      };

      if (editingContrato) {
        const { error } = await supabase
          .from('contratos')
          .update(contratoData)
          .eq('id', editingContrato.id);

        if (error) throw error;
        toast.success('Contrato atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('contratos')
          .insert(contratoData);

        if (error) throw error;
        toast.success('Contrato criado com sucesso!');
      }

      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Erro ao salvar contrato:', error);
      toast.error('Erro ao salvar contrato');
    }
  };

  const handleEdit = (contrato: any) => {
    setEditingContrato(contrato);
    setFormData({
      corretora_id: contrato.corretora_id || '',
      numero_contrato: contrato.numero_contrato,
      descricao: contrato.descricao || '',
      data_inicio: contrato.data_inicio || '',
      data_fim: contrato.data_fim || '',
      valor_mensal: contrato.valor_mensal?.toString() || '',
      ativo: contrato.ativo,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este contrato?')) return;

    try {
      const { error } = await supabase
        .from('contratos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Contrato excluído com sucesso!');
      loadData();
    } catch (error) {
      console.error('Erro ao excluir contrato:', error);
      toast.error('Erro ao excluir contrato');
    }
  };

  const resetForm = () => {
    setFormData({
      corretora_id: '',
      numero_contrato: '',
      descricao: '',
      data_inicio: '',
      data_fim: '',
      valor_mensal: '',
      ativo: true,
    });
    setEditingContrato(null);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Contratos
        </h1>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Contrato
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Carregando contratos...</p>
          </div>
        </div>
      ) : contratos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum contrato cadastrado</h3>
            <p className="text-muted-foreground mb-6">Comece criando seu primeiro contrato</p>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Contrato
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contratos.map((contrato) => (
            <Card key={contrato.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="text-lg">{contrato.numero_contrato}</span>
                  {contrato.ativo ? (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Ativo</span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">Inativo</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Corretora</p>
                  <p className="font-semibold">{contrato.corretoras?.nome || 'N/A'}</p>
                </div>
                {contrato.descricao && (
                  <div>
                    <p className="text-sm text-muted-foreground">Descrição</p>
                    <p className="text-sm">{contrato.descricao}</p>
                  </div>
                )}
                {contrato.data_inicio && (
                  <div>
                    <p className="text-sm text-muted-foreground">Período</p>
                    <p className="text-sm">
                      {format(new Date(contrato.data_inicio), 'dd/MM/yyyy')}
                      {contrato.data_fim && ` - ${format(new Date(contrato.data_fim), 'dd/MM/yyyy')}`}
                    </p>
                  </div>
                )}
                {contrato.valor_mensal && (
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Mensal</p>
                    <p className="text-sm font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contrato.valor_mensal)}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(contrato)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(contrato.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingContrato ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Corretora *</Label>
                <Select
                  required
                  value={formData.corretora_id}
                  onValueChange={(value) => setFormData({ ...formData, corretora_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a corretora" />
                  </SelectTrigger>
                  <SelectContent>
                    {corretoras.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Número do Contrato *</Label>
                <Input
                  required
                  value={formData.numero_contrato}
                  onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })}
                  placeholder="Ex: CT-2024-001"
                />
              </div>

              <div>
                <Label>Data Início</Label>
                <Input
                  type="date"
                  value={formData.data_inicio}
                  onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                />
              </div>

              <div>
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={formData.data_fim}
                  onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                />
              </div>

              <div>
                <Label>Valor Mensal</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_mensal}
                  onChange={(e) => setFormData({ ...formData, valor_mensal: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={formData.ativo.toString()}
                  onValueChange={(value) => setFormData({ ...formData, ativo: value === 'true' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Descreva os detalhes do contrato..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingContrato ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}