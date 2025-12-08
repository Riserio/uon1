import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Copy,
  User,
  MessageCircle,
  Download,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

interface VisualizarContratoDialogProps {
  contrato: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendente: { label: "Pendente", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: <Clock className="h-3 w-3" /> },
  assinado: { label: "Assinado", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
  recusado: { label: "Recusado", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle className="h-3 w-3" /> },
};

export default function VisualizarContratoDialog({
  contrato,
  open,
  onOpenChange,
}: VisualizarContratoDialogProps) {
  // Fetch histórico
  const { data: historico } = useQuery({
    queryKey: ["contrato_historico", contrato.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_historico")
        .select("*")
        .eq("contrato_id", contrato.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const assinaturas = contrato.contrato_assinaturas || [];

  const copyLink = () => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const sendWhatsApp = () => {
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

  const sendEmail = () => {
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

  const downloadPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let yPosition = margin;

      // Header
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
      yPosition += 12;

      // Contract description
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const descText = "Contrato de prestação de serviços para prestação de serviços de associação e proteção veicular.";
      const descLines = doc.splitTextToSize(descText, pageWidth - 2 * margin);
      for (const line of descLines) {
        doc.text(line, margin, yPosition);
        yPosition += 5;
      }
      yPosition += 8;

      // PARTES section
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("PARTES", margin, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      
      // Contratante info
      doc.text(`CONTRATANTE: ${contrato.contratante_nome || "-"}`, margin, yPosition);
      yPosition += 5;
      doc.text(`CPF/CNPJ: ${contrato.contratante_cpf || contrato.contratado_cnpj || "-"}`, margin, yPosition);
      yPosition += 5;
      doc.text(`E-mail: ${contrato.contratante_email || "-"}`, margin, yPosition);
      yPosition += 5;
      if (contrato.contratante_telefone) {
        doc.text(`Telefone: ${contrato.contratante_telefone}`, margin, yPosition);
        yPosition += 5;
      }
      yPosition += 5;
      
      // Contratada info
      doc.text("CONTRATADA: Vangard Gestora", margin, yPosition);
      yPosition += 5;
      doc.text("Rua Jacuí, 1273 - Floresta, Belo Horizonte - MG", margin, yPosition);
      yPosition += 12;

      // Contract content - extract clean text from HTML
      const extractTextFromHtml = (html: string): string => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
        
        // Remove script and style tags
        tempDiv.querySelectorAll("script, style").forEach(el => el.remove());
        
        // Get clean text content
        let text = tempDiv.textContent || tempDiv.innerText || "";
        
        // Clean up whitespace
        text = text.replace(/\s+/g, " ").trim();
        
        return text;
      };

      const textContent = extractTextFromHtml(contrato.conteudo_html || "");
      
      if (textContent) {
        const contentLines = doc.splitTextToSize(textContent, pageWidth - 2 * margin);
        for (const line of contentLines) {
          if (yPosition > pageHeight - 30) {
            doc.addPage();
            yPosition = margin;
          }
          doc.text(line, margin, yPosition);
          yPosition += 5;
        }
      }

      // Add signature footer
      if (assinaturas && assinaturas.length > 0) {
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
        yPosition += 10;

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.setFont("helvetica", "normal");
        doc.text("Este documento foi assinado digitalmente.", margin, yPosition);
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

            const dataAssinatura = format(new Date(assinatura.assinado_em), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.text(assinatura.nome || "Signatário", margin + 5, yPosition + 3);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(80, 80, 80);
            
            doc.text(`Data/Hora: ${dataAssinatura}`, margin + 5, yPosition + 12);
            doc.text(`IP: ${assinatura.ip_assinatura || "N/A"}`, margin + 90, yPosition + 12);
            
            const hashText = assinatura.hash_documento ? assinatura.hash_documento.substring(0, 40) + "..." : "N/A";
            doc.text(`Hash: ${hashText}`, margin + 5, yPosition + 20);
            
            if (assinatura.latitude && assinatura.longitude) {
              doc.text(`Loc: ${Number(assinatura.latitude).toFixed(6)}, ${Number(assinatura.longitude).toFixed(6)}`, margin + 5, yPosition + 28);
            }
            
            yPosition += 42;
          }
        }
      }

      // Footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - 15;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} | Uon1Sign | Página ${i} de ${totalPages}`, margin, footerY);
      }

      const fileName = `${contrato.numero || "contrato"}_${(contrato.titulo || "documento").replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);
      toast.success("PDF baixado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF. Verifique os dados do contrato.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{contrato.titulo}</DialogTitle>
            <Badge variant="outline">{contrato.numero}</Badge>
          </div>
          <DialogDescription>
            Criado em {format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="documento" className="w-full">
          <TabsList>
            <TabsTrigger value="documento">Documento</TabsTrigger>
            <TabsTrigger value="assinaturas">
              Assinaturas ({assinaturas.length})
            </TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="documento" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">Dados do Contrato</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={downloadPDF}>
                      <Download className="h-4 w-4 mr-2" />
                      Baixar PDF
                    </Button>
                    {(contrato.status === "aguardando_assinatura" || contrato.link_token) && (
                      <>
                        <Button variant="outline" size="sm" onClick={copyLink}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar Link
                        </Button>
                        <Button variant="outline" size="sm" onClick={sendWhatsApp} className="text-green-600 hover:text-green-700">
                          <MessageCircle className="h-4 w-4 mr-2" />
                          WhatsApp
                        </Button>
                        <Button variant="outline" size="sm" onClick={sendEmail} className="text-blue-600 hover:text-blue-700">
                          <Mail className="h-4 w-4 mr-2" />
                          E-mail
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Contratante:</span>
                    <p className="font-medium">{contrato.contratante_nome || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">E-mail:</span>
                    <p className="font-medium">{contrato.contratante_email || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CPF/CNPJ:</span>
                    <p className="font-medium">{contrato.contratante_cpf || contrato.contratante_cnpj || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor:</span>
                    <p className="font-medium">
                      {contrato.valor_contrato
                        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(contrato.valor_contrato)
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Início:</span>
                    <p className="font-medium">
                      {contrato.data_inicio
                        ? format(new Date(contrato.data_inicio), "dd/MM/yyyy")
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fim:</span>
                    <p className="font-medium">
                      {contrato.data_fim
                        ? format(new Date(contrato.data_fim), "dd/MM/yyyy")
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Prévia do Documento</h4>
                  <div
                    className="prose prose-sm max-w-none border rounded-lg p-4 bg-card max-h-[400px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: contrato.conteudo_html }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assinaturas" className="mt-4">
            <div className="space-y-3">
              {assinaturas.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum signatário cadastrado
                  </CardContent>
                </Card>
              ) : (
                assinaturas.map((assinatura: any) => {
                  const status = statusConfig[assinatura.status] || statusConfig.pendente;
                  return (
                    <Card key={assinatura.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{assinatura.nome}</span>
                                <Badge variant="outline" className="text-xs">
                                  {assinatura.tipo}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {assinatura.email}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={`${status.color} flex items-center gap-1`}>
                              {status.icon}
                              {status.label}
                            </Badge>
                            {assinatura.assinado_em && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(assinatura.assinado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            )}
                          </div>
                        </div>
                        {assinatura.assinatura_url && (
                          <div className="mt-3 border-t pt-3">
                            <p className="text-xs text-muted-foreground mb-2">Assinatura:</p>
                            <img
                              src={assinatura.assinatura_url}
                              alt="Assinatura"
                              className="max-h-16 border rounded"
                            />
                          </div>
                        )}
                        {assinatura.status === "assinado" && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <p>IP: {assinatura.ip_assinatura || "N/A"}</p>
                            <p>Hash: {assinatura.hash_documento?.substring(0, 20)}...</p>
                            {assinatura.latitude && assinatura.longitude && (
                              <p>
                                Localização: {assinatura.latitude.toFixed(4)}, {assinatura.longitude.toFixed(4)}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <div className="space-y-3">
              {historico?.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum registro no histórico
                  </CardContent>
                </Card>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  {historico?.map((item: any, index: number) => (
                    <div key={item.id} className="relative pl-10 pb-4">
                      <div className="absolute left-2.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div className="bg-card border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{item.acao}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {item.descricao && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {item.descricao}
                          </p>
                        )}
                        {item.ip && (
                          <p className="text-xs text-muted-foreground mt-1">
                            IP: {item.ip}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
