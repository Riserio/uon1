import type { GatilhoAbsoluto } from "./types";

export const TIPOS_SINISTRO = [
  { valor: "colisao", icone: "💥", nome: "Colisão", descricao: "Batida, capotamento, abalroamento" },
  { valor: "roubo", icone: "🔫", nome: "Roubo", descricao: "Com violência ou grave ameaça" },
  { valor: "furto", icone: "🔓", nome: "Furto", descricao: "Subtração sem violência" },
  { valor: "incendio", icone: "🔥", nome: "Incêndio", descricao: "Fogo, explosão, combustão" },
  { valor: "patrimonial", icone: "🏚", nome: "Danos Patrimoniais", descricao: "Portão, muro, poste, imóvel" },
  { valor: "fenomeno", icone: "🌩", nome: "Fenômeno Natural", descricao: "Granizo, alagamento, raio, vento" },
  { valor: "total", icone: "🚗", nome: "Perda Total", descricao: "Indenização integral do veículo" },
] as const;

export const SECOES_POR_TIPO: Record<string, string[]> = {
  colisao: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "terceiro", "entrevista", "flags", "nexo", "parecer"],
  roubo: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "terceiro", "entrevista", "flags", "nexo", "parecer"],
  furto: ["associado", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
  incendio: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
  patrimonial: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "terceiro", "entrevista", "flags", "nexo", "parecer"],
  fenomeno: ["associado", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
  total: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
};

export const DIMENSOES = [
  { id: "D1", label: "Nexo causal e dinâmica", peso: 0.25, maxPontos: 9 },
  { id: "D2", label: "Documentação e BO", peso: 0.2, maxPontos: 11 },
  { id: "D3", label: "Perfil do associado", peso: 0.15, maxPontos: 5 },
  { id: "D4", label: "Veículo e condutor", peso: 0.15, maxPontos: 9 },
  { id: "D5", label: "Temporalidade", peso: 0.1, maxPontos: 7 },
  { id: "D6", label: "Comportamento", peso: 0.1, maxPontos: 6 },
  { id: "D7", label: "Evidências físicas", peso: 0.05, maxPontos: 5 },
];

export const CAMPO_PONTOS: Record<string, { dimensao: string; opcoes: Record<string, number> }> = {
  d1_coerenciaDanos: { dimensao: "D1", opcoes: { coerente_triplo: 3, coerente_parcial: 1, posicao_errada: -2, incompativel: -3, ferrugem_preexistente: -3 } },
  d1_velocidadeDanos: { dimensao: "D1", opcoes: { compativel: 2, baixa_para_dano: -3, alta_para_dano: -1, na: 0 } },
  d1_subtipoFisico: { dimensao: "D1", opcoes: { plenamente_plausivel: 2, plausivel_ressalvas: 1, improvavel: -1, fisicamente_impossivel: -3 } },
  d2_tipoDelegaciaBO: { dimensao: "D2", opcoes: { presencial_compativel: 3, presencial_distante: -2, online_pequeno: 1, online_medio: -1, online_grande: -3 } },
  d2_prazoBO: { dimensao: "D2", opcoes: { mesmo_dia: 2, um_a_tres: 1, quatro_a_sete: -1, oito_ou_mais: -2 } },
  d2_retificacaoBO: { dimensao: "D2", opcoes: { nao: 0, sim: -3 } },
  d2_relatoVsBO: { dimensao: "D2", opcoes: { identico: 3, detalhes_coerentes: 2, pequenas_divergencias: -1, contradiz_ponto_central: -3, nao_sabe_o_que_consta: -2 } },
  d3_historicoFinanceiro: { dimensao: "D3", opcoes: { paga_em_dia: 2, atrasos_pontuais: 1, sempre_atrasa: -1, historico_irregular: -2, inadimplente_no_evento: -3, vencimento_proximo_15d: -3 } },
  d3_historicoSinistros: { dimensao: "D3", opcoes: { primeiro_sinistro: 2, um_anterior_mais_2anos: 1, dois_em_24meses: -1, tres_mais_em_24meses: -3, negado_mesmo_tipo: -3, intervalo_60dias: -3, menos_90dias_ingresso: -2 } },
  d3_consultaSBL: { dimensao: "D3", opcoes: { nao_consta: 1, ativo_sem_sinistro: 0, ativo_com_sinistro: -5 } },
  d4_regularidadeCondutor: { dimensao: "D4", opcoes: { cnh_valida_categoria_ok: 3, cnh_vencida_30d: -2, cnh_vencida_mais_30d: -3, categoria_incompativel: -3, celular_confirmado_bo: -3 } },
  d4_regularidadeVeiculo: { dimensao: "D4", opcoes: { ativo_sem_restricao: 3, comunicacao_venda: -3, anuncio_venda_ativo: -3, restricao_judicial: -2, modificacao_nao_homo: -2, irreg_nexo_direto: -3 } },
  d4_rastreador: { dimensao: "D4", opcoes: { compativel_triplo: 3, compativel_duplo: 3, sem_sinal_no_evento: -3, incompativel_velocidade: -3, nao_possui: 0 } },
  d5_eventoVsBO: { dimensao: "D5", opcoes: { identico: 2, ate_1hora: 0, horas_significativas: -2, datas_diferentes: -3 } },
  d5_intervaloContato: { dimensao: "D5", opcoes: { mesmo_dia_seguinte: 2, dois_a_cinco: 1, seis_a_quinze: -1, quinze_a_trinta: -2, mais_de_trinta: -3 } },
  d5_coerenciaInterna: { dimensao: "D5", opcoes: { todas_coerentes: 2, pequenas_justificadas: 0, divergencias_sem_exp: -2 } },
  d6_entrevista: { dimensao: "D6", opcoes: { claro_objetivo: 3, claro_duvidas_menores: 1, inseguranca: -2, contradicoes_centrais: -3, altamente_suspeito: -3, nao_contatado: 0 } },
  d6_sinaisFraude: { dimensao: "D6", opcoes: { nenhum: 0, antecipou_tecnico: -2, fechamento_rapido: -2, mencionou_despachante: -3, terceiro_familiar: -3 } },
  d7_provaIndependente: { dimensao: "D7", opcoes: { camera_confirma: 3, testemunha_coerente: 3, laudo_tecnico_oficial: 3, sem_cameras: -1, testemunha_contradiz: -3, bombeiros_nao_acionados: -3, nao_verificado: 0 } },
  d7_fotoQualidade: { dimensao: "D7", opcoes: { adequadas_metadata_ok: 2, parciais: 0, insuficientes: -1, metadata_incompativel: -3 } },
};

