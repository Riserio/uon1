import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Archive, ArchiveRestore, Save, Loader2, FileText, Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Anexo { nome: string; path: string; tamanho: number; tipo: string }
interface Relato {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  severidade: string;
  status: string;
  url: string | null;
  created_at: string;
  updated_at: string;
  previsao_entrega: string | null;
  arquivado: boolean;
  resolvido_em: string | null;
  diagnostico: any;
  anexos: Anexo[] | any;
}

interface Props {
  relato: Relato | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

const STATUS_OPTS = [
  { v: "aberto",      l: "Aberto" },
  { v: "em_analise",  l: "Em análise" },
  { v: "em_correcao", l: "Em correção / andamento" },
  { v: "resolvido",   l: "Resolvido / concluído" },
  { v: "fechado",     l: "Fechado" },
];

export function RelatoDetailDialog({ relato, open, onOpenChange, onSaved }: Props) {
  const [status, setStatus] = useState("aberto");
  const [previsao, setPrevisao] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [anexosUrls, setAnexosUrls] = useState<{ nome: string; url: string; tipo: string }[]>([]);

  useEffect(() => {
    if (!relato) return;
    setStatus(relato.status || "aberto");
    setPrevisao(relato.previsao_entrega || "");
  }, [relato?.id]);

  useEffect(() => {
    const gerar = async () => {
      if (!relato) return setAnexosUrls([]);
      const lista = Array.isArray(relato.anexos) ? relato.anexos as Anexo[] : [];
      const out: { nome: string; url: string; tipo: string }[] = [];
      for (const a of lista) {
        const { data } = await supabase.storage.from("bug-reports").createSignedUrl(a.path, 60 * 60);
        if (data?.signedUrl) out.push({ nome: a.nome, url: data.signedUrl, tipo: a.tipo });
      }
      setAnexosUrls(out);
    };
    gerar();
  }, [relato?.id]);

  if (!relato) return null;

  const salvar = async () => {
    setSalvando(true);
    try {
      const patch: any = { status, previsao_entrega: previsao || null };
      if (status === "resolvido" && !relato.resolvido_em) patch.resolvido_em = new Date().toISOString();
      const { error } = await (supabase as any).from("bug_reports").update(patch).eq("id", relato.id);
      if (error) throw error;
      toast.success("Relato atualizado");
      onSaved();
    } catch (e: any) { toast.error(e?.message || "Falha ao salvar"); }
    finally { setSalvando(false); }
  };

  const alternarArquivo = async () => {
    setSalvando(true);
    try {
      const { error } = await (supabase as any).from("bug_reports").update({ arquivado: !relato.arquivado }).eq("id", relato.id);
      if (error) throw error;
      toast.success(relato.arquivado ? "Relato desarquivado" : "Relato arquivado");
      onSaved();
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message || "Falha"); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {relato.titulo}
            <Badge variant="outline" className="capitalize">{relato.categoria.replace("_", " ")}</Badge>
            <Badge variant="outline" className="capitalize">{relato.severidade}</Badge>
            {relato.arquivado && <Badge variant="outline" className="bg-muted">Arquivado</Badge>}
          </DialogTitle>
          <DialogDescription>
            Enviado em {new Date(relato.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <p className="text-sm whitespace-pre-wrap rounded-lg bg-muted/40 p-3">{relato.descricao}</p>
          </div>

          {relato.url && (
            <div>
              <Label className="text-xs text-muted-foreground">Página</Label>
              <a href={relato.url} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1 truncate">
                {relato.url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Evidências</Label>
            {anexosUrls.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum anexo enviado.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-1">
                {anexosUrls.map((a, i) => (
                  <div key={i} className="rounded-lg border border-border/50 overflow-hidden bg-background/60">
                    {a.tipo?.startsWith("image/") ? (
                      <a href={a.url} target="_blank" rel="noreferrer">
                        <img src={a.url} alt={a.nome} className="w-full h-32 object-cover" />
                      </a>
                    ) : a.tipo?.startsWith("video/") ? (
                      <video src={a.url} controls className="w-full h-32 object-cover bg-black" />
                    ) : (
                      <div className="p-3 flex items-center gap-2 text-sm"><FileText className="h-4 w-4" /> {a.nome}</div>
                    )}
                    <a href={a.url} target="_blank" rel="noreferrer" download={a.nome}
                       className="flex items-center gap-1 text-xs px-2 py-1 border-t border-border/50 hover:bg-muted/50">
                      <Download className="h-3 w-3" /> {a.nome}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status do reparo</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Previsão de entrega</Label>
              <Input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
            </div>
          </div>

          {relato.resolvido_em && (
            <p className="text-xs text-emerald-600">
              Concluído em {new Date(relato.resolvido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </p>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver diagnóstico técnico</summary>
            <pre className="mt-2 p-2 rounded bg-muted/40 overflow-x-auto text-[10px]">{JSON.stringify(relato.diagnostico, null, 2)}</pre>
          </details>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={alternarArquivo} disabled={salvando} className="gap-2">
            {relato.arquivado ? <><ArchiveRestore className="h-4 w-4" /> Desarquivar</> : <><Archive className="h-4 w-4" /> Arquivar</>}
          </Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}