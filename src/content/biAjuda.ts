/**
 * Conteúdo da tela "Ajuda do BI".
 *
 * Tudo aqui descreve o comportamento REAL do sistema (funções do banco,
 * importadores e agendamentos). Ao mudar uma regra de cálculo, um horário de
 * sincronização ou um gráfico, atualize também este arquivo — a Ajuda é o
 * contrato do que o usuário vê.
 *
 * A parte dinâmica (última atualização, filtros salvos do usuário, padrão do
 * relatório) vem de `bi_status_alimentacao` e `bi_filtros_padrao`.
 */

export type BIAjudaModulo = "indicadores" | "estudo-base" | "eventos" | "mgf" | "cobranca" | "relatorio";

/** Mapeia o módulo de navegação do BI/portal para a aba da Ajuda. */
export function moduloAjudaDe(mod: string | null | undefined): BIAjudaModulo | "geral" {
  switch (mod) {
    case "indicadores":
    case "eventos":
    case "mgf":
    case "cobranca":
      return mod;
    case "estudo-base":
    case "cadastro":
      return "estudo-base";
    default:
      return "geral";
  }
}


export type AjudaGrafico = {
  titulo: string;
  mostra: string;
  fonte: string;
  observacao?: string;
};

export type AjudaSecao = {
  id: BIAjudaModulo;
  titulo: string;
  resumo: string;
  /** chave da tela em bi_filtros_padrao (quando a tela salva filtros) */
  telaFiltros?: "indicadores" | "estudo_base" | "eventos" | "mgf" | "cobranca";
  origem: string[];
  atualizacao: string[];
  regras: { titulo: string; texto: string }[];
  graficos: AjudaGrafico[];
  foraDaApi?: string[];
  duvidas?: { pergunta: string; resposta: string }[];
};

export const AJUDA_VISAO_GERAL = {
  titulo: "Como o BI é alimentado",
  paragrafos: [
    "Todos os números do BI vêm do SGA da Hinova da sua associação, lidos pela integração oficial (API). Ninguém digita esses dados: o sistema busca, confere e guarda uma cópia, e os gráficos são calculados sobre essa cópia.",
    "Cada módulo tem a sua rotina. A cobrança é lida em pequenos blocos ao longo do dia; eventos e lançamentos financeiros (MGF) são atualizados duas vezes por dia; a base de veículos é recontada e conferida duas vezes por dia. Os indicadores mensais são recalculados depois disso.",
    "Quando a Hinova está lenta ou fora do ar, a importação tenta de novo automaticamente nos ciclos seguintes. Se algo ficar sem atualizar por mais de 20 horas, o sistema reabre a sincronização sozinho.",
    "Os horários abaixo são de Brasília. A data e a hora da última atualização de cada módulo aparecem nesta tela e no topo de cada painel.",
  ],
  calendario: [
    { horario: "06:00 e 13:00", oque: "Abre o ciclo de sincronização de cobrança, eventos e MGF de todas as associações" },
    { horario: "Horário da associação", oque: "Ciclo extra no horário configurado para a sua integração (quando houver)" },
    { horario: "A cada 5 minutos", oque: "Processa a fila: cada associação é atendida em rodízio, um pedaço por vez" },
    { horario: "08:00 às 18:00 (de hora em hora)", oque: "Coleta e conferência da base de veículos (placas ativas)" },
    { horario: "04:30 (seg. a sáb.)", oque: "Recalcula o Estudo de Base" },
    { horario: "07:40 e 19:40", oque: "Recalcula indicadores complementares (reativações, cancelamentos, juros, eventos por tipo, custos)" },
    { horario: "08:00", oque: "Envia o resumo diário por WhatsApp (quando configurado)" },
    { horario: "19:20", oque: "Fotografa a frota do dia (gráfico de evolução diária)" },
    { horario: "De hora em hora (:25)", oque: "Reabre qualquer módulo que esteja há mais de 20 h sem atualizar" },
  ],
  glossario: [
    { termo: "Placas ativas", texto: "Veículos ativos na base da associação na última conferência. É a régua de quase todos os percentuais." },
    { termo: "Critério SGA (boletos anteriores: não possui)", texto: "Conta apenas boletos de veículos que NÃO tinham outro boleto em aberto nos 6 meses anteriores. Reproduz o Relatório de Boletos do SGA, que é o número que a associação confere." },
    { termo: "Critério Total", texto: "Todos os boletos do mês, inclusive de quem arrasta débito antigo. Serve para enxergar a carteira inteira." },
    { termo: "Mês de referência", texto: "Na cobrança, é o mês do vencimento ORIGINAL do boleto (se o boleto foi prorrogado, continua no mês original)." },
    { termo: "Tipo de boleto", texto: "Classificação do SGA: FECHAMENTO é a mensalidade; há também taxas (adesão, reativação, vistoria), cotas de participação em evento e boletos emitidos pela cobrança (Cobrança 1/2, SAC, acordos)." },
    { termo: "Em andamento", texto: "Evento cuja situação no SGA ainda não é final (finalizado, cancelado, negado, indenizado, arquivado etc.)." },
    { termo: "Sinistralidade", texto: "Custo dos eventos ÷ valor recebido no mês. No mês corrente o recebido ainda está entrando, por isso o percentual parcial costuma ficar alto até o fim do mês." },
  ],
};

