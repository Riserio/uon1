import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Rnd } from "react-rnd";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload, Loader2, Trash2, PenLine, Type, Calendar, FileSignature,
  ChevronLeft, ChevronRight, Save, FileText,
} from "lucide-react";

// pdf.js worker via CDN (matches installed version)
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type CampoTipo = "assinatura" | "rubrica" | "data" | "texto";

export interface CampoAssinatura {
  id: string;
  signatario_email: string;        // identifica para qual signatário é o campo
  signatario_nome: string;
  page: number;                    // 1-based
  x: number;                       // 0..1 do width
  y: number;                       // 0..1 do height
  width: number;                   // 0..1
  height: number;                  // 0..1
  tipo: CampoTipo;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string;
  signatarios: Array<{ nome: string; email: string }>;
  pdfUrl?: string | null;
  pdfPath?: string | null;
  pdfNome?: string | null;
  campos: CampoAssinatura[];
  onSaved?: () => void;
}

const TIPO_META: Record<CampoTipo, { label: string; icon: any; color: string }> = {
  assinatura: { label: "Assinatura", icon: PenLine, color: "bg-primary/15 border-primary text-primary" },
  rubrica:    { label: "Rubrica",    icon: FileSignature, color: "bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300" },
  data:       { label: "Data",       icon: Calendar, color: "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300" },
  texto:      { label: "Texto",      icon: Type,     color: "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300" },
};

