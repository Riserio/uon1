// Gera o PDF do contrato (texto real, selecionável) a partir do HTML renderizado
// do modelo. Subconjunto suportado: h1, h2, h3, p (class="centro"), strong/b,
// em/i, br, ul/ol/li. Gerado UMA vez na conferência; o servidor calcula o hash
// desses bytes e é exatamente esse arquivo que os signatários assinam (RN09).
import jsPDF from "jspdf";
import { qrModulos } from "@/lib/trust";

interface Trecho {
  texto: string;
  negrito: boolean;
  italico: boolean;
}
interface Bloco {
  tipo: "h1" | "h2" | "h3" | "p" | "li";
  trechos: Trecho[];
  centro?: boolean;
  marcador?: string;
}

function lerBlocos(html: string): Bloco[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const raiz = doc.body.firstElementChild as HTMLElement;
  const blocos: Bloco[] = [];

  const trechosDe = (no: Node, negrito = false, italico = false, out: Trecho[] = []): Trecho[] => {
    no.childNodes.forEach((filho) => {
      if (filho.nodeType === Node.TEXT_NODE) {
        const t = (filho.textContent ?? "").replace(/\s+/g, " ");
        if (t) out.push({ texto: t, negrito, italico });
      } else if (filho.nodeType === Node.ELEMENT_NODE) {
        const el = filho as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "br") out.push({ texto: "\n", negrito, italico });
        else trechosDe(el, negrito || tag === "strong" || tag === "b", italico || tag === "em" || tag === "i", out);
      }
    });
    return out;
  };

  const visitar = (el: Element) => {
    Array.from(el.children).forEach((filho) => {
      const tag = filho.tagName.toLowerCase();
      if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "p") {
        blocos.push({ tipo: tag, trechos: trechosDe(filho), centro: filho.classList.contains("centro") || tag === "h1" });
      } else if (tag === "ul" || tag === "ol") {
        Array.from(filho.children).forEach((li, i) => {
          blocos.push({ tipo: "li", trechos: trechosDe(li), marcador: tag === "ol" ? `${i + 1}.` : "•" });
        });
      } else {
        visitar(filho);
      }
    });
  };
  visitar(raiz);
  return blocos.filter((b) => b.trechos.some((t) => t.texto.trim()));
}

const ESTILO: Record<Bloco["tipo"], { tam: number; antes: number; depois: number }> = {
  h1: { tam: 12.5, antes: 0, depois: 3 },
  h2: { tam: 10.5, antes: 3.5, depois: 1.2 },
  h3: { tam: 10, antes: 2.5, depois: 1 },
  p: { tam: 10, antes: 0, depois: 2.2 },
  li: { tam: 10, antes: 0, depois: 1.2 },
};

export interface OpcoesPdf {
  numero: string;
  titulo: string;
  /** Uon1 Trust: código de verificação e endereço de validação (QR no rodapé) */
  codigoVerificacao?: string | null;
  urlValidacao?: string | null;
  /** Papel timbrado: logo do emissor + linhas à direita (razão social, CNPJ, endereço) */
  timbre?: { logo?: ImagemPdf | null; linhas?: string[] } | null;
}

export interface ImagemPdf {
  dataUrl: string;
  largura: number;
  altura: number;
}

/** Carrega uma imagem (PNG, JPG, WebP, AVIF...) e devolve um PNG para o jsPDF. */
export async function carregarImagem(url?: string | null): Promise<ImagemPdf | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext("2d")?.drawImage(bmp, 0, 0);
    return { dataUrl: canvas.toDataURL("image/png"), largura: bmp.width, altura: bmp.height };
  } catch {
    return null;
  }
}

