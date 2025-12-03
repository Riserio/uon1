import { useEffect, useRef, useMemo, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Map, Search, MapPin, AlertCircle, TrendingUp, DollarSign, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SGAMapaProps {
  eventos: any[];
  loading: boolean;
}

// Coordenadas dos estados brasileiros (centroide)
const STATE_COORDS: { [key: string]: [number, number] } = {
  "AC": [-70.55, -9.02], "AL": [-36.62, -9.62], "AM": [-64.66, -3.47],
  "AP": [-51.07, 1.41], "BA": [-41.71, -12.97], "CE": [-39.32, -5.20],
  "DF": [-47.93, -15.83], "ES": [-40.31, -19.19], "GO": [-49.64, -15.98],
  "MA": [-45.27, -5.42], "MG": [-44.56, -18.10], "MS": [-54.79, -20.51],
  "MT": [-56.10, -12.64], "PA": [-52.29, -3.79], "PB": [-36.62, -7.28],
  "PE": [-37.86, -8.38], "PI": [-42.28, -7.72], "PR": [-51.61, -24.89],
  "RJ": [-43.17, -22.25], "RN": [-36.52, -5.81], "RO": [-63.58, -10.83],
  "RR": [-61.39, 2.74], "RS": [-53.21, -29.75], "SC": [-49.58, -27.45],
  "SE": [-37.45, -10.57], "SP": [-48.55, -22.19], "TO": [-48.33, -10.18]
};

// Principais cidades por estado (para geocoding básico)
const MAJOR_CITIES: { [key: string]: { [key: string]: [number, number] } } = {
  "SP": {
    "SAO PAULO": [-46.6333, -23.5505], "CAMPINAS": [-47.0608, -22.9056],
    "GUARULHOS": [-46.5333, -23.4628], "SANTOS": [-46.3333, -23.9608],
    "RIBEIRAO PRETO": [-47.8103, -21.1783], "SOROCABA": [-47.4581, -23.5015]
  },
  "RJ": {
    "RIO DE JANEIRO": [-43.1729, -22.9068], "NITEROI": [-43.1044, -22.8833],
    "DUQUE DE CAXIAS": [-43.3117, -22.7847], "NOVA IGUACU": [-43.4511, -22.7592]
  },
  "MG": {
    "BELO HORIZONTE": [-43.9378, -19.9167], "UBERLANDIA": [-48.2772, -18.9186],
    "CONTAGEM": [-44.0539, -19.9319], "JUIZ DE FORA": [-43.3503, -21.7642]
  },
  "BA": {
    "SALVADOR": [-38.5014, -12.9714], "FEIRA DE SANTANA": [-38.9667, -12.2667],
    "VITORIA DA CONQUISTA": [-40.8389, -14.8617]
  },
  "PR": {
    "CURITIBA": [-49.2731, -25.4297], "LONDRINA": [-51.1628, -23.3103],
    "MARINGA": [-51.9386, -23.4253], "PONTA GROSSA": [-50.1617, -25.0947]
  },
  "RS": {
    "PORTO ALEGRE": [-51.2303, -30.0331], "CAXIAS DO SUL": [-51.1794, -29.1678],
    "CANOAS": [-51.1839, -29.9178], "PELOTAS": [-52.3411, -31.7654]
  },
  "SC": {
    "FLORIANOPOLIS": [-48.5486, -27.5944], "JOINVILLE": [-48.8461, -26.3031],
    "BLUMENAU": [-49.0661, -26.9194], "CHAPECO": [-52.6156, -27.0964]
  },
  "GO": {
    "GOIANIA": [-49.2539, -16.6869], "APARECIDA DE GOIANIA": [-49.2469, -16.8228],
    "ANAPOLIS": [-48.9528, -16.3281]
  },
  "PE": {
    "RECIFE": [-34.8811, -8.0539], "JABOATAO DOS GUARARAPES": [-35.0153, -8.1128],
    "OLINDA": [-34.8553, -8.0089], "CARUARU": [-35.9761, -8.2850]
  },
  "CE": {
    "FORTALEZA": [-38.5267, -3.7172], "CAUCAIA": [-38.6531, -3.7361],
    "JUAZEIRO DO NORTE": [-39.3153, -7.2131]
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const getMarkerColor = (count: number, max: number) => {
  const ratio = count / max;
  if (ratio < 0.2) return "#22c55e";
  if (ratio < 0.4) return "#84cc16";
  if (ratio < 0.6) return "#eab308";
  if (ratio < 0.8) return "#f97316";
  return "#ef4444";
};

export default function SGAMapa({ eventos, loading }: SGAMapaProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  
  const [searchCity, setSearchCity] = useState("");
  const [selectedEstado, setSelectedEstado] = useState<string>("todos");
  const [mapReady, setMapReady] = useState(false);

  // Agregar eventos por localização
  const locationData = useMemo(() => {
    const byState: { [key: string]: { count: number; custo: number; cities: { [key: string]: { count: number; custo: number } } } } = {};
    const byCityGlobal: { state: string; city: string; count: number; custo: number; coords?: [number, number] }[] = [];
    
    eventos.forEach(e => {
      const estado = e.evento_estado?.toUpperCase() || "";
      const cidade = e.cooperativa?.toUpperCase() || e.regional?.toUpperCase() || "";
      
      if (estado && estado.length === 2 && STATE_COORDS[estado]) {
        if (!byState[estado]) {
          byState[estado] = { count: 0, custo: 0, cities: {} };
        }
        byState[estado].count += 1;
        byState[estado].custo += e.custo_evento || 0;
        
        if (cidade) {
          if (!byState[estado].cities[cidade]) {
            byState[estado].cities[cidade] = { count: 0, custo: 0 };
          }
          byState[estado].cities[cidade].count += 1;
          byState[estado].cities[cidade].custo += e.custo_evento || 0;
        }
      }
    });

    // Criar lista de cidades com coordenadas
    Object.entries(byState).forEach(([state, data]) => {
      Object.entries(data.cities).forEach(([city, cityData]) => {
        // Tentar encontrar coordenadas da cidade
        let coords: [number, number] | undefined;
        
        // Primeiro buscar nas cidades conhecidas
        if (MAJOR_CITIES[state]?.[city]) {
          coords = MAJOR_CITIES[state][city];
        } else {
          // Se não encontrar, usar coordenada do estado com pequeno offset aleatório
          const stateCoords = STATE_COORDS[state];
          if (stateCoords) {
            // Criar offset baseado no hash do nome da cidade para consistência
            const hash = city.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
            const offsetLng = ((hash % 100) / 100 - 0.5) * 2;
            const offsetLat = (((hash >> 8) % 100) / 100 - 0.5) * 2;
            coords = [stateCoords[0] + offsetLng, stateCoords[1] + offsetLat];
          }
        }
        
        byCityGlobal.push({
          state,
          city,
          count: cityData.count,
          custo: cityData.custo,
          coords
        });
      });
    });

    const maxCount = Math.max(...Object.values(byState).map(s => s.count), 1);
    const maxCityCount = Math.max(...byCityGlobal.map(c => c.count), 1);

    return { byState, byCityGlobal, maxCount, maxCityCount };
  }, [eventos]);

  // Dados filtrados para a lista
  const filteredStates = useMemo(() => {
    return Object.entries(locationData.byState)
      .map(([estado, data]) => ({ estado, ...data }))
      .filter(e => selectedEstado === "todos" || e.estado === selectedEstado)
      .filter(e => !searchCity || e.estado.includes(searchCity.toUpperCase()) || 
        Object.keys(e.cities).some(c => c.includes(searchCity.toUpperCase())))
      .sort((a, b) => b.count - a.count);
  }, [locationData.byState, selectedEstado, searchCity]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || 'pk.eyJ1IjoicmlzZXJpbyIsImEiOiJjbWlwYTNyMXkwOXgxM2VvdjZlOW94cjJnIn0.n1tbMo64JleTBaBszGpN7g';
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-55, -15],
      zoom: 3.5,
      minZoom: 2,
      maxZoom: 14,
      pitch: 0,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.current.on('load', () => {
      setMapReady(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Atualizar marcadores quando dados ou zoom mudam
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Limpar marcadores antigos
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const zoom = map.current.getZoom();
    const showCities = zoom >= 5;

    if (showCities) {
      // Mostrar cidades
      locationData.byCityGlobal
        .filter(city => {
          if (selectedEstado !== "todos" && city.state !== selectedEstado) return false;
          if (searchCity && !city.city.includes(searchCity.toUpperCase()) && !city.state.includes(searchCity.toUpperCase())) return false;
          return city.coords;
        })
        .forEach(city => {
          if (!city.coords) return;

          const size = Math.max(20, Math.min(60, 20 + (city.count / locationData.maxCityCount) * 40));
          const color = getMarkerColor(city.count, locationData.maxCityCount);

          const el = document.createElement('div');
          el.className = 'city-marker';
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.backgroundColor = color;
          el.style.borderRadius = '50%';
          el.style.border = '3px solid white';
          el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
          el.style.cursor = 'pointer';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.color = 'white';
          el.style.fontWeight = 'bold';
          el.style.fontSize = size > 35 ? '12px' : '10px';
          el.textContent = city.count > 99 ? '99+' : city.count.toString();

          const marker = new mapboxgl.Marker(el)
            .setLngLat(city.coords)
            .setPopup(
              new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div style="padding: 8px; min-width: 150px;">
                  <h3 style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${city.city}</h3>
                  <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${city.state}</p>
                  <div style="display: flex; justify-content: space-between; font-size: 13px;">
                    <span>Eventos:</span>
                    <strong>${city.count.toLocaleString('pt-BR')}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 13px; color: #16a34a;">
                    <span>Custo:</span>
                    <strong>${formatCurrency(city.custo)}</strong>
                  </div>
                </div>
              `)
            )
            .addTo(map.current!);

          markersRef.current.push(marker);
        });
    } else {
      // Mostrar estados
      Object.entries(locationData.byState)
        .filter(([state]) => selectedEstado === "todos" || state === selectedEstado)
        .forEach(([state, data]) => {
          const coords = STATE_COORDS[state];
          if (!coords) return;

          const size = Math.max(35, Math.min(80, 35 + (data.count / locationData.maxCount) * 45));
          const color = getMarkerColor(data.count, locationData.maxCount);

          const el = document.createElement('div');
          el.className = 'state-marker';
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.backgroundColor = color;
          el.style.borderRadius = '50%';
          el.style.border = '4px solid white';
          el.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35)';
          el.style.cursor = 'pointer';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.flexDirection = 'column';
          el.style.color = 'white';
          el.style.fontWeight = 'bold';
          el.style.fontSize = '11px';
          el.style.lineHeight = '1.2';
          el.innerHTML = `<span style="font-size:13px;font-weight:800">${state}</span><span style="font-size:10px">${data.count > 999 ? Math.round(data.count/1000) + 'k' : data.count}</span>`;

          const marker = new mapboxgl.Marker(el)
            .setLngLat(coords)
            .setPopup(
              new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div style="padding: 10px; min-width: 180px;">
                  <h3 style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">${state}</h3>
                  <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
                    <span>Total de Eventos:</span>
                    <strong>${data.count.toLocaleString('pt-BR')}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 14px; color: #16a34a; margin-bottom: 8px;">
                    <span>Custo Total:</span>
                    <strong>${formatCurrency(data.custo)}</strong>
                  </div>
                  <p style="font-size: 11px; color: #888; text-align: center; margin-top: 8px;">
                    Clique para ver cidades
                  </p>
                </div>
              `)
            )
            .addTo(map.current!);

          // Zoom ao clicar no estado
          el.addEventListener('click', () => {
            map.current?.flyTo({
              center: coords,
              zoom: 6,
              duration: 1500
            });
          });

          markersRef.current.push(marker);
        });
    }
  }, [mapReady, locationData, selectedEstado, searchCity]);

  // Atualizar marcadores quando zoom muda
  useEffect(() => {
    if (!map.current || !mapReady) return;

    const handleZoom = () => {
      // Forçar re-render dos marcadores
      const zoom = map.current?.getZoom() || 0;
      // Limpar e recriar marcadores baseado no zoom
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      const showCities = zoom >= 5;

      if (showCities) {
        locationData.byCityGlobal
          .filter(city => {
            if (selectedEstado !== "todos" && city.state !== selectedEstado) return false;
            return city.coords;
          })
          .forEach(city => {
            if (!city.coords) return;

            const size = Math.max(18, Math.min(50, 18 + (city.count / locationData.maxCityCount) * 32));
            const color = getMarkerColor(city.count, locationData.maxCityCount);

            const el = document.createElement('div');
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.backgroundColor = color;
            el.style.borderRadius = '50%';
            el.style.border = '2px solid white';
            el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
            el.style.cursor = 'pointer';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.color = 'white';
            el.style.fontWeight = 'bold';
            el.style.fontSize = size > 30 ? '11px' : '9px';
            el.textContent = city.count > 99 ? '99+' : city.count.toString();

            const marker = new mapboxgl.Marker(el)
              .setLngLat(city.coords)
              .setPopup(
                new mapboxgl.Popup({ offset: 20 }).setHTML(`
                  <div style="padding: 6px; min-width: 140px;">
                    <h3 style="font-weight: bold; font-size: 13px;">${city.city}</h3>
                    <p style="font-size: 11px; color: #666;">${city.state}</p>
                    <div style="font-size: 12px; margin-top: 6px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span>Eventos:</span>
                        <strong>${city.count.toLocaleString('pt-BR')}</strong>
                      </div>
                      <div style="display: flex; justify-content: space-between; color: #16a34a;">
                        <span>Custo:</span>
                        <strong>${formatCurrency(city.custo)}</strong>
                      </div>
                    </div>
                  </div>
                `)
              )
              .addTo(map.current!);

            markersRef.current.push(marker);
          });
      } else {
        Object.entries(locationData.byState)
          .filter(([state]) => selectedEstado === "todos" || state === selectedEstado)
          .forEach(([state, data]) => {
            const coords = STATE_COORDS[state];
            if (!coords) return;

            const size = Math.max(30, Math.min(70, 30 + (data.count / locationData.maxCount) * 40));
            const color = getMarkerColor(data.count, locationData.maxCount);

            const el = document.createElement('div');
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.backgroundColor = color;
            el.style.borderRadius = '50%';
            el.style.border = '3px solid white';
            el.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)';
            el.style.cursor = 'pointer';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.flexDirection = 'column';
            el.style.color = 'white';
            el.style.fontWeight = 'bold';
            el.innerHTML = `<span style="font-size:12px;font-weight:800">${state}</span><span style="font-size:9px">${data.count > 999 ? Math.round(data.count/1000) + 'k' : data.count}</span>`;

            const marker = new mapboxgl.Marker(el)
              .setLngLat(coords)
              .setPopup(
                new mapboxgl.Popup({ offset: 20 }).setHTML(`
                  <div style="padding: 8px; min-width: 160px;">
                    <h3 style="font-weight: bold; font-size: 15px;">${state}</h3>
                    <div style="font-size: 13px; margin-top: 6px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span>Eventos:</span>
                        <strong>${data.count.toLocaleString('pt-BR')}</strong>
                      </div>
                      <div style="display: flex; justify-content: space-between; color: #16a34a;">
                        <span>Custo:</span>
                        <strong>${formatCurrency(data.custo)}</strong>
                      </div>
                    </div>
                  </div>
                `)
              )
              .addTo(map.current!);

            el.addEventListener('click', () => {
              map.current?.flyTo({ center: coords, zoom: 6, duration: 1500 });
            });

            markersRef.current.push(marker);
          });
      }
    };

    map.current.on('zoomend', handleZoom);

    return () => {
      map.current?.off('zoomend', handleZoom);
    };
  }, [mapReady, locationData, selectedEstado]);

  // Funções de navegação
  const zoomToBrazil = () => {
    map.current?.flyTo({ center: [-55, -15], zoom: 3.5, duration: 1000 });
  };

  const zoomToState = (estado: string) => {
    const coords = STATE_COORDS[estado];
    if (coords && map.current) {
      map.current.flyTo({ center: coords, zoom: 6, duration: 1500 });
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[500px] lg:col-span-2" />
        <Skeleton className="h-[500px]" />
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
                  placeholder="Buscar cidade ou estado..."
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedEstado} onValueChange={(v) => {
              setSelectedEstado(v);
              if (v !== "todos") zoomToState(v);
              else zoomToBrazil();
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados</SelectItem>
                {Object.entries(locationData.byState)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([estado, data]) => (
                    <SelectItem key={estado} value={estado}>
                      {estado} ({data.count.toLocaleString('pt-BR')})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Mapa */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Map className="h-5 w-5 text-primary" />
                Mapa de Eventos
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => map.current?.zoomIn()}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => map.current?.zoomOut()}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={zoomToBrazil}>
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative">
              <div ref={mapContainer} className="h-[500px] rounded-b-lg" />
              
              {/* Legenda */}
              <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm rounded-lg p-3 text-xs border shadow-lg">
                <p className="font-semibold mb-2">Intensidade de Eventos</p>
                <div className="flex items-center gap-1">
                  {["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"].map((color, i) => (
                    <div key={i} className="w-5 h-5 rounded-full border border-white/50" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <div className="flex justify-between mt-1 text-muted-foreground">
                  <span>Baixo</span>
                  <span>Alto</span>
                </div>
              </div>

              {/* Dica de zoom */}
              <div className="absolute top-4 left-4 bg-card/95 backdrop-blur-sm rounded-lg px-3 py-2 text-xs border shadow">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Dica:</span> Clique em um estado para ver as cidades
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Estados */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[430px] overflow-y-auto pr-2">
              {filteredStates.map((estado, index) => (
                <div
                  key={estado.estado}
                  onClick={() => {
                    setSelectedEstado(estado.estado);
                    zoomToState(estado.estado);
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer border bg-muted/30 border-transparent hover:bg-muted/50 hover:border-primary/30"
                >
                  <div 
                    className="flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm text-white shadow"
                    style={{ backgroundColor: getMarkerColor(estado.count, locationData.maxCount) }}
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

      {/* Análise por Regional */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Top Cidades/Regionais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {locationData.byCityGlobal
              .filter(c => selectedEstado === "todos" || c.state === selectedEstado)
              .sort((a, b) => b.count - a.count)
              .slice(0, 12)
              .map((city) => (
                <div
                  key={`${city.state}-${city.city}`}
                  className="p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => {
                    if (city.coords && map.current) {
                      map.current.flyTo({ center: city.coords, zoom: 10, duration: 1500 });
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-sm truncate flex-1" title={city.city}>
                      {city.city}
                    </h4>
                    <Badge variant="outline" className="text-[10px] ml-2">{city.state}</Badge>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-primary">{city.count.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">eventos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(city.custo)}</p>
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
