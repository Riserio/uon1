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
import { Bell, Send, Settings, History, Users, MapPin, Building2, Loader2, CheckCircle2, XCircle, Globe } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Corretora = { id: string; nome: string; estado: string | null; cidade: string | null };
type Envio = {
  id: string; titulo: string; mensagem: string; segmento: string;
  destinatarios: number | null; status: string; erro: string | null; created_at: string;
};

const SEGMENTO_LABEL: Record<string, string> = {
  geral: "Envio geral",
  associacao: "Por associação",
  localizacao: "Por localização",
  tipo: "Por tipo de usuário",
};

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
  const [segmento, setSegmento] = useState<"geral" | "associacao" | "localizacao" | "tipo">("geral");
  const [corretoraIds, setCorretoraIds] = useState<string[]>([]);
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipos, setTipos] = useState<string[]>(["parceiro"]);
  const [enviando, setEnviando] = useState(false);

  // ----- Dados auxiliares -----
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);

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
      .select("id, titulo, mensagem, segmento, destinatarios, status, erro, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setEnvios((data as unknown as Envio[]) || []);
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
    })();
  }, []);

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
      toast.error(e instanceof Error ? e.message : "Erro ao salvar configuração");
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
      const { data, error } = await supabase.functions.invoke("enviar-push-onesignal", {
        body: {
          titulo: titulo.trim(),
          mensagem: mensagem.trim(),
          url: url.trim() || undefined,
          segmento,
          corretora_ids: segmento === "associacao" ? corretoraIds : undefined,
          estados: segmento === "localizacao" && estado ? [estado] : undefined,
          cidades: segmento === "localizacao" && cidade ? [cidade] : undefined,
          tipos: segmento === "tipo" ? tipos : undefined,
        },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = data as any;
      if (!res?.success) throw new Error(res?.error || "Falha no envio");
      toast.success(
        res.destinatarios != null
          ? `Push enviado para ${res.destinatarios} dispositivo(s)`
          : "Push enviado",
      );
      setTitulo(""); setMensagem(""); setUrl("");
      loadEnvios();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar push");
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
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" />
            Novo envio
          </CardTitle>
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

          <div className="flex justify-end">
            <Button onClick={enviar} disabled={enviando || !configOk} className="gap-2">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar push
            </Button>
          </div>
          {!configOk && configLoaded && (
            <p className="text-xs text-muted-foreground text-right">Configure e ative o OneSignal acima para habilitar o envio.</p>
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
