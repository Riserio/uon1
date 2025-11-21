import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Eye, Edit, Lock, Unlock, History } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RoleMenuPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: string;
}

interface Permission {
  menu_item: string;
  pode_visualizar: boolean;
  pode_editar: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'atendimentos', label: 'Atendimentos', icon: '📋' },
  { id: 'vistorias', label: 'Vistorias', icon: '🔍' },
  { id: 'acompanhamento', label: 'Acompanhamento', icon: '📈' },
  { id: 'corretoras', label: 'Corretoras', icon: '🏢' },
  { id: 'contatos', label: 'Contatos', icon: '👥' },
  { id: 'usuarios', label: 'Usuários', icon: '👤' },
  { id: 'equipes', label: 'Equipes', icon: '👨‍👩‍👧‍👦' },
  { id: 'configuracoes', label: 'Configurações', icon: '⚙️' },
  { id: 'documentos', label: 'Documentos', icon: '📁' },
  { id: 'comunicados', label: 'Comunicados', icon: '📢' },
  { id: 'mensagens', label: 'Mensagens', icon: '💬' },
  { id: 'agenda', label: 'Agenda', icon: '📅' },
  { id: 'emails', label: 'E-mails', icon: '📧' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'performance', label: 'Performance', icon: '🎯' },
];

const ROLES = [
  { value: 'superintendente', label: 'Superintendente' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'lider', label: 'Líder' },
  { value: 'comercial', label: 'Comercial' },
];

interface PermissionLog {
  id: string;
  created_at: string;
  user_id: string;
  target_user_id: string;
  acao: string;
  tipo_permissao: string;
  detalhes: any;
  authorized_by: string;
  senha_validada: boolean;
  profiles?: {
    nome: string;
  };
  authorized_profiles?: {
    nome: string;
  };
}

