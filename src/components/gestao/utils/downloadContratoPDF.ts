import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

export async function downloadContratoPDF(contrato: any) {
  if (!contrato) {
    toast.error("Contrato não encontrado.");
    return;
  }

  const toastId = toast.loading("Gerando PDF — preservando layout. Aguarde...");

  try {
    // Resolve logo as DataURL
    const logoUrl = contrato?.logo_url || "/images/vangard-logo.png";
    const logoDataUrl = await fetchImageDataUrl(logoUrl);

    // Build offscreen container with the content plus signatures
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.background = "#ffffff";
    container.style.color = "#222";
    container.style.padding = "24px";
    container.style.width = "794px";
    container.style.boxSizing = "border-box";
    container.style.fontFamily = "Inter, Roboto, Arial, Helvetica, sans-serif";
    container.style.fontSize = "12px";
    container.className = "pdf-offscreen-container";

    // Header (first page visual)
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "flex-start";
    header.style.gap = "12px";
    header.style.marginBottom = "8px";

    // Create logo img with dataUrl if available
    const logoImg = document.createElement("img");
    logoImg.alt = "Vangard Gestora";
    logoImg.style.maxWidth = "180px";
    logoImg.style.height = "auto";
    logoImg.style.objectFit = "contain";
    logoImg.style.display = "block";

    if (logoDataUrl) {
      logoImg.src = logoDataUrl;
    } else {
      logoImg.src = logoUrl;
      logoImg.crossOrigin = "anonymous";
    }

    const leftText = document.createElement("div");
    leftText.innerHTML = `<div style="font-weight:700;font-size:16px">Vangard Gestora</div><div style="color:#666;font-size:11px">vangardgestora.com.br</div>`;

    header.appendChild(leftText);
    header.appendChild(logoImg);
    container.appendChild(header);

    // Title
    const titleEl = document.createElement("div");
    titleEl.style.textAlign = "center";
    titleEl.style.fontWeight = "700";
    titleEl.style.fontSize = "14px";
    titleEl.style.color = "#2962ff";
    titleEl.style.marginBottom = "8px";
    titleEl.textContent = contrato?.titulo || "Contrato";
    container.appendChild(titleEl);

    // Meta (PARTES)
    const meta = document.createElement("div");
    meta.style.marginBottom = "8px";
    meta.innerHTML = `
      <strong>PARTES</strong>
      <p style="margin:6px 0;"><strong>CONTRATANTE:</strong> ${contrato?.contratante_nome || "-"}</p>
      <p style="margin:6px 0;"><strong>CPF/CNPJ:</strong> ${contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}</p>
      <p style="margin:6px 0;"><strong>E-mail:</strong> ${contrato?.contratante_email || "-"}</p>
      <p style="margin:6px 0;"><strong>CONTRATADA:</strong> Vangard Gestora — Rua Gonçalves Dias, 89 - Funcionários, Belo Horizonte - MG</p>
    `;
    container.appendChild(meta);

    // Content (use contrato.conteudo_html)
    const content = document.createElement("div");
    content.className = "pdf-content";
    content.style.lineHeight = "1.35";
    content.style.color = "#222";
    content.style.fontSize = "12px";
    content.innerHTML = contrato?.conteudo_html || "";
    container.appendChild(content);

    // Signatures log
    const assinaturas = contrato.contrato_assinaturas || [];
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

    // Footer note
    const gen = format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
    const footerNote = document.createElement("div");
    footerNote.style.marginTop = "12px";
    footerNote.style.fontSize = "11px";
    footerNote.style.color = "#666";
    footerNote.textContent = `Documento gerado em ${gen} | Uon1Sign`;
    container.appendChild(footerNote);

    // Append offscreen and wait for images to load
    document.body.appendChild(container);
    await new Promise((r) => setTimeout(r, 450));

    // Capture using html2canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
    });

    // Remove temp container
    document.body.removeChild(container);

    // Prepare jsPDF
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

    const logoData = logoDataUrl;

    // Slice pages
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

      // Repeated header (with logo if data available)
      try {
        if (logoData) {
          const logoWidthMm = 36;
          const logoHeightMm = 12;
          pdf.addImage(logoData, "PNG", pageMarginMm, 6, logoWidthMm, logoHeightMm);
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
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(30, 30, 30);
        pdf.text("Vangard Gestora", pageMarginMm, 12);
      }

      // Draw slice image under header
      const imgY = headerHeightMm;
      pdf.addImage(imgData, "PNG", pageMarginMm, imgY, usablePdfWidthMm, imgHeightMm);

      // Footer
      const footerY = pdfHeightMm - footerHeightMm + 4;
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.3);
      pdf.line(pageMarginMm, footerY - 4, pdfWidthMm - pageMarginMm, footerY - 4);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      const gen2 = format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
      const footerText = `Documento gerado em ${gen2} | Uon1Sign | Página ${pageIndex + 1}`;
      pdf.text(footerText, pageMarginMm, footerY);

      // Advance
      yOffsetPx += sliceHeightPx;
      remainingHeightPx -= sliceHeightPx;
      pageIndex += 1;
    }

    const sanitize = (s: string) => String(s || "").replace(/[^\w\-_. ]+/g, "");
    const fileName = `${sanitize(String(contrato?.numero || "contrato"))}_${sanitize(String(contrato?.titulo || "documento")).replace(/\s+/g, "_")}.pdf`;

    // Save PDF (trigger download)
    pdf.save(fileName);

    // Dismiss loading toast and show success
    toast.dismiss(toastId);
    toast.success("PDF gerado com sucesso!");
  } catch (err) {
    console.error("Erro ao gerar PDF via html2canvas + jsPDF:", err);
    toast.dismiss(toastId);
    toast.error("Erro ao gerar PDF. Veja console para detalhes.");
  }
}
