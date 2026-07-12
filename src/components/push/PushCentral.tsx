import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Send, Settings, History, Users, MapPin, Building2, Loader2, CheckCircle2, XCircle, Globe, Image as ImageIcon, Clock, BookmarkPlus, LayoutTemplate, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Corretora = { id: string; nome: string; estado: string | null; cidade: string | null };
type Envio = {
  id: string; titulo: string; mensagem: string; segmento: string;
  destinatarios: number | null; status: string; erro: string | null; created_at: string;
  send_after?: string | null;
};
type Template = {
  id: string; nome: string; titulo: string; mensagem: string;
  url: string | null; imagem_url: string | null;
};

const SEGMENTO_LABEL: Record<string, string> = {
  geral: "Envio geral",
  associacao: "Por associação",
  localizacao: "Por localização",
  tipo: "Por tipo de usuário",
};

// NOVO: extrai a mensagem de erro de qualquer formato de exceção que possa
// chegar aqui - erros "de verdade" (instanceof Error), erros do PostgREST/
// Supabase (objetos com .message mas que nem sempre são instância de Error
// dependendo da versão do SDK) e, por último, qualquer objeto com .message.
// Antes, qualquer coisa que não fosse "instanceof Error" caía no texto
// genérico "Erro ao enviar push", escondendo a causa real (ex.: a exceção
// que a função enviar_push_onesignal no Postgres levanta com RAISE
// EXCEPTION, que chega aqui como PostgrestError).
function mensagemDeErro(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}

