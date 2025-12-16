import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Send, Eye, CheckCircle2, Clock, XCircle, FileSignature, Filter, Download, Copy, MessageCircle, Mail } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import NovoContratoDialog from "./NovoContratoDialog";
import TemplateContratoDialog from "./TemplateContratoDialog";
import VisualizarContratoDialog from "./VisualizarContratoDialog";
import { downloadContratoPDF } from "./utils/downloadContratoPDF";
import { openWhatsApp } from "@/utils/whatsapp";
const statusConfig: Record<string, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  rascunho: {
    label: "Rascunho",
    color: "bg-muted text-muted-foreground",
    icon: <FileText className="h-3 w-3" />
  },
  aguardando_assinatura: {
    label: "Aguardando Assinatura",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: <Clock className="h-3 w-3" />
  },
  assinado: {
    label: "Assinado",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: <CheckCircle2 className="h-3 w-3" />
  },
  cancelado: {
    label: "Cancelado",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: <XCircle className="h-3 w-3" />
  },
  expirado: {
    label: "Expirado",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    icon: <XCircle className="h-3 w-3" />
  }
};
export default function GestaoContratos() {
  const {
    user
  } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [visualizarContrato, setVisualizarContrato] = useState<any>(null);

  // Fetch contratos
  const {
    data: contratos,
    isLoading
  } = useQuery({
    queryKey: ["contratos", statusFilter],
    queryFn: async () => {
      let query = supabase.from("contratos").select(`
          *,
          contrato_assinaturas(*),
          contrato_templates:template_id(logo_url)
        `).order("created_at", {
        ascending: false
      });
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Fetch templates
  const {
    data: templates
  } = useQuery({
    queryKey: ["contrato_templates"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("contrato_templates").select("*").eq("ativo", true).order("titulo");
      if (error) throw error;
      return data;
    }
  });

  // Enviar para assinatura
  const enviarParaAssinatura = useMutation({
    mutationFn: async (contratoId: string) => {
      const {
        error
      } = await supabase.from("contratos").update({
        status: "aguardando_assinatura",
        link_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }).eq("id", contratoId);
      if (error) throw error;

      // Registrar histórico
      await supabase.from("contrato_historico").insert({
        contrato_id: contratoId,
        acao: "enviado",
        descricao: "Contrato enviado para assinatura",
        user_id: user?.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["contratos"]
      });
      toast.success("Contrato enviado para assinatura!");
    },
    onError: error => {
      toast.error("Erro ao enviar contrato: " + error.message);
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
    const body = encodeURIComponent(`Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`);
    const mailtoUrl = `mailto:${contrato.contratante_email || ""}?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, "_blank");
  };

  // PDF download now uses shared utility

  const filteredContratos = contratos?.filter(c => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return c.numero?.toLowerCase().includes(searchLower) || c.titulo?.toLowerCase().includes(searchLower) || c.contratante_nome?.toLowerCase().includes(searchLower);
  });
  const stats = {
    total: contratos?.length || 0,
    rascunho: contratos?.filter(c => c.status === "rascunho").length || 0,
    aguardando: contratos?.filter(c => c.status === "aguardando_assinatura").length || 0,
    assinados: contratos?.filter(c => c.status === "assinado").length || 0
  };
  return <div className="space-y-6">
      {/* Header com Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Contratos</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rascunhos</CardDescription>
            <CardTitle className="text-2xl text-muted-foreground">{stats.rascunho}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Aguardando Assinatura</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{stats.aguardando}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assinados</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats.assinados}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar contratos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
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
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </Button>
          <Button onClick={() => setNovoContratoOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Contrato
          </Button>
        </div>
      </div>

      {/* Lista de Contratos */}
      <div className="space-y-3">
        {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : filteredContratos?.length === 0 ? <Card>
            <CardContent className="py-12 text-center">
              <FileSignature className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhum contrato encontrado</h3>
              <p className="text-muted-foreground mt-1">Crie seu primeiro contrato clicando no botão acima</p>
            </CardContent>
          </Card> : filteredContratos?.map(contrato => {
        const status = statusConfig[contrato.status] || statusConfig.rascunho;
        const assinaturas = contrato.contrato_assinaturas || [];
        const assinaturasCompletas = assinaturas.filter((a: any) => a.status === "assinado").length;
        const hasLink = contrato.status === "aguardando_assinatura" || contrato.link_token;
        return <Card key={contrato.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-muted-foreground">{contrato.numero}</span>
                        <Badge className={`${status.color} flex items-center gap-1`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-foreground truncate">{contrato.titulo}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                        {contrato.contratante_nome && <span>Contratante: {contrato.contratante_nome}</span>}
                        {contrato.valor_contrato && <span>
                            Valor:{" "}
                            {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL"
                    }).format(contrato.valor_contrato)}
                          </span>}
                        {assinaturas.length > 0 && <span>
                            Assinaturas: {assinaturasCompletas}/{assinaturas.length}
                          </span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Criado em {format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR
                  })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <Button variant="ghost" size="icon" onClick={() => setVisualizarContrato(contrato)} title="Visualizar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      {hasLink && <>
                          
                          
                          
                        </>}
                      {contrato.status === "rascunho" && <Button variant="ghost" size="icon" onClick={() => enviarParaAssinatura.mutate(contrato.id)} disabled={enviarParaAssinatura.isPending} title="Liberar para Assinatura">
                          <Send className="h-4 w-4" />
                        </Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>;
      })}
      </div>

      {/* Dialogs */}
      <NovoContratoDialog open={novoContratoOpen} onOpenChange={setNovoContratoOpen} templates={templates || []} />
      <TemplateContratoDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      {visualizarContrato && <VisualizarContratoDialog contrato={visualizarContrato} open={!!visualizarContrato} onOpenChange={() => setVisualizarContrato(null)} />}
    </div>;
}