export const AJUDA_SECOES: AjudaSecao[] = [
  {
    id: "indicadores",
    titulo: "Indicadores",
    telaFiltros: "indicadores",
    resumo:
      "Painel mensal da associação: frota, cadastros, cancelamentos, inadimplência, faturamento x recebido, permanência e eventos. Cada mês é uma linha consolidada (tabela de indicadores) montada a partir da base de veículos, dos boletos e dos eventos.",
    origem: [
      "Placas ativas e associados: base de veículos da Hinova (coleta da API, conferida duas vezes por dia).",
      "Boletos emitidos, pagos, em aberto, vencidos, faturamento e recebido: boletos da Cobrança, no critério SGA.",
      "Eventos e sinistralidade por volume: eventos do SGA pela data de cadastro.",
      "Custo de eventos, pagamentos de evento e assistência: lançamentos de saída do MGF.",
      "Cadastros do mês: data de adesão/contrato dos veículos na base.",
    ],
    atualizacao: [
      "O mês corrente é recalculado sempre que a base é conferida (várias vezes ao dia).",
      "Indicadores complementares (reativações, boletos cancelados, juros, aberturas e pagamentos de evento por tipo, assistência) são recalculados às 07:40 e 19:40.",
      "Meses futuros nunca são exibidos, mesmo que já existam boletos a vencer.",
    ],
    regras: [
      { titulo: "Placas ativas do mês", texto: "Usa, nesta ordem: o número de referência informado pela associação; o Estudo de Base do mês; a fotografia diária da frota; a contagem de veículos com adesão até o fim do mês." },
      { titulo: "Inadimplentes", texto: "Conta PLACAS distintas com boleto vencido e em aberto no mês, no critério SGA — não a quantidade de boletos (um boleto pode cobrir mais de um veículo)." },
      { titulo: "Inadimplência de boletos (%)", texto: "Boletos em aberto ÷ boletos do mês (pagos + em aberto), no critério SGA." },
      { titulo: "Inadimplência financeira (%)", texto: "Valor em aberto ÷ valor total dos boletos do mês." },
      { titulo: "Faturamento x Recebido", texto: "Faturamento = soma dos boletos do mês (pagos + em aberto). Recebido = soma dos boletos pagos." },
      { titulo: "Reativações", texto: "Quantidade de boletos do tipo REATIVAÇÃO do mês (não cancelados)." },
      { titulo: "Boletos cancelados", texto: "Boletos do mês com situação CANCELADO no SGA. Cancelados e excluídos ficam fora de todas as outras contas." },
      { titulo: "Juros arrecadados", texto: "Diferença entre o valor pago e o valor do boleto, quando o associado pagou a mais (juros/multa)." },
      { titulo: "Eventos por tipo", texto: "Classificados pelo motivo informado no SGA: vidros (vidro, para-brisa, lanterna, farol, retrovisor); integral (furto, roubo, incêndio, perda total); carro reserva (motivo ou solicitação de carro reserva); assistência (reboque/assistência 24h); parcial (demais, como colisão e fenômenos da natureza). Associado x terceiro pelo tipo do evento." },
      { titulo: "Custo de eventos e sinistralidade financeira", texto: "Custo = saídas do MGF com centro de custo de EVENTOS ou ligadas a um protocolo de evento. Sinistralidade financeira = custo ÷ recebido do mês." },
      { titulo: "Churn e permanência", texto: "Churn = cancelamentos ÷ placas ativas. Permanência = entradas (cadastros + reativações) menos perdas (cancelamentos + inadimplentes)." },
    ],
    graficos: [
      { titulo: "Evolução da Frota Protegida", mostra: "Placas ativas por mês, ou por dia (últimos 60 dias) no modo Dia.", fonte: "Indicadores mensais / fotografia diária da frota (19:20)." },
      { titulo: "Histórico de Inadimplentes", mostra: "Placas inadimplentes por mês.", fonte: "Boletos vencidos em aberto (critério SGA)." },
      { titulo: "Faturamento vs Recebido", mostra: "Valor dos boletos do mês x valor pago.", fonte: "Boletos da Cobrança." },
      { titulo: "Crescimento Líquido / Saldo de placas", mostra: "Cadastros menos cancelamentos no mês.", fonte: "Base de veículos." },
      { titulo: "Churn (%) e Índice de Permanência", mostra: "Perda de associados e retenção.", fonte: "Base de veículos + inadimplência." },
      { titulo: "Total de Associados / Veículos por Associado", mostra: "Associados distintos e média de veículos por associado.", fonte: "Base de veículos." },
      { titulo: "Cadastros, Novos Cadastros (%) e Crescimento Bruto", mostra: "Adesões do mês e seu peso sobre a frota.", fonte: "Data de adesão/contrato na base." },
      { titulo: "Cancelamentos / Veículos Inadimplentes / Reativações", mostra: "Movimentação da frota no mês.", fonte: "Base de veículos e boletos (reativação = boleto do tipo REATIVAÇÃO)." },
      { titulo: "Boletos no Período", mostra: "Emitidos, pagos, em aberto e cancelados.", fonte: "Boletos da Cobrança." },
      { titulo: "Inadimplência de Boletos / Financeira (%)", mostra: "Percentuais do mês.", fonte: "Boletos da Cobrança (critério SGA)." },
      { titulo: "Ticket Médio por Boleto", mostra: "Faturamento ÷ boletos do mês.", fonte: "Boletos da Cobrança." },
      { titulo: "Cancelamento de Boletos / Arrecadação de Juros (%)", mostra: "Cancelados ÷ emitidos; juros ÷ recebido.", fonte: "Boletos da Cobrança." },
      { titulo: "Crescimento de Faturamento / Recebido (%)", mostra: "Variação em relação ao mês anterior.", fonte: "Indicadores mensais." },
      { titulo: "Entrada vs Perdas", mostra: "Cadastros + reativações contra cancelamentos + inadimplentes.", fonte: "Indicadores mensais." },
    ],
    foraDaApi: [
      "Rastreamento (veículos rastreados, instalações e custo), rateio do período, cotas, valores descontados pelo banco e baixas com pendência não existem na API da Hinova. Esses campos só aparecem quando a associação envia a planilha do PID; sem ela, ficam zerados.",
    ],
    duvidas: [
      { pergunta: "Por que o mês atual parece menor que o anterior?", resposta: "Porque ainda está em andamento: boletos vencem ao longo do mês e os pagamentos entram dia a dia. Compare meses fechados." },
      { pergunta: "Por que as placas ativas daqui diferem do SGA?", resposta: "O número é o da última conferência da base (veja o horário nesta tela). Movimentações feitas no SGA depois disso entram na próxima conferência." },
    ],
  },
  {
    id: "estudo-base",
    titulo: "Estudo de Base",
    telaFiltros: "estudo_base",
    resumo: "Retrato da frota ativa: tipo de veículo, montadora, modelo, ano, faixa de valor FIPE, combustível, faixa etária do associado, regional e cooperativa.",
    origem: ["Base de veículos ativos da Hinova (cadastro do veículo e do associado), na última conferência."],
    atualizacao: ["A base é recontada e conferida de hora em hora entre 08:00 e 18:00; o Estudo de Base é recalculado às 04:30."],
    regras: [
      { titulo: "Veículo único", texto: "Cada veículo conta uma vez (por placa; sem placa, pelo chassi)." },
      { titulo: "Situação", texto: "Situação do veículo no SGA (ativo, inadimplente etc.). O filtro de situação considera exatamente o texto do SGA." },
      { titulo: "Data de contrato", texto: "Filtra pela data de contrato/adesão do veículo." },
      { titulo: "Faixa de valor", texto: "Pelo valor protegido (FIPE) do veículo no cadastro." },
    ],
    graficos: [
      { titulo: "Placas por Situação", mostra: "Quantidade de veículos por situação.", fonte: "Base de veículos." },
      { titulo: "Tipo de Veículo, Categoria e Combustível", mostra: "Composição da frota.", fonte: "Base de veículos." },
      { titulo: "Valor FIPE por Faixa", mostra: "Distribuição do valor protegido.", fonte: "Base de veículos." },
      { titulo: "Top Montadoras / Top Modelos / Ano do Modelo", mostra: "Perfil dos veículos.", fonte: "Base de veículos." },
      { titulo: "Faixa Etária", mostra: "Idade dos associados.", fonte: "Cadastro do associado." },
      { titulo: "Voluntário / Regional / Cooperativa", mostra: "Origem comercial dos veículos.", fonte: "Base de veículos." },
    ],
  },
  {
    id: "eventos",
    titulo: "Eventos",
    telaFiltros: "eventos",
    resumo: "Eventos (sinistros e acionamentos) registrados no SGA: quantidade, situação, motivo, local, regional, cooperativa, tempo de conclusão, custo e sinistralidade.",
    origem: [
      "Eventos do SGA (consulta de eventos por data de cadastro).",
      "Custo dos eventos: lançamentos de saída do MGF ligados ao protocolo do evento ou com centro de custo de EVENTOS.",
    ],
    atualizacao: [
      "Duas vezes por dia (06:00 e 13:00) e no horário da associação: busca os eventos novos a partir do último recebido.",
      "A situação dos eventos ainda em aberto é revisada em rodízio a cada ciclo (até 12 meses para trás).",
    ],
    regras: [
      { titulo: "Período", texto: "Pela data de CADASTRO do evento no SGA (não pela data do acidente)." },
      { titulo: "Status padrão", texto: "A tela abre em \"em andamento\": eventos finalizados ficam fora até você escolher \"todos\"." },
      { titulo: "Local do evento", texto: "Cidade e UF informadas no evento. Quando o SGA não informa o local, usamos a cidade/UF do cadastro do associado." },
      { titulo: "Tipo de veículo", texto: "Calculado pelo modelo do veículo (moto, caminhão, van/utilitário ou passeio)." },
      { titulo: "Tempo de conclusão", texto: "A API não informa a data de conclusão. Registramos o dia em que a sincronização viu o evento mudar para uma situação final — a precisão é a da frequência de atualização." },
      { titulo: "Custo por evento", texto: "Soma das saídas do MGF ligadas ao protocolo. Se a associação não informa o protocolo no lançamento do MGF, o custo aparece no total (centro de custo de EVENTOS), mas não por evento." },
      { titulo: "Sinistralidade (custo)", texto: "Custo dos eventos no mês ÷ valor recebido em boletos no mês (Cobrança). Mês corrente é parcial." },
      { titulo: "Sinistralidade (volume)", texto: "Eventos do mês ÷ placas ativas no início do mês; o card mostra a média dos últimos 12 meses." },
    ],
    graficos: [
      { titulo: "Evolução de Eventos", mostra: "Eventos por mês e por dia.", fonte: "Eventos do SGA (data de cadastro)." },
      { titulo: "Situação dos Eventos", mostra: "Distribuição por situação atual.", fonte: "Eventos do SGA." },
      { titulo: "Motivo do Evento / Tipo de Evento / Envolvimento", mostra: "Natureza do evento (colisão, vidros, furto…), associado x terceiro, vítima x causador.", fonte: "Eventos do SGA." },
      { titulo: "Eventos por Estado / por Cidade", mostra: "Onde os eventos acontecem.", fonte: "Local do evento; sem local, cidade/UF do associado." },
      { titulo: "Eventos por Regional / por Cooperativa", mostra: "Origem comercial.", fonte: "Eventos do SGA." },
      { titulo: "Tipo de Veículo", mostra: "Moto, passeio, caminhão, van.", fonte: "Modelo do veículo no evento." },
      { titulo: "Custo por Cooperativa", mostra: "Custo dos eventos por cooperativa.", fonte: "MGF ligado ao protocolo." },
      { titulo: "Tempo de Conclusão de Eventos", mostra: "Quantos eventos foram finalizados em até 60, 70, 90 dias ou mais.", fonte: "Data de cadastro x data em que foi visto finalizado." },
      { titulo: "Evolução da Sinistralidade (Custo)", mostra: "Custo dos eventos ÷ recebido, por mês.", fonte: "MGF (custo) + Cobrança (recebido)." },
      { titulo: "Sinistralidade por Volume de Eventos", mostra: "Eventos ÷ placas ativas, por mês.", fonte: "Eventos + base de veículos." },
    ],
    duvidas: [
      { pergunta: "Abri um evento hoje e ele não aparece.", resposta: "Eventos novos entram no próximo ciclo (06:00 ou 13:00, ou no horário da associação). Veja nesta tela a hora da última atualização." },
      { pergunta: "Por que o custo do evento está zerado?", resposta: "O custo vem do MGF. Ele só é ligado ao evento quando o lançamento no SGA traz o protocolo do evento." },
    ],
  },
  {
    id: "mgf",
    titulo: "MGF (financeiro)",
    telaFiltros: "mgf",
    resumo: "Lançamentos do Módulo de Gestão Financeira do SGA: pagamentos e recebimentos, por operação, centro de custo, fornecedor, forma de pagamento, situação, cooperativa e evento.",
    origem: [
      "Lançamentos do MGF (contas a pagar e a receber) com vencimento de 120 dias atrás até 12 meses à frente.",
      "Cooperativa, regional, associado, placa e tipo de veículo: completados a partir do cadastro da base (a API do MGF só envia códigos) e do evento ligado ao lançamento.",
    ],
    atualizacao: [
      "Duas vezes por dia (06:00 e 13:00) e no horário da associação. A cada importação o período é substituído pelo que está no SGA — alterações e exclusões feitas lá aparecem aqui.",
    ],
    regras: [
      { titulo: "Base de data", texto: "Por vencimento (previsão) ou por pagamento (o que efetivamente saiu/entrou), conforme o filtro." },
      { titulo: "Pago x a pagar", texto: "Pago = situação PAGA/PAGO ou com data de pagamento. \"À PAGAR\" é em aberto. Canceladas, excluídas e estornadas ficam fora dos totais ativos." },
      { titulo: "Vencidos e a vencer", texto: "Em aberto com vencimento antes de hoje (vencidos) ou nos próximos 7/15/30/60/90 dias (a vencer)." },
      { titulo: "Operação", texto: "Entrada (receber) ou saída (pagar), conforme a operação cadastrada no SGA." },
      { titulo: "Motivo do evento", texto: "Preenchido quando o lançamento traz o protocolo de um evento." },
    ],
    graficos: [
      { titulo: "Evolução Temporal", mostra: "Valores por mês e por dia.", fonte: "Lançamentos do MGF." },
      { titulo: "Por Operação / SubOperação / Centro de Custo", mostra: "Como o dinheiro é classificado no SGA.", fonte: "Lançamentos do MGF." },
      { titulo: "Por Situação de Pagamento / Forma de Pagamento", mostra: "Pago, à pagar, cancelado; boleto, PIX, transferência…", fonte: "Lançamentos do MGF." },
      { titulo: "Por Fornecedor", mostra: "Maiores fornecedores.", fonte: "Lançamentos do MGF (cadastro de fornecedores do SGA)." },
      { titulo: "Por Cooperativa / Por Regional", mostra: "Origem comercial do lançamento.", fonte: "Código no lançamento → cadastro da base; ou evento ligado." },
      { titulo: "Por Tipo de Veículo / Top Associados", mostra: "Para quem foi o lançamento.", fonte: "Código do veículo/associado → cadastro da base." },
      { titulo: "Por Motivo Evento", mostra: "Gastos por natureza do evento.", fonte: "Protocolo do evento no lançamento." },
    ],
    duvidas: [
      { pergunta: "Cooperativa ou associado aparecem vazios em alguns lançamentos.", resposta: "Lançamentos administrativos (comissões, despesas fixas) não têm veículo/associado no SGA. Para os demais, o nome é completado após a próxima conferência da base." },
    ],
  },
  {
    id: "cobranca",
    titulo: "Cobrança",
    telaFiltros: "cobranca",
    resumo: "Boletos do SGA: emitidos, pagos, em aberto, inadimplência, arrecadação por dia, por dia de vencimento, por regional e cooperativa.",
    origem: [
      "Boletos do SGA (consulta de boletos por período de vencimento), em duas importações complementares: \"recente\" (60 dias para trás até 60 dias à frente, sempre atualizada) e \"histórico\" (meses anteriores).",
      "Cooperativa do boleto; quando o boleto não traz, usa a cooperativa do veículo na base.",
    ],
    atualizacao: [
      "Ciclo contínuo: a janela recente é percorrida em blocos de 5 dias; ao completar, só recomeça depois de 6 horas. Na prática, os números são atualizados várias vezes ao dia.",
    ],
    regras: [
      { titulo: "Um boleto, uma vez", texto: "Boletos repetidos (mesmo nosso número) contam uma vez só." },
      { titulo: "Mês de referência", texto: "Mês do vencimento original do boleto." },
      { titulo: "Critério SGA x Total", texto: "SGA (padrão): só veículos sem boleto em aberto nos 6 meses anteriores — bate com o Relatório de Boletos do SGA. Total: todos os boletos do mês." },
      { titulo: "Situações", texto: "Contam ABERTO e BAIXADO (pago). CANCELADO e EXCLUÍDO ficam fora." },
      { titulo: "Inadimplência", texto: "Boletos em aberto ÷ boletos do mês. Regra validada: considera TODOS os boletos do mês, inclusive os que ainda não venceram (base \"total\"). Por isso o percentual começa alto no início do mês e cai conforme os pagamentos entram." },
      { titulo: "Tipos de boleto", texto: "O filtro \"Tipo de boleto\" escolhe quais tipos entram nas contas. FECHAMENTO é a mensalidade. O resumo diário usa o padrão da associação (normalmente só FECHAMENTO) e informa as demais cobranças à parte." },
      { titulo: "Avulsos", texto: "Boletos de dias de vencimento fora do ciclo da associação: dias com menos de 5% dos boletos do mês." },
    ],
    graficos: [
      { titulo: "Cards de Emitidos, Pagos, Em Aberto e Avulsos", mostra: "Quantidade e valor do mês.", fonte: "Boletos (filtros aplicados)." },
      { titulo: "Inadimplência por dia", mostra: "Evolução diária do percentual em aberto no mês.", fonte: "Boletos do mês." },
      { titulo: "Arrecadação", mostra: "Valor pago por dia.", fonte: "Data de pagamento dos boletos." },
      { titulo: "Dias de vencimento", mostra: "Boletos e inadimplência por dia de vencimento (5, 10, 15, 20…).", fonte: "Dia de vencimento do veículo." },
      { titulo: "Regionais e Cooperativas — mais pagas / mais abertas / maior e menor inadimplência", mostra: "Comparativo entre unidades.", fonte: "Boletos + cooperativa do veículo." },
      { titulo: "Histórico de inadimplência", mostra: "Fotografias diárias do percentual para comparar meses.", fonte: "Registro diário do sistema." },
    ],
    duvidas: [
      { pergunta: "O total de boletos é maior que as placas ativas.", resposta: "Verifique o filtro de tipo: além da mensalidade existem taxas, cotas de participação e boletos de cobrança. Com \"Só mensalidades\" o número fica próximo da frota." },
      { pergunta: "Por que a inadimplência está alta no começo do mês?", resposta: "Porque a regra considera também boletos que ainda vão vencer. Ela cai conforme os pagamentos são registrados." },
    ],
  },
  {
    id: "relatorio",
    titulo: "Resumo diário (WhatsApp)",
    resumo: "Mensagem enviada todo dia com o resumo da operação: base, financeiro, cobrança, eventos e destaques, com PDF quando o modelo exige.",
    origem: ["Os mesmos dados dos painéis, calculados no momento do envio."],
    atualizacao: ["Envio no horário configurado (normalmente 08:00)."],
    regras: [
      { titulo: "Mês de referência", texto: "Até o dia 6 o resumo usa o mês anterior (que ainda está liquidando); a partir do dia 7, o mês atual." },
      { titulo: "Tipos de boleto", texto: "Métricas de cobrança só com os tipos padrão da associação (normalmente FECHAMENTO). As demais cobranças aparecem em \"Outras cobranças\" no texto e no PDF." },
      { titulo: "Falhas", texto: "Se cobrança ou eventos não puderem ser calculados, o sistema tenta de novo e registra o aviso. Se os dois falharem, a mensagem não é enviada com campos vazios." },
    ],
    graficos: [],
  },
];

