import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Archive, Ban, Check, Lock, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComentariosPanel } from "./ComentariosPanel";
import { COTACAO_TRAVADA, STATUS_COTACAO, type ComercialCotacao, type CotacaoStatus } from "./types";

const NENHUM = "__nenhum__";
const STATUS_VENDEDOR: CotacaoStatus[] = ["rascunho", "enviada", "aprovada", "emitida"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  produtos: string[];
  produtoSugerido?: string | null;
  cotacao: ComercialCotacao | null;
  /** Usuário pode alterar registros do vendedor desta cotação (dono ou gerente da equipe). */
  podeEditar: boolean;
  /** Gerente/Admin: cancela, aprova pedido de cancelamento, arquiva, edita travadas. */
  gestor: boolean;
}

export function CotacaoDialog({ open, onOpenChange, leadId, leadNome, produtos, produtoSugerido, cotacao, podeEditar, gestor }: Props) {
  const qc = useQueryClient();
  const [produto, setProduto] = useState(NENHUM);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [status, setStatus] = useState<CotacaoStatus>("rascunho");
  const [motivo, setMotivo] = useState("");
  const [pedindoCancelamento, setPedindoCancelamento] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProduto(cotacao?.produto ?? produtoSugerido ?? NENHUM);
    setDescricao(cotacao?.descricao ?? "");
    setValor(Number(cotacao?.valor ?? 0));
    setStatus(cotacao?.status ?? "rascunho");
    setMotivo(cotacao?.motivo_cancelamento ?? "");
    setPedindoCancelamento(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cotacao?.id]);

  const travada = !!cotacao && COTACAO_TRAVADA.includes(cotacao.status);
  const editavel = podeEditar && (!cotacao || gestor || !travada);
  const opcoesStatus: CotacaoStatus[] = !cotacao
    ? ["rascunho", "enviada"]
    : gestor
      ? (["rascunho", "enviada", "aprovada", "emitida"] as CotacaoStatus[])
      : STATUS_VENDEDOR;

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["comercial_cotacoes"] });
    qc.invalidateQueries({ queryKey: ["comercial_auditoria"] });
  };

  const gravar = useMutation({
    mutationFn: async (extra: Partial<ComercialCotacao> = {}) => {
      const payload: Record<string, unknown> = {
        produto: produto === NENHUM ? null : produto,
        descricao: descricao.trim() || null,
        valor: valor || 0,
        status,
        ...extra,
      };
      const q = (supabase as any).from("comercial_cotacoes");
      const { error } = cotacao
        ? await q.update(payload).eq("id", cotacao.id)
        : await q.insert({ ...payload, lead_id: leadId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(cotacao ? "Cotação atualizada" : "Cotação criada");
      invalidar();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Ações de status que não mexem nos demais campos.
  const acao = useMutation({
    mutationFn: async (patch: Partial<ComercialCotacao>) => {
      const { error } = await (supabase as any).from("comercial_cotacoes").update(patch).eq("id", cotacao!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cotação atualizada");
      invalidar();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exigirMotivo = () => {
    if (!motivo.trim()) {
      toast.error("Informe o motivo");
      return false;
    }
    return true;
  };

  const titulo = cotacao ? `Cotação nº ${cotacao.numero}` : "Nova cotação";
  const st = cotacao ? STATUS_COTACAO[cotacao.status] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {titulo}
            {st && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.classe}`}>{st.label}</span>}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{leadNome}</p>
        </DialogHeader>

        {!editavel && cotacao && (
          <div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            {podeEditar ? "Cotação travada — só o gerente altera a partir deste status." : "Modo leitura — você pode comentar."}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Produto</Label>
            <Select value={produto} onValueChange={setProduto} disabled={!editavel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Não informado</SelectItem>
                {[...produtos, ...(produto !== NENHUM && !produtos.includes(produto) ? [produto] : [])].map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Valor</Label>
            <CurrencyInput
              value={valor}
              disabled={!editavel}
              onValueChange={(v) => setValor(v.floatValue ?? 0)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Status</Label>
            <Select
              value={opcoesStatus.includes(status) ? status : undefined}
              onValueChange={(v) => setStatus(v as CotacaoStatus)}
              disabled={!editavel || (!!cotacao && !opcoesStatus.includes(cotacao.status))}
            >
              <SelectTrigger>
                <SelectValue placeholder={STATUS_COTACAO[status].label} />
              </SelectTrigger>
              <SelectContent>
                {opcoesStatus.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_COTACAO[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!gestor && editavel && (
              <p className="text-[11px] text-muted-foreground">Ao marcar Aprovada ou Emitida, só o gerente altera depois.</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição / condições</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!editavel} />
          </div>
        </div>

        {cotacao && (cotacao.motivo_cancelamento || cotacao.status === "cancelamento_solicitado") && !pedindoCancelamento && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm space-y-1">
            <p className="font-medium">Motivo do cancelamento</p>
            <p className="text-muted-foreground whitespace-pre-wrap">{cotacao.motivo_cancelamento || "—"}</p>
            {cotacao.cancelada_em && (
              <p className="text-xs text-muted-foreground">
                Cancelada em {format(new Date(cotacao.cancelada_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        )}

        {cotacao && (pedindoCancelamento || (gestor && podeEditar && cotacao.status !== "cancelada")) && (
          <div className="space-y-2">
            <Label>{gestor ? "Justificativa do cancelamento" : "Motivo do pedido de cancelamento"} *</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        )}

        {cotacao && <ComentariosPanel entidade="cotacao" entidadeId={cotacao.id} />}

        <DialogFooter className="gap-2 sm:justify-between flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {cotacao && gestor && podeEditar && cotacao.status === "cancelamento_solicitado" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => exigirMotivo() && acao.mutate({ status: "cancelada", motivo_cancelamento: motivo.trim() })}
                >
                  <Check className="h-4 w-4 mr-1" /> Aprovar cancelamento
                </Button>
                <Button
                  variant="outline"
                  onClick={() => acao.mutate({ status: cotacao.status_anterior ?? "enviada", motivo_cancelamento: null })}
                >
                  <Undo2 className="h-4 w-4 mr-1" /> Recusar
                </Button>
              </>
            )}
            {cotacao && gestor && podeEditar && !["cancelada", "cancelamento_solicitado"].includes(cotacao.status) && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => exigirMotivo() && acao.mutate({ status: "cancelada", motivo_cancelamento: motivo.trim() })}
              >
                <Ban className="h-4 w-4 mr-1" /> Cancelar cotação
              </Button>
            )}
            {cotacao && !gestor && podeEditar && !travada && (
              pedindoCancelamento ? (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    exigirMotivo() && acao.mutate({ status: "cancelamento_solicitado", motivo_cancelamento: motivo.trim() })
                  }
                >
                  <Ban className="h-4 w-4 mr-1" /> Enviar pedido
                </Button>
              ) : (
                <Button variant="ghost" className="text-destructive" onClick={() => setPedindoCancelamento(true)}>
                  <Ban className="h-4 w-4 mr-1" /> Solicitar cancelamento
                </Button>
              )
            )}
            {cotacao && gestor && podeEditar && (
              <Button
                variant="ghost"
                onClick={() => acao.mutate({ arquivado_em: cotacao.arquivado_em ? null : new Date().toISOString() })}
              >
                <Archive className="h-4 w-4 mr-1" /> {cotacao.arquivado_em ? "Desarquivar" : "Arquivar"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {editavel && (
              <Button onClick={() => gravar.mutate({})} disabled={gravar.isPending}>
                Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
