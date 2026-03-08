import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link as LinkIcon, Upload, Download, Trash2, ExternalLink, Pencil, Search, File, Image, FileSpreadsheet, FileArchive, FolderOpen, Globe } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Documento {
  id: string;
  titulo: string;
  descricao: string | null;
  arquivo_url: string;
  arquivo_nome: string;
  arquivo_tamanho: number | null;
  tipo_arquivo: string | null;
  created_at: string;
}

interface LinkUtil {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
  categoria: string | null;
  created_at: string;
}

const getFileIcon = (tipo: string | null) => {
  if (!tipo) return File;
  if (tipo.startsWith("image/")) return Image;
  if (tipo.includes("spreadsheet") || tipo.includes("excel") || tipo.includes("csv")) return FileSpreadsheet;
  if (tipo.includes("zip") || tipo.includes("rar") || tipo.includes("7z")) return FileArchive;
  if (tipo.includes("pdf")) return FileText;
  return File;
};

const getFileColor = (tipo: string | null) => {
  if (!tipo) return "text-muted-foreground";
  if (tipo.startsWith("image/")) return "text-purple-500";
  if (tipo.includes("pdf")) return "text-red-500";
  if (tipo.includes("spreadsheet") || tipo.includes("excel")) return "text-emerald-500";
  if (tipo.includes("zip")) return "text-amber-500";
  return "text-primary";
};

