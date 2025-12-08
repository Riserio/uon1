// components/gestao/VisualizarContratoDialog.tsx
import React, { useRef } from "react";
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
import { CheckCircle2, Clock, XCircle, Copy, User, MessageCircle, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface VisualizarContratoDialogProps {
  contrato: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendente: {
    label: "Pendente",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: <Clock className="h-3 w-3" />,
  },
  assinado: {
    label: "Assinado",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  recusado: {
    label: "Recusado",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: <XCircle className="h-3 w-3" />,
  },
};

export default function VisualizarContratoDialog({ contrato, open, onOpenChange }: VisualizarContratoDialogProps) {
  const { data: historico } = useQuery({
    queryKey: ["contrato_historico", contrato?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_historico")
        .select("*")
        .eq("contrato_id", contrato.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && !!contrato?.id,
  });

  const assinaturas = contrato?.contrato_assinaturas || [];

  const previewRef = useRef<HTMLDivElement | null>(null);

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
      `Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`,
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
      `Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`,
    );
    const mailtoUrl = `mailto:${contrato.contratante_email || ""}?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, "_blank");
  };

  // --- Novo: gera PDF capturando o DOM (html2canvas) para manter fontes/margens/espacamento exatos ---
  const downloadPDF = async () => {
    try {
      if (!previewRef.current) {
        toast.error("Preview do contrato não disponível.");
        return;
      }

      toast.loading("Gerando PDF — preservando layout. Aguarde...");

      // Build a clone node so we don't affect the visible UI (we can adjust styles specifically for print)
      const clone = previewRef.current.cloneNode(true) as HTMLElement;

      // Ensure the clone uses the same computed fonts/styles: append style tag copying document styles (simple approach)
      // Clone current document stylesheets into inline style to preserve fonts/typography in the offscreen node.
      const styleEl = document.createElement("style");
      // Minimal print CSS to enforce margins and font smoothing for capture (adjust as needed)
      styleEl.innerHTML = `
        :root { --pdf-margin: 24px; }
        body, html { background: white; }
        .pdf-print-container { box-sizing: border-box; width: 794px; padding: 24px; background: white; color: #222; font-family: inherit; }
        .pdf-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px; }
        .pdf-title { text-align:center; margin-bottom:8px; color:#2962ff; font-weight:700; }
        .pdf-content h1, .pdf-content h2, .pdf-content h3 { color: #2962ff; margin: 12px 0 6px; }
        .pdf-content p { margin: 6px 0; line-height: 1.35; }
        .pdf-content ul, .pdf-content ol { margin: 6px 0 12px 20px; }
      `;
      const container = document.createElement("div");
      container.className = "pdf-print-container";
      container.style.background = "white";
      container.style.color = "#222";

      // Header area: logo (preto) + company text
      const header = document.createElement("div");
      header.className = "pdf-header";

      // LOGO: prefer contrato.logo_url (se informado), senão tenta a logo preta pública da Vangard
      const logoUrl = contrato?.logo_url || "https://vangardgestora.com.br/wp-content/uploads/2023/01/logo-preta.png";
      const logoImg = document.createElement("img");
      logoImg.src = logoUrl;
      logoImg.alt = "Vangard Gestora";
      logoImg.style.maxWidth = "180px";
      logoImg.style.height = "auto";
      logoImg.style.objectFit = "contain";
      logoImg.style.display = "block";
      logoImg.crossOrigin = "anonymous"; // tenta permitir CORS

      const headerLeft = document.createElement("div");
      headerLeft.innerHTML = `<div style="font-weight:700;font-size:18px">Vangard Gestora</div><div style="font-size:12px;color:#666;">vangardgestora.com.br</div>`;

      header.appendChild(headerLeft);
      header.appendChild(logoImg);

      // Title
      const titleNode = document.createElement("div");
      titleNode.className = "pdf-title";
      titleNode.style.fontSize = "16px";
      titleNode.style.fontWeight = "700";
      titleNode.textContent = contrato?.titulo || "Contrato";

      // Content wrapper: inject the contract HTML inside .pdf-content
      const contentWrapper = document.createElement("div");
      contentWrapper.className = "pdf-content";
      // Use contrato.conteudo_html if present; otherwise use the current content of preview clone
      contentWrapper.innerHTML = contrato?.conteudo_html || clone.innerHTML || "";

      // Add partes/metadata on top of content (keeps same order you used)
      const meta = document.createElement("div");
      meta.style.marginBottom = "10px";
      meta.innerHTML = `
        <strong>PARTES</strong>
        <p><strong>CONTRATANTE:</strong> ${contrato?.contratante_nome || "-"}</p>
        <p><strong>CPF/CNPJ:</strong> ${contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}</p>
        <p><strong>E-mail:</strong> ${contrato?.contratante_email || "-"}</p>
        <p><strong>CONTRATADA:</strong> Vangard Gestora — Rua Jacuí, 1273 - Floresta, Belo Horizonte - MG</p>
      `;

      // Compose print node
      container.appendChild(styleEl);
      container.appendChild(header);
      container.appendChild(titleNode);
      container.appendChild(meta);
      container.appendChild(contentWrapper);

      // Attach to body offscreen (invisible) so html2canvas can read fonts/styles
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      document.body.appendChild(container);

      // Wait a tick for images/fonts to load
      await new Promise((r) => setTimeout(r, 300));

      // Use html2canvas to capture the container
      const canvas = await html2canvas(container, {
        scale: 2, // improve resolution
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
      });

      // Remove offscreen container
      document.body.removeChild(container);

      // Build PDF from canvas (A4 portrait in mm)
      const pdf = new jsPDF("p", "mm", "a4");
      const imgData = canvas.toDataURL("image/png");

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeightPage = pdf.internal.pageSize.getHeight();

      // Calculate image height in mm with aspect ratio
      const imgProps = (pdf as any).getImageProperties(imgData);
      const imgWidthMm = pdfWidth;
      const imgHeightMm = (imgProps.height * imgWidthMm) / imgProps.width;

      if (imgHeightMm <= pdfHeightPage) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidthMm, imgHeightMm);
      } else {
        // Need to split into pages
        let remainingHeightPx = canvas.height;
        const pageCanvasHeightPx = Math.floor((canvas.width * pdfHeightPage) / imgWidthMm); // px equivalent of one pdf page height
        let page = 0;
        while (remainingHeightPx > 0) {
          const tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = canvas.width;
          tmpCanvas.height = Math.min(pageCanvasHeightPx, remainingHeightPx);
          const ctx = tmpCanvas.getContext("2d")!;
          // draw the slice
          ctx.drawImage(
            canvas,
            0,
            page * pageCanvasHeightPx,
            canvas.width,
            tmpCanvas.height,
            0,
            0,
            canvas.width,
            tmpCanvas.height,
          );
          const pageImg = tmpCanvas.toDataURL("image/png");
          const pageImgProps = (pdf as any).getImageProperties(pageImg);
          const pageImgHeightMm = (pageImgProps.height * imgWidthMm) / pageImgProps.width;
          if (page > 0) pdf.addPage();
          pdf.addImage(pageImg, "PNG", 0, 0, imgWidthMm, pageImgHeightMm);
          remainingHeightPx -= pageCanvasHeightPx;
          page += 1;
        }
      }

      const sanitize = (s: string) => String(s || "").replace(/[^\w\-_. ]+/g, "");
      const fileName = `${sanitize(String(contrato?.numero || "contrato"))}_${sanitize(String(contrato?.titulo || "documento")).replace(/\s+/g, "_")}.pdf`;
      pdf.save(fileName);

      toast.success("PDF gerado com fidelidade ao HTML!");
    } catch (err) {
      console.error("Erro ao gerar PDF via html2canvas:", err);
      toast.error("Erro ao gerar PDF. Veja console para detalhes.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{contrato?.titulo}</DialogTitle>
            <Badge variant="outline">{contrato?.numero}</Badge>
          </div>
          <DialogDescription>
            Criado em{" "}
            {contrato?.created_at
              ? format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
              : "-"}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="documento" className="w-full">
          <TabsList>
            <TabsTrigger value="documento">Documento</TabsTrigger>
            <TabsTrigger value="assinaturas">Assinaturas ({assinaturas.length})</TabsTrigger>
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
                      <Download className="h-4 w-4 mr-2" /> Baixar PDF
                    </Button>

                    {(contrato?.status === "aguardando_assinatura" || contrato?.link_token) && (
                      <>
                        <Button variant="outline" size="sm" onClick={copyLink}>
                          <Copy className="h-4 w-4 mr-2" /> Copiar Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={sendWhatsApp}
                          className="text-green-600 hover:text-green-700"
                        >
                          <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={sendEmail}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Mail className="h-4 w-4 mr-2" /> E-mail
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
                    <p className="font-medium">{contrato?.contratante_nome || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">E-mail:</span>
                    <p className="font-medium">{contrato?.contratante_email || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CPF/CNPJ:</span>
                    <p className="font-medium">{contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor:</span>
                    <p className="font-medium">
                      {contrato?.valor_contrato
                        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                            contrato.valor_contrato,
                          )
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Início:</span>
                    <p className="font-medium">
                      {contrato?.data_inicio ? format(new Date(contrato.data_inicio), "dd/MM/yyyy") : "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fim:</span>
                    <p className="font-medium">
                      {contrato?.data_fim ? format(new Date(contrato.data_fim), "dd/MM/yyyy") : "-"}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Prévia do Documento</h4>

                  {/* previewRef contém o conteúdo que será capturado por html2canvas */}
                  <div
                    ref={previewRef}
                    className="prose prose-sm max-w-none border rounded-lg p-6 bg-white text-black"
                    style={{ background: "#ffffff", color: "#222", fontFamily: "inherit", lineHeight: 1.35 }}
                    dangerouslySetInnerHTML={{ __html: contrato?.conteudo_html || "" }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assinaturas" className="mt-4">
            {/* ... mesma renderização de assinaturas que você já tinha ... */}
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
                              <p className="text-sm text-muted-foreground">{assinatura.email}</p>
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
                            <img src={assinatura.assinatura_url} alt="Assinatura" className="max-h-16 border rounded" />
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
                  {historico?.map((item: any) => (
                    <div key={item.id} className="relative pl-10 pb-4">
                      <div className="absolute left-2.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div className="bg-card border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{item.acao}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {item.descricao && <p className="text-sm text-muted-foreground mt-1">{item.descricao}</p>}
                        {item.ip && <p className="text-xs text-muted-foreground mt-1">IP: {item.ip}</p>}
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
