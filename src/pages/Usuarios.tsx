import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErroBanco } from "@/lib/dbErrors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Pencil,
  MoreHorizontal,
  CheckCircle,
  Search,
  Copy,
  RefreshCw,
  Users as UsersIcon,
  Network,
  UserPlus,
  UsersRound,
  Trash2,
  Key,
  ChevronLeft,
  ChevronRight,
  Lock,
  Shield,
  Briefcase,
  UserCircle,
  ChevronDown,
  RotateCcw,
  UserX,
  Plus,
  Mail,

} from "lucide-react";
import { UserFluxoPermissionsDialog } from "@/components/UserFluxoPermissionsDialog";
import { UserMenuPermissionsDialog } from "@/components/UserMenuPermissionsDialog";
import { RoleMenuPermissionsDialog } from "@/components/RoleMenuPermissionsDialog";
import { useAuth } from "@/hooks/useAuth";
import { generateSecurePassword } from "@/lib/validationSchemas";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import CargosPermissoesTab from "@/components/CargosPermissoesTab";
import { UsuarioFormDialog } from "@/components/usuarios/UsuarioFormDialog";
import type { Equipe, Profile, RoleType } from "@/components/usuarios/tipos";

interface UserRole {
  user_id: string;
  role: RoleType | "admin";
}


interface UserLog {
  id: string;
  action: string;
  changes?: any;
  target_user_id: string;
  user_id: string;
  created_at: string;
}