export default function Documentos() {
  const { user, userRole } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [links, setLinks] = useState<LinkUtil[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchDocTerm, setSearchDocTerm] = useState("");
  const [searchLinkTerm, setSearchLinkTerm] = useState("");
  
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Documento | null>(null);
  const [docTitulo, setDocTitulo] = useState("");
  const [docDescricao, setDocDescricao] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkUtil | null>(null);
  const [linkTitulo, setLinkTitulo] = useState("");
  const [linkDescricao, setLinkDescricao] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkCategoria, setLinkCategoria] = useState("");

  const filteredDocumentos = useMemo(() => {
    if (!searchDocTerm) return documentos;
    const term = searchDocTerm.toLowerCase();
    return documentos.filter(d => 
      d.titulo.toLowerCase().includes(term) ||
      d.descricao?.toLowerCase().includes(term) ||
      d.arquivo_nome.toLowerCase().includes(term)
    );
  }, [documentos, searchDocTerm]);

  const filteredLinks = useMemo(() => {
    if (!searchLinkTerm) return links;
    const term = searchLinkTerm.toLowerCase();
    return links.filter(l => 
      l.titulo.toLowerCase().includes(term) ||
      l.descricao?.toLowerCase().includes(term) ||
      l.url.toLowerCase().includes(term) ||
      l.categoria?.toLowerCase().includes(term)
    );
  }, [links, searchLinkTerm]);

  const linkCategorias = useMemo(() => {
    const cats = new Set<string>();
    links.forEach(l => { if (l.categoria) cats.add(l.categoria); });
    return Array.from(cats);
  }, [links]);

  useEffect(() => {
    fetchDocumentos();
    fetchLinks();
  }, []);

  const fetchDocumentos = async () => {
    const { data, error } = await supabase.from("documentos").select("*").order("created_at", { ascending: false });
    if (!error) setDocumentos(data || []);
    setLoading(false);
  };

  const fetchLinks = async () => {
    const { data, error } = await supabase.from("links_uteis").select("*").order("created_at", { ascending: false });
    if (!error) setLinks(data || []);
  };

  const handleUploadDocumento = async () => {
    if (!docTitulo) { toast.error("Preencha o título"); return; }
    if (!editingDoc && !docFile) { toast.error("Selecione um arquivo"); return; }
    if (!user) { toast.error("Você precisa estar autenticado"); return; }
    setUploading(true);
    try {
      if (editingDoc) {
        const updateData: any = { titulo: docTitulo, descricao: docDescricao || null };
        if (docFile) {
          const fileExt = docFile.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from("documentos").upload(fileName, docFile);
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(fileName);
          updateData.arquivo_url = urlData.publicUrl;
          updateData.arquivo_nome = docFile.name;
          updateData.arquivo_tamanho = docFile.size;
          updateData.tipo_arquivo = docFile.type;
          const oldFilePath = editingDoc.arquivo_url.split('/').pop();
          if (oldFilePath) await supabase.storage.from("documentos").remove([oldFilePath]);
        }
        const { error } = await supabase.from("documentos").update(updateData).eq("id", editingDoc.id);
        if (error) throw error;
        toast.success("Documento atualizado!");
      } else {
        const fileExt = docFile!.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("documentos").upload(fileName, docFile!);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(fileName);
        const { error } = await supabase.from("documentos").insert({
          titulo: docTitulo, descricao: docDescricao || null,
          arquivo_url: urlData.publicUrl, arquivo_nome: docFile!.name,
          arquivo_tamanho: docFile!.size, tipo_arquivo: docFile!.type,
          criado_por: user.id,
        });
        if (error) throw error;
        toast.success("Documento enviado!");
      }
      resetDocForm();
      fetchDocumentos();
    } catch (error) {
      console.error(error);
      toast.error(editingDoc ? "Erro ao atualizar" : "Erro ao enviar");
    } finally { setUploading(false); }
  };

  const resetDocForm = () => {
    setDocDialogOpen(false);
    setEditingDoc(null);
    setDocTitulo("");
    setDocDescricao("");
    setDocFile(null);
  };

  const handleEditDocumento = (doc: Documento) => {
    setEditingDoc(doc);
    setDocTitulo(doc.titulo);
    setDocDescricao(doc.descricao || "");
    setDocFile(null);
    setDocDialogOpen(true);
  };

  const handleAddOrUpdateLink = async () => {
    if (!linkTitulo || !linkUrl) { toast.error("Preencha os campos obrigatórios"); return; }
    if (!user) return;
    try {
      const linkData = { titulo: linkTitulo, descricao: linkDescricao || null, url: linkUrl, categoria: linkCategoria || null, criado_por: user.id };
      if (editingLink) {
        const { error } = await supabase.from("links_uteis").update(linkData).eq("id", editingLink.id);
        if (error) throw error;
        toast.success("Link atualizado!");
      } else {
        const { error } = await supabase.from("links_uteis").insert(linkData);
        if (error) throw error;
        toast.success("Link adicionado!");
      }
      resetLinkForm();
      fetchLinks();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar link");
    }
  };

  const resetLinkForm = () => {
    setLinkDialogOpen(false);
    setEditingLink(null);
    setLinkTitulo("");
    setLinkDescricao("");
    setLinkUrl("");
    setLinkCategoria("");
  };

  const handleEditLink = (link: LinkUtil) => {
    setEditingLink(link);
    setLinkTitulo(link.titulo);
    setLinkDescricao(link.descricao || "");
    setLinkUrl(link.url);
    setLinkCategoria(link.categoria || "");
    setLinkDialogOpen(true);
  };

  const handleDownloadDocumento = async (arquivo_url: string, arquivo_nome: string) => {
    try {
      const filePath = arquivo_url.split('/').pop()!;
      const { data, error } = await supabase.storage.from("documentos").download(filePath);
      if (error) throw error;
      const blob = new Blob([data], { type: data.type });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = arquivo_nome;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Download iniciado");
    } catch { toast.error("Erro ao fazer download"); }
  };

  const handleDeleteDocumento = async (id: string, arquivo_url: string) => {
    if (!confirm("Excluir este documento?")) return;
    try {
      const filePath = arquivo_url.split('/').pop();
      if (filePath) await supabase.storage.from("documentos").remove([filePath]);
      const { error } = await supabase.from("documentos").delete().eq("id", id);
      if (error) throw error;
      toast.success("Documento excluído");
      fetchDocumentos();
    } catch { toast.error("Erro ao excluir"); }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm("Excluir este link?")) return;
    try {
      const { error } = await supabase.from("links_uteis").delete().eq("id", id);
      if (error) throw error;
      toast.success("Link excluído");
      fetchLinks();
    } catch { toast.error("Erro ao excluir"); }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const isAdmin = userRole === "admin" || userRole === "superintendente";

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Documentos e Links</h1>
              <p className="text-sm text-muted-foreground">Gerencie documentos e links úteis</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Documentos", value: documentos.length, icon: FileText, color: "text-primary", bg: "bg-primary/10" },
            { label: "Links", value: links.length, icon: Globe, color: "text-emerald-600", bg: "bg-emerald-500/10" },
            { label: "Categorias", value: linkCategorias.length, icon: FolderOpen, color: "text-amber-600", bg: "bg-amber-500/10" },
            { label: "Total Itens", value: documentos.length + links.length, icon: File, color: "text-purple-600", bg: "bg-purple-500/10" },
          ].map((stat) => (
            <Card key={stat.label} className="rounded-2xl border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="documentos" className="space-y-4">
          <TabsList className="rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="documentos" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-4 w-4" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-1.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4" /> Links Úteis
            </TabsTrigger>
          </TabsList>

          {/* Documents Tab */}
          <TabsContent value="documentos">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar documentos..." value={searchDocTerm} onChange={(e) => setSearchDocTerm(e.target.value)} className="pl-10 rounded-xl" />
                </div>
                {isAdmin && (
                  <Dialog open={docDialogOpen} onOpenChange={(open) => { setDocDialogOpen(open); if (!open) resetDocForm(); }}>
                    <DialogTrigger asChild>
                      <Button className="rounded-xl gap-2 shadow-sm shrink-0">
                        <Upload className="h-4 w-4" /> Adicionar
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingDoc ? 'Editar Documento' : 'Adicionar Documento'}</DialogTitle>
                        <DialogDescription>{editingDoc ? 'Edite as informações' : 'Envie um documento para a equipe'}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div><Label>Título *</Label><Input value={docTitulo} onChange={(e) => setDocTitulo(e.target.value)} placeholder="Nome do documento" /></div>
                        <div><Label>Descrição</Label><Textarea value={docDescricao} onChange={(e) => setDocDescricao(e.target.value)} placeholder="Descrição opcional" /></div>
                        <div>
                          <Label>Arquivo {editingDoc ? '' : '*'}</Label>
                          <Input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                          {editingDoc && <p className="text-xs text-muted-foreground mt-1">Deixe em branco para manter o atual</p>}
                        </div>
                        <Button onClick={handleUploadDocumento} disabled={uploading} className="w-full">
                          {uploading ? "Processando..." : (editingDoc ? "Salvar" : "Enviar")}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Carregando...</div>
              ) : filteredDocumentos.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 border-border/50">
                  <CardContent className="py-16 text-center">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground font-medium">{searchDocTerm ? 'Nenhum documento encontrado' : 'Nenhum documento cadastrado'}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Adicionar" para começar</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredDocumentos.map((doc) => {
                    const IconComp = getFileIcon(doc.tipo_arquivo);
                    const iconColor = getFileColor(doc.tipo_arquivo);
                    return (
                      <Card key={doc.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-all group">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-muted/50 shrink-0">
                              <IconComp className={`h-5 w-5 ${iconColor}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm truncate">{doc.titulo}</h3>
                              {doc.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{doc.descricao}</p>}
                              <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                                <span>{formatFileSize(doc.arquivo_tamanho)}</span>
                                <span>•</span>
                                <span>{new Date(doc.created_at).toLocaleDateString("pt-BR")}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/30">
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs flex-1 rounded-lg" onClick={() => handleDownloadDocumento(doc.arquivo_url, doc.arquivo_nome)}>
                              <Download className="h-3.5 w-3.5" /> Download
                            </Button>
                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handleEditDocumento(doc)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={() => handleDeleteDocumento(doc.id, doc.arquivo_url)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Links Tab */}
          <TabsContent value="links">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar links..." value={searchLinkTerm} onChange={(e) => setSearchLinkTerm(e.target.value)} className="pl-10 rounded-xl" />
                </div>
                {isAdmin && (
                  <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) resetLinkForm(); }}>
                    <DialogTrigger asChild>
                      <Button className="rounded-xl gap-2 shadow-sm shrink-0">
                        <LinkIcon className="h-4 w-4" /> Adicionar
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingLink ? 'Editar Link' : 'Adicionar Link'}</DialogTitle>
                        <DialogDescription>{editingLink ? 'Edite as informações' : 'Adicione um link útil'}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div><Label>Título *</Label><Input value={linkTitulo} onChange={(e) => setLinkTitulo(e.target.value)} placeholder="Nome do link" /></div>
                        <div><Label>Descrição</Label><Textarea value={linkDescricao} onChange={(e) => setLinkDescricao(e.target.value)} placeholder="Descrição opcional" /></div>
                        <div><Label>URL *</Label><Input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://exemplo.com" /></div>
                        <div><Label>Categoria</Label><Input value={linkCategoria} onChange={(e) => setLinkCategoria(e.target.value)} placeholder="Ex: Ferramentas, Docs..." /></div>
                        <Button onClick={handleAddOrUpdateLink} className="w-full">{editingLink ? 'Atualizar' : 'Adicionar'}</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {filteredLinks.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2 border-border/50">
                  <CardContent className="py-16 text-center">
                    <Globe className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground font-medium">{searchLinkTerm ? 'Nenhum link encontrado' : 'Nenhum link cadastrado'}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredLinks.map((link) => (
                    <Card key={link.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={() => window.open(link.url, "_blank")}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 shrink-0">
                            <Globe className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm truncate">{link.titulo}</h3>
                              {link.categoria && <Badge variant="secondary" className="text-[10px] h-5 shrink-0">{link.categoria}</Badge>}
                            </div>
                            {link.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{link.descricao}</p>}
                            <p className="text-[11px] text-primary truncate mt-1.5">{link.url}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{new Date(link.created_at).toLocaleDateString("pt-BR")}</p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/30" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs flex-1 rounded-lg" onClick={() => window.open(link.url, "_blank")}>
                              <ExternalLink className="h-3.5 w-3.5" /> Abrir
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handleEditLink(link)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={() => handleDeleteLink(link.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
