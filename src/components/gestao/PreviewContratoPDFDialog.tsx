import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import DOMPurify from "dompurify";
import { downloadContratoPDF } from "./utils/downloadContratoPDF";

interface PreviewContratoPDFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: any;
  logoUrl?: string;
  signatarios: Array<{ nome: string; email: string; cpf?: string; cnpj?: string; tipo: string }>;
}

export default function PreviewContratoPDFDialog({
  open,
  onOpenChange,
  contrato,
  logoUrl,
  signatarios,
}: PreviewContratoPDFDialogProps) {
  const finalLogo = logoUrl || "/images/vangard-logo.png";

  // Process numbered clauses like the PDF generator does
  const html = contrato?.conteudo_html || "";
  const processedHtml = html.replace(
    /(?<=>|\n|<br\s*\/?>|^)\s*(\d{1,2}(?:\.\d{1,2})*\.?\s)/g,
    (match: string, clause: string) => {
      const depth = (clause.match(/\./g) || []).length;
      const isMainClause = /^\d{1,2}\.\s$/.test(clause);
      if (isMainClause) {
        return `</p><p style="margin-top:14px;margin-bottom:4px;"><strong>${clause}</strong>`;
      } else if (depth <= 2) {
        return `</p><p style="margin-top:8px;margin-bottom:2px;padding-left:12px;">${clause}`;
      } else {
        return `</p><p style="margin-top:4px;margin-bottom:2px;padding-left:24px;">${clause}`;
      }
    }
  );

  const allSignatarios = [
    {
      nome: "Vangard Gestora",
      email: "contatos@vangardgestora.com.br",
      tipo: "contratado",
      cpf: "",
    },
    {
      nome: contrato?.contratante_nome || "",
      email: contrato?.contratante_email || "",
      tipo: contrato?.contratante_papel || "contratante",
      cpf: contrato?.contratante_cpf || contrato?.contratante_cnpj || "",
    },
    ...signatarios,
  ];

  const handleDownload = () => {
    downloadContratoPDF(
      {
        ...contrato,
        contrato_assinaturas: allSignatarios.map((s, i) => ({
          ...s,
          ordem: i,
          status: "pendente",
        })),
      },
      logoUrl
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>Pré-visualização do PDF</DialogTitle>
              <DialogDescription>
                Veja como o contrato será gerado em PDF, com logos, partes e cláusulas.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Baixar PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-muted/40 p-6">
          {/* Mimic A4 page */}
          <div
            className="mx-auto bg-white text-black shadow-lg"
            style={{
              width: "794px",
              maxWidth: "100%",
              padding: "32px",
              fontFamily: "Inter, Roboto, Arial, Helvetica, sans-serif",
              fontSize: "12px",
              lineHeight: 1.5,
              textAlign: "justify",
            }}
          >
            {/* Logo */}
            <div className="flex justify-end mb-4">
              <img
                src={finalLogo}
                alt="Logo"
                style={{ maxWidth: 140, maxHeight: 50, objectFit: "contain" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            {/* Title */}
            <div
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: 14,
                color: "#2962ff",
                marginBottom: 8,
              }}
            >
              {contrato?.titulo || "Contrato"}
            </div>

            {/* Partes */}
            <div style={{ marginBottom: 12 }}>
              <strong>PARTES</strong>
              <p style={{ margin: "6px 0" }}>
                <strong>CONTRATANTE:</strong> {contrato?.contratante_nome || "-"}
              </p>
              <p style={{ margin: "6px 0" }}>
                <strong>CPF/CNPJ:</strong>{" "}
                {contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}
              </p>
              <p style={{ margin: "6px 0" }}>
                <strong>E-mail:</strong> {contrato?.contratante_email || "-"}
              </p>
              {contrato?.contratante_papel && (
                <p style={{ margin: "6px 0" }}>
                  <strong>PAPEL:</strong> {contrato.contratante_papel}
                </p>
              )}
              <p style={{ margin: "6px 0" }}>
                <strong>CONTRATADA:</strong> Vangard Gestora — Rua Gonçalves Dias, 89 -
                Funcionários, Belo Horizonte - MG
              </p>
            </div>

            {/* Conteúdo */}
            <div
              className="pdf-content"
              style={{ wordBreak: "break-word" }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processedHtml) }}
            />

            {/* Signatários */}
            <div style={{ marginTop: 18 }}>
              <h4 style={{ color: "#662b91", margin: "8px 0 6px" }}>
                SIGNATÁRIOS ({allSignatarios.length})
              </h4>
              {allSignatarios.map((s, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #eee",
                    padding: 8,
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{s.nome || "Signatário"}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{s.email || ""}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    {s.tipo ? String(s.tipo).toUpperCase() : ""}
                    {(s as any).cpf || (s as any).cnpj
                      ? ` • ${(s as any).cpf || (s as any).cnpj}`
                      : ""}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: "#666" }}>
              Documento de pré-visualização | Uon1Sign
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}