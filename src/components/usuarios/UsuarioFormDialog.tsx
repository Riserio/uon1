import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  Briefcase,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCircle,
  UserPlus,
  UsersRound,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErroBanco } from "@/lib/dbErrors";
import { createUserSchema, generateSecurePassword } from "@/lib/validationSchemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { MaskedInput } from "@/components/ui/masked-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AvatarUpload } from "@/components/AvatarUpload";
import FuncionarioFormTabs, { FuncionarioFormData, defaultFuncionarioFormData } from "@/components/FuncionarioFormTabs";
import { cn } from "@/lib/utils";
import {
  ACESSO_TOTAL_ROLES,
  carregarPermissoesCargo,
  carregarPermissoesRole,
  linhasParaMapa,
  mesclarPermissoes,
  type MapaPermissoes,
} from "@/lib/permissoes";
import { useInvalidarPermissoes } from "@/hooks/usePermissoes";
import { CargoEditorDialog } from "./CargoEditorDialog";
import { EquipeRapidaDialog, PessoaRapidaDialog } from "./CriacaoRapidaDialogs";
import { ResumoAcesso } from "./ResumoAcesso";
import {
  PERFIS,
  criarUsuarioViaFuncao,
  type CargoOpcao,
  type Equipe,
  type Profile,
  type RoleType,
} from "./tipos";

const MODULOS_BI = [
  { id: "indicadores", label: "BI Indicadores", description: "Dashboard principal com KPIs" },
  { id: "eventos", label: "Eventos", description: "Módulo SGA de eventos" },
  { id: "mgf", label: "MGF", description: "Gestão financeira" },
  { id: "cobranca", label: "Cobrança", description: "Cobrança/inadimplência" },
  { id: "estudo-base", label: "Estudo de Base", description: "Análise da base de veículos" },
  { id: "acompanhamento-eventos", label: "Acompanhamento de Eventos", description: "Kanban de eventos" },
];
const MODULOS_BI_PADRAO = ["indicadores", "eventos", "mgf", "cobranca", "estudo-base"];

type Etapa = "dados" | "acesso" | "vinculos" | "complementares";

const ETAPAS: { id: Etapa; label: string; desc: string; icon: typeof UserCircle }[] = [
  { id: "dados", label: "Dados", desc: "Nome, e-mail e contato", icon: UserCircle },
  { id: "acesso", label: "Acesso", desc: "Perfil e cargo", icon: ShieldCheck },
  { id: "vinculos", label: "Vínculos", desc: "Equipe e liderança", icon: Network },
  { id: "complementares", label: "Complementares", desc: "Funcionário e redes", icon: ClipboardList },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editingItem: Profile | null;
  roleAtual?: RoleType;
  equipesDoLider?: string[];
  equipes: Equipe[];
  lideres: Profile[];
  administrativos: Profile[];
  cargos: CargoOpcao[];
  recarregarCargos: () => unknown;
  recarregarEquipes: () => unknown;
  recarregarPessoas: () => unknown;
  onSaved: () => void;
  logUserAction: (action: string, targetUserId: string, changes?: unknown) => Promise<void> | void;
}

