import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  MousePointerClick,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  LinkBioView,
  TEMA_PADRAO,
  TIPOS_LINK,
  temaCompleto,
  type EstiloBotao,
  type LinkBioItem,
  type LinkBioPagina,
  type LinkBioTema,
} from "@/components/linkbio/LinkBioView";
import { linkPublicoBio, slugify } from "@/components/linkbio/utils";

// ---------- montagem de URL por tipo ----------

function normalizarUrl(u: string) {
  const t = u.trim();
  if (!t) return t;
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  return `https://${t}`;
}

function lerWhatsApp(url: string) {
  const m = url.match(/wa\.me\/(\d*)(?:\?text=(.*))?/);
  if (!m) return { numero: "", mensagem: "" };
  let mensagem = "";
  try {
    mensagem = m[2] ? decodeURIComponent(m[2]) : "";
  } catch {
    mensagem = m[2] || "";
  }
  return { numero: m[1] || "", mensagem };
}

function montarWhatsApp(numero: string, mensagem: string) {
  let n = numero.replace(/\D/g, "");
  // Número brasileiro sem DDI (10–11 dígitos): acrescenta 55.
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  return `https://wa.me/${n}${mensagem.trim() ? `?text=${encodeURIComponent(mensagem.trim())}` : ""}`;
}

type ItemEdit = LinkBioItem & { novo?: boolean };

const CORES: { chave: keyof LinkBioTema; label: string }[] = [
  { chave: "cor_botao", label: "Botão" },
  { chave: "cor_texto_botao", label: "Texto do botão" },
  { chave: "cor_sombra", label: "Sombra / borda" },
  { chave: "cor_fundo", label: "Fundo" },
  { chave: "cor_texto", label: "Texto da página" },
];

