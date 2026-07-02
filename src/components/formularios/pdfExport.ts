import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatarValor(v: any): string {
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "—";
    }
  }
  return String(v);
}

async function carregarLogoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("FileReader error"));
      r.readAsDataURL(blob);
    });
    // valida decodificação da imagem sem travar
    const ok = await new Promise<boolean>((resolve) => {
      const img = new Image();
      const t = setTimeout(() => resolve(false), 2500);
      img.onload = () => {
        clearTimeout(t);
        resolve(true);
      };
      img.onerror = () => {
        clearTimeout(t);
        resolve(false);
      };
      img.src = dataUrl;
    });
    return ok ? dataUrl : null;
  } catch {
    return null;
  }
}

export async function baixarRespostasPDF(
  form: any,
  valores: Record<string, any>,
  perguntas: any[],
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logo = await carregarLogoDataUrl("/images/vangard-logo.png");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 40, 36, 80, 28);
    } catch {
      /* ignora */
    }
  }

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 30);
  doc.text(String(form?.titulo || "Respostas"), 40, 100);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(130);
  doc.text(`Enviado em ${new Date().toLocaleString("pt-BR")}`, 40, 118);

  const perguntasOrdenadas = [...(perguntas || [])].sort(
    (a: any, b: any) => (a?.ordem ?? 0) - (b?.ordem ?? 0),
  );

  const rows = perguntasOrdenadas
    .filter((p: any) => p && p.tipo !== "secao")
    .map((p: any, i: number) => [
      `${i + 1}. ${p.enunciado || ""}`,
      formatarValor(valores?.[p.id]),
    ]);

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text("Nenhuma resposta registrada.", 40, 160);
  } else {
    autoTable(doc, {
      startY: 140,
      head: [["Pergunta", "Resposta"]],
      body: rows,
      theme: "plain",
      styles: {
        fontSize: 10,
        cellPadding: 10,
        valign: "top",
        textColor: [40, 40, 50],
        lineColor: [230, 230, 235],
        lineWidth: 0.5,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [248, 248, 250],
        textColor: [90, 90, 110],
        fontStyle: "bold",
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: pageWidth * 0.45, fontStyle: "bold", textColor: [20, 20, 30] },
        1: { cellWidth: pageWidth * 0.45 },
      },
      margin: { left: 40, right: 40 },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(
      `Processado pela plataforma Uon1 · ${i}/${pages}`,
      pageWidth / 2,
      pageHeight - 24,
      { align: "center" },
    );
  }

  const safe = String(form?.titulo || "respostas")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  doc.save(`${safe || "respostas"}-${Date.now()}.pdf`);
}