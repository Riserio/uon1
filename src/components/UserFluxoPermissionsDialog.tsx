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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Eye, Edit, Lock, Unlock } from 'lucide-react';

interface UserFluxoPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
}

interface Permission {
  fluxo_id: string;
  pode_visualizar: boolean;
  pode_editar: boolean;
}

export function UserFluxoPermissionsDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: UserFluxoPermissionsDialogProps) {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Permission>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar fluxos
      const { data: fluxosData, error: fluxosError } = await supabase
        .from('fluxos')
        .select('id, nome, descricao, cor')
        .eq('ativo', true)
        .order('ordem');

      if (fluxosError) throw fluxosError;

      // Carregar permissões existentes
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('user_fluxo_permissions')
        .select('fluxo_id, pode_visualizar, pode_editar')
        .eq('user_id', userId);

      if (permissionsError) throw permissionsError;

      setFluxos(fluxosData || []);

      // Criar mapa de permissões
      const permissionsMap: Record<string, Permission> = {};
      (permissionsData || []).forEach((perm) => {
        permissionsMap[perm.fluxo_id] = {
          fluxo_id: perm.fluxo_id,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
        };
      });

      // Para fluxos sem permissões definidas, usar valores padrão (acesso total)
      fluxosData?.forEach((fluxo) => {
        if (!permissionsMap[fluxo.id]) {
          permissionsMap[fluxo.id] = {
            fluxo_id: fluxo.id,
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
    fluxoId: string,
    type: 'visualizar' | 'editar',
    value: boolean
  ) => {
    setPermissions((prev) => {
      const current = prev[fluxoId] || {
        fluxo_id: fluxoId,
        pode_visualizar: true,
        pode_editar: true,
      };

      // Se desmarcar visualizar, desmarcar editar também
      if (type === 'visualizar' && !value) {
        return {
          ...prev,
          [fluxoId]: {
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
          [fluxoId]: {
            ...current,
            pode_visualizar: true,
            pode_editar: true,
          },
        };
      }

      return {
        ...prev,
        [fluxoId]: {
          ...current,
          [`pode_${type}`]: value,
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Deletar todas as permissões existentes do usuário
      await supabase
        .from('user_fluxo_permissions')
        .delete()
        .eq('user_id', userId);

      // Inserir novas permissões (apenas as que não são padrão)
      const permissionsToInsert = Object.values(permissions)
        .filter((perm) => !perm.pode_visualizar || !perm.pode_editar)
        .map((perm) => ({
          user_id: userId,
          fluxo_id: perm.fluxo_id,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
          created_by: user.id,
        }));

      if (permissionsToInsert.length > 0) {
        const { error } = await supabase
          .from('user_fluxo_permissions')
          .insert(permissionsToInsert);

        if (error) throw error;
      }

      toast.success('Permissões atualizadas com sucesso');
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar permissões:', error);
      toast.error('Erro ao salvar permissões');
    } finally {
      setSaving(false);
    }
  };

  const allFluxosCount = fluxos.length;
  const visualizarCount = Object.values(permissions).filter(
    (p) => p.pode_visualizar
  ).length;
  const editarCount = Object.values(permissions).filter((p) => p.pode_editar).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Permissões de Fluxo - {userName}</DialogTitle>
          <DialogDescription>
            Defina quais fluxos o usuário pode visualizar e editar.
            <div className="flex gap-4 mt-2 text-sm">
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {visualizarCount}/{allFluxosCount} visualizar
              </span>
              <span className="flex items-center gap-1">
                <Edit className="h-3.5 w-3.5" />
                {editarCount}/{allFluxosCount} editar
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[50vh] pr-4">
              <div className="space-y-4">
                {fluxos.map((fluxo) => {
                  const perm = permissions[fluxo.id] || {
                    fluxo_id: fluxo.id,
                    pode_visualizar: true,
                    pode_editar: true,
                  };

                  return (
                    <div
                      key={fluxo.id}
                      className="flex items-start gap-4 p-4 border rounded-lg bg-card"
                    >
                      <div
                        className="w-1 h-full rounded"
                        style={{ backgroundColor: fluxo.cor || '#3b82f6' }}
                      />
                      <div className="flex-1 space-y-3">
                        <div>
                          <h4 className="font-medium text-sm">{fluxo.nome}</h4>
                          {fluxo.descricao && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {fluxo.descricao}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`visualizar-${fluxo.id}`}
                              checked={perm.pode_visualizar}
                              onCheckedChange={(checked) =>
                                handleTogglePermission(
                                  fluxo.id,
                                  'visualizar',
                                  checked as boolean
                                )
                              }
                            />
                            <Label
                              htmlFor={`visualizar-${fluxo.id}`}
                              className="text-sm font-normal cursor-pointer flex items-center gap-1.5"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Visualizar
                            </Label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`editar-${fluxo.id}`}
                              checked={perm.pode_editar}
                              onCheckedChange={(checked) =>
                                handleTogglePermission(
                                  fluxo.id,
                                  'editar',
                                  checked as boolean
                                )
                              }
                              disabled={!perm.pode_visualizar}
                            />
                            <Label
                              htmlFor={`editar-${fluxo.id}`}
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
                      </div>

                      <div className="text-xs text-muted-foreground">
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