export default function LinkBioEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pagina, setPagina] = useState<LinkBioPagina | null>(null);
  const [itens, setItens] = useState<ItemEdit[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviandoAvatar, setEnviandoAvatar] = useState(false);
  const [sujo, setSujo] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["link_bio_pagina", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("link_bio_paginas")
        .select("*, link_bio_itens(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as (LinkBioPagina & { link_bio_itens: LinkBioItem[] }) | null;
    },
  });

  useEffect(() => {
    if (!data) return;
    const { link_bio_itens, ...p } = data;
    setPagina({ ...p, tema: temaCompleto(p.tema) });
    setItens([...(link_bio_itens || [])].sort((a, b) => a.ordem - b.ordem));
    setRemovidos([]);
    setSujo(false);
  }, [data]);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  const tema = useMemo(() => temaCompleto(pagina?.tema), [pagina?.tema]);

  if (isLoading || (data && !pagina)) return <p className="p-6 text-muted-foreground">Carregando...</p>;
  if (!data || !pagina) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-muted-foreground">Página não encontrada.</p>
        <Button variant="outline" onClick={() => navigate("/links")}>
          Voltar
        </Button>
      </div>
    );
  }

  const setP = (patch: Partial<LinkBioPagina>) => {
    setPagina((p) => (p ? { ...p, ...patch } : p));
    setSujo(true);
  };
  const setTema = (patch: Partial<LinkBioTema>) => setP({ tema: { ...tema, ...patch } });
  const setItem = (idx: number, patch: Partial<ItemEdit>) => {
    setItens((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    setSujo(true);
  };
  const mover = (idx: number, dir: -1 | 1) => {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= itens.length) return;
    setItens((arr) => {
      const c = [...arr];
      [c[idx], c[alvo]] = [c[alvo], c[idx]];
      return c;
    });
    setSujo(true);
  };
  const adicionar = () => {
    setItens((arr) => [
      ...arr,
      { id: crypto.randomUUID(), rotulo: "", url: "", tipo: "link", ordem: arr.length, ativo: true, cliques: 0, novo: true },
    ]);
    setSujo(true);
  };
  const remover = (idx: number) => {
    const it = itens[idx];
    if (!it.novo) setRemovidos((r) => [...r, it.id]);
    setItens((arr) => arr.filter((_, i) => i !== idx));
    setSujo(true);
  };

  const enviarAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem");
    if (file.size > 2 * 1024 * 1024) return toast.error("Imagem acima de 2 MB");
    setEnviandoAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `linkbio/${pagina.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
      setP({ avatar_url: pub.publicUrl });
    } catch (e: any) {
      toast.error(e.message || "Falha ao enviar imagem");
    } finally {
      setEnviandoAvatar(false);
    }
  };

  const salvar = async () => {
    const slug = slugify(pagina.slug);
    if (!pagina.titulo.trim()) return toast.error("Informe o título");
    if (!slug) return toast.error("Informe o endereço");
    const invalidos = itens.filter((i) => !i.rotulo.trim() || !i.url.trim() || /wa\.me\/(\?|$)/.test(i.url));
    if (invalidos.length) return toast.error("Há links sem texto, endereço ou número de WhatsApp");

    setSalvando(true);
    try {
      const sb = supabase as any;
      const { error: e1 } = await sb
        .from("link_bio_paginas")
        .update({
          titulo: pagina.titulo.trim(),
          subtitulo: pagina.subtitulo?.trim() || null,
          slug,
          avatar_url: pagina.avatar_url,
          verificado: pagina.verificado,
          ativo: pagina.ativo,
          tema,
        })
        .eq("id", pagina.id);
      if (e1) {
        if (e1.code === "23505") throw new Error(`O endereço /l/${slug} já está em uso`);
        throw e1;
      }
      if (removidos.length) {
        const { error } = await sb.from("link_bio_itens").delete().in("id", removidos);
        if (error) throw error;
      }
      if (itens.length) {
        const { error } = await sb.from("link_bio_itens").upsert(
          itens.map((it, i) => ({
            id: it.id,
            pagina_id: pagina.id,
            rotulo: it.rotulo.trim(),
            url: it.url.trim(),
            tipo: it.tipo,
            ordem: i,
            ativo: it.ativo,
          })),
        );
        if (error) throw error;
      }
      toast.success("Página salva");
      setSujo(false);
      qc.invalidateQueries({ queryKey: ["link_bio_pagina", id] });
      qc.invalidateQueries({ queryKey: ["link_bio_paginas"] });
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const totalCliques = itens.reduce((s, i) => s + Number(i.cliques || 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-border/60">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/links")} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{pagina.titulo || "Página de links"}</h1>
            <p className="text-sm text-muted-foreground truncate">{linkPublicoBio(slugify(pagina.slug))}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(linkPublicoBio(slugify(pagina.slug)));
              toast.success("Link copiado");
            }}
          >
            <Copy className="h-4 w-4 mr-1" /> Copiar link
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/l/${data.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" /> Abrir
            </a>
          </Button>
          <Button size="sm" onClick={salvar} disabled={salvando || !sujo}>
            <Save className="h-4 w-4 mr-1" /> {salvando ? "Salvando..." : sujo ? "Salvar" : "Salvo"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6 min-w-0">
          {/* Perfil */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full border bg-white overflow-hidden flex items-center justify-center shrink-0">
                  {pagina.avatar_url ? (
                    <img src={pagina.avatar_url} alt="" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) enviarAvatar(f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={enviandoAvatar}>
                    <ImagePlus className="h-4 w-4 mr-1" /> {enviandoAvatar ? "Enviando..." : "Enviar logo"}
                  </Button>
                  {pagina.avatar_url && (
                    <Button variant="ghost" size="sm" onClick={() => setP({ avatar_url: null })}>
                      Remover
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input value={pagina.titulo} onChange={(e) => setP({ titulo: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Frase de apoio</Label>
                  <Input
                    placeholder="Inovação que Transforma!"
                    value={pagina.subtitulo || ""}
                    onChange={(e) => setP({ subtitulo: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Endereço</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{window.location.host}/l/</span>
                    <Input value={pagina.slug} onChange={(e) => setP({ slug: slugify(e.target.value) })} />
                  </div>
                  {data.slug !== slugify(pagina.slug) && (
                    <p className="text-xs text-amber-600">
                      Ao salvar, o endereço antigo /l/{data.slug} deixa de funcionar (bio, QR codes impressos).
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={pagina.verificado} onCheckedChange={(v) => setP({ verificado: v })} /> Selo de verificado
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={pagina.ativo} onCheckedChange={(v) => setP({ ativo: v })} /> Página ativa
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Links */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Links</CardTitle>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {Number(pagina.visitas || 0).toLocaleString("pt-BR")} visitas ·{" "}
                  {totalCliques.toLocaleString("pt-BR")} cliques
                </p>
              </div>
              <Button size="sm" onClick={adicionar}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar link
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {itens.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum link ainda.</p>
              )}
              {itens.map((it, idx) => {
                const wa = it.tipo === "whatsapp" ? lerWhatsApp(it.url) : null;
                return (
                  <div
                    key={it.id}
                    className={`rounded-xl border p-3 space-y-3 ${it.ativo ? "" : "opacity-60 bg-muted/40"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={idx === 0}
                          onClick={() => mover(idx, -1)}
                          aria-label="Subir"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={idx === itens.length - 1}
                          onClick={() => mover(idx, 1)}
                          aria-label="Descer"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                      <Select
                        value={it.tipo}
                        onValueChange={(v) => {
                          const tipo = TIPOS_LINK.find((t) => t.value === v);
                          setItem(idx, {
                            tipo: v,
                            rotulo: it.rotulo || tipo?.label || "",
                            url: v === "whatsapp" ? montarWhatsApp("", "") : it.tipo === "whatsapp" ? "" : it.url,
                          });
                        }}
                      >
                        <SelectTrigger className="w-[170px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_LINK.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Texto do botão"
                        value={it.rotulo}
                        onChange={(e) => setItem(idx, { rotulo: e.target.value })}
                      />
                      {!it.novo && (
                        <span
                          className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground tabular-nums shrink-0"
                          title="Cliques"
                        >
                          <MousePointerClick className="h-3.5 w-3.5" /> {Number(it.cliques || 0).toLocaleString("pt-BR")}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setItem(idx, { ativo: !it.ativo })}
                        title={it.ativo ? "Ocultar" : "Mostrar"}
                      >
                        {it.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        onClick={() => remover(idx)}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {wa ? (
                      <div className="grid gap-2 sm:grid-cols-[200px_1fr] pl-7">
                        <Input
                          placeholder="(31) 99999-9999"
                          value={wa.numero}
                          inputMode="tel"
                          onChange={(e) => setItem(idx, { url: montarWhatsApp(e.target.value, wa.mensagem) })}
                        />
                        <Textarea
                          rows={1}
                          placeholder="Mensagem inicial (opcional)"
                          value={wa.mensagem}
                          onChange={(e) => setItem(idx, { url: montarWhatsApp(wa.numero, e.target.value) })}
                        />
                      </div>
                    ) : it.tipo === "email" ? (
                      <Input
                        className="ml-7 w-[calc(100%-1.75rem)]"
                        placeholder="contato@empresa.com.br"
                        value={it.url.replace(/^mailto:/i, "")}
                        onChange={(e) => setItem(idx, { url: `mailto:${e.target.value.trim()}` })}
                      />
                    ) : it.tipo === "telefone" ? (
                      <Input
                        className="ml-7 w-[calc(100%-1.75rem)]"
                        placeholder="(31) 3333-3333"
                        inputMode="tel"
                        value={it.url.replace(/^tel:\+?55?/i, "")}
                        onChange={(e) => {
                          const n = e.target.value.replace(/\D/g, "");
                          setItem(idx, { url: `tel:+55${n}` });
                        }}
                      />
                    ) : (
                      <Input
                        className="ml-7 w-[calc(100%-1.75rem)]"
                        placeholder={
                          it.tipo === "mapa"
                            ? "Link do Google Maps (Compartilhar → Copiar link)"
                            : it.tipo === "google"
                              ? "Link de avaliação do Perfil da Empresa no Google"
                              : "https://"
                        }
                        value={it.url}
                        onChange={(e) => setItem(idx, { url: e.target.value })}
                        onBlur={(e) => setItem(idx, { url: normalizarUrl(e.target.value) })}
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Aparência */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Aparência</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setTema({ ...TEMA_PADRAO })}>
                Restaurar padrão
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Estilo do botão</Label>
                <div className="inline-flex gap-1 rounded-2xl bg-muted p-1">
                  {(
                    [
                      ["sombra", "Sombra deslocada"],
                      ["solido", "Sólido"],
                      ["contorno", "Contorno"],
                    ] as [EstiloBotao, string][]
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTema({ estilo_botao: v })}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        tema.estilo_botao === v ? "bg-card shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {CORES.map(({ chave, label }) => (
                  <div key={chave} className="space-y-1.5">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                      <input
                        type="color"
                        value={String(tema[chave])}
                        onChange={(e) => setTema({ [chave]: e.target.value } as Partial<LinkBioTema>)}
                        className="h-7 w-7 rounded cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span className="text-xs font-mono uppercase">{String(tema[chave])}</span>
                    </div>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={tema.mostrar_icones} onCheckedChange={(v) => setTema({ mostrar_icones: v })} /> Mostrar
                ícones nos botões
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 h-fit">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2 text-center">
            Pré-visualização
          </p>
          <div className="mx-auto w-[340px] rounded-[2.5rem] border-[10px] border-foreground/90 shadow-xl overflow-hidden">
            <div className="h-[640px] overflow-y-auto" style={{ backgroundColor: tema.cor_fundo }}>
              <LinkBioView pagina={pagina} itens={itens} preview className="pt-10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
