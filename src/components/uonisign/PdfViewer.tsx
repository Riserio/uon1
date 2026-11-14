import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Mostra o próprio PDF (o mesmo arquivo cujo hash foi registrado). */
export default function PdfViewer({ url, alturaMax = "70vh" }: { url: string; alturaMax?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(600);
  const [paginas, setPaginas] = useState(0);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    const atualizar = () => setLargura(Math.min((caixa.current?.clientWidth ?? 600) - 16, 900));
    atualizar();
    window.addEventListener("resize", atualizar);
    return () => window.removeEventListener("resize", atualizar);
  }, []);

  return (
    <div ref={caixa} className="rounded-xl border bg-muted/30 overflow-auto p-2" style={{ maxHeight: alturaMax }}>
      {erro ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Não foi possível exibir o PDF aqui.{" "}
          <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
            Abrir em outra aba
          </a>
        </div>
      ) : (
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setPaginas(numPages)}
          onLoadError={() => setErro(true)}
          loading={
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando documento…
            </div>
          }
        >
          {Array.from({ length: paginas }, (_, i) => (
            <div key={i} className="mb-2 flex justify-center">
              <Page pageNumber={i + 1} width={largura} renderAnnotationLayer={false} className="shadow-sm" />
            </div>
          ))}
        </Document>
      )}
    </div>
  );
}
