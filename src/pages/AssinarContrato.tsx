import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, CheckCircle2, Clock, Download, Loader2, Mail, MessageCircle, PenLine, ShieldCheck, XCircle } from "lucide-react";
import { uonisign, PaginaAssinatura } from "@/lib/uonisign/api";
import PdfViewer from "@/components/uonisign/PdfViewer";

const LOGO = "/images/vangard-logo.png";
const fmt = (iso?: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "");

function Tela({ icone, titulo, children }: { icone: React.ReactNode; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-md w-full rounded-2xl">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <img src={LOGO} alt="Vangard" className="h-9 mx-auto object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto bg-muted">{icone}</div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

/** Página pública de assinatura do fluxo 2 (link individual do signatário). */
export default function AssinarContrato() {
  const { token = "" } = useParams<{ token: string }>();
  const [aceite, setAceite] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState<string | null>(null);
  const [enviandoCodigo, setEnviandoCodigo] = useState<string | null>(null);
  const [assinando, setAssinando] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);

  const { data: p, isLoading, error, refetch } = useQuery<PaginaAssinatura>({
    queryKey: ["assinar", token],
    queryFn: () => uonisign.abrir(token),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Carregando" />
      </div>
    );
  }
  if (error || !p) {
    return (
      <Tela icone={<XCircle className="h-7 w-7 text-destructive" />} titulo="Link inválido">
        <p className="text-sm text-muted-foreground">Confira se o link está completo ou peça um novo a quem enviou o contrato.</p>
      </Tela>
    );
  }

  const baixar = p.pdf_url ? (
    <Button asChild className="w-full rounded-xl">
      <a href={p.pdf_url} target="_blank" rel="noreferrer">
        <Download className="h-4 w-4 mr-2" /> {p.estado === "concluido" ? "Baixar contrato assinado" : "Baixar PDF"}
      </a>
    </Button>
  ) : null;

  switch (p.estado) {
    case "concluido":
      return (
        <Tela icone={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} titulo="Contrato assinado">
          <p className="text-sm text-muted-foreground">
            {p.contrato.titulo} — todas as partes assinaram{p.contrato.concluido_em ? ` em ${fmt(p.contrato.concluido_em)}` : ""}.
          </p>
          {baixar}
          {p.contrato.codigo_verificacao && (
            <a href={`/validar/${p.contrato.codigo_verificacao}`} className="text-xs text-primary underline flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Conferir autenticidade (código {p.contrato.codigo_verificacao})
            </a>
          )}
        </Tela>
      );
    case "processando":
      return (
        <Tela icone={<Clock className="h-7 w-7 text-violet-600" />} titulo="Assinaturas concluídas">
          <p className="text-sm text-muted-foreground">Estamos finalizando o documento. Você receberá a cópia assinada em instantes.</p>
        </Tela>
      );
    case "cancelado":
      return (
        <Tela icone={<XCircle className="h-7 w-7 text-red-600" />} titulo="Contrato cancelado">
          <p className="text-sm text-muted-foreground">Este contrato foi cancelado e não pode mais ser assinado.</p>
        </Tela>
      );
    case "recusado":
      return (
        <Tela icone={<XCircle className="h-7 w-7 text-red-600" />} titulo="Contrato recusado">
          <p className="text-sm text-muted-foreground">A assinatura foi recusada{p.contrato.motivo_recusa ? `: “${p.contrato.motivo_recusa}”` : "."}</p>
        </Tela>
      );
    case "expirado":
      return (
        <Tela icone={<Clock className="h-7 w-7 text-amber-600" />} titulo="Prazo encerrado">
          <p className="text-sm text-muted-foreground">O prazo para assinar terminou. Fale com quem enviou o contrato para receber um novo.</p>
        </Tela>
      );
    case "documento_indisponivel":
      return (
        <Tela icone={<AlertCircle className="h-7 w-7 text-red-600" />} titulo="Documento indisponível">
          <p className="text-sm text-muted-foreground">Não foi possível confirmar a integridade do documento. A equipe responsável já foi avisada.</p>
        </Tela>
      );
    case "indisponivel":
      return <Tela icone={<AlertCircle className="h-7 w-7 text-amber-600" />} titulo="Contrato indisponível" />;
  }

  const podeAssinar = p.estado === "pode_assinar";
  const jaAssinou = p.estado === "ja_assinou";
  const bloqueado = p.signatario.bloqueado_ate;
  const whatsapp = p.signatario.canais.includes("whatsapp");

  const pedirCodigo = async (canal: "email" | "whatsapp") => {
    setEnviandoCodigo(canal);
    setErroCodigo(null);
    try {
      const r = await uonisign.solicitarCodigo(token, canal);
      setCodigoEnviado(`Enviamos um código para ${r.destino}. Ele vale por ${r.validade_min} minutos.`);
      setCodigo("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviandoCodigo(null);
    }
  };

  const assinar = async () => {
    setAssinando(true);
    setErroCodigo(null);
    try {
      await uonisign.assinar(token, codigo);
      toast.success("Contrato assinado!");
      setCodigo("");
      refetch();
    } catch (e) {
      setErroCodigo((e as Error).message);
      refetch();
    } finally {
      setAssinando(false);
    }
  };

  const recusar = async () => {
    try {
      await uonisign.recusar(token, motivo.trim());
      setRecusando(false);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <img src={LOGO} alt="Vangard" className="h-8 object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <Badge variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Assinatura com código
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4 pb-16">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">{p.contrato.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            Contrato nº {p.contrato.numero}
            {p.signatario.expira_em && podeAssinar && <span className="text-amber-700"> · assine até {fmt(p.signatario.expira_em)}</span>}
          </p>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <h2 className="font-semibold">1. Leia o documento</h2>
            {p.pdf_url && <PdfViewer url={p.pdf_url} alturaMax="60vh" />}
            {baixar}
            {p.contrato.hash && <p className="text-[11px] text-muted-foreground break-all">Hash SHA-256: {p.contrato.hash}</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-5 space-y-2">
            <h2 className="font-semibold text-sm">Signatários</h2>
            {p.signatarios.map((s, i) => (
              <div key={i} className={`flex items-center justify-between rounded-xl p-2.5 text-sm ${s.voce ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/30"}`}>
                <span>
                  <strong>{s.papel}</strong> — {s.nome}
                  {s.voce && <span className="text-primary"> (você)</span>}
                </span>
                {s.status === "assinado" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 border-0">Assinado</Badge>
                ) : s.status === "recusado" ? (
                  <Badge className="bg-red-500/15 text-red-700 border-0">Recusado</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-700 border-amber-300">Pendente</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {jaAssinou && (
          <Card className="rounded-2xl border-emerald-200">
            <CardContent className="p-5 text-sm flex gap-2 items-start">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>Você assinou em {fmt(p.signatario.assinado_em)}. Quando todos assinarem, você receberá a cópia final.</span>
            </CardContent>
          </Card>
        )}

        {p.estado === "aguardando_outros" && (
          <Card className="rounded-2xl">
            <CardContent className="p-5 text-sm flex gap-2 items-start">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <span>Este contrato aguarda a assinatura de outro signatário antes da sua. Você receberá um aviso quando for a sua vez.</span>
            </CardContent>
          </Card>
        )}

        {podeAssinar && (
          <Card className="rounded-2xl border-primary/30">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <h2 className="font-semibold">2. Assine como {p.signatario.nome}</h2>

              <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 p-3">
                <Checkbox id="aceite" checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
                <Label htmlFor="aceite" className="text-sm leading-relaxed font-normal">
                  Li e concordo com os termos do contrato.
                </Label>
              </div>

              {bloqueado ? (
                <p className="text-sm text-red-700" role="alert">
                  Muitas tentativas incorretas. Tente novamente após {fmt(bloqueado)}.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-sm">Receba um código de confirmação de 6 dígitos:</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button variant="outline" className="rounded-xl" onClick={() => pedirCodigo("email")} disabled={!!enviandoCodigo}>
                        {enviandoCodigo === "email" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                        Por e-mail ({p.signatario.email})
                      </Button>
                      {whatsapp && (
                        <Button variant="outline" className="rounded-xl" onClick={() => pedirCodigo("whatsapp")} disabled={!!enviandoCodigo}>
                          {enviandoCodigo === "whatsapp" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2 text-emerald-600" />}
                          Por WhatsApp ({p.signatario.telefone})
                        </Button>
                      )}
                    </div>
                    {codigoEnviado && (
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {codigoEnviado}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código de confirmação</Label>
                    <InputOTP id="codigo" maxLength={6} value={codigo} onChange={setCodigo} inputMode="numeric" autoComplete="one-time-code">
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                    {erroCodigo && (
                      <p className="text-sm text-destructive" role="alert">
                        {erroCodigo}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-2">
                <Button variant="ghost" className="text-red-600" onClick={() => setRecusando(true)}>
                  Recusar
                </Button>
                <Button size="lg" className="rounded-xl sm:min-w-[220px]" onClick={assinar} disabled={!aceite || codigo.length !== 6 || assinando || !!bloqueado}>
                  {assinando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
                  Assinar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Registramos data, hora, IP, dispositivo e o hash do documento assinado.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={recusando} onOpenChange={setRecusando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar a assinatura?</DialogTitle>
            <DialogDescription>Conte o motivo para quem enviou o contrato poder corrigir. O contrato será encerrado.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="motivo">Motivo</Label>
          <Textarea id="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: o valor da mensalidade está diferente do combinado" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecusando(false)}>
              Voltar
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={motivo.trim().length < 5} onClick={recusar}>
              Recusar assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
