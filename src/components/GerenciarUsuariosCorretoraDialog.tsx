import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Shield, ShieldOff, Pencil, Check, X } from 'lucide-react';

interface GerenciarUsuariosCorretoraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corretoraId: string;
  corretoraNome: string;
}

const MODULOS_BI = [
  { id: 'indicadores', label: 'BI Indicadores', description: 'Dashboard principal com KPIs' },
  { id: 'eventos', label: 'Eventos', description: 'Módulo SGA de eventos' },
  { id: 'mgf', label: 'MGF', description: 'Módulo de gestão financeira' },
  { id: 'cobranca', label: 'Cobrança', description: 'Módulo de cobrança/inadimplência' },
  { id: 'estudo-base', label: 'Estudo de Base', description: 'Análise detalhada da base de veículos' },
  { id: 'acompanhamento-eventos', label: 'Acompanhamento de Eventos', description: 'Kanban de acompanhamento de eventos' },
];

export function GerenciarUsuariosCorretoraDialog({
  open,
  onOpenChange,
  corretoraId,
  corretoraNome,
}: GerenciarUsuariosCorretoraDialogProps) {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingModulos, setEditingModulos] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    email: '',
    senha: '',
    modulos_bi: ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base'] as string[],
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

  const handleModuloChange = (moduloId: string, checked: boolean) => {
    if (checked) {
      setFormData({ ...formData, modulos_bi: [...formData.modulos_bi, moduloId] });
    } else {
      setFormData({ ...formData, modulos_bi: formData.modulos_bi.filter(m => m !== moduloId) });
    }
  };

  const handleEditModuloChange = (moduloId: string, checked: boolean) => {
    if (checked) {
      setEditingModulos([...editingModulos, moduloId]);
    } else {
      setEditingModulos(editingModulos.filter(m => m !== moduloId));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.senha) {
      toast.error('Preencha email e senha');
      return;
    }

    if (formData.modulos_bi.length === 0) {
      toast.error('Selecione pelo menos um módulo BI');
      return;
    }

    setLoading(true);
    try {
      // Chamar edge function para criar usuário parceiro
      const { data, error } = await supabase.functions.invoke('criar-usuario-parceiro', {
        body: {
          email: formData.email,
          password: formData.senha,
          nome: formData.email.split('@')[0],
          corretoraId: corretoraId,
          modulos_bi: formData.modulos_bi,
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Usuário parceiro criado com sucesso!');
      setFormData({ email: '', senha: '', modulos_bi: ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base'] });
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

  const handleStartEdit = (usuario: any) => {
    setEditingId(usuario.id);
    setEditingModulos(usuario.modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingModulos([]);
  };

  const handleSaveEdit = async (id: string) => {
    if (editingModulos.length === 0) {
      toast.error('Selecione pelo menos um módulo BI');
      return;
    }

    try {
      const { error } = await supabase
        .from('corretora_usuarios')
        .update({ modulos_bi: editingModulos })
        .eq('id', id);

      if (error) throw error;

      toast.success('Permissões atualizadas');
      setEditingId(null);
      setEditingModulos([]);
      fetchUsuarios();
    } catch (error: any) {
      console.error('Erro ao atualizar permissões:', error);
      toast.error('Erro ao atualizar permissões');
    }
  };

  const getModulosBadges = (modulos: string[] | null) => {
    const modulosAtivos = modulos || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base'];
    return MODULOS_BI.filter(m => modulosAtivos.includes(m.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuários - {corretoraNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                <h3 className="font-semibold text-lg">Criar Novo Usuário BI</h3>
                <Badge variant="secondary" className="text-base px-3 py-1">
                  Associação: {corretoraNome}
                </Badge>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Atenção:</strong> O usuário será criado e automaticamente vinculado à associação <strong>{corretoraNome}</strong>. 
                  Ele poderá fazer login no portal BI usando o email e senha cadastrados.
                </p>
              </div>
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

            {/* Seleção de Módulos BI */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Módulos BI Permitidos</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MODULOS_BI.map((modulo) => (
                  <div
                    key={modulo.id}
                    className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-all ${
                      formData.modulos_bi.includes(modulo.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={(e) => {
                      // Avoid double-toggle when clicking the checkbox itself
                      if ((e.target as HTMLElement).closest('button[role="checkbox"]')) return;
                      handleModuloChange(modulo.id, !formData.modulos_bi.includes(modulo.id));
                    }}
                  >
                    <Checkbox
                      id={`modulo-${modulo.id}`}
                      checked={formData.modulos_bi.includes(modulo.id)}
                      onCheckedChange={(checked) => handleModuloChange(modulo.id, checked as boolean)}
                    />
                    <div className="space-y-1">
                      <label htmlFor={`modulo-${modulo.id}`} className="text-sm font-medium cursor-pointer">
                        {modulo.label}
                      </label>
                      <p className="text-xs text-muted-foreground">{modulo.description}</p>
                    </div>
                  </div>
                ))}
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
                Nenhum usuário cadastrado para esta associação
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Módulos BI</TableHead>
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
                        {editingId === usuario.id ? (
                          <div className="flex flex-wrap gap-2">
                            {MODULOS_BI.map((modulo) => (
                              <div
                                key={modulo.id}
                                className={`flex items-center gap-1 px-2 py-1 border rounded cursor-pointer text-xs ${
                                  editingModulos.includes(modulo.id)
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border'
                                }`}
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest('button[role="checkbox"]')) return;
                                  handleEditModuloChange(modulo.id, !editingModulos.includes(modulo.id));
                                }}
                              >
                                <Checkbox
                                  checked={editingModulos.includes(modulo.id)}
                                  onCheckedChange={(checked) => handleEditModuloChange(modulo.id, checked as boolean)}
                                  className="h-3 w-3"
                                />
                                <span>{modulo.label}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {getModulosBadges(usuario.modulos_bi).map((modulo) => (
                              <Badge key={modulo.id} variant="outline" className="text-xs">
                                {modulo.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
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
                        <div className="flex gap-1 justify-end">
                          {editingId === usuario.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSaveEdit(usuario.id)}
                                className="text-green-600"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEdit}
                                className="text-red-600"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStartEdit(usuario)}
                                title="Editar permissões"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleAtivo(usuario.id, usuario.ativo)}
                                title={usuario.ativo ? 'Desativar' : 'Ativar'}
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
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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