export default function PushCentral() {
  // ----- Config -----
  const [appId, setAppId] = useState("");
  const [restKey, setRestKey] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // ----- Composer -----
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [url, setUrl] = useState("");
  const [imagemUrl, setImagemUrl] = useState("");
  const [agendarPara, setAgendarPara] = useState("");
  const [segmento, setSegmento] = useState<"geral" | "associacao" | "localizacao" | "tipo">("geral");
  const [corretoraIds, setCorretoraIds] = useState<string[]>([]);
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipos, setTipos] = useState<string[]>(["parceiro"]);
  const [enviando, setEnviando] = useState(false);

  // ----- Dados auxiliares -----
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [nomeTemplate, setNomeTemplate] = useState("");
  const [salvandoTemplate, setSalvandoTemplate] = useState(false);

  const estados = useMemo(
    () => [...new Set(corretoras.map((c) => (c.estado || "").toUpperCase()).filter(Boolean))].sort(),
    [corretoras],
  );
  const cidades = useMemo(
    () =>
      [...new Set(
        corretoras
          .filter((c) => !estado || (c.estado || "").toUpperCase() === estado)
          .map((c) => c.cidade || "")
          .filter(Boolean),
      )].sort(),
    [corretoras, estado],
  );

  const loadEnvios = async () => {
    const { data } = await supabase
      .from("push_envios" as never)
      .select("id, titulo, mensagem, segmento, destinatarios, status, erro, created_at, send_after")
      .order("created_at", { ascending: false })
      .limit(20);
    setEnvios((data as unknown as Envio[]) || []);
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("push_templates" as never)
      .select("id, nome, titulo, mensagem, url, imagem_url")
      .order("nome");
    setTemplates((data as unknown as Template[]) || []);
  };

  useEffect(() => {
    (async () => {
      const [{ data: cfg }, { data: corrs }] = await Promise.all([
        supabase.from("push_config" as never).select("*").eq("id", "global").maybeSingle(),
        supabase.from("corretoras").select("id, nome, estado, cidade").order("nome"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = cfg as any;
      if (c) {
        setAppId(c.onesignal_app_id || "");
        setRestKey(c.onesignal_rest_api_key || "");
        setAtivo(!!c.ativo);
      }
      setCorretoras((corrs as Corretora[]) || []);
      setConfigLoaded(true);
      loadEnvios();
      loadTemplates();
    })();
  }, []);

  const aplicarTemplate = (t: Template) => {
    setTitulo(t.titulo);
    setMensagem(t.mensagem);
    setUrl(t.url || "");
    setImagemUrl(t.imagem_url || "");
    toast.success(`Gabarito "${t.nome}" aplicado`);
  };

  const salvarTemplate = async () => {
    if (!titulo.trim() || !mensagem.trim()) {
      toast.error("Preencha título e mensagem antes de salvar o gabarito");
      return;
    }
    if (!nomeTemplate.trim()) {
      toast.error("Dê um nome ao gabarito");
      return;
    }
    setSalvandoTemplate(true);
    try {
      const { error } = await supabase.from("push_templates" as never).insert({
        nome: nomeTemplate.trim(),
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        url: url.trim() || null,
        imagem_url: imagemUrl.trim() || null,
      } as never);
      if (error) throw error;
      toast.success("Gabarito salvo");
      setNomeTemplate("");
      loadTemplates();
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e, "Erro ao salvar gabarito"));
    } finally {
      setSalvandoTemplate(false);
    }
  };

  const excluirTemplate = async (id: string) => {
    await supabase.from("push_templates" as never).delete().eq("id", id);
    loadTemplates();
  };

  const salvarConfig = async () => {
    setSavingConfig(true);
    try {
      const { error } = await supabase.from("push_config" as never).upsert({
        id: "global",
        onesignal_app_id: appId.trim() || null,
        onesignal_rest_api_key: restKey.trim() || null,
        ativo,
        updated_at: new Date().toISOString(),
      } as never);
      if (error) throw error;
      toast.success("Configuração do OneSignal salva");
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e, "Erro ao salvar configuração"));
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleCorretora = (id: string) => {
    setCorretoraIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const enviar = async () => {
    if (!titulo.trim() || !mensagem.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    setEnviando(true);
    try {
      // RPC no Postgres (extensions.http) — dispensa deploy de edge function
      const { data, error } = await supabase.rpc("enviar_push_onesignal" as never, {
        p_titulo: titulo.trim(),
        p_mensagem: mensagem.trim(),
        p_url: url.trim() || null,
        p_imagem_url: imagemUrl.trim() || null,
        p_send_after: agendarPara ? new Date(agendarPara).toISOString() : null,
        p_segmento: segmento,
        p_corretora_ids: segmento === "associacao" ? corretoraIds : null,
        p_estados: segmento === "localizacao" && estado ? [estado] : null,
        p_cidades: segmento === "localizacao" && cidade ? [cidade] : null,
        p_tipos: segmento === "tipo" ? tipos : null,
      } as never);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = data as any;
      if (!res?.success) throw new Error(res?.error || "Falha no envio");
      toast.success(
        agendarPara
          ? "Push agendado com sucesso"
          : res.destinatarios != null
            ? `Push enviado para ${res.destinatarios} dispositivo(s)`
            : "Push enviado",
      );
      setTitulo(""); setMensagem(""); setUrl(""); setImagemUrl(""); setAgendarPara("");
      loadEnvios();
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e, "Erro ao enviar push"));
    } finally {
      setEnviando(false);
    }
  };

  const configOk = ativo && appId.trim() && restKey.trim();

  return (
    <div className="space-y-4">
      {/* Configuração OneSignal */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-primary" />
            Configuração OneSignal
          </CardTitle>
          <CardDescription>
            Crie um app em onesignal.com (Web Push), informe o App ID e a REST API Key e ative o serviço.
            Os parceiros passam a receber o convite de inscrição ao abrir o portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="push-appid">App ID</Label>
              <Input id="push-appid" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-restkey">REST API Key</Label>
              <Input id="push-restkey" type="password" value={restKey} onChange={(e) => setRestKey(e.target.value)} placeholder="os_v2_app_..." />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} id="push-ativo" />
              <Label htmlFor="push-ativo">Push ativo</Label>
              {configLoaded && (
                configOk
                  ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Configurado</Badge>
                  : <Badge variant="outline" className="text-muted-foreground">Pendente</Badge>
              )}
            </div>
            <Button onClick={salvarConfig} disabled={savingConfig} size="sm">
              {savingConfig && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Composer */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Novo envio
            </CardTitle>
            {templates.length > 0 && (
              <Select onValueChange={(id) => { const t = templates.find((x) => x.id === id); if (t) aplicarTemplate(t); }}>
                <SelectTrigger className="w-full sm:w-56 h-8 text-xs">
                  <span className="flex items-center gap-1.5"><LayoutTemplate className="h-3.5 w-3.5" /><SelectValue placeholder="Usar gabarito..." /></span>
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="push-titulo">Título</Label>
              <Input id="push-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Ex.: Novo comunicado da Vangard" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-url">URL ao tocar (opcional)</Label>
              <Input id="push-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://vangard.uon1.com.br/portal" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="push-msg">Mensagem</Label>
            <Textarea id="push-msg" value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={300} rows={3} placeholder="Texto da notificação..." />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="push-img" className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Imagem (URL, opcional)</Label>
              <Input id="push-img" value={imagemUrl} onChange={(e) => setImagemUrl(e.target.value)} placeholder="https://.../banner.png" />
              {imagemUrl.trim() && (
                <img src={imagemUrl.trim()} alt="Prévia da imagem" className="mt-1 h-20 rounded-lg border border-border/50 object-cover" onError={(ev) => ((ev.target as HTMLImageElement).style.display = 'none')} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-agendar" className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Programar envio (opcional)</Label>
              <Input id="push-agendar" type="datetime-local" value={agendarPara} onChange={(e) => setAgendarPara(e.target.value)} min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)} />
              <p className="text-[11px] text-muted-foreground">Vazio = envia agora. Com data/hora, o OneSignal dispara no horário programado.</p>
            </div>
          </div>

          {/* Segmentação */}
          <div className="space-y-2">
            <Label>Destinatários</Label>
            <RadioGroup value={segmento} onValueChange={(v) => setSegmento(v as typeof segmento)} className="grid gap-2 md:grid-cols-4">
              {[
                { v: "geral", label: "Envio geral", icon: Globe, desc: "Todos os inscritos" },
                { v: "associacao", label: "Associação", icon: Building2, desc: "Uma ou mais associações" },
                { v: "localizacao", label: "Localização", icon: MapPin, desc: "Estado / cidade" },
                { v: "tipo", label: "Tipo", icon: Users, desc: "Parceiro ou interno" },
              ].map(({ v, label, icon: Icon, desc }) => (
                <label
                  key={v}
                  className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${segmento === v ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40"}`}
                >
                  <RadioGroupItem value={v} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="h-3.5 w-3.5" />{label}</span>
                    <span className="block text-xs text-muted-foreground">{desc}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {segmento === "associacao" && (
            <div className="space-y-2">
              <Label>Associações ({corretoraIds.length} selecionada{corretoraIds.length === 1 ? "" : "s"})</Label>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border/50 p-2 grid gap-1 sm:grid-cols-2">
                {corretoras.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer text-sm">
                    <Checkbox checked={corretoraIds.includes(c.id)} onCheckedChange={() => toggleCorretora(c.id)} />
                    <span className="truncate">{c.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {segmento === "localizacao" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Estado (UF)</Label>
                <Select value={estado || "todos"} onValueChange={(v) => { setEstado(v === "todos" ? "" : v); setCidade(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {estados.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cidade (opcional)</Label>
                <Select value={cidade || "todas"} onValueChange={(v) => setCidade(v === "todas" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {cidades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {segmento === "tipo" && (
            <div className="flex gap-4">
              {[
                { v: "parceiro", label: "Parceiros (portal)" },
                { v: "interno", label: "Usuários internos" },
              ].map(({ v, label }) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={tipos.includes(v)}
                    onCheckedChange={() =>
                      setTipos((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between border-t border-border/40 pt-3">
            <div className="flex items-center gap-2">
              <Input
                value={nomeTemplate}
                onChange={(e) => setNomeTemplate(e.target.value)}
                placeholder="Nome do gabarito..."
                className="h-8 w-44 text-xs"
              />
              <Button variant="outline" size="sm" onClick={salvarTemplate} disabled={salvandoTemplate} className="gap-1.5">
                {salvandoTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                Salvar gabarito
              </Button>
            </div>
            <Button onClick={enviar} disabled={enviando || !configOk} className="gap-2">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : agendarPara ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {agendarPara ? "Agendar push" : "Enviar push"}
            </Button>
          </div>
          {!configOk && configLoaded && (
            <p className="text-xs text-muted-foreground text-right">Configure e ative o OneSignal acima para habilitar o envio.</p>
          )}

          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[11px]">
                  <button onClick={() => aplicarTemplate(t)} className="hover:text-primary">{t.nome}</button>
                  <button onClick={() => excluirTemplate(t.id)} aria-label={`Excluir gabarito ${t.nome}`} className="text-muted-foreground/50 hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Histórico de envios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {envios.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum envio realizado ainda.</p>
          ) : (
            <div className="space-y-2">
              {envios.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-xl border border-border/40 p-3">
                  {e.status === "enviado"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    : e.status === "agendado"
                      ? <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.mensagem}</p>
                    {e.erro && <p className="text-xs text-red-600 truncate">{e.erro}</p>}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <Badge variant="outline" className="text-[10px]">{SEGMENTO_LABEL[e.segmento] || e.segmento}</Badge>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}
                      {e.destinatarios != null && ` · ${e.destinatarios} disp.`}
                      {e.send_after && ` · agendado p/ ${format(new Date(e.send_after), "dd/MM HH:mm")}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
