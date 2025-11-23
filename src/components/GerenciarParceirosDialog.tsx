import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corretoraId: string;
  corretoraNome: string;
}

export default function GerenciarParceirosDialog({ open, onOpenChange, corretoraId, corretoraNome }: Props) {
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [parceiros, setParceiros] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [acessoExclusivo, setAcessoExclusivo] = useState(true);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, corretoraId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar TODOS os usuários ativos do sistema
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (usersError) throw usersError;
      setUsuarios(usersData || []);

      // Carregar parceiros já vinculados
      const { data: parceirosData, error: parceirosError } = await supabase
        .from('corretora_usuarios')
        .select(`
          *,
          profiles(nome, email)
        `)
        .eq('corretora_id', corretoraId)
        .not('profile_id', 'is', null);

      if (parceirosError) throw parceirosError;
      setParceiros(parceirosData || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleVincular = async () => {
    if (!selectedUserId) {
      toast.error('Selecione um usuário');
      return;
    }

    try {
      setLoading(true);
      
      // Verificar se já existe
      const { data: existing } = await supabase
        .from('corretora_usuarios')
        .select('id')
        .eq('corretora_id', corretoraId)
        .eq('profile_id', selectedUserId)
        .single();

      if (existing) {
        toast.error('Usuário já vinculado a esta corretora');
        return;
      }

      // Obter dados do usuário
      const usuario = usuarios.find(u => u.id === selectedUserId);
      if (!usuario) return;

      // Criar vínculo
      const { error } = await supabase
        .from('corretora_usuarios')
        .insert({
          corretora_id: corretoraId,
          profile_id: selectedUserId,
          email: usuario.email,
          senha_hash: '', // Não será usado pois usa auth do sistema
          ativo: true,
          acesso_exclusivo_pid: acessoExclusivo,
          totp_configurado: false
        });

      if (error) throw error;

      toast.success('Parceiro vinculado com sucesso!');
      setSelectedUserId('');
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      toast.error('Erro ao vincular parceiro');
    } finally {
      setLoading(false);
    }
  };

  const handleRemover = async (id: string) => {
    if (!confirm('Deseja remover o vínculo deste parceiro?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('corretora_usuarios')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Parceiro removido com sucesso!');
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      toast.error('Erro ao remover parceiro');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    try {
      const { error } = await supabase
        .from('corretora_usuarios')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (error) throw error;

      toast.success(ativo ? 'Parceiro desativado' : 'Parceiro ativado');
      loadData();
    } catch (error: any) {
      console.error('Error:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Parceiros - {corretoraNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">Vincular Novo Parceiro</h3>
            
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Usuário Parceiro</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios
                      .filter(u => !parceiros.some(p => p.profile_id === u.id))
                      .map(usuario => (
                        <SelectItem key={usuario.id} value={usuario.id}>
                          {usuario.nome} ({usuario.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={acessoExclusivo}
                  onCheckedChange={setAcessoExclusivo}
                  id="acesso-exclusivo"
                />
                <Label htmlFor="acesso-exclusivo">
                  Acesso exclusivo ao PID (usuário não acessa sistema interno)
                </Label>
              </div>

              <Button onClick={handleVincular} disabled={loading || !selectedUserId}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Vincular Parceiro
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Parceiros Vinculados</h3>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Acesso Exclusivo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : parceiros.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum parceiro vinculado
                      </TableCell>
                    </TableRow>
                  ) : (
                    parceiros.map(parceiro => (
                      <TableRow key={parceiro.id}>
                        <TableCell>{parceiro.profiles?.nome}</TableCell>
                        <TableCell>{parceiro.profiles?.email}</TableCell>
                        <TableCell>
                          {parceiro.acesso_exclusivo_pid ? 'Sim' : 'Não'}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={parceiro.ativo}
                            onCheckedChange={() => handleToggleAtivo(parceiro.id, parceiro.ativo)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemover(parceiro.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
