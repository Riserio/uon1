import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Edit, Trash2, FileText, Upload, X, Image, File } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TemplateContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TemplateContratoDialog({ open, onOpenChange }: TemplateContratoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [conteudoHtml, setConteudoHtml] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [tipoTemplate, setTipoTemplate] = useState<"html" | "word" | "pdf">("html");
  const [arquivoUrl, setArquivoUrl] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ["contrato_templates_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_templates")
        .select("*")
        .order("titulo");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const resetForm = () => {
    setTitulo("");
    setDescricao("");
    setCategoria("");
    setConteudoHtml("");
    setLogoUrl("");
    setTipoTemplate("html");
    setArquivoUrl("");
    setArquivoNome("");
    setIsCreating(false);
    setEditingTemplate(null);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB.");
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `template-logos/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documentos")
        .getPublicUrl(fileName);

      setLogoUrl(publicUrl);
      toast.success("Logo carregada com sucesso!");
    } catch (err: any) {
      console.error("Erro ao fazer upload:", err);
      toast.error("Erro ao carregar logo: " + err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Por favor, selecione um arquivo Word (.doc, .docx) ou PDF.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 10MB.");
      return;
    }

    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const fileName = `template-documents/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documentos")
        .getPublicUrl(fileName);

      setArquivoUrl(publicUrl);
      setArquivoNome(file.name);
      
      // Auto-detect type
      if (ext === "pdf") {
        setTipoTemplate("pdf");
      } else if (ext === "doc" || ext === "docx") {
        setTipoTemplate("word");
      }
      
      toast.success("Documento carregado com sucesso!");
    } catch (err: any) {
      console.error("Erro ao fazer upload:", err);
      toast.error("Erro ao carregar documento: " + err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const startEdit = (template: any) => {
    setTitulo(template.titulo);
    setDescricao(template.descricao || "");
    setCategoria(template.categoria || "");
    setConteudoHtml(template.conteudo_html);
    setLogoUrl(template.logo_url || "");
    setTipoTemplate(template.tipo_template || "html");
    setArquivoUrl(template.arquivo_url || "");
    setArquivoNome(template.arquivo_nome || "");
    setEditingTemplate(template);
    setIsCreating(true);
  };

  const salvarTemplate = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (!titulo) throw new Error("Título é obrigatório");
      
      // Para HTML, conteúdo é obrigatório; para Word/PDF, arquivo é obrigatório
      if (tipoTemplate === "html" && !conteudoHtml) {
        throw new Error("Conteúdo HTML é obrigatório");
      }
      if ((tipoTemplate === "word" || tipoTemplate === "pdf") && !arquivoUrl) {
        throw new Error("Arquivo é obrigatório para templates Word/PDF");
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from("contrato_templates")
          .update({
            titulo,
            descricao,
            categoria,
            conteudo_html: conteudoHtml || "",
            logo_url: logoUrl || null,
            tipo_template: tipoTemplate,
            arquivo_url: arquivoUrl || null,
            arquivo_nome: arquivoNome || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contrato_templates").insert({
          titulo,
          descricao,
          categoria,
          conteudo_html: conteudoHtml || "",
          logo_url: logoUrl || null,
          tipo_template: tipoTemplate,
          arquivo_url: arquivoUrl || null,
          arquivo_nome: arquivoNome || null,
          created_by: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contrato_templates"] });
      queryClient.invalidateQueries({ queryKey: ["contrato_templates_all"] });
      toast.success(editingTemplate ? "Template atualizado!" : "Template criado!");
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  const excluirTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contrato_templates")
        .update({ ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contrato_templates"] });
      queryClient.invalidateQueries({ queryKey: ["contrato_templates_all"] });
      toast.success("Template excluído!");
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  const defaultTemplate = `<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>

<p>Pelo presente instrumento particular, de um lado:</p>

<p><strong>CONTRATANTE:</strong> {{nome}}, inscrito(a) no CPF sob o nº {{cpf}}, residente e domiciliado(a) no endereço _________________, e-mail {{email}}, telefone {{telefone}}.</p>

<p>E de outro lado:</p>

<p><strong>CONTRATADA:</strong> [NOME DA EMPRESA], pessoa jurídica de direito privado, inscrita no CNPJ sob o nº _________________, com sede na _________________, neste ato representada por seu(ua) representante legal.</p>

<h2>CLÁUSULA PRIMEIRA - DO OBJETO</h2>
<p>O presente contrato tem por objeto a prestação de serviços de _________________.</p>

<h2>CLÁUSULA SEGUNDA - DO VALOR</h2>
<p>Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA o valor de {{valor}}.</p>

<h2>CLÁUSULA TERCEIRA - DA VIGÊNCIA</h2>
<p>O presente contrato terá vigência de {{data_inicio}} a {{data_fim}}.</p>

<h2>CLÁUSULA QUARTA - DAS DISPOSIÇÕES GERAIS</h2>
<p>As partes elegem o foro da Comarca de _________________ para dirimir quaisquer dúvidas oriundas do presente contrato.</p>

<p>E por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.</p>

<p>_________________, {{data_atual}}.</p>

<p>_____________________________<br/>CONTRATANTE</p>

<p>_____________________________<br/>CONTRATADA</p>`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Templates de Contrato</DialogTitle>
            <DialogDescription>
              Gerencie modelos de contrato reutilizáveis
            </DialogDescription>
          </DialogHeader>

          {isCreating ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ex: Contrato de Adesão"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    placeholder="Ex: Adesão, Serviços, etc."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Breve descrição do template"
                />
              </div>

              {/* Tipo de Template */}
              <div className="space-y-2">
                <Label>Tipo de Template *</Label>
                <Select value={tipoTemplate} onValueChange={(v: "html" | "word" | "pdf") => setTipoTemplate(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="html">HTML (com variáveis)</SelectItem>
                    <SelectItem value="word">Word (.doc, .docx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
                {tipoTemplate !== "html" && (
                  <p className="text-xs text-amber-600">
                    Documentos Word/PDF não terão substituição de variáveis - o documento será enviado como está.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Logo do PDF (canto superior esquerdo)</Label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="relative">
                      <img 
                        src={logoUrl} 
                        alt="Logo" 
                        className="h-16 w-auto object-contain border rounded p-1"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => setLogoUrl("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        {uploadingLogo ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Carregar Logo
                      </Button>
                      <span className="text-xs text-muted-foreground">Max: 2MB</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload de documento Word/PDF */}
              {tipoTemplate !== "html" && (
                <div className="space-y-2">
                  <Label>Documento {tipoTemplate === "word" ? "Word" : "PDF"} *</Label>
                  <div className="flex items-center gap-4">
                    {arquivoUrl ? (
                      <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                        <File className="h-5 w-5 text-primary" />
                        <span className="text-sm">{arquivoNome}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setArquivoUrl("");
                            setArquivoNome("");
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          ref={documentInputRef}
                          type="file"
                          accept={tipoTemplate === "pdf" ? ".pdf" : ".doc,.docx"}
                          className="hidden"
                          onChange={handleDocumentUpload}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => documentInputRef.current?.click()}
                          disabled={uploadingFile}
                        >
                          {uploadingFile ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Carregar {tipoTemplate === "word" ? "Word" : "PDF"}
                        </Button>
                        <span className="text-xs text-muted-foreground">Max: 10MB</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Conteúdo HTML (apenas para tipo HTML) */}
              {tipoTemplate === "html" && (
                <div className="space-y-2">
                  <Label>Conteúdo (HTML) *</Label>
                  <p className="text-xs text-muted-foreground">
                    Variáveis disponíveis: {"{{nome}}"}, {"{{cpf}}"}, {"{{email}}"}, {"{{telefone}}"}, {"{{valor}}"}, {"{{data_inicio}}"}, {"{{data_fim}}"}, {"{{data_atual}}"}
                  </p>
                  <Textarea
                    value={conteudoHtml}
                    onChange={(e) => setConteudoHtml(e.target.value)}
                    placeholder="Digite o HTML do template..."
                    rows={15}
                    className="font-mono text-sm"
                  />
                </div>
              )}
              <div className="flex justify-between">
                {tipoTemplate === "html" && (
                  <Button
                    variant="outline"
                    onClick={() => setConteudoHtml(defaultTemplate)}
                  >
                    Usar Modelo Padrão
                  </Button>
                )}
                {tipoTemplate !== "html" && <div />}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetForm}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => salvarTemplate.mutate()}
                    disabled={salvarTemplate.isPending}
                  >
                    {salvarTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingTemplate ? "Atualizar" : "Salvar"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Template
              </Button>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : templates?.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum template encontrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates?.filter(t => t.ativo).map((template) => (
                    <Card key={template.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{template.titulo}</h4>
                            {template.categoria && (
                              <Badge variant="secondary">{template.categoria}</Badge>
                            )}
                            <Badge variant={template.tipo_template === "html" ? "outline" : "default"}>
                              {template.tipo_template === "html" ? "HTML" : template.tipo_template === "word" ? "Word" : "PDF"}
                            </Badge>
                          </div>
                          {template.descricao && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {template.descricao}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit(template)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(template.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && excluirTemplate.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
