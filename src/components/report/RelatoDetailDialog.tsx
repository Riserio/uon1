import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Archive, ArchiveRestore, Save, Loader2, FileText, Download, ExternalLink,
  Wrench, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Anexo { nome: string; path: string; tamanho: number; tipo: string }
interface Relato {
  id: string;
  protocolo: string | null;
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
  instrucao_correcao: string | null;
  aprovado_em: string | null;
  validacao: string | null;
  validacao_em: string | null;
  validacao_comentario: string | null;
  vezes_adiado: number | null;
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
  { v: "aprovado",    l: "Aprovado para correção" },
  { v: "em_correcao", l: "Em correção / andamento" },
  { v: "resolvido",   l: "Resolvido / concluído" },
  { v: "fechado",     l: "Fechado" },
];

export function RelatoDetailDialog({ relato, open, onOpenChange, onSaved }: Props) {
  const [status, setStatus] = useState("aberto");
  const [previsao, setPrevisao] = useState<string>("");
  const [instrucao, setInstrucao] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [anexosUrls, setAnexosUrls] = useState<{ nome: string; url: string; tipo: string }[]>([]);

  useEffect(() => {
    if (!relato) return;
    setStatus(relato.status || "aberto");
    setPrevisao(relato.previsao_entrega || "");
    setInstrucao(relato.instrucao_correcao || "");
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
      // resolvido_em, desarquivamento e reinício do ciclo de validação são
      // resolvidos por gatilho no banco — aqui só mandamos a intenção.
      const patch: any = {
        status,
        previsao_entrega: previsao || null,
        instrucao_correcao: instrucao.trim() || null,
      };
      const { error } = await (supabase as any).from("bug_reports").update(patch).eq("id", relato.id);
      if (error) throw error;
      toast.success(
        status === "resolvido"
          ? "Marcado como corrigido. Quem reportou será avisado no próximo acesso."
          : "Relato atualizado",
      );
      onSaved();
    } catch (e: any) { toast.error(e?.message || "Falha ao salvar"); }
    finally { setSalvando(false); }
  };

  const aprovarParaCorrecao = async () => {
    if (!instrucao.trim()) {
      toast.error("Escreva a instrução do que deve ser corrigido.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc("bug_report_aprovar", {
        p_id: relato.id, p_instrucao: instrucao.trim(),
      });
      if (error) throw error;
      setStatus("aprovado");
      toast.success((relato.protocolo ?? "Chamado") + " entrou na fila de correção.");
      onSaved();
    } catch (e: any) { toast.error(e?.message || "Falha ao aprovar"); }
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
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {relato.protocolo && (
              <Badge variant="outline" className="font-mono text-[11px]">{relato.protocolo}</Badge>
            )}
            {relato.titulo}
            <Badge variant="outline" className="capitalize">{relato.categoria.replace("_", " ")}</Badge>
            <Badge variant="outline" className="capitalize">{relato.severidade}</Badge>
            {relato.arquivado && <Badge variant="outline" className="bg-muted">Arquivado</Badge>}
          </DialogTitle>
          <DialogDescription>
            Enviado em {new Date(relato.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Resultado da validação de quem reportou */}
          {relato.validacao === "reprovado" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-600">Correção reprovada por quem reportou</p>
                <p className="text-sm text-muted-foreground">
                  {relato.validacao_comentario || "O usuário informou que o erro persiste."}
                  {relato.validacao_em && (
                    <> · {new Date(relato.validacao_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</>
                  )}
                </p>
              </div>
            </div>
          )}
          {relato.validacao === "confirmado" && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-emerald-600">Correção confirmada pelo usuário</span>
                {relato.validacao_em && (
                  <> em {new Date(relato.validacao_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</>
                )}
                . O chamado foi arquivado automaticamente.
              </p>
            </div>
          )}
          {relato.status === "resolvido" && !relato.validacao && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-start gap-2.5">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-amber-600">Aguardando o usuário confirmar.</span>{" "}
                O aviso aparece para quem reportou a cada acesso
                {(relato.vezes_adiado ?? 0) > 0 && <> — já adiado {relato.vezes_adiado}×</>}.
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <p className="text-sm whitespace-pre-wrap rounded-lg bg-muted/40 p-3 min-h-[80px]">{relato.descricao}</p>
          </div>

          <div className="space-y-3">
            {relato.url && (
              <div>
              <Label className="text-xs text-muted-foreground">Página</Label>
              <a href={relato.url} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1 break-all">
                <span className="truncate">{relato.url}</span> <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              </div>
            )}
            <div className="grid gap-3 grid-cols-2">
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
          </div>
          </div>

          {/* Comando de correção: vira fila priorizada de trabalho */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <Label className="font-semibold">Instrução de correção</Label>
              {relato.aprovado_em && (
                <Badge variant="outline" className="text-[11px]">
                  aprovado em {new Date(relato.aprovado_em).toLocaleDateString("pt-BR")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Descreva o que deve ser feito. Ao aprovar, o chamado entra na fila de correção com este texto.
            </p>
            <Textarea
              value={instrucao}
              onChange={(e) => setInstrucao(e.target.value)}
              rows={3}
              placeholder="Ex.: recalcular a inadimplência usando o critério SGA também no PDF do resumo."
            />
            <Button
              size="sm" variant="secondary" onClick={aprovarParaCorrecao}
              disabled={salvando} className="gap-1.5"
            >
              <Wrench className="h-3.5 w-3.5" /> Aprovar para correção
            </Button>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Evidências</Label>
            {anexosUrls.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum anexo enviado.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
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
                       className="flex items-center gap-1 text-xs px-2 py-1 border-t border-border/50 hover:bg-muted/50 truncate">
                      <Download className="h-3 w-3 shrink-0" /> <span className="truncate">{a.nome}</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver diagnóstico técnico</summary>
            <pre className="mt-2 p-3 rounded bg-muted/40 overflow-x-auto text-[11px] max-h-64">{JSON.stringify(relato.diagnostico, null, 2)}</pre>
          </details>
        </div>

        <DialogFooter className="gap-2 flex-wrap px-6 py-4 border-t border-border/50 shrink-0 bg-background">
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
