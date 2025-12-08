import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import NovoContratoDialog from "./NovoContratoDialog";
import TemplateContratoDialog from "./TemplateContratoDialog";
import VisualizarContratoDialog from "./VisualizarContratoDialog";

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho: { label: "Rascunho", color: "bg-muted text-muted-foreground", icon: <FileText className="h-3 w-3" /> },
  aguardando_assinatura: { label: "Aguardando Assinatura", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: <Clock className="h-3 w-3" /> },
  assinado: { label: "Assinado", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle className="h-3 w-3" /> },
  expirado: { label: "Expirado", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: <XCircle className="h-3 w-3" /> },
};

export default function GestaoContratos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [visualizarContrato, setVisualizarContrato] = useState<any>(null);

  // Fetch contratos
  const { data: contratos, isLoading } = useQuery({
    queryKey: ["contratos", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("contratos")
        .select(`
          *,
          contrato_assinaturas(*)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ["contrato_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_templates")
        .select("*")
        .eq("ativo", true)
        .order("titulo");
      if (error) throw error;
      return data;
    },
  });

  // Enviar para assinatura
  const enviarParaAssinatura = useMutation({
    mutationFn: async (contratoId: string) => {
      const { error } = await supabase
        .from("contratos")
        .update({ 
          status: "aguardando_assinatura",
          link_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq("id", contratoId);
      if (error) throw error;

      // Registrar histórico
      await supabase.from("contrato_historico").insert({
        contrato_id: contratoId,
        acao: "enviado",
        descricao: "Contrato enviado para assinatura",
        user_id: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      toast.success("Contrato enviado para assinatura!");
    },
    onError: (error) => {
      toast.error("Erro ao enviar contrato: " + error.message);
    },
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
    const phone = contrato.contratante_telefone?.replace(/\D/g, "") || "";
    const message = encodeURIComponent(
      `Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`
    );
    const whatsappUrl = phone 
      ? `https://web.whatsapp.com/send?phone=55${phone}&text=${message}`
      : `https://web.whatsapp.com/send?text=${message}`;
    window.open(whatsappUrl, "_blank");
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

  const downloadPDF = async (contrato: any) => {
    const assinaturas = contrato.contrato_assinaturas || [];
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    // Load Vangard logo
    try {
      const logoUrl = "/images/vangard-logo.png";
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve) => {
        img.onload = () => {
          const logoWidth = 50;
          const logoHeight = (img.height / img.width) * logoWidth;
          doc.addImage(img, "PNG", margin, yPosition, logoWidth, logoHeight);
          
          // Company info next to logo
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 30, 30);
          doc.text("Vangard Gestora", margin + logoWidth + 10, yPosition + 8);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("vangardgestora.com.br", margin + logoWidth + 10, yPosition + 14);
          
          yPosition += logoHeight + 15;
          resolve();
        };
        img.onerror = () => {
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 30, 30);
          doc.text("Vangard Gestora", margin, yPosition + 10);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("vangardgestora.com.br", margin, yPosition + 16);
          yPosition += 25;
          resolve();
        };
        img.src = logoUrl;
      });
    } catch (error) {
      console.log("Logo not loaded:", error);
      yPosition += 10;
    }

    // Title with blue underline
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(41, 98, 255);
    const titleText = contrato.titulo;
    const titleWidth = doc.getTextWidth(titleText);
    const titleX = (pageWidth - titleWidth) / 2;
    doc.text(titleText, titleX, yPosition);
    doc.setDrawColor(41, 98, 255);
    doc.setLineWidth(0.3);
    doc.line(titleX, yPosition + 2, titleX + titleWidth, yPosition + 2);
    yPosition += 15;

    // PARTES section
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("PARTES", margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    
    // Contratante
    doc.text("CONTRATANTE: ", margin, yPosition);
    doc.setFont("helvetica", "bold");
    doc.text(contrato.contratante_nome || "-", margin + doc.getTextWidth("CONTRATANTE: "), yPosition);
    yPosition += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`CPF/CNPJ: ${contrato.contratante_cpf || contrato.contratante_cnpj || "-"} | E-mail: ${contrato.contratante_email || "-"}`, margin, yPosition);
    yPosition += 8;
    
    // Contratada
    doc.text("CONTRATADA: ", margin, yPosition);
    doc.setFont("helvetica", "bold");
    doc.text("Vangard Gestora", margin + doc.getTextWidth("CONTRATADA: "), yPosition);
    yPosition += 12;

    // Contract content with formatting
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = contrato.conteudo_html;
    
    const parseHtmlToPdfText = (html: string) => {
      const div = document.createElement("div");
      div.innerHTML = html;
      const sections: { type: 'heading' | 'text'; content: string }[] = [];
      
      div.querySelectorAll('h1, h2, h3, h4, p, div').forEach((el) => {
        const text = el.textContent?.trim();
        if (!text) return;
        if (['H1', 'H2', 'H3', 'H4'].includes(el.tagName) || text.match(/^CLÁUSULA \d+/)) {
          sections.push({ type: 'heading', content: text });
        } else {
          sections.push({ type: 'text', content: text });
        }
      });
      
      return sections.length > 0 ? sections : [{ type: 'text' as const, content: div.textContent || '' }];
    };
    
    const sections = parseHtmlToPdfText(contrato.conteudo_html);
    
    for (const section of sections) {
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = margin;
      }
      
      if (section.type === 'heading') {
        yPosition += 5;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text(section.content, margin, yPosition);
        yPosition += 7;
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        const lines = doc.splitTextToSize(section.content, pageWidth - 2 * margin);
        for (const line of lines) {
          if (yPosition > pageHeight - 30) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += 5;
        }
      }
    }

    // Signatures
    if (assinaturas.length > 0 && assinaturas.some((a: any) => a.status === "assinado")) {
      if (yPosition > pageHeight - 120) {
        doc.addPage();
        yPosition = margin;
      }

      yPosition += 15;
      doc.setDrawColor(102, 51, 153);
      doc.setLineWidth(0.5);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(102, 51, 153);
      doc.text("REGISTRO DE ASSINATURAS", margin, yPosition);
      yPosition += 12;

      for (const assinatura of assinaturas) {
        if (assinatura.status === "assinado" && assinatura.assinado_em) {
          if (yPosition > pageHeight - 50) {
            doc.addPage();
            yPosition = margin;
          }

          doc.setDrawColor(230, 230, 230);
          doc.setFillColor(250, 250, 250);
          doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 35, 3, 3, "FD");

          const dataAssinatura = format(new Date(assinatura.assinado_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text(`${assinatura.nome}`, margin + 5, yPosition + 3);
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(80, 80, 80);
          
          doc.text(`Data/Hora: ${dataAssinatura}`, margin + 5, yPosition + 12);
          doc.text(`IP: ${assinatura.ip_assinatura || "N/A"}`, margin + 90, yPosition + 12);
          doc.text(`Hash: ${assinatura.hash_documento?.substring(0, 40) || "N/A"}...`, margin + 5, yPosition + 20);
          
          if (assinatura.latitude && assinatura.longitude) {
            doc.text(`Localização: ${assinatura.latitude.toFixed(6)}, ${assinatura.longitude.toFixed(6)}`, margin + 5, yPosition + 28);
          }
          
          yPosition += 42;
        }
      }
    }

    // Footer
    yPosition = pageHeight - 15;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition - 5, pageWidth - margin, yPosition - 5);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })} | Uon1Sign`, margin, yPosition);

    doc.save(`${contrato.numero}_${contrato.titulo.replace(/\s+/g, '_')}.pdf`);
    toast.success("PDF baixado com sucesso!");
  };

  const filteredContratos = contratos?.filter((c) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      c.numero?.toLowerCase().includes(searchLower) ||
      c.titulo?.toLowerCase().includes(searchLower) ||
      c.contratante_nome?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: contratos?.length || 0,
    rascunho: contratos?.filter((c) => c.status === "rascunho").length || 0,
    aguardando: contratos?.filter((c) => c.status === "aguardando_assinatura").length || 0,
    assinados: contratos?.filter((c) => c.status === "assinado").length || 0,
  };

  return (
    <div className="space-y-6">
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
            <Input
              placeholder="Buscar contratos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredContratos?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileSignature className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhum contrato encontrado</h3>
              <p className="text-muted-foreground mt-1">
                Crie seu primeiro contrato clicando no botão acima
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredContratos?.map((contrato) => {
            const status = statusConfig[contrato.status] || statusConfig.rascunho;
            const assinaturas = contrato.contrato_assinaturas || [];
            const assinaturasCompletas = assinaturas.filter((a: any) => a.status === "assinado").length;
            const hasLink = contrato.status === "aguardando_assinatura" || contrato.link_token;

            return (
              <Card key={contrato.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-muted-foreground">
                          {contrato.numero}
                        </span>
                        <Badge className={`${status.color} flex items-center gap-1`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-foreground truncate">{contrato.titulo}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                        {contrato.contratante_nome && (
                          <span>Contratante: {contrato.contratante_nome}</span>
                        )}
                        {contrato.valor_contrato && (
                          <span>
                            Valor: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(contrato.valor_contrato)}
                          </span>
                        )}
                        {assinaturas.length > 0 && (
                          <span>
                            Assinaturas: {assinaturasCompletas}/{assinaturas.length}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Criado em {format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setVisualizarContrato(contrato)}
                        title="Visualizar"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => downloadPDF(contrato)}
                        title="Baixar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {hasLink && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyLink(contrato)}
                            title="Copiar Link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => sendWhatsApp(contrato)}
                            title="Enviar WhatsApp"
                            className="text-green-600 hover:text-green-700"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => sendEmail(contrato)}
                            title="Enviar E-mail"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {contrato.status === "rascunho" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => enviarParaAssinatura.mutate(contrato.id)}
                          disabled={enviarParaAssinatura.isPending}
                          title="Enviar para Assinatura"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialogs */}
      <NovoContratoDialog
        open={novoContratoOpen}
        onOpenChange={setNovoContratoOpen}
        templates={templates || []}
      />
      <TemplateContratoDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      {visualizarContrato && (
        <VisualizarContratoDialog
          contrato={visualizarContrato}
          open={!!visualizarContrato}
          onOpenChange={() => setVisualizarContrato(null)}
        />
      )}
    </div>
  );
}
