// components/gestao/VisualizarContratoDialog.tsx
import React from "react";
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
  // Fetch histórico
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

  const copyLink = () => {
    if (!contrato?.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const sendWhatsApp = () => {
    if (!contrato?.link_token) {
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
    if (!contrato?.link_token) {
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

  // Fetch image and convert to DataURL for jsPDF.addImage
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
   * Gera o PDF:
   * - usa "times" para aproximar fonte serifada
   * - margens maiores e lineHeight ajustável (tweak aqui)
   * - tenta incluir logo preta: prioridade: contrato.logo_url -> /vangard-preta.png (coloque no /public)
   */

  const downloadPDF = async () => {
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" }); // pt (pontos) para melhor controle
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Ajuste fino aqui:
      const margin = 36; // Aumentei margem para respeitar seu pedido
      const usableWidth = pageWidth - 2 * margin;
      const lineHeight = 8; // espaçamento entre linhas — aumente/reduza para ajustar
      let y = margin;

      const addNewPageIfNeeded = (neededHeight = lineHeight) => {
        if (y + neededHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      // Tentativa de localizar logo preta da Vangard:
      // 1) contrato.logo_url (quando preenchido)
      // 2) arquivo local público: /vangard-preta.png (coloque em /public)
      // Se não achar, não quebra o fluxo.
      const candidateLogos = [
        contrato?.logo_url,
        "/vangard-preta.png",
        "/logo-vangard-preta.png",
        // você pode adicionar aqui URLs públicas da sua CDN se preferir
      ].filter(Boolean) as string[];

      let logoDataUrl: string | null = null;
      for (const url of candidateLogos) {
        logoDataUrl = await fetchImageDataUrl(url).catch(() => null);
        if (logoDataUrl) break;
      }

      // HEADER: logo à direita, nome à esquerda
      if (logoDataUrl) {
        try {
          const logoWidth = 110; // pontos
          const logoHeight = 30; // pontos
          doc.addImage(logoDataUrl, "PNG", pageWidth - margin - logoWidth, y - 6, logoWidth, logoHeight);
        } catch (err) {
          console.warn("addImage falhou:", err);
        }
      }

      // Font: usar 'times' para aparência mais próxima de documento impresso
      doc.setFont("times", "normal");
      doc.setFontSize(16);
      doc.setTextColor(30, 30, 30);
      doc.text("Vangard Gestora", margin, y + 8);

      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("vangardgestora.com.br", margin, y + 22);
      y += 40;

      // TÍTULO centralizado com underline azul escuro
      const titleText = contrato?.titulo || "Contrato";
      doc.setFontSize(14);
      doc.setFont("times", "bold");
      doc.setTextColor(41, 98, 255);
      const titleWidth = doc.getTextWidth(titleText);
      const titleX = Math.max(margin, (pageWidth - titleWidth) / 2);
      addNewPageIfNeeded(18);
      doc.text(titleText, titleX, y);
      doc.setDrawColor(41, 98, 255);
      doc.setLineWidth(0.6);
      doc.line(titleX, y + 3, Math.min(titleX + titleWidth, pageWidth - margin), y + 3);
      y += 18;

      // Descrição breve
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const descText =
        "Contrato de prestação de serviços para prestação de serviços de associação e proteção veicular.";
      const descLines = doc.splitTextToSize(descText, usableWidth);
      addNewPageIfNeeded(descLines.length * lineHeight);
      descLines.forEach((l) => {
        doc.text(l, margin, y);
        y += lineHeight;
      });
      y += 10;

      // PARTES
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      addNewPageIfNeeded(14);
      doc.text("PARTES", margin, y);
      y += 14;

      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      addNewPageIfNeeded(60);
      doc.text(`CONTRATANTE: ${contrato?.contratante_nome || "-"}`, margin, y);
      y += lineHeight;
      doc.text(`CPF/CNPJ: ${contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}`, margin, y);
      y += lineHeight;
      doc.text(`E-mail: ${contrato?.contratante_email || "-"}`, margin, y);
      y += lineHeight;
      if (contrato?.contratante_telefone) {
        doc.text(`Telefone: ${contrato.contratante_telefone}`, margin, y);
        y += lineHeight;
      }
      y += 8;
      doc.text("CONTRATADA: Vangard Gestora", margin, y);
      y += lineHeight;
      doc.text("Rua Jacuí, 1273 - Floresta, Belo Horizonte - MG", margin, y);
      y += 18;

      /**
       * Parser mais cuidadoso para manter parágrafos e espaçamento:
       * - priorizamos tags <p>, <h1..h3>, <ul>, <ol>
       * - se o HTML vier "plano" (texto corrido), tentamos quebrar em parágrafos sempre que houver duas quebras de linha
       * - mantemos espaços e quebras internas, evitando juntar sentenças
       */
      const extractSectionsFromHtml = (html: string) => {
        const temp = document.createElement("div");
        temp.innerHTML = html || "";
        temp.querySelectorAll("script, style, header, footer, noscript").forEach((n) => n.remove());

        const sections: { type: "title" | "subtitle" | "text" | "list"; content: string }[] = [];

        const pushText = (txt: string) => {
          const clean = txt
            .replace(/\u00A0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (clean) sections.push({ type: "text", content: clean });
        };

        // If there are explicit p/h/ul elements -> use them
        const hasBlocks = temp.querySelectorAll("p, h1, h2, h3, ul, ol").length > 0;
        if (hasBlocks) {
          temp.querySelectorAll("h1,h2,h3").forEach((el) => {
            const t = (el.textContent || "").trim();
            if (t) sections.push({ type: "title", content: t });
          });
          temp.querySelectorAll("p").forEach((el) => {
            const t = (el.textContent || "").replace(/\u00A0/g, " ").trim();
            if (t) sections.push({ type: "text", content: t });
          });
          temp.querySelectorAll("ul,ol").forEach((el) => {
            const tag = el.tagName.toLowerCase();
            const items = Array.from(el.children)
              .map((li, idx) => {
                const txt = (li.textContent || "").trim();
                if (!txt) return null;
                return tag === "ol" ? `${idx + 1}. ${txt}` : `• ${txt}`;
              })
              .filter(Boolean)
              .join("\n");
            if (items) sections.push({ type: "list", content: items });
          });
        } else {
          // No blocks: fallback to splitting by double newline or CLAUSE markers
          const raw = (temp.textContent || "").replace(/\u00A0/g, " ");
          // split by two or more line breaks
          const parts = raw
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean);
          // Try to tag lines that look like "CLÁUSULA" as title
          parts.forEach((p) => {
            if (/^\s*CL[ÁA]USULA\s*\d+/i.test(p) || /^CL[ÁA]USULA/i.test(p) || /^[A-Z\s]{6,30}\s*—/.test(p)) {
              sections.push({ type: "title", content: p });
            } else if (/^\s*(?:•|\d+\.)\s*/.test(p)) {
              sections.push({
                type: "list",
                content: p
                  .split(/\n/)
                  .map((l) => l.trim())
                  .join("\n"),
              });
            } else {
              sections.push({ type: "text", content: p });
            }
          });
        }

        return sections;
      };

      // Clean HTML small issues (replace common NBSP etc)
      const htmlContent = (contrato?.conteudo_html || "").replace(/\u00A0/g, " ").trim();
      const sections = extractSectionsFromHtml(htmlContent);

      // Render sections with cuidado para parágrafos
      for (const sec of sections) {
        if (sec.type === "title") {
          doc.setFont("times", "bold");
          doc.setFontSize(12);
          doc.setTextColor(34, 80, 160);
          const lines = doc.splitTextToSize(sec.content, usableWidth);
          addNewPageIfNeeded(lines.length * lineHeight + 6);
          lines.forEach((l) => {
            doc.text(l, margin, y);
            y += lineHeight;
          });
          y += 6;
        } else if (sec.type === "list") {
          doc.setFont("times", "normal");
          doc.setFontSize(10);
          doc.setTextColor(60, 60, 60);
          const listLines = sec.content.split("\n");
          for (const li of listLines) {
            const wrapped = doc.splitTextToSize(li, usableWidth - 12);
            addNewPageIfNeeded(wrapped.length * lineHeight + 4);
            wrapped.forEach((wl) => {
              doc.text(wl, margin + 8, y);
              y += lineHeight;
            });
            y += 2;
          }
          y += 6;
        } else {
          // texto normal: respeitar parágrafos inteiros (não juntar)
          doc.setFont("times", "normal");
          doc.setFontSize(10);
          doc.setTextColor(60, 60, 60);
          const paraLines = doc.splitTextToSize(sec.content, usableWidth);
          addNewPageIfNeeded(paraLines.length * lineHeight + 4);
          paraLines.forEach((pl) => {
            doc.text(pl, margin, y);
            y += lineHeight;
          });
          // adicionar espaço extra entre parágrafos para leitura (imita espaçamento do PDF)
          y += lineHeight / 1.4;
        }
      }

      // Assinaturas (mantém o bloco ao final)
      if (assinaturas && assinaturas.length > 0) {
        addNewPageIfNeeded(36);
        doc.setDrawColor(102, 51, 153);
        doc.setLineWidth(0.6);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
        doc.setFont("times", "bold");
        doc.setFontSize(13);
        doc.setTextColor(102, 51, 153);
        doc.text("REGISTRO DE ASSINATURAS", margin, y);
        y += 12;

        if (contrato?.created_at) {
          const dataCriacao = format(new Date(contrato.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
          addNewPageIfNeeded(28);
          doc.setFont("times", "bold");
          doc.setFontSize(10);
          doc.setTextColor(50, 50, 80);
          // caixa leve de fundo (fallback caso canvas fill não suportado)
          try {
            doc.setFillColor(245, 245, 250);
            doc.rect(margin, y - 6, usableWidth, 20, "F");
          } catch (err) {
            /* ignore */
          }
          doc.setTextColor(0, 0, 0);
          doc.text(`Contrato Gerado: ${dataCriacao}`, margin + 4, y + 2);
          doc.text(`Número: ${contrato.numero || "N/A"}`, margin + 4, y + 10);
          y += 30;
        }

        for (const assinatura of assinaturas) {
          if (assinatura.status === "assinado" && assinatura.assinado_em) {
            addNewPageIfNeeded(64);
            doc.setFont("times", "bold");
            doc.setFontSize(11);
            doc.setTextColor(20, 20, 20);
            doc.text(`${assinatura.nome || "Signatário"}`, margin, y);
            doc.setFont("times", "normal");
            doc.setFontSize(9);
            const dataAss = format(new Date(assinatura.assinado_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
            doc.text(`Data/Hora: ${dataAss}`, margin, y + 12);
            doc.text(`IP: ${assinatura.ip_assinatura || "N/A"}`, margin, y + 24);
            const hash = assinatura.hash_documento ? `${assinatura.hash_documento.substring(0, 60)}...` : "N/A";
            doc.text(`Hash: ${hash}`, margin, y + 36);
            if (assinatura.latitude && assinatura.longitude) {
              doc.text(
                `Localização: ${Number(assinatura.latitude).toFixed(6)}, ${Number(assinatura.longitude).toFixed(6)}`,
                margin,
                y + 48,
              );
            } else {
              doc.text(`Localização: Não disponível`, margin, y + 48);
            }
            y += 64;
          }
        }
      }

      // Footer: número de páginas e carimbo
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - margin + 6;
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
        doc.setFont("times", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        const gen = format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
        doc.text(`Documento gerado em ${gen} | Uon1Sign | Página ${i} de ${totalPages}`, margin, footerY);
      }

      // Nome de arquivo seguro
      const sanitize = (s: any) => String(s || "").replace(/[^\w\-_. ]+/g, "");
      const fileName = `${sanitize(String(contrato?.numero || "contrato"))}_${sanitize(String(contrato?.titulo || "documento")).replace(/\s+/g, "_")}.pdf`;

      doc.save(fileName);
      toast.success("PDF baixado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF. Verifique os dados do contrato e a conexão da logo.");
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
                      <Download className="h-4 w-4 mr-2" />
                      Baixar PDF
                    </Button>
                    {(contrato?.status === "aguardando_assinatura" || contrato?.link_token) && (
                      <>
                        <Button variant="outline" size="sm" onClick={copyLink}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={sendWhatsApp}
                          className="text-green-600 hover:text-green-700"
                        >
                          <MessageCircle className="h-4 w-4 mr-2" />
                          WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={sendEmail}
                          className="text-blue-600 hover:text-blue-700"
                        >
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
                  <div
                    className="prose prose-sm max-w-none border rounded-lg p-4 bg-card max-h-[400px] overflow-y-auto"
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
