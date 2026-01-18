import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Car, DollarSign, Calendar, MapPin, Building2 } from "lucide-react";

interface SGAEventosDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  filterType: string;
  filterValue: string;
  eventos: any[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR");
};

export default function SGAEventosDetailDialog({
  open,
  onOpenChange,
  title,
  filterType,
  filterValue,
  eventos,
}: SGAEventosDetailDialogProps) {
  const [searchPlaca, setSearchPlaca] = useState("");

  // Filter eventos based on the filter type and value
  const filteredEventos = useMemo(() => {
    let filtered = eventos;

    // Apply the main filter based on chart click
    switch (filterType) {
      case "tipoVeiculo":
        filtered = eventos.filter((e) => {
          const modelo = (e.modelo_veiculo || "").toLowerCase();
          if (filterValue === "Motocicleta") {
            return (
              modelo.includes("moto") ||
              modelo.includes("honda") ||
              modelo.includes("yamaha") ||
              modelo.includes("suzuki") ||
              modelo.includes("kawasaki")
            );
          }
          if (filterValue === "Caminhão") {
            return (
              modelo.includes("caminhao") ||
              modelo.includes("caminhão") ||
              modelo.includes("truck") ||
              modelo.includes("scania") ||
              modelo.includes("volvo") ||
              modelo.includes("mercedes")
            );
          }
          if (filterValue === "Van/Utilitário") {
            return (
              modelo.includes("van") ||
              modelo.includes("furgao") ||
              modelo.includes("furgão") ||
              modelo.includes("sprinter")
            );
          }
          // Default: Passeio
          return (
            !modelo.includes("moto") &&
            !modelo.includes("honda") &&
            !modelo.includes("yamaha") &&
            !modelo.includes("suzuki") &&
            !modelo.includes("kawasaki") &&
            !modelo.includes("caminhao") &&
            !modelo.includes("caminhão") &&
            !modelo.includes("truck") &&
            !modelo.includes("scania") &&
            !modelo.includes("volvo") &&
            !modelo.includes("mercedes") &&
            !modelo.includes("van") &&
            !modelo.includes("furgao") &&
            !modelo.includes("furgão") &&
            !modelo.includes("sprinter")
          );
        });
        break;
      case "cooperativa":
        filtered = eventos.filter((e) => e.cooperativa === filterValue);
        break;
      case "regional":
        filtered = eventos.filter((e) => e.regional === filterValue);
        break;
      case "estado":
        filtered = eventos.filter((e) => e.evento_estado === filterValue);
        break;
      case "motivo":
        filtered = eventos.filter((e) => e.motivo_evento === filterValue);
        break;
      case "situacao":
        filtered = eventos.filter((e) => e.situacao_evento === filterValue);
        break;
      case "tipoEvento":
        filtered = eventos.filter((e) => e.tipo_evento === filterValue);
        break;
      case "envolvimento":
        filtered = eventos.filter((e) => e.envolvimento === filterValue);
        break;
      case "mes":
        filtered = eventos.filter((e) => {
          if (!e.data_evento) return false;
          const date = new Date(e.data_evento);
          const mesAno = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          return mesAno === filterValue;
        });
        break;
      case "dia":
        filtered = eventos.filter((e) => {
          if (!e.data_evento) return false;
          const date = new Date(e.data_evento);
          return date.toISOString().split("T")[0] === filterValue;
        });
        break;
    }

    // Apply placa search filter
    if (searchPlaca.trim()) {
      const search = searchPlaca.toLowerCase().trim();
      filtered = filtered.filter(
        (e) =>
          (e.placa && e.placa.toLowerCase().includes(search)) ||
          (e.modelo_veiculo && e.modelo_veiculo.toLowerCase().includes(search))
      );
    }

    return filtered;
  }, [eventos, filterType, filterValue, searchPlaca]);

  const totals = useMemo(() => {
    const custoTotal = filteredEventos.reduce(
      (acc, e) => acc + (e.custo_evento || 0),
      0
    );
    const reparoTotal = filteredEventos.reduce(
      (acc, e) => acc + (e.valor_reparo || 0),
      0
    );
    return { custoTotal, reparoTotal, count: filteredEventos.length };
  }, [filteredEventos]);

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

          {/* Vehicle List */}
          <ScrollArea className="flex-1 min-h-0 h-full pr-4">
            {filteredEventos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Car className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nenhum veículo encontrado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEventos.map((evento, index) => (
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
                            {evento.evento_estado && (
                              <span className="text-xs">
                                ({evento.evento_estado})
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
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
