import { useMemo, useState, useDeferredValue } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSignedContracts } from "@/hooks/useSignedContracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  FileText,
  Send,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  FileSignature,
  Filter,
  Download,
  Copy,
  MessageCircle,
  Mail,
  MoreHorizontal,
  AlertTriangle,
  CalendarDays,
  Archive,
  Pencil,
  UploadCloud,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, parseISO, startOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import NovoContratoDialog from "@/components/gestao/NovoContratoDialog";
import TemplateContratoDialog from "@/components/gestao/TemplateContratoDialog";
import VisualizarContratoDialog from "@/components/gestao/VisualizarContratoDialog";
import PdfCamposAssinaturaDialog from "@/components/gestao/PdfCamposAssinaturaDialog";
import EnviarLinkSignatariosDialog from "@/components/gestao/EnviarLinkSignatariosDialog";
import { downloadContratoPDF } from "@/components/gestao/utils/downloadContratoPDF";

// ---------------------------------------------------------------------------
// Tipos
// Ideal: substituir por tipos gerados do Supabase, ex.:
// type ContratoRow = Database["public"]["Tables"]["contratos"]["Row"];
// ---------------------------------------------------------------------------
type ContratoStatus = "rascunho" | "aguardando_assinatura" | "assinado" | "cancelado" | "expirado";
type CanalEnvio = "whatsapp" | "email" | "link";

interface Assinatura {
  id: string;
  nome: string | null;
  email: string | null;
  tipo: string | null;
  status: string;
}

interface Contrato {
  id: string;
  numero: string | null;
  titulo: string;
  status: ContratoStatus;
  arquivado: boolean;
  link_token: string | null;
  contratante_nome: string | null;
  contratante_email: string | null;
  contratante_telefone: string | null;
  valor_contrato: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
  auto_envio_email_assinatura: boolean | null;
  arquivo_pdf_url: string | null;
  arquivo_pdf_path: string | null;
  arquivo_pdf_nome: string | null;
  campos_assinatura: unknown;
  contrato_assinaturas: Assinatura[];
  contrato_templates: { logo_url: string | null } | null;
}

// ---------------------------------------------------------------------------
// Constantes e helpers (nível de módulo — não são recriados a cada render)
// ---------------------------------------------------------------------------
const LINK_VALIDADE_DIAS = 7;
const ALERTA_VENCIMENTO_DIAS = 30;

const formatBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// parseISO evita o bug de fuso: new Date("2026-07-02") é interpretado como
// meia-noite UTC e pode exibir o dia anterior no horário de Brasília.
const formatarData = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");

