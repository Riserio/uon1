import { useMemo, useState, useDeferredValue } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSignedContracts } from "@/hooks/useSignedContracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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
  Settings2,
  PlayCircle,
  ShieldCheck,
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
import { format, parseISO, startOfDay, differenceInDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import NovoContratoDialog from "@/components/gestao/NovoContratoDialog";
import TemplateContratoDialog from "@/components/gestao/TemplateContratoDialog";
import VisualizarContratoDialog from "@/components/gestao/VisualizarContratoDialog";
import PdfCamposAssinaturaDialog from "@/components/gestao/PdfCamposAssinaturaDialog";
import EnviarLinkSignatariosDialog from "@/components/gestao/EnviarLinkSignatariosDialog";
import { downloadContratoPDF } from "@/components/gestao/utils/downloadContratoPDF";
import NovoContratoWizard from "@/components/uonisign/NovoContratoWizard";
import DetalheContratoDialog from "@/components/uonisign/DetalheContratoDialog";
import ConfigModeloDialog from "@/components/uonisign/ConfigModeloDialog";
import MensagensDialog from "@/components/uonisign/MensagensDialog";
import { meuNivel, uonisign, STATUS_V2 } from "@/lib/uonisign/api";

// ---------------------------------------------------------------------------
// Tipos
// Fluxo 1 = contratos antigos (link único, Contratada assinando na criação).
// Fluxo 2 = uoniSign v2 (código por signatário, PDF com hash, ordem de assinatura).
// ---------------------------------------------------------------------------
type ContratoStatus =
  | "rascunho"
  | "aguardando_assinatura"
  | "parcialmente_assinado"
  | "assinado_processando"
  | "assinado"
  | "recusado"
  | "cancelado"
  | "expirado";
type CanalEnvio = "whatsapp" | "email" | "link";

interface Assinatura {
  id: string;
  nome: string | null;
  email: string | null;
  tipo: string | null;
  status: string;
  ordem: number | null;
}

interface Contrato {
  id: string;
  numero: string | null;
  titulo: string;
  status: ContratoStatus;
  fluxo_versao: number;
  arquivado: boolean;
  link_token: string | null;
  template_id: string | null;
  created_by: string;
  contratante_nome: string | null;
  contratante_cnpj: string | null;
  contratante_email: string | null;
  contratante_telefone: string | null;
  valor_contrato: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
  enviado_em: string | null;
  pdf_final_path: string | null;
  pdf_original_path: string | null;
  auto_envio_email_assinatura: boolean | null;
  arquivo_pdf_url: string | null;
  arquivo_pdf_path: string | null;
  arquivo_pdf_nome: string | null;
  campos_assinatura: unknown;
  contrato_assinaturas: Assinatura[];
  contrato_templates: { logo_url: string | null; titulo: string | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

// ---------------------------------------------------------------------------
// Constantes e helpers
// ---------------------------------------------------------------------------
const LINK_VALIDADE_DIAS = 7; // fluxo 1
const ALERTA_VENCIMENTO_DIAS = 30;
const EM_ANDAMENTO: ContratoStatus[] = ["aguardando_assinatura", "parcialmente_assinado", "assinado_processando"];

const formatBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatarData = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");

const getVigenciaBadge = (dataFim: string | null, status: ContratoStatus) => {
  if (!dataFim || status !== "assinado") return null;
  const dias = differenceInDays(startOfDay(parseISO(dataFim)), startOfDay(new Date()));
  if (dias < 0) return { label: "Vencido", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200", icon: <XCircle className="h-3 w-3" /> };
  if (dias === 0) return { label: "Vence hoje!", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200", icon: <AlertTriangle className="h-3 w-3" /> };
  if (dias <= ALERTA_VENCIMENTO_DIAS)
    return { label: `Vence em ${dias}d`, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200", icon: <AlertTriangle className="h-3 w-3" /> };
  return { label: "Vigente", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> };
};

const ICONE_STATUS: Record<string, React.ReactNode> = {
  rascunho: <FileText className="h-4 w-4" />,
  aguardando_assinatura: <Clock className="h-4 w-4" />,
  parcialmente_assinado: <Clock className="h-4 w-4" />,
  assinado_processando: <Clock className="h-4 w-4" />,
  assinado: <CheckCircle2 className="h-4 w-4" />,
  recusado: <XCircle className="h-4 w-4" />,
  cancelado: <XCircle className="h-4 w-4" />,
  expirado: <XCircle className="h-4 w-4" />,
};

const PERIODOS: Record<string, number | null> = { todos: null, "7": 7, "30": 30, "90": 90, "365": 365 };

function StatCard({ label, value, valueClass, iconBgClass, icon }: { label: string; value: number; valueClass?: string; iconBgClass: string; icon: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm bg-card/50">
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

// ---------------------------------------------------------------------------
// Card do contrato
// ---------------------------------------------------------------------------
interface ContratoCardProps {
  contrato: Contrato;
  vendedor?: string;
  souDono: boolean;
  enviando: boolean;
  isViewed: (id: string) => boolean;
  onAbrir: (c: Contrato) => void;
  onContinuar: (c: Contrato) => void;
  onBaixar: (c: Contrato) => void;
  onArquivar: (c: Contrato) => void;
  onMarcarVisto: (id: string) => void;
  // fluxo 1
  onEnviarAssinatura: (id: string) => void;
  onEditar: (c: Contrato) => void;
  onPdfCampos: (c: Contrato) => void;
  onEnvio: (c: Contrato, canal: CanalEnvio) => void;
  onCancelarLegado: (c: Contrato) => void;
}

function ContratoCard(props: ContratoCardProps) {
  const { contrato, vendedor, souDono } = props;
  const v2 = (contrato.fluxo_versao ?? 1) >= 2;
  const status = STATUS_V2[contrato.status] ?? STATUS_V2.rascunho;
  const assinaturas = [...(contrato.contrato_assinaturas ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const completas = assinaturas.filter((a) => a.status === "assinado").length;
  const vigencia = getVigenciaBadge(contrato.data_fim, contrato.status);
  const hasLink = Boolean(contrato.link_token);
  const editavelLegado =
    !v2 &&
    (contrato.status === "rascunho" || contrato.status === "aguardando_assinatura") &&
    !assinaturas.some((a) => a.status === "assinado" && a.tipo !== "contratada" && a.tipo !== "contratado");

  return (
    <Card className="group hover:shadow-md transition-all duration-200 border-border/50 bg-card/80">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => props.onAbrir(contrato)}
            className={`h-10 w-10 rounded-lg border ${status.cor} flex items-center justify-center shrink-0`}
            aria-label="Abrir contrato"
          >
            {ICONE_STATUS[contrato.status] ?? <FileText className="h-4 w-4" />}
          </button>

          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => props.onAbrir(contrato)}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {contrato.numero && <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">{contrato.numero}</span>}
              <Badge variant="outline" className={status.cor}>
                {status.label}
              </Badge>
              {vigencia && (
                <Badge variant="outline" className={`${vigencia.className} flex items-center gap-1 text-xs`}>
                  {vigencia.icon}
                  {vigencia.label}
                </Badge>
              )}
              {!v2 && <Badge variant="outline" className="text-[10px] text-muted-foreground">fluxo antigo</Badge>}
            </div>
            <h3 className="font-semibold text-foreground truncate mb-1.5">{contrato.titulo}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {contrato.contratante_nome && (
                <span>
                  <span className="font-medium">Contratante:</span> {contrato.contratante_nome}
                  {contrato.contratante_cnpj && ` · ${contrato.contratante_cnpj}`}
                </span>
              )}
              {contrato.valor_contrato != null && (
                <span>
                  <span className="font-medium">Valor:</span> {formatBRL.format(contrato.valor_contrato)}
                </span>
              )}
              {vendedor && (
                <span>
                  <span className="font-medium">Vendedor:</span> {vendedor}
                </span>
              )}
            </div>
            {(contrato.data_inicio || contrato.data_fim) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
                <CalendarDays className="h-3 w-3" />
                <span>
                  Vigência: {contrato.data_inicio ? formatarData(contrato.data_inicio) : "—"} a {contrato.data_fim ? formatarData(contrato.data_fim) : "—"}
                </span>
              </div>
            )}

            {assinaturas.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">
                  Assinaturas {completas}/{assinaturas.length}
                </span>
                {assinaturas.map((a) => (
                  <span
                    key={a.id}
                    className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border ${
                      a.status === "assinado"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                        : a.status === "recusado"
                          ? "bg-red-500/10 border-red-500/20 text-red-700"
                          : "bg-muted/40 border-border text-muted-foreground"
                    }`}
                  >
                    {a.status === "assinado" ? <CheckCircle2 className="h-3 w-3" /> : a.status === "recusado" ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    <span className="truncate max-w-[140px]">{a.nome || "Signatário"}</span>
                    {a.tipo && <span className="text-[10px] opacity-70">· {a.tipo}</span>}
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">Criado em {format(new Date(contrato.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
          </div>

          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {v2 && contrato.status === "rascunho" && souDono && (
              <Button variant="ghost" size="icon" onClick={() => props.onContinuar(contrato)} title="Continuar" aria-label="Continuar contrato">
                <PlayCircle className="h-4 w-4 text-primary" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => props.onAbrir(contrato)} title="Detalhes" aria-label="Ver detalhes">
              <Eye className="h-4 w-4" />
            </Button>
            {!v2 && contrato.status === "rascunho" && (
              <Button variant="ghost" size="icon" onClick={() => props.onEnviarAssinatura(contrato.id)} disabled={props.enviando} title="Liberar para assinatura" aria-label="Liberar para assinatura">
                <Send className="h-4 w-4" />
              </Button>
            )}
            {editavelLegado && (
              <Button variant="ghost" size="icon" onClick={() => props.onEditar(contrato)} title="Editar contrato" aria-label="Editar contrato">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mais ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => props.onAbrir(contrato)}>
                  <Eye className="h-4 w-4 mr-2" /> Detalhes
                </DropdownMenuItem>
                {contrato.status === "assinado" && !props.isViewed(contrato.id) && (
                  <DropdownMenuItem onClick={() => props.onMarcarVisto(contrato.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Marcar como visto
                  </DropdownMenuItem>
                )}
                {(!v2 || contrato.pdf_original_path) && (
                  <DropdownMenuItem onClick={() => props.onBaixar(contrato)}>
                    <Download className="h-4 w-4 mr-2" /> {v2 && contrato.pdf_final_path ? "Baixar PDF assinado" : "Baixar PDF"}
                  </DropdownMenuItem>
                )}
                {!v2 && (contrato.status === "rascunho" || contrato.status === "aguardando_assinatura") && (
                  <DropdownMenuItem onClick={() => props.onPdfCampos(contrato)}>
                    <UploadCloud className="h-4 w-4 mr-2" /> PDF próprio e campos
                  </DropdownMenuItem>
                )}
                {!v2 && hasLink && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => props.onEnvio(contrato, "link")}>
                      <Copy className="h-4 w-4 mr-2" /> Copiar link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onEnvio(contrato, "whatsapp")}>
                      <MessageCircle className="h-4 w-4 mr-2" /> Enviar WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onEnvio(contrato, "email")}>
                      <Mail className="h-4 w-4 mr-2" /> Enviar e-mail
                    </DropdownMenuItem>
                  </>
                )}
                {!v2 && (contrato.status === "aguardando_assinatura" || contrato.status === "rascunho") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => props.onCancelarLegado(contrato)} className="text-red-600 dark:text-red-400">
                      <XCircle className="h-4 w-4 mr-2" /> Cancelar contrato
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => props.onArquivar(contrato)}>
                  <Archive className="h-4 w-4 mr-2" /> {contrato.arquivado ? "Desarquivar" : "Arquivar"}
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
  const navigate = useNavigate();
  const { markAsViewed, isViewed } = useSignedContracts();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodo, setPeriodo] = useState("todos");
  const [vendedorFilter, setVendedorFilter] = useState("all");
  const [modeloFilter, setModeloFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [rascunho, setRascunho] = useState<Contrato | null>(null);
  const [detalhe, setDetalhe] = useState<Contrato | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [mensagensOpen, setMensagensOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  // fluxo 1
  const [visualizarContrato, setVisualizarContrato] = useState<Contrato | null>(null);
  const [editandoContrato, setEditandoContrato] = useState<Contrato | null>(null);
  const [pdfCamposContrato, setPdfCamposContrato] = useState<Contrato | null>(null);
  const [enviarLinkContrato, setEnviarLinkContrato] = useState<Contrato | null>(null);
  const [enviarLinkCanal, setEnviarLinkCanal] = useState<CanalEnvio>("whatsapp");
  const [contratoCancelando, setContratoCancelando] = useState<Contrato | null>(null);

  const { data: nivel = "vendedor" } = useQuery({ queryKey: ["uonisign_nivel", user?.id], queryFn: meuNivel, enabled: !!user, staleTime: 5 * 60_000 });
  const ehAdmin = nivel === "admin";

  // RLS já filtra pela hierarquia (vendedor → próprios; líder/gerente → equipe; back-office → todos)
  const { data: contratos, isLoading } = useQuery({
    queryKey: ["contratos", { showArchived }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select(`*, contrato_assinaturas(*), contrato_templates:template_id(logo_url, titulo)`)
        .eq("arquivado", showArchived)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Contrato[];
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const idsVendedores = useMemo(() => [...new Set((contratos ?? []).map((c) => c.created_by).filter(Boolean))].sort(), [contratos]);
  const { data: vendedores } = useQuery({
    queryKey: ["uonisign_vendedores", idsVendedores],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").in("id", idsVendedores);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.nome as string]));
    },
    enabled: idsVendedores.length > 0,
    staleTime: 5 * 60_000,
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

  const registrarHistorico = async (contratoId: string, acao: string, descricao: string) => {
    const { error } = await supabase.from("contrato_historico").insert({ contrato_id: contratoId, acao, descricao, user_id: user?.id });
    if (error) console.error("Falha ao registrar histórico do contrato:", error);
  };
  const invalidateContratos = () => queryClient.invalidateQueries({ queryKey: ["contratos"] });

  // ----- fluxo 1 (contratos antigos ainda em andamento) -----
  const enviarParaAssinatura = useMutation({
    mutationFn: async (contratoId: string) => {
      const { data: atualizado, error } = await supabase
        .from("contratos")
        .update({ status: "aguardando_assinatura", link_expires_at: new Date(Date.now() + LINK_VALIDADE_DIAS * 86400000).toISOString() })
        .eq("id", contratoId)
        .select("auto_envio_email_assinatura")
        .single();
      if (error) throw error;
      await registrarHistorico(contratoId, "enviado", "Contrato enviado para assinatura");
      if (atualizado?.auto_envio_email_assinatura !== false) {
        try {
          await supabase.functions.invoke("enviar-email-contrato", { body: { contrato_id: contratoId } });
        } catch {
          toast.warning("Contrato liberado, mas o e-mail automático falhou. Envie o link manualmente.");
        }
      }
    },
    onSuccess: () => {
      invalidateContratos();
      toast.success("Contrato enviado para assinatura!");
    },
    onError: (error: Error) => toast.error("Erro ao enviar contrato: " + error.message),
  });

  const cancelarLegado = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase.from("contratos").update({ status: "cancelado" }).eq("id", contratoId);
      if (error) throw error;
      await registrarHistorico(contratoId, "cancelado", "Contrato cancelado pelo usuário");
    },
    onSuccess: () => {
      invalidateContratos();
      toast.success("Contrato cancelado!");
    },
    onError: (error: Error) => toast.error("Erro ao cancelar contrato: " + error.message),
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
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });

  const abrir = (c: Contrato) => {
    markAsViewed(c.id);
    if ((c.fluxo_versao ?? 1) >= 2) setDetalhe(c);
    else setVisualizarContrato(c);
  };

  const baixar = async (c: Contrato) => {
    if ((c.fluxo_versao ?? 1) < 2) return downloadContratoPDF(c, c.contrato_templates?.logo_url);
    try {
      const { url } = await uonisign.url(c.id, c.pdf_final_path ? "final" : "original", true);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const abrirEnvio = (contrato: Contrato, canal: CanalEnvio) => {
    if (!contrato.link_token) return toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
    setEnviarLinkCanal(canal);
    setEnviarLinkContrato(contrato);
  };

  // Filtros
  const filtrados = useMemo(() => {
    if (!contratos) return [];
    const term = deferredSearch.trim().toLowerCase();
    const dias = PERIODOS[periodo];
    const desde = dias ? subDays(new Date(), dias).getTime() : null;
    return contratos.filter((c) => {
      if (statusFilter === "andamento" ? !EM_ANDAMENTO.includes(c.status) : statusFilter !== "all" && c.status !== statusFilter) return false;
      if (desde && new Date(c.created_at).getTime() < desde) return false;
      if (vendedorFilter !== "all" && c.created_by !== vendedorFilter) return false;
      if (modeloFilter !== "all" && c.template_id !== modeloFilter) return false;
      if (!term) return true;
      return [c.numero, c.titulo, c.contratante_nome, c.contratante_cnpj].some((v) => v?.toLowerCase().includes(term));
    });
  }, [contratos, deferredSearch, statusFilter, periodo, vendedorFilter, modeloFilter]);

  const stats = useMemo(() => {
    const l = contratos ?? [];
    return {
      andamento: l.filter((c) => EM_ANDAMENTO.includes(c.status)).length,
      assinados: l.filter((c) => c.status === "assinado").length,
      rascunhos: l.filter((c) => c.status === "rascunho").length,
      encerrados: l.filter((c) => ["recusado", "expirado", "cancelado"].includes(c.status)).length,
    };
  }, [contratos]);

  const signatariosPdf = useMemo(() => {
    if (!pdfCamposContrato) return [];
    const c = pdfCamposContrato;
    return [
      ...(c.contratante_nome || c.contratante_email ? [{ nome: c.contratante_nome ?? "", email: c.contratante_email ?? "" }] : []),
      ...(c.contrato_assinaturas ?? []).filter((a) => a.email && a.email !== c.contratante_email).map((a) => ({ nome: a.nome ?? "", email: a.email ?? "" })),
    ];
  }, [pdfCamposContrato]);

  const novo = () => {
    setRascunho(null);
    setWizardOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-6 space-y-6">
        <PageHeader
          icon={FileSignature}
          title="Uon1 Sign"
          subtitle="Geração e assinatura de contratos"
          actions={
            <>
              {(nivel === "admin" || nivel === "operador") && (
                <Button variant="outline" onClick={() => navigate("/trust")}>
                  <ShieldCheck className="h-4 w-4 mr-2" /> Uon1 Trust
                </Button>
              )}
              {ehAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Settings2 className="h-4 w-4 mr-2" /> Modelos
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setConfigOpen(true)}>
                      <Settings2 className="h-4 w-4 mr-2" /> Configurar modelos e signatário
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                      <FileText className="h-4 w-4 mr-2" /> Editar textos (templates)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMensagensOpen(true)}>
                      <MessageCircle className="h-4 w-4 mr-2" /> Mensagens (e-mail e WhatsApp)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button onClick={novo}>
                <Plus className="h-4 w-4 mr-2" /> Novo contrato
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Em andamento" value={stats.andamento} valueClass="text-amber-600" iconBgClass="bg-amber-500/10" icon={<Clock className="h-5 w-5 text-amber-600" />} />
          <StatCard label="Assinados" value={stats.assinados} valueClass="text-emerald-600" iconBgClass="bg-emerald-500/10" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} />
          <StatCard label="Rascunhos" value={stats.rascunhos} valueClass="text-muted-foreground" iconBgClass="bg-muted" icon={<FileText className="h-5 w-5 text-muted-foreground" />} />
          <StatCard label="Recusados / expirados / cancelados" value={stats.encerrados} valueClass="text-red-600" iconBgClass="bg-red-500/10" icon={<XCircle className="h-5 w-5 text-red-600" />} />
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, contratante ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card/50"
              aria-label="Buscar contratos"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[190px] bg-card/50" aria-label="Filtrar por status">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="andamento">Em andamento</SelectItem>
                {Object.entries(STATUS_V2).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-[150px] bg-card/50" aria-label="Período">
                <CalendarDays className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo o período</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="365">Últimos 12 meses</SelectItem>
              </SelectContent>
            </Select>
            {idsVendedores.length > 1 && (
              <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                <SelectTrigger className="w-[170px] bg-card/50" aria-label="Vendedor">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {idsVendedores.map((id) => (
                    <SelectItem key={id} value={id}>
                      {vendedores?.[id] ?? "Usuário"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={modeloFilter} onValueChange={setModeloFilter}>
              <SelectTrigger className="w-[170px] bg-card/50" aria-label="Modelo">
                <SelectValue placeholder="Modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os modelos</SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived((v) => !v)} className={showArchived ? "" : "bg-card/50"}>
              <Archive className="h-4 w-4 mr-2" />
              {showArchived ? "Arquivados" : "Arquivo"}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-16" role="status" aria-label="Carregando contratos">
              <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
            </div>
          ) : filtrados.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <FileSignature className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Nenhum contrato encontrado</h3>
                <p className="text-muted-foreground mb-4">Gere um contrato a partir de um modelo e envie para assinatura.</p>
                <Button onClick={novo}>
                  <Plus className="h-4 w-4 mr-2" /> Novo contrato
                </Button>
              </CardContent>
            </Card>
          ) : (
            filtrados.map((contrato) => (
              <ContratoCard
                key={contrato.id}
                contrato={contrato}
                vendedor={idsVendedores.length > 1 ? vendedores?.[contrato.created_by] : undefined}
                souDono={contrato.created_by === user?.id}
                enviando={enviarParaAssinatura.isPending}
                isViewed={isViewed}
                onAbrir={abrir}
                onContinuar={(c) => {
                  setRascunho(c);
                  setWizardOpen(true);
                }}
                onBaixar={baixar}
                onArquivar={(c) => arquivarContrato.mutate({ id: c.id, arquivado: !c.arquivado })}
                onMarcarVisto={markAsViewed}
                onEnviarAssinatura={(id) => enviarParaAssinatura.mutate(id)}
                onEditar={setEditandoContrato}
                onPdfCampos={setPdfCamposContrato}
                onEnvio={abrirEnvio}
                onCancelarLegado={setContratoCancelando}
              />
            ))
          )}
        </div>
      </div>

      <NovoContratoWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        rascunho={rascunho}
        onConfigurarModelo={ehAdmin ? () => setConfigOpen(true) : undefined}
      />
      {detalhe && (
        <DetalheContratoDialog
          contrato={contratos?.find((c) => c.id === detalhe.id) ?? detalhe}
          nivel={nivel}
          souDono={detalhe.created_by === user?.id}
          open={!!detalhe}
          onOpenChange={(o) => !o && setDetalhe(null)}
        />
      )}
      {ehAdmin && <ConfigModeloDialog open={configOpen} onOpenChange={setConfigOpen} />}
      {ehAdmin && <MensagensDialog open={mensagensOpen} onOpenChange={setMensagensOpen} />}
      <TemplateContratoDialog open={templateOpen} onOpenChange={setTemplateOpen} />

      {/* ----- fluxo 1 ----- */}
      <AlertDialog open={!!contratoCancelando} onOpenChange={(o) => !o && setContratoCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato "{contratoCancelando?.titulo}" será cancelado e não poderá mais ser assinado. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (contratoCancelando) cancelarLegado.mutate(contratoCancelando.id);
                setContratoCancelando(null);
              }}
            >
              Cancelar contrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editandoContrato && (
        <NovoContratoDialog
          open={!!editandoContrato}
          onOpenChange={(o) => !o && setEditandoContrato(null)}
          templates={(templates ?? []).filter((t) => ((t as { fluxo_versao?: number }).fluxo_versao ?? 1) < 2)}
          contrato={editandoContrato}
        />
      )}
      {enviarLinkContrato && (
        <EnviarLinkSignatariosDialog open={!!enviarLinkContrato} onOpenChange={(o) => !o && setEnviarLinkContrato(null)} canal={enviarLinkCanal} contrato={enviarLinkContrato} />
      )}
      {visualizarContrato && <VisualizarContratoDialog contrato={visualizarContrato} open={!!visualizarContrato} onOpenChange={() => setVisualizarContrato(null)} />}
      {pdfCamposContrato && (
        <PdfCamposAssinaturaDialog
          open={!!pdfCamposContrato}
          onOpenChange={(o) => !o && setPdfCamposContrato(null)}
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
