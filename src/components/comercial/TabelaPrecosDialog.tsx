import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSignature, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampoFormulario } from "@/components/uonisign/NovoContratoWizard";
import { validarCampo, type Dados } from "../../../supabase/functions/uonisign/modelo";
import { camposComerciais, useProdutosContrato } from "./produtosContrato";

const NENHUM = "__nenhum__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Produtos cadastrados nos funis */
  produtos: string[];
}

/** Administrador: liga cada produto a um modelo de contrato e define a tabela de preços. */
export function TabelaPrecosDialog({ open, onOpenChange, produtos }: Props) {
  const qc = useQueryClient();
  const { data } = useProdutosContrato(open);
  const lista = useMemo(
    () => [...new Set([...produtos, ...(data ? [...data.configs.keys()] : [])])].sort((a, b) => a.localeCompare(b)),
    [produtos, data],
  );
  const [produto, setProduto] = useState("");
  const [modeloId, setModeloId] = useState(NENHUM);
  const [valores, setValores] = useState<Dados>({});
  const [travados, setTravados] = useState<string[]>([]);

  useEffect(() => {
    if (open && !produto && lista.length) setProduto(lista[0]);
  }, [open, lista, produto]);

  // Carrega a configuração do produto escolhido
  useEffect(() => {
    if (!open || !data || !produto) return;
    const cfg = data.configs.get(produto);
    setModeloId(cfg?.template_id ?? NENHUM);
    setValores({ ...(cfg?.valores ?? {}) });
    setTravados([...(cfg?.travados ?? [])]);
  }, [open, data, produto]);

  const modelo = modeloId === NENHUM ? null : (data?.modeloPorId.get(modeloId) ?? null);
  const campos = camposComerciais(modelo);

  const salvar = useMutation({
    mutationFn: async () => {
      const limpos: Dados = {};
      for (const c of campos) {
        const v = (valores[c.chave] ?? "").trim();
        if (!v) continue;
        const erro = validarCampo(c, v);
        if (erro) throw new Error(`${c.rotulo}: ${erro}`);
        limpos[c.chave] = v;
      }
      const chaves = new Set(campos.map((c) => c.chave));
      const { data: u } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("comercial_produtos_contrato").upsert({
        produto,
        template_id: modelo?.id ?? null,
        valores: limpos,
        // só trava o que tem valor definido
        travados: travados.filter((k) => chaves.has(k) && limpos[k]),
        ativo: true,
        updated_by: u.user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Tabela de "${produto}" salva`);
      qc.invalidateQueries({ queryKey: ["comercial_produtos_contrato"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" /> Tabela de preços e contratos
          </DialogTitle>
          <DialogDescription>
            Ligue cada produto a um modelo de contrato do Uon1 Sign e defina os valores padrão. Eles entram prontos na cotação; os
            marcados como travados o vendedor não altera.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Produto</Label>
            <Select value={produto} onValueChange={setProduto}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o produto" />
              </SelectTrigger>
              <SelectContent>
                {lista.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                    {data?.configs.get(p)?.template_id ? "" : " (sem contrato)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Modelo de contrato</Label>
            <Select value={modeloId} onValueChange={setModeloId} disabled={!produto}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Sem contrato vinculado</SelectItem>
                {(data?.modelos ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {modelo ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Valores e condições padrão</p>
            <p className="text-xs text-muted-foreground">
              São os campos de preço e vigência do modelo. Deixe em branco o que o vendedor deve preencher em cada cotação.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {campos.map((c) => (
                <div key={c.chave} className="space-y-1.5 rounded-xl border p-3">
                  <CampoFormulario
                    campo={{ ...c, obrigatorio: false }}
                    valor={valores[c.chave] ?? ""}
                    onChange={(v) => setValores((x) => ({ ...x, [c.chave]: v }))}
                    onBlur={() => {}}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={travados.includes(c.chave)}
                      disabled={!(valores[c.chave] ?? "").trim()}
                      onCheckedChange={(v) =>
                        setTravados((t) => (v === true ? [...new Set([...t, c.chave])] : t.filter((k) => k !== c.chave)))
                      }
                    />
                    <Lock className="h-3 w-3" /> Vendedor não altera
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground rounded-xl border bg-muted/30 p-3">
            Sem modelo vinculado, a cotação deste produto continua simples (valor e descrição), sem proposta online nem contrato automático.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!produto || salvar.isPending}>
            Salvar tabela
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
