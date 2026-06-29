import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Eye,
  GripVertical,
  Upload,
  X,
} from "lucide-react";

type EstiloForm = "google_forms" | "typeform" | "sinistro" | "fluxos";

const ESTILOS: { value: EstiloForm; titulo: string; descricao: string; emoji: string }[] = [
  {
    value: "google_forms",
    titulo: "Google Forms",
    descricao: "Clássico. Todas as perguntas em uma página.",
    emoji: "📋",
  },
  {
    value: "typeform",
    titulo: "Typeform",
    descricao: "Imersivo. Uma pergunta por vez, tela cheia.",
    emoji: "✨",
  },
  {
    value: "sinistro",
    titulo: "Colapse",
    descricao: "Layout Vangard com cabeçalho fixo e seções. Perguntas customizáveis.",
    emoji: "🛡️",
  },
  {
    value: "fluxos",
    titulo: "Fluxos",
    descricao: "Análise de sinistro com motor de classificação automática (7 dimensões + gatilhos + red flags). Estrutura fixa.",
    emoji: "🧭",
  },
];

type TipoPergunta =
  | "texto_curto"
  | "texto_longo"
  | "radio"
  | "checkbox"
  | "dropdown"
  | "numero"
  | "data"
  | "email"
  | "telefone"
  | "placa"
  | "cpf"
  | "cnpj"
  | "cep"
  | "estado"
  | "secao";

type Pergunta = {
  id?: string;
  tipo: TipoPergunta;
  enunciado: string;
  descricao?: string;
  obrigatorio: boolean;
  opcoes: string[];
  ordem: number;
};

