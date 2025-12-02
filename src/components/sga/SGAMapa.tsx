import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Map, Search, MapPin, AlertCircle, TrendingUp, DollarSign } from "lucide-react";

interface SGAMapaProps {
  eventos: any[];
  loading: boolean;
}

// Coordenadas aproximadas dos estados brasileiros para o mapa visual
const ESTADO_COORDS: { [key: string]: { x: number; y: number } } = {
  "AC": { x: 15, y: 45 },
  "AL": { x: 85, y: 50 },
  "AP": { x: 55, y: 15 },
  "AM": { x: 25, y: 30 },
  "BA": { x: 75, y: 55 },
  "CE": { x: 80, y: 38 },
  "DF": { x: 60, y: 58 },
  "ES": { x: 80, y: 68 },
  "GO": { x: 55, y: 58 },
  "MA": { x: 65, y: 35 },
  "MT": { x: 40, y: 55 },
  "MS": { x: 45, y: 70 },
  "MG": { x: 70, y: 65 },
  "PA": { x: 50, y: 30 },
  "PB": { x: 85, y: 42 },
  "PR": { x: 55, y: 78 },
  "PE": { x: 82, y: 45 },
  "PI": { x: 70, y: 40 },
  "RJ": { x: 75, y: 73 },
  "RN": { x: 85, y: 38 },
  "RS": { x: 50, y: 90 },
  "RO": { x: 25, y: 50 },
  "RR": { x: 30, y: 12 },
  "SC": { x: 55, y: 85 },
  "SP": { x: 60, y: 73 },
  "SE": { x: 85, y: 52 },
  "TO": { x: 58, y: 45 }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function SGAMapa({ eventos, loading }: SGAMapaProps) {
  const [searchCity, setSearchCity] = useState("");
  const [selectedEstado, setSelectedEstado] = useState<string>("todos");

  const stats = useMemo(() => {
    // Agrupar por estado
    const porEstado = eventos.reduce((acc: any, e) => {
      const estado = e.evento_estado || "N/I";
      if (!acc[estado]) {
        acc[estado] = { count: 0, custo: 0, regionais: new Set() };
      }
      acc[estado].count += 1;
      acc[estado].custo += e.custo_evento || 0;
      if (e.regional) acc[estado].regionais.add(e.regional);
      return acc;
    }, {});

    // Converter para array
    const estadosData = Object.entries(porEstado)
      .map(([estado, data]: [string, any]) => ({
        estado,
        count: data.count,
        custo: data.custo,
        regionais: Array.from(data.regionais)
      }))
      .sort((a, b) => b.count - a.count);

    // Encontrar max para escala do mapa
    const maxCount = Math.max(...estadosData.map(e => e.count), 1);

    // Agrupar por regional
    const porRegional = eventos.reduce((acc: any, e) => {
      const regional = e.regional || "N/I";
      if (!acc[regional]) {
        acc[regional] = { count: 0, custo: 0, estados: new Set() };
      }
      acc[regional].count += 1;
      acc[regional].custo += e.custo_evento || 0;
      if (e.evento_estado) acc[regional].estados.add(e.evento_estado);
      return acc;
    }, {});

    const regionaisData = Object.entries(porRegional)
      .map(([regional, data]: [string, any]) => ({
        regional,
        count: data.count,
        custo: data.custo,
        estados: Array.from(data.estados)
      }))
      .sort((a, b) => b.count - a.count);

    return { estadosData, regionaisData, maxCount };
  }, [eventos]);

  const filteredEstados = useMemo(() => {
    let result = stats.estadosData;
    
    if (selectedEstado !== "todos") {
      result = result.filter(e => e.estado === selectedEstado);
    }
    
    if (searchCity) {
      // Buscar nas regionais
      const searchLower = searchCity.toLowerCase();
      result = stats.estadosData.filter(e => 
        e.estado.toLowerCase().includes(searchLower) ||
        e.regionais.some((r: string) => r.toLowerCase().includes(searchLower))
      );
    }
    
    return result;
  }, [stats.estadosData, selectedEstado, searchCity]);

  const filteredRegionais = useMemo(() => {
    let result = stats.regionaisData;
    
    if (selectedEstado !== "todos") {
      result = result.filter(r => r.estados.includes(selectedEstado));
    }
    
    if (searchCity) {
      const searchLower = searchCity.toLowerCase();
      result = result.filter(r => r.regional.toLowerCase().includes(searchLower));
    }
    
    return result;
  }, [stats.regionaisData, selectedEstado, searchCity]);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!eventos.length) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado Disponível</h3>
          <p className="text-muted-foreground">
            Importe uma planilha do SGA para visualizar o mapa.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cidade, regional ou estado..."
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedEstado} onValueChange={setSelectedEstado}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados</SelectItem>
                {stats.estadosData.map(e => (
                  <SelectItem key={e.estado} value={e.estado}>
                    {e.estado} ({e.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mapa Visual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-primary" />
              Mapa de Eventos por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full aspect-[4/3] bg-muted/30 rounded-lg border overflow-hidden">
              {/* Mapa simplificado do Brasil */}
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Background */}
                <rect width="100" height="100" fill="transparent" />
                
                {/* Pontos dos estados */}
                {filteredEstados.map((estado) => {
                  const coords = ESTADO_COORDS[estado.estado];
                  if (!coords) return null;
                  
                  const size = Math.max(3, Math.min(12, (estado.count / stats.maxCount) * 12));
                  const opacity = 0.5 + (estado.count / stats.maxCount) * 0.5;
                  
                  return (
                    <g key={estado.estado}>
                      {/* Círculo de fundo */}
                      <circle
                        cx={coords.x}
                        cy={coords.y}
                        r={size + 2}
                        fill="hsl(var(--primary))"
                        opacity={opacity * 0.3}
                      />
                      {/* Círculo principal */}
                      <circle
                        cx={coords.x}
                        cy={coords.y}
                        r={size}
                        fill="hsl(var(--primary))"
                        opacity={opacity}
                        className="cursor-pointer hover:opacity-100 transition-opacity"
                      />
                      {/* Label */}
                      <text
                        x={coords.x}
                        y={coords.y + size + 4}
                        textAnchor="middle"
                        fontSize="3"
                        fill="currentColor"
                        className="text-muted-foreground"
                      >
                        {estado.estado}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Legenda */}
              <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur rounded p-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-primary opacity-30" />
                  <span>Baixo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span>Alto</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Estados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Detalhamento por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {filteredEstados.map((estado, index) => (
                <div
                  key={estado.estado}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{estado.estado}</span>
                      <Badge variant="secondary" className="text-xs">
                        {estado.count} eventos
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(estado.custo)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      {((estado.count / eventos.length) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Regionais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Análise por Regional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRegionais.slice(0, 12).map((regional) => (
              <div
                key={regional.regional}
                className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
              >
                <h4 className="font-medium text-sm truncate mb-2" title={regional.regional}>
                  {regional.regional}
                </h4>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{regional.count}</p>
                    <p className="text-xs text-muted-foreground">eventos</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-primary">
                      {formatCurrency(regional.custo)}
                    </p>
                    <div className="flex gap-1 mt-1">
                      {(regional.estados as string[]).slice(0, 3).map((est: string) => (
                        <Badge key={est} variant="outline" className="text-[10px] px-1">
                          {est}
                        </Badge>
                      ))}
                      {(regional.estados as string[]).length > 3 && (
                        <Badge variant="outline" className="text-[10px] px-1">
                          +{(regional.estados as string[]).length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
