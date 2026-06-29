export type TipoSinistro =
  | "colisao"
  | "roubo"
  | "furto"
  | "incendio"
  | "patrimonial"
  | "fenomeno"
  | "total";

export type Classificacao =
  | "APROVACAO"
  | "SINDICANCIA"
  | "NEGATIVA"
  | "DIRETORIA"
  | null;

export type Confianca = "Alta" | "Media" | "Baixa" | "Inconclusiva";

export interface DimensaoScore {
  id: string;
  label: string;
  peso: number;
  pontos: number;
  ponderado: number;
  maxPontos: number;
}

export interface GatilhoAbsoluto {
  id: string;
  label: string;
  tipo: "negativa" | "sindicancia";
  ativo?: boolean;
}

export interface ResultadoClassificacao {
  classificacao: Classificacao;
  scoreNormalizado: number;
  confianca: Confianca;
  dimensoes: DimensaoScore[];
  gatilhosAtivos: GatilhoAbsoluto[];
  sustentaculos: string[];
  pontosAtencao: string[];
  prazoInterno: string;
  prazoComunicacao: string;
  alcada: string;
  acaoRecomendada: string;
}

export interface FormDataFluxos {
  // Identificação
  nomeAssociacao: string;
  protocolo: string;
  analista: string;
  regional: string;
  dataAbertura: string;
  dataPrimeiroContato: string;
  tipoAcionamento: string;
  nomeAcionante: string;
  tipoSinistro: TipoSinistro | null;
  // Scores
  d1_coerenciaDanos: string;
  d1_velocidadeDanos: string;
  d1_subtipoFisico: string;
  d2_tipoDelegaciaBO: string;
  d2_prazoBO: string;
  d2_retificacaoBO: string;
  d2_relatoVsBO: string;
  d3_historicoFinanceiro: string;
  d3_historicoSinistros: string;
  d3_consultaSBL: string;
  d4_regularidadeCondutor: string;
  d4_regularidadeVeiculo: string;
  d4_rastreador: string;
  d5_eventoVsBO: string;
  d5_intervaloContato: string;
  d5_coerenciaInterna: string;
  d6_entrevista: string;
  d6_sinaisFraude: string;
  d7_provaIndependente: string;
  d7_fotoQualidade: string;
  // Gatilhos
  g_acionamentoDuplo: boolean;
  g_semHabilitacao: boolean;
  g_alcoolemia: boolean;
  g_rastreadorDesconectado: boolean;
  g_rastreadorContradiz: boolean;
  g_anuncioVenda: boolean;
  g_gnvIncendio: boolean;
  g_ingressoPredatorio: boolean;
  // Red flags
  redFlags: Record<string, boolean>;
  // Restante livre
  [key: string]: any;
}

export const INITIAL_FORM: FormDataFluxos = {
  nomeAssociacao: "",
  protocolo: "",
  analista: "",
  regional: "",
  dataAbertura: "",
  dataPrimeiroContato: "",
  tipoAcionamento: "",
  nomeAcionante: "",
  tipoSinistro: null,
  d1_coerenciaDanos: "",
  d1_velocidadeDanos: "",
  d1_subtipoFisico: "",
  d2_tipoDelegaciaBO: "",
  d2_prazoBO: "",
  d2_retificacaoBO: "",
  d2_relatoVsBO: "",
  d3_historicoFinanceiro: "",
  d3_historicoSinistros: "",
  d3_consultaSBL: "",
  d4_regularidadeCondutor: "",
  d4_regularidadeVeiculo: "",
  d4_rastreador: "",
  d5_eventoVsBO: "",
  d5_intervaloContato: "",
  d5_coerenciaInterna: "",
  d6_entrevista: "",
  d6_sinaisFraude: "",
  d7_provaIndependente: "",
  d7_fotoQualidade: "",
  g_acionamentoDuplo: false,
  g_semHabilitacao: false,
  g_alcoolemia: false,
  g_rastreadorDesconectado: false,
  g_rastreadorContradiz: false,
  g_anuncioVenda: false,
  g_gnvIncendio: false,
  g_ingressoPredatorio: false,
  redFlags: {},
};