export const GATILHOS: GatilhoAbsoluto[] = [
  { id: "g_acionamentoDuplo", label: "Acionamento duplo em duas bases (SBL)", tipo: "negativa" },
  { id: "g_semHabilitacao", label: "Condutor sem habilitação", tipo: "negativa" },
  { id: "g_alcoolemia", label: "Alcoolemia positiva", tipo: "negativa" },
  { id: "g_gnvIncendio", label: "GNV não regularizado em sinistro de incêndio", tipo: "negativa" },
  { id: "g_rastreadorDesconectado", label: "Rastreador desconectado deliberadamente antes do evento", tipo: "sindicancia" },
  { id: "g_rastreadorContradiz", label: "Rastreador contradiz a localização declarada", tipo: "sindicancia" },
  { id: "g_anuncioVenda", label: "Anúncio de venda ativo + evento dentro de 30 dias", tipo: "sindicancia" },
  { id: "g_ingressoPredatorio", label: "Evento em menos de 30 dias após o ingresso na associação", tipo: "sindicancia" },
];

export type RedFlag = {
  id: string;
  label: string;
  peso: number;
  grupo: string;
  tipos: "all" | string[];
};

export const RED_FLAGS: RedFlag[] = [
  { id: "rf_vencimento15d", label: "Evento ≤ 15 dias antes do vencimento/cancelamento", peso: 3, grupo: "Temporalidade", tipos: "all" },
  { id: "rf_mesmoTipo", label: "Mesmo tipo de evento que o anterior", peso: 3, grupo: "Temporalidade", tipos: "all" },
  { id: "rf_tresEm24m", label: "3 ou mais eventos nos últimos 24 meses", peso: 2, grupo: "Temporalidade", tipos: "all" },
  { id: "rf_ingresso90d", label: "Evento em menos de 90 dias após o ingresso", peso: 2, grupo: "Temporalidade", tipos: "all" },
  { id: "rf_boOnlineGrande", label: "BO online para sinistro de grande monta", peso: 3, grupo: "Boletim", tipos: "all" },
  { id: "rf_boDelegaciaLonge", label: "BO em delegacia distante do local do evento", peso: 2, grupo: "Boletim", tipos: "all" },
  { id: "rf_boRetificacao", label: "Retificação ou segundo BO para o mesmo evento", peso: 3, grupo: "Boletim", tipos: "all" },
  { id: "rf_boLinguagem", label: "Linguagem técnica atípica para o perfil do associado", peso: 2, grupo: "Boletim", tipos: "all" },
  { id: "rf_rastrSemSinal", label: "Rastreador sem sinal no horário do evento", peso: 4, grupo: "Rastreador", tipos: ["colisao", "roubo", "incendio", "fenomeno", "total"] },
  { id: "rf_rastrIncompat", label: "Rastreador incompatível com o relato", peso: 4, grupo: "Rastreador", tipos: ["colisao", "roubo", "incendio", "fenomeno", "total"] },
  { id: "rf_danosIncoer", label: "Danos incoerentes com a dinâmica declarada", peso: 3, grupo: "Danos e Fotos", tipos: "all" },
  { id: "rf_ferrugem", label: "Sinais de ferrugem nas bordas dos danos", peso: 3, grupo: "Danos e Fotos", tipos: "all" },
  { id: "rf_metadataIncompat", label: "Metadata das fotos incompatível com o evento", peso: 2, grupo: "Danos e Fotos", tipos: "all" },
  { id: "rf_terceiroConhecido", label: "Terceiro é associado ou conhecido do associado", peso: 3, grupo: "Conluio", tipos: ["colisao", "roubo", "patrimonial"] },
  { id: "rf_despachante", label: "Mencionou intermediário ou despachante", peso: 3, grupo: "Conluio", tipos: ["colisao", "roubo", "patrimonial"] },
  { id: "rf_contradicoes", label: "Relato com contradições entre contatos", peso: 2, grupo: "Comportamento", tipos: "all" },
  { id: "rf_fechamentoRapido", label: "Solicitou fechamento rápido de forma atípica", peso: 2, grupo: "Comportamento", tipos: "all" },
  { id: "rf_anuncioVenda", label: "Veículo com anúncio de venda ativo", peso: 2, grupo: "Comportamento", tipos: "all" },
  { id: "rf_terceiroAusente", label: "Terceiro não identificado ou com dados inválidos", peso: 2, grupo: "Comportamento", tipos: ["furto", "roubo"] },
  { id: "rf_fenIsolado", label: "Fenômeno isolado — sem outros veículos afetados", peso: 3, grupo: "Fenômeno", tipos: ["fenomeno"] },
  { id: "rf_fenSemRegistro", label: "Ausência de registro meteorológico oficial", peso: 2, grupo: "Fenômeno", tipos: ["fenomeno"] },
  { id: "rf_gnvNaoReg", label: "GNV ou modificação não homologada no veículo", peso: 3, grupo: "Incêndio", tipos: ["incendio"] },
  { id: "rf_semBombeiros", label: "Corpo de Bombeiros não foi acionado", peso: 3, grupo: "Incêndio", tipos: ["incendio"] },
];

