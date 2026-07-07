import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Eye, EyeOff, Save, ShieldCheck, AlertTriangle, Lock } from "lucide-react";

interface DetranMgCreds {
  id?: string;
  corretora_id: string;
  gov_br_cpf: string;
  ativo: boolean;
  senha_configurada?: boolean;
  ultima_consulta_status?: string | null;
  ultima_consulta_em?: string | null;
}

export default function DetranMgCredenciais() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [corretoraId, setCorretoraId] = useState<string | null>(null);
  const [creds, setCreds] = useState<DetranMgCreds | null>(null);
  const [cpf, setCpf] = useState("");
  // Senha nunca é carregada de volta do banco (fica só no Supabase Vault,
  // criptografada). Este campo só é usado quando a pessoa quer DEFINIR uma
  // senha nova - se deixado em branco no salvar, a senha atual (se houver)
  // não é alterada.
  const [novaSenha, setNovaSenha] = useState("");
  const [ativo, setAtivo] = useState(true);

  const loadCorretoraId = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from("corretora_usuarios")
      .select("corretora_id")
      .eq("profile_id", user.id)
      .eq("ativo", true)
      .maybeSingle();
    return (data as any)?.corretora_id ?? null;
  }, [user]);

  const loadCreds = useCallback(async () => {
    setLoading(true);
    try {
      const cId = await loadCorretoraId();
      setCorretoraId(cId);
      if (!cId) return;
      const { data, error } = await (supabase as any)
        .from("detran_mg_credenciais")
        .select("id, corretora_id, gov_br_cpf, ativo, senha_configurada, ultima_consulta_status, ultima_consulta_em")
        .eq("corretora_id", cId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setCreds(data);
        setCpf(data.gov_br_cpf || "");
        setAtivo(data.ativo ?? true);
      }
      setNovaSenha("");
    } catch (e) {
      console.error("Erro ao carregar credenciais Gov.br:", e);
    } finally {
      setLoading(false);
    }
  }, [loadCorretoraId]);

  useEffect(() => {
    if (open) loadCreds();
  }, [open, loadCreds]);

  const handleSave = async () => {
    if (!corretoraId) {
      toast.error("Não foi possível identificar a associação do usuário");
      return;
    }
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      toast.error("Informe um CPF válido (11 dígitos)");
      return;
    }
    if (!creds?.senha_configurada && !novaSenha) {
      toast.error("Informe a senha da conta Gov.br");
      return;
    }
    setSaving(true);
    try {
      // 1) Dados não sensíveis (CPF, ativo) - upsert normal na tabela.
      let currentId = creds?.id;
      if (currentId) {
        const { error } = await (supabase as any)
          .from("detran_mg_credenciais")
          .update({ gov_br_cpf: cleanCpf, ativo })
          .eq("id", currentId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("detran_mg_credenciais")
          .insert({ corretora_id: corretoraId, gov_br_cpf: cleanCpf, ativo })
          .select()
          .single();
        if (error) throw error;
        currentId = data.id;
      }

      // 2) Senha só é enviada se a pessoa digitou uma nova - vai direto para o
      // Supabase Vault via RPC (nunca fica em coluna de texto puro).
      if (novaSenha) {
        const { error: rpcError } = await supabase.rpc("set_detran_mg_senha" as any, {
          p_corretora_id: corretoraId,
          p_senha: novaSenha,
        });
        if (rpcError) throw rpcError;
      }

      toast.success("Login Gov.br salvo!");
      setNovaSenha("");
      await loadCreds();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const formatCpf = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-xl">
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Login Gov.br (Detran-MG)</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Login Gov.br para Detran-MG
          </DialogTitle>
          <DialogDescription>
            Usado para consultar automaticamente multas, licenciamento e IPVA de placas de
            Minas Gerais direto no Detran-MG (exige conta Gov.br nível prata ou ouro). A senha é
            criptografada e nunca é exibida novamente após salva.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">CPF da conta Gov.br</Label>
              <Input
                value={formatCpf(cpf)}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="h-9 text-sm rounded-xl font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                Senha
                {creds?.senha_configurada && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-normal">
                    <Lock className="h-3 w-3" /> já configurada
                  </span>
                )}
              </Label>
              <div className="flex gap-1">
                <Input
                  type={showSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder={creds?.senha_configurada ? "•••••••• (deixe em branco para manter)" : "Digite a senha"}
                  className="h-9 text-sm rounded-xl"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl"
                  onClick={() => setShowSenha(!showSenha)}
                  type="button"
                >
                  {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Label className="text-xs">Consulta automática ativa</Label>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </div>

            {creds?.ultima_consulta_status && (
              <p className="text-[11px] text-muted-foreground">
                Última consulta: {creds.ultima_consulta_status}
                {creds.ultima_consulta_em ? ` em ${new Date(creds.ultima_consulta_em).toLocaleString("pt-BR")}` : ""}
              </p>
            )}

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                Contas Gov.br nível prata/ouro normalmente pedem confirmação em duas etapas
                (2FA) em novos logins. Isso pode fazer a consulta automática falhar
                periodicamente — nesse caso, será necessário confirmar manualmente.
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full h-9 text-sm gap-1.5 rounded-xl">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Login
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
