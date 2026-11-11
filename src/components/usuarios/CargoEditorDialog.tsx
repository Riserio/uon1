import { useEffect, useState } from "react";
import { Loader2, Briefcase, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErroBanco } from "@/lib/dbErrors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PermissoesArvore } from "./PermissoesArvore";
import {
  carregarPermissoesCargo,
  expandirParaEdicao,
  permissoesIniciaisCargo,
  salvarPermissoesCargo,
  type MapaPermissoes,
} from "@/lib/permissoes";
import { useInvalidarPermissoes } from "@/hooks/usePermissoes";

export interface CargoBasico {
  id: string;
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  ativo?: boolean;
}

export const CORES_CARGO = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];

const ERROS_CARGO = { cargos_nome_key: "Já existe um cargo com esse nome. Escolha outro nome." };

/**
 * Cria ou edita um cargo JÁ com as permissões, numa tela só. Usado na aba
 * Permissões e, sem sair do cadastro, no diálogo de usuário.
 */
export function CargoEditorDialog({
  open,
  onOpenChange,
  cargo,
  nomeInicial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cargo?: CargoBasico | null;
  nomeInicial?: string;
  onSaved?: (c: CargoBasico) => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState(CORES_CARGO[0]);
  const [ativo, setAtivo] = useState(true);
  const [perms, setPerms] = useState<MapaPermissoes>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidarPermissoes();

  useEffect(() => {
    if (!open) return;
    setNome(cargo?.nome ?? nomeInicial ?? "");
    setDescricao(cargo?.descricao ?? "");
    setCor(cargo?.cor || CORES_CARGO[0]);
    setAtivo(cargo?.ativo ?? true);
    if (cargo) {
      setCarregando(true);
      carregarPermissoesCargo(cargo.id)
        .then((m) => setPerms(expandirParaEdicao(m)))
        .finally(() => setCarregando(false));
    } else {
      setPerms(permissoesIniciaisCargo());
    }
  }, [open, cargo, nomeInicial]);

  const salvar = async () => {
    const n = nome.trim();
    if (!n) {
      toast.error("Informe o nome do cargo");
      return;
    }
    setSalvando(true);
    try {
      let salvo: CargoBasico;
      if (cargo) {
        const { error } = await supabase
          .from("cargos")
          .update({ nome: n, descricao: descricao || null, cor, ativo })
          .eq("id", cargo.id);
        if (error) throw error;
        salvo = { ...cargo, nome: n, descricao, cor, ativo };
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("cargos")
          .insert({ nome: n, descricao: descricao || null, cor, ativo, created_by: user?.id })
          .select("id, nome, descricao, cor, ativo")
          .single();
        if (error) throw error;
        salvo = data as CargoBasico;
      }
      await salvarPermissoesCargo(salvo.id, perms);
      invalidar();
      toast.success(cargo ? "Cargo atualizado" : "Cargo criado com as permissões");
      onSaved?.(salvo);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(mensagemErroBanco(e, ERROS_CARGO));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            {cargo ? `Editar cargo: ${cargo.nome}` : "Novo cargo"}
          </DialogTitle>
          <DialogDescription>
            O cargo define o que a pessoa vê. Quem tiver este cargo enxerga exatamente os módulos e áreas liberados abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Analista de Sinistros" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CORES_CARGO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCor(c)}
                    className={`h-7 w-7 rounded-lg transition-all ${cor === c ? "ring-2 ring-offset-2 ring-primary scale-110" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Resumo das responsabilidades" />
            </div>
            {cargo && (
              <div className="flex items-center gap-2">
                <Switch id="cargo-ativo" checked={ativo} onCheckedChange={setAtivo} />
                <Label htmlFor="cargo-ativo" className="cursor-pointer">Cargo ativo</Label>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">O que este cargo pode acessar</h3>
            </div>
            {carregando ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PermissoesArvore value={perms} onChange={setPerms} />
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {cargo ? "Salvar cargo" : "Criar cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
