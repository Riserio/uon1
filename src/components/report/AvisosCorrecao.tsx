import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Popup de validação de correção.
 *
 * Fluxo: quando um chamado passa para "resolvido", quem o reportou vê este
 * aviso ao entrar no sistema.
 *   - "Erro corrigido"  -> arquiva o chamado na hora e não volta a perguntar.
 *   - "Vou verificar"   -> fecha e reaparece no dia seguinte, e assim por
 *                          diante, até o usuário confirmar.
 *   - "O erro persiste" -> reabre o chamado e sinaliza na tela de Reportar
 *                          Problemas que a correção foi reprovada.
 *
 * Várias correções ao mesmo tempo são tratadas como fila: mostra uma por vez
 * com contador ("1 de 3") e avança conforme o usuário responde.
 *
 * A decisão de qual chamado exibir mora no banco (bug_reports_avisos), não
 * aqui — assim a regra de "volta amanhã" não depende do relógio do navegador.
 */

type Aviso = {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string | null;
  resolvido_em: string | null;
  vezes_adiado: number;
};

export default function AvisosCorrecao() {
  const [fila, setFila] = useState<Aviso[]>([]);
  const [indice, setIndice] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("bug_reports_avisos");
    if (error) return; // silencioso: aviso não pode atrapalhar o uso do sistema
    const lista = (data ?? []) as Aviso[];
    setFila(lista);
    setIndice(0);
  }, []);

  useEffect(() => {
    // Espera a sessão existir — a RPC filtra por auth.uid().
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) carregar();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "SIGNED_IN" && sessao) carregar();
    });
    return () => sub.subscription.unsubscribe();
  }, [carregar]);

  const atual = fila[indice];
  if (!atual) return null;

  const avancar = () => {
    if (indice + 1 < fila.length) setIndice(indice + 1);
    else setFila([]);
  };

  const responder = async (acao: "corrigido" | "adiar" | "persiste") => {
    setEnviando(true);
    try {
      if (acao === "adiar") {
        const { error } = await supabase.rpc("bug_report_adiar", { p_id: atual.id });
        if (error) throw error;
        toast.info("Combinado — perguntamos de novo amanhã.");
      } else {
        const { error } = await supabase.rpc("bug_report_validar", {
          p_id: atual.id,
          p_ok: acao === "corrigido",
          p_comentario: null,
        });
        if (error) throw error;
        toast.success(
          acao === "corrigido"
            ? atual.protocolo + " arquivado. Obrigado por confirmar."
            : atual.protocolo + " reaberto. Vamos olhar de novo.",
        );
      }
      avancar();
    } catch {
      toast.error("Não foi possível registrar sua resposta. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const resolvidoEm = atual.resolvido_em
    ? new Date(atual.resolvido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    : null;

  return (
    <Dialog open onOpenChange={() => { /* exige uma escolha; não fecha no clique fora */ }}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className="font-mono text-[11px]">{atual.protocolo}</Badge>
            {fila.length > 1 && (
              <Badge variant="secondary" className="text-[11px]">
                {indice + 1} de {fila.length}
              </Badge>
            )}
            {atual.vezes_adiado > 0 && (
              <Badge variant="secondary" className="text-[11px] gap-1">
                <Clock className="h-3 w-3" />
                {atual.vezes_adiado}º lembrete
              </Badge>
            )}
          </div>
          <DialogTitle className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Corrigimos o que você reportou</span>
          </DialogTitle>
          <DialogDescription className="pt-1">
            {resolvidoEm ? "Marcado como corrigido em " + resolvidoEm + ". " : ""}
            Dá uma conferida e nos diga se resolveu de verdade.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-1.5">
          <p className="text-sm font-medium">{atual.titulo}</p>
          {atual.descricao && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
              {atual.descricao}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={enviando}
            onClick={() => responder("persiste")}
            className="sm:mr-auto text-muted-foreground hover:text-destructive gap-1.5"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            O erro persiste
          </Button>
          <Button variant="outline" disabled={enviando} onClick={() => responder("adiar")}>
            Vou verificar
          </Button>
          <Button disabled={enviando} onClick={() => responder("corrigido")} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Erro corrigido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
