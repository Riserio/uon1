import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, Edit, Lock, Unlock, History } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "atendimentos", label: "Atendimentos", icon: "📋" },
  { id: "vistorias", label: "Vistorias", icon: "🔍" },
  { id: "acompanhamento", label: "Acompanhamento", icon: "📈" },
  { id: "corretoras", label: "Corretoras", icon: "🏢" },
  { id: "contatos", label: "Contatos", icon: "👥" },
  { id: "usuarios", label: "Usuários", icon: "👤" },
  { id: "equipes", label: "Equipes", icon: "👨‍👩‍👧‍👦" },
  { id: "gestao", label: "Gestão", icon: "⚙️" },
  { id: "uon1sign", label: "UON1SIGN", icon: "✍️" },
  { id: "documentos", label: "Documentos", icon: "📁" },
  { id: "comunicados", label: "Comunicados", icon: "📢" },
  { id: "mensagens", label: "Mensagens", icon: "💬" },
  { id: "agenda", label: "Agenda", icon: "📅" },
  { id: "emails", label: "E-mails", icon: "📧" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "performance", label: "Performance", icon: "🎯" },
  { id: "termos_aceite", label: "Termos de Aceite", icon: "📄" },
  { id: "pid", label: "BI - Indicadores", icon: "📈" },
  { id: "lancamentos_financeiros", label: "Lançamentos Financeiros", icon: "💰" },
  { id: "sinistros", label: "Sinistros", icon: "🚨" },
];

const ROLES = [
  { value: "superintendente", label: "Superintendente" },
  { value: "administrativo", label: "Administrativo" },
  { value: "lider", label: "Líder" },
  { value: "comercial", label: "Comercial" },
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

export function RoleMenuPermissionsDialog({ open, onOpenChange }: RoleMenuPermissionsDialogProps) {
  const [selectedRole, setSelectedRole] = useState<"superintendente" | "administrativo" | "lider" | "comercial">(
    "comercial",
  );
  const [permissions, setPermissions] = useState<Record<string, Permission>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [logs, setLogs] = useState<PermissionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("permissions");

  useEffect(() => {
    if (open) {
      loadPermissions();
      if (activeTab === "logs") {
        loadLogs();
      }
    }
  }, [open, selectedRole, activeTab]);

  useEffect(() => {
    const checkPermissions = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();

      const needsPassword = selectedRole === "superintendente" && roleData?.role !== "superintendente";
      setShowPasswordInput(needsPassword);
    };

    if (open) {
      checkPermissions();
    }
  }, [open, selectedRole]);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const { data: permissionsData, error: permissionsError } = await supabase
        .from("role_menu_permissions")
        .select("menu_item, pode_visualizar, pode_editar")
        .eq("role", selectedRole);

      if (permissionsError) throw permissionsError;

      const permissionsMap: Record<string, Permission> = {};
      (permissionsData || []).forEach((perm) => {
        permissionsMap[perm.menu_item] = {
          menu_item: perm.menu_item,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
        };
      });

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
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (menuItem: string, type: "visualizar" | "editar", value: boolean) => {
    setPermissions((prev) => {
      const current = prev[menuItem] || {
        menu_item: menuItem,
        pode_visualizar: true,
        pode_editar: true,
      };

      if (type === "visualizar" && !value) {
        return {
          ...prev,
          [menuItem]: {
            ...current,
            pode_visualizar: false,
            pode_editar: false,
          },
        };
      }

      if (type === "editar" && value) {
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
        .from("permission_change_logs")
        .select(
          `
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
        `,
        )
        .eq("tipo_permissao", "menu_role")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs((data as any) || []);
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
      toast.error("Erro ao carregar logs");
    } finally {
      setLogsLoading(false);
    }
  };

  const validatePassword = async (): Promise<boolean> => {
    if (!showPasswordInput) return true;

    if (!password) {
      toast.error("Digite a senha de um superintendente");
      return false;
    }

    try {
      const { data: superintendentes, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "superintendente");

      if (roleError) throw roleError;
      if (!superintendentes || superintendentes.length === 0) {
        toast.error("Nenhum superintendente encontrado");
        return false;
      }

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .in(
          "id",
          superintendentes.map((s) => s.user_id),
        );

      if (profileError) throw profileError;
      if (!profiles || profiles.length === 0) {
        toast.error("Perfis de superintendentes não encontrados");
        return false;
      }

      for (const profile of profiles) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: profile.email,
            password: password,
          });

          if (!error) {
            return true;
          }
        } catch {
          // continua tentando
        }
      }

      toast.error("Senha de superintendente inválida");
      return false;
    } catch (error) {
      console.error("Erro ao validar senha:", error);
      toast.error("Erro ao validar senha");
      return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isPasswordValid = await validatePassword();
      if (!isPasswordValid) {
        setSaving(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 🔹 Buscar permissões antigas para montar o diff (antes/depois)
      const { data: oldPerms, error: oldError } = await supabase
        .from("role_menu_permissions")
        .select("menu_item, pode_visualizar, pode_editar")
        .eq("role", selectedRole);

      if (oldError) throw oldError;

      const oldMap: Record<string, { pode_visualizar: boolean; pode_editar: boolean }> = {};
      (oldPerms || []).forEach((p) => {
        oldMap[p.menu_item] = {
          pode_visualizar: p.pode_visualizar,
          pode_editar: p.pode_editar,
        };
      });

      // Apaga permissões atuais do role
      await supabase.from("role_menu_permissions").delete().eq("role", selectedRole);

      // Permissões personalizadas (diferentes do padrão "tudo liberado")
      const permissionsToInsert = Object.values(permissions)
        .filter((perm) => !perm.pode_visualizar || !perm.pode_editar)
        .map((perm) => ({
          role: selectedRole,
          menu_item: perm.menu_item,
          pode_visualizar: perm.pode_visualizar,
          pode_editar: perm.pode_editar,
          created_by: user.id,
        }));

      if (permissionsToInsert.length > 0) {
        const { error } = await supabase.from("role_menu_permissions").insert(permissionsToInsert);
        if (error) throw error;
      }

      // 🔹 Montar lista detalhada de alterações (tanto inclusão quanto remoção de restrição)
      const alteracoesDetalhadas: any[] = [];

      MENU_ITEMS.forEach((item) => {
        const current = permissions[item.id] || {
          menu_item: item.id,
          pode_visualizar: true,
          pode_editar: true,
        };

        const oldRestricted = oldMap[item.id];
        const oldV = oldRestricted?.pode_visualizar ?? true;
        const oldE = oldRestricted?.pode_editar ?? true;

        const newV = current.pode_visualizar;
        const newE = current.pode_editar;

        if (oldV !== newV || oldE !== newE) {
          alteracoesDetalhadas.push({
            menu_id: item.id,
            menu_label: item.label,
            visualizar_anterior: oldV ? "permitido" : "removido",
            visualizar_novo: newV ? "permitido" : "removido",
            editar_anterior: oldE ? "permitido" : "removido",
            editar_novo: newE ? "permitido" : "removido",
          });
        }
      });

      // Registra log detalhado
      await supabase.from("permission_change_logs").insert({
        user_id: user.id,
        target_user_id: user.id,
        acao: `Atualização de permissões de menu para o perfil ${selectedRole}`,
        tipo_permissao: "menu_role",
        detalhes: {
          role: selectedRole,
          total_menus: MENU_ITEMS.length,
          menus_restritos: permissionsToInsert.length,
          alteracoes: alteracoesDetalhadas,
        },
        authorized_by: user.id,
        senha_validada: showPasswordInput,
      });

      toast.success(
        `Permissões do perfil ${ROLES.find((r) => r.value === selectedRole)?.label} atualizadas com sucesso`,
      );
      setPassword("");
      loadLogs();
    } catch (error) {
      console.error("Erro ao salvar permissões:", error);
      toast.error("Erro ao salvar permissões");
    } finally {
      setSaving(false);
    }
  };

  const visualizarCount = Object.values(permissions).filter((p) => p.pode_visualizar).length;
  const editarCount = Object.values(permissions).filter((p) => p.pode_editar).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Altura aumentada só na vertical */}
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="text-lg">Permissões de Menu por Perfil</DialogTitle>
          <DialogDescription className="text-sm">
            Configure quais menus cada perfil pode visualizar e editar.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 px-6">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0 mb-3">
            <TabsTrigger value="permissions" className="text-sm">
              Permissões
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2 text-sm">
              <History className="h-3.5 w-3.5" />
              Logs
            </TabsTrigger>
          </TabsList>

          {/* PERMISSÕES */}
          <TabsContent value="permissions" className="flex-1 min-h-0 flex-col space-y-3 data-[state=active]:flex">
            {/* Seletor de perfil */}
            <div className="grid w-full grid-cols-4 flex-shrink-0 h-9 gap-2">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() =>
                    setSelectedRole(role.value as "superintendente" | "administrativo" | "lider" | "comercial")
                  }
                  className={`text-xs rounded-full border flex items-center justify-center transition-colors px-4
                    ${
                      selectedRole === role.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                >
                  {role.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 flex-1">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 space-y-2">
                <div className="flex gap-3 text-xs text-muted-foreground flex-shrink-0">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {visualizarCount}/{MENU_ITEMS.length} ver
                  </span>
                  <span className="flex items-center gap-1">
                    <Edit className="h-3 w-3" />
                    {editarCount}/{MENU_ITEMS.length} editar
                  </span>
                </div>

                {/* wrapper da área rolável para ocupar o card todo */}
                <div className="flex-1 min-h-0">
                  <ScrollArea className="h-full border rounded-lg p-3">
                    <div className="space-y-1.5">
                      {MENU_ITEMS.map((item) => {
                        const perm = permissions[item.id] || {
                          menu_item: item.id,
                          pode_visualizar: true,
                          pode_editar: true,
                        };

                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 p-2 border rounded-md bg-card hover:bg-accent/50 transition-colors"
                          >
                            <span className="text-base flex-shrink-0">{item.icon}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-xs truncate">{item.label}</h4>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="flex items-center space-x-1.5">
                                <Checkbox
                                  id={`visualizar-${item.id}`}
                                  checked={perm.pode_visualizar}
                                  onCheckedChange={(checked) =>
                                    handleTogglePermission(item.id, "visualizar", checked as boolean)
                                  }
                                  className="h-4 w-4"
                                />
                                <Label
                                  htmlFor={`visualizar-${item.id}`}
                                  className="text-xs font-normal cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Eye className="h-3 w-3" />
                                  Ver
                                </Label>
                              </div>

                              <div className="flex items-center space-x-1.5">
                                <Checkbox
                                  id={`editar-${item.id}`}
                                  checked={perm.pode_editar}
                                  onCheckedChange={(checked) =>
                                    handleTogglePermission(item.id, "editar", checked as boolean)
                                  }
                                  disabled={!perm.pode_visualizar}
                                  className="h-4 w-4"
                                />
                                <Label
                                  htmlFor={`editar-${item.id}`}
                                  className={`text-xs font-normal cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                    !perm.pode_visualizar ? "opacity-50 cursor-not-allowed" : ""
                                  }`}
                                >
                                  <Edit className="h-3 w-3" />
                                  Editar
                                </Label>
                              </div>

                              <div className="text-xs text-muted-foreground min-w-[90px] flex-shrink-0">
                                {perm.pode_visualizar && perm.pode_editar ? (
                                  <span className="flex items-center gap-0.5 text-green-600">
                                    <Unlock className="h-3 w-3" />
                                    Total
                                  </span>
                                ) : perm.pode_visualizar ? (
                                  <span className="flex items-center gap-0.5 text-blue-600">
                                    <Eye className="h-3 w-3" />
                                    Leitura
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-0.5 text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    Bloqueado
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {showPasswordInput && (
                  <div className="flex-shrink-0 space-y-1.5 pt-2 border-t">
                    <Label htmlFor="password" className="text-xs font-medium">
                      Senha de Superintendente *
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Digite a senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">
                      Necessário para alterar permissões de superintendente.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 flex-shrink-0 pt-2 border-t">
                  <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* LOGS */}
          <TabsContent value="logs" className="flex-1 min-h-0 mt-3 flex-col data-[state=active]:flex">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8 flex-1">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0">
                  <ScrollArea className="h-full border rounded-lg p-3">
                    <div className="space-y-1.5">
                      {logs.length === 0 ? (
                        <p className="text-center text-muted-foreground text-sm py-8">Nenhuma alteração registrada</p>
                      ) : (
                        logs.map((log) => (
                          <div key={log.id} className="p-2.5 border rounded-md bg-card space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <p className="text-xs font-medium break-words">{log.acao}</p>
                                <p className="text-xs text-muted-foreground">
                                  Por: {log.authorized_profiles?.nome || "Usuário desconhecido"}
                                  {log.senha_validada && " (senha validada)"}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {format(new Date(log.created_at), "dd/MM 'às' HH:mm", {
                                  locale: ptBR,
                                })}
                              </span>
                            </div>

                            {log.detalhes && (
                              <div className="text-xs bg-muted/50 p-1.5 rounded space-y-1.5">
                                <p>
                                  Perfil: <span className="font-medium">{log.detalhes.role}</span>
                                </p>
                                <p>
                                  Menus alterados:{" "}
                                  <span className="font-medium">
                                    {log.detalhes.alteracoes?.length ?? log.detalhes.menus_restritos}
                                  </span>
                                </p>

                                {log.detalhes.alteracoes?.map((a: any, i: number) => (
                                  <div key={i} className="border rounded p-1 bg-white/40 space-y-0.5">
                                    <p className="font-medium">{a.menu_label}</p>
                                    <p>
                                      Visualizar:{" "}
                                      <span
                                        className={
                                          a.visualizar_anterior === "removido"
                                            ? "font-semibold text-red-600"
                                            : "font-semibold"
                                        }
                                      >
                                        {a.visualizar_anterior}
                                      </span>{" "}
                                      →{" "}
                                      <span
                                        className={
                                          a.visualizar_novo === "removido"
                                            ? "font-semibold text-red-600"
                                            : "font-semibold text-green-700"
                                        }
                                      >
                                        {a.visualizar_novo}
                                      </span>
                                    </p>
                                    <p>
                                      Editar:{" "}
                                      <span
                                        className={
                                          a.editar_anterior === "removido"
                                            ? "font-semibold text-red-600"
                                            : "font-semibold"
                                        }
                                      >
                                        {a.editar_anterior}
                                      </span>{" "}
                                      →{" "}
                                      <span
                                        className={
                                          a.editar_novo === "removido"
                                            ? "font-semibold text-red-600"
                                            : "font-semibold text-green-700"
                                        }
                                      >
                                        {a.editar_novo}
                                      </span>
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
