import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  PenLine,
  ShieldCheck,
  Type,
  XCircle,
} from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import PreviewContratoPDFDialog from "@/components/gestao/PreviewContratoPDFDialog";
import { downloadContratoPDF } from "@/components/gestao/utils/downloadContratoPDF";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
// parseISO evita o bug de fuso em datas "YYYY-MM-DD" (new Date interpretaria como UTC)
const fmtData = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
const fmtDataHora = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

/** Best-effort do IP público, com fallback silencioso */
async function obterIP(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    if (res.ok) return (await res.json()).ip ?? "N/A";
  } catch {
    /* segue sem IP */
  }
  return "N/A";
}

type ModoAssinatura = "desenhar" | "digitar";

// ---------------------------------------------------------------------------
// Telas de estado (erro / expirado / concluído / aguardando)
// ---------------------------------------------------------------------------
function TelaMensagem({
  icon,
  cor,
  titulo,
  children,
  logoUrl,
}: {
  icon: React.ReactNode;
  cor: string;
  titulo: string;
  children?: React.ReactNode;
  logoUrl?: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted/40 to-background p-4">
      <Card className="max-w-md w-full rounded-2xl shadow-lg border-border/50">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-10 mx-auto object-contain mb-2"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            />
          )}
          <div className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto ${cor}`}>{icon}</div>
          <h2 className="text-xl font-semibold text-foreground">{titulo}</h2>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página de assinatura pública (experiência padrão Clicksign)
// ---------------------------------------------------------------------------
export default function ContratoAssinatura() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const signatarioParam = searchParams.get("s");

  const [aceito, setAceito] = useState(false);
  const [jaVisualizou, setJaVisualizou] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [modo, setModo] = useState<ModoAssinatura>("desenhar");
  const [nomeDigitado, setNomeDigitado] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 150 });

  const { data: contrato, isLoading, error, refetch } = useQuery({
    queryKey: ["contrato-publico", token],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_contrato_publico_por_token", {
        p_link_token: token,
      });
      if (error) throw error;
      if (!data) throw new Error("Contrato não encontrado");
      return data;
    },
    enabled: !!token,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contrato as any;
  const logoUrl: string | undefined =
    c?.contrato_templates?.logo_url || c?.corretoras?.logo_url || "/images/vangard-logo.png";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assinaturasList: any[] = c?.contrato_assinaturas || [];
  const assinaturasCompletas = assinaturasList.filter((a) => a.status === "assinado").length;

  // Signatário atual: prioriza ?s=<id> pendente; senão, o primeiro pendente
  const currentAssinatura = useMemo(() => {
    if (signatarioParam) {
      const alvo = assinaturasList.find((a) => a.id === signatarioParam);
      return alvo && alvo.status === "pendente" ? alvo : null;
    }
    return assinaturasList.find((a) => a.status === "pendente") ?? null;
  }, [signatarioParam, assinaturasList]);

  // ── Canvas: dimensionamento responsivo ──
  useEffect(() => {
    const update = () => {
      const container = canvasRef.current?.parentElement;
      if (!container) return;
      const width = Math.min(container.clientWidth - 16, 600);
      setCanvasSize({ width, height: Math.round(width * 0.3) });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const configurarContexto = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // Renderiza a assinatura digitada no canvas (mesma pipeline de PNG do modo desenho)
  const renderTyped = useCallback(
    (nome: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!nome.trim()) {
        setHasSignature(false);
        return;
      }
      ctx.fillStyle = "#0f172a";
      const fontSize = Math.min(canvas.height * 0.42, 48);
      ctx.font = `italic ${fontSize}px "Segoe Script", "Brush Script MT", cursive`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(nome.trim(), canvas.width / 2, canvas.height / 2);
      setHasSignature(true);
    },
    [],
  );

  // Ajusta dimensões reais do canvas quando o tamanho muda (sem perder o modo digitar)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext("2d");
    if (ctx) configurarContexto(ctx);
    if (modo === "digitar") renderTyped(nomeDigitado);
    else setHasSignature(false); // redimensionar limpa o traço desenhado
  }, [canvasSize, modo, configurarContexto, renderTyped, nomeDigitado]);

  const getCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = "touches" in e ? e.touches[0] : e;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  }, []);

  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (modo !== "desenhar") return;
      e.preventDefault();
      setIsDrawing(true);
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    [modo, getCoords],
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing || modo !== "desenhar") return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasSignature(true);
    },
    [isDrawing, modo, getCoords],
  );

  const stopDrawing = useCallback(() => setIsDrawing(false), []);

  const limpar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setNomeDigitado("");
    setHasSignature(false);
  }, []);

  const assinar = useMutation({
    mutationFn: async () => {
      if (!contrato || !currentAssinatura) throw new Error("Contrato inválido");
      if (!hasSignature) throw new Error("Por favor, forneça sua assinatura");
      if (!aceito) throw new Error("Você deve aceitar os termos do contrato");
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Erro ao capturar assinatura");

      const assinaturaDataUrl = canvas.toDataURL("image/png");

      // Geolocalização (best-effort)
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        /* sem geolocalização */
      }

      const ipAddress = await obterIP();

      // Hash de integridade (SHA-256) da trilha de auditoria
      const encoder = new TextEncoder();
      const payload = encoder.encode((c.conteudo_html ?? "") + currentAssinatura.id + new Date().toISOString());
      const hashBuffer = await crypto.subtle.digest("SHA-256", payload);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error: signErr } = await (supabase as any).rpc("assinar_contrato_publico", {
        p_link_token: token,
        p_assinatura_id: currentAssinatura.id,
        p_assinatura_url: assinaturaDataUrl,
        p_ip: ipAddress,
        p_user_agent: navigator.userAgent,
        p_latitude: latitude,
        p_longitude: longitude,
        p_hash_documento: hashHex,
      });
      if (signErr) throw signErr;

      return true;
    },
    onSuccess: () => {
      toast.success("Contrato assinado com sucesso!");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Estados ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !contrato) {
    return (
      <TelaMensagem icon={<XCircle className="h-8 w-8 text-destructive" />} cor="bg-destructive/10" titulo="Contrato não encontrado">
        <p className="text-muted-foreground text-sm">O link de assinatura é inválido ou expirou.</p>
      </TelaMensagem>
    );
  }

  if (c.link_expires_at && isPast(new Date(c.link_expires_at))) {
    return (
      <TelaMensagem icon={<Clock className="h-8 w-8 text-amber-500" />} cor="bg-amber-500/10" titulo="Link expirado" logoUrl={logoUrl}>
        <p className="text-muted-foreground text-sm">
          O prazo para assinatura expirou em {fmtDataHora(c.link_expires_at)}.
        </p>
        <p className="text-xs text-muted-foreground">Entre em contato com o remetente para solicitar um novo link.</p>
      </TelaMensagem>
    );
  }

  const allSigned = assinaturasList.length > 0 && assinaturasList.every((a) => a.status === "assinado");
  if (allSigned) {
    return (
      <TelaMensagem icon={<CheckCircle2 className="h-8 w-8 text-emerald-500" />} cor="bg-emerald-500/10" titulo="Contrato assinado" logoUrl={logoUrl}>
        <p className="text-muted-foreground text-sm">Todas as assinaturas foram coletadas com sucesso.</p>
        <Button onClick={() => downloadContratoPDF(contrato, logoUrl)} className="w-full rounded-xl mt-2">
          <Download className="h-4 w-4 mr-2" /> Baixar cópia assinada (PDF)
        </Button>
      </TelaMensagem>
    );
  }

  if (!currentAssinatura) {
    return (
      <TelaMensagem icon={<AlertCircle className="h-8 w-8 text-amber-500" />} cor="bg-amber-500/10" titulo="Aguardando" logoUrl={logoUrl}>
        <p className="text-muted-foreground text-sm">Este contrato está aguardando outras assinaturas.</p>
      </TelaMensagem>
    );
  }

  const etapa = jaVisualizou ? 2 : 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 to-background">
      {/* Top bar fixa (padrão Clicksign) */}
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
            ) : (
              <FileText className="h-6 w-6 text-primary" />
            )}
            <div className="h-5 w-px bg-border hidden sm:block" />
            <span className="text-sm font-medium text-muted-foreground truncate hidden sm:block">Assinatura eletrônica</span>
          </div>
          <Badge variant="outline" className="gap-1.5 text-emerald-600 border-emerald-200 shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" /> Seguro
          </Badge>
        </div>
        {/* Stepper */}
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-2 text-xs">
            {["Revisar documento", "Assinar"].map((label, i) => {
              const n = i + 1;
              const done = etapa > n;
              const active = etapa === n;
              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
                  </span>
                  <span className={`font-medium ${active || done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                  {i === 0 && <div className={`h-0.5 flex-1 rounded ${done ? "bg-emerald-500" : "bg-border"}`} />}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4 pb-28">
        {/* Título do contrato */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words">{contrato.titulo}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Contrato nº {contrato.numero} • Criado em {fmtData(c.created_at)}
            {c.link_expires_at && <span className="text-amber-600"> • Expira em {fmtDataHora(c.link_expires_at)}</span>}
          </p>
        </div>

        {/* Passo 1 — Documento */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="font-semibold">Revise o documento</h2>
            </div>

            {/* Metadados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
              {(() => {
                const grupos: Record<string, string[]> = {};
                assinaturasList.forEach((a) => {
                  const tipo = String(a.tipo || "Signatário");
                  const label = tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
                  (grupos[label] ??= []).push(a.nome);
                });
                return Object.entries(grupos).map(([label, nomes]) => (
                  <div key={label} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">{label}{nomes.length > 1 ? `s (${nomes.length})` : ""}</div>
                    <div className="font-medium space-y-0.5">{nomes.map((n, i) => <div key={i} className="truncate">{n}</div>)}</div>
                  </div>
                ));
              })()}
              {c.valor_contrato != null && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Valor</div>
                  <div className="font-medium">{formatBRL.format(Number(c.valor_contrato))}</div>
                </div>
              )}
              {c.data_inicio && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Vigência</div>
                  <div className="font-medium">
                    {fmtData(c.data_inicio)}
                    {c.data_fim && ` até ${fmtData(c.data_fim)}`}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1 rounded-xl" onClick={() => { setPdfOpen(true); setJaVisualizou(true); }}>
                <Eye className="h-4 w-4 mr-2" /> Ver documento
              </Button>
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { downloadContratoPDF(contrato, logoUrl); setJaVisualizou(true); }}>
                <Download className="h-4 w-4 mr-2" /> Baixar PDF
              </Button>
            </div>
            {!jaVisualizou && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> Leia o documento antes de assinar — a assinatura será liberada em seguida.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Progresso dos signatários */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Signatários</h2>
              <span className="text-xs text-muted-foreground">{assinaturasCompletas}/{assinaturasList.length} assinaram</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(assinaturasCompletas / assinaturasList.length) * 100}%` }} />
            </div>
            <div className="space-y-1.5">
              {assinaturasList.map((a) => {
                const assinado = a.status === "assinado";
                const atual = a.id === currentAssinatura.id;
                return (
                  <div key={a.id} className={`flex items-center justify-between gap-3 rounded-xl p-2.5 text-sm ${atual ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/20"}`}>
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${assinado ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                        {String(a.nome || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.nome}{atual && <span className="text-primary font-normal"> (você)</span>}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.email}{a.tipo && ` • ${String(a.tipo).toUpperCase()}`}</div>
                      </div>
                    </div>
                    {assinado ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-0 gap-1 shrink-0"><CheckCircle2 className="h-3 w-3" /> Assinado</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 shrink-0"><Clock className="h-3 w-3" /> Pendente</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Passo 2 — Assinatura */}
        <Card className={`rounded-2xl shadow-sm transition-all ${jaVisualizou ? "border-primary/30" : "border-border/50 opacity-60"}`}>
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
              <h2 className="font-semibold">Assine como {currentAssinatura.nome}</h2>
            </div>

            <Tabs value={modo} onValueChange={(v) => { setModo(v as ModoAssinatura); limpar(); }}>
              <TabsList className="grid grid-cols-2 w-full max-w-xs">
                <TabsTrigger value="desenhar" className="gap-1.5"><PenLine className="h-3.5 w-3.5" /> Desenhar</TabsTrigger>
                <TabsTrigger value="digitar" className="gap-1.5"><Type className="h-3.5 w-3.5" /> Digitar</TabsTrigger>
              </TabsList>
            </Tabs>

            {modo === "digitar" && (
              <Input
                value={nomeDigitado}
                onChange={(e) => { setNomeDigitado(e.target.value); renderTyped(e.target.value); }}
                placeholder="Digite seu nome completo"
                className="rounded-xl"
                disabled={!jaVisualizou}
              />
            )}

            <div className="border-2 border-dashed border-border rounded-xl p-2 bg-white overflow-hidden relative">
              {!hasSignature && (
                <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/50 pointer-events-none">
                  {modo === "desenhar" ? "Assine aqui" : "Sua assinatura aparecerá aqui"}
                </span>
              )}
              <canvas
                ref={canvasRef}
                style={{ width: "100%", height: `${canvasSize.height}px`, touchAction: "none" }}
                className={`block ${modo === "desenhar" ? "cursor-crosshair" : "pointer-events-none"} ${!jaVisualizou ? "opacity-40 pointer-events-none" : ""}`}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={limpar} disabled={!hasSignature} className="text-muted-foreground">
              Limpar
            </Button>

            <div className="flex items-start gap-2.5 rounded-xl bg-muted/30 p-3">
              <Checkbox id="aceitar" checked={aceito} onCheckedChange={(v) => setAceito(v === true)} disabled={!jaVisualizou} className="mt-0.5" />
              <Label htmlFor="aceitar" className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
                Li e aceito os termos do contrato. Estou ciente de que esta assinatura eletrônica tem validade jurídica
                conforme a MP 2.200-2/2001.
                {!jaVisualizou && <span className="block text-amber-600 mt-1">Disponível após visualizar o documento.</span>}
              </Label>
            </div>
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Assinatura registrada com IP, data/hora e hash de integridade
        </p>
      </main>

      {/* Barra de ação fixa (padrão Clicksign no mobile) */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-md border-t border-border/50 p-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="hidden sm:block text-xs text-muted-foreground flex-1">
            {!jaVisualizou ? "Revise o documento para liberar a assinatura" : !hasSignature ? "Forneça sua assinatura" : !aceito ? "Aceite os termos para continuar" : "Tudo pronto para assinar"}
          </div>
          <Button
            className="flex-1 sm:flex-none sm:min-w-[220px] rounded-xl"
            size="lg"
            onClick={() => assinar.mutate()}
            disabled={assinar.isPending || !hasSignature || !aceito || !jaVisualizou}>
            {assinar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
            Assinar contrato
          </Button>
        </div>
      </div>

      <PreviewContratoPDFDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        contrato={contrato}
        logoUrl={logoUrl}
        signatarios={assinaturasList
          .filter((a) => a.tipo !== "contratante" && a.tipo !== "contratada" && a.tipo !== "contratado")
          .map((a) => ({ nome: a.nome, email: a.email, cpf: a.cpf, tipo: a.tipo }))}
      />
    </div>
  );
}
