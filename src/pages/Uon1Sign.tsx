import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  Archive } from
"lucide-react";
import { openWhatsApp } from "@/utils/whatsapp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator } from
"@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, differenceInDays, isPast, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import NovoContratoDialog from "@/components/gestao/NovoContratoDialog";
import TemplateContratoDialog from "@/components/gestao/TemplateContratoDialog";
import VisualizarContratoDialog from "@/components/gestao/VisualizarContratoDialog";
import { downloadContratoPDF } from "@/components/gestao/utils/downloadContratoPDF";

const getVigenciaBadge = (dataFim: string | null, status: string) => {
  if (!dataFim || status === "cancelado") return null;
  const fim = new Date(dataFim);
  const hoje = new Date();
  const dias = differenceInDays(fim, hoje);

  if (isPast(fim) && !isSameDay(fim, hoje)) {
    return { label: "Vencido", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200", icon: <XCircle className="h-3 w-3" /> };
  }
  if (isSameDay(fim, hoje)) {
    return { label: "Vence hoje!", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 animate-pulse", icon: <AlertTriangle className="h-3 w-3" /> };
  }
  if (dias <= 30) {
    return { label: `Vence em ${dias}d`, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200", icon: <AlertTriangle className="h-3 w-3" /> };
  }
  return { label: "Vigente", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> };
};

const statusConfig: Record<string, {label: string;color: string;icon: React.ReactNode;bgClass: string;}> = {
  rascunho: {
    label: "Rascunho",
    color: "text-muted-foreground",
    bgClass: "bg-muted/50",
    icon: <FileText className="h-4 w-4" />
  },
  aguardando_assinatura: {
    label: "Aguardando",
    color: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10",
    icon: <Clock className="h-4 w-4" />
  },
  assinado: {
    label: "Assinado",
    color: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10",
    icon: <CheckCircle2 className="h-4 w-4" />
  },
  cancelado: {
    label: "Cancelado",
    color: "text-red-600 dark:text-red-400",
    bgClass: "bg-red-500/10",
    icon: <XCircle className="h-4 w-4" />
  },
  expirado: {
    label: "Expirado",
    color: "text-gray-600 dark:text-gray-400",
    bgClass: "bg-gray-500/10",
    icon: <XCircle className="h-4 w-4" />
  }
};

export default function Uon1Sign() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [visualizarContrato, setVisualizarContrato] = useState<any>(null);

  const { data: contratos, isLoading } = useQuery({
    queryKey: ["contratos", statusFilter, showArchived],
    queryFn: async () => {
      let query = supabase.
      from("contratos").
      select(`*, contrato_assinaturas(*), contrato_templates:template_id(logo_url)`).
      order("created_at", { ascending: false });

      query = query.eq("arquivado", showArchived);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  const { data: templates } = useQuery({
    queryKey: ["contrato_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contrato_templates").select("*").eq("ativo", true).order("titulo");
      if (error) throw error;
      return data;
    }
  });

  const enviarParaAssinatura = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase.
      from("contratos").
      update({
        status: "aguardando_assinatura",
        link_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }).
      eq("id", contratoId);
      if (error) throw error;

      await supabase.from("contrato_historico").insert({
        contrato_id: contratoId,
        acao: "enviado",
        descricao: "Contrato enviado para assinatura",
        user_id: user?.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      toast.success("Contrato enviado para assinatura!");
    },
    onError: (error) => {
      toast.error("Erro ao enviar contrato: " + error.message);
    }
  });

  const cancelarContrato = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase.
      from("contratos").
      update({ status: "cancelado" }).
      eq("id", contratoId);
      if (error) throw error;

      await supabase.from("contrato_historico").insert({
        contrato_id: contratoId,
        acao: "cancelado",
        descricao: "Contrato cancelado pelo usuário",
        user_id: user?.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      toast.success("Contrato cancelado!");
    },
    onError: (error) => {
      toast.error("Erro ao cancelar contrato: " + error.message);
    }
  });

  const arquivarContrato = useMutation({
    mutationFn: async ({ id, arquivado }: {id: string;arquivado: boolean;}) => {
      const { error } = await supabase.
      from("contratos").
      update({ arquivado }).
      eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { arquivado }) => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      toast.success(arquivado ? "Contrato arquivado!" : "Contrato desarquivado!");
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    }
  });

  const copyLink = (contrato: any) => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const sendWhatsApp = (contrato: any) => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    openWhatsApp({
      phone: contrato.contratante_telefone,
      message: `Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`
    });
  };

  const sendEmail = (contrato: any) => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    const subject = encodeURIComponent(`Contrato para assinatura: ${contrato.titulo}`);
    const body = encodeURIComponent(
      `Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`
    );
    const mailtoUrl = `mailto:${contrato.contratante_email || ""}?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, "_blank");
  };

  const filteredContratos = contratos?.filter((c) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      c.numero?.toLowerCase().includes(searchLower) ||
      c.titulo?.toLowerCase().includes(searchLower) ||
      c.contratante_nome?.toLowerCase().includes(searchLower));

  });

  const stats = {
    total: contratos?.length || 0,
    rascunho: contratos?.filter((c) => c.status === "rascunho").length || 0,
    aguardando: contratos?.filter((c) => c.status === "aguardando_assinatura").length || 0,
    assinados: contratos?.filter((c) => c.status === "assinado").length || 0
  };

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
              <h1 className="text-3xl font-bold tracking-tight">Uon 1Sign</h1>
              <p className="text-muted-foreground">Gestão de contratos e assinaturas digitais</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total</p>
                  <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Rascunhos</p>
                  <p className="text-3xl font-bold mt-1 text-muted-foreground">{stats.rascunho}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Aguardando</p>
                  <p className="text-3xl font-bold mt-1 text-amber-600">{stats.aguardando}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assinados</p>
                  <p className="text-3xl font-bold mt-1 text-emerald-600">{stats.assinados}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
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
                className="pl-10 bg-card/50 border-border/50" />

            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] bg-card/50 border-border/50">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="aguardando_assinatura">Aguardando</SelectItem>
                <SelectItem value="assinado">Assinado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              className={showArchived ? "" : "bg-card/50"}
              title={showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}>

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

        {/* Contracts List */}
        <div className="space-y-3">
          {isLoading ?
          <div className="text-center py-16">
              <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted"></div>
                <div className="h-4 w-32 bg-muted rounded"></div>
              </div>
            </div> :
          filteredContratos?.length === 0 ?
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
            </Card> :

          filteredContratos?.map((contrato) => {
            const status = statusConfig[contrato.status] || statusConfig.rascunho;
            const assinaturas = contrato.contrato_assinaturas || [];
            const assinaturasCompletas = assinaturas.filter((a: any) => a.status === "assinado").length;
            const hasLink = contrato.status === "aguardando_assinatura" || contrato.link_token;
            const vigenciaBadge = getVigenciaBadge(contrato.data_fim, contrato.status);

            return (
              <Card
                key={contrato.id}
                className="group hover:shadow-md transition-all duration-200 border-border/50 bg-card/80 backdrop-blur-sm">

                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Status Icon */}
                      <div
                      className={`h-10 w-10 rounded-lg ${status.bgClass} flex items-center justify-center shrink-0`}>

                        <span className={status.color}>{status.icon}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                            {contrato.numero}
                          </span>
                          <Badge variant="outline" className={`${status.color} border-current/20`}>
                            {status.label}
                          </Badge>
                          {vigenciaBadge &&
                        <Badge variant="outline" className={`${vigenciaBadge.className} flex items-center gap-1 text-xs`}>
                              {vigenciaBadge.icon}
                              {vigenciaBadge.label}
                            </Badge>
                        }
                        </div>

                        <h3 className="font-semibold text-foreground truncate mb-2">{contrato.titulo}</h3>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {contrato.contratante_nome &&
                        <span className="flex items-center gap-1">
                              <span className="font-medium">Contratante:</span> {contrato.contratante_nome}
                            </span>
                        }
                          {contrato.valor_contrato &&
                        <span className="flex items-center gap-1">
                              <span className="font-medium">Valor:</span>{" "}
                              {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL"
                          }).format(contrato.valor_contrato)}
                            </span>
                        }
                          {assinaturas.length > 0 &&
                        <span className="flex items-center gap-1">
                              <span className="font-medium">Assinaturas:</span> {assinaturasCompletas}/
                              {assinaturas.length}
                            </span>
                        }
                        </div>

                        {(contrato.data_inicio || contrato.data_fim) &&
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
                            <CalendarDays className="h-3 w-3" />
                            <span>
                              Vigência: {contrato.data_inicio ? format(new Date(contrato.data_inicio), "dd/MM/yyyy") : "—"} a {contrato.data_fim ? format(new Date(contrato.data_fim), "dd/MM/yyyy") : "—"}
                            </span>
                          </div>
                      }

                        <p className="text-xs text-muted-foreground mt-1.5">
                          Criado em {format(new Date(contrato.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setVisualizarContrato(contrato)}
                        title="Visualizar">

                          <Eye className="h-4 w-4" />
                        </Button>

                        {contrato.status === "rascunho" &&
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => enviarParaAssinatura.mutate(contrato.id)}
                        disabled={enviarParaAssinatura.isPending}
                        title="Liberar para Assinatura"
                        className="text-primary hover:text-primary">

                            <Send className="h-4 w-4" />
                          </Button>
                      }

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setVisualizarContrato(contrato)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Visualizar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadContratoPDF(contrato, contrato?.contrato_templates?.logo_url)}>
                              <Download className="h-4 w-4 mr-2" />
                              Baixar PDF
                            </DropdownMenuItem>
                            {hasLink &&
                          <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => copyLink(contrato)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copiar Link
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => sendWhatsApp(contrato)}>
                                  <MessageCircle className="h-4 w-4 mr-2" />
                                  Enviar WhatsApp
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => sendEmail(contrato)}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Enviar E-mail
                                </DropdownMenuItem>
                              </>
                          }
                            {(contrato.status === "aguardando_assinatura" || contrato.status === "rascunho") &&
                          <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                              onClick={() => {
                                if (confirm("Tem certeza que deseja cancelar este contrato?")) {
                                  cancelarContrato.mutate(contrato.id);
                                }
                              }}
                              className="text-red-600 dark:text-red-400">

                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancelar Contrato
                                </DropdownMenuItem>
                              </>
                          }
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                            onClick={() => arquivarContrato.mutate({ id: contrato.id, arquivado: !contrato.arquivado })}>

                              <Archive className="h-4 w-4 mr-2" />
                              {contrato.arquivado ? "Desarquivar" : "Arquivar"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>);

          })
          }
        </div>
      </div>

      {/* Dialogs */}
      <NovoContratoDialog open={novoContratoOpen} onOpenChange={setNovoContratoOpen} templates={templates || []} />
      <TemplateContratoDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      {visualizarContrato &&
      <VisualizarContratoDialog
        contrato={visualizarContrato}
        open={!!visualizarContrato}
        onOpenChange={() => setVisualizarContrato(null)} />

      }
    </div>);

}