export default function PdfCamposAssinaturaDialog({
  open, onOpenChange, contratoId, signatarios, pdfUrl, pdfPath, pdfNome, campos, onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(pdfUrl || null);
  const [localPath, setLocalPath] = useState<string | null>(pdfPath || null);
  const [localNome, setLocalNome] = useState<string | null>(pdfNome || null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 800, height: 1000 });
  const [campoSelecionado, setCampoSelecionado] = useState<string | null>(null);
  const [localCampos, setLocalCampos] = useState<CampoAssinatura[]>(campos || []);
  const [signatarioAtivo, setSignatarioAtivo] = useState<string>(signatarios[0]?.email || "");
  const [tipoAtivo, setTipoAtivo] = useState<CampoTipo>("assinatura");
  const pageWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalUrl(pdfUrl || null);
    setLocalPath(pdfPath || null);
    setLocalNome(pdfNome || null);
    setLocalCampos(campos || []);
    if (signatarios[0]?.email) setSignatarioAtivo(signatarios[0].email);
  }, [pdfUrl, pdfPath, pdfNome, campos, signatarios, open]);

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Envie um arquivo PDF.");
      return;
    }
    setUploading(true);
    try {
      const path = `${contratoId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("contratos-pdfs").upload(path, file, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("contratos-pdfs").createSignedUrl(path, 60 * 60 * 24 * 7);
      const url = signed?.signedUrl || null;
      setLocalUrl(url);
      setLocalPath(path);
      setLocalNome(file.name);
      setLocalCampos([]); // reset positions on new file
      toast.success("PDF enviado!");
    } catch (e: any) {
      toast.error("Falha no upload: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const addCampoAtCenter = useCallback(() => {
    if (!signatarioAtivo) {
      toast.error("Selecione um signatário primeiro.");
      return;
    }
    const sig = signatarios.find((s) => s.email === signatarioAtivo);
    if (!sig) return;
    const newCampo: CampoAssinatura = {
      id: crypto.randomUUID(),
      signatario_email: sig.email,
      signatario_nome: sig.nome,
      page,
      x: 0.4,
      y: 0.45,
      width: tipoAtivo === "rubrica" ? 0.1 : 0.2,
      height: tipoAtivo === "rubrica" ? 0.04 : 0.06,
      tipo: tipoAtivo,
    };
    setLocalCampos((prev) => [...prev, newCampo]);
    setCampoSelecionado(newCampo.id);
  }, [signatarioAtivo, signatarios, page, tipoAtivo]);

  const updateCampo = (id: string, patch: Partial<CampoAssinatura>) => {
    setLocalCampos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeCampo = (id: string) => {
    setLocalCampos((prev) => prev.filter((c) => c.id !== id));
    if (campoSelecionado === id) setCampoSelecionado(null);
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contratos")
        .update({
          arquivo_pdf_url: localUrl,
          arquivo_pdf_path: localPath,
          arquivo_pdf_nome: localNome,
          campos_assinatura: localCampos as any,
        })
        .eq("id", contratoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campos salvos!");
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const camposDaPagina = localCampos.filter((c) => c.page === page);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> PDF do contrato e campos de assinatura
          </DialogTitle>
          <DialogDescription>
            Envie um PDF próprio e posicione os campos de assinatura, rubrica, data e texto sobre o documento — estilo Clicksign.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-[1fr_320px]">
          {/* PDF area */}
          <div className="overflow-auto bg-muted/30 p-6">
            {!localUrl ? (
              <div className="h-full flex items-center justify-center">
                <label className="cursor-pointer border-2 border-dashed rounded-xl p-12 text-center hover:bg-muted/40 transition-colors">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  {uploading ? (
                    <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  )}
                  <p className="font-medium mb-1">{uploading ? "Enviando..." : "Envie o PDF do contrato"}</p>
                  <p className="text-xs text-muted-foreground">
                    Arraste e solte ou clique para selecionar. Até 20 MB.
                  </p>
                </label>
              </div>
            ) : (
              <div ref={pageWrapperRef} className="relative inline-block shadow-lg mx-auto">
                <Document
                  file={localUrl}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  loading={<div className="p-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>}
                  error={<div className="p-12 text-destructive">Não foi possível carregar o PDF.</div>}
                >
                  <Page
                    pageNumber={page}
                    width={800}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    onRenderSuccess={(p: any) => {
                      setPageSize({ width: p.width, height: p.height });
                    }}
                  />
                </Document>

                {/* Overlay campos */}
                <div
                  className="absolute inset-0"
                  style={{ width: pageSize.width, height: pageSize.height }}
                >
                  {camposDaPagina.map((c) => {
                    const meta = TIPO_META[c.tipo];
                    const Icon = meta.icon;
                    const selected = campoSelecionado === c.id;
                    return (
                      <Rnd
                        key={c.id}
                        bounds="parent"
                        size={{ width: c.width * pageSize.width, height: c.height * pageSize.height }}
                        position={{ x: c.x * pageSize.width, y: c.y * pageSize.height }}
                        onClick={(e: any) => { e.stopPropagation?.(); setCampoSelecionado(c.id); }}
                        onDragStop={(_e, d) => updateCampo(c.id, {
                          x: d.x / pageSize.width,
                          y: d.y / pageSize.height,
                        })}
                        onResizeStop={(_e, _dir, ref, _delta, pos) => updateCampo(c.id, {
                          width: ref.offsetWidth / pageSize.width,
                          height: ref.offsetHeight / pageSize.height,
                          x: pos.x / pageSize.width,
                          y: pos.y / pageSize.height,
                        })}
                        className={`border-2 ${meta.color} rounded ${selected ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                      >
                        <div className="w-full h-full flex items-center justify-between gap-1 px-1.5 text-[10px] font-medium select-none">
                          <span className="flex items-center gap-1 truncate">
                            <Icon className="h-3 w-3 shrink-0" />
                            <span className="truncate">{c.signatario_nome || c.signatario_email}</span>
                          </span>
                          {selected && (
                            <button
                              type="button"
                              onMouseDown={(e) => { e.stopPropagation(); removeCampo(c.id); }}
                              className="hover:text-destructive shrink-0"
                              title="Remover"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </Rnd>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Page navigator */}
            {localUrl && numPages > 1 && (
              <div className="sticky bottom-2 mt-3 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Badge variant="outline" className="bg-background">
                  Página {page} de {numPages}
                </Badge>
                <Button variant="outline" size="sm" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="border-l bg-card overflow-y-auto p-4 space-y-5">
            {localUrl && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">PDF carregado</div>
                <div className="text-sm truncate">{localNome || "documento.pdf"}</div>
                <label className="cursor-pointer text-xs text-primary hover:underline inline-flex items-center gap-1">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <Upload className="h-3 w-3" /> Trocar PDF
                </label>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adicionar campo para</div>
              <Select value={signatarioAtivo} onValueChange={setSignatarioAtivo}>
                <SelectTrigger><SelectValue placeholder="Signatário" /></SelectTrigger>
                <SelectContent>
                  {signatarios.map((s) => (
                    <SelectItem key={s.email} value={s.email}>
                      {s.nome || s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TIPO_META) as CampoTipo[]).map((t) => {
                  const meta = TIPO_META[t];
                  const Icon = meta.icon;
                  const ativo = tipoAtivo === t;
                  return (
                    <Button
                      key={t}
                      type="button"
                      variant={ativo ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTipoAtivo(t)}
                      className="justify-start h-9"
                    >
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      {meta.label}
                    </Button>
                  );
                })}
              </div>

              <Button onClick={addCampoAtCenter} disabled={!localUrl} className="w-full" size="sm">
                + Inserir na página {page}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Campos posicionados ({localCampos.length})
              </div>
              {localCampos.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhum campo ainda. Selecione um tipo e clique em "Inserir".</p>
              ) : (
                <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                  {localCampos.map((c) => {
                    const meta = TIPO_META[c.tipo];
                    const Icon = meta.icon;
                    const ativo = campoSelecionado === c.id;
                    return (
                      <li
                        key={c.id}
                        onClick={() => { setPage(c.page); setCampoSelecionado(c.id); }}
                        className={`text-xs border rounded-md p-2 cursor-pointer hover:bg-muted/40 ${ativo ? "border-primary bg-primary/5" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 truncate">
                            <Icon className="h-3 w-3" />
                            <span className="font-medium">{meta.label}</span>
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); removeCampo(c.id); }}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                        <div className="text-muted-foreground truncate mt-0.5">
                          {c.signatario_nome || c.signatario_email} · pág. {c.page}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar campos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}