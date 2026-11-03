import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ETAPAS_PADRAO, PRODUTOS_PADRAO, type ComercialEtapa, type ComercialFunil, type EtapaTipo } from "./types";
import { slugify } from "./utils";

type EtapaForm = { id?: string; nome: string; cor: string; tipo: EtapaTipo };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = novo funil */
  funil: ComercialFunil | null;
  etapas: ComercialEtapa[];
  onSalvo: (funilId: string) => void;
}

const TIPO_LABEL: Record<EtapaTipo, string> = { aberta: "Em andamento", ganho: "Fechado (ganho)", perdido: "Cancelado (c/ motivo)" };

export function FunilConfigDialog({ open, onOpenChange, funil, etapas, onSalvo }: Props) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [produtos, setProdutos] = useState<string[]>([]);
  const [novoProduto, setNovoProduto] = useState("");
  const [listaEtapas, setListaEtapas] = useState<EtapaForm[]>([]);

  useEffect(() => {
    if (!open) return;
    setNome(funil?.nome ?? "");
    setSlug(funil?.slug ?? "");
    setSlugEditado(!!funil);
    setDescricao(funil?.descricao ?? "Cadastre seus dados e nossa equipe entra em contato.");
    setAtivo(funil?.ativo ?? true);
    setProdutos(funil ? [...funil.produtos] : [...PRODUTOS_PADRAO]);
    setNovoProduto("");
    setListaEtapas(
      funil
        ? etapas.map((e) => ({ id: e.id, nome: e.nome, cor: e.cor, tipo: e.tipo }))
        : ETAPAS_PADRAO.map((e) => ({ nome: e.nome, cor: e.cor, tipo: e.tipo })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, funil?.id]);

  const setEtapa = (i: number, patch: Partial<EtapaForm>) =>
    setListaEtapas((l) => l.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const moverEtapa = (i: number, d: -1 | 1) =>
    setListaEtapas((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const salvar = useMutation({
    mutationFn: async () => {
      const s = slugify(slug || nome);
      if (!nome.trim() || !s) throw new Error("Informe o nome do funil");
      const etapasValidas = listaEtapas.map((e) => ({ ...e, nome: e.nome.trim() })).filter((e) => e.nome);
      if (etapasValidas.length === 0) throw new Error("O funil precisa de pelo menos uma etapa");
      if (etapasValidas[0].tipo !== "aberta") throw new Error("A primeira etapa (onde entram os leads novos) precisa ser “Em andamento”");

      const dados = { nome: nome.trim(), slug: s, descricao: descricao.trim() || null, ativo, produtos };
      let funilId = funil?.id;
      if (funil) {
        const { error } = await (supabase as any).from("comercial_funis").update(dados).eq("id", funil.id);
        if (error) throw traduzir(error, s);
      } else {
        const { data, error } = await (supabase as any).from("comercial_funis").insert(dados).select("id").single();
        if (error) throw traduzir(error, s);
        funilId = data.id;
      }

      // Etapas: remove as excluídas, atualiza as existentes e cria as novas.
      const manter = new Set(etapasValidas.filter((e) => e.id).map((e) => e.id));
      for (const e of etapas) {
        if (manter.has(e.id)) continue;
        const { error } = await (supabase as any).from("comercial_etapas").delete().eq("id", e.id);
        if (error) {
          if (error.code === "23503") throw new Error(`A etapa “${e.nome}” tem leads — mova-os antes de excluí-la`);
          throw error;
        }
      }
      for (const [i, e] of etapasValidas.entries()) {
        const linha = { funil_id: funilId, nome: e.nome, cor: e.cor, tipo: e.tipo, ordem: i + 1 };
        const q = (supabase as any).from("comercial_etapas");
        const { error } = e.id ? await q.update(linha).eq("id", e.id) : await q.insert(linha);
        if (error) throw error;
      }
      return funilId as string;
    },
    onSuccess: (id) => {
      toast.success("Funil salvo");
      qc.invalidateQueries({ queryKey: ["comercial_funis"] });
      qc.invalidateQueries({ queryKey: ["comercial_etapas", id] });
      onSalvo(id);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{funil ? "Configurar funil" : "Novo funil"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={nome}
                placeholder="Fenaprove / Virada Regulatória"
                onChange={(e) => {
                  setNome(e.target.value);
                  if (!slugEditado) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço do cadastro</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">/c/</span>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlugEditado(true);
                    setSlug(slugify(e.target.value));
                  }}
                />
              </div>
              {funil && funil.slug !== slugify(slug) && (
                <p className="text-xs text-destructive">QR codes já impressos com o endereço antigo deixam de funcionar.</p>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Texto da página de cadastro</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              Funil ativo (desativado, a página do QR code fica indisponível)
            </label>
          </div>

          <div className="space-y-2">
            <Label>Produtos</Label>
            <div className="flex flex-wrap gap-2">
              {produtos.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                  {p}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setProdutos((l) => l.filter((x) => x !== p))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const p = novoProduto.trim();
                if (p && !produtos.includes(p)) setProdutos((l) => [...l, p]);
                setNovoProduto("");
              }}
            >
              <Input placeholder="Adicionar produto" value={novoProduto} onChange={(e) => setNovoProduto(e.target.value)} />
              <Button type="submit" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <div className="space-y-2">
            <Label>Etapas do kanban</Label>
            <p className="text-xs text-muted-foreground">A primeira etapa recebe os leads novos (inclusive os do QR code).</p>
            <div className="space-y-2">
              {listaEtapas.map((e, i) => (
                <div key={e.id ?? `nova-${i}`} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={e.cor}
                    onChange={(ev) => setEtapa(i, { cor: ev.target.value })}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
                  />
                  <Input value={e.nome} onChange={(ev) => setEtapa(i, { nome: ev.target.value })} />
                  <Select value={e.tipo} onValueChange={(v) => setEtapa(i, { tipo: v as EtapaTipo })}>
                    <SelectTrigger className="w-[190px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TIPO_LABEL) as EtapaTipo[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" onClick={() => moverEtapa(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => moverEtapa(i, 1)}
                    disabled={i === listaEtapas.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setListaEtapas((l) => l.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setListaEtapas((l) => [...l, { nome: "", cor: "#64748b", tipo: "aberta" }])}
            >
              <Plus className="h-4 w-4 mr-1" /> Etapa
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function traduzir(error: any, slug: string) {
  if (error?.code === "23505") return new Error(`O endereço /c/${slug} já está em uso`);
  return error;
}
