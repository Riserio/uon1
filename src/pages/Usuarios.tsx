import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Pencil,
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
} from "lucide-react";
import { UserFluxoPermissionsDialog } from "@/components/UserFluxoPermissionsDialog";
import { UserMenuPermissionsDialog } from "@/components/UserMenuPermissionsDialog";
import { RoleMenuPermissionsDialog } from "@/components/RoleMenuPermissionsDialog";
import { MaskedInput } from "@/components/ui/masked-input";
import { useAuth } from "@/hooks/useAuth";
import { createUserSchema, generateSecurePassword } from "@/lib/validationSchemas";
import { z } from "zod";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import FuncionarioFormTabs, { FuncionarioFormData, defaultFuncionarioFormData } from "@/components/FuncionarioFormTabs";

type RoleType = "superintendente" | "administrativo" | "lider" | "comercial" | "parceiro";

interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  cargo?: string;
  equipe_id?: string;
  lider_id?: string;
  administrativo_id?: string;
  ativo: boolean;
  status: string;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  avatar_url?: string | null;
  cpf_cnpj?: string;
}

interface UserRole {
  user_id: string;
  role: RoleType | "admin";
}

interface Equipe {
  id: string;
  nome: string;
  descricao?: string;
  lider_id?: string;
  lideres?: string[];
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Profile | null>(null);
  const [approvingItem, setApprovingItem] = useState<Profile | null>(null);
  const [formData, setFormData] = useState<Partial<Profile>>({});
  const [approvalRole, setApprovalRole] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<RoleType>("comercial");
  const [editingRole, setEditingRole] = useState<RoleType>("comercial");
  const [lideres, setLideres] = useState<Profile[]>([]);
  const [administrativos, setAdministrativos] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEquipes, setSelectedEquipes] = useState<string[]>([]);
  const [userEquipes, setUserEquipes] = useState<Record<string, string[]>>({});
  const [tempPassword, setTempPassword] = useState("");
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
  const [isFuncionario, setIsFuncionario] = useState(false);
  const [createdFuncionarioId, setCreatedFuncionarioId] = useState<string | null>(null);
  const [funcionarioFormData, setFuncionarioFormData] = useState<FuncionarioFormData>(defaultFuncionarioFormData);
  const [selectedModulosBI, setSelectedModulosBI] = useState<string[]>(['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);

  const MODULOS_BI = [
    { id: 'indicadores', label: 'BI Indicadores', description: 'Dashboard principal com KPIs' },
    { id: 'eventos', label: 'Eventos', description: 'Módulo SGA de eventos' },
    { id: 'mgf', label: 'MGF', description: 'Módulo de gestão financeira' },
    { id: 'cobranca', label: 'Cobrança', description: 'Módulo de cobrança/inadimplência' },
    { id: 'estudo-base', label: 'Estudo de Base', description: 'Análise detalhada da base de veículos' },
    { id: 'acompanhamento-eventos', label: 'Acompanhamento de Eventos', description: 'Kanban de acompanhamento de eventos' },
  ];
  const filteredProfiles = useMemo(() => {
    if (!searchTerm) return profiles;
    const term = searchTerm.toLowerCase();
    return profiles.filter(
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
      .in("role", ["administrativo", "admin"]);
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

  useEffect(() => {
    if (userRole === "admin" || userRole === "administrativo" || userRole === "superintendente") {
      fetchProfiles();
      fetchEquipes();
      fetchUserRoles();
      fetchLideres();
      fetchAdministrativos();
      fetchLogs();
    }
  }, [userRole]);

  const handleSave = async () => {
    if (!editingItem) {
      // Criar novo usuário
      try {
        const validatedData = createUserSchema.parse(formData);

        if (!tempPassword) {
          toast.error("Por favor, gere ou digite uma senha antes de criar o usuário");
          return;
        }

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
            email: validatedData.email,
            password: tempPassword,
            nome: validatedData.nome,
            telefone: formData.telefone,
            cargo: formData.cargo,
            equipe_id: selectedRole === "comercial" ? formData.equipe_id : null,
            administrativo_id: selectedRole === "lider" ? formData.administrativo_id : null,
            whatsapp: formData.whatsapp,
            instagram: formData.instagram,
            facebook: formData.facebook,
            linkedin: formData.linkedin,
            cpf_cnpj: formData.cpf_cnpj,
            role: selectedRole,
            equipes: selectedRole === "lider" ? selectedEquipes : [],
          }),
        });

        const result = await response.json();
        if (!response.ok || result.error) {
          toast.error(result.error || "Erro ao criar usuário");
          return;
        }

        const createdUserId = result.userId || result.user?.id || null;

        // Se marcou como funcionário, criar registro de funcionário
        if (isFuncionario && createdUserId) {
          const { data: funcionarioData, error: funcionarioError } = await supabase
            .from("funcionarios")
            .insert({
              profile_id: createdUserId,
              nome: validatedData.nome,
              email: validatedData.email,
              telefone: formData.telefone || null,
              cargo: formData.cargo || null,
              cpf: formData.cpf_cnpj || null,
              departamento: funcionarioFormData.departamento || null,
              tipo_contrato: funcionarioFormData.tipoContrato,
              data_admissao: funcionarioFormData.dataAdmissao || null,
              salario: funcionarioFormData.salario ? parseFloat(funcionarioFormData.salario) : null,
              corretora_id: funcionarioFormData.corretoraId || null,
              carga_horaria_semanal: parseInt(funcionarioFormData.cargaHoraria),
              horario_entrada: funcionarioFormData.horarioEntrada,
              horario_saida: funcionarioFormData.horarioSaida,
              horario_almoco_inicio: funcionarioFormData.horarioAlmocoInicio,
              horario_almoco_fim: funcionarioFormData.horarioAlmocoFim,
              endereco: {
                cep: funcionarioFormData.cep,
                rua: funcionarioFormData.rua,
                numero: funcionarioFormData.numero,
                bairro: funcionarioFormData.bairro,
                cidade: funcionarioFormData.cidade,
                estado: funcionarioFormData.estado,
              },
              dados_bancarios: {
                banco: funcionarioFormData.banco,
                agencia: funcionarioFormData.agencia,
                conta: funcionarioFormData.conta,
                pix: funcionarioFormData.pix,
              },
              created_by: user.id,
            })
            .select()
            .single();

          if (funcionarioError) {
            console.error("Erro ao criar funcionário:", funcionarioError);
            toast.warning("Usuário criado, mas houve erro ao criar registro de funcionário");
          } else {
            setCreatedFuncionarioId(funcionarioData.id);
          }
        }

        toast.success(`Usuário criado! Senha temporária: ${tempPassword}`);
        await logUserAction("create", createdUserId, { nome: validatedData.nome, role: selectedRole, isFuncionario });

        setDialogOpen(false);
        fetchProfiles();
        fetchUserRoles();
      } catch (error) {
        if (error instanceof z.ZodError) {
          toast.error(error.errors[0].message);
        } else {
          toast.error("Erro ao criar usuário");
        }
      }
      return;
    }

    // Atualizar usuário existente
    const { error } = await supabase
      .from("profiles")
      .update({
        nome: formData.nome || editingItem.nome,
        email: formData.email || editingItem.email,
        telefone: formData.telefone,
        cargo: formData.cargo,
        equipe_id: editingRole === "comercial" ? formData.equipe_id : null,
        lider_id: null,
        administrativo_id: editingRole === "lider" ? formData.administrativo_id : null,
        ativo: formData.ativo,
        whatsapp: formData.whatsapp,
        instagram: formData.instagram,
        facebook: formData.facebook,
        linkedin: formData.linkedin,
        cpf_cnpj: formData.cpf_cnpj,
      })
      .eq("id", editingItem.id);

    if (error) {
      toast.error("Erro ao atualizar usuário");
      return;
    }

    const { error: roleError } = await supabase
      .from("user_roles")
      .update({
        role: editingRole,
      })
      .eq("user_id", editingItem.id);

    if (roleError) {
      toast.error("Erro ao atualizar função");
      return;
    }

    if (editingRole === "lider") {
      await supabase.from("equipe_lideres").delete().eq("lider_id", editingItem.id);
      if (selectedEquipes.length > 0) {
        const equipeLideresData = selectedEquipes.map((equipeId) => ({
          lider_id: editingItem.id,
          equipe_id: equipeId,
        }));
        const { error: equipeLideresError } = await supabase.from("equipe_lideres").insert(equipeLideresData);
        if (equipeLideresError) {
          toast.error("Erro ao associar equipes");
          return;
        }
      }
    } else {
      await supabase.from("equipe_lideres").delete().eq("lider_id", editingItem.id);
    }

    // Atualizar módulos BI se for parceiro
    if (editingRole === 'parceiro') {
      const { error: modulosError } = await supabase
        .from("corretora_usuarios")
        .update({ modulos_bi: selectedModulosBI })
        .eq("profile_id", editingItem.id);
      
      if (modulosError) {
        console.error("Erro ao atualizar módulos BI:", modulosError);
        toast.warning("Erro ao atualizar permissões de módulos BI");
      }
    }

    await logUserAction("Atualização de Usuário", editingItem.id, {
      nome: formData.nome || editingItem.nome,
      email: formData.email || editingItem.email,
      cargo: formData.cargo,
      role: editingRole,
      isFuncionario
    });

    // Update email in auth if changed
    if (formData.email && formData.email !== editingItem.email) {
      const { error: emailError } = await supabase.functions.invoke('update-user-email', {
        body: { userId: editingItem.id, newEmail: formData.email }
      });
      if (emailError) {
        console.error("Erro ao atualizar email no auth:", emailError);
      }
    }

    // Gerenciar registro de funcionário
    if (isFuncionario && !createdFuncionarioId) {
      // Criar novo funcionário
      const { data: novoFuncionario, error: funcionarioError } = await supabase
        .from("funcionarios")
        .insert({
          profile_id: editingItem.id,
          nome: formData.nome || editingItem.nome,
          email: formData.email || editingItem.email,
          telefone: formData.telefone || null,
          cargo: formData.cargo || null,
          cpf: formData.cpf_cnpj || null,
          departamento: funcionarioFormData.departamento || null,
          tipo_contrato: funcionarioFormData.tipoContrato,
          data_admissao: funcionarioFormData.dataAdmissao || null,
          salario: funcionarioFormData.salario ? parseFloat(funcionarioFormData.salario) : null,
          corretora_id: funcionarioFormData.corretoraId || null,
          carga_horaria_semanal: parseInt(funcionarioFormData.cargaHoraria),
          horario_entrada: funcionarioFormData.horarioEntrada,
          horario_saida: funcionarioFormData.horarioSaida,
          horario_almoco_inicio: funcionarioFormData.horarioAlmocoInicio,
          horario_almoco_fim: funcionarioFormData.horarioAlmocoFim,
          endereco: {
            cep: funcionarioFormData.cep,
            rua: funcionarioFormData.rua,
            numero: funcionarioFormData.numero,
            bairro: funcionarioFormData.bairro,
            cidade: funcionarioFormData.cidade,
            estado: funcionarioFormData.estado,
          },
          dados_bancarios: {
            banco: funcionarioFormData.banco,
            agencia: funcionarioFormData.agencia,
            conta: funcionarioFormData.conta,
            pix: funcionarioFormData.pix,
          },
          created_by: user.id,
        })
        .select()
        .single();

      if (funcionarioError) {
        console.error("Erro ao criar funcionário:", funcionarioError);
        toast.warning("Usuário atualizado, mas houve erro ao criar registro de funcionário");
      } else {
        setCreatedFuncionarioId(novoFuncionario.id);
      }
    } else if (isFuncionario && createdFuncionarioId) {
      // Atualizar funcionário existente
      const { error: updateError } = await supabase
        .from("funcionarios")
        .update({
          nome: formData.nome || editingItem.nome,
          email: formData.email || editingItem.email,
          telefone: formData.telefone || null,
          cargo: formData.cargo || null,
          cpf: formData.cpf_cnpj || null,
          departamento: funcionarioFormData.departamento || null,
          tipo_contrato: funcionarioFormData.tipoContrato,
          data_admissao: funcionarioFormData.dataAdmissao || null,
          salario: funcionarioFormData.salario ? parseFloat(funcionarioFormData.salario) : null,
          corretora_id: funcionarioFormData.corretoraId || null,
          carga_horaria_semanal: parseInt(funcionarioFormData.cargaHoraria),
          horario_entrada: funcionarioFormData.horarioEntrada,
          horario_saida: funcionarioFormData.horarioSaida,
          horario_almoco_inicio: funcionarioFormData.horarioAlmocoInicio,
          horario_almoco_fim: funcionarioFormData.horarioAlmocoFim,
          endereco: {
            cep: funcionarioFormData.cep,
            rua: funcionarioFormData.rua,
            numero: funcionarioFormData.numero,
            bairro: funcionarioFormData.bairro,
            cidade: funcionarioFormData.cidade,
            estado: funcionarioFormData.estado,
          },
          dados_bancarios: {
            banco: funcionarioFormData.banco,
            agencia: funcionarioFormData.agencia,
            conta: funcionarioFormData.conta,
            pix: funcionarioFormData.pix,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", createdFuncionarioId);

      if (updateError) {
        console.error("Erro ao atualizar funcionário:", updateError);
        toast.warning("Usuário atualizado, mas houve erro ao atualizar registro de funcionário");
      }
    } else if (!isFuncionario && createdFuncionarioId) {
      // Remover funcionário
      const { error: deleteError } = await supabase
        .from("funcionarios")
        .delete()
        .eq("id", createdFuncionarioId);

      if (deleteError) {
        console.error("Erro ao remover funcionário:", deleteError);
        toast.warning("Usuário atualizado, mas houve erro ao remover registro de funcionário");
      }
    }

    toast.success("Usuário atualizado!");
    setDialogOpen(false);
    fetchProfiles();
    fetchUserRoles();
  };

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
      await supabase.from("user_roles").delete().eq("user_id", profile.id);
      await supabase.from("equipe_lideres").delete().eq("lider_id", profile.id);

      const { error } = await supabase
        .from("profiles")
        .update({
          ativo: false,
          status: "inativo",
        })
        .eq("id", profile.id);

      if (error) {
        toast.error("Erro ao excluir usuário");
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

  const openDialog = async (item?: Profile) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        ...item,
      });
      setEditingRole((userRoles[item.id] as RoleType) || "comercial");
      setSelectedEquipes(userEquipes[item.id] || []);
      
      // Carregar módulos BI se for parceiro
      const role = userRoles[item.id];
      if (role === 'parceiro') {
        const { data: usuarioBI } = await supabase
          .from("corretora_usuarios")
          .select("modulos_bi")
          .eq("profile_id", item.id)
          .maybeSingle();
        
        setSelectedModulosBI(usuarioBI?.modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
      } else {
        setSelectedModulosBI(['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
      }
      
      // Verificar se já é funcionário e carregar dados completos
      const { data: funcionarioData } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("profile_id", item.id)
        .maybeSingle();
      
      setIsFuncionario(!!funcionarioData);
      setCreatedFuncionarioId(funcionarioData?.id || null);
      
      if (funcionarioData) {
        const endereco = funcionarioData.endereco as any || {};
        const dadosBancarios = funcionarioData.dados_bancarios as any || {};
        
        setFuncionarioFormData({
          departamento: funcionarioData.departamento || "",
          tipoContrato: funcionarioData.tipo_contrato || "CLT",
          dataAdmissao: funcionarioData.data_admissao || "",
          salario: funcionarioData.salario?.toString() || "",
          corretoraId: funcionarioData.corretora_id || "",
          cargaHoraria: funcionarioData.carga_horaria_semanal?.toString() || "44",
          horarioEntrada: funcionarioData.horario_entrada || "08:00",
          horarioSaida: funcionarioData.horario_saida || "18:00",
          horarioAlmocoInicio: funcionarioData.horario_almoco_inicio || "12:00",
          horarioAlmocoFim: funcionarioData.horario_almoco_fim || "13:00",
          cep: endereco.cep || "",
          rua: endereco.rua || "",
          numero: endereco.numero || "",
          bairro: endereco.bairro || "",
          cidade: endereco.cidade || "",
          estado: endereco.estado || "",
          banco: dadosBancarios.banco || "",
          agencia: dadosBancarios.agencia || "",
          conta: dadosBancarios.conta || "",
          pix: dadosBancarios.pix || "",
        });
      } else {
        setFuncionarioFormData(defaultFuncionarioFormData);
      }
    } else {
      setEditingItem(null);
      setFormData({});
      setSelectedRole("comercial");
      setSelectedEquipes([]);
      setTempPassword("");
      setIsFuncionario(false);
      setCreatedFuncionarioId(null);
      setFuncionarioFormData(defaultFuncionarioFormData);
      setSelectedModulosBI(['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base']);
    }
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
      const { error } = await supabase.from("equipes").update(equipeFormData).eq("id", editingEquipe.id);
      if (error) {
        toast.error("Erro ao atualizar equipe");
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
        toast.error("Erro ao criar equipe");
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <UsersIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Usuários</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie usuários, equipes, permissões e acompanhe o histórico de ações
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "equipes" && (
            <Button onClick={() => openEquipeDialog()} className="gap-2">
              <UsersRound className="h-4 w-4" />
              Nova Equipe
            </Button>
          )}

          {activeTab === "lista" && (
            <Button onClick={() => openDialog()} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Novo Usuário
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="pendentes">
            Pendentes
            {pendingProfiles.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingProfiles.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
          <TabsTrigger value="hierarquia">Hierarquia</TabsTrigger>
          <TabsTrigger value="permissoes">Permissões</TabsTrigger>
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

              {/* DIALOGO CRIAR/EDITAR USUARIO */}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl">{editingItem ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
                  </DialogHeader>

                  {editingItem && (
                    <div className="flex justify-center py-4 border-b">
                      <AvatarUpload
                        userId={editingItem.id}
                        currentAvatarUrl={editingItem.avatar_url}
                        userName={editingItem.nome}
                      />
                    </div>
                  )}

                  <div className="grid gap-6 py-4">
                    {/* INFORMAÇÕES DE ACESSO - NOVO USUÁRIO */}
                    {!editingItem && (
                      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                          Informações de Acesso
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="nome">Nome *</Label>
                            <Input
                              id="nome"
                              value={formData.nome || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  nome: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="email">Email *</Label>
                            <Input
                              id="email"
                              type="email"
                              value={formData.email || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  email: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="password">Senha Temporária *</Label>
                          <div className="flex gap-2">
                            <Input
                              id="password"
                              type="text"
                              value={tempPassword}
                              onChange={(e) => setTempPassword(e.target.value)}
                              placeholder="Digite uma senha ou clique em 'Gerar Senha'"
                              required
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setTempPassword(generateSecurePassword())}
                              title="Gerar nova senha aleatória"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            {tempPassword && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(tempPassword);
                                  } catch {
                                    const el = document.createElement('textarea');
                                    el.value = tempPassword;
                                    el.style.position = 'fixed';
                                    el.style.opacity = '0';
                                    document.body.appendChild(el);
                                    el.focus();
                                    el.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(el);
                                  }
                                  toast.success("Senha copiada!");
                                }}
                                title="Copiar senha"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          {tempPassword && (
                            <p className="text-xs text-muted-foreground">
                              Você pode digitar uma senha manualmente ou usar a gerada automaticamente.
                            </p>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="role">Função/Perfil *</Label>
                          <Select value={selectedRole} onValueChange={(value: RoleType) => setSelectedRole(value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma função" />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              <SelectItem value="superintendente">Superintendente</SelectItem>
                              <SelectItem value="administrativo">Administrativo</SelectItem>
                              <SelectItem value="lider">Líder</SelectItem>
                              <SelectItem value="comercial">Comercial</SelectItem>
                              <SelectItem value="parceiro">Parceiro (Acesso BI)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Seleção de Módulos BI - apenas para parceiro */}
                        {selectedRole === 'parceiro' && (
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Módulos BI Permitidos</Label>
                            <div className="grid grid-cols-2 gap-3">
                              {MODULOS_BI.map((modulo) => (
                                <div
                                  key={modulo.id}
                                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                                    selectedModulosBI.includes(modulo.id)
                                      ? 'border-primary bg-primary/5'
                                      : 'border-border hover:border-primary/50'
                                  }`}
                                  onClick={() => {
                                    if (selectedModulosBI.includes(modulo.id)) {
                                      setSelectedModulosBI(selectedModulosBI.filter(m => m !== modulo.id));
                                    } else {
                                      setSelectedModulosBI([...selectedModulosBI, modulo.id]);
                                    }
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedModulosBI.includes(modulo.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedModulosBI([...selectedModulosBI, modulo.id]);
                                      } else {
                                        setSelectedModulosBI(selectedModulosBI.filter(m => m !== modulo.id));
                                      }
                                    }}
                                    className="h-4 w-4 mt-0.5 rounded border-gray-300"
                                  />
                                  <div className="space-y-1">
                                    <span className="text-sm font-medium">{modulo.label}</span>
                                    <p className="text-xs text-muted-foreground">{modulo.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {selectedModulosBI.length === 0 && (
                              <p className="text-xs text-destructive">Selecione pelo menos um módulo</p>
                            )}
                          </div>
                        )}
                        
                        {/* Flag Funcionário */}
                        <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <input
                            type="checkbox"
                            id="is_funcionario"
                            checked={isFuncionario}
                            onChange={(e) => setIsFuncionario(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <div className="flex-1">
                            <Label htmlFor="is_funcionario" className="text-sm font-medium cursor-pointer">
                              Este usuário é funcionário
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Se marcado, será criado um registro de funcionário automaticamente
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PERFIL E FUNCIONÁRIO - EDIÇÃO */}
                    {editingItem && (
                      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                          Perfil de Acesso
                        </h3>
                        <div className="grid gap-2">
                          <Label>Perfil *</Label>
                          <Select value={editingRole} onValueChange={(v) => setEditingRole(v as RoleType)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="superintendente">Superintendente</SelectItem>
                              <SelectItem value="administrativo">Administrativo</SelectItem>
                              <SelectItem value="lider">Líder</SelectItem>
                              <SelectItem value="comercial">Comercial</SelectItem>
                              <SelectItem value="parceiro">Parceiro (Acesso BI)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Seleção de Módulos BI - apenas para parceiro */}
                        {editingRole === 'parceiro' && (
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Módulos BI Permitidos</Label>
                            <div className="grid grid-cols-2 gap-3">
                              {MODULOS_BI.map((modulo) => (
                                <div
                                  key={modulo.id}
                                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                                    selectedModulosBI.includes(modulo.id)
                                      ? 'border-primary bg-primary/5'
                                      : 'border-border hover:border-primary/50'
                                  }`}
                                  onClick={() => {
                                    if (selectedModulosBI.includes(modulo.id)) {
                                      setSelectedModulosBI(selectedModulosBI.filter(m => m !== modulo.id));
                                    } else {
                                      setSelectedModulosBI([...selectedModulosBI, modulo.id]);
                                    }
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedModulosBI.includes(modulo.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedModulosBI([...selectedModulosBI, modulo.id]);
                                      } else {
                                        setSelectedModulosBI(selectedModulosBI.filter(m => m !== modulo.id));
                                      }
                                    }}
                                    className="h-4 w-4 mt-0.5 rounded border-gray-300"
                                  />
                                  <div className="space-y-1">
                                    <span className="text-sm font-medium">{modulo.label}</span>
                                    <p className="text-xs text-muted-foreground">{modulo.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {selectedModulosBI.length === 0 && (
                              <p className="text-xs text-destructive">Selecione pelo menos um módulo</p>
                            )}
                          </div>
                        )}
                        
                        {/* Flag Funcionário */}
                        <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <input
                            type="checkbox"
                            id="is_funcionario_edit"
                            checked={isFuncionario}
                            onChange={(e) => setIsFuncionario(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <div className="flex-1">
                            <Label htmlFor="is_funcionario_edit" className="text-sm font-medium cursor-pointer">
                              Este usuário é funcionário
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {createdFuncionarioId 
                                ? "Já existe registro de funcionário vinculado"
                                : "Se marcado, será criado um registro de funcionário"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* INFORMAÇÕES PESSOAIS */}
                    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Informações Pessoais
                      </h3>

                      {editingItem && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Nome *</Label>
                            <Input
                              value={formData.nome ?? editingItem.nome}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  nome: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Email *</Label>
                            <Input
                              type="email"
                              value={formData.email ?? editingItem.email}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  email: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="telefone">Telefone</Label>
                          <MaskedInput
                            id="telefone"
                            format="(##) #####-####"
                            value={formData.telefone || ""}
                            onValueChange={(values) =>
                              setFormData({
                                ...formData,
                                telefone: values.value,
                              })
                            }
                            placeholder="(00) 00000-0000"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="cargo">Cargo</Label>
                          <Input
                            id="cargo"
                            value={formData.cargo || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                cargo: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                        <MaskedInput
                          id="cpf_cnpj"
                          format="###.###.###-##"
                          value={formData.cpf_cnpj || ""}
                          onValueChange={(values) =>
                            setFormData({
                              ...formData,
                              cpf_cnpj: values.value,
                            })
                          }
                          placeholder="000.000.000-00"
                        />
                      </div>
                    </div>

                    {/* REDES SOCIAIS */}
                    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Redes Sociais
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="whatsapp">WhatsApp</Label>
                          <MaskedInput
                            id="whatsapp"
                            format="(##) #####-####"
                            value={formData.whatsapp || ""}
                            onValueChange={(values) =>
                              setFormData({
                                ...formData,
                                whatsapp: values.value,
                              })
                            }
                            placeholder="(00) 00000-0000"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="instagram">Instagram</Label>
                          <Input
                            id="instagram"
                            value={formData.instagram || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                instagram: e.target.value,
                              })
                            }
                            placeholder="@usuario"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="facebook">Facebook</Label>
                          <Input
                            id="facebook"
                            value={formData.facebook || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                facebook: e.target.value,
                              })
                            }
                            placeholder="facebook.com/usuario"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="linkedin">LinkedIn</Label>
                          <Input
                            id="linkedin"
                            value={formData.linkedin || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                linkedin: e.target.value,
                              })
                            }
                            placeholder="linkedin.com/in/usuario"
                          />
                        </div>
                      </div>
                    </div>

                    {/* HIERARQUIA */}
                    {(editingItem ? editingRole : selectedRole) && (
                      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                          Hierarquia
                        </h3>
                        {(editingItem ? editingRole : selectedRole) === "lider" ? (
                          <>
                            <div className="grid gap-2">
                              <Label>Equipes (Líder)</Label>
                              <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto bg-background">
                                {equipes.map((equipe) => (
                                  <label
                                    key={equipe.id}
                                    className="flex items-center gap-2 cursor-pointer hover:bg-accent/50 p-2 rounded"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedEquipes.includes(equipe.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedEquipes([...selectedEquipes, equipe.id]);
                                        } else {
                                          setSelectedEquipes(selectedEquipes.filter((id) => id !== equipe.id));
                                        }
                                      }}
                                      className="rounded border-border"
                                    />
                                    <span className="text-sm">{equipe.nome}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="administrativo_id">Administrativo Responsável *</Label>
                              <Select
                                value={formData.administrativo_id || ""}
                                onValueChange={(value) =>
                                  setFormData({
                                    ...formData,
                                    administrativo_id: value,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione um administrativo" />
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  {administrativos.map((admin) => (
                                    <SelectItem key={admin.id} value={admin.id}>
                                      {admin.nome}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        ) : (editingItem ? editingRole : selectedRole) === "comercial" ? (
                          <div className="grid gap-2">
                            <Label htmlFor="equipe_id">Equipe *</Label>
                            <Select
                              value={formData.equipe_id || ""}
                              onValueChange={(value) =>
                                setFormData({
                                  ...formData,
                                  equipe_id: value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione uma equipe" />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                {equipes.map((equipe) => (
                                  <SelectItem key={equipe.id} value={equipe.id}>
                                    {equipe.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* DADOS DO FUNCIONÁRIO */}
                    {isFuncionario && (
                      <FuncionarioFormTabs
                        data={funcionarioFormData}
                        onChange={setFuncionarioFormData}
                        isEditing={!!editingItem && !!createdFuncionarioId}
                      />
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSave}>{editingItem ? "Atualizar" : "Criar Usuário"}</Button>
                  </div>
                </DialogContent>
              </Dialog>

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
                                onClick={() => {
                                  setSelectedUserForPermissions({
                                    id: item.id,
                                    nome: item.nome,
                                    role: userRoles[item.id] || "",
                                  });
                                  setFluxoPermissionsDialogOpen(true);
                                }}
                                title="Gerenciar permissões de fluxo"
                              >
                                <Lock className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleResetPassword(item)}
                                title="Resetar senha"
                              >
                                <Key className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDeleteUser(item)}
                                title="Excluir usuário"
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
                      <SelectContent>
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
                        <SelectContent className="bg-background z-50">
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
                      <Input
                        id="approval-cargo"
                        value={formData.cargo || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cargo: e.target.value,
                          })
                        }
                      />
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
                          <SelectContent>
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
                          <SelectContent>
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
                          <SelectContent>
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
                      <SelectContent>
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
        <TabsContent value="permissoes">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Permissões de Menu por Perfil</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-lg mb-2">Configurar Permissões</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure quais menus cada perfil (role) pode visualizar e editar. As permissões podem ser definidas
                    por perfil ou individualmente por usuário.
                  </p>
                  <Button onClick={() => setRoleMenuPermissionsDialogOpen(true)} className="gap-2">
                    <Shield className="h-4 w-4" />
                    Gerenciar Permissões por Perfil
                  </Button>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    Hierarquia de Visualização de Dados
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    As permissões de menu controlam quais funcionalidades cada perfil pode acessar. A hierarquia de
                    visualização de dados determina quais atendimentos cada usuário pode ver:
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2"></li>
                    <li className="flex items-start gap-2">
                      <span className="font-semibold text-primary min-w-[140px]">Administrativo:</span>
                      <span>Visualiza usuários abaixo dele na hierarquia (líderes e comerciais vinculados)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-semibold text-primary min-w-[140px]">Líder:</span>
                      <span>Visualiza membros da sua equipe</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-semibold text-primary min-w-[140px]">Comercial:</span>
                      <span>Visualiza apenas sua própria produção</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Permissões Especiais</h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    • Permissões individuais por usuário sobrescrevem as permissões do perfil
                    <br />• Use a coluna "Ações" na lista de usuários para configurar permissões individuais
                  </p>
                </div>
              </div>
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
                        <SelectContent>
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
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhuma equipe cadastrada
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
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Usuário Alvo</TableHead>
                      <TableHead>Realizado por</TableHead>
                      <TableHead>Detalhes</TableHead>
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
                          <TableCell>{new Date(log.created_at).toLocaleString("pt-BR")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="uppercase text-xs">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell>{getProfileName(log.target_user_id)}</TableCell>
                          <TableCell>{getProfileName(log.user_id)}</TableCell>
                          <TableCell className="max-w-xl">
                            <span className="text-sm text-muted-foreground">
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

      </Tabs>
    </div>
  );
}
