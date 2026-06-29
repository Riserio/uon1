export type TipoSinistro =
  | "colisao"
  | "roubo"
  | "furto"
  | "incendio"
  | "patrimonial"
  | "fenomeno"
  | "total";

export const TIPOS: { value: TipoSinistro; icone: string; nome: string; descricao: string }[] = [
  { value: "colisao", icone: "💥", nome: "Colisão", descricao: "Batida, capotamento, abalroamento" },
  { value: "roubo", icone: "🔫", nome: "Roubo", descricao: "Com violência ou grave ameaça" },
  { value: "furto", icone: "🔓", nome: "Furto", descricao: "Subtração sem violência" },
  { value: "incendio", icone: "🔥", nome: "Incêndio", descricao: "Fogo, explosão, combustão" },
  { value: "patrimonial", icone: "🏚", nome: "Danos patrimoniais", descricao: "Portão, muro, poste, imóvel" },
  { value: "fenomeno", icone: "🌩", nome: "Fenômeno natural", descricao: "Granizo, alagamento, raio, vento" },
  { value: "total", icone: "🚗", nome: "Perda total", descricao: "Indenização integral do veículo" },
];

export type SecaoId =
  | "associado"
  | "condutor"
  | "veiculo"
  | "evento"
  | "bo"
  | "fotos"
  | "terceiro"
  | "entrevista"
  | "flags"
  | "nexo"
  | "parecer";

export const SECOES_POR_TIPO: Record<TipoSinistro, SecaoId[]> = {
  colisao: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "terceiro", "entrevista", "flags", "nexo", "parecer"],
  roubo: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "terceiro", "entrevista", "flags", "nexo", "parecer"],
  furto: ["associado", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
  incendio: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
  patrimonial: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "terceiro", "entrevista", "flags", "nexo", "parecer"],
  fenomeno: ["associado", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
  total: ["associado", "condutor", "veiculo", "evento", "bo", "fotos", "entrevista", "flags", "nexo", "parecer"],
};

export type Campo = {
  id: string;
  label: string;
  tipo: "text" | "textarea" | "date" | "time" | "number" | "select" | "radio" | "check" | "placa" | "cpfcnpj";
  obrigatorio?: boolean;
  opcoes?: string[];
  hint?: string;
  badge?: "novo" | "revisado" | "red";
  visivelSe?: (tipo: TipoSinistro) => boolean;
};

const inTipos = (...tipos: TipoSinistro[]) => (t: TipoSinistro) => tipos.includes(t);