/* ------------------------------------------------------------------ */
/* Descrição legível dos filtros salvos (bi_filtros_padrao)            */
/* ------------------------------------------------------------------ */

export type FiltroDescrito = { rotulo: string; valor: string; efeito?: string };

const fmtData = (v: unknown): string => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("pt-BR");
};
const todos = (v: unknown) => !v || v === "todos" || v === "all" || (Array.isArray(v) && v.length === 0);
const lista = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v));

export function descreverFiltros(tela: string, f: Record<string, unknown> | null | undefined): FiltroDescrito[] {
  if (!f) return [];
  const out: FiltroDescrito[] = [];
  const add = (rotulo: string, valor: string, efeito?: string) => out.push({ rotulo, valor, efeito });

  switch (tela) {
    case "indicadores": {
      add("Período dos gráficos", f.todoPeriodo ? "Todo o período" : `Últimos ${Number(f.chartRange) || 12} meses`,
        f.todoPeriodo ? "Os gráficos mostram todos os meses com dado." : undefined);
      add("Evolução da frota", f.frotaModo === "dia" ? "Por dia (últimos 60 dias)" : "Por mês");
      break;
    }
    case "estudo_base": {
      add("Situação", todos(f.situacao) ? "Todas" : lista(f.situacao));
      add("Regional", todos(f.regional) ? "Todas" : String(f.regional));
      add("Cooperativa", todos(f.cooperativa) ? "Todas" : String(f.cooperativa));
      if (f.dataContratoInicio || f.dataContratoFim)
        add("Data de contrato", `${fmtData(f.dataContratoInicio) || "início"} a ${fmtData(f.dataContratoFim) || "hoje"}`,
          "Só veículos com contrato nesse intervalo.");
      add("Montadora", todos(f.montadora) ? "Todas" : String(f.montadora));
      add("Faixa de valor protegido", todos(f.faixaValorProtegido) ? "Todas" : String(f.faixaValorProtegido));
      break;
    }
    case "eventos": {
      add("Status", f.status === "todos" ? "Todos" : "Em andamento",
        f.status === "todos" ? "Inclui eventos finalizados." : "Eventos finalizados ficam fora dos números.");
      if (f.dataInicio || f.dataFim)
        add("Período (data de cadastro)", `${fmtData(f.dataInicio) || "início"} a ${fmtData(f.dataFim) || "hoje"}`);
      else add("Período (data de cadastro)", "Todo o histórico importado");
      add("Regional", todos(f.regional) ? "Todas" : String(f.regional));
      add("Cooperativa", todos(f.cooperativa) ? "Todas" : String(f.cooperativa));
      add("Tipo de veículo", todos(f.tipoVeiculo) ? "Todos" : String(f.tipoVeiculo));
      break;
    }
    case "mgf": {
      add("Base de data", f.baseData === "pagamento" ? "Data de pagamento" : "Data de vencimento",
        f.baseData === "pagamento" ? "Mostra o que efetivamente foi pago/recebido no período." : "Mostra o que vence no período (previsão).");
      const dr = f.dateRange as { from?: unknown; to?: unknown } | undefined;
      if (dr?.from || dr?.to) add("Período", `${fmtData(dr?.from) || "início"} a ${fmtData(dr?.to) || "hoje"}`);
      add("Operações", todos(f.operacoes) ? "Todas" : lista(f.operacoes));
      add("Suboperações", todos(f.subOperacoes) ? "Todas" : lista(f.subOperacoes));
      add("Situação", todos(f.situacao) ? "Todas" : String(f.situacao));
      add("Cooperativa", todos(f.cooperativa) ? "Todas" : String(f.cooperativa));
      add("Regional", todos(f.regional) ? "Todas" : String(f.regional));
      add("Forma de pagamento", todos(f.formaPagamento) ? "Todas" : String(f.formaPagamento));
      add("Tipo de veículo", todos(f.tipoVeiculo) ? "Todos" : String(f.tipoVeiculo));
      break;
    }
    case "cobranca": {
      add("Critério", f.criterio === "total" ? "Total (todos os boletos)" : "SGA (boletos anteriores: não possui)",
        f.criterio === "total" ? "Inclui quem arrasta débito de meses anteriores." : "Igual ao Relatório de Boletos do SGA.");
      const tipos = f.tiposBoleto as string[] | undefined;
      add("Tipos de boleto", !tipos || tipos.length === 0 ? "Todos os tipos" : tipos.join(", "),
        !tipos || tipos.length === 0
          ? "Mensalidades, taxas, cotas de participação e boletos de cobrança somados."
          : tipos.length === 1 && tipos[0] === "FECHAMENTO" ? "Só mensalidades." : undefined);
      add("Situação", todos(f.situacao) ? "Todas" : String(f.situacao));
      add("Regional", todos(f.regional) ? "Todas" : String(f.regional));
      add("Cooperativa", todos(f.cooperativa) ? "Todas" : String(f.cooperativa));
      add("Dia de vencimento", todos(f.diaVencimento) ? "Todos" : `Dia ${f.diaVencimento}`);
      add("Mês", "Sempre abre no mês atual", "O mês não é salvo no padrão, para a tela não abrir num mês antigo.");
      break;
    }
  }
  return out;
}

/** Padrões do sistema quando o usuário ainda não salvou filtros. */
export const PADRAO_SISTEMA: Record<string, Record<string, unknown>> = {
  indicadores: { todoPeriodo: false, chartRange: 12, frotaModo: "mes" },
  estudo_base: { situacao: [], regional: "todos", cooperativa: "todos", montadora: "todos", faixaValorProtegido: "todos" },
  eventos: { status: "em_andamento", regional: "todos", cooperativa: "todos", tipoVeiculo: "todos" },
  mgf: { baseData: "vencimento", operacoes: [], subOperacoes: [], situacao: "todos", cooperativa: "todos", regional: "todos", formaPagamento: "todos", tipoVeiculo: "todos" },
  cobranca: { criterio: "sga", situacao: "todos", regional: "todos", cooperativa: "todos", diaVencimento: "todos" },
};
