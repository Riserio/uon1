import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowUpToLine, ExternalLink, Globe, Lock, Megaphone, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/hooks/use-toast";
import type { Comunicado } from "@/types/comunicado";
import { cn } from "@/lib/utils";

type FiltroStatus = "todos" | "ativos" | "inativos";
type FiltroAlcance = "todos" | "interno" | "externo";
const POR_VEZ = 30;
const FORM_VAZIO = { titulo: "", mensagem: "", link: "", imagem_url: "", ativo: true, publico: false };

/** Abas segmentadas do estilo editorial. */
function Segmento<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { id: T; rotulo: string; qtd?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-2xl bg-muted p-1">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={valor === o.id}
          className={cn(
            "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
            valor === o.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.rotulo}
          {o.qtd !== undefined && <span className="ml-1.5 tabular-nums text-muted-foreground">{o.qtd}</span>}
        </button>
      ))}
    </div>
  );
}

function Chip({ cor, children }: { cor: "primary" | "accent" | "muted" | "success"; children: React.ReactNode }) {
  const estilo = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent-brand/12 text-accent-brand",
    muted: "bg-muted text-muted-foreground",
    success: "bg-success/12 text-success",
  }[cor];
  const ponto = { primary: "bg-primary", accent: "bg-accent-brand", muted: "bg-muted-foreground/60", success: "bg-success" }[cor];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", estilo)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", ponto)} />
      {children}
    </span>
  );
}

function Miniatura({ url }: { url?: string | null }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-xl overflow-hidden bg-primary/5 flex items-center justify-center">
      {url && !falhou ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFalhou(true)} />
      ) : (
        <Megaphone className="h-5 w-5 text-primary/40" />
      )}
    </span>
  );
}

