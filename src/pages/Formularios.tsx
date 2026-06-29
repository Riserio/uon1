import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  Pencil,
  BarChart3,
  Trash2,
  Copy,
  ExternalLink,
  EyeOff,
  Eye,
  Search,
  Share2,
} from "lucide-react";
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

type Formulario = {
  id: string;
  titulo: string;
  descricao: string | null;
  slug: string;
  status: "rascunho" | "publicado" | "arquivado";
  created_at: string;
  cor_tema: string | null;
  estilo?: string | null;
};

export default function Formularios() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [paraExcluir, setParaExcluir] = useState<Formulario | null>(null);

  const { data: forms, isLoading } = useQuery({
    queryKey: ["formularios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("id,titulo,descricao,slug,status,cor_tema,estilo,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Formulario[];
    },
  });

  const { data: contagens } = useQuery({
    queryKey: ["formularios_respostas_count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulario_respostas")
        .select("formulario_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        map[r.formulario_id] = (map[r.formulario_id] || 0) + 1;
      });
      return map;
    },
  });

  const togglePublicar = useMutation({
    mutationFn: async (form: Formulario) => {
      const novo = form.status === "publicado" ? "rascunho" : "publicado";
      const { error } = await supabase
        .from("formularios")
        .update({ status: novo })
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["formularios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicar = useMutation({
    mutationFn: async (form: Formulario) => {
      const { data: original, error: e1 } = await supabase
        .from("formularios")
        .select("*")
        .eq("id", form.id)
        .single();
      if (e1) throw e1;
      const novoSlug = `${original.slug}-copia-${Date.now().toString(36)}`;
      const { data: novo, error: e2 } = await supabase
        .from("formularios")
        .insert({
          titulo: `${original.titulo} (cópia)`,
          descricao: original.descricao,
          slug: novoSlug,
          cor_tema: original.cor_tema,
          logo_url: original.logo_url,
          status: "rascunho",
          config: original.config,
        })
        .select("id")
        .single();
      if (e2) throw e2;
      const { data: perguntas, error: e3 } = await supabase
        .from("formulario_perguntas")
        .select("*")
        .eq("formulario_id", form.id);
      if (e3) throw e3;
      if (perguntas && perguntas.length > 0) {
        const { error: e4 } = await supabase.from("formulario_perguntas").insert(
          perguntas.map((p: any) => ({
            formulario_id: novo.id,
            ordem: p.ordem,
            tipo: p.tipo,
            enunciado: p.enunciado,
            descricao: p.descricao,
            obrigatorio: p.obrigatorio,
            opcoes: p.opcoes,
            validacao: p.validacao,
          }))
        );
        if (e4) throw e4;
      }
      return novo.id;
    },
    onSuccess: (id) => {
      toast.success("Formulário duplicado");
      qc.invalidateQueries({ queryKey: ["formularios"] });
      navigate(`/formularios/${id}/editar`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("formularios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Formulário excluído");
      qc.invalidateQueries({ queryKey: ["formularios"] });
      setParaExcluir(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtrados = (forms || []).filter((f) =>
    f.titulo.toLowerCase().includes(busca.toLowerCase())
  );

  const linkPublico = (slug: string) => `${window.location.origin}/f/${slug}`;
  const linkCompartilhar = (slug: string) => {
    const supaUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    if (!supaUrl) return linkPublico(slug);
    return `${supaUrl}/functions/v1/og-share?slug=${encodeURIComponent(slug)}&host=${encodeURIComponent(window.location.host)}`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" /> Formulários
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie formulários públicos e receba respostas diretamente no sistema.
          </p>
        </div>
        <Button onClick={() => navigate("/formularios/novo")} className="gap-2">
          <Plus className="h-4 w-4" /> Novo formulário
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por título..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <Card className="rounded-2xl bg-muted/40">
          <CardContent className="py-16 text-center space-y-3">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum formulário criado ainda</p>
            <Button onClick={() => navigate("/formularios/novo")} className="gap-2">
              <Plus className="h-4 w-4" /> Criar primeiro formulário
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((f) => {
            const total = contagens?.[f.id] || 0;
            return (
              <Card
                key={f.id}
                className="rounded-2xl bg-muted/40 backdrop-blur hover:shadow-md transition"
              >
                <CardContent className="p-5 space-y-4">
                  <div
                    className="h-2 w-12 rounded-full"
                    style={{ backgroundColor: f.cor_tema || "#362C89" }}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{f.titulo}</h3>
                    <Badge
                      variant={f.status === "publicado" ? "default" : "secondary"}
                      className="shrink-0"
                    >
                      {f.status}
                    </Badge>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {f.estilo === "sinistro"
                      ? "Colapse"
                      : f.estilo === "fluxos"
                      ? "Fluxos"
                      : f.estilo === "google_forms"
                      ? "Google Forms"
                      : "Typeform"}
                  </Badge>
                  {f.descricao && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {f.descricao}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {total} resposta{total === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/formularios/${f.id}/editar`)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/formularios/${f.id}/respostas`)}
                    >
                      <BarChart3 className="h-3.5 w-3.5 mr-1" /> Respostas
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => togglePublicar.mutate(f)}
                    >
                      {f.status === "publicado" ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 mr-1" /> Despublicar
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Publicar
                        </>
                      )}
                    </Button>
                    {f.status === "publicado" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(linkPublico(f.slug));
                            toast.success("Link copiado");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" /> Link
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(linkCompartilhar(f.slug));
                            toast.success("Link de compartilhamento copiado (com preview da gestora)");
                          }}
                          title="Link com preview (Open Graph) — use ao compartilhar em WhatsApp, redes sociais, etc."
                        >
                          <Share2 className="h-3.5 w-3.5 mr-1" /> Compartilhar
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/f/${f.slug}`} target="_blank" rel="noopener">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => duplicar.mutate(f)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setParaExcluir(f)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => !o && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir formulário?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as respostas vinculadas serão removidas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => paraExcluir && excluir.mutate(paraExcluir.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}