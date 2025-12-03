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

// Coordenadas centrais dos estados para posicionar labels
const STATE_CENTERS: { [key: string]: { x: number; y: number } } = {
  "AC": { x: 112, y: 220 }, "AM": { x: 150, y: 145 }, "RR": { x: 175, y: 75 },
  "PA": { x: 260, y: 150 }, "AP": { x: 310, y: 95 }, "MA": { x: 335, y: 175 },
  "PI": { x: 355, y: 220 }, "CE": { x: 385, y: 185 }, "RN": { x: 415, y: 185 },
  "PB": { x: 415, y: 205 }, "PE": { x: 400, y: 225 }, "AL": { x: 420, y: 250 },
  "SE": { x: 405, y: 270 }, "BA": { x: 370, y: 310 }, "TO": { x: 295, y: 235 },
  "GO": { x: 290, y: 325 }, "DF": { x: 305, y: 305 }, "MT": { x: 205, y: 270 },
  "MS": { x: 230, y: 375 }, "MG": { x: 350, y: 365 }, "ES": { x: 400, y: 365 },
  "RJ": { x: 380, y: 400 }, "SP": { x: 305, y: 400 }, "PR": { x: 275, y: 445 },
  "SC": { x: 285, y: 485 }, "RS": { x: 270, y: 540 }, "RO": { x: 140, y: 255 }
};

