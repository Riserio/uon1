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

  // fetch image -> dataURL (for repeated header logo in pdf)
  const fetchImageDataUrl = async (url?: string): Promise<string | null> => {
    if (!url) return null;
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn("Não foi possível carregar a imagem:", err);
      return null;
    }
  };

  // Main: html2canvas capture + jsPDF slicing with repeated header/footer
  const downloadPDF = async () => {
    if (!previewRef.current) {
      toast.error("Preview do contrato não disponível.");
      return;
    }

    // show loading toast and keep id to update later
    const toastId = toast.loading("Gerando PDF — preservando layout. Aguarde...");

    try {
      // build offscreen container that contains the exact HTML preview + signatures
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.background = "#ffffff";
      container.style.color = "#222";
      container.style.padding = "24px";
      container.style.width = "794px"; // approx A4 width at 96dpi
      container.style.boxSizing = "border-box";
      container.style.fontFamily = "Arial, Helvetica, sans-serif";
      container.style.fontSize = "12px";
      container.className = "pdf-offscreen-container";

      // header (visually for first page)
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "flex-start";
      header.style.gap = "12px";
      header.style.marginBottom = "8px";

      // local logo: prefer contrato.logo_url, otherwise local public/logo-preta.png
      const logoUrl = contrato?.logo_url || "/logo-preta.png";
      const logoImg = document.createElement("img");
      logoImg.src = logoUrl;
      logoImg.alt = "Vangard Gestora";
      logoImg.style.maxWidth = "180px";
      logoImg.style.height = "auto";
      logoImg.style.objectFit = "contain";
      logoImg.crossOrigin = "anonymous"; // helps if hosted with CORS
      const leftText = document.createElement("div");
      leftText.innerHTML = `<div style="font-weight:700;font-size:16px">Vangard Gestora</div><div style="color:#666;font-size:11px">vangardgestora.com.br</div>`;

      header.appendChild(leftText);
      header.appendChild(logoImg);
      container.appendChild(header);

      // title
      const titleEl = document.createElement("div");
      titleEl.style.textAlign = "center";
      titleEl.style.fontWeight = "700";
      titleEl.style.fontSize = "14px";
      titleEl.style.color = "#2962ff";
      titleEl.style.marginBottom = "8px";
      titleEl.textContent = contrato?.titulo || "Contrato";
      container.appendChild(titleEl);

      // meta (PARTES)
      const meta = document.createElement("div");
      meta.style.marginBottom = "8px";
      meta.innerHTML = `
        <strong>PARTES</strong>
        <p style="margin:6px 0;"><strong>CONTRATANTE:</strong> ${contrato?.contratante_nome || "-"}</p>
        <p style="margin:6px 0;"><strong>CPF/CNPJ:</strong> ${contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}</p>
        <p style="margin:6px 0;"><strong>E-mail:</strong> ${contrato?.contratante_email || "-"}</p>
        <p style="margin:6px 0;"><strong>CONTRATADA:</strong> Vangard Gestora — Rua Jacuí, 1273 - Floresta, Belo Horizonte - MG</p>
      `;
      container.appendChild(meta);

      // content (use contrato.conteudo_html)
      const content = document.createElement("div");
      content.className = "pdf-content";
      content.style.lineHeight = "1.35";
      content.style.color = "#222";
      content.style.fontSize = "12px";
      content.innerHTML = contrato?.conteudo_html || previewRef.current.innerHTML || "";
      container.appendChild(content);

      // signatures log appended
      const sigSection = document.createElement("div");
      sigSection.style.marginTop = "18px";
      sigSection.innerHTML = `<h4 style="color:#662b91;margin:8px 0 6px">REGISTRO DE ASSINATURAS</h4>`;
      if (contrato?.created_at) {
        sigSection.innerHTML += `<div style="background:#f6f6fb;padding:8px;border-radius:4px;margin-bottom:8px">
          <div style="font-weight:700">Contrato Gerado:</div>
          <div>${format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</div>
          <div style="margin-top:6px">Número: ${contrato.numero || "N/A"}</div>
        </div>`;
      }
      if (assinaturas && assinaturas.length > 0) {
        assinaturas.forEach((a: any) => {
          const aHtml = document.createElement("div");
          aHtml.style.border = "1px solid #eee";
          aHtml.style.padding = "8px";
          aHtml.style.borderRadius = "6px";
          aHtml.style.marginBottom = "8px";
          const dataAss = a.assinado_em
            ? format(new Date(a.assinado_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
            : "-";
          aHtml.innerHTML = `
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
              <div>
                <div style="font-weight:700">${a.nome || "Signatário"}</div>
                <div style="font-size:12px;color:#555">${a.email || ""}</div>
                <div style="font-size:12px;color:#555">${a.tipo ? a.tipo.toUpperCase() : ""}</div>
              </div>
              <div style="text-align:right;font-size:12px;color:#333">
                <div>Data/Hora: ${dataAss}</div>
                <div>IP: ${a.ip_assinatura || "N/A"}</div>
                <div>Hash: ${a.hash_documento ? a.hash_documento.substring(0, 60) + "..." : "N/A"}</div>
                <div>Local: ${a.latitude && a.longitude ? `${Number(a.latitude).toFixed(6)}, ${Number(a.longitude).toFixed(6)}` : "Não disponível"}</div>
              </div>
            </div>
          `;
          sigSection.appendChild(aHtml);
        });
      } else {
        sigSection.innerHTML += `<div style="color:#666">Nenhuma assinatura registrada.</div>`;
      }
      container.appendChild(sigSection);

      const gen = format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
      const footerNote = document.createElement("div");
      footerNote.style.marginTop = "12px";
      footerNote.style.fontSize = "11px";
      footerNote.style.color = "#666";
      footerNote.textContent = `Documento gerado em ${gen} | Uon1Sign`;
      container.appendChild(footerNote);

      document.body.appendChild(container);
      // small delay to let local images load
      await new Promise((r) => setTimeout(r, 450));

      // capture
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
      });

      // remove temp container
      document.body.removeChild(container);

      // prepare pdf
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidthMm = pdf.internal.pageSize.getWidth();
      const pdfHeightMm = pdf.internal.pageSize.getHeight();
      const pageMarginMm = 12;
      const headerHeightMm = 18;
      const footerHeightMm = 12;
      const contentAreaMm = pdfHeightMm - headerHeightMm - footerHeightMm - 2 * 4;

      const canvasWidthPx = canvas.width;
      const canvasHeightPx = canvas.height;
      const usablePdfWidthMm = pdfWidthMm - 2 * pageMarginMm;
      const pxPerMm = canvasWidthPx / usablePdfWidthMm;
      const pageCanvasHeightPx = Math.floor(contentAreaMm * pxPerMm);

      // logo data url
      const logoDataUrl = await fetchImageDataUrl(logoUrl);

      // slice pages
      let remainingHeightPx = canvasHeightPx;
      let yOffsetPx = 0;
      let pageIndex = 0;

      while (remainingHeightPx > 0) {
        const sliceHeightPx = Math.min(pageCanvasHeightPx, remainingHeightPx);
        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = canvasWidthPx;
        tmpCanvas.height = sliceHeightPx;
        const tCtx = tmpCanvas.getContext("2d")!;
        tCtx.fillStyle = "#ffffff";
        tCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
        tCtx.drawImage(canvas, 0, yOffsetPx, canvasWidthPx, sliceHeightPx, 0, 0, canvasWidthPx, sliceHeightPx);

        const imgData = tmpCanvas.toDataURL("image/png");
        const imgProps = (pdf as any).getImageProperties(imgData);
        const imgHeightMm = (imgProps.height * usablePdfWidthMm) / imgProps.width;

        if (pageIndex > 0) pdf.addPage();

        // repeated header
        try {
          if (logoDataUrl) {
            const logoWidthMm = 36;
            const logoHeightMm = 12;
            pdf.addImage(logoDataUrl, "PNG", pageMarginMm, 6, logoWidthMm, logoHeightMm);
            pdf.setFontSize(12);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 30, 30);
            pdf.text("Vangard Gestora", pageMarginMm + logoWidthMm + 4, 12);
            pdf.setFontSize(9);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(100, 100, 100);
            pdf.text("vangardgestora.com.br", pageMarginMm + logoWidthMm + 4, 17);
          } else {
            pdf.setFontSize(12);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 30, 30);
            pdf.text("Vangard Gestora", pageMarginMm, 12);
            pdf.setFontSize(9);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(100, 100, 100);
            pdf.text("vangardgestora.com.br", pageMarginMm, 17);
          }
        } catch (err) {
          // fallback header text only
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 30, 30);
          pdf.text("Vangard Gestora", pageMarginMm, 12);
        }

        // draw slice image
        const imgY = headerHeightMm;
        pdf.addImage(imgData, "PNG", pageMarginMm, imgY, usablePdfWidthMm, imgHeightMm);

        // footer
        const footerY = pdfHeightMm - footerHeightMm + 4;
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.3);
        pdf.line(pageMarginMm, footerY - 4, pdfWidthMm - pageMarginMm, footerY - 4);
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        const gen2 = format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
        const footerText = `Documento gerado em ${gen2} | Uon1Sign | Página ${pageIndex + 1}`;
        pdf.text(footerText, pageMarginMm, footerY);

        yOffsetPx += sliceHeightPx;
        remainingHeightPx -= sliceHeightPx;
        pageIndex += 1;
      }

      const sanitize = (s: string) => String(s || "").replace(/[^\w\-_. ]+/g, "");
      const fileName = `${sanitize(String(contrato?.numero || "contrato"))}_${sanitize(String(contrato?.titulo || "documento")).replace(/\s+/g, "_")}.pdf`;
      pdf.save(fileName);

      // update toast (use same id to replace the loading)
      toast.success("PDF gerado com fidelidade ao HTML!", { id: toastId });
    } catch (err) {
      console.error("Erro ao gerar PDF via html2canvas + jsPDF:", err);
      toast.error("Erro ao gerar PDF. Veja console para detalhes.", { id: toastId });
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