export function RoleMenuPermissionsDialog({
  open,
  onOpenChange,
}: RoleMenuPermissionsDialogProps) {
  const [selectedRole, setSelectedRole] = useState<'superintendente' | 'administrativo' | 'lider' | 'comercial'>('comercial');
  const [permissions, setPermissions] = useState<Record<string, Permission>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [logs, setLogs] = useState<PermissionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('permissions');

  useEffect(() => {
    if (open) {
      loadPermissions();
      if (activeTab === 'logs') {
        loadLogs();
      }
    }
  }, [open, selectedRole, activeTab]);

  useEffect(() => {
    const checkPermissions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      // Só precisa de senha se estiver tentando alterar permissões de superintendente
      // e o usuário logado não for superintendente
      const needsPassword = selectedRole === 'superintendente' && roleData?.role !== 'superintendente';
      setShowPasswordInput(needsPassword);
    };

    if (open) {
      checkPermissions();
    }
  }, [open, selectedRole]);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      // Carregar permissões existentes para o role selecionado
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('role_menu_permissions')
        .select('menu_item, pode_visualizar, pode_editar')
        .eq('role', selectedRole);

      if (permissionsError) throw permissionsError;

      // Criar mapa de permissões
      const permissionsMap: Record<string, Permission> = {};
      (permissionsData || []).forEach((perm) => {
        permissionsMap[perm.menu_item] = {
          menu_item: perm.menu_item,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
        };
      });

      // Sempre exibir todos os menus, com permissões padrão (acesso total) se não definidas
      MENU_ITEMS.forEach((item) => {
        if (!permissionsMap[item.id]) {
          permissionsMap[item.id] = {
            menu_item: item.id,
            pode_visualizar: true,
            pode_editar: true,
          };
        }
      });

      setPermissions(permissionsMap);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar permissões');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (
    menuItem: string,
    type: 'visualizar' | 'editar',
    value: boolean
  ) => {
    setPermissions((prev) => {
      const current = prev[menuItem] || {
        menu_item: menuItem,
        pode_visualizar: true,
        pode_editar: true,
      };

      // Se desmarcar visualizar, desmarcar editar também
      if (type === 'visualizar' && !value) {
        return {
          ...prev,
          [menuItem]: {
            ...current,
            pode_visualizar: false,
            pode_editar: false,
          },
        };
      }

      // Se marcar editar, marcar visualizar também
      if (type === 'editar' && value) {
        return {
          ...prev,
          [menuItem]: {
            ...current,
            pode_visualizar: true,
            pode_editar: true,
          },
        };
      }

      return {
        ...prev,
        [menuItem]: {
          ...current,
          [`pode_${type}`]: value,
        },
      };
    });
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('permission_change_logs')
        .select(`
          id,
          created_at,
          user_id,
          target_user_id,
          acao,
          tipo_permissao,
          detalhes,
          authorized_by,
          senha_validada,
          profiles!permission_change_logs_user_id_fkey(nome),
          authorized_profiles:profiles!permission_change_logs_authorized_by_fkey(nome)
        `)
        .eq('tipo_permissao', 'menu_role')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data as any || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      toast.error('Erro ao carregar logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const validatePassword = async (): Promise<boolean> => {
    if (!showPasswordInput) return true;

    if (!password) {
      toast.error('Digite a senha de um superintendente');
      return false;
    }

    try {
      // Buscar todos os superintendentes
      const { data: superintendentes, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'superintendente');

      if (roleError) throw roleError;
      if (!superintendentes || superintendentes.length === 0) {
        toast.error('Nenhum superintendente encontrado');
        return false;
      }

      // Buscar emails dos superintendentes
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .in('id', superintendentes.map(s => s.user_id));

      if (profileError) throw profileError;
      if (!profiles || profiles.length === 0) {
        toast.error('Perfis de superintendentes não encontrados');
        return false;
      }

      // Tentar fazer login com cada email de superintendente
      for (const profile of profiles) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: profile.email,
            password: password,
          });

          if (!error) {
            // Senha válida! Fazer logout dessa sessão temporária
            return true;
          }
        } catch {
          // Continuar tentando outros emails
        }
      }

      toast.error('Senha de superintendente inválida');
      return false;
    } catch (error) {
      console.error('Erro ao validar senha:', error);
      toast.error('Erro ao validar senha');
      return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validar senha antes de prosseguir
      const isPasswordValid = await validatePassword();
      if (!isPasswordValid) {
        setSaving(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Deletar todas as permissões existentes do role
      await supabase
        .from('role_menu_permissions')
        .delete()
        .eq('role', selectedRole);

      // Inserir novas permissões (apenas as que não são padrão)
      const permissionsToInsert = Object.values(permissions)
        .filter((perm) => !perm.pode_visualizar || !perm.pode_editar)
        .map((perm) => ({
          role: selectedRole as 'superintendente' | 'administrativo' | 'lider' | 'comercial',
          menu_item: perm.menu_item,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
          created_by: user.id,
        }));

      if (permissionsToInsert.length > 0) {
        const { error } = await supabase
          .from('role_menu_permissions')
          .insert(permissionsToInsert);

        if (error) throw error;
      }

      // Registrar log de alteração
      await supabase.from('permission_change_logs').insert({
        user_id: user.id,
        target_user_id: user.id,
        acao: `Atualização de permissões de menu para o perfil ${selectedRole}`,
        tipo_permissao: 'menu_role',
        detalhes: {
          role: selectedRole,
          total_menus: MENU_ITEMS.length,
          menus_restritos: permissionsToInsert.length,
        },
        authorized_by: user.id,
        senha_validada: showPasswordInput,
      });

      toast.success(`Permissões do perfil ${ROLES.find(r => r.value === selectedRole)?.label} atualizadas com sucesso`);
      setPassword('');
      loadLogs(); // Recarregar logs após salvar
    } catch (error) {
      console.error('Erro ao salvar permissões:', error);
      toast.error('Erro ao salvar permissões');
    } finally {
      setSaving(false);
    }
  };

  const visualizarCount = Object.values(permissions).filter(
    (p) => p.pode_visualizar
  ).length;
  const editarCount = Object.values(permissions).filter((p) => p.pode_editar).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl">Permissões de Menu por Perfil</DialogTitle>
          <DialogDescription>
            Configure quais menus cada perfil pode visualizar e editar. As permissões são aplicadas a todos os usuários do perfil.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
            <TabsTrigger value="permissions">Permissões</TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Logs de Alterações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="permissions" className="flex-1 flex flex-col overflow-hidden mt-4">
            <Tabs 
              value={selectedRole} 
              onValueChange={(value) => setSelectedRole(value as 'superintendente' | 'administrativo' | 'lider' | 'comercial')} 
              className="flex-1 flex flex-col overflow-hidden"
            >
              <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
                {ROLES.map((role) => (
                  <TabsTrigger key={role.value} value={role.value}>
                    {role.label}
                  </TabsTrigger>
                ))}
              </TabsList>

          {ROLES.map((role) => (
            <TabsContent key={role.value} value={role.value} className="flex-1 flex flex-col overflow-hidden mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex gap-4 mb-3 text-sm text-muted-foreground flex-shrink-0">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {visualizarCount}/{MENU_ITEMS.length} podem visualizar
                    </span>
                    <span className="flex items-center gap-1">
                      <Edit className="h-3.5 w-3.5" />
                      {editarCount}/{MENU_ITEMS.length} podem editar
                    </span>
                  </div>

                  <ScrollArea className="flex-1 pr-3" type="always">
                    <div className="space-y-2 pb-2 pr-1">
                      {MENU_ITEMS.map((item) => {
                        const perm = permissions[item.id] || {
                          menu_item: item.id,
                          pode_visualizar: true,
                          pode_editar: true,
                        };

                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                          >
                            <span className="text-xl flex-shrink-0">{item.icon}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm truncate">{item.label}</h4>
                            </div>

                            <div className="flex items-center gap-4 flex-shrink-0">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`visualizar-${item.id}`}
                                  checked={perm.pode_visualizar}
                                  onCheckedChange={(checked) =>
                                    handleTogglePermission(
                                      item.id,
                                      'visualizar',
                                      checked as boolean
                                    )
                                  }
                                />
                                <Label
                                  htmlFor={`visualizar-${item.id}`}
                                  className="text-sm font-normal cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Ver
                                </Label>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`editar-${item.id}`}
                                  checked={perm.pode_editar}
                                  onCheckedChange={(checked) =>
                                    handleTogglePermission(
                                      item.id,
                                      'editar',
                                      checked as boolean
                                    )
                                  }
                                  disabled={!perm.pode_visualizar}
                                />
                                <Label
                                  htmlFor={`editar-${item.id}`}
                                  className={`text-sm font-normal cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                                    !perm.pode_visualizar
                                      ? 'opacity-50 cursor-not-allowed'
                                      : ''
                                  }`}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Editar
                                </Label>
                              </div>

                              <div className="text-xs text-muted-foreground min-w-[110px] flex-shrink-0">
                                {perm.pode_visualizar && perm.pode_editar ? (
                                  <span className="flex items-center gap-1 text-green-600">
                                    <Unlock className="h-3.5 w-3.5" />
                                    Acesso total
                                  </span>
                                ) : perm.pode_visualizar ? (
                                  <span className="flex items-center gap-1 text-blue-600">
                                    <Eye className="h-3.5 w-3.5" />
                                    Somente leitura
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Lock className="h-3.5 w-3.5" />
                                    Sem acesso
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {showPasswordInput && (
                    <div className="pt-3 border-t mt-3 flex-shrink-0">
                      <Label htmlFor="password" className="text-sm font-medium">
                        Senha de Superintendente *
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Digite a senha de um superintendente"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Para alterar permissões de superintendente, é necessário digitar a senha de um superintendente.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t mt-3 flex-shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar Permissões
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
          </TabsContent>

          <TabsContent value="logs" className="flex-1 flex flex-col overflow-hidden mt-4">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="flex-1 pr-3" type="always">
                <div className="space-y-2 pb-2 pr-1">
                  {logs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma alteração registrada
                    </p>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 border rounded-lg bg-card space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1 min-w-0">
                            <p className="text-sm font-medium break-words">{log.acao}</p>
                            <p className="text-xs text-muted-foreground">
                              Por:{' '}
                              {log.authorized_profiles?.nome || 'Usuário desconhecido'}
                              {log.senha_validada && ' (senha validada)'}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", {
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                        {log.detalhes && (
                          <div className="text-xs bg-muted/50 p-2 rounded space-y-0.5">
                            <p>Perfil: <span className="font-medium">{log.detalhes.role}</span></p>
                            <p>Total de menus: {log.detalhes.total_menus}</p>
                            <p>Menus com restrições: {log.detalhes.menus_restritos}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