// Paths SVG oficiais dos estados brasileiros
const BRAZIL_PATHS: { [key: string]: string } = {
  "AC": "M82,195 L95,185 L125,188 L140,200 L145,220 L130,240 L100,245 L75,235 L70,215 Z",
  "AM": "M75,90 L170,85 L230,100 L250,140 L240,180 L200,200 L145,210 L95,200 L70,170 L60,130 Z",
  "RR": "M145,40 L200,35 L220,70 L210,110 L170,120 L140,100 L135,60 Z",
  "PA": "M200,100 L320,95 L345,130 L350,190 L305,210 L240,200 L210,175 L195,140 Z",
  "AP": "M290,50 L330,45 L350,80 L340,120 L305,130 L280,110 L275,75 Z",
  "MA": "M305,140 L370,135 L385,175 L375,215 L330,225 L305,205 L300,170 Z",
  "PI": "M330,200 L380,195 L395,250 L380,295 L345,300 L325,270 L320,230 Z",
  "CE": "M365,155 L410,150 L425,185 L415,215 L380,220 L360,195 Z",
  "RN": "M400,160 L435,155 L445,185 L430,205 L405,210 L395,185 Z",
  "PB": "M395,195 L440,190 L450,215 L430,235 L400,240 L390,215 Z",
  "PE": "M365,225 L445,220 L460,255 L435,280 L375,285 L355,260 Z",
  "AL": "M405,260 L450,255 L465,285 L450,305 L415,310 L400,285 Z",
  "SE": "M390,290 L430,285 L440,315 L420,335 L390,340 L380,315 Z",
  "BA": "M325,265 L410,260 L435,320 L420,400 L360,415 L315,395 L305,330 Z",
  "TO": "M260,190 L310,185 L325,260 L310,320 L270,330 L250,280 L245,220 Z",
  "GO": "M255,300 L315,295 L340,360 L320,410 L260,420 L235,375 L240,330 Z",
  "DF": "M295,295 L320,290 L325,315 L310,330 L290,325 L285,305 Z",
  "MT": "M125,195 L250,190 L265,295 L240,370 L150,375 L115,310 L110,240 Z",
  "MS": "M195,360 L270,355 L285,440 L260,505 L195,510 L170,450 L175,390 Z",
  "MG": "M300,330 L400,325 L420,395 L400,455 L330,460 L295,420 L290,365 Z",
  "ES": "M385,340 L425,335 L440,380 L425,415 L390,420 L375,385 Z",
  "RJ": "M355,400 L410,395 L425,430 L405,460 L360,465 L345,435 Z",
  "SP": "M265,395 L345,390 L370,445 L350,495 L280,500 L250,455 L255,420 Z",
  "PR": "M240,465 L315,460 L335,510 L310,555 L250,560 L225,515 L230,485 Z",
  "SC": "M255,545 L320,540 L340,580 L320,615 L265,620 L245,585 Z",
  "RS": "M230,605 L310,600 L335,670 L310,730 L250,735 L215,680 L220,635 Z",
  "RO": "M105,215 L160,210 L175,280 L155,340 L100,345 L75,295 L80,250 Z"
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const getColorIntensity = (value: number, max: number) => {
  if (value === 0) return "#e2e8f0";
  const intensity = Math.min(value / max, 1);
  if (intensity < 0.2) return "#bbf7d0";
  if (intensity < 0.4) return "#86efac";
  if (intensity < 0.6) return "#4ade80";
  if (intensity < 0.8) return "#22c55e";
  return "#16a34a";
};

export default function SGAMapa({ eventos, loading }: SGAMapaProps) {
  const [searchCity, setSearchCity] = useState("");
  const [selectedEstado, setSelectedEstado] = useState<string>("todos");
  const [hoveredEstado, setHoveredEstado] = useState<string | null>(null);

  const stats = useMemo(() => {
    const porEstado = eventos.reduce((acc: any, e) => {
      const estado = e.evento_estado || "";
      if (estado && estado !== "N/I" && estado !== "NAO INFORMADO" && estado.length === 2) {
        if (!acc[estado]) acc[estado] = { count: 0, custo: 0, regionais: new Set() };
        acc[estado].count += 1;
        acc[estado].custo += e.custo_evento || 0;
        if (e.regional) acc[estado].regionais.add(e.regional);
      }
      return acc;
    }, {});

    const estadosData = Object.entries(porEstado)
      .map(([estado, data]: [string, any]) => ({
        estado, count: data.count, custo: data.custo, regionais: Array.from(data.regionais)
      }))
      .sort((a, b) => b.count - a.count);

    const maxCount = Math.max(...estadosData.map(e => e.count), 1);

    const porRegional = eventos.reduce((acc: any, e) => {
      const regional = e.regional || "";
      if (regional && regional !== "N/I" && regional !== "NAO INFORMADO") {
        if (!acc[regional]) acc[regional] = { count: 0, custo: 0, estados: new Set() };
        acc[regional].count += 1;
        acc[regional].custo += e.custo_evento || 0;
        if (e.evento_estado) acc[regional].estados.add(e.evento_estado);
      }
      return acc;
    }, {});

    const regionaisData = Object.entries(porRegional)
      .map(([regional, data]: [string, any]) => ({
        regional, count: data.count, custo: data.custo, estados: Array.from(data.estados)
      }))
      .sort((a, b) => b.count - a.count);

    return { estadosData, regionaisData, maxCount };
  }, [eventos]);

  const estadosMap = useMemo(() => {
    const map: { [key: string]: typeof stats.estadosData[0] } = {};
    stats.estadosData.forEach(e => { map[e.estado] = e; });
    return map;
  }, [stats.estadosData]);

  const filteredEstados = useMemo(() => {
    let result = stats.estadosData;
    if (selectedEstado !== "todos") result = result.filter(e => e.estado === selectedEstado);
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
    if (selectedEstado !== "todos") result = result.filter(r => r.estados.includes(selectedEstado));
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
          <p className="text-muted-foreground">Importe uma planilha do SGA para visualizar o mapa.</p>
        </CardContent>
      </Card>
    );
  }

  const hoveredData = hoveredEstado ? estadosMap[hoveredEstado] : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar regional ou estado..."
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
                    {e.estado} ({e.count.toLocaleString('pt-BR')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-primary" />
              Mapa de Eventos por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full bg-gradient-to-b from-sky-50 to-blue-100 dark:from-slate-900 dark:to-slate-800 rounded-xl border overflow-hidden p-2">
              <svg viewBox="50 20 430 740" className="w-full h-auto" style={{ maxHeight: "500px" }}>
                {Object.entries(BRAZIL_PATHS).map(([sigla, path]) => {
                  const estadoData = estadosMap[sigla];
                  const count = estadoData?.count || 0;
                  const isHighlighted = selectedEstado === sigla || (selectedEstado === "todos" && count > 0);
                  const isHovered = hoveredEstado === sigla;
                  const center = STATE_CENTERS[sigla];
                  
                  return (
                    <g key={sigla}>
                      <path
                        d={path}
                        fill={count > 0 ? getColorIntensity(count, stats.maxCount) : "#e2e8f0"}
                        stroke={isHovered ? "#1e40af" : "#64748b"}
                        strokeWidth={isHovered ? 2.5 : 1}
                        className="cursor-pointer transition-all duration-150"
                        style={{
                          opacity: isHighlighted ? 1 : 0.5,
                          filter: isHovered ? "brightness(1.1) drop-shadow(0 3px 6px rgba(0,0,0,0.3))" : "none",
                        }}
                        onMouseEnter={() => setHoveredEstado(sigla)}
                        onMouseLeave={() => setHoveredEstado(null)}
                      />
                      {center && (
                        <text
                          x={center.x}
                          y={center.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="12"
                          fontWeight="700"
                          fill={count > 0 ? "#1e3a5f" : "#64748b"}
                          className="pointer-events-none select-none"
                          style={{ textShadow: count > 0 ? "0 1px 2px rgba(255,255,255,0.8)" : "none" }}
                        >
                          {sigla}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {hoveredData && (
                <div className="absolute top-4 right-4 bg-card/95 backdrop-blur-sm border-2 border-primary/20 rounded-xl shadow-xl p-4 text-sm min-w-[170px] z-10">
                  <p className="font-bold text-xl text-primary mb-2">{hoveredEstado}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Eventos:</span>
                      <span className="font-bold">{hoveredData.count.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Custo:</span>
                      <span className="font-semibold text-primary">{formatCurrency(hoveredData.custo)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm rounded-lg p-3 text-xs border shadow">
                <p className="font-semibold mb-2">Intensidade</p>
                <div className="flex items-center gap-1">
                  {["#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a"].map((color, i) => (
                    <div key={i} className="w-5 h-5 rounded" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <div className="flex justify-between mt-1 text-muted-foreground">
                  <span>Baixo</span>
                  <span>Alto</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Detalhamento por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-2">
              {filteredEstados.map((estado, index) => (
                <div
                  key={estado.estado}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer border
                    ${hoveredEstado === estado.estado 
                      ? 'bg-primary/10 border-primary shadow-md' 
                      : 'bg-muted/30 border-transparent hover:bg-muted/50'}`}
                  onMouseEnter={() => setHoveredEstado(estado.estado)}
                  onMouseLeave={() => setHoveredEstado(null)}
                >
                  <div 
                    className="flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm text-white shadow"
                    style={{ backgroundColor: getColorIntensity(estado.count, stats.maxCount) }}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{estado.estado}</span>
                      <Badge variant="secondary" className="text-xs">
                        {estado.count.toLocaleString('pt-BR')}
                      </Badge>
                    </div>
                    <p className="text-sm text-primary font-medium">{formatCurrency(estado.custo)}</p>
                  </div>
                  <div className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {((estado.count / eventos.length) * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Análise por Regional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRegionais.slice(0, 12).map((regional) => (
              <div
                key={regional.regional}
                className="p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all"
              >
                <h4 className="font-semibold text-sm truncate mb-2" title={regional.regional}>
                  {regional.regional}
                </h4>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-primary">{regional.count.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-muted-foreground">eventos</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(regional.custo)}</p>
                    <div className="flex gap-1 mt-1 flex-wrap justify-end">
                      {(regional.estados as string[]).slice(0, 3).map((est: string) => (
                        <Badge key={est} variant="outline" className="text-[10px] px-1 py-0">{est}</Badge>
                      ))}
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