const getVigenciaBadge = (dataFim: string | null, status: ContratoStatus) => {
  if (!dataFim || status === "cancelado") return null;
  const fim = startOfDay(parseISO(dataFim));
  const hoje = startOfDay(new Date());
  const dias = differenceInDays(fim, hoje);
  if (dias < 0) {
    return {
      label: "Vencido",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200",
      icon: <XCircle className="h-3 w-3" />,
    };
  }
  if (dias === 0) {
    return {
      label: "Vence hoje!",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 animate-pulse",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  }
  if (dias <= ALERTA_VENCIMENTO_DIAS) {
    return {
      label: `Vence em ${dias}d`,
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  }
  return {
    label: "Vigente",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  };
};

const statusConfig: Record<ContratoStatus, { label: string; color: string; icon: React.ReactNode; bgClass: string }> = {
  rascunho: {
    label: "Rascunho",
    color: "text-muted-foreground",
    bgClass: "bg-muted/50",
    icon: <FileText className="h-4 w-4" />,
  },
  aguardando_assinatura: {
    label: "Aguardando",
    color: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10",
    icon: <Clock className="h-4 w-4" />,
  },
  assinado: {
    label: "Assinado",
    color: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  cancelado: {
    label: "Cancelado",
    color: "text-red-600 dark:text-red-400",
    bgClass: "bg-red-500/10",
    icon: <XCircle className="h-4 w-4" />,
  },
  expirado: {
    label: "Expirado",
    color: "text-gray-600 dark:text-gray-400",
    bgClass: "bg-gray-500/10",
    icon: <XCircle className="h-4 w-4" />,
  },
};

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  valueClass,
  iconBgClass,
  icon,
}: {
  label: string;
  value: number;
  valueClass?: string;
  iconBgClass: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${valueClass ?? ""}`}>{value}</p>
          </div>
          <div className={`h-12 w-12 rounded-full ${iconBgClass} flex items-center justify-center`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ContratoCardProps {
  contrato: Contrato;
  enviando: boolean;
  isViewed: (id: string) => boolean;
  onVisualizar: (c: Contrato) => void;
  onEnviarAssinatura: (id: string) => void;
  onEditar: (c: Contrato) => void;
  onPdfCampos: (c: Contrato) => void;
  onEnvio: (c: Contrato, canal: CanalEnvio) => void;
  onCancelar: (c: Contrato) => void;
  onArquivar: (c: Contrato) => void;
  onMarcarVisto: (id: string) => void;
}

function ContratoCard({
  contrato,
  enviando,
  isViewed,
  onVisualizar,
  onEnviarAssinatura,
  onEditar,
  onPdfCampos,
  onEnvio,
  onCancelar,
  onArquivar,
  onMarcarVisto,
}: ContratoCardProps) {
  const status = statusConfig[contrato.status] ?? statusConfig.rascunho;
  const assinaturas = contrato.contrato_assinaturas ?? [];
  const assinaturasCompletas = assinaturas.filter((a) => a.status === "assinado").length;
  // Fonte da verdade é o token — o status sozinho não garante que o link exista
  const hasLink = Boolean(contrato.link_token);
  const vigenciaBadge = getVigenciaBadge(contrato.data_fim, contrato.status);
  const editavel =
    (contrato.status === "rascunho" || contrato.status === "aguardando_assinatura") &&
    !assinaturas.some((a) => a.status === "assinado" && a.tipo !== "contratada" && a.tipo !== "contratado");

  return (
    <Card className="group hover:shadow-md transition-all duration-200 border-border/50 bg-card/80 backdrop-blur-sm">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Ícone de status */}
          <div className={`h-10 w-10 rounded-lg ${status.bgClass} flex items-center justify-center shrink-0`}>
            <span className={status.color}>{status.icon}</span>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {contrato.numero && (
                <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                  {contrato.numero}
                </span>
              )}
              <Badge variant="outline" className={`${status.color} border-current/20`}>
                {status.label}
              </Badge>
              {vigenciaBadge && (
                <Badge variant="outline" className={`${vigenciaBadge.className} flex items-center gap-1 text-xs`}>
                  {vigenciaBadge.icon}
                  {vigenciaBadge.label}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-foreground truncate mb-2">{contrato.titulo}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {contrato.contratante_nome && (
                <span className="flex items-center gap-1">
                  <span className="font-medium">Contratante:</span> {contrato.contratante_nome}
                </span>
              )}
              {/* != null em vez de truthy: R$ 0,00 é um valor válido */}
              {contrato.valor_contrato != null && (
                <span className="flex items-center gap-1">
                  <span className="font-medium">Valor:</span> {formatBRL.format(contrato.valor_contrato)}
                </span>
              )}
              {assinaturas.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="font-medium">Assinaturas:</span> {assinaturasCompletas}/{assinaturas.length}
                </span>
              )}
            </div>
            {(contrato.data_inicio || contrato.data_fim) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
                <CalendarDays className="h-3 w-3" />
                <span>
                  Vigência: {contrato.data_inicio ? formatarData(contrato.data_inicio) : "—"} a{" "}
                  {contrato.data_fim ? formatarData(contrato.data_fim) : "—"}
                </span>
              </div>
            )}

            {/* Timeline de signatários */}
            {assinaturas.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Assinantes ({assinaturasCompletas}/{assinaturas.length})
                  </span>
                  <div
                    className="flex-1 mx-3 h-1 bg-muted rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={assinaturasCompletas}
                    aria-valuemin={0}
                    aria-valuemax={assinaturas.length}
                  >
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${(assinaturasCompletas / assinaturas.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Math.round((assinaturasCompletas / assinaturas.length) * 100)}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {assinaturas.map((a) => {
                    const assinado = a.status === "assinado";
                    return (
                      <div
                        key={a.id}
                        className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-1 border ${
                          assinado
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted/40 border-border text-muted-foreground"
                        }`}
                        title={a.email ?? ""}
                      >
                        {assinado ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        <span className="font-medium truncate max-w-[140px]">{a.nome || a.email || "Signatário"}</span>
                        {a.tipo && <span className="text-[10px] opacity-70">· {a.tipo}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">
              Criado em {format(new Date(contrato.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          {/* Ações — focus-within mantém acessível via teclado */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onVisualizar(contrato)}
              title="Visualizar"
              aria-label="Visualizar contrato"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {contrato.status === "rascunho" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEnviarAssinatura(contrato.id)}
                disabled={enviando}
                title="Liberar para Assinatura"
                aria-label="Liberar para assinatura"
                className="text-primary hover:text-primary"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
            {editavel && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEditar(contrato)}
                title="Editar contrato"
                aria-label="Editar contrato"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {(contrato.status === "rascunho" || contrato.status === "aguardando_assinatura") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onPdfCampos(contrato)}
                title="PDF próprio e campos de assinatura"
                aria-label="PDF próprio e campos de assinatura"
              >
                <UploadCloud className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mais ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onVisualizar(contrato)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Visualizar
                </DropdownMenuItem>
                {contrato.status === "assinado" && !isViewed(contrato.id) && (
                  <DropdownMenuItem onClick={() => onMarcarVisto(contrato.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como visto
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => downloadContratoPDF(contrato, contrato.contrato_templates?.logo_url)}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF
                </DropdownMenuItem>
                {hasLink && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onEnvio(contrato, "link")}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEnvio(contrato, "whatsapp")}>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Enviar WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEnvio(contrato, "email")}>
                      <Mail className="h-4 w-4 mr-2" />
                      Enviar E-mail
                    </DropdownMenuItem>
                  </>
                )}
                {(contrato.status === "aguardando_assinatura" || contrato.status === "rascunho") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onCancelar(contrato)} className="text-red-600 dark:text-red-400">
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancelar Contrato
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onArquivar(contrato)}>
                  <Archive className="h-4 w-4 mr-2" />
                  {contrato.arquivado ? "Desarquivar" : "Arquivar"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function Uon1Sign() {
  const { user } = useAuth();
  const { markAsViewed, isViewed } = useSignedContracts();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [visualizarContrato, setVisualizarContrato] = useState<Contrato | null>(null);
  const [editandoContrato, setEditandoContrato] = useState<Contrato | null>(null);
  const [pdfCamposContrato, setPdfCamposContrato] = useState<Contrato | null>(null);
  const [enviarLinkContrato, setEnviarLinkContrato] = useState<Contrato | null>(null);
  const [enviarLinkCanal, setEnviarLinkCanal] = useState<CanalEnvio>("whatsapp");
  const [contratoCancelando, setContratoCancelando] = useState<Contrato | null>(null);

  // Uma única query por vista (ativos/arquivados); filtro de status no cliente.
  // Assim as estatísticas refletem o conjunto completo mesmo com filtro ativo.
  const { data: contratos, isLoading } = useQuery({
    queryKey: ["contratos", { showArchived }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select(`*, contrato_assinaturas(*), contrato_templates:template_id(logo_url)`)
        .eq("arquivado", showArchived)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contrato[];
    },
    placeholderData: (prev) => prev, // evita "piscar" ao alternar filtros
    staleTime: 30_000,
  });

  const { data: templates } = useQuery({
    queryKey: ["contrato_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contrato_templates").select("*").eq("ativo", true).order("titulo");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // Registro de histórico com tratamento de erro (antes falhava em silêncio)
  const registrarHistorico = async (contratoId: string, acao: string, descricao: string) => {
    const { error } = await supabase.from("contrato_historico").insert({
      contrato_id: contratoId,
      acao,
      descricao,
      user_id: user?.id,
    });
    if (error) console.error("Falha ao registrar histórico do contrato:", error);
  };

  const invalidateContratos = () => queryClient.invalidateQueries({ queryKey: ["contratos"] });

  const enviarParaAssinatura = useMutation({
    mutationFn: async (contratoId: string) => {
      // update + select em uma única chamada (antes eram duas)
      const { data: atualizado, error } = await supabase
        .from("contratos")
        .update({
          status: "aguardando_assinatura",
          link_expires_at: new Date(Date.now() + LINK_VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", contratoId)
        .select("auto_envio_email_assinatura")
        .single();
      if (error) throw error;

      await registrarHistorico(contratoId, "enviado", "Contrato enviado para assinatura");

      // Auto-envio de e-mail (Resend), se habilitado — falha não bloqueia o fluxo
      if (atualizado?.auto_envio_email_assinatura !== false) {
        try {
          await supabase.functions.invoke("enviar-email-contrato", { body: { contrato_id: contratoId } });
        } catch (e) {
          console.warn("Falha no auto-envio do e-mail de assinatura:", e);
          toast.warning("Contrato liberado, mas o e-mail automático falhou. Envie o link manualmente.");
        }
      }
    },
    onSuccess: () => {
      invalidateContratos();
      toast.success("Contrato enviado para assinatura!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao enviar contrato: " + error.message);
    },
  });

  const cancelarContrato = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase.from("contratos").update({ status: "cancelado" }).eq("id", contratoId);
      if (error) throw error;
      await registrarHistorico(contratoId, "cancelado", "Contrato cancelado pelo usuário");
    },
    onSuccess: () => {
      invalidateContratos();
      toast.success("Contrato cancelado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao cancelar contrato: " + error.message);
    },
  });

  const arquivarContrato = useMutation({
    mutationFn: async ({ id, arquivado }: { id: string; arquivado: boolean }) => {
      const { error } = await supabase.from("contratos").update({ arquivado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { arquivado }) => {
      invalidateContratos();
      toast.success(arquivado ? "Contrato arquivado!" : "Contrato desarquivado!");
    },
    onError: (error: Error) => {
      toast.error("Erro: " + error.message);
    },
  });

  const abrirEnvio = (contrato: Contrato, canal: CanalEnvio) => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    setEnviarLinkCanal(canal);
    setEnviarLinkContrato(contrato);
  };

  const abrirVisualizacao = (contrato: Contrato) => {
    markAsViewed(contrato.id);
    setVisualizarContrato(contrato);
  };

  // Filtro e estatísticas memoizados
  const filteredContratos = useMemo(() => {
    if (!contratos) return [];
    const term = deferredSearch.trim().toLowerCase();
    return contratos.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!term) return true;
      return (
        c.numero?.toLowerCase().includes(term) ||
        c.titulo?.toLowerCase().includes(term) ||
        c.contratante_nome?.toLowerCase().includes(term)
      );
    });
  }, [contratos, deferredSearch, statusFilter]);

  const stats = useMemo(
    () => ({
      total: contratos?.length ?? 0,
      rascunho: contratos?.filter((c) => c.status === "rascunho").length ?? 0,
      aguardando: contratos?.filter((c) => c.status === "aguardando_assinatura").length ?? 0,
      assinados: contratos?.filter((c) => c.status === "assinado").length ?? 0,
    }),
    [contratos],
  );

  const signatariosPdf = useMemo(() => {
    if (!pdfCamposContrato) return [];
    const c = pdfCamposContrato;
    return [
      ...(c.contratante_nome || c.contratante_email
        ? [{ nome: c.contratante_nome ?? "", email: c.contratante_email ?? "" }]
        : []),
      ...(c.contrato_assinaturas ?? [])
        .filter((a) => a.email && a.email !== c.contratante_email)
        .map((a) => ({ nome: a.nome ?? "", email: a.email ?? "" })),
    ];
  }, [pdfCamposContrato]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSignature className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Uon1 Sign</h1>
              <p className="text-muted-foreground">Gestão de contratos e assinaturas digitais</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total"
            value={stats.total}
            iconBgClass="bg-primary/10"
            icon={<FileText className="h-5 w-5 text-primary" />}
          />
          <StatCard
            label="Rascunhos"
            value={stats.rascunho}
            valueClass="text-muted-foreground"
            iconBgClass="bg-muted"
            icon={<FileText className="h-5 w-5 text-muted-foreground" />}
          />
          <StatCard
            label="Aguardando"
            value={stats.aguardando}
            valueClass="text-amber-600"
            iconBgClass="bg-amber-500/10"
            icon={<Clock className="h-5 w-5 text-amber-600" />}
          />
          <StatCard
            label="Assinados"
            value={stats.assinados}
            valueClass="text-emerald-600"
            iconBgClass="bg-emerald-500/10"
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          />
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between mb-6">
          <div className="flex flex-1 gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, título ou contratante..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-card/50 border-border/50"
                aria-label="Buscar contratos"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] bg-card/50 border-border/50" aria-label="Filtrar por status">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="aguardando_assinatura">Aguardando</SelectItem>
                <SelectItem value="assinado">Assinado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="expirado">Expirado</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
              className={showArchived ? "" : "bg-card/50"}
              title={showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
            >
              <Archive className="h-4 w-4 mr-2" />
              {showArchived ? "Arquivados" : "Arquivo"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTemplateOpen(true)} className="bg-card/50">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </Button>
            <Button onClick={() => setNovoContratoOpen(true)} className="shadow-sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Contrato
            </Button>
          </div>
        </div>

        {/* Lista de contratos */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-16" role="status" aria-label="Carregando contratos">
              <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
            </div>
          ) : filteredContratos.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <FileSignature className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Nenhum contrato encontrado</h3>
                <p className="text-muted-foreground mb-4">Crie seu primeiro contrato para começar</p>
                <Button onClick={() => setNovoContratoOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Contrato
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredContratos.map((contrato) => (
              <ContratoCard
                key={contrato.id}
                contrato={contrato}
                enviando={enviarParaAssinatura.isPending}
                isViewed={isViewed}
                onVisualizar={abrirVisualizacao}
                onEnviarAssinatura={(id) => enviarParaAssinatura.mutate(id)}
                onEditar={(c) => {
                  setEditandoContrato(c);
                  setNovoContratoOpen(true);
                }}
                onPdfCampos={setPdfCamposContrato}
                onEnvio={abrirEnvio}
                onCancelar={setContratoCancelando}
                onArquivar={(c) => arquivarContrato.mutate({ id: c.id, arquivado: !c.arquivado })}
                onMarcarVisto={markAsViewed}
              />
            ))
          )}
        </div>
      </div>

      {/* Confirmação de cancelamento (substitui window.confirm) */}
      <AlertDialog
        open={!!contratoCancelando}
        onOpenChange={(o) => {
          if (!o) setContratoCancelando(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato "{contratoCancelando?.titulo}" será cancelado e não poderá mais ser assinado. Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (contratoCancelando) cancelarContrato.mutate(contratoCancelando.id);
                setContratoCancelando(null);
              }}
            >
              Cancelar contrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogs */}
      <NovoContratoDialog
        open={novoContratoOpen}
        onOpenChange={(o) => {
          setNovoContratoOpen(o);
          if (!o) setEditandoContrato(null);
        }}
        templates={templates ?? []}
        contrato={editandoContrato}
      />
      <TemplateContratoDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      {enviarLinkContrato && (
        <EnviarLinkSignatariosDialog
          open={!!enviarLinkContrato}
          onOpenChange={(o) => {
            if (!o) setEnviarLinkContrato(null);
          }}
          canal={enviarLinkCanal}
          contrato={enviarLinkContrato}
        />
      )}
      {visualizarContrato && (
        <VisualizarContratoDialog
          contrato={visualizarContrato}
          open={!!visualizarContrato}
          onOpenChange={() => setVisualizarContrato(null)}
        />
      )}
      {pdfCamposContrato && (
        <PdfCamposAssinaturaDialog
          open={!!pdfCamposContrato}
          onOpenChange={(o) => {
            if (!o) setPdfCamposContrato(null);
          }}
          contratoId={pdfCamposContrato.id}
          signatarios={signatariosPdf}
          pdfUrl={pdfCamposContrato.arquivo_pdf_url}
          pdfPath={pdfCamposContrato.arquivo_pdf_path}
          pdfNome={pdfCamposContrato.arquivo_pdf_nome}
          campos={(pdfCamposContrato.campos_assinatura ?? []) as never}
          onSaved={invalidateContratos}
        />
      )}
    </div>
  );
}
