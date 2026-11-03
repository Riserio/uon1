import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { MessageCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaskedInput } from "@/components/ui/masked-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ComercialEtapa, ComercialFunil, ComercialLead, ComercialVendedor } from "./types";
import { linkWhatsapp, somenteDigitos } from "./utils";

const NENHUM = "__nenhum__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  funil: ComercialFunil;
  etapas: ComercialEtapa[];
  vendedores: ComercialVendedor[];
  lead: ComercialLead | null;
  /** Etapa sugerida ao criar (ex.: quando a mudança de etapa exige motivo). */
  etapaInicialId?: string | null;
}

type Form = {
  nome: string;
  associacao: string;
  cargo: string;
  whatsapp: string;
  vendedor_id: string;
  produto: string;
  indicacao_externa: boolean;
  indicador_nome: string;
  etapa_id: string;
  motivo_perda: string;
  observacoes: string;
};

export function LeadDialog({ open, onOpenChange, funil, etapas, vendedores, lead, etapaInicialId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(vazio());
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  function vazio(): Form {
    return {
      nome: "",
      associacao: "",
      cargo: "",
      whatsapp: "",
      vendedor_id: NENHUM,
      produto: NENHUM,
      indicacao_externa: false,
      indicador_nome: "",
      etapa_id: etapas[0]?.id ?? "",
      motivo_perda: "",
      observacoes: "",
    };
  }

  useEffect(() => {
    if (!open) return;
    if (lead) {
      setForm({
        nome: lead.nome,
        associacao: lead.associacao ?? "",
        cargo: lead.cargo ?? "",
        whatsapp: somenteDigitos(lead.whatsapp),
        vendedor_id: lead.vendedor_id ?? NENHUM,
        produto: lead.produto ?? NENHUM,
        indicacao_externa: lead.indicacao_externa,
        indicador_nome: lead.indicador_nome ?? "",
        etapa_id: etapaInicialId ?? lead.etapa_id,
        motivo_perda: lead.motivo_perda ?? "",
        observacoes: lead.observacoes ?? "",
      });
    } else {
      setForm({ ...vazio(), etapa_id: etapaInicialId ?? etapas[0]?.id ?? "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id, etapaInicialId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const etapaSel = etapas.find((e) => e.id === form.etapa_id);
  const exigeMotivo = etapaSel?.tipo === "perdido";

  const { data: historico } = useQuery({
    queryKey: ["comercial_lead_historico", lead?.id],
    enabled: open && !!lead,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_lead_historico")
        .select("id, etapa_de, etapa_para, created_at")
        .eq("lead_id", lead!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as { id: string; etapa_de: string | null; etapa_para: string | null; created_at: string }[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (form.nome.trim().length < 2) throw new Error("Informe o nome do cliente");
      const zap = somenteDigitos(form.whatsapp);
      if (zap && zap.length < 10) throw new Error("WhatsApp incompleto — informe com DDD");
      if (form.indicacao_externa && !form.indicador_nome.trim()) throw new Error("Informe o nome do indicador");
      if (exigeMotivo && !form.motivo_perda.trim()) throw new Error("Informe o motivo do cancelamento");
      const payload = {
        funil_id: funil.id,
        etapa_id: form.etapa_id,
        nome: form.nome.trim(),
        associacao: form.associacao.trim() || null,
        cargo: form.cargo.trim() || null,
        whatsapp: zap || null,
        vendedor_id: form.vendedor_id === NENHUM ? null : form.vendedor_id,
        produto: form.produto === NENHUM ? null : form.produto,
        indicacao_externa: form.indicacao_externa,
        indicador_nome: form.indicacao_externa ? form.indicador_nome.trim() : null,
        motivo_perda: exigeMotivo ? form.motivo_perda.trim() : null,
        observacoes: form.observacoes.trim() || null,
      };
      const q = (supabase as any).from("comercial_leads");
      const { error } = lead ? await q.update(payload).eq("id", lead.id) : await q.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(lead ? "Lead atualizado" : "Lead cadastrado");
      qc.invalidateQueries({ queryKey: ["comercial_leads", funil.id] });
      if (lead) qc.invalidateQueries({ queryKey: ["comercial_lead_historico", lead.id] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("comercial_leads").delete().eq("id", lead!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead excluído");
      qc.invalidateQueries({ queryKey: ["comercial_leads", funil.id] });
      setConfirmarExclusao(false);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const nomeEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nome ?? "—";
  const zapLink = linkWhatsapp(form.whatsapp);
  const vendedoresOpcoes = vendedores.filter((v) => v.ativo || v.id === form.vendedor_id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome *</Label>
              <Input autoFocus={!lead} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nome da associação</Label>
              <Input value={form.associacao} onChange={(e) => set("associacao", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <div className="flex gap-2">
                <MaskedInput
                  format="(##) #####-####"
                  placeholder="(31) 99999-9999"
                  value={form.whatsapp}
                  onValueChange={(v) => set("whatsapp", v.value)}
                  inputMode="tel"
                />
                {zapLink && (
                  <Button type="button" variant="outline" size="icon" asChild title="Abrir conversa">
                    <a href={zapLink} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4 text-green-600" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={form.vendedor_id} onValueChange={(v) => set("vendedor_id", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem vendedor</SelectItem>
                  {vendedoresOpcoes.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome}
                      {!v.ativo && " (inativo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Produto de interesse</Label>
              <Select value={form.produto} onValueChange={(v) => set("produto", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Não informado</SelectItem>
                  {/* Mantém um produto antigo que saiu da lista do funil, para não sumir do lead. */}
                  {[...funil.produtos, ...(form.produto !== NENHUM && !funil.produtos.includes(form.produto) ? [form.produto] : [])].map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select value={form.etapa_id} onValueChange={(v) => set("etapa_id", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.cor }} />
                        {e.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cliente de indicação externa?</Label>
              <RadioGroup
                className="flex gap-6 pt-2"
                value={form.indicacao_externa ? "sim" : "nao"}
                onValueChange={(v) => set("indicacao_externa", v === "sim")}
              >
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="sim" /> Sim
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="nao" /> Não
                </label>
              </RadioGroup>
            </div>
            {form.indicacao_externa && (
              <div className="space-y-2">
                <Label>Nome do indicador *</Label>
                <Input value={form.indicador_nome} onChange={(e) => set("indicador_nome", e.target.value)} />
              </div>
            )}

            {exigeMotivo && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Motivo do cancelamento *</Label>
                <Input
                  placeholder="Ex.: sem orçamento, fechou com outro fornecedor, sem retorno"
                  value={form.motivo_perda}
                  onChange={(e) => set("motivo_perda", e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={4} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
            </div>
          </div>

          {lead && (
            <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico</p>
              <p className="text-xs text-muted-foreground">
                Cadastrado em {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                {lead.origem === "qrcode" && " · via QR code"}
              </p>
              {(historico ?? [])
                .filter((h) => h.etapa_de)
                .map((h) => (
                  <p key={h.id} className="text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {format(new Date(h.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>{" "}
                    {nomeEtapa(h.etapa_de)} → <b>{nomeEtapa(h.etapa_para)}</b>
                  </p>
                ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {lead ? (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmarExclusao(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o lead “{lead?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead e o histórico dele são apagados. Para tirar do funil sem perder o registro, mova para a etapa de
              cancelado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluir.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
