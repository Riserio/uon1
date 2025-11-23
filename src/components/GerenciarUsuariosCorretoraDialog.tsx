import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Shield, ShieldOff } from 'lucide-react';

interface GerenciarUsuariosCorretoraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corretoraId: string;
  corretoraNome: string;
}

export function GerenciarUsuariosCorretoraDialog({
  open,
  onOpenChange,
  corretoraId,
  corretoraNome,
}: GerenciarUsuariosCorretoraDialogProps) {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    senha: '',
  });

  useEffect(() => {
    if (open && corretoraId) {
      fetchUsuarios();
    }
  }, [open, corretoraId]);

  const fetchUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('corretora_usuarios')
        .select('*')
        .eq('corretora_id', corretoraId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsuarios(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar usuários:', error);
      toast.error('Erro ao carregar usuários');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.senha) {
      toast.error('Preencha email e senha');
      return;
    }

    setLoading(true);
    try {
      // Chamar edge function para criar usuário parceiro
      const { data, error } = await supabase.functions.invoke('criar-usuario-parceiro', {
        body: {
          email: formData.email,
          password: formData.senha,
          nome: formData.email.split('@')[0], // Usar parte do email como nome
          corretoraId: corretoraId,
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Usuário parceiro criado com sucesso! Ele pode fazer login com email e senha.');
      setFormData({ email: '', senha: '' });
      fetchUsuarios();
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      toast.error(error.message || 'Erro ao criar usuário');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAtivo = async (id: string, ativoAtual: boolean) => {
    try {
      const { error } = await supabase
        .from('corretora_usuarios')
        .update({ ativo: !ativoAtual })
        .eq('id', id);

      if (error) throw error;

      toast.success(ativoAtual ? 'Usuário desativado' : 'Usuário ativado');
      fetchUsuarios();
    } catch (error: any) {
      console.error('Erro ao atualizar usuário:', error);
      toast.error('Erro ao atualizar usuário');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este usuário?')) return;

    try {
      const { error } = await supabase
        .from('corretora_usuarios')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Usuário excluído');
      fetchUsuarios();
    } catch (error: any) {
      console.error('Erro ao excluir usuário:', error);
      toast.error('Erro ao excluir usuário');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuários - {corretoraNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                <h3 className="font-semibold text-lg">Criar Novo Usuário PID</h3>
                <Badge variant="secondary" className="text-base px-3 py-1">
                  Corretora: {corretoraNome}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground">
                O usuário será criado e automaticamente vinculado à corretora <strong>{corretoraNome}</strong>
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="usuario@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  value={formData.senha}
                  onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                  placeholder="Senha segura"
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Usuário
            </Button>
          </form>

          <div className="space-y-4">
            <h3 className="font-semibold">Usuários Cadastrados</h3>
            {usuarios.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum usuário cadastrado para esta corretora
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>TOTP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell className="font-medium">{usuario.email}</TableCell>
                      <TableCell>
                        <Badge variant={usuario.totp_configurado ? "default" : "secondary"}>
                          {usuario.totp_configurado ? 'Configurado' : 'Pendente'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={usuario.ativo ? "default" : "destructive"}>
                          {usuario.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(usuario.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleAtivo(usuario.id, usuario.ativo)}
                          >
                            {usuario.ativo ? (
                              <ShieldOff className="h-4 w-4" />
                            ) : (
                              <Shield className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(usuario.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
