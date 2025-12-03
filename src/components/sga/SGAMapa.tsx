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
import { Map, Search, MapPin, AlertCircle, TrendingUp, DollarSign, ZoomIn, ZoomOut, Maximize, Building2, Navigation } from "lucide-react";
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
  "SANTA BARBARA D'OESTE": [-47.4142, -22.7536], "ARARAS": [-47.3842, -22.3569], "FERRAZ DE VASCONCELOS": [-46.3681, -23.5411],
  "FRANCISCO MORATO": [-46.7439, -23.2817], "ITAPECERICA DA SERRA": [-46.8494, -23.7169],
  // Rio de Janeiro  
  "RIO DE JANEIRO": [-43.1729, -22.9068], "NITEROI": [-43.1044, -22.8833], "DUQUE DE CAXIAS": [-43.3117, -22.7847],
  "NOVA IGUACU": [-43.4511, -22.7592], "SAO GONCALO": [-43.0533, -22.8269], "BELFORD ROXO": [-43.3992, -22.7642],
  "CAMPOS DOS GOYTACAZES": [-41.3269, -21.7625], "SAO JOAO DE MERITI": [-43.3722, -22.8039],
  "PETROPOLIS": [-43.1789, -22.5050], "VOLTA REDONDA": [-44.1042, -22.5231], "MACAE": [-41.7867, -22.3708],
  "ITABORAI": [-42.8594, -22.7444], "MESQUITA": [-43.4603, -22.8028], "NILOPOLISV": [-43.4231, -22.8058],
  "CABO FRIO": [-42.0189, -22.8789], "BARRA MANSA": [-44.1744, -22.5447], "NOVA FRIBURGO": [-42.5311, -22.2819],
  "ANGRA DOS REIS": [-44.3181, -23.0067], "TERESOPOLIS": [-42.9656, -22.4128], "MAGÉ": [-43.0408, -22.6578],
  // Minas Gerais
  "BELO HORIZONTE": [-43.9378, -19.9167], "UBERLANDIA": [-48.2772, -18.9186], "CONTAGEM": [-44.0539, -19.9319],
  "JUIZ DE FORA": [-43.3503, -21.7642], "BETIM": [-44.1983, -19.9678], "MONTES CLAROS": [-43.8617, -16.7350],
  "RIBEIRAO DAS NEVES": [-44.0867, -19.7669], "UBERABA": [-47.9319, -19.7472], "GOVERNADOR VALADARES": [-41.9500, -18.8511],
  "IPATINGA": [-42.5369, -19.4686], "SETE LAGOAS": [-44.2469, -19.4656], "DIVINOPOLIS": [-44.8836, -20.1389],
  "SANTA LUZIA": [-43.8514, -19.7697], "IBIRITE": [-44.0586, -20.0219], "POCOS DE CALDAS": [-46.5636, -21.7878],
  "PATOS DE MINAS": [-46.5181, -18.5789], "POUSO ALEGRE": [-45.9367, -22.2300], "TEOFILO OTONI": [-41.5053, -17.8575],
  "BARBACENA": [-43.7742, -21.2261], "SABARA": [-43.8064, -19.8867], "VARGINHA": [-45.4303, -21.5511],
  // Bahia
  "SALVADOR": [-38.5014, -12.9714], "FEIRA DE SANTANA": [-38.9667, -12.2667], "VITORIA DA CONQUISTA": [-40.8389, -14.8617],
  "CAMAÇARI": [-38.3253, -12.6997], "ITABUNA": [-39.2803, -14.7856], "JUAZEIRO": [-40.5008, -9.4164],
  "LAURO DE FREITAS": [-38.3217, -12.8978], "ILHEUS": [-39.0464, -14.7889], "JEQUIE": [-40.0836, -13.8514],
  "TEIXEIRA DE FREITAS": [-39.7428, -17.5353], "ALAGOINHAS": [-38.4194, -12.1356], "BARREIRAS": [-44.9903, -12.1525],
  "PORTO SEGURO": [-39.0647, -16.4497], "SIMOES FILHO": [-38.4036, -12.7867], "PAULO AFONSO": [-38.2139, -9.4006],
  // Paraná
  "CURITIBA": [-49.2731, -25.4297], "LONDRINA": [-51.1628, -23.3103], "MARINGA": [-51.9386, -23.4253],
  "PONTA GROSSA": [-50.1617, -25.0947], "CASCAVEL": [-53.4550, -24.9556], "SAO JOSE DOS PINHAIS": [-49.2069, -25.5314],
  "FOZ DO IGUACU": [-54.5881, -25.5478], "COLOMBO": [-49.2244, -25.2917], "GUARAPUAVA": [-51.4581, -25.3903],
  "PARANAGUA": [-48.5100, -25.5161], "ARAUCARIA": [-49.4103, -25.5928], "TOLEDO": [-53.7425, -24.7136],
  "APUCARANA": [-51.4608, -23.5506], "PINHAIS": [-49.1928, -25.4431], "CAMPO LARGO": [-49.5286, -25.4597],
  // Rio Grande do Sul
  "PORTO ALEGRE": [-51.2303, -30.0331], "CAXIAS DO SUL": [-51.1794, -29.1678], "CANOAS": [-51.1839, -29.9178],
  "PELOTAS": [-52.3411, -31.7654], "SANTA MARIA": [-53.8069, -29.6842], "GRAVATAÍ": [-50.9917, -29.9442],
  "VIAMAO": [-51.0833, -30.0833], "NOVO HAMBURGO": [-51.1306, -29.6789], "SAO LEOPOLDO": [-51.1478, -29.7600],
  "RIO GRANDE": [-52.0986, -32.0350], "ALVORADA": [-51.0814, -29.9903], "PASSO FUNDO": [-52.4067, -28.2628],
  "SAPUCAIA DO SUL": [-51.1450, -29.8286], "URUGUAIANA": [-57.0853, -29.7547], "SANTA CRUZ DO SUL": [-52.4256, -29.7175],
  "CACHOEIRINHA": [-51.0939, -29.9511], "BAGE": [-54.1069, -31.3311], "BENTO GONCALVES": [-51.5189, -29.1717],
  // Santa Catarina
  "FLORIANOPOLIS": [-48.5486, -27.5944], "JOINVILLE": [-48.8461, -26.3031], "BLUMENAU": [-49.0661, -26.9194],
  "CHAPECO": [-52.6156, -27.0964], "ITAJAI": [-48.6617, -26.9078], "CRICIUMA": [-49.3697, -28.6775],
  "SAO JOSE": [-48.6281, -27.6136], "LAGES": [-50.3264, -27.8156], "JARAGUA DO SUL": [-49.0669, -26.4856],
  "PALHOCA": [-48.6678, -27.6453], "BALNEARIO CAMBORIU": [-48.6347, -26.9906], "BRUSQUE": [-48.9175, -27.0978],
  "TUBARAO": [-49.0069, -28.4669], "SAO BENTO DO SUL": [-49.3786, -26.2503], "CACADOR": [-51.0150, -26.7753],
  // Goiás
  "GOIANIA": [-49.2539, -16.6869], "APARECIDA DE GOIANIA": [-49.2469, -16.8228], "ANAPOLIS": [-48.9528, -16.3281],
  "RIO VERDE": [-50.9181, -17.7928], "LUZIANIA": [-47.9506, -16.2525], "AGUAS LINDAS DE GOIAS": [-48.2817, -15.7622],
  "VALPARAISO DE GOIAS": [-49.0244, -16.0650], "TRINDADE": [-49.4897, -16.6514], "FORMOSA": [-47.3342, -15.5361],
  "NOVO GAMA": [-48.0389, -16.0592], "SENADOR CANEDO": [-49.0922, -16.7083], "ITUMBIARA": [-49.2153, -18.4192],
  // Pernambuco
  "RECIFE": [-34.8811, -8.0539], "JABOATAO DOS GUARARAPES": [-35.0153, -8.1128], "OLINDA": [-34.8553, -8.0089],
  "CARUARU": [-35.9761, -8.2850], "PETROLINA": [-40.5008, -9.3886], "PAULISTA": [-34.8728, -7.9403],
  "CABO DE SANTO AGOSTINHO": [-35.0286, -8.2836], "CAMARAGIBE": [-34.9811, -8.0228], "GARANHUNS": [-36.4936, -8.8903],
  "VITORIA DE SANTO ANTAO": [-35.2911, -8.1267], "IGARASSU": [-34.9061, -7.8344], "SAO LOURENCO DA MATA": [-35.0186, -8.0017],
  // Ceará
  "FORTALEZA": [-38.5267, -3.7172], "CAUCAIA": [-38.6531, -3.7361], "JUAZEIRO DO NORTE": [-39.3153, -7.2131],
  "MARACANAU": [-38.6256, -3.8756], "SOBRAL": [-40.3481, -3.6894], "CRATO": [-39.4103, -7.2342],
  "ITAPIPOCA": [-39.5783, -3.4944], "MARANGUAPE": [-38.6839, -3.8917], "IGUATU": [-39.2986, -6.3594],
  "QUIXADA": [-39.0147, -4.9711], "PACATUBA": [-38.6178, -3.9833], "AQUIRAZ": [-38.3903, -3.9011],
  // Pará
  "BELEM": [-48.4897, -1.4558], "ANANINDEUA": [-48.3722, -1.3656], "SANTAREM": [-54.7081, -2.4386],
  "MARABA": [-49.1178, -5.3686], "CASTANHAL": [-47.9261, -1.2939], "PARAUAPEBAS": [-49.9036, -6.0669],
  "CAMETA": [-49.4964, -2.2436], "ABAETETUBA": [-48.8789, -1.7183], "TUCURUI": [-49.6725, -3.7661],
  "BRAGANCA": [-46.7656, -1.0536], "ALTAMIRA": [-52.2108, -3.2036], "BARCARENA": [-48.6258, -1.5064],
  // Amazonas
  "MANAUS": [-60.0250, -3.1019], "PARINTINS": [-56.7353, -2.6286], "ITACOATIARA": [-58.4442, -3.1386],
  "MANACAPURU": [-60.6217, -3.2994], "COARI": [-63.1408, -4.0850], "TEFE": [-64.7108, -3.3539],
  // Maranhão
  "SAO LUIS": [-44.2825, -2.5297], "IMPERATRIZ": [-47.4919, -5.5189], "TIMON": [-42.8364, -5.0944],
  "CAXIAS": [-43.3617, -4.8589], "CODÓ": [-43.8856, -4.4550], "ACAILANDIA": [-47.0508, -4.9489],
  "BACABAL": [-44.7808, -4.2244], "SANTA INES": [-45.3800, -3.6667], "BALSAS": [-46.0356, -7.5328],
  // Mato Grosso
  "CUIABA": [-56.0978, -15.6014], "VARZEA GRANDE": [-56.1328, -15.6458], "RONDONOPOLIS": [-54.6356, -16.4697],
  "SINOP": [-55.5036, -11.8644], "TANGARA DA SERRA": [-57.4989, -14.6228], "CACERES": [-57.6836, -16.0767],
  "SORRISO": [-55.7108, -12.5428], "LUCAS DO RIO VERDE": [-55.9036, -13.0500], "PRIMAVERA DO LESTE": [-54.2969, -15.5608],
  // Mato Grosso do Sul
  "CAMPO GRANDE": [-54.6464, -20.4428], "DOURADOS": [-54.8056, -22.2211], "TRES LAGOAS": [-51.6786, -20.7511],
  "CORUMBA": [-57.6533, -19.0092], "PONTA PORA": [-55.7256, -22.5358], "NAVIRAI": [-54.1911, -23.0642],
  "NOVA ANDRADINA": [-53.3433, -22.2328], "AQUIDAUANA": [-55.7872, -20.4747], "SIDROLANDIA": [-54.9611, -20.9319],
  // Piauí
  "TERESINA": [-42.8019, -5.0920], "PARNAIBA": [-41.7769, -2.9047], "PICOS": [-41.4669, -7.0767],
  "FLORIANO": [-43.0225, -6.7669], "PIRIPIRI": [-41.7769, -4.2736],
  // Rio Grande do Norte
  "NATAL": [-35.2094, -5.7950], "MOSSORO": [-37.3442, -5.1875], "PARNAMIRIM": [-35.2628, -5.9158],
  "SAO GONCALO DO AMARANTE": [-35.3289, -5.7906], "MACAIBA": [-35.3556, -5.8536], "CEARA MIRIM": [-35.4272, -5.6353],
  // Paraíba
  "JOAO PESSOA": [-34.8631, -7.1153], "CAMPINA GRANDE": [-35.8811, -7.2306], "SANTA RITA": [-34.9781, -7.1136],
  "PATOS": [-37.2747, -7.0175], "BAYEUX": [-34.9322, -7.1250], "SOUSA": [-38.2289, -6.7589],
  "CABEDELO": [-34.8339, -6.9814], "CAJAZEIRAS": [-38.5561, -6.8906],
  // Sergipe
  "ARACAJU": [-37.0714, -10.9472], "NOSSA SENHORA DO SOCORRO": [-37.1264, -10.8550], "LAGARTO": [-37.6531, -10.9169],
  "ITABAIANA": [-37.4253, -10.6850], "SAO CRISTOVAO": [-37.2064, -11.0139], "ESTANCIA": [-37.4381, -11.2681],
  // Alagoas
  "MACEIO": [-35.7353, -9.6658], "ARAPIRACA": [-36.6611, -9.7525], "RIO LARGO": [-35.8431, -9.4781],
  "PALMEIRA DOS INDIOS": [-36.6328, -9.4067], "UNIAO DOS PALMARES": [-36.0319, -9.1628],
  // Espírito Santo
  "VITORIA": [-40.3378, -20.2976], "VILA VELHA": [-40.2897, -20.3297], "SERRA": [-40.3078, -20.1283],
  "CARIACICA": [-40.4197, -20.2636], "CACHOEIRO DE ITAPEMIRIM": [-41.1128, -20.8489], "LINHARES": [-40.0719, -19.3911],
  "SAO MATEUS": [-39.8575, -18.7183], "COLATINA": [-40.6308, -19.5389], "GUARAPARI": [-40.4997, -20.6733],
  // Tocantins
  "PALMAS": [-48.3336, -10.2128], "ARAGUAINA": [-48.2072, -7.1911], "GURUPI": [-49.0686, -11.7294],
  "PORTO NACIONAL": [-48.4172, -10.7081],
  // Rondônia
  "PORTO VELHO": [-63.9039, -8.7619], "JI PARANA": [-61.9517, -10.8853], "ARIQUEMES": [-63.0333, -9.9133],
  "VILHENA": [-60.1456, -12.7406], "CACOAL": [-61.4428, -11.4386],
  // Acre
  "RIO BRANCO": [-67.8100, -9.9747], "CRUZEIRO DO SUL": [-72.6756, -7.6306],
  // Amapá
  "MACAPA": [-51.0669, 0.0356], "SANTANA": [-51.1728, -0.0583],
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
  // Gradiente de azul claro → azul → roxo → roxo escuro
  if (ratio < 0.2) return "hsl(220, 85%, 70%)";  // azul claro
  if (ratio < 0.4) return "hsl(220, 85%, 55%)";  // azul (primary)
  if (ratio < 0.6) return "hsl(250, 75%, 55%)";  // azul-roxo
  if (ratio < 0.8) return "hsl(270, 70%, 50%)";  // roxo
  return "hsl(270, 70%, 40%)";  // roxo escuro
};

