import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { enviarTesteNewsletter, resumoNewsletter } from "@/lib/radar/newsletter";

const STATUS: Record<string, string> = {
  ok: "enviado",
  sem_novidades: "sem novidades",
  falhou: "falhou",
  executando: "em andamento",
};

/** Administração: quantos assinam a newsletter do Radar e envio de teste. Só busca ao abrir. */
export function NewsletterAdmin() {
  const [aberto, setAberto] = useState(false);
  const q = useQuery({ queryKey: ["radar_newsletter_resumo"], queryFn: resumoNewsletter, enabled: aberto, staleTime: 30 * 60_000 });
  const teste = useMutation({
    mutationFn: enviarTesteNewsletter,
    onSuccess: (r) => (r.ok ? toast.success(`E-mail de teste enviado para ${r.email}`) : toast.error(r.erro ?? "Não foi possível enviar o teste")),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível enviar o teste"),
  });
  const u = q.data?.ultimoEnvio;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs px-3" title="Newsletter do Radar">
          <Mail className="h-3.5 w-3.5 mr-1" /> Newsletter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Newsletter do Radar</p>
        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : q.data ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Ativos", q.data.ativos],
                ["Aguardando", q.data.pendentes],
                ["Cancelados", q.data.cancelados],
              ].map(([r, n]) => (
                <div key={r} className="rounded-xl bg-muted/60 p-2">
                  <div className="font-serif text-xl font-semibold tabular-nums">{n}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{r}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {u
                ? `Último envio ${formatDistanceToNow(parseISO(u.iniciado_em), { addSuffix: true, locale: ptBR })}: ${STATUS[u.status] ?? u.status}${
                    u.status === "ok" ? `, ${u.noticias} matérias para ${u.enviados} pessoas` : ""
                  }${u.falhas ? `, ${u.falhas} falhas` : ""}.`
                : "Ainda não houve envio. As novidades saem todo dia às 7h15, quando há matéria nova."}
            </p>
          </>
        ) : null}
        <Button size="sm" variant="outline" className="w-full rounded-xl" disabled={teste.isPending} onClick={() => teste.mutate()}>
          {teste.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Enviar teste para meu e-mail
        </Button>
      </PopoverContent>
    </Popover>
  );
}
