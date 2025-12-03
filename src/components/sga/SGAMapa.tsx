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

// SVG paths para os estados brasileiros (simplificado)
const BRAZIL_STATES: { [key: string]: { path: string; cx: number; cy: number } } = {
  "AC": { path: "M45,195 L65,190 L70,205 L55,215 L40,210 Z", cx: 55, cy: 202 },
  "AM": { path: "M50,130 L130,125 L140,180 L90,195 L45,190 L40,150 Z", cx: 90, cy: 160 },
  "RR": { path: "M90,70 L115,65 L125,95 L105,110 L85,100 Z", cx: 105, cy: 87 },
  "PA": { path: "M130,110 L200,105 L210,175 L145,185 L130,150 Z", cx: 170, cy: 145 },
  "AP": { path: "M175,70 L200,65 L210,100 L185,110 L170,95 Z", cx: 190, cy: 85 },
  "MA": { path: "M210,130 L260,125 L265,175 L215,180 Z", cx: 237, cy: 152 },
  "PI": { path: "M250,150 L285,145 L290,210 L255,215 Z", cx: 270, cy: 180 },
  "CE": { path: "M290,140 L330,135 L335,175 L295,180 Z", cx: 312, cy: 157 },
  "RN": { path: "M335,150 L365,145 L368,175 L340,178 Z", cx: 352, cy: 162 },
  "PB": { path: "M335,180 L370,178 L372,200 L338,202 Z", cx: 353, cy: 190 },
  "PE": { path: "M305,195 L370,192 L372,220 L308,223 Z", cx: 338, cy: 207 },
  "AL": { path: "M340,225 L372,223 L374,245 L343,248 Z", cx: 357, cy: 235 },
  "SE": { path: "M340,250 L365,248 L367,270 L343,272 Z", cx: 353, cy: 260 },
  "BA": { path: "M260,210 L340,205 L350,310 L265,320 Z", cx: 305, cy: 260 },
  "TO": { path: "M210,180 L250,175 L255,270 L215,275 Z", cx: 232, cy: 225 },
  "GO": { path: "M195,280 L260,275 L265,340 L200,345 Z", cx: 227, cy: 310 },
  "DF": { path: "M230,305 L250,303 L252,320 L232,322 Z", cx: 241, cy: 312 },
  "MT": { path: "M100,200 L190,195 L195,300 L105,305 Z", cx: 147, cy: 250 },
  "MS": { path: "M130,310 L195,305 L200,385 L135,390 Z", cx: 165, cy: 347 },
  "MG": { path: "M265,290 L340,285 L345,375 L270,380 Z", cx: 305, cy: 332 },
  "ES": { path: "M345,320 L380,318 L382,365 L348,368 Z", cx: 363, cy: 343 },
  "RJ": { path: "M320,375 L375,372 L378,405 L323,408 Z", cx: 348, cy: 390 },
  "SP": { path: "M205,355 L290,350 L295,420 L210,425 Z", cx: 250, cy: 387 },
  "PR": { path: "M185,405 L260,400 L265,455 L190,460 Z", cx: 225, cy: 430 },
  "SC": { path: "M200,460 L260,457 L263,495 L203,498 Z", cx: 232, cy: 477 },
  "RS": { path: "M170,500 L250,497 L255,570 L175,575 Z", cx: 212, cy: 535 },
  "RO": { path: "M70,210 L135,205 L140,275 L75,280 Z", cx: 105, cy: 242 }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Função para interpolar cores
const getColorIntensity = (value: number, max: number) => {
  const intensity = Math.min(value / max, 1);
  // De azul claro para azul escuro
  const r = Math.round(59 - intensity * 30);
  const g = Math.round(130 - intensity * 50);
  const b = Math.round(246 - intensity * 50);
  return `rgb(${r}, ${g}, ${b})`;
};

export default function SGAMapa({ eventos, loading }: SGAMapaProps) {
  const [searchCity, setSearchCity] = useState("");
  const [selectedEstado, setSelectedEstado] = useState<string>("todos");
  const [hoveredEstado, setHoveredEstado] = useState<string | null>(null);

  const stats = useMemo(() => {
    // Agrupar por estado (filtrar N/I)
    const porEstado = eventos.reduce((acc: any, e) => {
      const estado = e.evento_estado || "";
      if (estado && estado !== "N/I" && estado !== "NAO INFORMADO") {
        if (!acc[estado]) {
          acc[estado] = { count: 0, custo: 0, regionais: new Set() };
        }
        acc[estado].count += 1;
        acc[estado].custo += e.custo_evento || 0;
        if (e.regional) acc[estado].regionais.add(e.regional);
      }
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
      const regional = e.regional || "";
      if (regional && regional !== "N/I" && regional !== "NAO INFORMADO") {
        if (!acc[regional]) {
          acc[regional] = { count: 0, custo: 0, estados: new Set() };
        }
        acc[regional].count += 1;
        acc[regional].custo += e.custo_evento || 0;
        if (e.evento_estado) acc[regional].estados.add(e.evento_estado);
      }
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

  // Criar mapa de estados para lookup rápido
  const estadosMap = useMemo(() => {
    const map: { [key: string]: typeof stats.estadosData[0] } = {};
    stats.estadosData.forEach(e => {
      map[e.estado] = e;
    });
    return map;
  }, [stats.estadosData]);

  const filteredEstados = useMemo(() => {
    let result = stats.estadosData;
    
    if (selectedEstado !== "todos") {
      result = result.filter(e => e.estado === selectedEstado);
    }
    
    if (searchCity) {
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

  const hoveredData = hoveredEstado ? estadosMap[hoveredEstado] : null;

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
        {/* Mapa do Brasil */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-primary" />
              Mapa de Eventos por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 rounded-lg border overflow-hidden p-4">
              {/* Mapa SVG do Brasil */}
              <svg viewBox="0 0 420 620" className="w-full h-auto max-h-[500px]">
                {/* Fundo do mapa */}
                <defs>
                  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.2"/>
                  </filter>
                </defs>
                
                {/* Estados */}
                {Object.entries(BRAZIL_STATES).map(([sigla, { path, cx, cy }]) => {
                  const estadoData = estadosMap[sigla];
                  const count = estadoData?.count || 0;
                  const isHighlighted = selectedEstado === sigla || (selectedEstado === "todos" && count > 0);
                  const isHovered = hoveredEstado === sigla;
                  
                  return (
                    <g key={sigla}>
                      <path
                        d={path}
                        fill={count > 0 ? getColorIntensity(count, stats.maxCount) : "#e5e7eb"}
                        stroke={isHovered ? "#1d4ed8" : "#94a3b8"}
                        strokeWidth={isHovered ? 2 : 1}
                        className="cursor-pointer transition-all duration-200"
                        style={{
                          filter: isHovered ? "url(#shadow)" : "none",
                          transform: isHovered ? "scale(1.02)" : "scale(1)",
                          transformOrigin: `${cx}px ${cy}px`,
                          opacity: isHighlighted ? 1 : 0.5
                        }}
                        onMouseEnter={() => setHoveredEstado(sigla)}
                        onMouseLeave={() => setHoveredEstado(null)}
                      />
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={count > 0 ? "#fff" : "#6b7280"}
                        className="pointer-events-none select-none"
                        style={{ textShadow: count > 0 ? "0 1px 2px rgba(0,0,0,0.5)" : "none" }}
                      >
                        {sigla}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip flutuante */}
              {hoveredData && (
                <div className="absolute top-4 right-4 bg-background/95 backdrop-blur border rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
                  <p className="font-bold text-lg mb-1">{hoveredEstado}</p>
                  <div className="space-y-1 text-muted-foreground">
                    <p><span className="font-medium text-foreground">{hoveredData.count.toLocaleString('pt-BR')}</span> eventos</p>
                    <p><span className="font-medium text-foreground">{formatCurrency(hoveredData.custo)}</span></p>
                  </div>
                </div>
              )}

              {/* Legenda */}
              <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur rounded-lg p-3 text-xs border">
                <p className="font-medium mb-2">Intensidade</p>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: getColorIntensity(0.1, 1) }} />
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: getColorIntensity(0.3, 1) }} />
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: getColorIntensity(0.5, 1) }} />
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: getColorIntensity(0.7, 1) }} />
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: getColorIntensity(1, 1) }} />
                </div>
                <div className="flex justify-between mt-1 text-muted-foreground">
                  <span>Baixo</span>
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
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
              {filteredEstados.map((estado, index) => (
                <div
                  key={estado.estado}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer
                    ${hoveredEstado === estado.estado ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted/30 hover:bg-muted/50'}`}
                  onMouseEnter={() => setHoveredEstado(estado.estado)}
                  onMouseLeave={() => setHoveredEstado(null)}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{estado.estado}</span>
                      <Badge variant="secondary" className="text-xs">
                        {estado.count.toLocaleString('pt-BR')} eventos
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRegionais.slice(0, 16).map((regional) => (
              <div
                key={regional.regional}
                className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
              >
                <h4 className="font-medium text-sm truncate mb-2" title={regional.regional}>
                  {regional.regional}
                </h4>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{regional.count.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-muted-foreground">eventos</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-primary">
                      {formatCurrency(regional.custo)}
                    </p>
                    <div className="flex gap-1 mt-1 flex-wrap justify-end">
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