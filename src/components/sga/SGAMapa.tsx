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

// Base de cidades brasileiras com coordenadas precisas (latitude, longitude)
const BRAZILIAN_CITIES: { [key: string]: [number, number] } = {
  // ========== SÃO PAULO ==========
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
  "ITAPETININGA": [-48.0531, -23.5917], "SERTAOZINHO": [-47.9903, -21.1378], "ATIBAIA": [-46.5561, -23.1172],
  "JABOTICABAL": [-48.3228, -21.2550], "CATANDUVA": [-48.9728, -21.1378], "ASSIS": [-50.4119, -22.6617],
  "OURINHOS": [-49.8708, -22.9786], "LINS": [-49.7425, -21.6786], "BOTUCATU": [-48.4450, -22.8858],
  "TATUI": [-47.8569, -23.3564], "CUBATAO": [-46.4256, -23.8953], "VOTORANTIM": [-47.4378, -23.5456],
  "BRAGANCA PAULISTA": [-46.5422, -22.9519], "ITAPIRA": [-46.8219, -22.4361], "MOGI GUACU": [-46.9419, -22.3717],
  "ITANHAEM": [-46.7889, -24.1833], "PINDAMONHANGABA": [-45.4617, -22.9242], "ITU": [-47.2992, -23.2642],
  "BIRIGUI": [-50.3408, -21.2886], "SAO JOAO DA BOA VISTA": [-46.7978, -21.9689], "MOCOCA": [-47.0047, -21.4675],
  "ARARAS": [-47.3844, -22.3567], "BEBEDOURO": [-48.4792, -20.9492], "LEME": [-47.3906, -22.1856],
  "FERNANDOPOLIS": [-50.2458, -20.2839], "VOTUPORANGA": [-49.9728, -20.4228], "SAO JOSE DO RIO PRETO": [-49.3794, -20.8197],
  "ARACATUBA": [-50.4328, -21.2089], "BARRETOS": [-48.5678, -20.5572], "OLIMPIA": [-48.9147, -20.7375],
  "REGISTRO": [-47.8433, -24.4875], "CRUZEIRO": [-44.9631, -22.5769], "LORENA": [-45.1244, -22.7311],
  "CARAGUATATUBA": [-45.4131, -23.6203], "UBATUBA": [-45.0711, -23.4339], "SAO SEBASTIAO SP": [-45.4100, -23.8100],
  "AVARE": [-48.9256, -23.0986], "ITAPEVA": [-48.8756, -23.9822], "PENAPOLIS": [-50.0775, -21.4194],
  "TUPÃ": [-50.5139, -21.9344], "ANDRADINA": [-51.3792, -20.8958], "DRACENA": [-51.5336, -21.4847],
  "ADAMANTINA": [-51.0739, -21.6867], "LUCELIA": [-51.0200, -21.7200], "OSVALDO CRUZ": [-50.8797, -21.7972],
  "SAO CAETANO DO SUL": [-46.5508, -23.6233], "FRANCO DA ROCHA": [-46.7258, -23.3217], "FERRAZ DE VASCONCELOS": [-46.3686, -23.5411],
  "POA": [-46.3447, -23.5267], "ITAPECERICA DA SERRA": [-46.8492, -23.7172], "SANTANA DE PARNAIBA": [-46.9175, -23.4439],
  "VARGEM GRANDE PAULISTA": [-47.0278, -23.5997], "EMBU GUACU": [-46.8117, -23.8311], "SAO ROQUE": [-47.1356, -23.5289],
  "IBIUNA": [-47.2228, -23.6564], "PIEDADE": [-47.4275, -23.7136], "PORTO FELIZ": [-47.5239, -23.2156],
  "SALTO": [-47.2869, -23.2008], "CERQUILHO": [-47.7436, -23.1650], "BOITUVA": [-47.6722, -23.2833],
  
  // ========== RIO DE JANEIRO ==========
  "RIO DE JANEIRO": [-43.1729, -22.9068], "NITEROI": [-43.1044, -22.8833], "DUQUE DE CAXIAS": [-43.3117, -22.7847],
  "NOVA IGUACU": [-43.4511, -22.7592], "SAO GONCALO": [-43.0533, -22.8269], "BELFORD ROXO": [-43.3992, -22.7642],
  "CAMPOS DOS GOYTACAZES": [-41.3269, -21.7625], "SAO JOAO DE MERITI": [-43.3722, -22.8039],
  "PETROPOLIS": [-43.1789, -22.5050], "VOLTA REDONDA": [-44.1042, -22.5231], "MACAE": [-41.7867, -22.3708],
  "ITABORAI": [-42.8594, -22.7472], "MAGÉ": [-43.0397, -22.6569], "MESQUITA": [-43.4600, -22.8028],
  "NILOPOLOS": [-43.4231, -22.8064], "QUEIMADOS": [-43.5519, -22.7106], "TERESOPOLIS": [-42.9658, -22.4128],
  "CABO FRIO": [-42.0189, -22.8797], "ARARUAMA": [-42.3431, -22.8728], "SAQUAREMA": [-42.5103, -22.9203],
  "NOVA FRIBURGO": [-42.5311, -22.2817], "ANGRA DOS REIS": [-44.3189, -23.0067], "RESENDE": [-44.4464, -22.4686],
  "BARRA MANSA": [-44.1711, -22.5439], "TRES RIOS": [-43.2086, -22.1169], "PARAIBA DO SUL": [-43.2906, -22.1589],
  "VALENCA RJ": [-43.7022, -22.2456], "BARRA DO PIRAI": [-43.8258, -22.4711], "PIRAI": [-43.8981, -22.6286],
  "ITAGUAI": [-43.7758, -22.8511], "SEROPEDICA": [-43.7089, -22.7444], "PARACAMBI": [-43.7108, -22.6097],
  "JAPERI": [-43.6533, -22.6431], "GUAPIMIRIM": [-42.9817, -22.5369], "CACHOEIRAS DE MACACU": [-42.6528, -22.4628],
  "RIO BONITO": [-42.6258, -22.7111], "SILVA JARDIM": [-42.3928, -22.6506], "CASIMIRO DE ABREU": [-42.2039, -22.4797],
  "RIO DAS OSTRAS": [-41.9431, -22.5269], "ARMACAO DOS BUZIOS": [-41.8819, -22.7469],
  
  // ========== MINAS GERAIS ==========
  "BELO HORIZONTE": [-43.9378, -19.9167], "UBERLANDIA": [-48.2772, -18.9186], "CONTAGEM": [-44.0539, -19.9319],
  "JUIZ DE FORA": [-43.3503, -21.7642], "BETIM": [-44.1983, -19.9678], "MONTES CLAROS": [-43.8617, -16.7350],
  "RIBEIRAO DAS NEVES": [-44.0867, -19.7669], "UBERABA": [-47.9319, -19.7472], "GOVERNADOR VALADARES": [-41.9500, -18.8511],
  "IPATINGA": [-42.5369, -19.4686], "SETE LAGOAS": [-44.2469, -19.4656], "DIVINOPOLIS": [-44.8836, -20.1389],
  "SANTA LUZIA": [-43.8514, -19.7697], "IBIRITE": [-44.0583, -20.0222], "POCOS DE CALDAS": [-46.5617, -21.7878],
  "PATOS DE MINAS": [-46.5181, -18.5789], "POUSO ALEGRE": [-45.9364, -22.2300], "TEOFILO OTONI": [-41.5053, -17.8575],
  "BARBACENA": [-43.7736, -21.2256], "SABARA": [-43.8067, -19.8858], "VARGINHA": [-45.4303, -21.5511],
  "CONSELHEIRO LAFAIETE": [-43.7856, -20.6603], "ARAGUARI": [-48.1878, -18.6486], "ITABIRA": [-43.2267, -19.6189],
  "PASSOS": [-46.6092, -20.7189], "CORONEL FABRICIANO": [-42.6286, -19.5186], "MURIAE": [-42.3661, -21.1306],
  "ITUIUTABA": [-49.4644, -18.9689], "LAVRAS": [-45.0003, -21.2458], "NOVA LIMA": [-43.8467, -19.9858],
  "ARAXA": [-46.9406, -19.5933], "CARATINGA": [-42.1392, -19.7897], "PATROCINIO": [-46.9928, -18.9439],
  "MANHUACU": [-42.0286, -20.2572], "VESPASIANO": [-43.9239, -19.6919], "ITAJUBA": [-45.4528, -22.4256],
  "CATAGUASES": [-42.6936, -21.3897], "SAO JOAO DEL REI": [-44.2617, -21.1353], "PARA DE MINAS": [-44.6078, -19.8603],
  "ALFENAS": [-45.9472, -21.4294], "TRES CORACOES": [-45.2556, -21.6947], "OURO PRETO": [-43.5044, -20.3856],
  "FORMIGA": [-45.4264, -20.4642], "BOA ESPERANCA": [-45.5644, -21.0936], "LAGOA SANTA": [-43.8908, -19.6281],
  "CURVELO": [-44.4306, -18.7564], "JOAO MONLEVADE": [-43.1736, -19.8119], "TIMOTEO": [-42.6450, -19.5836],
  "SANTOS DUMONT": [-43.5472, -21.4600], "LEOPOLDINA": [-42.6428, -21.5322], "PEDRO LEOPOLDO": [-44.0425, -19.6178],
  "MATOZINHOS": [-44.0867, -19.5536], "UBAPORANGA": [-42.1081, -19.6372], "PIRAPORA": [-44.9428, -17.3447],
  "JANUARIA": [-44.3614, -15.4878], "JANAUBA": [-43.3086, -15.8036], "SALINAS": [-42.2967, -16.1756],
  
  // ========== BAHIA ==========
  "SALVADOR": [-38.5014, -12.9714], "FEIRA DE SANTANA": [-38.9667, -12.2667], "VITORIA DA CONQUISTA": [-40.8389, -14.8617],
  "CAMACARI": [-38.3253, -12.6997], "ITABUNA": [-39.2803, -14.7856], "JUAZEIRO": [-40.5008, -9.4164],
  "LAURO DE FREITAS": [-38.3217, -12.8978], "ILHEUS": [-39.0464, -14.7889], "JEQUIE": [-40.0836, -13.8517],
  "TEIXEIRA DE FREITAS": [-39.7417, -17.5392], "ALAGOINHAS": [-38.4192, -12.1356], "BARREIRAS": [-44.9900, -12.1528],
  "PORTO SEGURO": [-39.0644, -16.4497], "SIMOES FILHO": [-38.4014, -12.7864], "PAULO AFONSO": [-38.2142, -9.4064],
  "EUNAPOLIS": [-39.5803, -16.3778], "SANTO ANTONIO DE JESUS": [-39.2611, -12.9689], "VALENCA BA": [-39.0728, -13.3706],
  "CANDEIAS": [-38.5475, -12.6722], "GUANAMBI": [-42.7817, -14.2236], "JACOBINA": [-40.5178, -11.1803],
  "SENHOR DO BONFIM": [-40.1897, -10.4611], "SERRINHA": [-39.0078, -11.6647], "IRECE": [-41.8558, -11.3033],
  "CRUZ DAS ALMAS": [-39.1011, -12.6722], "ITAPETINGA": [-40.2483, -15.2489], "SANTO AMARO": [-38.7119, -12.5478],
  "DIAS DAVILA": [-38.2936, -12.6147], "BRUMADO": [-41.6653, -14.2036], "BOM JESUS DA LAPA": [-43.4178, -13.2553],
  "LUIS EDUARDO MAGALHAES": [-45.7858, -12.0947], "SAO FRANCISCO DO CONDE": [-38.6286, -12.6297],
  
  // ========== PARANÁ ==========
  "CURITIBA": [-49.2731, -25.4297], "LONDRINA": [-51.1628, -23.3103], "MARINGA": [-51.9386, -23.4253],
  "PONTA GROSSA": [-50.1617, -25.0947], "CASCAVEL PR": [-53.4550, -24.9556], "SAO JOSE DOS PINHAIS": [-49.2069, -25.5314],
  "FOZ DO IGUACU": [-54.5881, -25.5478], "COLOMBO": [-49.2244, -25.2917], "GUARAPUAVA": [-51.4581, -25.3903],
  "PARANAGUA": [-48.5103, -25.5206], "ARAUCARIA": [-49.4103, -25.5925], "TOLEDO": [-53.7428, -24.7136],
  "APUCARANA": [-51.4611, -23.5508], "PINHAIS": [-49.1928, -25.4431], "CAMPO LARGO": [-49.5286, -25.4597],
  "ARAPONGAS": [-51.4247, -23.4153], "ALMIRANTE TAMANDARE": [-49.3033, -25.3256], "UMUARAMA": [-53.3250, -23.7656],
  "PIRAQUARA": [-49.0633, -25.4422], "CAMBE": [-51.2778, -23.2756], "CAMPO MOURAO": [-52.3831, -24.0456],
  "FAZENDA RIO GRANDE": [-49.3072, -25.6622], "FRANCISCO BELTRAO": [-53.0550, -26.0786], "PATO BRANCO": [-52.6706, -26.2286],
  "CIANORTE": [-52.6047, -23.6625], "SARANDI": [-51.8744, -23.4442], "PARANAVAÍ": [-52.4653, -23.0731],
  "CASTRO": [-50.0114, -24.7903], "ROLANDIA": [-51.3689, -23.3103], "IRATI": [-50.6497, -25.4706],
  "UNIAO DA VITORIA": [-51.0869, -26.2308], "TELEMACO BORBA": [-50.6144, -24.3244], "IBIPORA": [-51.0483, -23.2686],
  "LAPA": [-49.7156, -25.7697], "MARECHAL CANDIDO RONDON": [-54.0578, -24.5558], "MEDIANEIRA": [-54.0944, -25.2956],
  "PALMAS PR": [-51.9906, -26.4842], "CORNELIO PROCOPIO": [-50.6475, -23.1808], "ASSIS CHATEAUBRIAND": [-53.5217, -24.4172],
  
  // ========== RIO GRANDE DO SUL ==========
  "PORTO ALEGRE": [-51.2303, -30.0331], "CAXIAS DO SUL": [-51.1794, -29.1678], "CANOAS": [-51.1839, -29.9178],
  "PELOTAS": [-52.3411, -31.7654], "SANTA MARIA RS": [-53.8069, -29.6842], "GRAVATAI": [-50.9917, -29.9442],
  "VIAMAO": [-51.0833, -30.0833], "NOVO HAMBURGO": [-51.1306, -29.6789], "SAO LEOPOLDO": [-51.1478, -29.7600],
  "RIO GRANDE": [-52.0986, -32.0350], "ALVORADA": [-51.0539, -29.9906], "PASSO FUNDO": [-52.4064, -28.2622],
  "SAPUCAIA DO SUL": [-51.1453, -29.8283], "URUGUAIANA": [-57.0881, -29.7547], "SANTA CRUZ DO SUL": [-52.4256, -29.7175],
  "CACHOEIRINHA": [-51.0933, -29.9514], "BAGE": [-54.1069, -31.3311], "BENTO GONCALVES": [-51.5189, -29.1697],
  "ERECHIM": [-52.2739, -27.6342], "GUAIBA": [-51.3253, -30.1139], "CACHOEIRA DO SUL": [-52.8936, -30.0392],
  "ESTEIO": [-51.1781, -29.8619], "SANTANA DO LIVRAMENTO": [-55.5328, -30.8908], "SAO BORJA": [-56.0044, -28.6608],
  "LAJEADO": [-51.9614, -29.4669], "IJUI": [-53.9147, -28.3878], "SAPIRANGA": [-51.0056, -29.6356],
  "ALEGRETE": [-55.7919, -29.7828], "CAMPO BOM": [-51.0589, -29.6756], "VENANCIO AIRES": [-52.1917, -29.6058],
  "FARROUPILHA": [-51.3478, -29.2250], "TAQUARA": [-50.7789, -29.6500], "CAMAQUA": [-51.8119, -30.8506],
  "CRUZ ALTA": [-53.6061, -28.6389], "MONTENEGRO": [-51.4608, -29.6886], "SANTA ROSA": [-54.4814, -27.8706],
  "SAO GABRIEL": [-54.3208, -30.3358], "VACARIA": [-50.7033, -28.7572], "PAROBÉ": [-50.8353, -29.6283],
  "ESTANCIA VELHA": [-51.1803, -29.6556], "CANELA": [-50.8136, -29.3656], "GRAMADO": [-50.8742, -29.3769],
  "CAPAO DA CANOA": [-50.0092, -29.7456], "TORRES": [-49.7269, -29.3356], "TRAMANDAI": [-50.1319, -29.9844],
  "OSORIO": [-50.2689, -29.8869], "SANTO ANGELO": [-54.2628, -28.2992], "SAO LUIZ GONZAGA": [-54.9611, -28.4081],
  
  // ========== SANTA CATARINA ==========
  "FLORIANOPOLIS": [-48.5486, -27.5944], "JOINVILLE": [-48.8461, -26.3031], "BLUMENAU": [-49.0661, -26.9194],
  "CHAPECO": [-52.6156, -27.0964], "ITAJAI": [-48.6617, -26.9078], "CRICIUMA": [-49.3697, -28.6775],
  "SAO JOSE": [-48.6283, -27.6136], "LAGES": [-50.3264, -27.8153], "JARAGUA DO SUL": [-49.0714, -26.4858],
  "PALHOCA": [-48.6678, -27.6456], "BALNEARIO CAMBORIU": [-48.6508, -26.9908], "BRUSQUE": [-48.9175, -27.0978],
  "TUBARAO": [-49.0069, -28.4667], "SAO BENTO DO SUL": [-49.3786, -26.2503], "CACADOR": [-51.0150, -26.7753],
  "CONCORDIA": [-52.0278, -27.2342], "CAMBORIU": [-48.6519, -27.0256], "NAVEGANTES": [-48.6542, -26.8989],
  "RIO DO SUL": [-49.6431, -27.2142], "ARARANGUA": [-49.4858, -28.9344], "BIGUACU": [-48.6558, -27.4958],
  "GASPAR": [-48.9589, -26.9317], "INDAIAL": [-49.2319, -26.8978], "MAFRA": [-49.8050, -26.1114],
  "ITAPEMA": [-48.6131, -27.0906], "XANXERE": [-52.4036, -26.8758], "CANOINHAS": [-50.3897, -26.1772],
  "SAO MIGUEL DO OESTE": [-53.5181, -26.7253], "VIDEIRA": [-51.1528, -27.0081], "IMBITUBA": [-48.6703, -28.2406],
  "LAGUNA": [-48.7800, -28.4828], "TIMBO": [-49.2736, -26.8236], "POMERODE": [-49.1764, -26.7408],
  "RIO NEGRINHO": [-49.5178, -26.2586], "PENHA": [-48.6453, -26.7692], "PORTO BELO": [-48.5531, -27.1556],
  
  // ========== GOIÁS ==========
  "GOIANIA": [-49.2539, -16.6869], "APARECIDA DE GOIANIA": [-49.2469, -16.8228], "ANAPOLIS": [-48.9528, -16.3281],
  "RIO VERDE": [-50.9281, -17.7928], "LUZIANIA": [-47.9500, -16.2525], "AGUAS LINDAS DE GOIAS": [-48.2772, -15.7678],
  "VALPARAISO DE GOIAS": [-49.0236, -16.0681], "TRINDADE": [-49.4897, -16.6517], "FORMOSA": [-47.3339, -15.5375],
  "NOVO GAMA": [-48.0392, -16.0592], "ITUMBIARA": [-49.2139, -18.4192], "SENADOR CANEDO": [-49.0928, -16.7086],
  "CATALAO": [-47.9461, -18.1656], "JATAI": [-51.7147, -17.8817], "PLANALTINA": [-47.6144, -15.4536],
  "CALDAS NOVAS": [-48.6256, -17.7417], "GOIANESIA": [-49.1192, -15.3111], "MINEIROS": [-52.5536, -17.5686],
  "SANTO ANTONIO DO DESCOBERTO": [-48.2597, -15.9417], "GOIANIRA": [-49.4264, -16.4958], "INHUMAS": [-49.4986, -16.3617],
  "CIDADE OCIDENTAL": [-47.9236, -16.0781], "JARAGUA": [-49.3344, -15.7561], "PORANGATU": [-49.1492, -13.4408],
  
  // ========== PERNAMBUCO ==========
  "RECIFE": [-34.8811, -8.0539], "JABOATAO DOS GUARARAPES": [-35.0153, -8.1128], "OLINDA": [-34.8553, -8.0089],
  "CARUARU": [-35.9761, -8.2850], "PETROLINA": [-40.5008, -9.3886], "PAULISTA": [-34.8728, -7.9406],
  "CABO DE SANTO AGOSTINHO": [-35.0353, -8.2856], "CAMARAGIBE": [-34.9806, -8.0217], "GARANHUNS": [-36.4961, -8.8906],
  "VITORIA DE SANTO ANTAO": [-35.2917, -8.1264], "IGARASSU": [-34.9058, -7.8342], "SAO LOURENCO DA MATA": [-35.0189, -8.0028],
  "ABREU E LIMA": [-34.8989, -7.9103], "IPOJUCA": [-35.0589, -8.3994], "SERRA TALHADA": [-38.2956, -7.9856],
  "SANTA CRUZ DO CAPIBARIBE": [-36.2050, -7.9572], "ARARIPINA": [-40.4986, -7.5764], "GRAVATA": [-35.5644, -8.2006],
  "CARPINA": [-35.2511, -7.8456], "GOIANA": [-34.9967, -7.5606], "BEZERROS": [-35.7539, -8.2356],
  
  // ========== CEARÁ ==========
  "FORTALEZA": [-38.5267, -3.7172], "CAUCAIA": [-38.6531, -3.7361], "JUAZEIRO DO NORTE": [-39.3153, -7.2131],
  "MARACANAU": [-38.6256, -3.8756], "SOBRAL": [-40.3481, -3.6894], "CRATO": [-39.4103, -7.2350],
  "ITAPIPOCA": [-39.5783, -3.4942], "MARANGUAPE": [-38.6836, -3.8919], "IGUATU": [-39.2986, -6.3594],
  "QUIXADA": [-39.0153, -4.9706], "PACATUBA": [-38.6203, -3.9847], "CASCAVEL CE": [-38.2417, -4.1328],
  "AQUIRAZ": [-38.3906, -3.9017], "CANINDE": [-39.3117, -4.3589], "RUSSAS": [-37.9758, -4.9406],
  "TIANGUA": [-40.9919, -3.7319], "EUSEBIO": [-38.4558, -3.8903], "ARACATI": [-37.7694, -4.5625],
  "PACAJUS": [-38.4619, -4.1728], "MORADA NOVA": [-38.3725, -5.1064], "CRATEÚS": [-40.6778, -5.1781],
  "LIMOEIRO DO NORTE": [-38.0986, -5.1458], "SAO GONCALO DO AMARANTE CE": [-38.9678, -3.6058], "HORIZONTE": [-38.4958, -4.0992],
  
  // ========== PARÁ ==========
  "BELEM": [-48.4897, -1.4558], "ANANINDEUA": [-48.3722, -1.3656], "SANTAREM": [-54.7081, -2.4386],
  "MARABA": [-49.1178, -5.3686], "CASTANHAL": [-47.9261, -1.2939], "PARAUAPEBAS": [-49.9036, -6.0672],
  "ABAETETUBA": [-48.8786, -1.7178], "CAMETA": [-49.4961, -2.2444], "BRAGANCA": [-46.7656, -1.0539],
  "MARITUBA": [-48.3431, -1.3614], "ITAITUBA": [-55.9833, -4.2761], "BARCARENA": [-48.6236, -1.5106],
  "TUCURUI": [-49.6722, -3.7658], "ALTAMIRA": [-52.2100, -3.2117], "TAILANDIA": [-48.9478, -2.9456],
  "SAO FELIX DO XINGU": [-51.9950, -6.6458], "REDENÇÃO": [-50.0319, -8.0286], "CAPANEMA": [-47.1817, -1.1958],
  "PARAGOMINAS": [-47.3528, -2.9631], "BREVES": [-50.4800, -1.6822], "TOME ACU": [-48.1522, -2.4186],
  "SALINOPOLIS": [-47.3561, -0.6142], "SANTANA DO ARAGUAIA": [-50.3500, -9.3300], "ORIXIMINA": [-55.8658, -1.7658],
  
  // ========== AMAZONAS ==========
  "MANAUS": [-60.0250, -3.1019], "PARINTINS": [-56.7353, -2.6286], "ITACOATIARA": [-58.4442, -3.1386],
  "MANACAPURU": [-60.6208, -3.2992], "COARI": [-63.1408, -4.0858], "TEFÉ": [-64.7108, -3.3531],
  "TABATINGA": [-69.9378, -4.2528], "MAUÉS": [-57.7186, -3.3828], "MANICORE": [-61.3000, -5.8100],
  "HUMAITA": [-63.0308, -7.5064], "IRANDUBA": [-60.1861, -3.2858], "SAO GABRIEL DA CACHOEIRA": [-67.0889, -0.1300],
  
  // ========== MARANHÃO ==========
  "SAO LUIS": [-44.2825, -2.5297], "IMPERATRIZ": [-47.4919, -5.5189], "SAO JOSE DE RIBAMAR": [-44.0522, -2.5508],
  "TIMON": [-42.8369, -5.0939], "CAXIAS": [-43.3539, -4.8589], "CODÓ": [-43.8853, -4.4550],
  "PAÇO DO LUMIAR": [-44.1025, -2.5197], "ACAILANDIA": [-47.0506, -4.9458], "BACABAL": [-44.7786, -4.2256],
  "BALSAS": [-46.0344, -7.5328], "SANTA INÊS": [-45.3803, -3.6636], "CHAPADINHA": [-43.3517, -3.7417],
  "PINHEIRO": [-45.0822, -2.5206], "ITAPECURU MIRIM": [-44.3511, -3.3933], "BURITICUPU": [-46.4350, -4.3392],
  
  // ========== MATO GROSSO ==========
  "CUIABA": [-56.0978, -15.6014], "VARZEA GRANDE": [-56.1328, -15.6458], "RONDONOPOLIS": [-54.6356, -16.4697],
  "SINOP": [-55.5036, -11.8644], "TANGARA DA SERRA": [-57.4989, -14.6228], "CACERES": [-57.6836, -16.0736],
  "SORRISO": [-55.7114, -12.5428], "LUCAS DO RIO VERDE": [-55.9042, -13.0508], "PRIMAVERA DO LESTE": [-54.2972, -15.5600],
  "BARRA DO GARCAS": [-52.2564, -15.8897], "ALTA FLORESTA": [-56.0861, -9.8756], "PONTES E LACERDA": [-59.3467, -15.2256],
  "JUARA": [-57.5250, -11.2550], "JUINA": [-58.7408, -11.3783], "COLIDER": [-55.4550, -10.8133],
  "CAMPO NOVO DO PARECIS": [-57.8919, -13.6611], "NOVA MUTUM": [-56.0806, -13.8342],
  
  // ========== MATO GROSSO DO SUL ==========
  "CAMPO GRANDE": [-54.6464, -20.4428], "DOURADOS": [-54.8056, -22.2211], "TRES LAGOAS": [-51.6786, -20.7511],
  "CORUMBÁ": [-57.6533, -19.0089], "PONTA PORÃ": [-55.7256, -22.5358], "NAVIRAÍ": [-54.1992, -23.0653],
  "NOVA ANDRADINA": [-53.3433, -22.2339], "AQUIDAUANA": [-55.7867, -20.4711], "SIDROLANDIA": [-54.9611, -20.9319],
  "PARANAÍBA": [-51.1908, -19.6756], "MARACAJU": [-55.1678, -21.6111], "AMAMBAI": [-55.2253, -23.1042],
  "COXIM": [-54.7603, -18.5064], "JARDIM": [-56.1381, -21.4803], "SAO GABRIEL DO OESTE": [-54.5678, -19.3994],
  "RIO BRILHANTE": [-54.5458, -21.8022], "CASSILANDIA": [-51.7350, -19.1144], "CHAPADAO DO SUL": [-52.6250, -18.7917],
  "MIRANDA": [-56.3778, -20.2403], "BONITO": [-56.4847, -21.1264], "COSTA RICA": [-53.1281, -18.5436],
  
  // ========== PIAUÍ ==========
  "TERESINA": [-42.8019, -5.0920], "PARNAIBA": [-41.7769, -2.9047], "PICOS": [-41.4672, -7.0769],
  "FLORIANO": [-43.0228, -6.7672], "PIRIPIRI": [-41.7769, -4.2733], "CAMPO MAIOR": [-42.1678, -4.8269],
  "BARRAS": [-42.2947, -4.2442], "ALTOS": [-42.4622, -5.0389], "PEDRO II": [-41.4589, -4.4239],
  "OEIRAS": [-42.1308, -7.0256], "SAO RAIMUNDO NONATO": [-42.6989, -9.0153], "UNIÃO": [-42.8614, -4.5878],
  "ESPERANTINA": [-42.2344, -3.9006], "JOSÉ DE FREITAS": [-42.5747, -4.7564], "BOM JESUS": [-44.3558, -9.0747],
  
  // ========== RIO GRANDE DO NORTE ==========
  "NATAL": [-35.2094, -5.7950], "MOSSORO": [-37.3442, -5.1875], "PARNAMIRIM": [-35.2628, -5.9158],
  "SAO GONCALO DO AMARANTE RN": [-35.3278, -5.7931], "MACAIBA": [-35.3556, -5.8536], "CEARA MIRIM": [-35.4253, -5.6350],
  "CAICO": [-37.0978, -6.4586], "ASSU": [-36.9106, -5.5775], "CURRAIS NOVOS": [-36.5139, -6.2586],
  "SANTA CRUZ": [-35.4314, -6.2286], "JOAO CAMARA": [-35.8175, -5.5389], "NOVA CRUZ": [-35.4306, -6.4778],
  "SAO JOSE DE MIPIBU": [-35.2411, -6.0739], "EXTREMOZ": [-35.3058, -5.7058], "MACAU": [-36.6336, -5.1125],
  
  // ========== PARAÍBA ==========
  "JOAO PESSOA": [-34.8631, -7.1153], "CAMPINA GRANDE": [-35.8811, -7.2306], "SANTA RITA": [-34.9781, -7.1136],
  "PATOS": [-37.2750, -7.0244], "BAYEUX": [-34.9317, -7.1256], "SOUSA": [-38.2328, -6.7578],
  "CABEDELO": [-34.8339, -6.9811], "CAJAZEIRAS": [-38.5558, -6.8903], "GUARABIRA": [-35.4861, -6.8511],
  "MAMANGUAPE": [-35.1256, -6.8383], "ESPERANCA": [-35.8597, -7.0278], "MONTEIRO": [-37.1247, -7.8892],
  "POMBAL": [-37.8008, -6.7697], "QUEIMADAS": [-35.9014, -7.3589], "SAO BENTO": [-37.4533, -6.4850],
  
  // ========== SERGIPE ==========
  "ARACAJU": [-37.0714, -10.9472], "NOSSA SENHORA DO SOCORRO": [-37.1253, -10.8553], "LAGARTO": [-37.6522, -10.9158],
  "ITABAIANA": [-37.4253, -10.6844], "SAO CRISTOVÃO": [-37.2069, -11.0144], "ESTANCIA": [-37.4383, -11.2678],
  "TOBIAS BARRETO": [-37.9992, -11.1853], "ITABAIANINHA": [-37.7897, -11.2742], "SIMAO DIAS": [-37.8078, -10.7392],
  "NOSSA SENHORA DA GLORIA": [-37.4200, -10.2183], "PROPRIA": [-36.8406, -10.2139], "CAPELA": [-37.0536, -10.5058],
  
  // ========== ALAGOAS ==========
  "MACEIO": [-35.7353, -9.6658], "ARAPIRACA": [-36.6611, -9.7525], "RIO LARGO": [-35.8439, -9.4781],
  "PALMEIRA DOS INDIOS": [-36.6278, -9.4061], "UNIÃO DOS PALMARES": [-36.0322, -9.1631], "PENEDO": [-36.5858, -10.2900],
  "SAO MIGUEL DOS CAMPOS": [-36.0942, -9.7819], "CORURIPE": [-36.1761, -10.1261], "DELMIRO GOUVEIA": [-37.9983, -9.3858],
  "CAMPO ALEGRE": [-36.3522, -9.7819], "MURICI": [-35.9436, -9.3097], "SATUBA": [-35.8203, -9.5656],
  "MARECHAL DEODORO": [-35.8928, -9.7097], "PILAR": [-35.9567, -9.5978], "TEOTÔNIO VILELA": [-36.3506, -9.9036],
  
  // ========== ESPÍRITO SANTO ==========
  "VITORIA": [-40.3378, -20.2976], "VILA VELHA": [-40.2897, -20.3297], "SERRA": [-40.3078, -20.1283],
  "CARIACICA": [-40.4197, -20.2636], "LINHARES": [-40.0722, -19.3911], "CACHOEIRO DE ITAPEMIRIM": [-41.1128, -20.8489],
  "COLATINA": [-40.6306, -19.5389], "GUARAPARI": [-40.4989, -20.6503], "SAO MATEUS": [-39.8583, -18.7156],
  "ARACRUZ": [-40.2733, -19.8203], "VIANA": [-40.4958, -20.3903], "NOVA VENECIA": [-40.4006, -18.7131],
  "BARRA DE SAO FRANCISCO": [-40.8936, -18.7547], "CASTELO": [-41.1833, -20.6047], "MARATAÍZES": [-40.8378, -21.0433],
  "DOMINGOS MARTINS": [-40.6597, -20.3636], "FUNDAO": [-40.4069, -19.9325], "IBIRACU": [-40.3686, -19.8342],
  
  // ========== TOCANTINS ==========
  "PALMAS TO": [-48.3336, -10.2128], "ARAGUAINA": [-48.2072, -7.1911], "GURUPI": [-49.0686, -11.7289],
  "PORTO NACIONAL": [-48.4175, -10.7083], "PARAISO DO TOCANTINS": [-48.8822, -10.1758], "COLINAS DO TOCANTINS": [-48.4758, -8.0581],
  "GUARAI": [-48.5106, -8.8342], "TOCANTINOPOLIS": [-47.4219, -6.3325], "DIANOPOLIS": [-46.8189, -11.6258],
  "MIRACEMA DO TOCANTINS": [-48.3922, -9.5636], "AUGUSTINOPOLIS": [-47.8867, -5.4686], "FORMOSO DO ARAGUAIA": [-49.5283, -11.7975],
  
  // ========== RONDÔNIA ==========
  "PORTO VELHO": [-63.9039, -8.7619], "JI PARANA": [-61.9517, -10.8853], "ARIQUEMES": [-63.0408, -9.9133],
  "VILHENA": [-60.1458, -12.7406], "CACOAL": [-61.4478, -11.4386], "JARU": [-62.4667, -10.4386],
  "ROLIM DE MOURA": [-61.7781, -11.7275], "GUAJARA MIRIM": [-65.3489, -10.7917], "OURO PRETO DO OESTE": [-62.2508, -10.7256],
  "PIMENTA BUENO": [-61.1939, -11.6731], "BURITIS": [-63.8300, -10.2125], "MACHADINHO DO OESTE": [-62.0150, -9.4433],
  
  // ========== ACRE ==========
  "RIO BRANCO": [-67.8100, -9.9747], "CRUZEIRO DO SUL": [-72.6756, -7.6306], "SENA MADUREIRA": [-68.6608, -9.0658],
  "TARAUACA": [-70.7678, -8.1603], "FEIJO": [-70.3519, -8.1644], "BRASILEIA": [-68.7486, -11.0131],
  "EPITACIOLANDIA": [-68.4378, -11.0169], "SENADOR GUIOMARD": [-67.7361, -10.1506], "PLACIDO DE CASTRO": [-67.1847, -10.3350],
  "XAPURI": [-68.5003, -10.6519], "MANCIO LIMA": [-72.9014, -7.6139], "RODRIGUES ALVES": [-72.6458, -7.4644],
  
  // ========== AMAPÁ ==========
  "MACAPA": [-51.0669, 0.0356], "SANTANA": [-51.1753, -0.0583], "LARANJAL DO JARI": [-52.4539, -0.8044],
  "OIAPOQUE": [-51.8350, 3.8406], "PORTO GRANDE": [-51.4183, 0.7125], "MAZAGAO": [-51.2889, -0.1156],
  "TARTARUGALZINHO": [-51.5122, 1.5047], "PEDRA BRANCA DO AMAPARI": [-51.9475, 0.7767], "VITORIA DO JARI": [-52.4244, -0.9278],
  
  // ========== RORAIMA ==========
  "BOA VISTA": [-60.6719, 2.8197], "RORAINOPOLIS": [-60.4378, 0.9381], "CARACARAI": [-61.1272, 1.8119],
  "ALTO ALEGRE": [-61.2994, 2.9931], "MUCAJAI": [-60.9086, 2.4397], "CANTA": [-60.6047, 2.6083],
  "PACARAIMA": [-61.1472, 4.4800], "AMAJARI": [-61.3678, 3.6456], "BONFIM": [-59.8328, 3.3614],
  "NORMANDIA": [-59.6236, 3.8800], "UIRAMUTA": [-60.1833, 4.6031], "IRACEMA": [-61.0431, 2.1831],
  
  // ========== DISTRITO FEDERAL ==========
  "BRASILIA": [-47.9297, -15.7797], "CEILANDIA": [-48.1086, -15.8211], "TAGUATINGA": [-48.0561, -15.8389],
  "SAMAMBAIA": [-48.0994, -15.8781], "PLANALTINA": [-47.6144, -15.6203], "AGUAS CLARAS": [-48.0281, -15.8386],
  "RECANTO DAS EMAS": [-48.0614, -15.9119], "GAMA": [-48.0619, -16.0236], "GUARA": [-47.9833, -15.8333],
  "SOBRADINHO": [-47.7897, -15.6519], "SANTA MARIA": [-48.0100, -16.0183], "SAO SEBASTIAO": [-47.7722, -15.9053],
  "RIACHO FUNDO": [-47.9594, -15.8756], "PARANOA": [-47.7833, -15.7703], "BRAZLANDIA": [-48.1969, -15.6758],
  "VICENTE PIRES": [-48.0208, -15.8025], "SUDOESTE": [-47.9297, -15.7972], "LAGO SUL": [-47.8500, -15.8500],
  "LAGO NORTE": [-47.8333, -15.7333], "CRUZEIRO": [-47.9333, -15.8000], "JARDIM BOTANICO": [-47.8167, -15.8833],
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

  // Agregar eventos por cidade (usando evento_cidade, com fallback para cooperativa)
  const locationData = useMemo(() => {
    const byState: { [key: string]: { count: number; custo: number; cities: { [key: string]: { count: number; custo: number; cooperativa?: string } } } } = {};
    const byRegional: { [key: string]: { count: number; custo: number; estados: Set<string>; cidades: Set<string> } } = {};
    const byTipoEvento: { [key: string]: { count: number; custo: number } } = {};
    const byMotivoEvento: { [key: string]: { count: number; custo: number } } = {};
    const bySituacao: { [key: string]: number } = {};
    
    eventos.forEach(e => {
      const estado = e.evento_estado?.toUpperCase() || "";
      // Usa evento_cidade - campo direto da planilha
      const cidade = (e.evento_cidade?.toUpperCase() || "").trim();
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
