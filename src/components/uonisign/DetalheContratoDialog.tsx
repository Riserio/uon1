import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  RotateCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { uonisign, STATUS_V2, NivelUoniSign, ContratoV2 } from "@/lib/uonisign/api";
import { formatarMoeda, mascarar, mascararEmail, mascararTelefone, soDigitos } from "../../../supabase/functions/uonisign/modelo";

const fmt = (iso?: string | null, comHora = true) =>
  iso ? format(new Date(iso), comHora ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: ptBR }) : "—";

const ICONE_EVENTO: Record<string, React.ReactNode> = {
  assinado: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  concluido: <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />,
  recusado: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  cancelado: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  expirado: <Clock className="h-3.5 w-3.5 text-gray-500" />,
  envio_falhou: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  whatsapp_falhou: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  integridade_falhou: <AlertTriangle className="h-3.5 w-3.5 text-red-600" />,
  lacre_falhou: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  visualizado: <Eye className="h-3.5 w-3.5 text-sky-600" />,
};

interface Props {
  contrato: ContratoV2;
  nivel: NivelUoniSign;
  souDono: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function DetalheContratoDialog({ contrato, nivel, souDono, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [corrigindo, setCorrigindo] = useState<any>(null);

  const { data, refetch } = useQuery({
    queryKey: ["uonisign_detalhe", contrato.id],
    queryFn: async () => {
      const [sigs, eventos, modelo] = await Promise.all([
        supabase.from("contrato_assinaturas").select("*").eq("contrato_id", contrato.id).order("ordem"),
        supabase.from("contrato_historico").select("*").eq("contrato_id", contrato.id).order("created_at"),
        contrato.template_id
          ? supabase.from("contrato_templates").select("titulo").eq("id", contrato.template_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { sigs: (sigs.data ?? []) as any[], eventos: (eventos.data ?? []) as any[], modelo: (modelo as any).data };
    },
    enabled: open,
  });

  const atualizar = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["contratos"] });
  };

  const executar = async (rotulo: string, fn: () => Promise<unknown>, sucesso: string) => {
    setOcupado(rotulo);
    try {
      await fn();
      toast.success(sucesso);
      atualizar();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const abrirPdf = async (tipo: "original" | "final", download: boolean) => {
    try {
      const { url } = await uonisign.url(contrato.id, tipo, download);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const status = STATUS_V2[contrato.status] ?? STATUS_V2.rascunho;
  const backoffice = nivel === "admin" || nivel === "operador";
  const podeReenviar = backoffice || souDono;
  const ativo = ["aguardando_assinatura", "parcialmente_assinado"].includes(contrato.status);
  const alguemAssinou = (data?.sigs ?? []).some((s) => s.status === "assinado");
  const podeCancelar =
    ["rascunho", "aguardando_assinatura", "parcialmente_assinado"].includes(contrato.status) &&
    (nivel === "admin" || (souDono && !alguemAssinou));
  const dados = contrato.variaveis_preenchidas ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{contrato.numero}</span>
            <Badge variant="outline" className={status.cor}>
              {status.label}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-foreground font-medium">{contrato.titulo}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <Info rotulo="Contratante" valor={contrato.contratante_nome} />
          <Info rotulo="CNPJ" valor={contrato.contratante_cnpj} />
          <Info rotulo="Modelo" valor={`${data?.modelo?.titulo ?? "—"} · versão ${contrato.template_versao ?? "—"}`} />
          <Info rotulo="Valor" valor={contrato.valor_contrato != null ? formatarMoeda(Number(contrato.valor_contrato)) : "—"} />
          <Info rotulo="Vigência" valor={`${fmt(contrato.data_inicio, false)} a ${fmt(contrato.data_fim, false)}`} />
          <Info rotulo="Criado em" valor={fmt(contrato.created_at)} />
          <Info rotulo="Enviado em" valor={fmt(contrato.enviado_em)} />
          <Info rotulo={contrato.status === "assinado" ? "Concluído em" : "Prazo do convite atual"} valor={fmt(contrato.status === "assinado" ? contrato.concluido_em : contrato.expira_em)} />
          {backoffice && <Info rotulo="RG do representante" valor={dados.Identidade} />}
          {contrato.guardar_ate && <Info rotulo="Guarda até" valor={fmt(contrato.guardar_ate, false)} />}
        </div>

        {contrato.trust_codigo && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-700" /> Uon1 Trust · código <strong className="font-mono">{contrato.trust_codigo}</strong>
              {!contrato.trust_documento_id && <span className="text-xs text-muted-foreground">(registrado ao enviar)</span>}
            </span>
            {contrato.trust_documento_id && (
              <Button size="sm" variant="outline" onClick={() => window.open(`/validar/${contrato.trust_codigo}`, "_blank", "noopener")}>
                Validação pública
              </Button>
            )}
          </div>
        )}

        {contrato.status === "recusado" && contrato.motivo_recusa && (
          <Aviso cor="red" texto={`Recusado em ${fmt(contrato.recusado_em)}. Motivo: ${contrato.motivo_recusa}`} />
        )}
        {contrato.status === "cancelado" && <Aviso cor="red" texto={`Cancelado em ${fmt(contrato.cancelado_em)}. Motivo: ${contrato.motivo_cancelamento ?? "—"}`} />}
        {contrato.status === "assinado_processando" && (
          <Aviso cor="amber" texto={`Todas as partes assinaram. O sistema está concluindo o documento (relatório${contrato.lacre_status === "erro" ? " e lacre — nova tentativa automática" : ""}). ${contrato.lacre_erro ?? ""}`} />
        )}
        {contrato.status === "assinado" && contrato.lacre_status === "nao_configurado" && (
          <Aviso cor="amber" texto="Concluído com relatório de assinaturas e hash. O lacre ICP-Brasil e o carimbo de tempo ainda não estão configurados." />
        )}

        {/* Signatários */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Signatários</h3>
          {(data?.sigs ?? []).length === 0 && <p className="text-sm text-muted-foreground">Ainda não enviado.</p>}
          {(data?.sigs ?? []).map((s) => {
            const pend = s.status === "pendente";
            return (
              <div key={s.id} className="rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.ordem}º {s.tipo === "contratada" ? "Contratada" : "Contratante"} — {s.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {backoffice ? s.email : mascararEmail(s.email)}
                    {s.telefone && ` · ${backoffice ? mascarar("celular", s.telefone) : mascararTelefone(s.telefone)}`}
                    {(s.canais ?? []).includes("whatsapp") && <MessageCircle className="inline h-3 w-3 ml-1 text-emerald-600" />}
                  </p>
                  <p className="text-xs mt-0.5">
                    {s.status === "assinado" && <span className="text-emerald-700">Assinou em {fmt(s.assinado_em)} via {s.canal_validado === "whatsapp" ? "WhatsApp" : "e-mail"}</span>}
                    {s.status === "recusado" && <span className="text-red-700">Recusou em {fmt(s.recusado_em)}</span>}
                    {pend && s.enviado_em && <span className="text-amber-700">Convite em {fmt(s.enviado_em)} · vale até {fmt(s.link_expires_at)}{s.visualizado_em ? " · abriu o documento" : ""}</span>}
                    {pend && !s.enviado_em && <span className="text-muted-foreground">Recebe o convite após o signatário anterior</span>}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap shrink-0">
                  {pend && s.enviado_em && ativo && podeReenviar && (
                    <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => executar("reenviar", () => uonisign.reenviar(s.id, "convite"), "Convite reenviado")}>
                      <RotateCw className="h-3.5 w-3.5 mr-1" /> Reenviar convite
                    </Button>
                  )}
                  {contrato.status === "assinado" && podeReenviar && (
                    <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => executar("copia", () => uonisign.reenviar(s.id, "copia"), "Cópia reenviada")}>
                      <Mail className="h-3.5 w-3.5 mr-1" /> Reenviar cópia
                    </Button>
                  )}
                  {pend && ativo && nivel === "admin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCorrigindo({ id: s.id, nome: s.nome, email: s.email, telefone: s.telefone ?? "", whatsapp: (s.canais ?? []).includes("whatsapp"), motivo: "" })}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Corrigir contato
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Linha do tempo */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Linha do tempo</h3>
          <ol className="relative border-l pl-4 space-y-2">
            {(data?.eventos ?? []).map((ev) => (
              <li key={ev.id} className="text-sm">
                <span className="absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center">
                  {ICONE_EVENTO[ev.acao] ?? <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />}
                </span>
                <span className="text-xs text-muted-foreground mr-2">{fmt(ev.created_at)}</span>
                {ev.descricao}
                {nivel === "admin" && (ev.ip || ev.user_agent) && (
                  <span className="block text-[11px] text-muted-foreground truncate">
                    IP {ev.ip ?? "—"} · {ev.user_agent ?? ""}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            {contrato.pdf_final_path && (
              <Button variant="default" onClick={() => abrirPdf("final", true)}>
                <Download className="h-4 w-4 mr-1" /> PDF assinado
              </Button>
            )}
            {contrato.pdf_original_path && (
              <Button variant="outline" onClick={() => abrirPdf("original", false)}>
                <Eye className="h-4 w-4 mr-1" /> PDF original
              </Button>
            )}
          </div>
          {podeCancelar && (
            <Button variant="ghost" className="text-red-600" onClick={() => setCancelando(true)}>
              <XCircle className="h-4 w-4 mr-1" /> Cancelar contrato
            </Button>
          )}
        </DialogFooter>

        {/* Cancelamento com motivo (RN17) */}
        <Dialog open={cancelando} onOpenChange={setCancelando}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar contrato {contrato.numero}?</DialogTitle>
              <DialogDescription>Os links de assinatura deixam de valer e os signatários pendentes são avisados. Não dá para desfazer.</DialogDescription>
            </DialogHeader>
            <Label htmlFor="motivo-cancel">Motivo</Label>
            <Textarea id="motivo-cancel" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelando(false)}>
                Voltar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={motivo.trim().length < 5 || !!ocupado}
                onClick={async () => {
                  if (await executar("cancelar", () => uonisign.cancelar(contrato.id, motivo.trim()), "Contrato cancelado")) {
                    setCancelando(false);
                    onOpenChange(false);
                  }
                }}
              >
                {ocupado === "cancelar" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Cancelar contrato
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Correção de contato (Admin) */}
        <Dialog open={!!corrigindo} onOpenChange={(o) => !o && setCorrigindo(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Corrigir contato — {corrigindo?.nome}</DialogTitle>
              <DialogDescription>O convite é reenviado para o novo contato e a correção fica registrada na trilha de auditoria.</DialogDescription>
            </DialogHeader>
            {corrigindo && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="c-email">E-mail</Label>
                  <Input id="c-email" value={corrigindo.email} onChange={(e) => setCorrigindo({ ...corrigindo, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="c-tel">Celular</Label>
                  <Input
                    id="c-tel"
                    value={mascarar("celular", corrigindo.telefone)}
                    onChange={(e) => setCorrigindo({ ...corrigindo, telefone: soDigitos(e.target.value) })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={corrigindo.whatsapp} onCheckedChange={(v) => setCorrigindo({ ...corrigindo, whatsapp: v })} /> Enviar também por WhatsApp
                </label>
                <div>
                  <Label htmlFor="c-motivo">Motivo da correção</Label>
                  <Textarea id="c-motivo" rows={2} value={corrigindo.motivo} onChange={(e) => setCorrigindo({ ...corrigindo, motivo: e.target.value })} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCorrigindo(null)}>
                Voltar
              </Button>
              <Button
                disabled={!corrigindo || corrigindo.motivo.trim().length < 5 || !!ocupado}
                onClick={async () => {
                  const c = corrigindo;
                  const ok = await executar(
                    "corrigir",
                    () => uonisign.corrigirContato({ assinatura_id: c.id, email: c.email, telefone: c.telefone, whatsapp: c.whatsapp, motivo: c.motivo.trim() }),
                    "Contato corrigido e convite reenviado",
                  );
                  if (ok) setCorrigindo(null);
                }}
              >
                Salvar e reenviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <p className="font-medium truncate">{valor || "—"}</p>
    </div>
  );
}

function Aviso({ cor, texto }: { cor: "red" | "amber"; texto: string }) {
  const cls = cor === "red" ? "border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300" : "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200";
  return <div className={`rounded-xl border p-3 text-sm ${cls}`}>{texto}</div>;
}
