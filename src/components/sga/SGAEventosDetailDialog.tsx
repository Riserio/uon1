import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Car, DollarSign, Calendar, MapPin, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// NOTE (escalabilidade): este dialog não recebe mais o array cru de
// eventos (o Dashboard já não carrega isso no navegador). Ao abrir, busca
// diretamente via `listar_eventos_por_filtro` — a lógica de qual campo
// cada `filterType` compara já está implementada dentro da RPC (replica
// o switch que existia neste componente). O resultado vem limitado a
// `p_limit` linhas (500), mas `totalCount`/`totalCusto`/`totalReparo`
// refletem TODAS as linhas que batem com o filtro.
interface SGAEventosDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  filterType: string;
  filterValue: string;
  corretoraId: string;
  status: string;
  dataInicio: string;
  dataFim: string;
  regional: string;
  cooperativa: string;
  tipoVeiculo: string;
}

const RESULT_LIMIT = 500;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR");
};

const toRpcFilterValue = (value: string) => (!value || value === "todos" ? null : value);

export default function SGAEventosDetailDialog({
  open,
  onOpenChange,
  title,
  filterType,
  filterValue,
  corretoraId,
  status,
  dataInicio,
  dataFim,
  regional,
  cooperativa,
  tipoVeiculo,
}: SGAEventosDetailDialogProps) {
  const [searchPlaca, setSearchPlaca] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState({ count: 0, custoTotal: 0, reparoTotal: 0 });
  const [loading, setLoading] = useState(false);
  const fetchIdRef = useRef(0);

  // Reseta a busca sempre que o dialog é reaberto para um novo filtro
  useEffect(() => {
    if (open) {
      setSearchPlaca("");
      setDebouncedSearch("");
    }
  }, [open, filterType, filterValue]);

  // Debounce da busca por placa/modelo (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchPlaca), 300);
    return () => clearTimeout(timer);
  }, [searchPlaca]);

  useEffect(() => {
    if (!open || !corretoraId || !filterType) {
      return;
    }

    const myFetchId = ++fetchIdRef.current;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.rpc("listar_eventos_por_filtro", {
          p_corretora_id: corretoraId,
          p_status: status,
          p_data_inicio: dataInicio || null,
          p_data_fim: dataFim || null,
          p_regional: toRpcFilterValue(regional),
          p_cooperativa: toRpcFilterValue(cooperativa),
          p_tipo_veiculo: toRpcFilterValue(tipoVeiculo),
          p_filter_type: filterType,
          p_filter_value: filterValue,
          p_search: debouncedSearch || null,
          p_limit: RESULT_LIMIT,
        } as any);

        if (myFetchId !== fetchIdRef.current) return;
        if (error) throw error;

        const result = (data as any) || {};
        setRows(result.rows || []);
        setTotals({
          count: result.totalCount || 0,
          custoTotal: result.totalCusto || 0,
          reparoTotal: result.totalReparo || 0,
        });
      } catch (error) {
        console.error("Erro ao carregar detalhes do evento:", error);
        if (myFetchId === fetchIdRef.current) {
          toast.error("Erro ao carregar os veículos deste filtro. Tente novamente.");
        }
      } finally {
        if (myFetchId === fetchIdRef.current) setLoading(false);
      }
    })();
  }, [open, corretoraId, status, dataInicio, dataFim, regional, cooperativa, tipoVeiculo, filterType, filterValue, debouncedSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Search and Summary */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por placa ou modelo..."
                value={searchPlaca}
                onChange={(e) => setSearchPlaca(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-sm">
                {totals.count} veículo{totals.count !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="secondary" className="text-sm">
                Custo: {formatCurrency(totals.custoTotal)}
              </Badge>
              <Badge
                variant="secondary"
                className="text-sm bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              >
                Reparo: {formatCurrency(totals.reparoTotal)}
              </Badge>
            </div>
          </div>

          {totals.count > rows.length && (
            <p className="text-xs text-muted-foreground -mt-2 flex-shrink-0">
              Mostrando os {rows.length.toLocaleString("pt-BR")} primeiros de {totals.count.toLocaleString("pt-BR")} veículos. Refine a busca para reduzir o resultado.
            </p>
          )}

          {/* Vehicle List */}
          <ScrollArea className="flex-1 min-h-0 h-full pr-4">
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Car className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nenhum veículo encontrado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((evento, index) => {
                  const estadoExibicao = evento.evento_estado || evento.associado_estado;
                  return (
                  <div
                    key={evento.id || index}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      {/* Left: Vehicle Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="default"
                            className="font-mono text-sm"
                          >
                            {evento.placa || "SEM PLACA"}
                          </Badge>
                          <span className="text-sm font-medium">
                            {evento.modelo_veiculo || "-"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{formatDate(evento.data_evento)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{evento.evento_cidade || "-"}</span>
                            {estadoExibicao && (
                              <span className="text-xs">
                                ({estadoExibicao})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            <span className="truncate">
                              {evento.cooperativa || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {evento.situacao_evento && (
                            <Badge variant="outline" className="text-xs">
                              {evento.situacao_evento}
                            </Badge>
                          )}
                          {evento.motivo_evento && (
                            <Badge variant="outline" className="text-xs">
                              {evento.motivo_evento}
                            </Badge>
                          )}
                          {evento.tipo_evento && (
                            <Badge variant="outline" className="text-xs">
                              {evento.tipo_evento}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Right: Costs */}
                      <div className="flex sm:flex-col gap-3 sm:gap-1 sm:items-end sm:min-w-[140px]">
                        <div className="flex items-center gap-1.5 text-sm">
                          <DollarSign className="h-3.5 w-3.5 text-orange-500" />
                          <span className="text-muted-foreground">Custo:</span>
                          <span className="font-semibold">
                            {formatCurrency(evento.custo_evento || 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          <DollarSign className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-muted-foreground">Reparo:</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(evento.valor_reparo || 0)}
                          </span>
                        </div>
                        {evento.participacao > 0 && (
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="text-muted-foreground">
                              Partic.:
                            </span>
                            <span className="font-medium">
                              {formatCurrency(evento.participacao)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
