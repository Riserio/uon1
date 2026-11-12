import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Archive, FileText, Lock, MessageCircle, Plus } from "lucide-react";
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
import { ComentariosPanel } from "./ComentariosPanel";
import { CotacaoDialog } from "./CotacaoDialog";
import { STATUS_COTACAO, type ComercialCotacao, type ComercialEtapa, type ComercialFunil, type ComercialLead, type ComercialVendedor } from "./types";
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
  /** Usuário que só cria para si (Vendedor/Líder): o lead novo fica com ele. */
  vendedorFixoId?: string | null;
  /** Pode alterar este lead (dono, ou gerente da equipe, ou admin). Sem isso: leitura + comentário. */
  podeEditar: boolean;
  /** Gerente/Admin: transfere e arquiva. */
  gestor: boolean;
  /** Vendedores que o usuário pode escolher (null = todos). */
  vendedoresPermitidos?: Set<string> | null;
  /** Pode editar os registros do vendedor (para as cotações do lead). */
  podeEditarVendedor: (vendedorId: string | null | undefined) => boolean;
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

export function LeadDialog({
  open,
  onOpenChange,
  funil,
  etapas,
  vendedores,
  lead,
  etapaInicialId,
  vendedorFixoId,
  podeEditar,
  gestor,
  vendedoresPermitidos,
  podeEditarVendedor,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(vazio());
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [cotacaoAberta, setCotacaoAberta] = useState<{ cotacao: ComercialCotacao | null } | null>(null);

  function vazio(): Form {
    return {
      nome: "",
      associacao: "",
      cargo: "",
      whatsapp: "",
      vendedor_id: vendedorFixoId ?? NENHUM,
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

  const { data: cotacoes = [] } = useQuery({
    queryKey: ["comercial_cotacoes", "lead", lead?.id],
    enabled: open && !!lead,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_cotacoes")
        .select("*")
        .eq("lead_id", lead!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ComercialCotacao[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (form.nome.trim().length < 2) throw new Error("Informe o nome do cliente");
      const zap = somenteDigitos(form.whatsapp);
      if (zap && zap.length < 10) throw new Error("WhatsApp incompleto — informe com DDD");
      if (form.indicacao_externa && !form.indicador_nome.trim()) throw new Error("Informe o nome do indicador");
      if (exigeMotivo && !form.motivo_perda.trim()) throw new Error("Informe o motivo do cancelamento");
      if (!lead && form.vendedor_id === NENHUM && !vendedorFixoId && vendedoresPermitidos)
        throw new Error("Escolha o vendedor responsável");
      const payload = {
        funil_id: funil.id,
        etapa_id: form.etapa_id,
        nome: form.nome.trim(),
        associacao: form.associacao.trim() || null,
        cargo: form.cargo.trim() || null,
        whatsapp: zap || null,
        vendedor_id: !lead && vendedorFixoId ? vendedorFixoId : form.vendedor_id === NENHUM ? null : form.vendedor_id,
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
      qc.invalidateQueries({ queryKey: ["comercial_cotacoes"] });
      if (lead) qc.invalidateQueries({ queryKey: ["comercial_lead_historico", lead.id] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Ninguém exclui: gerente/admin arquivam (some do funil, fica no histórico e na auditoria).
  const arquivar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("comercial_leads")
        .update({ arquivado_em: lead!.arquivado_em ? null : new Date().toISOString() })
        .eq("id", lead!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(lead?.arquivado_em ? "Lead desarquivado" : "Lead arquivado");
      qc.invalidateQueries({ queryKey: ["comercial_leads", funil.id] });
      setConfirmarArquivo(false);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const nomeEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nome ?? "—";
  const zapLink = linkWhatsapp(form.whatsapp);
  const vendedoresOpcoes = vendedores.filter(
    (v) => v.id === form.vendedor_id || (v.ativo && (!vendedoresPermitidos || vendedoresPermitidos.has(v.id))),
  );
  const vendedorTravado = lead ? !gestor || !podeEditar : !!vendedorFixoId;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{!lead ? "Novo lead" : podeEditar ? "Editar lead" : "Lead"}</DialogTitle>
          </DialogHeader>

          {lead && !podeEditar && (
            <div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0" /> Modo leitura — lead de outro vendedor da sua equipe. Você pode comentar.
            </div>
          )}
          {lead?.arquivado_em && (
            <div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Arquivado em {format(new Date(lead.arquivado_em), "dd/MM/yyyy", { locale: ptBR })}.
            </div>
          )}

          <fieldset disabled={!podeEditar} className="grid gap-4 sm:grid-cols-2 min-w-0">
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
              <Select value={form.vendedor_id} onValueChange={(v) => set("vendedor_id", v)} disabled={vendedorTravado}>
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
          </fieldset>

          {lead && (
            <div className="rounded-xl border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Cotações
                </p>
                {podeEditar && (
                  <Button size="sm" variant="outline" onClick={() => setCotacaoAberta({ cotacao: null })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Nova cotação
                  </Button>
                )}
              </div>
              {cotacoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma cotação.</p>
              ) : (
                cotacoes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCotacaoAberta({ cotacao: c })}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50 text-left"
                  >
                    <span className="truncate">
                      nº {c.numero} · {c.produto || "Sem produto"}
                      {c.arquivado_em && <span className="text-muted-foreground"> (arquivada)</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums">
                        {Number(c.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COTACAO[c.status].classe}`}>
                        {STATUS_COTACAO[c.status].label}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {lead && <ComentariosPanel entidade="lead" entidadeId={lead.id} />}

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
            {lead && gestor && podeEditar ? (
              <Button variant="ghost" onClick={() => setConfirmarArquivo(true)}>
                <Archive className="h-4 w-4 mr-1" /> {lead.arquivado_em ? "Desarquivar" : "Arquivar"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {podeEditar ? "Cancelar" : "Fechar"}
              </Button>
              {podeEditar && (
                <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  Salvar
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarArquivo} onOpenChange={setConfirmarArquivo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lead?.arquivado_em ? "Desarquivar" : "Arquivar"} o lead “{lead?.nome}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lead?.arquivado_em
                ? "O lead volta para o funil."
                : "O lead sai do funil, mas o registro, as cotações e o histórico ficam guardados (nada é excluído)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => arquivar.mutate()}>
              {lead?.arquivado_em ? "Desarquivar" : "Arquivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lead && (
        <CotacaoDialog
          open={!!cotacaoAberta}
          onOpenChange={(o) => !o && setCotacaoAberta(null)}
          leadId={lead.id}
          leadNome={lead.nome}
          produtos={funil.produtos}
          produtoSugerido={lead.produto}
          cotacao={cotacaoAberta?.cotacao ?? null}
          podeEditar={podeEditarVendedor(cotacaoAberta?.cotacao?.vendedor_id ?? lead.vendedor_id)}
          gestor={gestor}
        />
      )}
    </>
  );
}