export const SECOES: { id: SecaoId; titulo: string; cor: string; campos: Campo[] }[] = [
  {
    id: "associado",
    titulo: "Dados do associado",
    cor: "blue",
    campos: [
      { id: "ass_nome", label: "Nome do associado", tipo: "text", obrigatorio: true },
      { id: "ass_cadastro", label: "Data de cadastro", tipo: "date" },
      { id: "ass_status", label: "Status atual", tipo: "radio", opcoes: ["Ativo", "Inadimplente"] },
      { id: "ass_boletos", label: "Boletos em aberto", tipo: "number" },
      { id: "ass_dias_venc", label: "Dias até próximo vencimento", tipo: "number", badge: "novo", hint: "Vencimento próximo ao evento é red flag" },
      { id: "ass_historico_eventos", label: "Eventos anteriores?", tipo: "radio", opcoes: ["Sim", "Não"] },
      { id: "ass_qtd_24m", label: "Qtd. eventos nos últimos 24 meses", tipo: "number", badge: "novo" },
      { id: "ass_mesmo_tipo", label: "Algum anterior do mesmo tipo do atual?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
      { id: "ass_sbl", label: "Consulta SBL", tipo: "select", opcoes: ["Ativo em outra base", "Outro status", "Não consta"] },
    ],
  },
  {
    id: "condutor",
    titulo: "Dados do condutor",
    cor: "purple",
    campos: [
      { id: "cond_quem", label: "Próprio associado ou outro?", tipo: "radio", opcoes: ["Próprio", "Outro"], obrigatorio: true },
      { id: "cond_nome", label: "Nome completo do condutor", tipo: "text" },
      { id: "cond_relacao", label: "Relação com o associado", tipo: "text" },
      { id: "cond_habilitado", label: "Habilitado?", tipo: "radio", opcoes: ["Sim", "Não"] },
      { id: "cond_cnh_venc", label: "CNH vencida?", tipo: "radio", opcoes: ["Sim", "Não"] },
      { id: "cond_cnh_cat", label: "Categoria da CNH", tipo: "select", opcoes: ["A", "B", "C", "D", "E", "AB"] },
      { id: "cond_idade", label: "Idade do condutor", tipo: "number", badge: "novo" },
      { id: "cond_tempo_hab", label: "Tempo de habilitação (anos)", tipo: "number", badge: "novo" },
      { id: "cond_alcool", label: "Alcoolemia", tipo: "select", opcoes: ["Não", "Sim", "Não testado", "Recusou"], badge: "novo" },
      { id: "cond_celular", label: "Uso de celular declarado no BO?", tipo: "radio", opcoes: ["Sim", "Não", "Não consta"] },
      { id: "cond_cinto", label: "Usava cinto?", tipo: "radio", opcoes: ["Sim", "Não", "N/A"] },
      { id: "cond_finalidade", label: "Finalidade", tipo: "radio", opcoes: ["Trabalho", "Lazer", "Não informado"] },
      { id: "cond_vitimas", label: "Houve vítimas?", tipo: "radio", opcoes: ["Sim", "Não"] },
    ],
  },
  {
    id: "veiculo",
    titulo: "Dados do veículo",
    cor: "gray",
    campos: [
      { id: "vei_placa", label: "Placa", tipo: "placa", obrigatorio: true },
      { id: "vei_marca_modelo", label: "Marca/Modelo", tipo: "text" },
      { id: "vei_ano", label: "Ano de fabricação", tipo: "number" },
      { id: "vei_fipe", label: "Valor FIPE (R$)", tipo: "number", badge: "novo" },
      { id: "vei_km", label: "Km do odômetro", tipo: "number", badge: "novo" },
      { id: "vei_anuncio", label: "Anúncio de venda ativo?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
      { id: "vei_restricao", label: "Restrição DETRAN", tipo: "radio", opcoes: ["Sim", "Não"], badge: "novo" },
      { id: "vei_multas", label: "Possui multas?", tipo: "radio", opcoes: ["Sim", "Não"] },
      { id: "vei_pneus", label: "Pneus adequados?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "novo" },
      { id: "vei_freios", label: "Freios/faróis OK?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "novo" },
      { id: "vei_avaria_pre", label: "Avaria pré-existente?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "novo" },
      { id: "vei_tacografo", label: "Tacógrafo?", tipo: "radio", opcoes: ["Sim", "Não"], visivelSe: inTipos("colisao", "roubo", "incendio", "fenomeno", "total") },
      { id: "vei_rastreador", label: "Rastreador?", tipo: "radio", opcoes: ["Sim", "Não"], visivelSe: inTipos("colisao", "roubo", "incendio", "fenomeno", "total") },
      { id: "vei_rast_resultado", label: "Resultado da consulta do rastreador", tipo: "select", opcoes: ["Sinal compatível", "Sinal divergente", "Sem sinal no horário", "Não instalado", "Não consultado"], badge: "revisado", visivelSe: inTipos("colisao", "roubo", "incendio", "fenomeno", "total") },
      { id: "vei_rast_interferido", label: "Rastreador foi interferido?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red", visivelSe: inTipos("colisao", "roubo", "incendio", "fenomeno", "total") },
    ],
  },
  {
    id: "evento",
    titulo: "Dados do evento e dinâmica",
    cor: "red",
    campos: [
      { id: "evt_sub_colisao", label: "Subtipo de colisão", tipo: "select", opcoes: ["Frontal", "Traseira", "Lateral", "Capotamento", "Saída de pista", "Atropelamento", "Engavetamento", "Outro"], visivelSe: inTipos("colisao") },
      { id: "evt_sub_roubo", label: "Subtipo de roubo", tipo: "select", opcoes: ["Abordagem armada", "Sequestro relâmpago", "Saidinha bancária", "Em residência", "Outro"], visivelSe: inTipos("roubo") },
      { id: "evt_sub_furto", label: "Subtipo de furto", tipo: "select", opcoes: ["Mediante chave falsa", "Sem arrombamento aparente", "Com arrombamento", "Outro"], visivelSe: inTipos("furto") },
      { id: "evt_sub_incendio", label: "Subtipo de incêndio", tipo: "select", opcoes: ["Elétrico", "Mecânico", "Combustível", "Atear fogo", "Outro"], visivelSe: inTipos("incendio") },
      { id: "evt_sub_fenomeno", label: "Subtipo de fenômeno", tipo: "select", opcoes: ["Granizo", "Alagamento", "Raio", "Vento forte", "Queda de árvore", "Outro"], visivelSe: inTipos("fenomeno") },
      { id: "evt_data", label: "Data do evento", tipo: "date", obrigatorio: true },
      { id: "evt_hora", label: "Hora do evento", tipo: "time", obrigatorio: true, badge: "novo", hint: "Cruzar com rastreador e câmeras" },
      { id: "evt_periodo", label: "Período", tipo: "radio", opcoes: ["Dia 6h-18h", "Noite 18h-24h", "Madrugada 0h-6h"] },
      { id: "evt_movimento", label: "Veículo em movimento?", tipo: "radio", opcoes: ["Sim", "Não", "Estacionado"], visivelSe: inTipos("colisao", "roubo", "incendio", "patrimonial", "total") },
      { id: "evt_velocidade", label: "Velocidade estimada (km/h)", tipo: "number", visivelSe: inTipos("colisao", "patrimonial", "total") },
      { id: "evt_dinamica", label: "Descrição da dinâmica pelo associado", tipo: "textarea", obrigatorio: true },
      { id: "evt_endereco", label: "Endereço completo", tipo: "text" },
      { id: "evt_maps", label: "Link Google Maps", tipo: "text" },
      { id: "evt_via", label: "Tipo de via", tipo: "select", opcoes: ["Urbana", "Rodovia federal", "Rodovia estadual", "Rural", "Estacionamento"], badge: "novo" },
      { id: "evt_clima", label: "Condição climática", tipo: "select", opcoes: ["Bom", "Chuva fraca", "Chuva forte", "Neblina", "Outro"], badge: "novo" },
      { id: "evt_pavimento", label: "Condição do pavimento", tipo: "select", opcoes: ["Seco", "Molhado", "Esburacado", "Areia/cascalho", "Outro"], badge: "novo" },
    ],
  },
  {
    id: "bo",
    titulo: "Boletim de ocorrência",
    cor: "amber",
    campos: [
      { id: "bo_numero", label: "Número do BO", tipo: "text" },
      { id: "bo_data", label: "Data do BO", tipo: "date" },
      { id: "bo_hora", label: "Hora do BO", tipo: "time", badge: "novo" },
      { id: "bo_dias", label: "Dias entre evento e BO", tipo: "number" },
      { id: "bo_tipo", label: "BO presencial ou online?", tipo: "radio", opcoes: ["Presencial", "Online"] },
      { id: "bo_delegacia_prox", label: "Foi na delegacia mais próxima?", tipo: "radio", opcoes: ["Sim", "Não", "Não consta"], badge: "novo" },
      { id: "bo_retificacao", label: "Houve retificação ou 2º BO?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
      { id: "bo_relato", label: "Relato do BO", tipo: "textarea", obrigatorio: true },
      { id: "bo_coerencia_temp", label: "Datas/horas do evento × BO são coerentes?", tipo: "radio", opcoes: ["Sim", "Divergem"], badge: "revisado" },
      { id: "bo_valor", label: "Valor estimado dos danos (R$)", tipo: "number" },
      { id: "bo_classif", label: "Classificação", tipo: "select", opcoes: ["Pequeno (até R$3k)", "Médio (R$3k–15k)", "Grande (acima R$15k)", "Perda total"], badge: "revisado" },
    ],
  },
  {
    id: "fotos",
    titulo: "Fotos e documentação",
    cor: "green",
    campos: [
      { id: "fotos_incluidas", label: "Fotos do veículo incluídas?", tipo: "radio", opcoes: ["Sim", "Não"] },
      { id: "fotos_qualidade", label: "Qualidade das fotos", tipo: "radio", opcoes: ["Boa", "Razoável", "Ruim"], badge: "novo" },
      { id: "fotos_coerencia", label: "Danos coerentes com o tipo de evento?", tipo: "radio", opcoes: ["Sim", "Parcial", "Não"], badge: "novo" },
      { id: "fotos_ferrugem", label: "Ferrugem nas bordas dos danos?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
      { id: "fotos_metadata", label: "Metadata das fotos compatível?", tipo: "radio", opcoes: ["Sim", "Não", "Sem metadata"], badge: "novo" },
      { id: "doc_bombeiros", label: "Laudo do Corpo de Bombeiros anexado?", tipo: "radio", opcoes: ["Sim", "Não"], visivelSe: inTipos("incendio") },
      { id: "doc_meteoro", label: "Registro meteorológico anexado?", tipo: "radio", opcoes: ["Sim", "Não"], visivelSe: inTipos("fenomeno") },
      { id: "doc_laudo_pt", label: "Laudo de perda total anexado?", tipo: "radio", opcoes: ["Sim", "Não"], visivelSe: inTipos("total") },
      { id: "doc_pat", label: "Orçamento do reparo patrimonial?", tipo: "radio", opcoes: ["Sim", "Não"], visivelSe: inTipos("patrimonial") },
    ],
  },
  {
    id: "terceiro",
    titulo: "Terceiro envolvido",
    cor: "amber",
    campos: [
      { id: "ter_nome", label: "Nome do terceiro", tipo: "text" },
      { id: "ter_doc", label: "CPF/CNPJ do terceiro", tipo: "cpfcnpj", badge: "novo" },
      { id: "ter_contato", label: "Contato do terceiro", tipo: "text" },
      { id: "ter_placa", label: "Placa do terceiro", tipo: "placa" },
      { id: "ter_seguradora", label: "Seguradora do terceiro", tipo: "text", badge: "novo" },
      { id: "ter_situacao", label: "Situação atual do terceiro", tipo: "select", opcoes: ["Contatado", "Não localizado", "Aguardando retorno", "Ressarcimento em andamento", "Concluído"], badge: "novo" },
      { id: "ter_conhecido", label: "Terceiro é conhecido/associado?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
      { id: "ter_intermediario", label: "Mencionou intermediário/despachante?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
    ],
  },
  {
    id: "entrevista",
    titulo: "Entrevista e análise comportamental",
    cor: "purple",
    campos: [
      { id: "ent_ligacao", label: "Contato por ligação?", tipo: "radio", opcoes: ["Sim", "Não"] },
      { id: "ent_contradicoes", label: "Houve contradições no relato?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
      { id: "ent_fechamento", label: "Solicitou fechamento rápido?", tipo: "radio", opcoes: ["Sim", "Não"], badge: "red" },
      { id: "ent_avaliacao", label: "Avaliação comportamental", tipo: "select", opcoes: ["Tranquilo", "Cooperativo", "Defensivo", "Ansioso", "Evasivo", "Hostil"], badge: "revisado" },
      { id: "ent_obs", label: "Observações da entrevista", tipo: "textarea", obrigatorio: true },
    ],
  },
  {
    id: "parecer",
    titulo: "Parecer final",
    cor: "red",
    campos: [
      { id: "par_evidencia", label: "Grau de evidência do nexo causal", tipo: "radio", opcoes: ["Comprovado", "Provável", "Inconclusivo", "Contraindicado"], badge: "revisado" },
      { id: "par_parecer", label: "Parecer do analista", tipo: "radio", opcoes: ["Aprovado", "Negado", "Sindicância", "Necessário Análise Jurídica", "Perícia técnica", "A definir"], obrigatorio: true },
      { id: "par_negativa", label: "Passivo de negativa?", tipo: "radio", opcoes: ["Sim", "Não", "A definir"] },
      { id: "par_fundamentacao", label: "Fundamentação do analista", tipo: "textarea", obrigatorio: true },
      { id: "par_comite", label: "Conclusão do comitê", tipo: "textarea", obrigatorio: true },
    ],
  },
];

export type RedFlag = {
  id: string;
  grupo: string;
  label: string;
  descricao: string;
  peso: number;
  visivelSe?: (t: TipoSinistro) => boolean;
};

export const RED_FLAGS: RedFlag[] = [
  { id: "tp1", grupo: "Temporalidade", label: "Evento próximo ao vencimento", descricao: "Menos de 15 dias", peso: 3 },
  { id: "tp2", grupo: "Temporalidade", label: "Mesmo tipo que o anterior", descricao: "Padrão repetitivo", peso: 3 },
  { id: "tp3", grupo: "Temporalidade", label: "3+ eventos em 24 meses", descricao: "Frequência acima do esperado", peso: 2 },
  { id: "tp4", grupo: "Temporalidade", label: "Evento próximo ao ingresso", descricao: "Menos de 90 dias", peso: 2 },
  { id: "bo1", grupo: "BO", label: "BO online para grande monta", descricao: "Ausência de registro presencial", peso: 3 },
  { id: "bo2", grupo: "BO", label: "BO em delegacia distante", descricao: "Incompatibilidade geográfica", peso: 2 },
  { id: "bo3", grupo: "BO", label: "Retificação ou 2º BO", descricao: "Alteração de relato", peso: 3 },
  { id: "bo4", grupo: "BO", label: "Linguagem técnica atípica no BO", descricao: "Possível elaboração por terceiro", peso: 2 },
  { id: "rs1", grupo: "Rastreador", label: "Rastreador sem sinal no horário", descricao: "Desconexão próxima ao sinistro", peso: 4, visivelSe: inTipos("colisao", "roubo", "incendio", "fenomeno", "total") },
  { id: "rs2", grupo: "Rastreador", label: "Rastreador incompatível com relato", descricao: "Localização ou velocidade divergem", peso: 4, visivelSe: inTipos("colisao", "roubo", "incendio", "fenomeno", "total") },
  { id: "ft1", grupo: "Fotos e danos", label: "Danos incoerentes com a dinâmica", descricao: "Posição, extensão ou tipo", peso: 3 },
  { id: "ft2", grupo: "Fotos e danos", label: "Ferrugem nas bordas dos danos", descricao: "Indício de dano pré-existente", peso: 3 },
  { id: "ft3", grupo: "Fotos e danos", label: "Metadata das fotos incompatível", descricao: "Data/hora das imagens não bate", peso: 2 },
  { id: "cl1", grupo: "Conluio", label: "Terceiro é associado ou conhecido", descricao: "Possível conluio", peso: 3, visivelSe: inTipos("colisao", "roubo", "patrimonial") },
  { id: "cl2", grupo: "Conluio", label: "Mencionou intermediário/despachante", descricao: "Fraude organizada", peso: 3, visivelSe: inTipos("colisao", "roubo", "patrimonial") },
  { id: "co1", grupo: "Comportamento", label: "Relato com contradições", descricao: "Alterou informações", peso: 2 },
  { id: "co2", grupo: "Comportamento", label: "Solicitou fechamento rápido", descricao: "Urgência atípica", peso: 2 },
  { id: "co3", grupo: "Comportamento", label: "Veículo com anúncio de venda", descricao: "Desfazimento + acionamento", peso: 2 },
  { id: "te1", grupo: "Terceiros ausentes", label: "Terceiro não identificado", descricao: "Placa ou contato inválidos", peso: 2, visivelSe: inTipos("furto", "roubo") },
  { id: "fn1", grupo: "Fenômeno", label: "Evento isolado sem outros afetados", descricao: "Fenômeno não confirmado", peso: 3, visivelSe: inTipos("fenomeno") },
  { id: "fn2", grupo: "Fenômeno", label: "Ausência de registro meteorológico", descricao: "Nenhuma fonte oficial confirma", peso: 2, visivelSe: inTipos("fenomeno") },
  { id: "in1", grupo: "Incêndio", label: "GNV ou modificação não homologada", descricao: "Fator não declarado", peso: 3, visivelSe: inTipos("incendio") },
  { id: "in2", grupo: "Incêndio", label: "Bombeiros não foram acionados", descricao: "Ausência de laudo oficial", peso: 3, visivelSe: inTipos("incendio") },
];

export const NEXO_STEPS = [
  { id: "n1", titulo: "O evento realmente ocorreu?", descricao: "BO, fotos, rastreador, câmeras, testemunhas", opcoes: ["Comprovado", "Provável", "Inconclusivo", "Contraindicado"] },
  { id: "n2", titulo: "O evento ocorreu da forma declarada?", descricao: "Dinâmica × danos × local × rastreador", opcoes: ["Comprovado", "Provável — divergências menores", "Inconclusivo", "Contraindicado"] },
  { id: "n3", titulo: "Os danos são consequência direta?", descricao: "Pré-existências, proporcionalidade, vistoria prévia", opcoes: ["Comprovado", "Parcial — pré-existências", "Inconclusivo", "Contraindicado"] },
  { id: "n4", titulo: "Veículo e condutor estavam aptos?", descricao: "CNH, CRLV, restrições, rastreador", opcoes: ["Aptos", "Irregularidade sem relação", "Irregularidade com possível relação", "Inaptos — enseja negativa"] },
  { id: "n5", titulo: "A cobertura se aplica à causa real?", descricao: "Exclusões: embriaguez, dolo, uso comercial", opcoes: ["Sim", "Parcialmente", "Inconclusivo", "Não — causa exclui cobertura"] },
  { id: "n6", titulo: "Há indícios de conluio ou fraude organizada?", descricao: "Vínculos, padrões", opcoes: ["Não — sem indícios", "Indícios fracos", "Indícios moderados — sindicância", "Indícios fortes — investigação"] },
];

export function nivelScore(score: number) {
  if (score >= 13) return { label: "Crítico", cor: "#7f1d1d" };
  if (score >= 6) return { label: "Alto", cor: "#dc2626" };
  if (score >= 1) return { label: "Atenção", cor: "#d97706" };
  return { label: "Baixo", cor: "#16a34a" };
}