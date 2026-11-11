import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, UsersRound, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErroBanco } from "@/lib/dbErrors";
import { generateSecurePassword } from "@/lib/validationSchemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarUsuarioViaFuncao, nomePerfil, type Equipe, type Profile } from "./tipos";

/**
 * Nova equipe sem sair do cadastro do usuário. Abre por cima do diálogo
 * principal e devolve a equipe criada para já ficar selecionada.
 */
export function EquipeRapidaDialog({
  open,
  onOpenChange,
  lideres,
  lideresIniciais = [],
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lideres: Profile[];
  lideresIniciais?: string[];
  onCreated: (e: Equipe) => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setNome("");
      setDescricao("");
      setSel(lideresIniciais);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome da equipe");
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase
      .from("equipes")
      .insert([{ nome: nome.trim(), descricao: descricao || null, lider_id: sel[0] || null }])
      .select()
      .single();
    if (error) {
      setSalvando(false);
      toast.error(mensagemErroBanco(error, { equipes_nome_key: "Já existe uma equipe com esse nome." }));
      return;
    }
    if (sel.length > 0) {
      const { error: e2 } = await supabase
        .from("equipe_lideres")
        .insert(sel.map((lider_id) => ({ equipe_id: data.id, lider_id })));
      if (e2) toast.warning("Equipe criada, mas não foi possível vincular os líderes");
    }
    setSalvando(false);
    toast.success(`Equipe "${data.nome}" criada`);
    onCreated({ ...(data as Equipe), lideres: sel });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" /> Nova equipe
          </DialogTitle>
          <DialogDescription>O cadastro do usuário continua aberto; a equipe já volta selecionada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Equipe BH Norte" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Líderes</Label>
            {lideres.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Ainda não há líderes. Você pode criar a equipe agora e definir o líder depois.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                {lideres.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={sel.includes(l.id)}
                      onCheckedChange={(v) => setSel((p) => (v ? [...p, l.id] : p.filter((x) => x !== l.id)))}
                    />
                    <span className="text-sm">{l.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Criar equipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cria um Líder ou Administrativo direto do campo de vínculo. Usa a mesma
 * função de criação do cadastro completo (envia o e-mail de acesso).
 */
export function PessoaRapidaDialog({
  open,
  onOpenChange,
  role,
  administrativos = [],
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: "lider" | "administrativo";
  administrativos?: Profile[];
  onCreated: (p: Profile) => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [admId, setAdmId] = useState<string>("none");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setNome("");
      setEmail("");
      setSenha(generateSecurePassword());
      setAdmId("none");
    }
  }, [open]);

  const salvar = async () => {
    if (nome.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Informe nome e um e-mail válido");
      return;
    }
    setSalvando(true);
    try {
      const { userId, emailAcessoEnviado } = await criarUsuarioViaFuncao({
        nome: nome.trim(),
        email: email.trim(),
        password: senha,
        role,
        administrativo_id: role === "lider" && admId !== "none" ? admId : null,
      });
      if (!userId) throw new Error("Usuário criado, mas o retorno veio sem ID");
      toast.success(
        `${nomePerfil(role)} criado${emailAcessoEnviado ? " — dados de acesso enviados por e-mail" : `. Senha: ${senha}`}`,
      );
      onCreated({ id: userId, nome: nome.trim(), email: email.trim(), ativo: true, status: "ativo" });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Novo {nomePerfil(role).toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Cadastro rápido. Ele recebe o acesso por e-mail e você completa os demais dados depois, se quiser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Senha temporária</Label>
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
          </div>
          {role === "lider" && (
            <div className="space-y-1.5">
              <Label>Administrativo responsável</Label>
              <Select value={admId} onValueChange={setAdmId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[100001] max-h-[260px]">
                  <SelectItem value="none">Definir depois</SelectItem>
                  {administrativos.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Criar {nomePerfil(role).toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