const TIPOS: { value: TipoPergunta; label: string; opcoes: boolean }[] = [
  { value: "secao", label: "— Cabeçalho de seção —", opcoes: false },
  { value: "texto_curto", label: "Texto curto", opcoes: false },
  { value: "texto_longo", label: "Texto longo (parágrafo)", opcoes: false },
  { value: "radio", label: "Escolha única (radio)", opcoes: true },
  { value: "checkbox", label: "Múltipla escolha (checkbox)", opcoes: true },
  { value: "dropdown", label: "Lista suspensa", opcoes: true },
  { value: "numero", label: "Número", opcoes: false },
  { value: "data", label: "Data", opcoes: false },
  { value: "email", label: "E-mail", opcoes: false },
  { value: "telefone", label: "Telefone", opcoes: false },
  { value: "placa", label: "Placa de veículo", opcoes: false },
  { value: "cpf", label: "CPF", opcoes: false },
  { value: "cnpj", label: "CNPJ", opcoes: false },
  { value: "cep", label: "CEP", opcoes: false },
  { value: "estado", label: "Estado (UF)", opcoes: false },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

export default function FormularioEditor() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [corTema, setCorTema] = useState("#362C89");
  const [status, setStatus] = useState<"rascunho" | "publicado">("rascunho");
  const [estilo, setEstilo] = useState<EstiloForm>("google_forms");
  const [mensagemAgradecimento, setMensagemAgradecimento] = useState(
    "Resposta enviada com sucesso!"
  );
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [logoParceiroUrl, setLogoParceiroUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data: form } = useQuery({
    queryKey: ["formulario", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("*, formulario_perguntas(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !isNew,
  });

  useEffect(() => {
    if (!form) return;
    setTitulo(form.titulo);
    setDescricao(form.descricao || "");
    setSlug(form.slug);
    setCorTema(form.cor_tema || "#362C89");
    setStatus(form.status === "publicado" ? "publicado" : "rascunho");
    setEstilo(((form as any).estilo as EstiloForm) || "google_forms");
    setLogoParceiroUrl((form as any).logo_url || null);
    setMensagemAgradecimento(
      (form.config as any)?.mensagem_agradecimento || "Resposta enviada com sucesso!"
    );
    const ordenadas = [...(form.formulario_perguntas || [])].sort(
      (a: any, b: any) => a.ordem - b.ordem
    );
    setPerguntas(
      ordenadas.map((p: any) => ({
        id: p.id,
        tipo: p.tipo,
        enunciado: p.enunciado,
        descricao: p.descricao || "",
        obrigatorio: !!p.obrigatorio,
        opcoes: Array.isArray(p.opcoes) ? p.opcoes : [],
        ordem: p.ordem,
      }))
    );
  }, [form]);

  useEffect(() => {
    if (isNew && !slugDirty) setSlug(slugify(titulo));
  }, [titulo, isNew, slugDirty]);

  const addPergunta = () => {
    setPerguntas((p) => [
      ...p,
      {
        tipo: "texto_curto",
        enunciado: "",
        obrigatorio: false,
        opcoes: [],
        ordem: p.length,
      },
    ]);
  };

  const updatePergunta = (idx: number, patch: Partial<Pergunta>) => {
    setPerguntas((arr) => arr.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removePergunta = (idx: number) => {
    setPerguntas((arr) => arr.filter((_, i) => i !== idx).map((p, i) => ({ ...p, ordem: i })));
  };

  const movePergunta = (idx: number, dir: -1 | 1) => {
    setPerguntas((arr) => {
      const novo = [...arr];
      const target = idx + dir;
      if (target < 0 || target >= novo.length) return arr;
      [novo[idx], novo[target]] = [novo[target], novo[idx]];
      return novo.map((p, i) => ({ ...p, ordem: i }));
    });
  };

  const salvar = useMutation({
    mutationFn: async (publicar?: boolean) => {
      if (!titulo.trim()) throw new Error("Informe um título");
      if (!slug.trim()) throw new Error("Informe o slug do link público");
      if (perguntas.length === 0)
        throw new Error("Adicione ao menos uma pergunta");
      for (const p of perguntas) {
        if (!p.enunciado.trim()) throw new Error("Toda pergunta precisa de enunciado");
        const precisaOpcoes = TIPOS.find((t) => t.value === p.tipo)?.opcoes;
        if (precisaOpcoes && p.opcoes.filter((o) => o.trim()).length < 2)
          throw new Error(`A pergunta "${p.enunciado}" precisa de ao menos 2 opções`);
      }

      const payload = {
        titulo,
        descricao,
        slug,
        cor_tema: corTema,
        estilo,
        logo_url: logoParceiroUrl,
        status: publicar ? "publicado" : status,
        config: { mensagem_agradecimento: mensagemAgradecimento },
      };

      let formId = id;
      if (isNew) {
        const { data, error } = await supabase
          .from("formularios")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        formId = data.id;
      } else {
        const { error } = await supabase
          .from("formularios")
          .update(payload)
          .eq("id", formId!);
        if (error) throw error;
      }

      // Reset perguntas: delete + insert (forma mais simples e correta)
      await supabase.from("formulario_perguntas").delete().eq("formulario_id", formId!);
      const { error: errP } = await supabase.from("formulario_perguntas").insert(
        perguntas.map((p, i) => ({
          formulario_id: formId,
          ordem: i,
          tipo: p.tipo,
          enunciado: p.enunciado,
          descricao: p.descricao || null,
          obrigatorio: p.obrigatorio,
          opcoes: TIPOS.find((t) => t.value === p.tipo)?.opcoes
            ? p.opcoes.filter((o) => o.trim())
            : [],
        }))
      );
      if (errP) throw errP;
      return formId!;
    },
    onSuccess: (formId) => {
      toast.success("Formulário salvo");
      qc.invalidateQueries({ queryKey: ["formularios"] });
      qc.invalidateQueries({ queryKey: ["formulario", formId] });
      if (isNew) navigate(`/formularios/${formId}/editar`, { replace: true });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const linkPublico = useMemo(
    () => (slug ? `${window.location.origin}/f/${slug}` : ""),
    [slug]
  );

  const uploadLogoParceiro = async (file: File) => {
    try {
      setUploadingLogo(true);
      const ext = file.name.split(".").pop() || "png";
      const path = `formularios/parceiros/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoParceiroUrl(data.publicUrl);
      toast.success("Logo do parceiro enviada");
    } catch (e: any) {
      toast.error(e.message || "Falha ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/formularios")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="ml-auto flex gap-2">
          {!isNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/f/${slug}`, "_blank")}
            >
              <Eye className="h-4 w-4 mr-1" /> Pré-visualizar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => salvar.mutate(false)}
            disabled={salvar.isPending}
          >
            <Save className="h-4 w-4 mr-1" /> Salvar
          </Button>
          <Button
            size="sm"
            onClick={() => salvar.mutate(true)}
            disabled={salvar.isPending}
          >
            Salvar e publicar
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl bg-muted/40 backdrop-blur">
        <CardContent className="p-6 space-y-4">
          <div
            className="h-2 w-24 rounded-full"
            style={{ backgroundColor: corTema }}
          />
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título do formulário"
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição opcional"
              rows={2}
            />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Slug do link público</Label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value));
                  setSlugDirty(true);
                }}
                placeholder="exemplo-de-link"
              />
              {linkPublico && (
                <p className="text-xs text-muted-foreground break-all">{linkPublico}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Cor do tema</Label>
              <Input
                type="color"
                value={corTema}
                onChange={(e) => setCorTema(e.target.value)}
                className="h-10 p-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mensagem ao enviar</Label>
            <Input
              value={mensagemAgradecimento}
              onChange={(e) => setMensagemAgradecimento(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Logo do parceiro (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              A logo da Vangard é exibida sempre. Se enviar uma logo aqui, ela aparecerá ao lado da Vangard com um separador.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-stone-900 rounded-md px-3 py-2">
                <img
                  src="/images/vangard-logo.png"
                  alt="Vangard"
                  className="h-7 object-contain bg-white/95 rounded px-1"
                />
                {logoParceiroUrl && (
                  <>
                    <span className="h-6 w-px bg-white/40" />
                    <img
                      src={logoParceiroUrl}
                      alt="Parceiro"
                      className="h-7 object-contain bg-white/95 rounded px-1"
                    />
                  </>
                )}
              </div>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogoParceiro(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  asChild
                >
                  <span>
                    <Upload className="h-4 w-4 mr-1" />
                    {uploadingLogo
                      ? "Enviando..."
                      : logoParceiroUrl
                      ? "Trocar logo parceiro"
                      : "Enviar logo parceiro"}
                  </span>
                </Button>
              </label>
              {logoParceiroUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setLogoParceiroUrl(null)}
                >
                  <X className="h-4 w-4 mr-1" /> Remover
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl bg-muted/40 backdrop-blur">
        <CardContent className="p-6 space-y-3">
          <div>
            <Label className="text-base font-semibold">Estilo do formulário</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Define como o formulário será exibido para quem responde.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {ESTILOS.map((e) => {
              const ativo = estilo === e.value;
              return (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => setEstilo(e.value)}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    ativo
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="text-2xl mb-1">{e.emoji}</div>
                  <div className="font-semibold text-sm">{e.titulo}</div>
                  <div className="text-xs text-muted-foreground mt-1">{e.descricao}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {perguntas.map((p, idx) => {
          const precisaOpcoes = TIPOS.find((t) => t.value === p.tipo)?.opcoes;
          return (
            <Card key={idx} className="rounded-2xl bg-muted/40 backdrop-blur">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-2">
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-2" />
                  <div className="flex-1 grid md:grid-cols-[1fr_220px] gap-3">
                    <Input
                      value={p.enunciado}
                      onChange={(e) => updatePergunta(idx, { enunciado: e.target.value })}
                      placeholder={`Pergunta ${idx + 1}`}
                      className="font-medium"
                    />
                    <Select
                      value={p.tipo}
                      onValueChange={(v) =>
                        updatePergunta(idx, {
                          tipo: v as TipoPergunta,
                          opcoes:
                            TIPOS.find((t) => t.value === v)?.opcoes && p.opcoes.length === 0
                              ? ["", ""]
                              : p.opcoes,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => movePergunta(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => movePergunta(idx, 1)}
                      disabled={idx === perguntas.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Textarea
                  value={p.descricao || ""}
                  onChange={(e) => updatePergunta(idx, { descricao: e.target.value })}
                  placeholder="Descrição/ajuda (opcional)"
                  rows={1}
                  className="text-sm"
                />

                {precisaOpcoes && (
                  <div className="space-y-2 pl-2 border-l-2 border-primary/30">
                    <Label className="text-xs">Opções</Label>
                    {p.opcoes.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const novas = [...p.opcoes];
                            novas[oi] = e.target.value;
                            updatePergunta(idx, { opcoes: novas });
                          }}
                          placeholder={`Opção ${oi + 1}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updatePergunta(idx, {
                              opcoes: p.opcoes.filter((_, i) => i !== oi),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updatePergunta(idx, { opcoes: [...p.opcoes, ""] })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar opção
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.obrigatorio}
                      onCheckedChange={(v) => updatePergunta(idx, { obrigatorio: v })}
                    />
                    <span className="text-sm">Obrigatória</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => removePergunta(idx)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button onClick={addPergunta} variant="outline" className="w-full gap-2">
        <Plus className="h-4 w-4" /> Adicionar pergunta
      </Button>
    </div>
  );
}