export default function Comunicados() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("todos");
  const [alcance, setAlcance] = useState<FiltroAlcance>("todos");
  const [limite, setLimite] = useState(POR_VEZ);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState(FORM_VAZIO);

  const { data: comunicados = [], isLoading } = useQuery({
    queryKey: ["comunicados_gestao"],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("comunicados").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Comunicado[];
    },
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["comunicados_gestao"] });
    qc.invalidateQueries({ queryKey: ["painel_radar_extras"] });
  };
  const falha = (msg: string) => toast({ title: "Erro", description: msg, variant: "destructive" });

  const contagem = useMemo(
    () => ({
      total: comunicados.length,
      ativos: comunicados.filter((c) => c.ativo).length,
      inativos: comunicados.filter((c) => !c.ativo).length,
      interno: comunicados.filter((c) => !c.publico).length,
      externo: comunicados.filter((c) => c.publico).length,
    }),
    [comunicados],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comunicados.filter((c) => {
      if (status === "ativos" && !c.ativo) return false;
      if (status === "inativos" && c.ativo) return false;
      if (alcance === "interno" && c.publico) return false;
      if (alcance === "externo" && !c.publico) return false;
      return !termo || c.titulo.toLowerCase().includes(termo) || c.mensagem.toLowerCase().includes(termo);
    });
  }, [comunicados, busca, status, alcance]);
  const visiveis = filtrados.slice(0, limite);

  const abrirNovo = () => {
    setFormData(FORM_VAZIO);
    setEditingId(null);
    setDialogOpen(true);
  };
  const abrirEdicao = (c: Comunicado) => {
    setFormData({ titulo: c.titulo, mensagem: c.mensagem, link: c.link ?? "", imagem_url: c.imagem_url ?? "", ativo: c.ativo, publico: !!c.publico });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo.trim() || !formData.mensagem.trim()) return falha("Título e mensagem são obrigatórios");
    setSalvando(true);
    const campos = {
      titulo: formData.titulo.trim(),
      mensagem: formData.mensagem.trim(),
      link: formData.link.trim() || null,
      imagem_url: formData.imagem_url.trim() || null,
      ativo: formData.ativo,
      publico: formData.publico,
    };
    const { error } = editingId
      ? await supabase.from("comunicados").update(campos).eq("id", editingId)
      : await supabase.from("comunicados").insert({ ...campos, criado_por: user?.id });
    setSalvando(false);
    if (error) return falha("Não foi possível salvar o comunicado");
    toast({ title: editingId ? "Comunicado atualizado" : "Comunicado publicado" });
    setDialogOpen(false);
    recarregar();
  };

  const atualizar = async (id: string, campos: Partial<Pick<Comunicado, "ativo" | "publico" | "created_at">>, ok: string) => {
    const { error } = await supabase.from("comunicados").update(campos).eq("id", id);
    if (error) return falha("Não foi possível atualizar o comunicado");
    toast({ title: ok });
    recarregar();
  };

  const excluir = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("comunicados").delete().eq("id", deleteId);
    if (error) return falha("Não foi possível excluir o comunicado");
    toast({ title: "Comunicado excluído" });
    setDeleteId(null);
    recarregar();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 sm:p-6 space-y-5">
        <PageHeader
          icon={Megaphone}
          title="Comunicados"
          subtitle="Entram no Radar do mercado na ordem de data, junto com as notícias"
          actions={
            <Button onClick={abrirNovo} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Novo comunicado
            </Button>
          }
        />

        {/* Filtros */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setLimite(POR_VEZ);
              }}
              placeholder="Buscar por título ou mensagem"
              className="pl-9 h-10 rounded-xl"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmento
              valor={status}
              onChange={(v) => {
                setStatus(v);
                setLimite(POR_VEZ);
              }}
              opcoes={[
                { id: "todos", rotulo: "Todos", qtd: contagem.total },
                { id: "ativos", rotulo: "Ativos", qtd: contagem.ativos },
                { id: "inativos", rotulo: "Inativos", qtd: contagem.inativos },
              ]}
            />
            <Segmento
              valor={alcance}
              onChange={(v) => {
                setAlcance(v);
                setLimite(POR_VEZ);
              }}
              opcoes={[
                { id: "todos", rotulo: "Interno e externo" },
                { id: "interno", rotulo: "Só interno", qtd: contagem.interno },
                { id: "externo", rotulo: "Também externo", qtd: contagem.externo },
              ]}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Comunicado</span>
            <span className="w-36">Alcance</span>
            <span className="w-24">Publicado</span>
            <span className="w-28 text-right">Ativo</span>
          </div>

          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-14 w-14 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
              <Megaphone className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="font-semibold">{comunicados.length === 0 ? "Nenhum comunicado ainda" : "Nenhum comunicado neste filtro"}</p>
              {comunicados.length === 0 && (
                <Button onClick={abrirNovo} size="sm" className="gap-2 mt-4 rounded-xl">
                  <Plus className="h-4 w-4" /> Criar o primeiro
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {visiveis.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/30 transition-colors",
                    !c.ativo && "opacity-60",
                  )}
                >
                  <button type="button" onClick={() => abrirEdicao(c)} className="flex items-center gap-3 min-w-0 text-left group">
                    <Miniatura url={c.imagem_url} />
                    <span className="min-w-0">
                      <span className="block font-semibold leading-snug truncate group-hover:text-primary transition-colors">{c.titulo}</span>
                      <span className="block text-sm text-muted-foreground truncate">{c.mensagem}</span>
                      <span className="flex md:hidden items-center gap-2 mt-1">
                        {c.publico ? <Chip cor="accent">Interno e externo</Chip> : <Chip cor="primary">Só interno</Chip>}
                        <span className="text-xs text-muted-foreground">{format(parseISO(c.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                      </span>
                    </span>
                  </button>

                  <span className="hidden md:block w-36">
                    {c.publico ? <Chip cor="accent">Interno e externo</Chip> : <Chip cor="primary">Só interno</Chip>}
                  </span>
                  <span className="hidden md:block w-24 text-sm text-muted-foreground tabular-nums">
                    {format(parseISO(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>

                  <span className="flex items-center justify-end gap-1 md:w-28">
                    <Switch
                      checked={c.ativo}
                      aria-label={c.ativo ? "Desativar comunicado" : "Ativar comunicado"}
                      onCheckedChange={(v) => atualizar(c.id, { ativo: v }, v ? "Comunicado ativado" : "Comunicado desativado")}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Mais ações">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuItem onClick={() => abrirEdicao(c)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            atualizar(c.id, { publico: !c.publico }, c.publico ? "Agora é somente interno" : "Agora aparece também na página pública")
                          }
                        >
                          {c.publico ? <Lock className="h-4 w-4 mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
                          {c.publico ? "Tornar somente interno" : "Mostrar também no externo"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => atualizar(c.id, { created_at: new Date().toISOString() }, "Comunicado voltou para o topo do Radar")}>
                          <ArrowUpToLine className="h-4 w-4 mr-2" /> Colocar no topo da fila
                        </DropdownMenuItem>
                        {c.link && (
                          <DropdownMenuItem asChild>
                            <a href={c.link} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-2" /> Abrir link
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteId(c.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {filtrados.length > visiveis.length && (
            <div className="border-t p-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setLimite((l) => l + POR_VEZ)}>
                Mostrar mais ({filtrados.length - visiveis.length})
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Formulário */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-semibold">{editingId ? "Editar comunicado" : "Novo comunicado"}</DialogTitle>
            <DialogDescription>Entra no Radar pela data de publicação: notícias mais novas passam na frente dele.</DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título *</Label>
              <Input id="titulo" value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} placeholder="Um título curto e direto" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mensagem">Mensagem *</Label>
              <Textarea
                id="mensagem"
                value={formData.mensagem}
                onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
                placeholder="Escreva a mensagem do comunicado"
                rows={5}
                required
                className="resize-y min-h-[120px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Quem vai ver</Label>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { publico: false, icone: Lock, titulo: "Somente interno", texto: "Aparece só no Radar do painel, para a equipe." },
                  { publico: true, icone: Globe, titulo: "Interno e externo", texto: "Também na página pública do Radar, aberta a todos." },
                ].map((o) => {
                  const sel = formData.publico === o.publico;
                  return (
                    <button
                      key={String(o.publico)}
                      type="button"
                      onClick={() => setFormData({ ...formData, publico: o.publico })}
                      aria-pressed={sel}
                      className={cn(
                        "text-left rounded-xl border p-3 transition-colors flex gap-3",
                        sel ? (o.publico ? "border-accent-brand bg-accent-brand/5" : "border-primary bg-primary/5") : "hover:bg-muted/50",
                      )}
                    >
                      <o.icone className={cn("h-5 w-5 mt-0.5 shrink-0", sel ? (o.publico ? "text-accent-brand" : "text-primary") : "text-muted-foreground")} />
                      <span>
                        <span className="block text-sm font-semibold">{o.titulo}</span>
                        <span className="block text-xs text-muted-foreground">{o.texto}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="link">Link (opcional)</Label>
                <Input id="link" type="url" value={formData.link} onChange={(e) => setFormData({ ...formData, link: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imagem_url">Endereço da imagem (opcional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="imagem_url"
                    type="url"
                    value={formData.imagem_url}
                    onChange={(e) => setFormData({ ...formData, imagem_url: e.target.value })}
                    placeholder="https://.../imagem.jpg"
                    className="flex-1"
                  />
                  {formData.imagem_url.trim() && <Miniatura key={formData.imagem_url} url={formData.imagem_url.trim()} />}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 p-3">
              <div>
                <Label htmlFor="ativo" className="font-medium">Ativo</Label>
                <p className="text-xs text-muted-foreground">{formData.ativo ? "Aparece no Radar agora" : "Guardado, sem aparecer no Radar"}</p>
              </div>
              <Switch id="ativo" checked={formData.ativo} onCheckedChange={(v) => setFormData({ ...formData, ativo: v })} />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {editingId ? "Salvar alterações" : "Publicar comunicado"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir comunicado?</AlertDialogTitle>
            <AlertDialogDescription>Ele sai do Radar e não pode ser recuperado. Se quiser só tirar do ar, desative em vez de excluir.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
