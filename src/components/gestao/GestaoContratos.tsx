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

  const downloadPDF = (contrato: any) => {
    try {
      const assinaturas = contrato.contrato_assinaturas || [];
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let yPosition = margin;

      // Header with company name
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Vangard Gestora", margin, yPosition + 10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text("vangardgestora.com.br", margin, yPosition + 16);
      yPosition += 30;

      // Title with blue underline
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(41, 98, 255);
      const titleText = contrato.titulo || "Contrato";
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
      const cpfCnpj = contrato.contratante_cpf || contrato.contratante_cnpj || "-";
      const email = contrato.contratante_email || "-";
      doc.text(`CPF/CNPJ: ${cpfCnpj} | E-mail: ${email}`, margin, yPosition);
      yPosition += 8;
      
      // Contratada
      doc.text("CONTRATADA: ", margin, yPosition);
      doc.setFont("helvetica", "bold");
      doc.text("Vangard Gestora", margin + doc.getTextWidth("CONTRATADA: "), yPosition);
      yPosition += 15;

      // Contract content - extract structured text from HTML preserving paragraphs
      const extractStructuredText = (html: string): { type: 'title' | 'subtitle' | 'text'; content: string }[] => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        
        // Remove script and style tags
        tempDiv.querySelectorAll("script, style, header, footer").forEach(el => el.remove());
        
        const sections: { type: 'title' | 'subtitle' | 'text'; content: string }[] = [];
        
        // Extract h1 as title
        tempDiv.querySelectorAll("h1").forEach(el => {
          const text = (el.textContent || "").trim();
          if (text) sections.push({ type: 'title', content: text });
        });
        
        // Extract strong/b and clause headers as subtitles
        tempDiv.querySelectorAll(".clause strong, .clause > strong:first-child").forEach(el => {
          const text = (el.textContent || "").trim();
          if (text && text.includes("CLÁUSULA")) {
            sections.push({ type: 'subtitle', content: text });
          }
        });
        
        // Extract paragraphs
        tempDiv.querySelectorAll("p, .clause p").forEach(el => {
          const text = (el.textContent || "").trim();
          if (text && text.length > 10) {
            sections.push({ type: 'text', content: text });
          }
        });
        
        // If no structured content found, get plain text
        if (sections.length === 0) {
          const text = (tempDiv.textContent || "").trim().replace(/\s+/g, " ");
          if (text) sections.push({ type: 'text', content: text });
        }
        
        return sections;
      };

      const sections = extractStructuredText(contrato.conteudo_html || "");
      
      for (const section of sections) {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = margin;
        }
        
        if (section.type === 'title') {
          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(41, 98, 255);
          const titleWidth = doc.getTextWidth(section.content);
          const titleX = (pageWidth - titleWidth) / 2;
          doc.text(section.content, titleX, yPosition);
          yPosition += 10;
        } else if (section.type === 'subtitle') {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 30, 30);
          doc.text(section.content, margin, yPosition);
          yPosition += 8;
        } else {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 60);
          
          // Justify text
          const textLines = doc.splitTextToSize(section.content, pageWidth - 2 * margin);
          
          for (let i = 0; i < textLines.length; i++) {
            if (yPosition > pageHeight - 30) {
              doc.addPage();
              yPosition = margin;
            }
            
            // Simple justified text (left-aligned for readability)
            doc.text(textLines[i], margin, yPosition, { align: "left", maxWidth: pageWidth - 2 * margin });
            yPosition += 5;
          }
          yPosition += 3; // Extra space between paragraphs
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

        // Add contract creation info
        if (contrato.created_at) {
          doc.setDrawColor(230, 230, 230);
          doc.setFillColor(245, 245, 250);
          doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 20, 3, 3, "FD");
          
          const dataCriacao = format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(60, 60, 100);
          doc.text("Contrato Gerado:", margin + 5, yPosition + 3);
          doc.setFont("helvetica", "normal");
          doc.text(dataCriacao, margin + 45, yPosition + 3);
          doc.text(`Número: ${contrato.numero || "N/A"}`, margin + 5, yPosition + 11);
          
          yPosition += 28;
        }

        for (const assinatura of assinaturas) {
          if (assinatura.status === "assinado" && assinatura.assinado_em) {
            if (yPosition > pageHeight - 55) {
              doc.addPage();
              yPosition = margin;
            }

            const tipoLabel = assinatura.tipo === "contratado" ? "CONTRATADA" : 
                              assinatura.tipo === "contratante" ? "CONTRATANTE" : "TESTEMUNHA";
            
            doc.setDrawColor(230, 230, 230);
            doc.setFillColor(250, 250, 250);
            doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 42, 3, 3, "FD");

            const dataAssinatura = format(new Date(assinatura.assinado_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.text(`${assinatura.nome || "Signatário"}`, margin + 5, yPosition + 3);
            
            doc.setFontSize(8);
            doc.setTextColor(102, 51, 153);
            doc.text(`[${tipoLabel}]`, margin + 5 + doc.getTextWidth(assinatura.nome || "Signatário") + 3, yPosition + 3);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(80, 80, 80);
            
            doc.text(`Data/Hora: ${dataAssinatura}`, margin + 5, yPosition + 12);
            doc.text(`IP: ${assinatura.ip_assinatura || "N/A"}`, margin + 5, yPosition + 20);
            
            const hash = assinatura.hash_documento ? `${assinatura.hash_documento.substring(0, 50)}...` : "N/A";
            doc.text(`Hash: ${hash}`, margin + 5, yPosition + 28);
            
            if (assinatura.latitude && assinatura.longitude) {
              doc.text(`Localização: ${assinatura.latitude.toFixed(6)}, ${assinatura.longitude.toFixed(6)}`, margin + 5, yPosition + 36);
            } else {
              doc.text(`Localização: Não disponível`, margin + 5, yPosition + 36);
            }
            
            yPosition += 50;
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

      const fileName = `${contrato.numero || "contrato"}_${(contrato.titulo || "documento").replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);
      toast.success("PDF baixado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF");
    }
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
