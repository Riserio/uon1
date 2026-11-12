import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNomesUsuarios } from "./useNomesUsuarios";

interface Comentario {
  id: string;
  autor_id: string;
  texto: string;
  created_at: string;
}

/**
 * Comentários do lead/cotação. Comenta quem enxerga o registro (o banco valida);
 * o vendedor responsável recebe notificação.
 */
export function ComentariosPanel({ entidade, entidadeId }: { entidade: "lead" | "cotacao"; entidadeId: string }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const chave = ["comercial_comentarios", entidade, entidadeId];

  const { data: comentarios = [] } = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_comentarios")
        .select("id, autor_id, texto, created_at")
        .eq("entidade", entidade)
        .eq("entidade_id", entidadeId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Comentario[];
    },
  });
  const nomes = useNomesUsuarios(comentarios.map((c) => c.autor_id));

  const enviar = useMutation({
    mutationFn: async () => {
      const t = texto.trim();
      if (!t) throw new Error("Escreva o comentário");
      const { error } = await (supabase as any)
        .from("comercial_comentarios")
        .insert({ entidade, entidade_id: entidadeId, texto: t });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border p-3 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" /> Comentários
      </p>
      {comentarios.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {comentarios.map((c) => (
            <div key={c.id} className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{nomes.get(c.autor_id) ?? "—"}</b> ·{" "}
                {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
              <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <Textarea
          rows={2}
          placeholder="Escreva um comentário para o vendedor responsável"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={4000}
        />
        <Button size="icon" onClick={() => enviar.mutate()} disabled={enviar.isPending || !texto.trim()} title="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