import type { FormDataFluxos, ResultadoClassificacao } from "./types";

export function classificar(form: FormDataFluxos): ResultadoClassificacao {
  const gatilhosAtivos = GATILHOS.filter((g) => (form as any)[g.id] === true).map((g) => ({ ...g, ativo: true }));
  const gatNegativa = gatilhosAtivos.filter((g) => g.tipo === "negativa");
  const gatSindicancia = gatilhosAtivos.filter((g) => g.tipo === "sindicancia");

  const scoresPorDim: Record<string, number> = {};
  DIMENSOES.forEach((d) => (scoresPorDim[d.id] = 0));
  Object.entries(CAMPO_PONTOS).forEach(([campo, config]) => {
    const resp = (form as any)[campo] as string;
    if (resp && config.opcoes[resp] !== undefined) {
      scoresPorDim[config.dimensao] += config.opcoes[resp];
    }
  });

  let scorePonderado = 0;
  const maxPossivel = DIMENSOES.reduce((s, d) => s + d.maxPontos * d.peso, 0);
  const dimensoes = DIMENSOES.map((d) => {
    const pontos = scoresPorDim[d.id] || 0;
    const ponderado = pontos * d.peso;
    scorePonderado += ponderado;
    return { ...d, pontos, ponderado };
  });
  const scoreNorm = Math.round(Math.max(-100, Math.min(100, (scorePonderado / maxPossivel) * 100)));

  const dimsNegativas = dimensoes.filter((d) => d.pontos < 0).length;
  const d1Neg = (scoresPorDim["D1"] || 0) < 0;
  const d2Neg = (scoresPorDim["D2"] || 0) < 0;

  let classificacao: ResultadoClassificacao["classificacao"] = null;
  let confianca: ResultadoClassificacao["confianca"] = "Inconclusiva";
  let prazoInterno = "";
  let prazoComunicacao = "";
  let alcada = "";
  let acaoRecomendada = "";
  let sustentaculos: string[] = [];
  let pontosAtencao: string[] = [];

  if (gatNegativa.length > 0) {
    classificacao = "NEGATIVA";
    confianca = "Alta";
    prazoInterno = "2 dias úteis";
    prazoComunicacao = "5 dias úteis";
    alcada = "Gerência";
    acaoRecomendada = "Emitir carta de negativa fundamentada citando as cláusulas contratuais. Registrar gatilhos no histórico do associado.";
    sustentaculos = gatNegativa.map((g) => `Gatilho absoluto: ${g.label}`);
    pontosAtencao = ["Documentar todos os gatilhos na carta de negativa", "Consultar jurídico antes de emitir"];
  } else if (scoreNorm <= -11 && gatSindicancia.length === 0) {
    classificacao = "NEGATIVA";
    confianca = scoreNorm <= -40 ? "Alta" : "Media";
    prazoInterno = "5 dias úteis";
    prazoComunicacao = "7 dias úteis";
    alcada = "Gerência";
    acaoRecomendada = "Emitir carta de negativa fundamentada pelos indicadores acumulados em múltiplas dimensões.";
    sustentaculos = dimensoes.filter((d) => d.pontos < 0).map((d) => `${d.label}: score ${d.pontos}`);
    pontosAtencao = ["Listar cada indicador negativo na fundamentação", "Manter dossiê completo para eventual contestação"];
  } else if (scoreNorm >= 40 && gatilhosAtivos.length === 0) {
    classificacao = "APROVACAO";
    confianca = scoreNorm >= 60 ? "Alta" : "Media";
    prazoInterno = scoreNorm >= 60 ? "3 dias úteis" : "5 dias úteis";
    prazoComunicacao = scoreNorm >= 60 ? "5 dias úteis" : "7 dias úteis";
    alcada = scoreNorm >= 60 ? "Gerência" : "Supervisão";
    acaoRecomendada = "Encaminhar relatório de aprovação. Comitê pode homologar sem reunião presencial para confiança Alta.";
    sustentaculos = dimensoes.filter((d) => d.pontos > 0).map((d) => `${d.label}: score +${d.pontos}`);
    pontosAtencao = dimsNegativas > 0 ? dimensoes.filter((d) => d.pontos < 0).map((d) => `Atenção: ${d.label} com score negativo`) : [];
  } else if ((scoreNorm >= -10 && scoreNorm <= 14) || (scoreNorm >= 15 && gatSindicancia.length > 0 && gatNegativa.length > 0) || (d1Neg && d2Neg && scoreNorm > 0)) {
    classificacao = "DIRETORIA";
    confianca = "Inconclusiva";
    prazoInterno = "Reunião em 5 dias úteis";
    prazoComunicacao = "Suspender prazo — comunicar associado";
    alcada = "Diretoria";
    acaoRecomendada = "Congelar prazo. Agendar reunião de diretoria. Decisão documentada em ata com fundamentação completa.";
    sustentaculos = ["Score inconclusivo — indicadores se anulam", "Necessária decisão colegiada"];
    pontosAtencao = ["Apresentar todas as dimensões na reunião", "Levar histórico completo do associado"];
  } else {
    classificacao = "SINDICANCIA";
    confianca = "Baixa";
    prazoInterno = "Imediato — designar sindicante";
    prazoComunicacao = "3 dias úteis (comunicar abertura)";
    alcada = "Supervisão";
    acaoRecomendada = "Designar sindicante. Prazo máximo 15 dias para conclusão. Resultado reclassifica o caso para Aprovação, Negativa ou Diretoria.";
    sustentaculos = [
      ...gatSindicancia.map((g) => `Gatilho: ${g.label}`),
      ...dimensoes.filter((d) => d.pontos < -1).map((d) => `${d.label}: score ${d.pontos}`),
    ];
    pontosAtencao = ["Definir escopo da sindicância pelos gatilhos ativos", "Documentar todas as diligências realizadas"];
  }

  return {
    classificacao,
    scoreNormalizado: scoreNorm,
    confianca,
    dimensoes,
    gatilhosAtivos,
    sustentaculos,
    pontosAtencao,
    prazoInterno,
    prazoComunicacao,
    alcada,
    acaoRecomendada,
  };
}

export function getClassificacaoStyle(c: string | null) {
  switch (c) {
    case "APROVACAO":
      return { bg: "bg-green-50", border: "border-green-400", text: "text-green-800", icon: "✅", label: "APROVAÇÃO" };
    case "SINDICANCIA":
      return { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-800", icon: "🔍", label: "SINDICÂNCIA" };
    case "NEGATIVA":
      return { bg: "bg-red-50", border: "border-red-500", text: "text-red-900", icon: "❌", label: "NEGATIVA" };
    case "DIRETORIA":
      return { bg: "bg-stone-100", border: "border-stone-400", text: "text-stone-900", icon: "🏛", label: "DIRETORIA" };
    default:
      return { bg: "bg-stone-50", border: "border-dashed border-stone-300", text: "text-stone-400", icon: "—", label: "Aguardando dados" };
  }
}