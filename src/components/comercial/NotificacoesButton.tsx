import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComercialNotificacao {
  id: string;
  tipo: string;
  entidade: "lead" | "cotacao";
  entidade_id: string;
  titulo: string;
  texto: string | null;
  lida_em: string | null;
  created_at: string;
}

/** Avisos do Comercial: comentários nos meus registros, pedidos de cancelamento etc. */
export function NotificacoesButton({ onAbrir }: { onAbrir: (n: ComercialNotificacao) => void }) {
  const qc = useQueryClient();
  const { data: itens = [] } = useQuery({
    queryKey: ["comercial_notificacoes"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_notificacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as ComercialNotificacao[];
    },
  });
  const naoLidas = itens.filter((n) => !n.lida_em);

  const marcar = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await (supabase as any)
        .from("comercial_notificacoes")
        .update({ lida_em: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comercial_notificacoes"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" title="Notificações">
          <Bell className="h-4 w-4" />
          {naoLidas.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground flex items-center justify-center px-1">
              {naoLidas.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-semibold">Notificações</p>
          {naoLidas.length > 0 && (
            <button type="button" className="text-xs text-primary" onClick={() => marcar.mutate(naoLidas.map((n) => n.id))}>
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y">
          {itens.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma notificação.</p>}
          {itens.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.lida_em) marcar.mutate([n.id]);
                onAbrir(n);
              }}
              className={`w-full text-left px-3 py-2 hover:bg-muted/50 ${n.lida_em ? "opacity-70" : ""}`}
            >
              <p className="text-sm font-medium leading-tight">{n.titulo}</p>
              {n.texto && <p className="text-xs text-muted-foreground line-clamp-2">{n.texto}</p>}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(n.created_at), { locale: ptBR, addSuffix: true })}
              </p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
