import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link as LinkIcon, Upload, Download, Trash2, ExternalLink, Pencil, Search } from "lucide-react";
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

export default function Documentos() {
  const { user, userRole } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [links, setLinks] = useState<LinkUtil[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchDocTerm, setSearchDocTerm] = useState("");
  const [searchLinkTerm, setSearchLinkTerm] = useState("");
  
  // Documento form
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Documento | null>(null);
  const [docTitulo, setDocTitulo] = useState("");
  const [docDescricao, setDocDescricao] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  
  // Link form
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

  useEffect(() => {
    fetchDocumentos();
    fetchLinks();
  }, []);

  const fetchDocumentos = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar documentos");
      console.error(error);
    } else {
      setDocumentos(data || []);
    }
    setLoading(false);
  };

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from("links_uteis")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar links");
      console.error(error);
    } else {
      setLinks(data || []);
    }
  };

  const handleUploadDocumento = async () => {
    if (!docTitulo) {
      toast.error("Preencha o título");
      return;
    }

    if (!editingDoc && !docFile) {
      toast.error("Selecione um arquivo");
      return;
    }

    if (!user) {
      toast.error("Você precisa estar autenticado");
      return;
    }

    setUploading(true);

    try {
      if (editingDoc) {
        // Editar documento existente
        const updateData: any = {
          titulo: docTitulo,
          descricao: docDescricao || null,
        };

        // Se um novo arquivo foi selecionado, faz upload
        if (docFile) {
          const fileExt = docFile.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("documentos")
            .upload(filePath, docFile);

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from("documentos")
            .getPublicUrl(filePath);

          updateData.arquivo_url = urlData.publicUrl;
          updateData.arquivo_nome = docFile.name;
          updateData.arquivo_tamanho = docFile.size;
          updateData.tipo_arquivo = docFile.type;

          // Remove arquivo antigo
          const oldUrlParts = editingDoc.arquivo_url.split('/');
          const oldFilePath = oldUrlParts[oldUrlParts.length - 1];
          if (oldFilePath) {
            await supabase.storage.from("documentos").remove([oldFilePath]);
          }
        }

        const { error: updateError } = await supabase
          .from("documentos")
          .update(updateData)
          .eq("id", editingDoc.id);

        if (updateError) throw updateError;

        toast.success("Documento atualizado com sucesso!");
      } else {
        // Criar novo documento
        const fileExt = docFile!.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("documentos")
          .upload(filePath, docFile!);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("documentos")
          .getPublicUrl(filePath);

        const { error: insertError } = await supabase
          .from("documentos")
          .insert({
            titulo: docTitulo,
            descricao: docDescricao || null,
            arquivo_url: urlData.publicUrl,
            arquivo_nome: docFile!.name,
            arquivo_tamanho: docFile!.size,
            tipo_arquivo: docFile!.type,
            criado_por: user.id,
          });

        if (insertError) throw insertError;

        toast.success("Documento enviado com sucesso!");
      }

      setDocDialogOpen(false);
      setEditingDoc(null);
      setDocTitulo("");
      setDocDescricao("");
      setDocFile(null);
      fetchDocumentos();
    } catch (error) {
      console.error(error);
      toast.error(editingDoc ? "Erro ao atualizar documento" : "Erro ao enviar documento");
    } finally {
      setUploading(false);
    }
  };

  const handleEditDocumento = (doc: Documento) => {
    setEditingDoc(doc);
    setDocTitulo(doc.titulo);
    setDocDescricao(doc.descricao || "");
    setDocFile(null);
    setDocDialogOpen(true);
  };

  const handleAddOrUpdateLink = async () => {
    if (!linkTitulo || !linkUrl) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (!user) {
      toast.error("Você precisa estar autenticado");
      return;
    }

    try {
      const linkData = {
        titulo: linkTitulo,
        descricao: linkDescricao || null,
        url: linkUrl,
        categoria: linkCategoria || null,
        criado_por: user.id,
      };

      if (editingLink) {
        const { error } = await supabase
          .from("links_uteis")
          .update(linkData)
          .eq("id", editingLink.id);

        if (error) throw error;
        toast.success("Link atualizado com sucesso!");
      } else {
        const { error } = await supabase.from("links_uteis").insert(linkData);
        if (error) throw error;
        toast.success("Link adicionado com sucesso!");
      }

      setLinkDialogOpen(false);
      setEditingLink(null);
      setLinkTitulo("");
      setLinkDescricao("");
      setLinkUrl("");
      setLinkCategoria("");
      fetchLinks();
    } catch (error) {
      console.error(error);
      toast.error(editingLink ? "Erro ao atualizar link" : "Erro ao adicionar link");
    }
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
      // Extract file path from URL
      const urlParts = arquivo_url.split('/');
      const filePath = urlParts[urlParts.length - 1];
      
      // Download from storage
      const { data, error } = await supabase.storage
        .from("documentos")
        .download(filePath);

      if (error) throw error;

      // Create blob URL and trigger download
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
    } catch (error) {
      console.error(error);
      toast.error("Erro ao fazer download");
    }
  };

  const handleDeleteDocumento = async (id: string, arquivo_url: string) => {
    try {
      const urlParts = arquivo_url.split('/');
      const filePath = urlParts[urlParts.length - 1];
      
      if (filePath) {
        await supabase.storage.from("documentos").remove([filePath]);
      }

      const { error } = await supabase.from("documentos").delete().eq("id", id);

      if (error) throw error;

      toast.success("Documento excluído");
      fetchDocumentos();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir documento");
    }
  };

  const handleDeleteLink = async (id: string) => {
    try {
      const { error } = await supabase.from("links_uteis").delete().eq("id", id);

      if (error) throw error;

      toast.success("Link excluído");
      fetchLinks();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir link");
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const isAdmin = userRole === "admin" || userRole === "superintendente";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Documentos e Links</h1>
          <p className="text-sm text-muted-foreground">Gerencie documentos e links úteis para sua equipe</p>
        </div>
      </div>

      <Tabs defaultValue="documentos" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="links">Links Úteis</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="animate-fade-in">
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium">Documentos</CardTitle>
                  <CardDescription>Documentos compartilhados com a equipe</CardDescription>
                </div>
                  {isAdmin && (
                    <Dialog open={docDialogOpen} onOpenChange={(open) => {
                      setDocDialogOpen(open);
                      if (!open) {
                        setEditingDoc(null);
                        setDocTitulo("");
                        setDocDescricao("");
                        setDocFile(null);
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button>
                          <Upload className="h-4 w-4 mr-2" />
                          Adicionar Documento
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{editingDoc ? 'Editar Documento' : 'Adicionar Documento'}</DialogTitle>
                          <DialogDescription>
                            {editingDoc ? 'Edite as informações do documento' : 'Envie um documento para compartilhar com a equipe'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="doc-titulo">Título *</Label>
                            <Input
                              id="doc-titulo"
                              value={docTitulo}
                              onChange={(e) => setDocTitulo(e.target.value)}
                              placeholder="Nome do documento"
                            />
                          </div>
                          <div>
                            <Label htmlFor="doc-descricao">Descrição</Label>
                            <Textarea
                              id="doc-descricao"
                              value={docDescricao}
                              onChange={(e) => setDocDescricao(e.target.value)}
                              placeholder="Descrição opcional"
                            />
                          </div>
                          <div>
                            <Label htmlFor="doc-file">Arquivo {editingDoc ? '' : '*'}</Label>
                            <Input
                              id="doc-file"
                              type="file"
                              onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                            />
                            {editingDoc && <p className="text-xs text-muted-foreground mt-1">Deixe em branco para manter o arquivo atual</p>}
                          </div>
                          <Button onClick={handleUploadDocumento} disabled={uploading} className="w-full">
                            {uploading ? (editingDoc ? "Salvando..." : "Enviando...") : (editingDoc ? "Salvar Alterações" : "Enviar Documento")}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar documentos..."
                    value={searchDocTerm}
                    onChange={(e) => setSearchDocTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {loading ? (
                  <p className="text-center text-muted-foreground">Carregando...</p>
                ) : filteredDocumentos.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">{searchDocTerm ? 'Nenhum documento encontrado' : 'Nenhum documento cadastrado'}</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Título</TableHead>
                          <TableHead>Descrição</TableHead>
                        <TableHead>Tamanho</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocumentos.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.titulo}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {doc.descricao || "-"}
                          </TableCell>
                          <TableCell>{formatFileSize(doc.arquivo_tamanho)}</TableCell>
                          <TableCell>
                            {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadDocumento(doc.arquivo_url, doc.arquivo_nome)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditDocumento(doc)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteDocumento(doc.id, doc.arquivo_url)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="links" className="animate-fade-in">
            <Card className="border-border/40 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">Links Úteis</CardTitle>
                    <CardDescription>Links importantes para a equipe</CardDescription>
                  </div>
                  {isAdmin && (
                    <Dialog open={linkDialogOpen} onOpenChange={(open) => {
                      setLinkDialogOpen(open);
                      if (!open) {
                        setEditingLink(null);
                        setLinkTitulo("");
                        setLinkDescricao("");
                        setLinkUrl("");
                        setLinkCategoria("");
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button>
                          <LinkIcon className="h-4 w-4 mr-2" />
                          Adicionar Link
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{editingLink ? 'Editar Link' : 'Adicionar Link'}</DialogTitle>
                          <DialogDescription>
                            {editingLink ? 'Edite as informações do link' : 'Adicione um link útil para compartilhar com a equipe'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="link-titulo">Título *</Label>
                            <Input
                              id="link-titulo"
                              value={linkTitulo}
                              onChange={(e) => setLinkTitulo(e.target.value)}
                              placeholder="Nome do link"
                            />
                          </div>
                          <div>
                            <Label htmlFor="link-descricao">Descrição</Label>
                            <Textarea
                              id="link-descricao"
                              value={linkDescricao}
                              onChange={(e) => setLinkDescricao(e.target.value)}
                              placeholder="Descrição opcional"
                            />
                          </div>
                          <div>
                            <Label htmlFor="link-url">URL *</Label>
                            <Input
                              id="link-url"
                              type="url"
                              value={linkUrl}
                              onChange={(e) => setLinkUrl(e.target.value)}
                              placeholder="https://exemplo.com"
                            />
                          </div>
                          <div>
                            <Label htmlFor="link-categoria">Categoria</Label>
                            <Input
                              id="link-categoria"
                              value={linkCategoria}
                              onChange={(e) => setLinkCategoria(e.target.value)}
                              placeholder="Ex: Ferramentas, Documentação, etc."
                            />
                          </div>
                          <Button onClick={handleAddOrUpdateLink} className="w-full">
                            {editingLink ? 'Atualizar Link' : 'Adicionar Link'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar links..."
                    value={searchLinkTerm}
                    onChange={(e) => setSearchLinkTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {loading ? (
                  <p className="text-center text-muted-foreground">Carregando...</p>
                ) : filteredLinks.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">{searchLinkTerm ? 'Nenhum link encontrado' : 'Nenhum link cadastrado'}</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLinks.map((link) => (
                        <TableRow key={link.id}>
                          <TableCell className="font-medium">{link.titulo}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {link.descricao || "-"}
                          </TableCell>
                          <TableCell>{link.categoria || "-"}</TableCell>
                          <TableCell>
                            {new Date(link.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(link.url, "_blank")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditLink(link)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteLink(link.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }
