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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Eye, Edit, Lock, Unlock, Shield } from 'lucide-react';

interface UserMenuPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: string;
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
  { id: 'pid', label: 'PID', icon: '📈' },
  { id: 'lancamentos_financeiros', label: 'Lançamentos Financeiros', icon: '💰' },
  { id: 'sinistros', label: 'Sinistros', icon: '🚨' },
];

export function UserMenuPermissionsDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userRole,
}: UserMenuPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<Record<string, Permission>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Verificar role do usuário logado
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      setCurrentUserRole(roleData?.role || '');

      // Verificar se o usuário alvo é superintendente
      setRequirePassword(userRole === 'superintendente');

      // Carregar permissões existentes
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('user_menu_permissions')
        .select('menu_item, pode_visualizar, pode_editar')
        .eq('user_id', userId);

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

      // Para menus sem permissões definidas, usar valores padrão (acesso total)
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

  const validatePassword = async (): Promise<boolean> => {
    if (!requirePassword) return true;
    
    if (!password) {
      toast.error('Digite a senha do superintendente para continuar');
      return false;
    }

    try {
      // Tentar fazer login com o email do usuário alvo e a senha fornecida
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

      if (!targetProfile) {
        toast.error('Perfil não encontrado');
        return false;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: targetProfile.email,
        password: password,
      });

      if (error) {
        toast.error('Senha incorreta');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Erro ao validar senha:', error);
      toast.error('Erro ao validar senha');
      return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (requirePassword) {
        const isValid = await validatePassword();
        if (!isValid) {
          setSaving(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Deletar todas as permissões existentes do usuário
      await supabase
        .from('user_menu_permissions')
        .delete()
        .eq('user_id', userId);

      // Inserir novas permissões (apenas as que não são padrão)
      const permissionsToInsert = Object.values(permissions)
        .filter((perm) => !perm.pode_visualizar || !perm.pode_editar)
        .map((perm) => ({
          user_id: userId,
          menu_item: perm.menu_item,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
          created_by: user.id,
        }));

      if (permissionsToInsert.length > 0) {
        const { error } = await supabase
          .from('user_menu_permissions')
          .insert(permissionsToInsert);

        if (error) throw error;
      }

      // Registrar log de alteração
      await supabase.from('permission_change_logs').insert({
        user_id: user.id,
        target_user_id: userId,
        acao: 'Atualização de permissões de menu',
        tipo_permissao: 'menu',
        detalhes: {
          total_menus: MENU_ITEMS.length,
          menus_restritos: permissionsToInsert.length,
        },
        authorized_by: user.id,
        senha_validada: requirePassword,
      });

      toast.success('Permissões atualizadas com sucesso');
      onOpenChange(false);
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
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Permissões de Menu - {userName}
            {requirePassword && (
              <Shield className="h-4 w-4 text-yellow-600" />
            )}
          </DialogTitle>
          <DialogDescription>
            Defina quais menus o usuário pode visualizar e editar.
            <div className="flex gap-4 mt-2 text-sm">
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {visualizarCount}/{MENU_ITEMS.length} visualizar
              </span>
              <span className="flex items-center gap-1">
                <Edit className="h-3.5 w-3.5" />
                {editarCount}/{MENU_ITEMS.length} editar
              </span>
            </div>
            {requirePassword && (
              <div className="mt-2 text-yellow-600 font-medium">
                ⚠️ Este é um usuário Superintendente - senha necessária
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {requirePassword && (
              <div className="mb-4 p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                <Label htmlFor="password" className="font-medium">
                  Senha do Superintendente
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite a senha para autorizar as alterações"
                  className="mt-2"
                />
              </div>
            )}

            <ScrollArea className="max-h-[50vh] pr-4">
              <div className="space-y-3">
                {MENU_ITEMS.map((item) => {
                  const perm = permissions[item.id] || {
                    menu_item: item.id,
                    pode_visualizar: true,
                    pode_editar: true,
                  };

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <span className="text-2xl">{item.icon}</span>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{item.label}</h4>
                      </div>

                      <div className="flex items-center gap-6">
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
                            className="text-sm font-normal cursor-pointer flex items-center gap-1.5"
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
                            className={`text-sm font-normal cursor-pointer flex items-center gap-1.5 ${
                              !perm.pode_visualizar
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Editar
                          </Label>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground min-w-[100px]">
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
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Permissões
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