function Campo({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function UsuarioFormDialog(props: Props) {
  const { open, onOpenChange, editingItem } = props;
  const editando = !!editingItem;
  const invalidarPermissoes = useInvalidarPermissoes();

  // ---------- estado do formulário ----------
  const [etapa, setEtapa] = useState<Etapa>("dados");
  const [form, setForm] = useState<Partial<Profile>>({});
  const [role, setRole] = useState<RoleType>("comercial");
  const [senha, setSenha] = useState("");
  const [equipesLider, setEquipesLider] = useState<string[]>([]);
  const [isFuncionario, setIsFuncionario] = useState(false);
  const [batePonto, setBatePonto] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [funcionario, setFuncionario] = useState<FuncionarioFormData>(defaultFuncionarioFormData);
  const [modulosBI, setModulosBI] = useState<string[]>(MODULOS_BI_PADRAO);
  const [acessoOuvidoria, setAcessoOuvidoria] = useState(false);
  const [ouvidoriaPodeEditar, setOuvidoriaPodeEditar] = useState(false);
  const [ajustesIndividuais, setAjustesIndividuais] = useState<MapaPermissoes>({});
  const [salvando, setSalvando] = useState(false);
  const [carregandoEdicao, setCarregandoEdicao] = useState(false);

  // itens criados "na hora", antes de o pai recarregar as listas
  const [extrasEquipes, setExtrasEquipes] = useState<Equipe[]>([]);
  const [extrasLideres, setExtrasLideres] = useState<Profile[]>([]);
  const [extrasAdmins, setExtrasAdmins] = useState<Profile[]>([]);
  const [extrasCargos, setExtrasCargos] = useState<CargoOpcao[]>([]);

  // diálogos de criação rápida
  const [cargoEditor, setCargoEditor] = useState<{ open: boolean; cargo: CargoOpcao | null }>({ open: false, cargo: null });
  const [equipeRapida, setEquipeRapida] = useState(false);
  const [pessoaRapida, setPessoaRapida] = useState<null | "lider" | "administrativo">(null);

  // cache de permissões para a prévia
  const [permsRole, setPermsRole] = useState<Record<string, MapaPermissoes>>({});
  const [permsCargo, setPermsCargo] = useState<Record<string, MapaPermissoes>>({});
  const [versaoCargo, setVersaoCargo] = useState(0);

  const unir = <T extends { id: string }>(base: T[], extras: T[]) => {
    const ids = new Set(base.map((b) => b.id));
    return [...base, ...extras.filter((e) => !ids.has(e.id))];
  };
  const equipes = useMemo(() => unir(props.equipes, extrasEquipes), [props.equipes, extrasEquipes]);
  const lideres = useMemo(() => unir(props.lideres, extrasLideres).filter((l) => l.id !== editingItem?.id), [props.lideres, extrasLideres, editingItem]);
  const administrativos = useMemo(() => unir(props.administrativos, extrasAdmins).filter((a) => a.id !== editingItem?.id), [props.administrativos, extrasAdmins, editingItem]);
  const cargos = useMemo(() => unir(props.cargos, extrasCargos), [props.cargos, extrasCargos]);

  const precisaVinculo = role === "lider" || role === "comercial" || role === "administrativo";
  const etapas = ETAPAS.filter((e) => e.id !== "vinculos" || precisaVinculo);
  const idxEtapa = etapas.findIndex((e) => e.id === etapa);

  // ---------- abrir / carregar ----------
  useEffect(() => {
    if (!open) return;
    setEtapa("dados");
    setExtrasEquipes([]);
    setExtrasLideres([]);
    setExtrasAdmins([]);
    setExtrasCargos([]);
    setAjustesIndividuais({});

    if (!editingItem) {
      setForm({});
      setRole("comercial");
      setSenha(generateSecurePassword());
      setEquipesLider([]);
      setIsFuncionario(false);
      setBatePonto(false);
      setFuncionarioId(null);
      setFuncionario(defaultFuncionarioFormData);
      setModulosBI(MODULOS_BI_PADRAO);
      setAcessoOuvidoria(false);
      setOuvidoriaPodeEditar(false);
      return;
    }

    setForm({ ...editingItem });
    setRole(props.roleAtual || "comercial");
    setEquipesLider(props.equipesDoLider || []);
    setCarregandoEdicao(true);
    (async () => {
      const [{ data: bi }, { data: func }, { data: ajustes }] = await Promise.all([
        props.roleAtual === "parceiro"
          ? supabase
              .from("corretora_usuarios")
              .select("modulos_bi, acesso_ouvidoria, ouvidoria_pode_editar")
              .eq("profile_id", editingItem.id)
              .maybeSingle()
          : Promise.resolve({ data: null as any }),
        supabase.from("funcionarios").select("*").eq("profile_id", editingItem.id).maybeSingle(),
        supabase.from("user_menu_permissions").select("menu_item, pode_visualizar, pode_editar").eq("user_id", editingItem.id),
      ]);
      setModulosBI((bi as any)?.modulos_bi || MODULOS_BI_PADRAO);
      setAcessoOuvidoria(!!(bi as any)?.acesso_ouvidoria);
      setOuvidoriaPodeEditar(!!(bi as any)?.ouvidoria_pode_editar);
      setAjustesIndividuais(linhasParaMapa(ajustes as any));

      setIsFuncionario(!!func);
      setFuncionarioId((func as any)?.id || null);
      setBatePonto(!!(func as any)?.bate_ponto);
      if (func) {
        const f = func as any;
        const end = f.endereco || {};
        const banco = f.dados_bancarios || {};
        setFuncionario({
          departamento: f.departamento || "",
          tipoContrato: f.tipo_contrato || "CLT",
          dataAdmissao: f.data_admissao || "",
          salario: f.salario?.toString() || "",
          corretoraId: f.corretora_id || "",
          cargaHoraria: f.carga_horaria_semanal?.toString() || "44",
          horarioEntrada: f.horario_entrada || "08:00",
          horarioSaida: f.horario_saida || "18:00",
          horarioAlmocoInicio: f.horario_almoco_inicio || "12:00",
          horarioAlmocoFim: f.horario_almoco_fim || "13:00",
          cep: end.cep || "",
          rua: end.rua || "",
          numero: end.numero || "",
          bairro: end.bairro || "",
          cidade: end.cidade || "",
          estado: end.estado || "",
          banco: banco.banco || "",
          agencia: banco.agencia || "",
          conta: banco.conta || "",
          pix: banco.pix || "",
        });
      } else {
        setFuncionario(defaultFuncionarioFormData);
      }
      setCarregandoEdicao(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem]);

  // permissões para a prévia (cache por perfil/cargo)
  useEffect(() => {
    if (!open || ACESSO_TOTAL_ROLES.includes(role) || role === "parceiro" || permsRole[role]) return;
    carregarPermissoesRole(role).then((m) => setPermsRole((p) => ({ ...p, [role]: m })));
  }, [open, role, permsRole]);

  useEffect(() => {
    const id = form.cargo_id;
    if (!open || !id) return;
    carregarPermissoesCargo(id).then((m) => setPermsCargo((p) => ({ ...p, [id]: m })));
  }, [open, form.cargo_id, versaoCargo]);

  const mapaPrevia = useMemo(
    () =>
      mesclarPermissoes(
        permsRole[role],
        form.cargo_id ? permsCargo[form.cargo_id] : undefined,
        ajustesIndividuais,
      ),
    [permsRole, permsCargo, role, form.cargo_id, ajustesIndividuais],
  );
  const mapaExplicito = useMemo(
    () => mesclarPermissoes(form.cargo_id ? permsCargo[form.cargo_id] : undefined, ajustesIndividuais),
    [permsCargo, form.cargo_id, ajustesIndividuais],
  );
  const previaCarregando = !!form.cargo_id && !permsCargo[form.cargo_id];
  const qtdAjustes = Object.keys(ajustesIndividuais).length;
  const cargoSel = cargos.find((c) => c.id === form.cargo_id) || null;

  // ---------- validação por etapa ----------
  const validar = (e: Etapa): string | null => {
    if (e === "dados") {
      const nome = (form.nome || "").trim();
      const email = (form.email || "").trim();
      if (nome.length < 2) return "Informe o nome";
      if (!/^\S+@\S+\.\S+$/.test(email)) return "Informe um e-mail válido";
      if (!editando && !senha) return "Defina uma senha temporária";
    }
    if (e === "acesso" && role === "parceiro" && editando && modulosBI.length === 0) {
      return "Selecione pelo menos um módulo do BI";
    }
    if (e === "vinculos") {
      if (role === "comercial" && !form.equipe_id) return "Selecione (ou crie) a equipe do comercial";
      if (role === "lider" && !form.administrativo_id && administrativos.length > 0)
        return "Selecione o administrativo responsável pelo líder";
    }
    return null;
  };

  const irPara = (destino: Etapa) => {
    if (!editando) {
      // no cadastro novo, só avança se as etapas anteriores estão válidas
      const alvo = etapas.findIndex((e) => e.id === destino);
      for (let i = 0; i < alvo; i++) {
        const erro = validar(etapas[i].id);
        if (erro) {
          toast.error(erro);
          setEtapa(etapas[i].id);
          return;
        }
      }
    }
    setEtapa(destino);
  };

  // ---------- salvar ----------
  const payloadFuncionario = (profileId: string, userId: string) => ({
    profile_id: profileId,
    nome: form.nome,
    email: form.email,
    telefone: form.telefone || null,
    cargo: form.cargo || null,
    cpf: form.cpf_cnpj || null,
    departamento: funcionario.departamento || null,
    tipo_contrato: funcionario.tipoContrato,
    data_admissao: funcionario.dataAdmissao || null,
    salario: funcionario.salario ? parseFloat(funcionario.salario) : null,
    corretora_id: funcionario.corretoraId || null,
    carga_horaria_semanal: parseInt(funcionario.cargaHoraria),
    horario_entrada: funcionario.horarioEntrada,
    horario_saida: funcionario.horarioSaida,
    horario_almoco_inicio: funcionario.horarioAlmocoInicio,
    horario_almoco_fim: funcionario.horarioAlmocoFim,
    endereco: {
      cep: funcionario.cep,
      rua: funcionario.rua,
      numero: funcionario.numero,
      bairro: funcionario.bairro,
      cidade: funcionario.cidade,
      estado: funcionario.estado,
    },
    dados_bancarios: {
      banco: funcionario.banco,
      agencia: funcionario.agencia,
      conta: funcionario.conta,
      pix: funcionario.pix,
    },
    bate_ponto: batePonto,
    created_by: userId,
  });

  const salvar = async () => {
    for (const e of etapas) {
      const erro = validar(e.id);
      if (erro) {
        toast.error(erro);
        setEtapa(e.id);
        return;
      }
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sessão inválida");
      return;
    }
    setSalvando(true);
    try {
      if (!editando) await criar(user.id);
      else await atualizar(user.id);
      invalidarPermissoes();
      props.onSaved();
      onOpenChange(false);
    } catch (e: any) {
      if (e instanceof z.ZodError) toast.error(e.errors[0].message);
      else toast.error(e?.message || "Erro ao salvar usuário");
    } finally {
      setSalvando(false);
    }
  };

  const criar = async (adminId: string) => {
    const v = createUserSchema.parse(form);
    const { userId, emailAcessoEnviado } = await criarUsuarioViaFuncao({
      email: v.email,
      password: senha,
      nome: v.nome,
      telefone: form.telefone,
      cargo: cargoSel?.nome || form.cargo || "",
      cargo_id: form.cargo_id || null,
      equipe_id: role === "comercial" ? form.equipe_id : null,
      administrativo_id: role === "lider" ? form.administrativo_id : null,
      lider_id: role === "administrativo" || role === "comercial" ? form.lider_id || null : null,
      whatsapp: form.whatsapp,
      instagram: form.instagram,
      facebook: form.facebook,
      linkedin: form.linkedin,
      cpf_cnpj: form.cpf_cnpj,
      role,
      equipes: role === "lider" ? equipesLider : [],
    });

    if (isFuncionario && userId) {
      const { error } = await supabase.from("funcionarios").insert(payloadFuncionario(userId, adminId) as any);
      if (error) toast.warning("Usuário criado, mas houve erro ao criar o registro de funcionário");
    }
    if (emailAcessoEnviado) toast.success(`Usuário criado. Dados de acesso enviados para ${v.email}`);
    else toast.warning(`Usuário criado, mas o e-mail não foi enviado. Senha temporária: ${senha}`);
    if (userId) await props.logUserAction("create", userId, { nome: v.nome, role, cargo: cargoSel?.nome, isFuncionario });
  };

  const atualizar = async (adminId: string) => {
    const item = editingItem!;
    const { error } = await supabase
      .from("profiles")
      .update({
        nome: form.nome,
        email: form.email,
        telefone: form.telefone,
        cargo: cargoSel?.nome ?? form.cargo ?? null,
        cargo_id: form.cargo_id || null,
        equipe_id: role === "comercial" ? form.equipe_id : null,
        lider_id: role === "administrativo" || role === "comercial" ? form.lider_id || null : null,
        administrativo_id: role === "lider" ? form.administrativo_id : null,
        ativo: form.ativo,
        whatsapp: form.whatsapp,
        instagram: form.instagram,
        facebook: form.facebook,
        linkedin: form.linkedin,
        cpf_cnpj: form.cpf_cnpj,
      })
      .eq("id", item.id);
    if (error) throw new Error(mensagemErroBanco(error));

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .update({ role })
      .eq("user_id", item.id)
      .select("id");
    if (roleError) throw new Error("Erro ao atualizar o perfil de acesso");
    if (!roleRows || roleRows.length === 0) {
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: item.id, role });
      if (insErr) throw new Error(mensagemErroBanco(insErr));
    }

    await supabase.from("equipe_lideres").delete().eq("lider_id", item.id);
    if (role === "lider" && equipesLider.length > 0) {
      const { error: elErr } = await supabase
        .from("equipe_lideres")
        .insert(equipesLider.map((equipe_id) => ({ lider_id: item.id, equipe_id })));
      if (elErr) throw new Error("Erro ao associar equipes");
    }

    if (role === "parceiro") {
      const { error: biErr } = await supabase
        .from("corretora_usuarios")
        .update({ modulos_bi: modulosBI, acesso_ouvidoria: acessoOuvidoria, ouvidoria_pode_editar: ouvidoriaPodeEditar } as any)
        .eq("profile_id", item.id);
      if (biErr) toast.warning("Não foi possível atualizar os módulos do BI");
    }

    if (form.email && form.email !== item.email) {
      const { error: emailErr } = await supabase.functions.invoke("update-user-email", {
        body: { userId: item.id, newEmail: form.email },
      });
      if (emailErr) toast.warning("Dados salvos, mas o e-mail de login não foi atualizado");
    }

    if (isFuncionario && !funcionarioId) {
      const { error: fErr } = await supabase.from("funcionarios").insert(payloadFuncionario(item.id, adminId) as any);
      if (fErr) toast.warning("Usuário atualizado, mas houve erro ao criar o registro de funcionário");
    } else if (isFuncionario && funcionarioId) {
      const { created_by: _ignorar, ...dados } = payloadFuncionario(item.id, adminId);
      const { error: fErr } = await supabase
        .from("funcionarios")
        .update({ ...dados, updated_at: new Date().toISOString() } as any)
        .eq("id", funcionarioId);
      if (fErr) toast.warning("Usuário atualizado, mas houve erro ao atualizar o registro de funcionário");
    } else if (!isFuncionario && funcionarioId) {
      const { error: fErr } = await supabase.from("funcionarios").delete().eq("id", funcionarioId);
      if (fErr) toast.warning("Usuário atualizado, mas houve erro ao remover o registro de funcionário");
    }

    await props.logUserAction("Atualização de Usuário", item.id, {
      nome: form.nome,
      email: form.email,
      cargo: cargoSel?.nome,
      role,
      isFuncionario,
    });
    toast.success("Usuário atualizado");
  };

  const removerAjustesIndividuais = async () => {
    if (!editingItem) return;
    const { error } = await supabase.from("user_menu_permissions").delete().eq("user_id", editingItem.id);
    if (error) {
      toast.error(mensagemErroBanco(error));
      return;
    }
    setAjustesIndividuais({});
    invalidarPermissoes();
    toast.success("Ajustes individuais removidos — vale só o cargo");
  };

  // ---------- render das etapas ----------
  const set = (patch: Partial<Profile>) => setForm((p) => ({ ...p, ...patch }));

  const renderDados = () => (
    <div className="space-y-5">
      {editando && (
        <div className="flex justify-center">
          <AvatarUpload userId={editingItem!.id} currentAvatarUrl={editingItem!.avatar_url} userName={editingItem!.nome} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nome *">
          <Input value={form.nome || ""} onChange={(e) => set({ nome: e.target.value })} autoFocus={!editando} />
        </Campo>
        <Campo label="E-mail de acesso *">
          <Input type="email" value={form.email || ""} onChange={(e) => set({ email: e.target.value })} />
        </Campo>
        <Campo label="Telefone">
          <MaskedInput
            format="(##) #####-####"
            value={form.telefone || ""}
            onValueChange={(v) => set({ telefone: v.value })}
            placeholder="(00) 00000-0000"
          />
        </Campo>
        <Campo label="CPF">
          <MaskedInput
            format="###.###.###-##"
            value={form.cpf_cnpj || ""}
            onValueChange={(v) => set({ cpf_cnpj: v.value })}
            placeholder="000.000.000-00"
          />
        </Campo>
      </div>
      {!editando && (
        <Campo label="Senha temporária *" hint="Enviada por e-mail junto com o link de acesso. A pessoa troca no primeiro login.">
          <div className="flex gap-2">
            <Input value={senha} onChange={(e) => setSenha(e.target.value)} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={() => setSenha(generateSecurePassword())} title="Gerar outra">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Copiar"
              onClick={() => navigator.clipboard?.writeText(senha).then(() => toast.success("Senha copiada"))}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </Campo>
      )}
      {editando && (
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Usuário ativo</p>
            <p className="text-xs text-muted-foreground">Desativado, não consegue entrar no sistema.</p>
          </div>
          <Switch checked={form.ativo !== false} onCheckedChange={(v) => set({ ativo: v })} />
        </div>
      )}
    </div>
  );

  const renderAcesso = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold">1. Perfil de sistema</p>
          <p className="text-xs text-muted-foreground">Define a posição na hierarquia e o tipo de vínculo.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {PERFIS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setRole(p.id)}
              className={cn(
                "text-left rounded-xl border p-3 transition-all",
                role === p.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between">
                <p className={cn("text-sm font-medium", role === p.id && "text-primary")}>{p.label}</p>
                {role === p.id && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {role === "parceiro" ? (
        editando ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">2. Módulos do BI (portal do parceiro)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULOS_BI.map((m) => {
                const on = modulosBI.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={cn("flex items-start gap-3 rounded-xl border p-3 cursor-pointer", on && "border-primary bg-primary/5")}
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) => setModulosBI((p) => (v ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                    />
                    <div>
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-[11px] text-muted-foreground">{m.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="rounded-xl border p-3 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={acessoOuvidoria}
                  onCheckedChange={(v) => {
                    setAcessoOuvidoria(!!v);
                    if (!v) setOuvidoriaPodeEditar(false);
                  }}
                />
                <span className="text-sm font-medium">Ouvidoria</span>
              </label>
              {acessoOuvidoria && (
                <label className="flex items-center gap-3 cursor-pointer pl-7">
                  <Checkbox checked={ouvidoriaPodeEditar} onCheckedChange={(v) => setOuvidoriaPodeEditar(!!v)} />
                  <span className="text-xs">Pode editar (status, checkpoints e campos)</span>
                </label>
              )}
            </div>
          </div>
        ) : (
          <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              Usuários parceiros são criados pela associação: <strong className="text-foreground">BI - Indicadores → escolha a associação → Gerenciar Usuários</strong>.
              É lá que ficam o vínculo com a associação e os módulos do BI.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">2. Cargo</p>
              <p className="text-xs text-muted-foreground">
                {ACESSO_TOTAL_ROLES.includes(role)
                  ? "Para superintendente o cargo é só o título — o acesso já é total."
                  : "O cargo define o que a pessoa vê. Escolha e confira abaixo."}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setCargoEditor({ open: true, cargo: null })}>
              <Plus className="h-3.5 w-3.5" /> Novo cargo
            </Button>
          </div>

          {cargos.length === 0 ? (
            <button
              type="button"
              onClick={() => setCargoEditor({ open: true, cargo: null })}
              className="w-full rounded-xl border border-dashed p-6 text-center hover:border-primary/50"
            >
              <Briefcase className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Nenhum cargo cadastrado</p>
              <p className="text-xs text-muted-foreground">Crie o primeiro já com as permissões</p>
            </button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => set({ cargo_id: null })}
                className={cn(
                  "text-left rounded-xl border p-3 transition-all",
                  !form.cargo_id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40",
                )}
              >
                <p className="text-sm font-medium">Sem cargo</p>
                <p className="text-[11px] text-muted-foreground">Segue só o padrão do perfil de sistema</p>
              </button>
              {cargos.filter((c) => c.ativo !== false || c.id === form.cargo_id).map((c) => {
                const ativo = form.cargo_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set({ cargo_id: c.id, cargo: c.nome })}
                    className={cn(
                      "text-left rounded-xl border p-3 transition-all flex items-center gap-3",
                      ativo ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40",
                    )}
                  >
                    <span
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (c.cor || "#6366f1") + "20", color: c.cor || "#6366f1" }}
                    >
                      <Briefcase className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{c.nome}</span>
                      {c.descricao && <span className="block text-[11px] text-muted-foreground truncate">{c.descricao}</span>}
                    </span>
                    {ativo && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          {form.cargo && !form.cargo_id && editando && (
            <p className="text-[11px] text-muted-foreground">
              Cargo antigo em texto: “{form.cargo}”. Escolha um cargo da lista para que as permissões passem a valer.
            </p>
          )}

          {!ACESSO_TOTAL_ROLES.includes(role) && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">3. O que {form.nome?.split(" ")[0] || "a pessoa"} vai ver</p>
                {cargoSel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setCargoEditor({ open: true, cargo: cargoSel })}
                  >
                    <Pencil className="h-3 w-3" /> Ajustar permissões do cargo
                  </Button>
                )}
              </div>
              {qtdAjustes > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-muted-foreground">
                    Este usuário tem <strong className="text-foreground">{qtdAjustes} ajuste(s) individual(is)</strong> que
                    sobrepõem o cargo. Para ele seguir exatamente o cargo, remova os ajustes.
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={removerAjustesIndividuais}>
                    Remover
                  </Button>
                </div>
              )}
              {previaCarregando ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ResumoAcesso mapa={mapaPrevia} mapaExplicito={mapaExplicito} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const BotaoCriar = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs gap-1" onClick={onClick}>
      <Plus className="h-3 w-3" /> {children}
    </Button>
  );

  const renderVinculos = () => (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Superintendente → Administrativo → Líder → Equipe → Comercial. Se ainda não existir quem você precisa, crie aqui mesmo
        — o cadastro continua aberto.
      </p>

      {role === "comercial" && (
        <>
          <Campo
            label="Equipe *"
            hint={<BotaoCriar onClick={() => setEquipeRapida(true)}>Criar nova equipe</BotaoCriar>}
          >
            {equipes.length === 0 ? (
              <button
                type="button"
                onClick={() => setEquipeRapida(true)}
                className="w-full rounded-xl border border-dashed p-4 text-sm text-muted-foreground hover:border-primary/50"
              >
                <UsersRound className="h-4 w-4 inline mr-1.5" /> Nenhuma equipe ainda — criar a primeira
              </button>
            ) : (
              <Select value={form.equipe_id || ""} onValueChange={(v) => set({ equipe_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a equipe" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[100001] max-h-[280px]">
                  {equipes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Campo>
          <Campo label="Líder direto" hint={<BotaoCriar onClick={() => setPessoaRapida("lider")}>Criar novo líder</BotaoCriar>}>
            <Select value={form.lider_id || "none"} onValueChange={(v) => set({ lider_id: v === "none" ? undefined : v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100001] max-h-[280px]">
                <SelectItem value="none">{lideres.length === 0 ? "Nenhum líder cadastrado" : "Sem líder direto"}</SelectItem>
                {lideres.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </>
      )}

      {role === "lider" && (
        <>
          <Campo
            label="Equipes que lidera"
            hint={<BotaoCriar onClick={() => setEquipeRapida(true)}>Criar nova equipe</BotaoCriar>}
          >
            {equipes.length === 0 ? (
              <button
                type="button"
                onClick={() => setEquipeRapida(true)}
                className="w-full rounded-xl border border-dashed p-4 text-sm text-muted-foreground hover:border-primary/50"
              >
                <UsersRound className="h-4 w-4 inline mr-1.5" /> Nenhuma equipe ainda — criar a primeira
              </button>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 max-h-48 overflow-y-auto rounded-xl border p-2">
                {equipes.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={equipesLider.includes(e.id)}
                      onCheckedChange={(v) => setEquipesLider((p) => (v ? [...p, e.id] : p.filter((x) => x !== e.id)))}
                    />
                    <span className="text-sm">{e.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </Campo>
          <Campo
            label={`Administrativo responsável${administrativos.length > 0 ? " *" : ""}`}
            hint={<BotaoCriar onClick={() => setPessoaRapida("administrativo")}>Criar novo administrativo</BotaoCriar>}
          >
            <Select
              value={form.administrativo_id || "none"}
              onValueChange={(v) => set({ administrativo_id: v === "none" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[100001] max-h-[280px]">
                <SelectItem value="none">{administrativos.length === 0 ? "Nenhum cadastrado — definir depois" : "Selecione"}</SelectItem>
                {administrativos.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </>
      )}

      {role === "administrativo" && (
        <Campo label="Líder vinculado" hint={<BotaoCriar onClick={() => setPessoaRapida("lider")}>Criar novo líder</BotaoCriar>}>
          <Select value={form.lider_id || "none"} onValueChange={(v) => set({ lider_id: v === "none" ? undefined : v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[100001] max-h-[280px]">
              <SelectItem value="none">{lideres.length === 0 ? "Nenhum líder cadastrado" : "Sem vínculo"}</SelectItem>
              {lideres.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      )}
    </div>
  );

  const renderComplementares = () => (
    <div className="space-y-5">
      <div className="rounded-xl border divide-y">
        <label className="flex items-center justify-between gap-3 p-3 cursor-pointer">
          <div>
            <p className="text-sm font-medium">É funcionário</p>
            <p className="text-xs text-muted-foreground">
              {funcionarioId ? "Já existe registro de funcionário vinculado" : "Cria o registro de funcionário (RH)"}
            </p>
          </div>
          <Switch checked={isFuncionario} onCheckedChange={setIsFuncionario} />
        </label>
        {isFuncionario && (
          <label className="flex items-center justify-between gap-3 p-3 cursor-pointer">
            <div>
              <p className="text-sm font-medium">Bate ponto</p>
              <p className="text-xs text-muted-foreground">Aparece no controle de jornada</p>
            </div>
            <Switch checked={batePonto} onCheckedChange={setBatePonto} />
          </label>
        )}
      </div>

      {isFuncionario && (
        <FuncionarioFormTabs data={funcionario} onChange={setFuncionario} isEditing={editando && !!funcionarioId} />
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Redes sociais</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="WhatsApp">
            <MaskedInput format="(##) #####-####" value={form.whatsapp || ""} onValueChange={(v) => set({ whatsapp: v.value })} placeholder="(00) 00000-0000" />
          </Campo>
          <Campo label="Instagram">
            <Input value={form.instagram || ""} onChange={(e) => set({ instagram: e.target.value })} placeholder="@usuario" />
          </Campo>
          <Campo label="Facebook">
            <Input value={form.facebook || ""} onChange={(e) => set({ facebook: e.target.value })} placeholder="facebook.com/usuario" />
          </Campo>
          <Campo label="LinkedIn">
            <Input value={form.linkedin || ""} onChange={(e) => set({ linkedin: e.target.value })} placeholder="linkedin.com/in/usuario" />
          </Campo>
        </div>
      </div>
    </div>
  );

  const ultima = idxEtapa === etapas.length - 1;
  const etapaAtual = etapas[idxEtapa] ?? etapas[0];

  return (
    <>
      {/* Os diálogos de criação rápida ficam DENTRO do conteúdo: abrem por cima
          sem que o clique neles feche o cadastro principal. */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              {editando ? <Pencil className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              {editando ? editingItem!.nome : "Novo usuário"}
            </DialogTitle>
            <DialogDescription>
              {editando ? "Altere qualquer etapa e salve." : "Preencha as etapas. Dados complementares são opcionais."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            {/* trilha de etapas */}
            <nav className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/20 p-3">
              {etapas.map((e, i) => {
                const Icon = e.icon;
                const ativa = e.id === etapaAtual.id;
                const concluida = !editando && i < idxEtapa;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => irPara(e.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      ativa ? "bg-card shadow-sm" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        ativa ? "bg-primary text-primary-foreground" : concluida ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {concluida ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-sm font-medium", ativa && "text-primary")}>{e.label}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">{e.desc}</span>
                    </span>
                  </button>
                );
              })}
              {editando && (
                <div className="mt-auto rounded-xl border bg-card p-3 text-[11px] text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1.5">
                    <KeyRound className="h-3 w-3" /> Senha: use “Redefinir senha” na lista
                  </p>
                </div>
              )}
            </nav>

            {/* conteúdo */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="md:hidden flex gap-1 overflow-x-auto border-b px-4 py-2">
                {etapas.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => irPara(e.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                      e.id === etapaAtual.id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {carregandoEdicao ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {etapaAtual.id === "dados" && renderDados()}
                    {etapaAtual.id === "acesso" && renderAcesso()}
                    {etapaAtual.id === "vinculos" && renderVinculos()}
                    {etapaAtual.id === "complementares" && renderComplementares()}
                  </>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t px-6 py-3 shrink-0">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <div className="flex gap-2">
                  {idxEtapa > 0 && (
                    <Button variant="outline" onClick={() => setEtapa(etapas[idxEtapa - 1].id)}>Voltar</Button>
                  )}
                  {editando ? (
                    <Button onClick={salvar} disabled={salvando || carregandoEdicao}>
                      {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                      Salvar alterações
                    </Button>
                  ) : role === "parceiro" ? null : ultima ? (
                    <Button onClick={salvar} disabled={salvando}>
                      {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                      Criar usuário
                    </Button>
                  ) : (
                    <>
                      {etapaAtual.id === (precisaVinculo ? "vinculos" : "acesso") && (
                        <Button variant="outline" onClick={salvar} disabled={salvando}>
                          Criar sem complementares
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          const erro = validar(etapaAtual.id);
                          if (erro) {
                            toast.error(erro);
                            return;
                          }
                          setEtapa(etapas[idxEtapa + 1].id);
                        }}
                      >
                        Continuar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
      {/* criação rápida — abrem por cima, sem perder o que foi digitado */}
        <CargoEditorDialog
          open={cargoEditor.open}
          onOpenChange={(o) => setCargoEditor((p) => ({ ...p, open: o }))}
          cargo={cargoEditor.cargo}
          onSaved={(c) => {
            setExtrasCargos((p) => [...p.filter((x) => x.id !== c.id), c]);
            set({ cargo_id: c.id, cargo: c.nome });
            setVersaoCargo((v) => v + 1);
            props.recarregarCargos();
          }}
        />
        <EquipeRapidaDialog
          open={equipeRapida}
          onOpenChange={setEquipeRapida}
          lideres={lideres}
          lideresIniciais={role === "comercial" && form.lider_id ? [form.lider_id] : []}
          onCreated={(e) => {
            setExtrasEquipes((p) => [...p, e]);
            if (role === "comercial") set({ equipe_id: e.id });
            if (role === "lider") setEquipesLider((p) => [...p, e.id]);
            props.recarregarEquipes();
          }}
        />
        <PessoaRapidaDialog
          open={!!pessoaRapida}
          onOpenChange={(o) => !o && setPessoaRapida(null)}
          role={pessoaRapida || "lider"}
          administrativos={administrativos}
          onCreated={(p) => {
            if (pessoaRapida === "lider") {
              setExtrasLideres((l) => [...l, p]);
              set({ lider_id: p.id });
            } else {
              setExtrasAdmins((a) => [...a, p]);
              set({ administrativo_id: p.id });
            }
            props.recarregarPessoas();
          }}
        />
        </DialogContent>
      </Dialog>

    </>
  );
}
