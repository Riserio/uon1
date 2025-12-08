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

  // Converte imagem remota para dataURL (evita problemas de CORS ao desenhar no canvas)
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
      console.warn("Não foi possível carregar a imagem da logo:", err);
      return null;
    }
  };

  /**
   * Gera PDF preservando layout:
   * - captura header em canvas separado (com logo)
   * - captura container completo em canvas
   * - divide o canvas em fatias por página, compondo cada página com header + slice + footer
   * - salva PDF com cabeçalho repetido e rodapé em cada página
   */
  const downloadPDF = async () => {
    try {
      if (!previewRef.current) {
        toast.error("Preview do contrato não disponível.");
        return;
      }

      toast.loading("Gerando PDF — preservando layout. Aguarde...");

      // --- 1) Prepara logo DataURL (prefere contrato.logo_url, senão tenta a logo preta pública)
      const preferredLogo =
        contrato?.logo_url || "https://vangardgestora.com.br/wp-content/uploads/2023/01/logo-preta.png";
      const logoDataUrl = await fetchImageDataUrl(preferredLogo);

      // --- 2) Monta um elemento de header isolado (para capturar e repetir)
      const headerEl = document.createElement("div");
      headerEl.style.boxSizing = "border-box";
      headerEl.style.width = "794px"; //  A4 @ ~96dpi -> ~794px width at scale 1
      headerEl.style.padding = "16px 24px";
      headerEl.style.display = "flex";
      headerEl.style.justifyContent = "space-between";
      headerEl.style.alignItems = "flex-start";
      headerEl.style.background = "#ffffff";
      headerEl.style.color = "#222";
      headerEl.style.fontFamily = "inherit";

      const left = document.createElement("div");
      left.innerHTML = `<div style="font-weight:700;font-size:18px">Vangard Gestora</div><div style="font-size:12px;color:#666;">vangardgestora.com.br</div>`;
      headerEl.appendChild(left);

      const logoImg = document.createElement("img");
      logoImg.alt = "Vangard Gestora";
      logoImg.style.maxWidth = "180px";
      logoImg.style.height = "auto";
      logoImg.style.objectFit = "contain";
      logoImg.style.display = "block";
      if (logoDataUrl) {
        logoImg.src = logoDataUrl;
      } else {
        // se não carregou, ainda tenta o URL direto (pode falhar por CORS)
        logoImg.src = preferredLogo;
      }
      headerEl.appendChild(logoImg);

      headerEl.style.position = "fixed";
      headerEl.style.left = "-9999px";
      document.body.appendChild(headerEl);

      // Captura header (melhor como imagem separada)
      const headerCanvas = await html2canvas(headerEl, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const headerPxHeight = headerCanvas.height;
      const headerDataUrl = headerCanvas.toDataURL("image/png");
      // remove header do DOM
      document.body.removeChild(headerEl);

      // --- 3) Monta o container com layout (clone do preview + meta + title + header area included in container)
      const container = document.createElement("div");
      container.className = "pdf-print-container";
      container.style.boxSizing = "border-box";
      container.style.width = "794px";
      container.style.padding = "16px 24px";
      container.style.background = "white";
      container.style.color = "#222";
      container.style.fontFamily = "inherit";
      container.style.lineHeight = "1.35";

      // Add header visual inside the container (so the top of the first page appears identical)
      const containerHeader = document.createElement("div");
      containerHeader.style.display = "flex";
      containerHeader.style.justifyContent = "space-between";
      containerHeader.style.alignItems = "flex-start";
      containerHeader.style.marginBottom = "8px";
      containerHeader.innerHTML = left.innerHTML;
      const containerLogo = document.createElement("img");
      containerLogo.alt = "Vangard Gestora";
      containerLogo.style.maxWidth = "180px";
      containerLogo.style.height = "auto";
      containerLogo.style.objectFit = "contain";
      if (logoDataUrl) containerLogo.src = logoDataUrl;
      else containerLogo.src = preferredLogo;
      containerHeader.appendChild(containerLogo);
      container.appendChild(containerHeader);

      // Title
      const titleNode = document.createElement("div");
      titleNode.style.textAlign = "center";
      titleNode.style.margin = "6px 0 12px 0";
      titleNode.style.color = "#2962ff";
      titleNode.style.fontWeight = "700";
      titleNode.style.fontSize = "16px";
      titleNode.textContent = contrato?.titulo || "Contrato";
      container.appendChild(titleNode);

      // Meta (PARTES)
      const meta = document.createElement("div");
      meta.style.marginBottom = "10px";
      meta.innerHTML = `
        <strong>PARTES</strong>
        <p style="margin:6px 0;"><strong>CONTRATANTE:</strong> ${contrato?.contratante_nome || "-"}</p>
        <p style="margin:6px 0;"><strong>CPF/CNPJ:</strong> ${contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}</p>
        <p style="margin:6px 0;"><strong>E-mail:</strong> ${contrato?.contratante_email || "-"}</p>
        <p style="margin:6px 0;"><strong>CONTRATADA:</strong> Vangard Gestora — Rua Jacuí, 1273 - Floresta, Belo Horizonte - MG</p>
      `;
      container.appendChild(meta);

      // Content: insere o HTML do contrato (mantendo a formatação que aparece no preview)
      const contentWrapper = document.createElement("div");
      contentWrapper.className = "pdf-content";
      contentWrapper.style.color = "#222";
      contentWrapper.style.fontSize = "12px";
      contentWrapper.style.lineHeight = "1.35";
      // se o HTML vier com classes/prose, mantemos o innerHTML cru
      contentWrapper.innerHTML = contrato?.conteudo_html || (previewRef.current ? previewRef.current.innerHTML : "");
      container.appendChild(contentWrapper);

      // Log de assinaturas ao final (visível na captura)
      if (assinaturas && assinaturas.length > 0) {
        const assinaturasTitle = document.createElement("h4");
        assinaturasTitle.textContent = "REGISTRO DE ASSINATURAS";
        assinaturasTitle.style.color = "#663399";
        assinaturasTitle.style.marginTop = "14px";
        container.appendChild(assinaturasTitle);

        const createdInfo = document.createElement("div");
        createdInfo.style.marginBottom = "8px";
        if (contrato?.created_at) {
          const dataCriacao = format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
          createdInfo.innerHTML = `<div><strong>Contrato Gerado:</strong> ${dataCriacao}</div><div><strong>Número:</strong> ${contrato.numero || "N/A"}</div>`;
          container.appendChild(createdInfo);
        }

        assinaturas.forEach((a: any) => {
          const box = document.createElement("div");
          box.style.border = "1px solid #eee";
          box.style.padding = "8px";
          box.style.marginBottom = "8px";
          box.innerHTML = `<div style="font-weight:600">${a.nome || "Signatário"}</div>
            <div style="font-size:12px;color:#333">Tipo: ${a.tipo || "-"} — Status: ${a.status || "-"}</div>
            <div style="font-size:12px;color:#666">Data/Hora: ${a.assinado_em ? format(new Date(a.assinado_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR }) : "N/A"}</div>
            <div style="font-size:12px;color:#666">IP: ${a.ip_assinatura || "N/A"}</div>
            <div style="font-size:12px;color:#666">Hash: ${a.hash_documento ? `${a.hash_documento.substring(0, 60)}...` : "N/A"}</div>
          `;
          // se tiver assinatura imagem, tenta adicionar
          if (a.assinatura_url) {
            const img = document.createElement("img");
            img.src = a.assinatura_url;
            img.alt = "assinatura";
            img.style.maxHeight = "60px";
            img.style.display = "block";
            img.style.marginTop = "8px";
            box.appendChild(img);
          }
          container.appendChild(box);
        });
      }

      // coloca offscreen para captura
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      document.body.appendChild(container);

      // espera um pouquinho para carregar imagens/fonte
      await new Promise((r) => setTimeout(r, 350));

      // --- 4) captura o container completo em canvas (alta resolução)
      const fullCanvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      // remove container
      document.body.removeChild(container);

      // --- 5) Composição por páginas: para cada fatia, criamos um tmpCanvas que inclui headerCanvas + slice + footer text ---
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidthMm = pdf.internal.pageSize.getWidth(); // mm
      const pdfHeightMm = pdf.internal.pageSize.getHeight(); // mm

      // Pixels <-> mm conversion using image properties
      const imgDataFull = fullCanvas.toDataURL("image/png");
      const imgPropsFull = (pdf as any).getImageProperties(imgDataFull);
      // largura da imagem em pixels
      const fullPxWidth = fullCanvas.width;
      const fullPxHeight = fullCanvas.height;
      // escala para ajustar largura da página
      const pxToMm = pdfWidthMm / fullPxWidth;
      // altura equivalente em mm: fullPxHeight * pxToMm

      // headerCanvas: já capturado acima (headerCanvas)
      const headerImg = headerDataUrl;
      const headerCanvasObj = headerCanvas;
      const headerPxH = headerCanvasObj.height; // px

      // Footer height in px (we draw text, estimate)
      const footerPxH = Math.round(20 * (fullCanvas.width / 794)); // roughly 20px at base width scaled

      // page image height in pixels (slice) available for content: compute px equivalent for pdf page height minus header/footer
      const pagePxHeight = Math.floor(pdfHeightMm / pxToMm); // full page in px (approx)
      const contentSlicePx = pagePxHeight - headerPxH - footerPxH;
      if (contentSlicePx <= 50) {
        // fallback very small, use whole page
        toast.error("Erro de cálculo de paginação. Tente reduzir escala.");
        return;
      }

      // now iterate slices
      let remaining = fullPxHeight;
      let offsetY = 0;
      let pageIndex = 0;

      while (remaining > 0) {
        // slice height in px for this page
        const sliceHeightPx = Math.min(contentSlicePx, remaining);

        // create canvas for page: width = fullCanvas.width; height = headerPxH + sliceHeightPx + footerPxH
        const tmp = document.createElement("canvas");
        tmp.width = fullPxWidth;
        tmp.height = headerPxH + sliceHeightPx + footerPxH;
        const ctx = tmp.getContext("2d")!;

        // draw header
        ctx.drawImage(
          headerCanvasObj,
          0,
          0,
          headerCanvasObj.width,
          headerCanvasObj.height,
          0,
          0,
          fullPxWidth,
          headerPxH,
        );

        // draw slice of fullCanvas
        ctx.drawImage(fullCanvas, 0, offsetY, fullPxWidth, sliceHeightPx, 0, headerPxH, fullPxWidth, sliceHeightPx);

        // draw footer text
        const genText = `Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} | Uon1Sign | Página ${pageIndex + 1}`;
        ctx.fillStyle = "#666";
        const footerFontPx = Math.max(10, Math.floor(10 * (fullPxWidth / 794)));
        ctx.font = `${footerFontPx}px sans-serif`;
        const textWidthPx = ctx.measureText(genText).width;
        const padding = 12;
        ctx.fillText(genText, padding, headerPxH + sliceHeightPx + footerPxH - 6);

        // convert to image and add to PDF
        const pageImgData = tmp.toDataURL("image/png");
        const props = (pdf as any).getImageProperties(pageImgData);
        const pageImgHeightMm = (props.height * pdfWidthMm) / props.width;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(pageImgData, "PNG", 0, 0, pdfWidthMm, pageImgHeightMm);

        // advance
        pageIndex += 1;
        offsetY += sliceHeightPx;
        remaining -= sliceHeightPx;
      }

      // salvar
      const sanitize = (s: string) => String(s || "").replace(/[^\w\-_. ]+/g, "");
      const fileName = `${sanitize(String(contrato?.numero || "contrato"))}_${sanitize(String(contrato?.titulo || "documento")).replace(/\s+/g, "_")}.pdf`;
      pdf.save(fileName);

      toast.success("PDF gerado com fidelidade ao HTML (logo incluída, cabeçalho e rodapé repetidos).");
    } catch (err) {
      console.error("Erro ao gerar PDF via html2canvas (com header/footer):", err);
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
