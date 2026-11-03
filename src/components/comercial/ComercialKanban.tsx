import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { ChevronDown, MessageCircle, QrCode, Share2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KanbanColumn } from "@/components/KanbanColumn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ComercialEtapa, ComercialLead, ComercialVendedor } from "./types";
import { linkWhatsapp } from "./utils";

const POR_PAGINA = 15;

interface Props {
  funilId: string;
  etapas: ComercialEtapa[];
  leads: ComercialLead[];
  vendedores: ComercialVendedor[];
  onAbrir: (lead: ComercialLead, etapaId?: string) => void;
}

export function ComercialKanban({ funilId, etapas, leads, vendedores, onAbrir }: Props) {
  const qc = useQueryClient();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState<Record<string, number>>({});
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const chave = ["comercial_leads", funilId];

  const mover = useMutation({
    mutationFn: async ({ id, etapaId }: { id: string; etapaId: string }) => {
      const { error } = await (supabase as any).from("comercial_leads").update({ etapa_id: etapaId }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, etapaId }) => {
      await qc.cancelQueries({ queryKey: chave });
      const anterior = qc.getQueryData<ComercialLead[]>(chave);
      qc.setQueryData<ComercialLead[]>(chave, (old) =>
        (old ?? []).map((l) => (l.id === id ? { ...l, etapa_id: etapaId, etapa_alterada_em: new Date().toISOString() } : l)),
      );
      return { anterior };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chave, ctx.anterior);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chave }),
  });

  const soltar = (etapa: ComercialEtapa) => {
    const lead = leads.find((l) => l.id === arrastando);
    setArrastando(null);
    if (!lead || lead.etapa_id === etapa.id) return;
    // Cancelamento pede motivo: abre o lead já na etapa de destino.
    if (etapa.tipo === "perdido") {
      onAbrir(lead, etapa.id);
      return;
    }
    mover.mutate({ id: lead.id, etapaId: etapa.id });
  };

  const rolar = etapas.length > 4;

  return (
    <ScrollArea className="w-full">
      <div
        className={cn("flex gap-4", rolar ? "min-w-max pb-4" : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4")}
        style={rolar ? { minWidth: `${etapas.length * 300}px` } : {}}
      >
        {etapas.map((etapa) => {
          const daEtapa = leads
            .filter((l) => l.etapa_id === etapa.id)
            .sort((a, b) => +new Date(b.etapa_alterada_em) - +new Date(a.etapa_alterada_em));
          const limite = visiveis[etapa.id] ?? POR_PAGINA;
          return (
            <div key={etapa.id} className={cn(rolar ? "w-[300px] flex-shrink-0" : "min-w-0")}>
              <KanbanColumn title={etapa.nome} count={daEtapa.length} color={etapa.cor} onDrop={() => soltar(etapa)}>
                {daEtapa.slice(0, limite).map((lead) => {
                  const dias = differenceInDays(new Date(), new Date(lead.etapa_alterada_em));
                  const zap = linkWhatsapp(lead.whatsapp);
                  const vendedor = lead.vendedor_id ? nomeVendedor.get(lead.vendedor_id) : null;
                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setArrastando(lead.id)}
                      onDragEnd={() => setArrastando(null)}
                      onClick={() => onAbrir(lead)}
                      className={cn(
                        "rounded-xl border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition space-y-2",
                        arrastando === lead.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">{lead.nome}</p>
                          {(lead.associacao || lead.cargo) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[lead.associacao, lead.cargo].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        {zap && (
                          <a
                            href={zap}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded-lg p-1.5 hover:bg-green-500/10"
                            title="Abrir conversa no WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4 text-green-600" />
                          </a>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {lead.produto && (
                          <Badge variant="secondary" className="text-[11px] font-medium">
                            {lead.produto}
                          </Badge>
                        )}
                        {lead.indicacao_externa && (
                          <Badge variant="outline" className="text-[11px] font-medium gap-1">
                            <Share2 className="h-3 w-3" /> {lead.indicador_nome || "Indicação"}
                          </Badge>
                        )}
                      </div>
                      {etapa.tipo === "perdido" && lead.motivo_perda && (
                        <p className="text-xs text-destructive line-clamp-2">{lead.motivo_perda}</p>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 truncate">
                          <User className="h-3 w-3 shrink-0" /> {vendedor || "Sem vendedor"}
                          {lead.origem === "qrcode" && <QrCode className="h-3 w-3 shrink-0 ml-1" />}
                        </span>
                        <span className="tabular-nums shrink-0">{dias === 0 ? "hoje" : `${dias}d na etapa`}</span>
                      </div>
                    </div>
                  );
                })}
                {daEtapa.length > limite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground"
                    onClick={() => setVisiveis((v) => ({ ...v, [etapa.id]: limite + POR_PAGINA }))}
                  >
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Carregar mais ({daEtapa.length - limite} restantes)
                  </Button>
                )}
              </KanbanColumn>
            </div>
          );
        })}
      </div>
      {rolar && <ScrollBar orientation="horizontal" />}
    </ScrollArea>
  );
}
