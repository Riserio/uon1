import { useEffect, useRef, useMemo, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map, Search, MapPin, AlertCircle, DollarSign, ZoomIn, ZoomOut, Maximize, Building2, Navigation, Layers, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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

// Base de cidades brasileiras com coordenadas precisas
const BRAZILIAN_CITIES: { [key: string]: [number, number] } = {
  // São Paulo
  "SAO PAULO": [-46.6333, -23.5505], "CAMPINAS": [-47.0608, -22.9056], "GUARULHOS": [-46.5333, -23.4628],
  "SANTOS": [-46.3333, -23.9608], "RIBEIRAO PRETO": [-47.8103, -21.1783], "SOROCABA": [-47.4581, -23.5015],
  "SAO BERNARDO DO CAMPO": [-46.5650, -23.6914], "SANTO ANDRE": [-46.5384, -23.6737],
  "OSASCO": [-46.7917, -23.5325], "SAO JOSE DOS CAMPOS": [-45.8869, -23.1896],
  "PIRACICABA": [-47.6492, -22.7255], "BAURU": [-49.0606, -22.3246], "JUNDIAI": [-46.8844, -23.1864],
  "MOGI DAS CRUZES": [-46.1883, -23.5224], "DIADEMA": [-46.6228, -23.6861], "CARAPICUIBA": [-46.8358, -23.5225],
  "MAUA": [-46.4608, -23.6678], "ITAQUAQUECETUBA": [-46.3486, -23.4867], "TABOAO DA SERRA": [-46.7583, -23.6219],
  "FRANCA": [-47.4008, -20.5389], "PRAIA GRANDE": [-46.4175, -24.0058], "GUARUJA": [-46.2564, -23.9933],
  "SAO VICENTE": [-46.3917, -23.9636], "SUZANO": [-46.3106, -23.5425], "LIMEIRA": [-47.4017, -22.5642],
  "TAUBATE": [-45.5556, -23.0225], "SUMARE": [-47.2669, -22.8214], "BARUERI": [-46.8761, -23.5106],
  "EMBU DAS ARTES": [-46.8522, -23.6492], "SAO CARLOS": [-47.8908, -22.0175], "INDAIATUBA": [-47.2178, -23.0903],
  "COTIA": [-46.9189, -23.6042], "AMERICANA": [-47.3308, -22.7392], "MARILIA": [-49.9461, -22.2139],
  "ITAPEVI": [-46.9344, -23.5489], "ARARAQUARA": [-48.1758, -21.7942], "JACAREI": [-45.9658, -23.3050],
  "HORTOLANDIA": [-47.2203, -22.8583], "PRESIDENTE PRUDENTE": [-51.3886, -22.1256], "RIO CLARO": [-47.5614, -22.4106],
  // Rio de Janeiro  
  "RIO DE JANEIRO": [-43.1729, -22.9068], "NITEROI": [-43.1044, -22.8833], "DUQUE DE CAXIAS": [-43.3117, -22.7847],
  "NOVA IGUACU": [-43.4511, -22.7592], "SAO GONCALO": [-43.0533, -22.8269], "BELFORD ROXO": [-43.3992, -22.7642],
  "CAMPOS DOS GOYTACAZES": [-41.3269, -21.7625], "SAO JOAO DE MERITI": [-43.3722, -22.8039],
  "PETROPOLIS": [-43.1789, -22.5050], "VOLTA REDONDA": [-44.1042, -22.5231], "MACAE": [-41.7867, -22.3708],
  // Minas Gerais
  "BELO HORIZONTE": [-43.9378, -19.9167], "UBERLANDIA": [-48.2772, -18.9186], "CONTAGEM": [-44.0539, -19.9319],
  "JUIZ DE FORA": [-43.3503, -21.7642], "BETIM": [-44.1983, -19.9678], "MONTES CLAROS": [-43.8617, -16.7350],
  "RIBEIRAO DAS NEVES": [-44.0867, -19.7669], "UBERABA": [-47.9319, -19.7472], "GOVERNADOR VALADARES": [-41.9500, -18.8511],
  "IPATINGA": [-42.5369, -19.4686], "SETE LAGOAS": [-44.2469, -19.4656], "DIVINOPOLIS": [-44.8836, -20.1389],
  // Bahia
  "SALVADOR": [-38.5014, -12.9714], "FEIRA DE SANTANA": [-38.9667, -12.2667], "VITORIA DA CONQUISTA": [-40.8389, -14.8617],
  "CAMACARI": [-38.3253, -12.6997], "ITABUNA": [-39.2803, -14.7856], "JUAZEIRO": [-40.5008, -9.4164],
  "LAURO DE FREITAS": [-38.3217, -12.8978], "ILHEUS": [-39.0464, -14.7889],
  // Paraná
  "CURITIBA": [-49.2731, -25.4297], "LONDRINA": [-51.1628, -23.3103], "MARINGA": [-51.9386, -23.4253],
  "PONTA GROSSA": [-50.1617, -25.0947], "CASCAVEL": [-53.4550, -24.9556], "SAO JOSE DOS PINHAIS": [-49.2069, -25.5314],
  "FOZ DO IGUACU": [-54.5881, -25.5478], "COLOMBO": [-49.2244, -25.2917], "GUARAPUAVA": [-51.4581, -25.3903],
  // Rio Grande do Sul
  "PORTO ALEGRE": [-51.2303, -30.0331], "CAXIAS DO SUL": [-51.1794, -29.1678], "CANOAS": [-51.1839, -29.9178],
  "PELOTAS": [-52.3411, -31.7654], "SANTA MARIA": [-53.8069, -29.6842], "GRAVATAI": [-50.9917, -29.9442],
  "VIAMAO": [-51.0833, -30.0833], "NOVO HAMBURGO": [-51.1306, -29.6789], "SAO LEOPOLDO": [-51.1478, -29.7600],
  // Santa Catarina
  "FLORIANOPOLIS": [-48.5486, -27.5944], "JOINVILLE": [-48.8461, -26.3031], "BLUMENAU": [-49.0661, -26.9194],
  "CHAPECO": [-52.6156, -27.0964], "ITAJAI": [-48.6617, -26.9078], "CRICIUMA": [-49.3697, -28.6775],
  // Goiás
  "GOIANIA": [-49.2539, -16.6869], "APARECIDA DE GOIANIA": [-49.2469, -16.8228], "ANAPOLIS": [-48.9528, -16.3281],
  // Pernambuco
  "RECIFE": [-34.8811, -8.0539], "JABOATAO DOS GUARARAPES": [-35.0153, -8.1128], "OLINDA": [-34.8553, -8.0089],
  "CARUARU": [-35.9761, -8.2850], "PETROLINA": [-40.5008, -9.3886],
  // Ceará
  "FORTALEZA": [-38.5267, -3.7172], "CAUCAIA": [-38.6531, -3.7361], "JUAZEIRO DO NORTE": [-39.3153, -7.2131],
  "MARACANAU": [-38.6256, -3.8756], "SOBRAL": [-40.3481, -3.6894],
  // Pará
  "BELEM": [-48.4897, -1.4558], "ANANINDEUA": [-48.3722, -1.3656], "SANTAREM": [-54.7081, -2.4386],
  "MARABA": [-49.1178, -5.3686], "CASTANHAL": [-47.9261, -1.2939],
  // Amazonas
  "MANAUS": [-60.0250, -3.1019], "PARINTINS": [-56.7353, -2.6286], "ITACOATIARA": [-58.4442, -3.1386],
  // Maranhão
  "SAO LUIS": [-44.2825, -2.5297], "IMPERATRIZ": [-47.4919, -5.5189],
  // Mato Grosso
  "CUIABA": [-56.0978, -15.6014], "VARZEA GRANDE": [-56.1328, -15.6458], "RONDONOPOLIS": [-54.6356, -16.4697],
  "SINOP": [-55.5036, -11.8644],
  // Mato Grosso do Sul
  "CAMPO GRANDE": [-54.6464, -20.4428], "DOURADOS": [-54.8056, -22.2211], "TRES LAGOAS": [-51.6786, -20.7511],
  // Piauí
  "TERESINA": [-42.8019, -5.0920], "PARNAIBA": [-41.7769, -2.9047],
  // Rio Grande do Norte
  "NATAL": [-35.2094, -5.7950], "MOSSORO": [-37.3442, -5.1875], "PARNAMIRIM": [-35.2628, -5.9158],
  // Paraíba
  "JOAO PESSOA": [-34.8631, -7.1153], "CAMPINA GRANDE": [-35.8811, -7.2306],
  // Sergipe
  "ARACAJU": [-37.0714, -10.9472],
  // Alagoas
  "MACEIO": [-35.7353, -9.6658], "ARAPIRACA": [-36.6611, -9.7525],
  // Espírito Santo
  "VITORIA": [-40.3378, -20.2976], "VILA VELHA": [-40.2897, -20.3297], "SERRA": [-40.3078, -20.1283],
  "CARIACICA": [-40.4197, -20.2636],
  // Tocantins
  "PALMAS": [-48.3336, -10.2128], "ARAGUAINA": [-48.2072, -7.1911],
  // Rondônia
  "PORTO VELHO": [-63.9039, -8.7619], "JI PARANA": [-61.9517, -10.8853],
  // Acre
  "RIO BRANCO": [-67.8100, -9.9747],
  // Amapá
  "MACAPA": [-51.0669, 0.0356],
  // Roraima
  "BOA VISTA": [-60.6719, 2.8197],
  // Distrito Federal
  "BRASILIA": [-47.9297, -15.7797],
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Cores em tons de azul e roxo seguindo o design system
const getMarkerColor = (count: number, max: number) => {
  const ratio = count / max;
  if (ratio < 0.2) return "hsl(220, 85%, 70%)";
  if (ratio < 0.4) return "hsl(220, 85%, 55%)";
  if (ratio < 0.6) return "hsl(250, 75%, 55%)";
  if (ratio < 0.8) return "hsl(270, 70%, 50%)";
  return "hsl(270, 70%, 40%)";
};

// Normalizar nome para busca
const normalizeText = (name: string): string => {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();
};

// Buscar coordenadas da cidade
const getCityCoords = (cityName: string, state: string): [number, number] | null => {
  const normalized = normalizeText(cityName);
  
  if (BRAZILIAN_CITIES[normalized]) {
    return BRAZILIAN_CITIES[normalized];
  }
  
  for (const [knownCity, coords] of Object.entries(BRAZILIAN_CITIES)) {
    if (normalized.includes(knownCity) || knownCity.includes(normalized)) {
      return coords;
    }
  }
  
  const stateCoords = STATE_COORDS[state];
  if (stateCoords) {
    const hash = normalized.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const offsetLng = ((hash % 100) / 100 - 0.5) * 1.5;
    const offsetLat = (((hash >> 8) % 100) / 100 - 0.5) * 1.5;
    return [stateCoords[0] + offsetLng, stateCoords[1] + offsetLat];
  }
  
  return null;
};

// URL do GeoJSON do IBGE para estados brasileiros
const IBGE_STATES_GEOJSON = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

export default function SGAMapa({ eventos, loading }: SGAMapaProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [searchCity, setSearchCity] = useState("");
  const [selectedEstado, setSelectedEstado] = useState<string>("todos");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeTab, setActiveTab] = useState<"estados" | "cidades">("estados");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showClusters, setShowClusters] = useState(true);

  // Agregar eventos por cidade (usando evento_cidade)
  const locationData = useMemo(() => {
    const byState: { [key: string]: { count: number; custo: number; cities: { [key: string]: { count: number; custo: number; cooperativa?: string } } } } = {};
    const byRegional: { [key: string]: { count: number; custo: number; estados: Set<string>; cidades: Set<string> } } = {};
    const byTipoEvento: { [key: string]: { count: number; custo: number } } = {};
    const byMotivoEvento: { [key: string]: { count: number; custo: number } } = {};
    const bySituacao: { [key: string]: number } = {};
    
    eventos.forEach(e => {
      const estado = e.evento_estado?.toUpperCase() || "";
      const cidade = e.evento_cidade?.toUpperCase() || ""; // Usando evento_cidade
      const cooperativa = e.cooperativa || "";
      const regional = e.regional || "";
      const tipoEvento = e.tipo_evento || "Não informado";
      const motivoEvento = e.motivo_evento || "Não informado";
      const situacao = e.situacao_evento || "Não informado";
      
      // Agregar por tipo de evento
      if (!byTipoEvento[tipoEvento]) {
        byTipoEvento[tipoEvento] = { count: 0, custo: 0 };
      }
      byTipoEvento[tipoEvento].count += 1;
      byTipoEvento[tipoEvento].custo += e.custo_evento || 0;

      // Agregar por motivo do evento
      if (!byMotivoEvento[motivoEvento]) {
        byMotivoEvento[motivoEvento] = { count: 0, custo: 0 };
      }
      byMotivoEvento[motivoEvento].count += 1;
      byMotivoEvento[motivoEvento].custo += e.custo_evento || 0;

      // Agregar por situação
      bySituacao[situacao] = (bySituacao[situacao] || 0) + 1;
      
      if (estado && estado.length === 2 && STATE_COORDS[estado]) {
        if (!byState[estado]) {
          byState[estado] = { count: 0, custo: 0, cities: {} };
        }
        byState[estado].count += 1;
        byState[estado].custo += e.custo_evento || 0;
        
        if (cidade && cidade !== "N/I" && cidade !== "NAO INFORMADO") {
          if (!byState[estado].cities[cidade]) {
            byState[estado].cities[cidade] = { count: 0, custo: 0, cooperativa };
          }
          byState[estado].cities[cidade].count += 1;
          byState[estado].cities[cidade].custo += e.custo_evento || 0;
        }

        // Agregar por regional
        if (regional && regional !== "N/I" && regional !== "NAO INFORMADO") {
          if (!byRegional[regional]) {
            byRegional[regional] = { count: 0, custo: 0, estados: new Set(), cidades: new Set() };
          }
          byRegional[regional].count += 1;
          byRegional[regional].custo += e.custo_evento || 0;
          byRegional[regional].estados.add(estado);
          if (cidade) byRegional[regional].cidades.add(cidade);
        }
      }
    });

    // Criar lista de cidades com coordenadas
    const byCityGlobal: { state: string; city: string; count: number; custo: number; coords: [number, number] | null; cooperativa?: string }[] = [];
    
    Object.entries(byState).forEach(([state, data]) => {
      Object.entries(data.cities).forEach(([city, cityData]) => {
        const coords = getCityCoords(city, state);
        byCityGlobal.push({
          state,
          city,
          count: cityData.count,
          custo: cityData.custo,
          coords,
          cooperativa: cityData.cooperativa
        });
      });
    });

    // Converter regionais para array
    const regionaisArray = Object.entries(byRegional)
      .map(([nome, data]) => ({
        nome,
        count: data.count,
        custo: data.custo,
        estados: Array.from(data.estados),
        cidades: Array.from(data.cidades)
      }))
      .sort((a, b) => b.custo - a.custo);

    // Converter tipo de evento para array
    const tipoEventoArray = Object.entries(byTipoEvento)
      .map(([tipo, data]) => ({ tipo, ...data }))
      .sort((a, b) => b.custo - a.custo);

    // Converter motivo de evento para array
    const motivoEventoArray = Object.entries(byMotivoEvento)
      .map(([motivo, data]) => ({ motivo, ...data }))
      .sort((a, b) => b.custo - a.custo);

    // Converter situação para array
    const situacaoArray = Object.entries(bySituacao)
      .map(([situacao, count]) => ({ situacao, count }))
      .sort((a, b) => b.count - a.count);

    // Top cidades por custo
    const topCidadesCusto = [...byCityGlobal].sort((a, b) => b.custo - a.custo).slice(0, 10);

    const maxCount = Math.max(...Object.values(byState).map(s => s.count), 1);
    const maxCityCount = Math.max(...byCityGlobal.map(c => c.count), 1);

    return { 
      byState, 
      byCityGlobal, 
      regionaisArray, 
      tipoEventoArray,
      motivoEventoArray,
      situacaoArray,
      topCidadesCusto,
      maxCount, 
      maxCityCount 
    };
  }, [eventos]);

  // Cidades filtradas pelo estado selecionado
  const filteredCities = useMemo(() => {
    let cities = locationData.byCityGlobal;
    
    if (selectedEstado !== "todos") {
      cities = cities.filter(c => c.state === selectedEstado);
    }
    
    if (searchCity) {
      const search = normalizeText(searchCity);
      cities = cities.filter(c => 
        normalizeText(c.city).includes(search) || 
        c.state.includes(search) ||
        (c.cooperativa && normalizeText(c.cooperativa).includes(search))
      );
    }
    
    return cities.sort((a, b) => b.count - a.count);
  }, [locationData.byCityGlobal, selectedEstado, searchCity]);

  // Estados filtrados
  const filteredStates = useMemo(() => {
    return Object.entries(locationData.byState)
      .map(([estado, data]) => ({ estado, ...data }))
      .filter(e => !searchCity || e.estado.includes(searchCity.toUpperCase()))
      .sort((a, b) => b.count - a.count);
  }, [locationData.byState, searchCity]);

  // GeoJSON para heatmap e clusters
  const geoJsonData = useMemo(() => {
    const features = filteredCities
      .filter(c => c.coords)
      .map(city => ({
        type: "Feature" as const,
        properties: {
          city: city.city,
          state: city.state,
          cooperativa: city.cooperativa,
          count: city.count,
          custo: city.custo,
          mag: city.count // Para heatmap
        },
        geometry: {
          type: "Point" as const,
          coordinates: city.coords as [number, number]
        }
      }));

    return {
      type: "FeatureCollection" as const,
      features
    };
  }, [filteredCities]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = 'pk.eyJ1IjoicmlzZXJpbyIsImEiOiJjbWlwYTNyMXkwOXgxM2VvdjZlOW94cjJnIn0.n1tbMo64JleTBaBszGpN7g';
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-55, -15],
      zoom: 3.5,
      minZoom: 2,
      maxZoom: 14,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      // Adicionar fonte do GeoJSON do IBGE para estados
      map.current?.addSource('brazil-states', {
        type: 'geojson',
        data: IBGE_STATES_GEOJSON
      });

      // Adicionar camada de contorno dos estados
      map.current?.addLayer({
        id: 'states-fill',
        type: 'fill',
        source: 'brazil-states',
        paint: {
          'fill-color': 'hsla(220, 85%, 55%, 0.05)',
          'fill-outline-color': 'hsla(220, 85%, 55%, 0.3)'
        }
      });

      map.current?.addLayer({
        id: 'states-line',
        type: 'line',
        source: 'brazil-states',
        paint: {
          'line-color': 'hsla(220, 85%, 55%, 0.5)',
          'line-width': 1
        }
      });

      setMapReady(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Adicionar/atualizar heatmap e clusters
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Remover camadas existentes
    ['heatmap-layer', 'clusters', 'cluster-count', 'unclustered-point'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id);
    });
    ['eventos-heatmap', 'eventos-cluster'].forEach(id => {
      if (map.current?.getSource(id)) map.current.removeSource(id);
    });

    // Adicionar fonte para heatmap
    if (showHeatmap) {
      map.current.addSource('eventos-heatmap', {
        type: 'geojson',
        data: geoJsonData
      });

      map.current.addLayer({
        id: 'heatmap-layer',
        type: 'heatmap',
        source: 'eventos-heatmap',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'count'], 0, 0, 100, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'hsla(220, 85%, 70%, 0.5)',
            0.4, 'hsla(220, 85%, 55%, 0.6)',
            0.6, 'hsla(250, 75%, 55%, 0.7)',
            0.8, 'hsla(270, 70%, 50%, 0.8)',
            1, 'hsla(270, 70%, 40%, 0.9)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 10, 9, 30],
          'heatmap-opacity': 0.8
        }
      }, 'states-fill');
    }

    // Adicionar fonte para clusters
    if (showClusters && !showHeatmap) {
      map.current.addSource('eventos-cluster', {
        type: 'geojson',
        data: geoJsonData,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 50,
        clusterProperties: {
          'sum': ['+', ['get', 'count']],
          'totalCusto': ['+', ['get', 'custo']]
        }
      });

      // Camada de clusters
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'eventos-cluster',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            'hsl(220, 85%, 70%)',
            10, 'hsl(220, 85%, 55%)',
            30, 'hsl(250, 75%, 55%)',
            50, 'hsl(270, 70%, 50%)',
            100, 'hsl(270, 70%, 40%)'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20, 10, 25, 30, 30, 50, 35, 100, 45
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff'
        }
      });

      // Contagem dos clusters
      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'eventos-cluster',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff'
        }
      });

      // Pontos não clusterizados
      map.current.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'eventos-cluster',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': 'hsl(220, 85%, 55%)',
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });

      // Popup ao clicar no cluster
      map.current.on('click', 'clusters', (e) => {
        const features = map.current?.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        if (!features?.length) return;
        
        const clusterId = features[0].properties?.cluster_id;
        const source = map.current?.getSource('eventos-cluster') as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || !map.current) return;
          map.current.easeTo({
            center: (features[0].geometry as any).coordinates,
            zoom: zoom
          });
        });
      });

      // Popup ao clicar em ponto
      map.current.on('click', 'unclustered-point', (e) => {
        const features = e.features;
        if (!features?.length) return;
        
        const props = features[0].properties;
        const coords = (features[0].geometry as any).coordinates.slice();
        
        new mapboxgl.Popup({ offset: 25 })
          .setLngLat(coords)
          .setHTML(`
            <div style="padding: 10px; min-width: 180px;">
              <h3 style="font-weight: bold; font-size: 14px; margin-bottom: 2px; color: hsl(220, 85%, 35%);">${props?.city}</h3>
              <p style="font-size: 11px; color: #666; margin-bottom: 8px;">
                ${props?.state}${props?.cooperativa ? ` • Cooperativa: ${props?.cooperativa}` : ''}
              </p>
              <div style="background: hsl(220, 20%, 97%); border-radius: 8px; padding: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                  <span style="color: #64748b;">Eventos:</span>
                  <strong style="color: hsl(220, 85%, 35%);">${props?.count?.toLocaleString('pt-BR')}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span style="color: #64748b;">Custo:</span>
                  <strong style="color: hsl(270, 70%, 50%);">${formatCurrency(props?.custo || 0)}</strong>
                </div>
              </div>
            </div>
          `)
          .addTo(map.current!);
      });

      // Cursor pointer nos clusters
      map.current.on('mouseenter', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'clusters', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
      map.current.on('mouseenter', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'unclustered-point', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
    }
  }, [mapReady, geoJsonData, showHeatmap, showClusters]);

  // Atualizar marcadores manuais quando não usando clusters
  const updateMarkers = () => {
    if (!map.current || !mapReady || showClusters || showHeatmap) {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      return;
    }

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    filteredCities.forEach(city => {
      if (!city.coords) return;

      const isSelected = selectedCity === `${city.state}-${city.city}`;
      const size = Math.max(20, Math.min(55, 20 + (city.count / locationData.maxCityCount) * 35));
      const color = getMarkerColor(city.count, locationData.maxCityCount);

      const el = document.createElement('div');
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.backgroundColor = color;
      el.style.borderRadius = '50%';
      el.style.border = isSelected ? '4px solid hsl(220, 85%, 45%)' : '3px solid white';
      el.style.boxShadow = isSelected ? '0 0 0 3px hsla(220, 85%, 55%, 0.4), 0 3px 10px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.style.fontSize = size > 35 ? '11px' : '9px';
      el.style.transform = isSelected ? 'scale(1.2)' : 'scale(1)';
      el.style.zIndex = isSelected ? '10' : '1';
      el.textContent = city.count > 99 ? '99+' : city.count.toString();

      const marker = new mapboxgl.Marker(el)
        .setLngLat(city.coords)
        .setPopup(
          new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div style="padding: 10px; min-width: 180px;">
              <h3 style="font-weight: bold; font-size: 14px; margin-bottom: 2px; color: hsl(220, 85%, 35%);">${city.city}</h3>
              <p style="font-size: 11px; color: #666; margin-bottom: 8px;">
                ${city.state}${city.cooperativa ? ` • Cooperativa: ${city.cooperativa}` : ''}
              </p>
              <div style="background: hsl(220, 20%, 97%); border-radius: 8px; padding: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                  <span style="color: #64748b;">Eventos:</span>
                  <strong style="color: hsl(220, 85%, 35%);">${city.count.toLocaleString('pt-BR')}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span style="color: #64748b;">Custo:</span>
                  <strong style="color: hsl(270, 70%, 50%);">${formatCurrency(city.custo)}</strong>
                </div>
              </div>
              <div style="font-size: 11px; color: #64748b; text-align: center;">
                ${((city.count / eventos.length) * 100).toFixed(2)}% do total
              </div>
            </div>
          `)
        )
        .addTo(map.current!);

      el.addEventListener('click', () => {
        setSelectedCity(`${city.state}-${city.city}`);
      });

      markersRef.current.push(marker);
    });
  };

  useEffect(() => {
    updateMarkers();
  }, [mapReady, locationData, selectedEstado, selectedCity, filteredCities, showClusters, showHeatmap]);

  // Funções de navegação
  const zoomToBrazil = () => {
    setSelectedEstado("todos");
    setSelectedCity(null);
    setActiveTab("estados");
    map.current?.flyTo({ center: [-55, -15], zoom: 3.5, duration: 1000 });
  };

  const zoomToState = (estado: string) => {
    const coords = STATE_COORDS[estado];
    if (coords && map.current) {
      setSelectedEstado(estado);
      setSelectedCity(null);
      setActiveTab("cidades");
      map.current.flyTo({ center: coords, zoom: 6, duration: 1500 });
    }
  };

  const zoomToCity = (city: typeof filteredCities[0]) => {
    if (city.coords && map.current) {
      setSelectedCity(`${city.state}-${city.city}`);
      map.current.flyTo({ center: city.coords, zoom: 10, duration: 1500 });
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[550px] lg:col-span-2" />
        <Skeleton className="h-[550px]" />
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

  const legendColors = [
    { color: "hsl(220, 85%, 70%)", label: "Muito baixo" },
    { color: "hsl(220, 85%, 55%)", label: "Baixo" },
    { color: "hsl(250, 75%, 55%)", label: "Médio" },
    { color: "hsl(270, 70%, 50%)", label: "Alto" },
    { color: "hsl(270, 70%, 40%)", label: "Muito alto" },
  ];

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cidade, estado ou regional..."
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedEstado} onValueChange={(v) => {
              if (v === "todos") zoomToBrazil();
              else zoomToState(v);
            }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecionar Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados ({Object.keys(locationData.byState).length})</SelectItem>
                {Object.entries(locationData.byState)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([estado, data]) => (
                    <SelectItem key={estado} value={estado}>
                      {estado} - {data.count.toLocaleString('pt-BR')} eventos
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            
            {/* Controles de visualização */}
            <div className="flex items-center gap-4 border-l pl-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="clusters"
                  checked={showClusters}
                  onCheckedChange={(checked) => {
                    setShowClusters(checked);
                    if (checked) setShowHeatmap(false);
                  }}
                />
                <Label htmlFor="clusters" className="text-sm flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Clusters
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="heatmap"
                  checked={showHeatmap}
                  onCheckedChange={(checked) => {
                    setShowHeatmap(checked);
                    if (checked) setShowClusters(false);
                  }}
                />
                <Label htmlFor="heatmap" className="text-sm flex items-center gap-1.5">
                  <Layers className="h-4 w-4" />
                  Heatmap
                </Label>
              </div>
            </div>
            
            {selectedEstado !== "todos" && (
              <Button variant="outline" size="sm" onClick={zoomToBrazil}>
                <Maximize className="h-4 w-4 mr-2" />
                Ver Brasil
              </Button>
            )}
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
                Mapa de Eventos por Cidade
                {selectedEstado !== "todos" && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">{selectedEstado}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => map.current?.zoomIn()}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => map.current?.zoomOut()}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative">
              <div ref={mapContainer} className="h-[500px] rounded-b-lg" />
              
              {/* Legenda */}
              <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm rounded-lg p-3 text-xs border shadow-lg">
                <p className="font-semibold mb-2 text-foreground">Intensidade</p>
                <div className="space-y-1">
                  {legendColors.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border border-white/50" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground text-[10px]">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Estados/Cidades */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "estados" | "cidades")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="estados" className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  Estados
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
                    {Object.keys(locationData.byState).length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="cidades" className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  Cidades
                  {selectedEstado !== "todos" && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
                      {filteredCities.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {activeTab === "estados" ? (
              <ScrollArea className="h-[430px] px-4 pb-4">
                <div className="space-y-2">
                  {filteredStates.map((estado) => (
                    <div
                      key={estado.estado}
                      onClick={() => zoomToState(estado.estado)}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer border
                        ${selectedEstado === estado.estado 
                          ? 'bg-primary/10 border-primary shadow-md' 
                          : 'bg-muted/30 border-transparent hover:bg-muted/50 hover:border-primary/30'}`}
                    >
                      <div 
                        className="flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm text-white shadow"
                        style={{ backgroundColor: getMarkerColor(estado.count, locationData.maxCount) }}
                      >
                        {estado.estado}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {estado.count.toLocaleString('pt-BR')} eventos
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {Object.keys(estado.cities).length} cidades
                          </span>
                        </div>
                        <p className="text-sm text-primary font-medium truncate">{formatCurrency(estado.custo)}</p>
                      </div>
                      <Navigation className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <ScrollArea className="h-[430px] px-4 pb-4">
                {selectedEstado === "todos" ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Selecione um estado</p>
                    <p className="text-sm">para ver as cidades</p>
                  </div>
                ) : filteredCities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Nenhuma cidade encontrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredCities.map((city, index) => {
                      const isSelected = selectedCity === `${city.state}-${city.city}`;
                      return (
                        <div
                          key={`${city.state}-${city.city}`}
                          onClick={() => zoomToCity(city)}
                          className={`p-3 rounded-lg transition-all cursor-pointer border
                            ${isSelected 
                              ? 'bg-primary/10 border-primary shadow-md' 
                              : 'bg-muted/30 border-transparent hover:bg-muted/50 hover:border-primary/30'}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div 
                                className="flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs text-white shrink-0"
                                style={{ backgroundColor: getMarkerColor(city.count, locationData.maxCityCount) }}
                              >
                                {index + 1}
                              </div>
                              <span className="font-semibold text-sm truncate" title={city.city}>
                                {city.city}
                              </span>
                            </div>
                            <Navigation className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                          
                          {city.cooperativa && (
                            <p className="text-xs text-muted-foreground mb-2 truncate pl-8" title={city.cooperativa}>
                              Cooperativa: {city.cooperativa}
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between pl-8">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {city.count.toLocaleString('pt-BR')} eventos
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                ({((city.count / eventos.length) * 100).toFixed(1)}%)
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-primary">
                              {formatCurrency(city.custo)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Regionais por Custo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Top Regionais por Custo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <TooltipProvider>
              {locationData.regionaisArray
                .slice(0, 8)
                .map((regional, index) => (
                  <Tooltip key={regional.nome}>
                    <TooltipTrigger asChild>
                      <div className="p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div 
                              className="flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white"
                              style={{ backgroundColor: getMarkerColor(regional.custo, Math.max(...locationData.regionaisArray.map(r => r.custo))) }}
                            >
                              {index + 1}
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm truncate max-w-[120px]" title={regional.nome}>
                                {regional.nome}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                {regional.estados.length} estado{regional.estados.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Custo:</span>
                            <span className="text-sm font-bold text-primary">{formatCurrency(regional.custo)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Eventos:</span>
                            <span className="text-sm font-semibold">{regional.count.toLocaleString('pt-BR')}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Cidades:</span>
                            <span className="text-sm font-semibold">{regional.cidades.length}</span>
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-2">
                        <p className="font-semibold">Estados desta regional:</p>
                        <div className="flex flex-wrap gap-1">
                          {regional.estados.map(e => (
                            <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                          ))}
                        </div>
                        {regional.cidades.length > 0 && regional.cidades.length <= 10 && (
                          <>
                            <p className="font-semibold mt-2">Cidades:</p>
                            <p className="text-xs text-muted-foreground">
                              {regional.cidades.slice(0, 10).join(', ')}
                              {regional.cidades.length > 10 && '...'}
                            </p>
                          </>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Top Cidades por Custo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Top 10 Cidades por Custo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {locationData.topCidadesCusto.map((city, index) => (
              <div 
                key={`${city.state}-${city.city}`}
                className="p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => zoomToCity(city)}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white"
                    style={{ backgroundColor: getMarkerColor(city.custo, locationData.topCidadesCusto[0]?.custo || 1) }}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm truncate" title={city.city}>
                      {city.city}
                    </h4>
                    <p className="text-xs text-muted-foreground">{city.state}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Custo:</span>
                    <span className="text-sm font-bold text-primary">{formatCurrency(city.custo)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Eventos:</span>
                    <span className="text-sm font-semibold">{city.count.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Grid de Estatísticas */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Por Tipo de Evento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Por Tipo de Evento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {locationData.tipoEventoArray.slice(0, 5).map((item, index) => (
                <div key={item.tipo} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getMarkerColor(item.count, locationData.tipoEventoArray[0]?.count || 1) }}
                    />
                    <span className="text-sm font-medium">{item.tipo}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{item.count.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.custo)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Por Motivo do Evento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Por Motivo do Evento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {locationData.motivoEventoArray.slice(0, 5).map((item, index) => (
                <div key={item.motivo} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div 
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: getMarkerColor(item.count, locationData.motivoEventoArray[0]?.count || 1) }}
                    />
                    <span className="text-sm font-medium truncate">{item.motivo}</span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-bold">{item.count.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.custo)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Por Situação */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Por Situação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {locationData.situacaoArray.slice(0, 5).map((item) => (
                <div key={item.situacao} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge 
                      variant="outline" 
                      className={`text-xs shrink-0 ${
                        item.situacao === 'FINALIZADO' ? 'bg-green-100 text-green-800 border-green-300' :
                        item.situacao === 'CANCELADO' ? 'bg-red-100 text-red-800 border-red-300' :
                        'bg-yellow-100 text-yellow-800 border-yellow-300'
                      }`}
                    >
                      {item.situacao}
                    </Badge>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-bold">{item.count.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-muted-foreground">
                      ({((item.count / eventos.length) * 100).toFixed(1)}%)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
