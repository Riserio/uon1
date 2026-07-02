import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, Send, Trash2, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function coletarDiagnostico() {
  const nav: any = typeof navigator !== "undefined" ? navigator : {};
  const scr = typeof window !== "undefined" ? window.screen : ({} as Screen);
  const perf: any = typeof performance !== "undefined" ? performance : {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  const nav2: any = nav;
  return {
    url: typeof window !== "undefined" ? window.location.href : "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    userAgent: nav.userAgent || "",
    plataforma: nav.platform || "",
    idioma: nav.language || "",
    fusoHorario: Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || "",
    viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "",
    tela: `${scr?.width || 0}x${scr?.height || 0} @${(window as any)?.devicePixelRatio || 1}x`,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    cookies: nav.cookieEnabled ?? true,
    conexao: conn?.effectiveType || null,
    memoriaDispositivo: nav2.deviceMemory || null,
    cpus: nav2.hardwareConcurrency || null,
    memoriaJs: perf?.memory ? {
      usadoMB: Math.round((perf.memory.usedJSHeapSize || 0) / 1048576),
      totalMB: Math.round((perf.memory.totalJSHeapSize || 0) / 1048576),
      limiteMB: Math.round((perf.memory.jsHeapSizeLimit || 0) / 1048576),
    } : null,
    uptimeSegundos: perf?.now ? Math.round(perf.now() / 1000) : null,
    localStorageKeys: (() => { try { return Object.keys(localStorage).length; } catch { return -1; } })(),
    timestamp: new Date().toISOString(),
  };
}

export function ReportDialog({ open, onOpenChange }: Props) {
  const { user, userRole } = useAuth();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("bug");
  const [severidade, setSeveridade] = useState("media");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);

  const reset = () => {
    setTitulo(""); setDescricao(""); setCategoria("bug"); setSeveridade("media"); setArquivos([]);
  };

  const enviar = async () => {
    if (!titulo.trim() || !descricao.trim()) {
      toast.error("Preencha o título e a descrição");
      return;
    }
    if (!user) {
      toast.error("Faça login para reportar problemas");
      return;
    }
    setEnviando(true);
    try {
      const diagnostico = coletarDiagnostico();
      const { data: created, error } = await (supabase as any)
        .from("bug_reports")
        .insert({
          user_id: user.id,
          user_email: user.email,
          user_role: userRole,
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          categoria,
          severidade,
          url: diagnostico.url,
          diagnostico,
          anexos: [],
        })
        .select("id")
        .single();
      if (error || !created) throw error || new Error("Falha ao criar relato");

      const anexos: { nome: string; path: string; tamanho: number; tipo: string }[] = [];
      for (const file of arquivos) {
        const path = `${user.id}/${created.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("bug-reports").upload(path, file, { upsert: false });
        if (upErr) {
          console.warn("Falha ao enviar anexo:", upErr.message);
          continue;
        }
        anexos.push({ nome: file.name, path, tamanho: file.size, tipo: file.type });
      }
      if (anexos.length) {
        await (supabase as any).from("bug_reports").update({ anexos }).eq("id", created.id);
      }
      toast.success("Relato enviado. Obrigado por reportar!");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Não foi possível enviar o relato");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Reportar problema
          </DialogTitle>
          <DialogDescription>
            Descreva o bug ou dificuldade. Vamos anexar automaticamente informações técnicas do seu dispositivo para agilizar o reparo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug / erro</SelectItem>
                  <SelectItem value="ui">Interface</SelectItem>
                  <SelectItem value="lentidao">Lentidão</SelectItem>
                  <SelectItem value="dado_incorreto">Dado incorreto</SelectItem>
                  <SelectItem value="sugestao">Sugestão</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severidade</Label>
              <Select value={severidade} onValueChange={setSeveridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica – bloqueia o uso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Resumo curto do problema" maxLength={140} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que aconteceu? Passos para reproduzir, resultado esperado e resultado obtido."
              rows={5}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Evidências (imagens, vídeos, arquivos)</Label>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-dashed cursor-pointer hover:bg-accent">
                <Paperclip className="h-4 w-4" />
                Anexar arquivos
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,video/*,application/pdf,.txt,.log,.json"
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    setArquivos((prev) => [...prev, ...list]);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {arquivos.length > 0 && (
              <ul className="text-xs space-y-1 pt-1">
                {arquivos.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
                    <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                    <button
                      type="button"
                      onClick={() => setArquivos((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Um diagnóstico automático (navegador, sistema, resolução, conexão, uso de memória e página atual) será enviado junto para agilizar o reparo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando} className="gap-2">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {enviando ? "Enviando..." : "Enviar relato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}