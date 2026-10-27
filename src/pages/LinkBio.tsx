import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { Copy, ExternalLink, Link2, MousePointerClick, Pencil, Plus, Trash2, Eye } from "lucide-react";
import { TEMA_PADRAO, temaCompleto, type LinkBioPagina } from "@/components/linkbio/LinkBioView";
import { linkPublicoBio, slugify } from "@/components/linkbio/utils";

type PaginaLista = LinkBioPagina & { link_bio_itens: { cliques: number }[] };

export default function LinkBio() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<PaginaLista | null>(null);

  const { data: paginas, isLoading } = useQuery({
    queryKey: ["link_bio_paginas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("link_bio_paginas")
        .select("*, link_bio_itens(cliques)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PaginaLista[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const s = slugify(slug || titulo);
      if (!titulo.trim() || !s) throw new Error("Informe o nome e o endereço da página");
      const { data, error } = await (supabase as any)
        .from("link_bio_paginas")
        .insert({ titulo: titulo.trim(), slug: s, tema: TEMA_PADRAO })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error(`O endereço /l/${s} já está em uso`);
        throw error;
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["link_bio_paginas"] });
      setNovaAberta(false);
      navigate(`/links/${id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("link_bio_paginas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Página excluída");
      qc.invalidateQueries({ queryKey: ["link_bio_paginas"] });
      setParaExcluir(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const abrirNova = () => {
    setTitulo("");
    setSlug("");
    setSlugEditado(false);
    setNovaAberta(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        icon={Link2}
        title="Links"
        subtitle="Páginas de links para bio do Instagram, WhatsApp e QR codes."
        actions={
          <Button onClick={abrirNova} className="gap-2">
            <Plus className="h-4 w-4" /> Nova página
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : !paginas || paginas.length === 0 ? (
        <Card className="rounded-2xl bg-muted/40">
          <CardContent className="py-16 text-center space-y-3">
            <Link2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma página de links criada ainda</p>
            <Button onClick={abrirNova} className="gap-2">
              <Plus className="h-4 w-4" /> Criar primeira página
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginas.map((p) => {
            const tema = temaCompleto(p.tema);
            const cliques = (p.link_bio_itens || []).reduce((s, i) => s + Number(i.cliques || 0), 0);
            return (
              <Card key={p.id} className="rounded-2xl hover:shadow-md transition">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-full border bg-white overflow-hidden flex items-center justify-center shrink-0">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-full w-full object-contain p-1" />
                      ) : (
                        <span className="font-bold text-muted-foreground">{p.titulo.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold leading-tight truncate">{p.titulo}</h3>
                        <Badge variant={p.ativo ? "default" : "secondary"} className="shrink-0">
                          {p.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">/l/{p.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-10 rounded-full" style={{ backgroundColor: tema.cor_botao }} />
                    <span className="h-2 w-6 rounded-full" style={{ backgroundColor: tema.cor_sombra }} />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {Number(p.visitas || 0).toLocaleString("pt-BR")} visitas
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="h-3.5 w-3.5" /> {cliques.toLocaleString("pt-BR")} cliques
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/links/${p.id}`)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(linkPublicoBio(p.slug));
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Link
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/l/${p.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setParaExcluir(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova página de links</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                autoFocus
                placeholder="Vangard Gestora"
                value={titulo}
                onChange={(e) => {
                  setTitulo(e.target.value);
                  if (!slugEditado) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">{window.location.host}/l/</span>
                <Input
                  placeholder="vangard"
                  value={slug}
                  onChange={(e) => {
                    setSlugEditado(true);
                    setSlug(slugify(e.target.value));
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaAberta(false)}>
              Cancelar
            </Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => !o && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir página “{paraExcluir?.titulo}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O endereço /l/{paraExcluir?.slug} deixa de funcionar — quem tiver o link salvo (bio do Instagram, QR
              code impresso) verá “página indisponível”. Para pausar sem perder nada, desative a página no editor.
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