// Normalizar nome de cidade para busca
const normalizeCity = (name: string): string => {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();
};

// Buscar coordenadas da cidade
const getCityCoords = (cityName: string, state: string): [number, number] | null => {
  const normalized = normalizeCity(cityName);
  
  // Busca exata
  if (BRAZILIAN_CITIES[normalized]) {
    return BRAZILIAN_CITIES[normalized];
  }
  
  // Busca parcial - verificar se alguma cidade conhecida está contida no nome
  for (const [knownCity, coords] of Object.entries(BRAZILIAN_CITIES)) {
    if (normalized.includes(knownCity) || knownCity.includes(normalized)) {
      return coords;
    }
  }
  
  // Fallback: usar coordenadas do estado com offset baseado no nome
  const stateCoords = STATE_COORDS[state];
  if (stateCoords) {
    const hash = normalized.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const offsetLng = ((hash % 100) / 100 - 0.5) * 1.5;
    const offsetLat = (((hash >> 8) % 100) / 100 - 0.5) * 1.5;
    return [stateCoords[0] + offsetLng, stateCoords[1] + offsetLat];
  }
  
  return null;
};

export default function SGAMapa({ eventos, loading }: SGAMapaProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [searchCity, setSearchCity] = useState("");
  const [selectedEstado, setSelectedEstado] = useState<string>("todos");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeTab, setActiveTab] = useState<"estados" | "cidades">("estados");

  // Agregar eventos por localização
  const locationData = useMemo(() => {
    const byState: { [key: string]: { count: number; custo: number; cities: { [key: string]: { count: number; custo: number; regional?: string } } } } = {};
    
    eventos.forEach(e => {
      const estado = e.evento_estado?.toUpperCase() || "";
      const cidade = e.cooperativa?.toUpperCase() || "";
      const regional = e.regional || "";
      
      // Filtrar apenas siglas de estado válidas
      if (estado && estado.length === 2 && STATE_COORDS[estado]) {
        if (!byState[estado]) {
          byState[estado] = { count: 0, custo: 0, cities: {} };
        }
        byState[estado].count += 1;
        byState[estado].custo += e.custo_evento || 0;
        
        if (cidade && cidade !== "N/I" && cidade !== "NAO INFORMADO") {
          if (!byState[estado].cities[cidade]) {
            byState[estado].cities[cidade] = { count: 0, custo: 0, regional };
          }
          byState[estado].cities[cidade].count += 1;
          byState[estado].cities[cidade].custo += e.custo_evento || 0;
        }
      }
    });

    // Criar lista de cidades com coordenadas
    const byCityGlobal: { state: string; city: string; count: number; custo: number; coords: [number, number] | null; regional?: string }[] = [];
    
    Object.entries(byState).forEach(([state, data]) => {
      Object.entries(data.cities).forEach(([city, cityData]) => {
        const coords = getCityCoords(city, state);
        byCityGlobal.push({
          state,
          city,
          count: cityData.count,
          custo: cityData.custo,
          coords,
          regional: cityData.regional
        });
      });
    });

    const maxCount = Math.max(...Object.values(byState).map(s => s.count), 1);
    const maxCityCount = Math.max(...byCityGlobal.map(c => c.count), 1);

    return { byState, byCityGlobal, maxCount, maxCityCount };
  }, [eventos]);

  // Cidades filtradas pelo estado selecionado
  const filteredCities = useMemo(() => {
    let cities = locationData.byCityGlobal;
    
    if (selectedEstado !== "todos") {
      cities = cities.filter(c => c.state === selectedEstado);
    }
    
    if (searchCity) {
      const search = normalizeCity(searchCity);
      cities = cities.filter(c => 
        normalizeCity(c.city).includes(search) || 
        c.state.includes(search) ||
        (c.regional && normalizeCity(c.regional).includes(search))
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
      setMapReady(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Atualizar marcadores
  const updateMarkers = () => {
    if (!map.current || !mapReady) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const zoom = map.current.getZoom();
    const showCities = zoom >= 5 || selectedEstado !== "todos";

    if (showCities) {
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
                  ${city.state}${city.regional ? ` • ${city.regional}` : ''}
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
    } else {
      Object.entries(locationData.byState).forEach(([state, data]) => {
        const coords = STATE_COORDS[state];
        if (!coords) return;

        const size = Math.max(35, Math.min(70, 35 + (data.count / locationData.maxCount) * 35));
        const color = getMarkerColor(data.count, locationData.maxCount);
        const cityCount = Object.keys(data.cities).length;

        const el = document.createElement('div');
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
        el.innerHTML = `<span style="font-size:13px;font-weight:800">${state}</span><span style="font-size:9px">${data.count > 999 ? Math.round(data.count/1000) + 'k' : data.count}</span>`;

        const marker = new mapboxgl.Marker(el)
          .setLngLat(coords)
          .setPopup(
            new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
              <div style="padding: 10px; min-width: 200px;">
                <h3 style="font-weight: bold; font-size: 16px; margin-bottom: 8px; color: hsl(220, 85%, 35%);">${state}</h3>
                <div style="background: hsl(220, 20%, 97%); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                  <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px;">
                    <span style="color: #64748b;">Eventos:</span>
                    <strong style="color: hsl(220, 85%, 35%);">${data.count.toLocaleString('pt-BR')}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px;">
                    <span style="color: #64748b;">Custo:</span>
                    <strong style="color: hsl(270, 70%, 50%);">${formatCurrency(data.custo)}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 14px;">
                    <span style="color: #64748b;">Cidades:</span>
                    <strong style="color: hsl(220, 85%, 35%);">${cityCount}</strong>
                  </div>
                </div>
                <p style="font-size: 11px; color: hsl(220, 85%, 55%); text-align: center; font-weight: 500;">
                  Clique para ver cidades
                </p>
              </div>
            `)
          )
          .addTo(map.current!);

        el.addEventListener('click', () => {
          setSelectedEstado(state);
          setActiveTab("cidades");
          map.current?.flyTo({ center: coords, zoom: 6, duration: 1500 });
        });

        markersRef.current.push(marker);
      });
    }
  };

  useEffect(() => {
    updateMarkers();
  }, [mapReady, locationData, selectedEstado, selectedCity, filteredCities]);

  useEffect(() => {
    if (!map.current || !mapReady) return;
    const handleZoom = () => updateMarkers();
    map.current.on('zoomend', handleZoom);
    return () => { map.current?.off('zoomend', handleZoom); };
  }, [mapReady, locationData, selectedEstado, selectedCity]);

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

  // Cores para a legenda
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
                Mapa de Eventos
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
                  {filteredStates.map((estado, index) => (
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
                          
                          {city.regional && (
                            <p className="text-xs text-muted-foreground mb-2 truncate pl-8" title={city.regional}>
                              Regional: {city.regional}
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

      {/* Top Cidades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Top Cidades por Custo
            {selectedEstado !== "todos" && (
              <Badge variant="secondary" className="bg-primary/10 text-primary">{selectedEstado}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCities
              .sort((a, b) => b.custo - a.custo)
              .slice(0, 8)
              .map((city, index) => (
                <div
                  key={`${city.state}-${city.city}`}
                  className="p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => zoomToCity(city)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div 
                        className="flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs text-white"
                        style={{ backgroundColor: getMarkerColor(city.custo, Math.max(...filteredCities.map(c => c.custo))) }}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm truncate max-w-[120px]" title={city.city}>
                          {city.city}
                        </h4>
                        <p className="text-xs text-muted-foreground">{city.state}</p>
                      </div>
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
    </div>
  );
}
