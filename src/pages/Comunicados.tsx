import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Megaphone, Pencil, Trash2, Eye, EyeOff, Plus, ExternalLink, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Comunicado } from "@/types/comunicado";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function Comunicados() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    titulo: "",
    mensagem: "",
    link: "",
    imagem_url: "",
    ativo: true,
  });

  useEffect(() => {
    loadComunicados();
  }, []);

  const loadComunicados = async () => {
    try {
      const { data, error } = await supabase
        .from("comunicados")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComunicados(data || []);
    } catch (error) {
      console.error("Erro ao carregar comunicados:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os comunicados",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titulo.trim() || !formData.mensagem.trim()) {
      toast({
        title: "Erro",
        description: "Título e mensagem são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from("comunicados")
          .update({
            titulo: formData.titulo,
            mensagem: formData.mensagem,
            link: formData.link || null,
            imagem_url: formData.imagem_url || null,
            ativo: formData.ativo,
          })
          .eq("id", editingId);

        if (error) throw error;
        toast({ title: "Comunicado atualizado com sucesso!" });
      } else {
        const { error } = await supabase
          .from("comunicados")
          .insert({
            titulo: formData.titulo,
            mensagem: formData.mensagem,
            link: formData.link || null,
            imagem_url: formData.imagem_url || null,
            ativo: formData.ativo,
            criado_por: user?.id,
          });

        if (error) throw error;
        toast({ title: "Comunicado criado com sucesso!" });
      }

      setDialogOpen(false);
      resetForm();
      loadComunicados();
    } catch (error) {
      console.error("Erro ao salvar comunicado:", error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar o comunicado",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (comunicado: Comunicado) => {
    setFormData({
      titulo: comunicado.titulo,
      mensagem: comunicado.mensagem,
      link: comunicado.link || "",
      imagem_url: comunicado.imagem_url || "",
      ativo: comunicado.ativo,
    });
    setEditingId(comunicado.id);
    setDialogOpen(true);
  };

  const handleToggleAtivo = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("comunicados")
        .update({ ativo: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      
      toast({
        title: `Comunicado ${!currentStatus ? "ativado" : "desativado"} com sucesso!`,
      });
      
      loadComunicados();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("comunicados")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      
      toast({ title: "Comunicado excluído com sucesso!" });
      setDeleteId(null);
      loadComunicados();
    } catch (error) {
      console.error("Erro ao deletar comunicado:", error);
      toast({
        title: "Erro",
        description: "Não foi possível deletar o comunicado",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      titulo: "",
      mensagem: "",
      link: "",
      imagem_url: "",
      ativo: true,
    });
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto p-6 space-y-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-4xl font-bold flex items-center gap-3 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                <Megaphone className="h-10 w-10 text-primary" />
                Comunicados
              </h1>
              <p className="text-muted-foreground mt-2">
                Gerencie e publique comunicados para toda a equipe
              </p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} size="lg" className="gap-2 shadow-lg">
                <Plus className="h-5 w-5" />
                Novo Comunicado
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  {editingId ? "Editar Comunicado" : "Novo Comunicado"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="titulo" className="text-base">Título *</Label>
                  <Input
                    id="titulo"
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Digite um título chamativo"
                    required
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mensagem" className="text-base">Mensagem *</Label>
                  <Textarea
                    id="mensagem"
                    value={formData.mensagem}
                    onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
                    placeholder="Escreva a mensagem completa do comunicado"
                    rows={5}
                    required
                    className="text-base resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="link" className="text-base">Link (opcional)</Label>
                    <Input
                      id="link"
                      value={formData.link}
                      onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                      placeholder="https://exemplo.com"
                      type="url"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="imagem_url" className="text-base">URL da Imagem (opcional)</Label>
                    <Input
                      id="imagem_url"
                      value={formData.imagem_url}
                      onChange={(e) => setFormData({ ...formData, imagem_url: e.target.value })}
                      placeholder="https://exemplo.com/imagem.jpg"
                      type="url"
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label htmlFor="ativo" className="text-base font-medium">Status do Comunicado</Label>
                    <p className="text-sm text-muted-foreground">
                      {formData.ativo ? "Visível para todos" : "Oculto"}
                    </p>
                  </div>
                  <Switch
                    id="ativo"
                    checked={formData.ativo}
                    onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                  />
                </div>

                <Separator />

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} size="lg">
                    Cancelar
                  </Button>
                  <Button type="submit" size="lg" className="gap-2">
                    {editingId ? "Atualizar Comunicado" : "Publicar Comunicado"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Grid de Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-48 bg-muted" />
                <CardContent className="space-y-3 pt-6">
                  <div className="h-6 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : comunicados.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Megaphone className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Nenhum comunicado ainda</h3>
              <p className="text-muted-foreground text-center mb-6">
                Crie seu primeiro comunicado para começar a compartilhar informações
              </p>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeiro Comunicado
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comunicados.map((comunicado) => (
              <Card 
                key={comunicado.id} 
                className="group hover:shadow-xl transition-all duration-300 overflow-hidden border-2 hover:border-primary/50 relative"
              >
                {/* Badge de Status */}
                <div className="absolute top-4 right-4 z-10">
                  <Badge 
                    variant={comunicado.ativo ? "default" : "secondary"}
                    className="shadow-lg"
                  >
                    {comunicado.ativo ? (
                      <>
                        <Eye className="h-3 w-3 mr-1" />
                        Ativo
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3 mr-1" />
                        Inativo
                      </>
                    )}
                  </Badge>
                </div>

                {/* Imagem do Comunicado */}
                <div className="h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center relative overflow-hidden">
                  {comunicado.imagem_url ? (
                    <img 
                      src={comunicado.imagem_url} 
                      alt={comunicado.titulo}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Megaphone className="h-20 w-20 text-primary/30" />
                  )}
                </div>

                <CardHeader className="pb-3">
                  <CardTitle className="text-xl line-clamp-2 group-hover:text-primary transition-colors">
                    {comunicado.titulo}
                  </CardTitle>
                  <CardDescription className="line-clamp-3 text-base mt-2">
                    {comunicado.mensagem}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Info */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(comunicado.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                  </div>

                  <Separator />

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2">
                    {comunicado.link && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="flex-1"
                      >
                        <a href={comunicado.link} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver Link
                        </a>
                      </Button>
                    )}
                    
                    <div className={`flex gap-1 ${comunicado.link ? '' : 'flex-1 justify-end'}`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleAtivo(comunicado.id, comunicado.ativo)}
                        className="hover:bg-primary/10"
                      >
                        {comunicado.ativo ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(comunicado)}
                        className="hover:bg-primary/10"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(comunicado.id)}
                        className="hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar este comunicado? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