export default function Usuarios() {
  const { user, userRole } = useAuth();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pendingProfiles, setPendingProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [cargosCustom, setCargosCustom] = useState<{ id: string; nome: string; cor?: string | null; descricao?: string | null; ativo?: boolean }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Profile | null>(null);
  const [approvingItem, setApprovingItem] = useState<Profile | null>(null);
  const [formData, setFormData] = useState<Partial<Profile>>({});
  const [approvalRole, setApprovalRole] = useState<string>("");
  const [lideres, setLideres] = useState<Profile[]>([]);
  const [administrativos, setAdministrativos] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [userEquipes, setUserEquipes] = useState<Record<string, string[]>>({});
  const [equipeDialogOpen, setEquipeDialogOpen] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState<Equipe | null>(null);
  const [equipeFormData, setEquipeFormData] = useState<Partial<Equipe>>({});
  const [selectedEquipeLideres, setSelectedEquipeLideres] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("lista");
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState<{
    profile: Profile | null;
    password: string;
  }>({
    profile: null,
    password: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingItemsPerPage, setPendingItemsPerPage] = useState(10);
  const [fluxoPermissionsDialogOpen, setFluxoPermissionsDialogOpen] = useState(false);
  const [menuPermissionsDialogOpen, setMenuPermissionsDialogOpen] = useState(false);
  const [roleMenuPermissionsDialogOpen, setRoleMenuPermissionsDialogOpen] = useState(false);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<{
    id: string;
    nome: string;
    role: string;
  } | null>(null);

  const [logs, setLogs] = useState<UserLog[]>([]);

  const filteredProfiles = useMemo(() => {
    const ativos = profiles.filter((p) => p.ativo !== false && p.status !== 'inativo');
    if (!searchTerm) return ativos;
    const term = searchTerm.toLowerCase();
    return ativos.filter(
      (p) =>
        p.nome.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.telefone?.toLowerCase().includes(term) ||
        p.cargo?.toLowerCase().includes(term),
    );
  }, [profiles, searchTerm]);

  const inactiveProfiles = useMemo(() => {
    const inativos = profiles.filter((p) => p.ativo === false || p.status === 'inativo');
    if (!searchTerm) return inativos;
    const term = searchTerm.toLowerCase();
    return inativos.filter(
      (p) =>
        p.nome.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.telefone?.toLowerCase().includes(term) ||
        p.cargo?.toLowerCase().includes(term),
    );
  }, [profiles, searchTerm]);

  const paginatedProfiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredProfiles.slice(startIndex, endIndex);
  }, [filteredProfiles, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredProfiles.length / itemsPerPage);

  const paginatedPendingProfiles = useMemo(() => {
    const startIndex = (pendingPage - 1) * pendingItemsPerPage;
    const endIndex = startIndex + pendingItemsPerPage;
    return pendingProfiles.slice(startIndex, endIndex);
  }, [pendingProfiles, pendingPage, pendingItemsPerPage]);

  const totalPendingPages = Math.ceil(pendingProfiles.length / pendingItemsPerPage);

  const logUserAction = async (action: string, targetUserId: string, changes?: any) => {
    try {
      if (!user) return;
      
      const { error } = await supabase.functions.invoke('log-user-change', {
        body: { targetUserId, action, changes }
      });
      
      if (error) {
        console.error("Erro ao registrar log:", error);
      }
      
      if (activeTab === "logs") {
        fetchLogs();
      }
    } catch (err) {
      console.error("Erro ao registrar log:", err);
    }
  };

  const fetchProfiles = async () => {
    // usuários ativos/inativos
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("status", ["ativo", "inativo"])
      .order("nome");

    if (error) {
      toast.error("Erro ao carregar usuários");
    } else {
      setProfiles(data || []);
    }

    // pendentes ou sem status (novos da tela de login)
    const { data: pending, error: pendingError } = await supabase
      .from("profiles")
      .select("*")
      .or("status.eq.pendente,status.is.null")
      .order("created_at", { ascending: false });

    if (pendingError) {
      console.error("Erro ao carregar usuários pendentes:", pendingError);
      toast.error("Erro ao carregar usuários pendentes");
    } else {
      console.log("Usuários pendentes carregados:", pending);
      setPendingProfiles(pending || []);
    }
  };

  const fetchUserRoles = async () => {
    const { data, error } = await supabase.from("user_roles").select("user_id, role");
    if (error) {
      toast.error("Erro ao carregar funções");
    } else {
      const rolesMap: Record<string, string> = {};
      data?.forEach((item: UserRole) => {
        rolesMap[item.user_id] = item.role;
      });
      setUserRoles(rolesMap);
    }

    const { data: equipesData, error: equipesError } = await supabase
      .from("equipe_lideres")
      .select("lider_id, equipe_id");
    if (!equipesError && equipesData) {
      const equipesMap: Record<string, string[]> = {};
      equipesData.forEach((item: any) => {
        if (!equipesMap[item.lider_id]) {
          equipesMap[item.lider_id] = [];
        }
        equipesMap[item.lider_id].push(item.equipe_id);
      });
      setUserEquipes(equipesMap);
    }
  };

  const fetchEquipes = async () => {
    let query = supabase.from("equipes").select("*");
    if (userRole === "lider" && user) {
      query = query.eq("lider_id", user?.id);
    }
    const { data, error } = await query.order("nome");
    if (error) {
      toast.error("Erro ao carregar equipes");
      return;
    }

    const equipesComLideres = await Promise.all(
      (data || []).map(async (equipe) => {
        const { data: lideresData } = await supabase
          .from("equipe_lideres")
          .select("lider_id")
          .eq("equipe_id", equipe.id);
        return {
          ...equipe,
          lideres: lideresData?.map((l) => l.lider_id) || [],
        };
      }),
    );
    setEquipes(equipesComLideres);
  };

  const fetchLideres = async () => {
    const { data: liderRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "lider");
    if (rolesError) {
      console.error("Erro ao carregar líderes:", rolesError);
      return;
    }
    const liderIds = liderRoles.map((r) => r.user_id);
    if (liderIds.length === 0) {
      setLideres([]);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("id", liderIds)
      .eq("status", "ativo")
      .order("nome");
    if (error) {
      console.error("Erro ao carregar perfis de líderes:", error);
    } else {
      setLideres(data || []);
    }
  };

  const fetchAdministrativos = async () => {
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["administrativo", "admin", "superintendente"]);
    if (rolesError) {
      console.error("Erro ao carregar administrativos:", rolesError);
      return;
    }
    const adminIds = adminRoles.map((r) => r.user_id);
    if (adminIds.length === 0) {
      setAdministrativos([]);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("id", adminIds)
      .eq("status", "ativo")
      .order("nome");
    if (error) {
      console.error("Erro ao carregar perfis de administrativos:", error);
    } else {
      setAdministrativos(data || []);
    }
  };

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("user_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("Erro ao carregar logs:", error);
        return;
      }
      setLogs(data || []);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
    }
  };

  const fetchCargosCustom = async () => {
    const { data } = await supabase
      .from("cargos")
      .select("id, nome, cor, descricao, ativo")
      .eq("ativo", true)
      .order("nome");
    setCargosCustom((data as any) || []);
    return (data as any) || [];
  };

  useEffect(() => {
    if (userRole === "admin" || userRole === "administrativo" || userRole === "superintendente") {
      fetchProfiles();
      fetchEquipes();
      fetchUserRoles();
      fetchLideres();
      fetchAdministrativos();
      fetchLogs();
      fetchCargosCustom();
    }
  }, [userRole]);



  const handleApprove = async () => {
    if (!approvingItem || !approvalRole) {
      toast.error("Selecione uma função para o usuário");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: "ativo",
        equipe_id: approvalRole === "comercial" ? formData.equipe_id : null,
        lider_id: approvalRole === "administrativo" ? formData.lider_id : null,
        administrativo_id: approvalRole === "lider" ? formData.administrativo_id : null,
        cargo: formData.cargo,
        cargo_id: formData.cargo_id || null,
      })
      .eq("id", approvingItem.id);

    if (profileError) {
      toast.error("Erro ao aprovar usuário");
      return;
    }

    const { error: roleError } = await supabase.from("user_roles").insert([
      {
        user_id: approvingItem.id,
        role: approvalRole as RoleType,
      },
    ]);

    if (roleError) {
      toast.error("Erro ao atribuir função");
      return;
    }

    await logUserAction("Aprovação de Usuário", approvingItem.id, {
      role: approvalRole,
      status: 'ativo',
      cargo: formData.cargo
    });

    toast.success("Usuário aprovado com sucesso!");
    setApprovalDialogOpen(false);
    fetchProfiles();
    fetchUserRoles();
  };

  const handleDeleteUser = async (profile: Profile) => {
    if (!confirm(`Tem certeza que deseja excluir/inativar o usuário "${profile.nome}"?`)) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error("Sessão inválida");
        return;
      }

      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: profile.id },
      });

      if (error) {
        console.error("Erro ao excluir usuário:", error);
        toast.error("Erro ao excluir usuário");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      await logUserAction("Exclusão/Inativação de Usuário", profile.id, {
        ativo: false,
        status: 'inativo'
      });

      toast.success("Usuário excluído (inativado) com sucesso!");
      fetchProfiles();
      fetchUserRoles();
    } catch (err) {
      console.error("Erro ao excluir usuário:", err);
      toast.error("Erro ao excluir usuário");
    }
  };

  const handleReactivateUser = async (profile: Profile) => {
    if (!confirm(`Reativar o usuário "${profile.nome}"?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('reactivate-user', {
        body: { userId: profile.id },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Erro ao reativar usuário");
        return;
      }
      await logUserAction("Reativação de Usuário", profile.id, { ativo: true, status: 'ativo' });
      toast.success("Usuário reativado com sucesso!");
      fetchProfiles();
      fetchUserRoles();
    } catch (err) {
      console.error("Erro ao reativar:", err);
      toast.error("Erro ao reativar usuário");
    }
  };

  const openDialog = (item?: Profile) => {
    setEditingItem(item ?? null);
    setDialogOpen(true);
  };

  const openApprovalDialog = (item: Profile) => {
    setApprovingItem(item);
    setFormData({
      equipe_id: "",
      cargo: "",
    });
    setApprovalRole("");
    setApprovalDialogOpen(true);
  };

  const getEquipeName = (equipeId?: string) => {
    if (!equipeId) return "-";
    const equipe = equipes.find((e) => e.id === equipeId);
    return equipe?.nome || "-";
  };

  const getEquipesNames = (userId: string) => {
    const equipesIds = userEquipes[userId] || [];
    if (equipesIds.length === 0) return "-";
    return equipesIds
      .map((id) => equipes.find((e) => e.id === id)?.nome)
      .filter(Boolean)
      .join(", ");
  };

  const getRoleName = (role: string) => {
    const roleNames: Record<string, string> = {
      admin: "Administrativo",
      superintendente: "Superintendente",
      administrativo: "Administrativo",
      lider: "Líder",
      comercial: "Comercial",
      parceiro: "Parceiro",
    };
    return roleNames[role] || role;
  };

  const openEquipeDialog = (equipe?: Equipe) => {
    if (equipe) {
      setEditingEquipe(equipe);
      setEquipeFormData(equipe);
      setSelectedEquipeLideres(equipe.lideres || []);
    } else {
      setEditingEquipe(null);
      setEquipeFormData({});
      setSelectedEquipeLideres([]);
    }
    setEquipeDialogOpen(true);
  };

  const handleSaveEquipe = async () => {
    if (!equipeFormData.nome) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (editingEquipe) {
      const { error } = await supabase
        .from("equipes")
        .update({
          nome: equipeFormData.nome,
          descricao: equipeFormData.descricao ?? null,
          lider_id: equipeFormData.lider_id || null,
        })
        .eq("id", editingEquipe.id);
      if (error) {
        toast.error(mensagemErroBanco(error, { equipes_nome_key: "Já existe uma equipe com esse nome." }));
        return;
      }

      await supabase.from("equipe_lideres").delete().eq("equipe_id", editingEquipe.id);
      if (selectedEquipeLideres.length > 0) {
        const lideresData = selectedEquipeLideres.map((liderId) => ({
          equipe_id: editingEquipe.id,
          lider_id: liderId,
        }));
        const { error: lideresError } = await supabase.from("equipe_lideres").insert(lideresData);
        if (lideresError) {
          toast.error("Erro ao atualizar líderes da equipe");
          return;
        }
      }
      toast.success("Equipe atualizada com sucesso!");
    } else {
      const { data, error } = await supabase
        .from("equipes")
        .insert([
          {
            nome: equipeFormData.nome,
            descricao: equipeFormData.descricao,
            lider_id: equipeFormData.lider_id || null,
          },
        ])
        .select()
        .single();
      if (error) {
        toast.error(mensagemErroBanco(error, { equipes_nome_key: "Já existe uma equipe com esse nome." }));
        return;
      }

      if (selectedEquipeLideres.length > 0 && data) {
        const lideresData = selectedEquipeLideres.map((liderId) => ({
          equipe_id: data.id,
          lider_id: liderId,
        }));
        const { error: lideresError } = await supabase.from("equipe_lideres").insert(lideresData);
        if (lideresError) {
          toast.error("Erro ao adicionar líderes à equipe");
          return;
        }
      }
      toast.success("Equipe criada com sucesso!");
    }
    setEquipeDialogOpen(false);
    fetchEquipes();
  };

  const handleDeleteEquipe = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta equipe?")) return;

    await supabase.from("equipe_lideres").delete().eq("equipe_id", id);
    const { error } = await supabase.from("equipes").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir equipe");
    } else {
      toast.success("Equipe excluída com sucesso!");
      fetchEquipes();
    }
  };

  const getLiderName = (liderId: string) => {
    const lider = profiles.find((p) => p.id === liderId) || lideres.find((l) => l.id === liderId);
    return lider?.nome || "Sem líder";
  };

  const [enviandoAcessoId, setEnviandoAcessoId] = useState<string | null>(null);

  const handleEnviarAcesso = async (profile: Profile) => {
    if (enviandoAcessoId) return;
    const confirmado = window.confirm(
      `Enviar os dados de acesso para ${profile.email}?\n\nUma nova senha temporária será gerada e a senha atual deixará de funcionar.`,
    );
    if (!confirmado) return;

    setEnviandoAcessoId(profile.id);
    try {
      const { data, error } = await supabase.functions.invoke("enviar-email-acesso", {
        body: {
          email: profile.email,
          nome: profile.nome,
          userId: profile.id,
          loginUrl: `${window.location.origin}/auth`,
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Não foi possível enviar o e-mail de acesso");
        return;
      }
      toast.success(`E-mail com os dados de acesso enviado para ${profile.email}`);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível enviar o e-mail de acesso");
    } finally {
      setEnviandoAcessoId(null);
    }
  };


  const handleResetPassword = async (profile: Profile) => {
    const newPassword = generateSecurePassword();
    setResetPasswordData({
      profile,
      password: newPassword,
    });
    setResetPasswordDialog(true);
  };

  const confirmResetPassword = async () => {
    const { profile, password } = resetPasswordData;
    if (!profile) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error("Sessão inválida");
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: profile.id,
          password: password,
          resetPassword: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        toast.error(result.error || "Erro ao resetar senha");
        return;
      }

      // Copy to clipboard with fallback for restricted contexts (iframes, etc.)
      try {
        await navigator.clipboard.writeText(password);
      } catch {
        const el = document.createElement('textarea');
        el.value = password;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      
      // Set force_password_change flag
      await supabase
        .from('profiles')
        .update({ force_password_change: true })
        .eq('id', profile.id);
      
      setResetPasswordDialog(false);
      toast.success("Senha resetada e copiada para área de transferência!");

      await logUserAction("Reset de Senha", profile.id, {
        force_password_change: true
      });
    } catch (error) {
      console.error("Erro ao resetar senha:", error);
      toast.error("Erro ao resetar senha");
    }
  };

  if (userRole !== "admin" && userRole !== "administrativo" && userRole !== "superintendente") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Acesso Negado</h1>
              <p className="text-muted-foreground">Apenas administradores podem acessar esta página</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getProfileName = (id?: string | null) => {
    if (!id) return "-";
    const profile = profiles.find((p) => p.id === id);
    return profile?.nome || "-";
  };

  // Stats widgets (calculados sem hooks pois ficam após early return acima)
  const userStats = {
    total: profiles.length,
    ativos: profiles.filter((p) => p.ativo).length,
    pendentes: pendingProfiles.length,
    equipesCount: equipes.length,
  };

  // Navegação simplificada: 4 áreas, cada uma com suas visões internas
  const GRUPOS = [
    {
      id: "pessoas",
      label: "Pessoas",
      desc: "Quem tem acesso ao sistema",
      icon: UsersIcon,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      abas: ["lista", "pendentes", "inativos"],
      badge: pendingProfiles.length,
    },
    {
      id: "estrutura",
      label: "Estrutura",
      desc: "Equipes e quem lidera quem",
      icon: Network,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      abas: ["equipes", "hierarquia"],
      badge: 0,
    },
    {
      id: "permissoes",
      label: "Permissões",
      desc: "Cargos e o que cada um vê",
      icon: Shield,
      color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      abas: ["cargos"],
      badge: 0,
    },
    {
      id: "historico",
      label: "Histórico",
      desc: "Tudo que foi alterado",
      icon: Briefcase,
      color: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
      abas: ["logs"],
      badge: 0,
    },
  ];

  const SUBABAS: Record<string, { id: string; label: string; badge?: number }[]> = {
    pessoas: [
      { id: "lista", label: "Todos" },
      { id: "pendentes", label: "Aguardando aprovação", badge: pendingProfiles.length },
      { id: "inativos", label: "Inativos", badge: inactiveProfiles.length },
    ],
    estrutura: [
      { id: "equipes", label: "Equipes" },
      { id: "hierarquia", label: "Organograma" },
    ],
  };

  const grupoAtivo = GRUPOS.find((g) => g.abas.includes(activeTab))?.id ?? "pessoas";
  const subabas = SUBABAS[grupoAtivo] ?? [];

  return (
    <div className="flex flex-col gap-5 min-w-0 w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <UsersIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Usuários</h2>
            <p className="text-xs text-muted-foreground">
              Gerencie usuários, equipes, permissões e o histórico de ações
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {grupoAtivo === "estrutura" && (
            <Button onClick={() => openEquipeDialog()} className="gap-2 rounded-xl">
              <UsersRound className="h-4 w-4" />
              Nova Equipe
            </Button>
          )}
          {grupoAtivo === "pessoas" && (
            <Button onClick={() => openDialog()} className="gap-2 rounded-xl">
              <UserPlus className="h-4 w-4" />
              Novo Usuário
            </Button>
          )}
        </div>
      </div>

      {/* Indicadores (clicáveis: levam direto para a visão correspondente) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total de usuários", value: userStats.total, icon: UsersIcon, color: "bg-primary/10 text-primary", tab: "lista" },
          { label: "Ativos", value: userStats.ativos, icon: UserCircle, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", tab: "lista" },
          { label: "Pendentes", value: userStats.pendentes, icon: UserPlus, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", tab: "pendentes" },
          { label: "Equipes", value: userStats.equipesCount, icon: UsersRound, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", tab: "equipes" },
        ].map((w) => {
          const Icon = w.icon;
          return (
            <button
              key={w.label}
              type="button"
              onClick={() => setActiveTab(w.tab)}
              className="text-left rounded-2xl border border-border/50 bg-card p-4 hover:shadow-sm hover:border-border transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${w.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-2xl font-bold tracking-tight">{w.value}</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">{w.label}</p>
            </button>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Navegação principal: 4 áreas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          {GRUPOS.map((g) => {
            const Icon = g.icon;
            const isActive = grupoAtivo === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveTab(g.abas[0])}
                className={`relative text-left rounded-2xl border p-3 transition-all duration-200 ${
                  isActive
                    ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                    : "border-border/50 bg-card hover:border-border hover:shadow-sm"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? "bg-primary text-primary-foreground" : g.color
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold leading-tight ${isActive ? "text-primary" : "text-foreground"}`}>
                      {g.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate hidden sm:block">{g.desc}</p>
                  </div>
                </div>
                {g.badge > 0 ? (
                  <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 text-[10px]">
                    {g.badge}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Filtros internos da área selecionada */}
        {subabas.length > 0 && (
          <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-muted p-1 mb-4">
            {subabas.map((s) => {
              const isActive = activeTab === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveTab(s.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                  {s.badge ? (
                    <span className="rounded-full bg-primary/10 text-primary px-1.5 text-[10px] font-semibold">
                      {s.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}


        <TabsList className="hidden">
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="inativos">Inativos</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
          <TabsTrigger value="hierarquia">Hierarquia</TabsTrigger>
          <TabsTrigger value="cargos">Cargos &amp; Permissões</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* LISTA */}
        <TabsContent value="lista">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Lista de Usuários</CardTitle>
                <Badge variant="secondary" className="font-normal">
                  {profiles.length} usuários
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email, telefone ou cargo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* TABELA LISTA USUÁRIOS */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avatar</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum usuário encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedProfiles.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={item.avatar_url || undefined} alt={item.nome} />
                              <AvatarFallback>{item.nome.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell className="font-medium">{item.nome}</TableCell>
                          <TableCell>{item.email}</TableCell>
                          <TableCell>{item.telefone || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{getRoleName(userRoles[item.id])}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Acao primaria visivel + demais no menu (declutter) */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openDialog(item)}
                                title="Editar usuário"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={enviandoAcessoId === item.id}
                                onClick={() => handleEnviarAcesso(item)}
                                title="Enviar dados de acesso por e-mail"
                              >
                                {enviandoAcessoId === item.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Mail className="h-4 w-4" />
                                )}
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Mais ações">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openDialog(item)}>
                                    <Pencil className="h-4 w-4 mr-2" /> Editar usuário
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUserForPermissions({ id: item.id, nome: item.nome, role: userRoles[item.id] || "" });
                                      setFluxoPermissionsDialogOpen(true);
                                    }}
                                  >
                                    <Lock className="h-4 w-4 mr-2" /> Permissões de fluxo
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleResetPassword(item)}>
                                    <Key className="h-4 w-4 mr-2" /> Resetar senha
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteUser(item)}>
                                    <UserX className="h-4 w-4 mr-2" /> Inativar usuário
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Itens por página:</span>
                    <Select
                      value={itemsPerPage.toString()}
                      onValueChange={(value) => {
                        setItemsPerPage(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">
                      Mostrando {(currentPage - 1) * itemsPerPage + 1} -{" "}
                      {Math.min(currentPage * itemsPerPage, filteredProfiles.length)} de {filteredProfiles.length}
                    </span>
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page}>
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INATIVOS */}
        <TabsContent value="inativos">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Usuários Inativos</CardTitle>
                <Badge variant="secondary" className="font-normal">
                  {inactiveProfiles.length} inativos
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avatar</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inactiveProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum usuário inativo
                        </TableCell>
                      </TableRow>
                    ) : (
                      inactiveProfiles.map((item) => (
                        <TableRow key={item.id} className="opacity-70">
                          <TableCell>
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={item.avatar_url || undefined} alt={item.nome} />
                              <AvatarFallback>{item.nome.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell className="font-medium">{item.nome}</TableCell>
                          <TableCell>{item.email}</TableCell>
                          <TableCell>{item.telefone || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{getRoleName(userRoles[item.id])}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReactivateUser(item)}
                              className="gap-1.5"
                              title="Reativar usuário"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reativar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PENDENTES */}
        <TabsContent value="pendentes">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Usuários Pendentes</CardTitle>
                <Badge variant="destructive" className="font-normal">
                  {pendingProfiles.length} pendentes
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Aprovar Usuário</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4 pr-2">
                    <div className="grid gap-2">
                      <Label>Nome</Label>
                      <Input value={approvingItem?.nome || ""} disabled />
                    </div>
                    <div className="grid gap-2">
                      <Label>Email</Label>
                      <Input value={approvingItem?.email || ""} disabled />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="approval-role">Função *</Label>
                      <Select value={approvalRole} onValueChange={setApprovalRole}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma função" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                          <SelectItem value="superintendente">Superintendente</SelectItem>
                          <SelectItem value="administrativo">Administrativo</SelectItem>
                          <SelectItem value="lider">Líder</SelectItem>
                          <SelectItem value="comercial">Comercial</SelectItem>
                          <SelectItem value="parceiro">Parceiro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="approval-cargo">Cargo</Label>
                      <Select
                        value={formData.cargo_id || (formData.cargo ? `__legacy__:${formData.cargo}` : "none")}
                        onValueChange={(v) => {
                          if (v === "none") {
                            setFormData({ ...formData, cargo: "", cargo_id: null });
                            return;
                          }
                          const c = cargosCustom.find((x) => x.id === v);
                          setFormData({ ...formData, cargo_id: v, cargo: c?.nome || "" });
                        }}
                      >
                        <SelectTrigger id="approval-cargo">
                          <SelectValue placeholder="Selecione um cargo" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                          <SelectItem value="none">Nenhum</SelectItem>
                          {cargosCustom.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                          {formData.cargo && !formData.cargo_id && (
                            <SelectItem value={`__legacy__:${formData.cargo}`}>
                              {formData.cargo} (legado)
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {approvalRole === "administrativo" && (
                      <div className="grid gap-2">
                        <Label htmlFor="approval-lider">Líder Vinculado *</Label>
                        <Select
                          value={formData.lider_id || "none"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              lider_id: value === "none" ? undefined : value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um líder" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                            <SelectItem value="none">Nenhum</SelectItem>
                            {lideres.map((lider) => (
                              <SelectItem key={lider.id} value={lider.id}>
                                {lider.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {approvalRole === "lider" && (
                      <div className="grid gap-2">
                        <Label htmlFor="approval-administrativo">Administrativo Responsável</Label>
                        <Select
                          value={formData.administrativo_id || "none"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              administrativo_id: value === "none" ? undefined : value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um administrativo" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                            <SelectItem value="none">Nenhum</SelectItem>
                            {administrativos.map((admin) => (
                              <SelectItem key={admin.id} value={admin.id}>
                                {admin.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {approvalRole === "comercial" && (
                      <div className="grid gap-2">
                        <Label htmlFor="approval-equipe">Equipe</Label>
                        <Select
                          value={formData.equipe_id || "none"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              equipe_id: value === "none" ? undefined : value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma equipe" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                            <SelectItem value="none">Nenhuma</SelectItem>
                            {equipes.map((equipe) => (
                              <SelectItem key={equipe.id} value={equipe.id}>
                                {equipe.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleApprove}>Aprovar</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPendingProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhum usuário pendente de aprovação
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedPendingProfiles.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.nome}</TableCell>
                          <TableCell>{item.email}</TableCell>
                          <TableCell>{item.telefone || "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="default" size="sm" onClick={() => openApprovalDialog(item)}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Aprovar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPendingPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Itens por página:</span>
                    <Select
                      value={pendingItemsPerPage.toString()}
                      onValueChange={(value) => {
                        setPendingItemsPerPage(Number(value));
                        setPendingPage(1);
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">
                      Mostrando {(pendingPage - 1) * pendingItemsPerPage + 1} -{" "}
                      {Math.min(pendingPage * pendingItemsPerPage, pendingProfiles.length)} de {pendingProfiles.length}
                    </span>
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                          disabled={pendingPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </PaginationItem>
                      {Array.from({ length: totalPendingPages }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink onClick={() => setPendingPage(page)} isActive={pendingPage === page}>
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingPage((p) => Math.min(totalPendingPages, p + 1))}
                          disabled={pendingPage === totalPendingPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* HIERARQUIA */}
        <TabsContent value="hierarquia">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Estrutura Organizacional
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                A ordem é sempre: Superintendente → Administrativo → Líder → Equipe → Comercial. Clique em cada
                nome para abrir quem está abaixo dele.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Superintendentes */}
              {profiles
                .filter((p) => userRoles[p.id] === "superintendente")
                .map((superintendente) => (
                  <Collapsible key={superintendente.id} defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-muted p-3 rounded-lg">
                      <ChevronDown className="h-4 w-4" />
                      <Shield className="h-5 w-5 text-purple-500" />
                      <div className="flex-1 text-left">
                        <p className="font-semibold">{superintendente.nome}</p>
                        <p className="text-sm text-muted-foreground">Superintendente</p>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="ml-6 mt-2 space-y-2 border-l-2 border-border pl-4">
                      {/* Administrativos do Superintendente */}
                      {profiles
                        .filter((p) => userRoles[p.id] === "administrativo")
                        .map((administrativo) => (
                          <Collapsible key={administrativo.id}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-muted p-2 rounded-lg">
                              <ChevronRight className="h-4 w-4" />
                              <Briefcase className="h-4 w-4 text-blue-500" />
                              <div className="flex-1 text-left">
                                <p className="font-medium">{administrativo.nome}</p>
                                <p className="text-xs text-muted-foreground">Administrativo</p>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="ml-6 mt-2 space-y-2 border-l border-border pl-4">
                              {/* Líderes do Administrativo */}
                              {profiles
                                .filter((p) => userRoles[p.id] === "lider" && p.administrativo_id === administrativo.id)
                                .map((lider) => {
                                  const liderEquipes = equipes.filter(
                                    (e) => e.lider_id === lider.id || (e.lideres && e.lideres.includes(lider.id)),
                                  );
                                  return (
                                    <Collapsible key={lider.id}>
                                      <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-muted p-2 rounded-lg">
                                        <ChevronRight className="h-4 w-4" />
                                        <UserCircle className="h-4 w-4 text-green-500" />
                                        <div className="flex-1 text-left">
                                          <p className="font-medium">{lider.nome}</p>
                                          <p className="text-xs text-muted-foreground">
                                            Líder
                                            {liderEquipes.length > 0 && ` - ${liderEquipes.length} equipe(s)`}
                                          </p>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="ml-6 mt-2 space-y-2 border-l border-border pl-4">
                                        {/* Equipes do Líder */}
                                        {liderEquipes.map((equipe) => (
                                          <Collapsible key={equipe.id}>
                                            <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-muted p-2 rounded-lg">
                                              <ChevronRight className="h-4 w-4" />
                                              <UsersRound className="h-4 w-4 text-orange-500" />
                                              <div className="flex-1 text-left">
                                                <p className="font-medium">{equipe.nome}</p>
                                                <p className="text-xs text-muted-foreground">Equipe</p>
                                              </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="ml-6 mt-2 space-y-1 border-l border-border pl-4">
                                              {/* Membros da Equipe */}
                                              {profiles
                                                .filter(
                                                  (p) => p.equipe_id === equipe.id && userRoles[p.id] === "comercial",
                                                )
                                                .map((membro) => (
                                                  <div
                                                    key={membro.id}
                                                    className="flex items-center gap-2 p-2 hover:bg-muted rounded"
                                                  >
                                                    <UserCircle className="h-3 w-3 text-muted-foreground" />
                                                    <p className="text-sm">{membro.nome}</p>
                                                    <Badge variant="outline" className="text-xs">
                                                      Comercial
                                                    </Badge>
                                                  </div>
                                                ))}
                                              {profiles.filter(
                                                (p) => p.equipe_id === equipe.id && userRoles[p.id] === "comercial",
                                              ).length === 0 && (
                                                <p className="text-xs text-muted-foreground p-2">Nenhum membro</p>
                                              )}
                                            </CollapsibleContent>
                                          </Collapsible>
                                        ))}
                                        {liderEquipes.length === 0 && (
                                          <p className="text-xs text-muted-foreground p-2">Sem equipes</p>
                                        )}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  );
                                })}
                              {profiles.filter(
                                (p) => userRoles[p.id] === "lider" && p.administrativo_id === administrativo.id,
                              ).length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum líder</p>}
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}

              {/* Líderes sem Administrativo */}
              {profiles.filter((p) => userRoles[p.id] === "lider" && !p.administrativo_id).length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-muted p-3 rounded-lg">
                    <ChevronRight className="h-4 w-4" />
                    <UserCircle className="h-5 w-5 text-gray-500" />
                    <div className="flex-1 text-left">
                      <p className="font-semibold">Líderes Independentes</p>
                      <p className="text-sm text-muted-foreground">Sem administrativo vinculado</p>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-6 mt-2 space-y-2 border-l-2 border-border pl-4">
                    {profiles
                      .filter((p) => userRoles[p.id] === "lider" && !p.administrativo_id)
                      .map((lider) => {
                        const liderEquipes = equipes.filter(
                          (e) => e.lider_id === lider.id || (e.lideres && e.lideres.includes(lider.id)),
                        );
                        return (
                          <Collapsible key={lider.id}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-muted p-2 rounded-lg">
                              <ChevronRight className="h-4 w-4" />
                              <UserCircle className="h-4 w-4 text-green-500" />
                              <div className="flex-1 text-left">
                                <p className="font-medium">{lider.nome}</p>
                                <p className="text-xs text-muted-foreground">
                                  Líder
                                  {liderEquipes.length > 0 && ` - ${liderEquipes.length} equipe(s)`}
                                </p>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="ml-6 mt-2 space-y-2 border-l border-border pl-4">
                              {liderEquipes.map((equipe) => (
                                <Collapsible key={equipe.id}>
                                  <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-muted p-2 rounded-lg">
                                    <ChevronRight className="h-4 w-4" />
                                    <UsersRound className="h-4 w-4 text-orange-500" />
                                    <div className="flex-1 text-left">
                                      <p className="font-medium">{equipe.nome}</p>
                                      <p className="text-xs text-muted-foreground">Equipe</p>
                                    </div>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="ml-6 mt-2 space-y-1 border-l border-border pl-4">
                                    {profiles
                                      .filter((p) => p.equipe_id === equipe.id && userRoles[p.id] === "comercial")
                                      .map((membro) => (
                                        <div
                                          key={membro.id}
                                          className="flex items-center gap-2 p-2 hover:bg-muted rounded"
                                        >
                                          <UserCircle className="h-3 w-3 text-muted-foreground" />
                                          <p className="text-sm">{membro.nome}</p>
                                          <Badge variant="outline" className="text-xs">
                                            Comercial
                                          </Badge>
                                        </div>
                                      ))}
                                  </CollapsibleContent>
                                </Collapsible>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERMISSÕES */}
        {/* CARGOS & PERMISSÕES */}
        <TabsContent value="cargos">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-base font-medium">Cargos & Permissões</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setRoleMenuPermissionsDialogOpen(true)} className="gap-2">
                  <Shield className="h-4 w-4" />
                  Permissões por Perfil de Sistema
                </Button>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Como as permissões se combinam</p>
                <p>
                  <span className="font-medium text-foreground">1. Perfil de sistema</span> (Superintendente,
                  Administrativo, Líder, Comercial, Parceiro) define o acesso básico.
                </p>
                <p>
                  <span className="font-medium text-foreground">2. Cargo</span> (ex.: Financeiro, Vistoriador) ajusta
                  os menus para um grupo de pessoas e substitui o perfil.
                </p>
                <p>
                  <span className="font-medium text-foreground">3. Permissão individual</span> vale mais que tudo e é
                  definida em Pessoas, no menu de ações do usuário.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <CargosPermissoesTab />
            </CardContent>
          </Card>
        </TabsContent>

        {/* EQUIPES */}
        <TabsContent value="equipes">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Equipes</CardTitle>
                <Badge variant="secondary" className="font-normal">
                  {equipes.length} equipes
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Dialog open={equipeDialogOpen} onOpenChange={setEquipeDialogOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingEquipe ? "Editar Equipe" : "Nova Equipe"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="equipe-nome">Nome *</Label>
                      <Input
                        id="equipe-nome"
                        value={equipeFormData.nome || ""}
                        onChange={(e) =>
                          setEquipeFormData({
                            ...equipeFormData,
                            nome: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="equipe-descricao">Descrição</Label>
                      <Textarea
                        id="equipe-descricao"
                        value={equipeFormData.descricao || ""}
                        onChange={(e) =>
                          setEquipeFormData({
                            ...equipeFormData,
                            descricao: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="equipe-lider">Líder Principal</Label>
                      <Select
                        value={equipeFormData.lider_id || "none"}
                        onValueChange={(value) =>
                          setEquipeFormData({
                            ...equipeFormData,
                            lider_id: value === "none" ? undefined : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um líder" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4} className="bg-background z-[100001] max-h-[300px] overflow-y-auto">
                          <SelectItem value="none">Nenhum</SelectItem>
                          {lideres.map((lider) => (
                            <SelectItem key={lider.id} value={lider.id}>
                              {lider.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Líderes Adicionais</Label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                        {lideres.map((lider) => (
                          <div key={lider.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`lider-${lider.id}`}
                              checked={selectedEquipeLideres.includes(lider.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEquipeLideres([...selectedEquipeLideres, lider.id]);
                                } else {
                                  setSelectedEquipeLideres(selectedEquipeLideres.filter((id) => id !== lider.id));
                                }
                              }}
                              className="rounded"
                            />
                            <label htmlFor={`lider-${lider.id}`} className="text-sm cursor-pointer">
                              {lider.nome}
                            </label>
                          </div>
                        ))}
                        {lideres.length === 0 && (
                          <p className="text-sm text-muted-foreground">Nenhum líder disponível</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEquipeDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveEquipe}>{editingEquipe ? "Atualizar" : "Criar"}</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Líder Principal</TableHead>
                      <TableHead>Líderes Adicionais</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10">
                          <div className="flex flex-col items-center gap-2 text-center">
                            <UsersRound className="h-8 w-8 text-muted-foreground/50" />
                            <p className="text-sm font-medium">Nenhuma equipe cadastrada</p>
                            <p className="text-xs text-muted-foreground max-w-sm">
                              As equipes agrupam os comerciais sob um líder. Crie a primeira para poder vincular
                              usuários com perfil Comercial.
                            </p>
                            <Button size="sm" className="mt-1 gap-2" onClick={() => openEquipeDialog()}>
                              <Plus className="h-4 w-4" />
                              Criar primeira equipe
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      equipes.map((equipe) => (
                        <TableRow key={equipe.id}>
                          <TableCell className="font-medium">{equipe.nome}</TableCell>
                          <TableCell>{equipe.descricao || "-"}</TableCell>
                          <TableCell>{equipe.lider_id ? getLiderName(equipe.lider_id) : "-"}</TableCell>
                          <TableCell>
                            {equipe.lideres && equipe.lideres.length > 0
                              ? equipe.lideres.map((id) => getLiderName(id)).join(", ")
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEquipeDialog(equipe)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDeleteEquipe(equipe.id)}>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOGS */}
        <TabsContent value="logs">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Logs de Usuários</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchLogs}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Usuário Alvo</TableHead>
                      <TableHead>Realizado por</TableHead>
                      <TableHead className="min-w-[200px]">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhum log registrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString("pt-BR")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="uppercase text-xs">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{getProfileName(log.target_user_id)}</TableCell>
                          <TableCell className="text-xs">{getProfileName(log.user_id)}</TableCell>
                          <TableCell className="max-w-[280px] sm:max-w-[420px]">
                            <span
                              className="text-xs text-muted-foreground block truncate"
                              title={log.changes ? JSON.stringify(log.changes) : "-"}
                            >
                              {log.changes ? JSON.stringify(log.changes) : "-"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DIALOG RESET SENHA */}
        <Dialog open={resetPasswordDialog} onOpenChange={setResetPasswordDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resetar Senha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Você está prestes a resetar a senha de <strong>{resetPasswordData.profile?.nome}</strong>.
              </p>
              <div className="p-4 bg-muted rounded-lg">
                <Label className="text-sm font-medium">Nova Senha Temporária</Label>
                <p className="text-lg font-mono mt-2 break-all">{resetPasswordData.password}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Esta senha será copiada automaticamente para sua área de transferência. O usuário será obrigado a
                  trocar a senha no próximo login.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setResetPasswordDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={confirmResetPassword}>Confirmar Reset</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* DIALOGS DE PERMISSÕES */}
        {selectedUserForPermissions && (
          <>
            <UserFluxoPermissionsDialog
              open={fluxoPermissionsDialogOpen}
              onOpenChange={setFluxoPermissionsDialogOpen}
              userId={selectedUserForPermissions.id}
              userName={selectedUserForPermissions.nome}
            />
            <UserMenuPermissionsDialog
              open={menuPermissionsDialogOpen}
              onOpenChange={setMenuPermissionsDialogOpen}
              userId={selectedUserForPermissions.id}
              userName={selectedUserForPermissions.nome}
              userRole={selectedUserForPermissions.role}
            />
          </>
        )}

        <RoleMenuPermissionsDialog
          open={roleMenuPermissionsDialogOpen}
          onOpenChange={setRoleMenuPermissionsDialogOpen}
        />

        <UsuarioFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editingItem={editingItem}
          roleAtual={editingItem ? ((userRoles[editingItem.id] as RoleType) || "comercial") : undefined}
          equipesDoLider={editingItem ? userEquipes[editingItem.id] || [] : []}
          equipes={equipes}
          lideres={lideres}
          administrativos={administrativos}
          cargos={cargosCustom}
          recarregarCargos={fetchCargosCustom}
          recarregarEquipes={fetchEquipes}
          recarregarPessoas={() => {
            fetchProfiles();
            fetchUserRoles();
            fetchLideres();
            fetchAdministrativos();
          }}
          onSaved={() => {
            fetchProfiles();
            fetchUserRoles();
            fetchLideres();
            fetchAdministrativos();
            fetchEquipes();
          }}
          logUserAction={logUserAction}
        />

      </Tabs>
    </div>
  );
}