export function gerarPdfContrato(html: string, opts: OpcoesPdf): Uint8Array {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: `${opts.numero} — ${opts.titulo}`, subject: "Contrato", creator: "uoniSign" });
  const L = pdf.internal.pageSize.getWidth();
  const A = pdf.internal.pageSize.getHeight();
  const margemX = 22;
  const temTimbre = Boolean(opts.timbre?.logo || opts.timbre?.linhas?.length);
  const topo = temTimbre ? 34 : 22;
  const comQr = Boolean(opts.codigoVerificacao && opts.urlValidacao);
  const base = A - (comQr ? 26 : 20);
  const largura = L - margemX * 2;
  const PT = 0.3528; // mm por ponto
  let y = topo;

  // getTextWidth aplica kerning, mas pdf.text() não: mede sem kerning para as
  // palavras não se sobreporem.
  const medir = (texto: string, tam: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf.getStringUnitWidth(texto, { kerning: {} } as any) * tam) / pdf.internal.scaleFactor;

  const fonte = (t: Trecho | { negrito: boolean; italico: boolean }, tam: number) => {
    const estilo = t.negrito && t.italico ? "bolditalic" : t.negrito ? "bold" : t.italico ? "italic" : "normal";
    pdf.setFont("helvetica", estilo);
    pdf.setFontSize(tam);
  };

  for (const b of lerBlocos(html)) {
    const est = ESTILO[b.tipo];
    const negritoBloco = b.tipo !== "p" && b.tipo !== "li";
    const tam = est.tam;
    const alturaLinha = tam * PT * 1.42;
    const recuo = b.tipo === "li" ? 6 : 0;
    const larguraUtil = largura - recuo;
    y += est.antes;

    // Palavras com estilo
    // colado = sem espaço antes (ex.: "</strong>, e" → a vírgula cola na palavra anterior)
    const palavras: { texto: string; t: Trecho; quebra?: boolean; colado?: boolean; fimComEspaco?: boolean }[] = [];
    b.trechos.forEach((tr) => {
      const t = { ...tr, negrito: tr.negrito || negritoBloco };
      if (tr.texto === "\n") {
        palavras.push({ texto: "", t, quebra: true });
        return;
      }
      tr.texto.split(" ").forEach((w, i) => {
        const anterior = palavras[palavras.length - 1];
        if (w) palavras.push({ texto: w, t, colado: i === 0 && !!anterior && !anterior.quebra && !anterior.fimComEspaco });
      });
      const ultima = palavras[palavras.length - 1];
      if (ultima) ultima.fimComEspaco = tr.texto.endsWith(" ");
    });

    const larg = (p: { texto: string; t: Trecho }) => {
      fonte(p.t, tam);
      return medir(p.texto, tam);
    };
    fonte({ negrito: false, italico: false }, tam);
    const espaco = medir(" ", tam);

    // Monta as linhas
    const linhas: { palavras: typeof palavras; fim: boolean }[] = [];
    let atual: typeof palavras = [];
    let w = 0;
    for (const p of palavras) {
      if (p.quebra) {
        linhas.push({ palavras: atual, fim: true });
        atual = [];
        w = 0;
        continue;
      }
      const lp = larg(p);
      const novo = atual.length ? w + (p.colado ? 0 : espaco) + lp : lp;
      if (novo > larguraUtil && atual.length && !p.colado) {
        linhas.push({ palavras: atual, fim: false });
        atual = [p];
        w = lp;
      } else {
        atual.push(p);
        w = novo;
      }
    }
    if (atual.length) linhas.push({ palavras: atual, fim: true });

    linhas.forEach((linha, idx) => {
      if (y + alturaLinha > base) {
        pdf.addPage();
        y = topo;
      }
      const larguras = linha.palavras.map(larg);
      const soma = larguras.reduce((s, v) => s + v, 0);
      const lacunas = linha.palavras.filter((p, i) => i > 0 && !p.colado).length;
      const justificar = b.tipo === "p" && !b.centro && !linha.fim && lacunas > 0;
      const gap = justificar ? (larguraUtil - soma) / lacunas : espaco;
      const total = soma + gap * lacunas;
      let x = margemX + recuo + (b.centro ? (larguraUtil - total) / 2 : 0);
      if (b.tipo === "li" && idx === 0) {
        fonte({ negrito: false, italico: false }, tam);
        pdf.text(b.marcador ?? "•", margemX + 1.5, y + tam * PT);
      }
      linha.palavras.forEach((p, i) => {
        if (i > 0 && !p.colado) x += gap;
        fonte(p.t, tam);
        pdf.text(p.texto, x, y + tam * PT);
        x += larguras[i];
      });
      y += alturaLinha;
    });
    y += est.depois;
  }

  // Rodapé: número do contrato, código de verificação (Uon1 Trust), QR e paginação
  const total = pdf.getNumberOfPages();
  const qr = comQr ? qrModulos(opts.urlValidacao!) : null;
  const ladoQr = 15;
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    if (temTimbre) {
      const logo = opts.timbre?.logo;
      if (logo) {
        const proporcao = logo.largura / logo.altura;
        let alt = 13;
        let larg = alt * proporcao;
        if (larg > 60) {
          larg = 60;
          alt = larg / proporcao;
        }
        pdf.addImage(logo.dataUrl, "PNG", margemX, 9, larg, alt, undefined, "FAST");
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(110);
      (opts.timbre?.linhas ?? []).filter(Boolean).slice(0, 3).forEach((l, k) => {
        pdf.text(l, L - margemX, 13 + k * 3.6, { align: "right", maxWidth: 95 });
      });
      pdf.setDrawColor(240, 90, 40); // laranja Vangard
      pdf.setLineWidth(0.6);
      pdf.line(margemX, 26, L - margemX, 26);
      pdf.setDrawColor(0);
      pdf.setTextColor(0);
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(120);
    if (qr && qr.tamanho) {
      const x0 = L - margemX - ladoQr;
      const y0 = A - 8 - ladoQr;
      const m = ladoQr / qr.tamanho;
      pdf.setFillColor(0, 0, 0);
      qr.quadrados.forEach(([x, y, w]) => pdf.rect(x0 + x * m, y0 + y * m, w * m + 0.01, m + 0.01, "F"));
      pdf.text(`Contrato nº ${opts.numero}`, margemX, A - 15);
      pdf.text(`Código de verificação Uon1 Trust: ${opts.codigoVerificacao}`, margemX, A - 11.5);
      pdf.text(`Confira a autenticidade em ${opts.urlValidacao}`, margemX, A - 8);
      pdf.text(`Página ${i} de ${total}`, x0 - 3, A - 8, { align: "right" });
    } else {
      pdf.text(`Contrato nº ${opts.numero}`, margemX, A - 10);
      pdf.text(`Página ${i} de ${total}`, L - margemX, A - 10, { align: "right" });
    }
    pdf.setTextColor(0);
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

export function bytesParaBase64(bytes: Uint8Array): string {
  let s = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}
