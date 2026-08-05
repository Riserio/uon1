/**
 * Documentação viva do sistema.
 *
 * Mantida como dado (não como JSX) de propósito: qualquer pessoa consegue
 * editar uma seção sem mexer em componente, e o conteúdo pode ser exportado,
 * versionado e revisado em pull request como texto.
 *
 * Regra de ouro deste arquivo: registrar o PORQUÊ, não só o quê. Boa parte do
 * que está aqui foi descoberto a duras penas — investigando divergência de
 * número contra o SGA — e o custo de redescobrir é alto.
 */

export interface DocBloco {
  tipo: "texto" | "lista" | "tabela" | "codigo" | "alerta";
  titulo?: string;
  /** texto | codigo: string. lista: string[]. tabela: {cabecalho, linhas} */
  conteudo: string | string[] | { cabecalho: string[]; linhas: string[][] };
  /** alerta: define a cor */
  nivel?: "info" | "atencao" | "critico";
}

export interface DocSecao {
  id: string;
  titulo: string;
  resumo: string;
  blocos: DocBloco[];
}

export interface DocCapitulo {
  id: string;
  titulo: string;
  icone: "layers" | "database" | "workflow" | "calculator" | "plug" | "shield" | "alert";
  secoes: DocSecao[];
}

export const ATUALIZADO_EM = "05/08/2026";

export const CAPITULOS: DocCapitulo[] = [
  /* ================================================================== */
  {
    id: "visao-geral",
    titulo: "Visão Geral",
    icone: "layers",
    secoes: [
      {
        id: "o-que-e",
        titulo: "O que é o sistema",
        resumo: "Propósito, público e o que ele não é",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "Plataforma de gestão e inteligência de negócio para associações de proteção veicular. " +
              "Consolida dados de 15 associações que operam no SGA da Hinova, e entrega o que o SGA não " +
              "oferece: visão consolidada entre associações, série histórica, cruzamento entre módulos " +
              "(cobrança × eventos × MGF) e um portal próprio para cada associação.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "O que o sistema NÃO é",
            conteudo:
              "Não é substituto do SGA. O SGA é o sistema de origem e a fonte da verdade para a " +
              "associação. Competir com ele no mesmo número é disputa que não se ganha e não interessa: " +
              "bater nos totais é obrigação, não diferencial. O valor está no que ele não faz.",
          },
        ],
      },
      {
        id: "stack",
        titulo: "Tecnologia",
        resumo: "Linguagens, frameworks e infraestrutura",
        blocos: [
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Camada", "Tecnologia", "Observação"],
              linhas: [
                ["Frontend", "React + TypeScript + Vite", "Build sem typecheck; rodar tsc --noEmit à parte"],
                ["UI", "Tailwind + shadcn/ui", "Só classes utilitárias do core do Tailwind"],
                ["Gráficos", "Recharts", "Widgets padronizados"],
                ["Banco", "PostgreSQL (Supabase)", "Regra de negócio pesada mora em função SQL"],
                ["Backend", "Edge Functions (Deno)", "Importação, integração e relatórios"],
                ["Agendamento", "pg_cron + net.http_post", "Cron chama a function de hora em hora"],
                ["Hospedagem", "Lovable", "Deploy de function não publica arquivo novo criado só por git"],
              ],
            },
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Armadilha de deploy",
            conteudo:
              "Edge function NOVA criada apenas via git não é publicada pelo deploy do Lovable — ele " +
              "publica as que já conhece. Sintoma: a function responde 'Failed to fetch' mesmo com o " +
              "código no repositório. Saída: publicar pelo CLI (supabase functions deploy) ou embutir a " +
              "novidade numa function existente até ela ser criada pela plataforma.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Prefira resolver no banco quando der",
            conteudo:
              "Regra que vive em função SQL entra em vigor na hora, sem deploy e sem consumir execução " +
              "de edge function. Isso já salvou correções urgentes quando o token de deploy estava " +
              "vencido e quando os créditos da plataforma acabaram. O corolário: mudança no banco também " +
              "não passa por revisão de código — comente a função explicando o porquê, como se fosse PR.",
          },
        ],
      },
    ],
  },

  /* ================================================================== */
  {
    id: "integracao",
    titulo: "Integração com o SGA",
    icone: "plug",
    secoes: [
      {
        id: "api-hinova",
        titulo: "API da Hinova",
        resumo: "Endpoints, autenticação e comportamento real",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "Base: https://api.hinova.com.br/api/sga/v2 (varia por associação, ver hinova_credenciais). " +
              "Autenticação em dois passos: POST /usuario/autenticar com o token da associação no header " +
              "devolve um token_usuario de vida curta, usado nas demais chamadas.",
          },
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Endpoint", "Uso", "Cuidado"],
              linhas: [
                ["POST /listar/veiculo", "Base de veículos", "Exige codigo_situacao. Repete registros entre páginas"],
                ["POST /listar/boleto-associado/periodo", "Cobrança", "Trunca em ~3.000 por janela, sem avisar"],
                ["POST /mgf-lancamento/listar", "MGF", "Paginado por inicio_paginacao"],
                ["POST /listar/evento", "Eventos", "Janela por data de cadastro"],
                ["GET /veiculo/buscar/{placa}/placa", "Consulta pontual", "Funciona bem"],
                ["GET /associado/buscar/{cpf}", "Consulta pontual", "Funciona bem"],
              ],
            },
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Truncamento silencioso",
            conteudo:
              "A API corta a resposta de boletos em ~3.000 registros por janela, sem erro e sem paginar. " +
              "Com janela de 30 dias, outubro/2025 da VALECAR trazia 2.933 boletos quando o real é 7.437 — " +
              "60% da base do mês faltando, sem nenhum sinal. O importador divide a janela ao meio " +
              "recursivamente quando a resposta chega no teto.",
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Duplicação entre páginas",
            conteudo:
              "/listar/veiculo informa total e número de páginas, mas a página 2 costuma repetir a 1. " +
              "KM PV e EXCLUSIVE chegaram a ter 10.000 linhas para ~5.000 veículos reais. O importador " +
              "deduplica por placa ou chassi antes de gravar.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Campo que muda de tipo",
            conteudo:
              "regional e cooperativa às vezes vêm como string e às vezes como objeto {codigo, descricao}. " +
              "Gravado direto numa coluna de texto, o objeto virava JSON cru no gráfico — e pior, a mesma " +
              "entidade aparecia duas vezes no ranking, dividindo o denominador. Normalizado por nomeDe().",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "O que a API NÃO envia",
            conteudo:
              "Não vêm juros, tarifa bancária nem desconto: o campo valor_pagamento do boleto é sempre " +
              "idêntico ao valor de face. Também não vem custo nos eventos. Por isso os indicadores de " +
              "Arrecadação de Juros, Descontado Banco e Sinistralidade Financeira ficam zerados — é " +
              "ausência de origem, não erro de cálculo. Não estime esses números: um valor inventado " +
              "vira decisão errada depois.",
          },
        ],
      },
      {
        id: "sincronizacao",
        titulo: "Sincronização",
        resumo: "Quando roda, o que traz e quanto custa",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "Quatro schedulers (base, cobrança, MGF, eventos) são acordados pelo cron dentro do " +
              "horário comercial (11h às 21h UTC = 08h às 18h de Brasília). Cada um verifica se a hora " +
              "atual está em horarios_sync da associação (padrão 08h e 14h, editável na tela Sincronizar) " +
              "e retorna cedo se não estiver.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Janela de 45 dias",
            conteudo:
              "A janela padrão era de 540 dias, o que fazia cada execução rebuscar meses já fechados duas " +
              "vezes por dia: só a cobrança eram ~540 chamadas diárias, 90% sobre dados que não mudam. " +
              "Hoje a janela é de 45 dias. Período antigo é responsabilidade do backfill, com " +
              "data_inicio/data_fim explícitos.",
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Cron verde não significa importação feita",
            conteudo:
              "O cron registra 'succeeded' quando a chamada HTTP responde 200 — mesmo que a importação " +
              "dentro dela tenha falhado. A base de três associações ficou congelada por dias com todos " +
              "os jobs verdes. Para saber se realmente entrou dado, olhe a data do último registro " +
              "importado (nunca o status do cron) ou a aba Importação SGA.",
          },
        ],
      },
      {
        id: "backfill-historico",
        titulo: "Backfill do histórico",
        resumo: "Como o passado é reconstruído, e por que demora",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "A importação diária cobre apenas o período recente. O histórico é preenchido por um " +
              "processo separado (importar_cobranca_api) que caminha do passado para o presente em " +
              "janelas de 5 dias, guardando a posição em meta->>'cursor_backfill' da importação " +
              "'API cobrança (histórico)'. Quando alcança o início do período já coberto pela diária, " +
              "marca backfill_completo e para.",
          },
          {
            tipo: "texto",
            titulo: "Ritmo e acompanhamento",
            conteudo:
              "São 6 janelas por execução (~30 dias) e uma associação por vez, serializada por advisory " +
              "lock, a cada 2 minutos (cron backfill-cobranca-historico). Roda inteiramente no banco, " +
              "então não consome execução de edge function. O progresso fica visível na aba " +
              "Configurações > Documentação > Importação SGA.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Gráfico histórico incompleto costuma ser backfill em andamento",
            conteudo:
              "Antes de investigar cálculo, veja até onde o cursor chegou. Uma associação com cursor em " +
              "2021 simplesmente ainda não tem 2022 a 2025 no banco — os gráficos vão preencher sozinhos " +
              "conforme avança. A APVALE ficou meses assim: 12 mil boletos de 2021 e nada entre 2022 e " +
              "abril/2026.",
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "A linha duplicada que congelou tudo",
            conteudo:
              "Três associações (KM PV, LEGADO, VIDE) tinham DUAS linhas 'API cobrança (histórico)', uma " +
              "ativa e uma inativa. A função selecionava sem filtrar por ativo, pegava a inativa e o " +
              "'UPDATE ... SET ativo=true' seguinte colidia com o índice único parcial — o backfill morria " +
              "com 'duplicate key' e o histórico congelava sem deixar rastro. Corrigido com " +
              "ORDER BY ativo DESC. Se um backfill parar sem motivo aparente, verifique duplicidade nessa " +
              "tabela antes de qualquer outra coisa.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Associação pesada não pode bloquear a fila",
            conteudo:
              "A KM PV estoura o tempo com frequência (é a de maior volume). O processador marca a " +
              "associação como atendida ANTES de executar, então uma que falhe vai para o fim da fila e " +
              "as demais continuam avançando, em vez de ficarem presas atrás dela para sempre.",
          },
        ],
      },
    ],
  },

  /* ================================================================== */
  {
    id: "regras",
    titulo: "Regras de Negócio",
    icone: "calculator",
    secoes: [
      {
        id: "criterio-sga",
        titulo: "Critério SGA × Cobrança total",
        resumo: "A regra que faz os números baterem com o relatório da associação",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "O painel de cobrança tem dois critérios, e o seletor governa a página inteira — cards e " +
              "gráficos vêm da mesma agregação, para que não exista número divergente na mesma tela.",
          },
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Critério", "Definição", "Quando usar"],
              linhas: [
                [
                  "Critério SGA (padrão)",
                  "Conta apenas boletos de veículos que NÃO tinham boleto em aberto nos 6 meses anteriores",
                  "Conferência com a associação — reproduz o Relatório de Boletos do SGA",
                ],
                [
                  "Cobrança total",
                  "Todos os boletos do mês, sem filtro",
                  "Operação e cobrança — mostra a carteira inteira",
                ],
              ],
            },
          },
          {
            tipo: "texto",
            titulo: "Como a regra foi descoberta",
            conteudo:
              "O filtro do SGA se chama 'Boletos Anteriores: Não possui' e fica na tela legada " +
              "(Relatorio > de Boletos), não na versão nova. A regra foi derivada cruzando o export do " +
              "relatório contra a nossa base, boleto a boleto, e validada em três meses independentes.",
          },
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Mês", "Em aberto (nosso)", "Em aberto (SGA)"],
              linhas: [
                ["Maio/2026", "163", "163"],
                ["Junho/2026", "186", "184"],
                ["Julho/2026", "1.521", "1.530"],
              ],
            },
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Lição: validar em mês fechado não basta",
            conteudo:
              "A primeira regra deduzida foi 'boleto com vencimento prorrogado'. Batia em maio e junho " +
              "com 99% de precisão nos dois eixos, e foi dada como validada. Julho derrubou: com 1.423 " +
              "boletos ainda a vencer, ela devolvia 160 onde o SGA mostrava 1.530. Em mês fechado quase " +
              "todo boleto em aberto é um renegociado, então prorrogação virou marcador acidental. " +
              "Qualquer regra de cobrança precisa ser testada também no mês corrente.",
          },
          {
            tipo: "texto",
            titulo: "Retrovisão de 6 meses",
            conteudo:
              "Boleto em aberto mais antigo que 6 meses já foi baixado, cancelado ou virou acordo no SGA, " +
              "e deixa de contar como débito anterior. Sem esse corte, veículos que o SGA considera em dia " +
              "eram excluídos: junho dava 4.652 pagos contra 4.675; com o corte, 4.670.",
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "O resumo do WhatsApp usa o mesmo critério",
            conteudo:
              "Por um período o resumo enviado por WhatsApp mostrava 6,00% de inadimplência enquanto o " +
              "painel mostrava 3,65% para o mesmo julho. Não era dado velho: eram duas funções diferentes " +
              "— calcular_resumo_cobranca contava tudo cru (289 em aberto) e o painel aplicava o Critério " +
              "SGA (173). Hoje o resumo e o PDF usam exatamente a mesma regra e o mesmo dedup do painel. " +
              "Qualquer novo relatório deve ler dessas funções, nunca refazer a conta.",
          },
        ],
      },
      {
        id: "metricas",
        titulo: "Definição das métricas",
        resumo: "O que cada número significa e em que unidade",
        blocos: [
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Unidade importa",
            conteudo:
              "Em Aberto conta BOLETOS. Inadimplentes e Placas Ativas contam PLACAS. Os valores ficam " +
              "próximos e a diferença troca de sinal (jun/26: 187 boletos e 189 placas; jul/26: 1.538 e " +
              "1.536), o que parece divergência e não é. Cada card exibe sua unidade.",
          },
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Métrica", "Unidade", "Definição"],
              linhas: [
                ["Boletos Emitidos", "boletos", "Pagos + em aberto no critério ativo, excluindo cancelados"],
                ["Boletos Pagos", "boletos", "Situação BAIXADO"],
                ["Em Aberto", "boletos", "Situação ABERTO, vencido ou não — definição do SGA"],
                ["Vencidos", "boletos", "Em aberto com vencimento já passado — métrica de cobrança"],
                ["Inadimplentes", "placas", "Placas distintas com boleto VENCIDO e não pago (ver alerta abaixo)"],
                ["Inadimplência", "%", "Em aberto ÷ emitidos"],
                ["Placas Ativas", "placas", "Veículos ativos, incluindo 0km sem placa"],
                ["Cadastros do mês", "veículos", "Contratos com data de contrato dentro do mês"],
                ["0km / sem placa", "veículos", "Protegidos ainda não emplacados — contam no total"],
              ],
            },
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Inadimplentes exige vencimento passado",
            conteudo:
              "A regra contava placas com boleto em ABERTO, sem exigir que tivesse vencido. Em mês " +
              "fechado dá no mesmo (tudo já venceu) e por isso passou validado contra o SGA em junho. No " +
              "mês corrente vira absurdo: em 04/08 o painel mostrou 4.412 inadimplentes de 4.794 placas, " +
              "porque quase nenhum boleto de agosto tinha vencido. Hoje a regra exige vencimento < hoje, " +
              "e agosto passou a mostrar 0 no início do mês, subindo conforme os vencimentos passam.",
          },
          {
            tipo: "texto",
            titulo: "Por que Vencidos existe",
            conteudo:
              "Inadimplentes segue a definição do SGA e inclui boleto que ainda não venceu. Em mês " +
              "fechado tanto faz, mas no mês corrente engana: em 19/07 havia 1.538 boletos em aberto e " +
              "1.423 sequer venciam — o painel diria 1.536 inadimplentes quando os reais eram 158. " +
              "Vencidos responde à pergunta operacional sem corromper a métrica de conferência.",
          },
          {
            tipo: "texto",
            titulo: "Identidade do veículo",
            conteudo:
              "Placa OU chassi. Veículo 0km entra na base antes do emplacamento, só com chassi — se a " +
              "contagem usar apenas placa, ele desaparece do total. VALECAR tem 38 nessa situação, D3 tem 279. " +
              "Cuidado no diagnóstico: essa diferença (4.804 veículos contra 4.766 placas) PARECE duplicação " +
              "e não é. Duplicação real existia à parte, na paginação da API, afetando KM PV e EXCLUSIVE " +
              "com 10.000 linhas para ~5.000 veículos.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Entradas não são saldo",
            conteudo:
              "Cadastros do mês conta ENTRADAS; Placas Ativas é SALDO. Agosto/2026 da VALECAR teve 11 " +
              "cadastros e o total subiu só 10 — a diferença é 1 saída no período, não erro. O PID grava " +
              "as duas pontas (cadastros_realizados e cancelamentos) mais saldo_placas e churn, derivados " +
              "por derivar_movimentacao_base.",
          },
        ],
      },
      {
        id: "duplicidade-boletos",
        titulo: "Boletos duplicados (2ª via)",
        resumo: "A mesma cobrança emitida duas vezes",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "Acontece de a mesma cobrança (mesma placa, mesmo vencimento, mesmo valor) existir duas " +
              "vezes com nosso_numero diferente — 2ª via emitida sem cancelar a anterior. Como o dedup " +
              "usa nosso_numero, as duas passam e o mês fica inflado.",
          },
          {
            tipo: "texto",
            titulo: "Tamanho do problema",
            conteudo:
              "Agosto/2026 da VALECAR: 6.767 boletos contados para ~4.579 cobranças reais. Julho, mês " +
              "fechado, tinha só 10 duplicatas ainda em aberto — a maioria já havia sido paga em uma das " +
              "vias. O painel exibe um aviso recolhido com a contagem, e conta apenas as vias EM ABERTO, " +
              "que são as que afetam a inadimplência.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Caso que revela o impacto",
            conteudo:
              "Placa ADK9100, vencimento 20/08, R$ 155,11: uma via BAIXADA e a gêmea ABERTA. O associado " +
              "pagou, mas a 2ª via em aberto o mantém na lista de inadimplentes. É por isso que a " +
              "detecção agrupa por dedup_key e considera a cobrança paga se QUALQUER via foi baixada.",
          },
        ],
      },
      {
        id: "placas-historico",
        titulo: "Placas ativas em meses passados",
        resumo: "Por que não dá para reconstruir, e o que fazemos",
        blocos: [
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Reconstrução histórica é impossível",
            conteudo:
              "A base guarda apenas a foto de hoje. Reconstruir um mês passado por data de adesão perde " +
              "quem saiu depois: junho dava 4.648 contra 4.757 do SGA, e a diferença eram exatamente os " +
              "109 veículos cancelados desde então. Completar por boleto também não serve — 590 placas " +
              "tiveram boleto em junho e já não estão na base, o que levaria a 5.238.",
          },
          {
            tipo: "lista",
            titulo: "Ordem de preferência da fonte",
            conteudo: [
              "Valor de referência do próprio SGA, quando registrado em placas_ativas_referencia",
              "Agregação do Estudo de Base do mês (pid_estudo_base) — mesma fonte da tela de Estudo de Base, já inclui os 0km",
              "Snapshot diário (veiculo_snapshot_diario) — conta só placas distintas, então ignora os 0km",
              "Reconstrução pela base atual — subestima, usar só como último recurso",
            ],
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Por que o Estudo de Base vem antes do snapshot",
            conteudo:
              "O snapshot conta placas distintas e, por definição, deixa de fora o veículo 0km sem placa. " +
              "Isso fazia Indicadores mostrar 4.794 e Estudo de Base 4.804 no mesmo mês — mesma pergunta, " +
              "duas respostas. Hoje o PID lê a agregação do Estudo de Base primeiro, e as duas telas dizem " +
              "o mesmo número.",
          },
        ],
      },
    ],
  },

  /* ================================================================== */
  {
    id: "dados",
    titulo: "Modelo de Dados",
    icone: "database",
    secoes: [
      {
        id: "tabelas",
        titulo: "Tabelas principais",
        resumo: "Onde cada coisa mora",
        blocos: [
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Tabela", "Conteúdo", "Chave natural"],
              linhas: [
                ["cobranca_boletos", "Boletos importados", "dados_extras->>'nosso_numero'"],
                ["estudo_base_registros", "Veículos da base ativa", "placa ou chassi"],
                ["cadastro_registros", "Cadastro de associados/veículos", "placa ou chassi"],
                ["sga_eventos", "Eventos e sinistros", "protocolo"],
                ["mgf_dados", "Lançamentos financeiros MGF", "código do lançamento"],
                ["pid_operacional", "Indicadores mensais consolidados", "corretora + ano + mês"],
                ["pid_estudo_base", "Agregação mensal da base de veículos", "corretora + data_referencia"],
                ["veiculo_snapshot_diario", "Conjunto de veículos por dia", "corretora + data + placa"],
                ["placas_ativas_referencia", "Valor oficial do SGA por mês", "corretora + ano + mês"],
                ["integracao_sync_log", "Log de tentativas de importação", "corretora + módulo + data"],
              ],
            },
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Nunca deduplique por dedup_key",
            conteudo:
              "A coluna dedup_key de cobranca_boletos tem colisão. A agregação do dashboard usava ela e " +
              "descartava 192 boletos pagos por mês — devolvia 4.498 quando a tabela e o SGA têm 4.690. " +
              "A chave natural do boleto é o nosso_numero, que é único.",
          },
          {
            tipo: "alerta",
            nivel: "info",
            titulo: "…mas a colisão do dedup_key tem uso",
            conteudo:
              "A 'colisão' não é aleatória: dedup_key agrupa placa + vencimento + valor, ou seja, junta " +
              "exatamente as 2ª vias da mesma cobrança. Serve para DETECTAR duplicidade (é o que a " +
              "detectar_boletos_duplicados faz), nunca para contar. Contar por nosso_numero, investigar " +
              "por dedup_key.",
          },
        ],
      },
      {
        id: "qualidade",
        titulo: "Qualidade de dados",
        resumo: "Sujeira conhecida e como é tratada",
        blocos: [
          {
            tipo: "lista",
            titulo: "Problemas conhecidos na origem",
            conteudo: [
              "Vencimento digitado errado: existem boletos com data em 2032, 2042, 2055. Cada um criava um mês inteiro no PID e os gráficos plotavam Abr/42, Mai/55. Filtrado para a janela de 2015 até 18 meses à frente.",
              "Veículos sem placa: 0km antes do emplacamento. Identificados por chassi e contados no total.",
              "Regional e cooperativa como objeto JSON em vez de string.",
              "Registros repetidos entre páginas da API.",
              "Mesma cobrança com dois nosso_numero (2ª via não cancelada).",
              "Linha de importação duplicada (uma ativa e uma inativa) travando o backfill.",
            ],
          },
        ],
      },
    ],
  },

  /* ================================================================== */
  {
    id: "operacao",
    titulo: "Operação",
    icone: "workflow",
    secoes: [
      {
        id: "fonte-indicadores",
        titulo: "Quem escreve o PID",
        resumo: "A função canônica e as derivadas",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "derivar_indicadores é a função canônica do pid_operacional: roda de minuto em minuto e " +
              "sobrescreve placas_ativas, inadimplentes, boletos, faturamento, recebido, eventos e " +
              "sinistralidade. Qualquer correção precisa ser feita NELA — valor gravado por fora é " +
              "apagado no minuto seguinte.",
          },
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Função", "O que grava", "Frequência"],
              linhas: [
                ["derivar_indicadores", "Núcleo do PID (placas, boletos, faturamento, inadimplentes)", "a cada minuto"],
                ["derivar_movimentacao_base", "Saldo, cancelamentos, churn, associados, % de crescimento", "de hora em hora"],
                ["agregar_estudo_base", "pid_estudo_base (veículos por categoria)", "diária, 07h30"],
                ["processar_backfill_cobranca", "Histórico de boletos, uma associação por vez", "a cada 2 minutos"],
              ],
            },
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Escreveu fora da canônica? Vai sumir",
            conteudo:
              "Corrigimos inadimplentes direto na tabela e o número voltou ao errado em minutos, porque a " +
              "derivar_indicadores rodou de novo. Só depois de corrigir a própria função o valor passou a " +
              "se sustentar. A derivar_movimentacao_base sobrevive porque escreve colunas que a canônica " +
              "não toca — se um dia a canônica passar a gravá-las, uma vai apagar a outra.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Linha criada por backfill nasce incompleta",
            conteudo:
              "backfill_pid_faturamento_worker INSERE em pid_operacional preenchendo só faturamento e " +
              "recebido — todas as outras colunas ficam no default 0. Foi assim que julho e agosto " +
              "nasceram com inadimplentes zerado, sem nenhum erro aparente. Ao criar linha no PID, " +
              "preencha ou deixe NULL, nunca 0: zero é um valor, e ninguém desconfia dele.",
          },
        ],
      },
      {
        id: "monitoramento",
        titulo: "Falhas visíveis",
        resumo: "Log de integração, retentativa e aviso na tela",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "integracao_sync_log registra toda tentativa real de importação — sucesso e falha, com a " +
              "mensagem devolvida pela API, status HTTP e endpoint. Tentativas puladas (fora de horário, " +
              "dedup) não entram, para o log conter só o que se investiga.",
          },
          {
            tipo: "lista",
            titulo: "Camadas de proteção",
            conteudo: [
              "Retentativa automática: um gatilho agenda nova tentativa em 20, 40, 60 minutos (até 5) sempre que uma execução falha. Antes o erro era gravado sem proxima_tentativa_at e o mecanismo de retry, que já existia, nunca era acionado — uma indisponibilidade de segundos parava a importação até o dia seguinte.",
              "Aviso na tela: o painel de cobrança mostra um card quando a base ou a cobrança ficam 2+ dias sem dado novo (vermelho a partir de 3), com a mensagem do último erro.",
              "Aba Importação SGA: acompanhamento do backfill por associação, com percentual e data alcançada.",
            ],
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Falha silenciosa é o pior modo de falha",
            conteudo:
              "O módulo base falhava e não gravava erro em lugar nenhum: cron verde, tela com número " +
              "velho, ninguém sabendo. Uma associação passou dias assim. Toda integração nova precisa " +
              "responder a três perguntas: onde fica o log, quem tenta de novo, e como a tela avisa.",
          },
        ],
      },
      {
        id: "cache",
        titulo: "Cache do dashboard",
        resumo: "Como funciona e por que a chave inclui a função",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "get_dashboard_cobranca_cached mantém cache de 20 minutos por combinação de importações, " +
              "filtros e critério. A chave inclui o hash da própria função de cálculo.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Por que o hash da função entra na chave",
            conteudo:
              "Sem isso, alterar o cálculo não invalida o cache: o payload antigo continua válido pela " +
              "TTL e a tela mostra o formato velho. Aconteceu com o card Vencidos, que aparecia zerado " +
              "enquanto a função já devolvia 160. Toda correção levaria até 20 minutos para aparecer, de " +
              "forma inconsistente entre usuários.",
          },
        ],
      },
      {
        id: "carimbo",
        titulo: "Carimbo de atualização",
        resumo: "Por que toda tela mostra data e hora do dado",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "Todas as telas exibem 'dados de DD/MM, HH:MM'. Os números do sistema e do SGA nunca vão " +
              "coincidir exatamente: nossa foto é de um horário, o relatório da associação é de outro, e " +
              "no intervalo houve pagamento e prorrogação. Isso não é defeito, é natureza. Mostrar o " +
              "carimbo transforma 'não bate' em 'claro, são momentos diferentes'.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Leia updated_at, nunca created_at",
            conteudo:
              "A importação é reutilizada a cada rodada: created_at é a data em que ela nasceu, podendo " +
              "ter dias. Usar created_at fazia a tela dizer 'atualizado há 14h' com dado atualizado de manhã. " +
              "O mesmo vale para diagnóstico: a importação 'API cobrança (recente)' tem created_at de " +
              "10/07, o que sugere dado parado — mas os boletos dentro dela são recriados diariamente.",
          },
        ],
      },
      {
        id: "mes-parcial",
        titulo: "Mês corrente",
        resumo: "Como o mês em curso é tratado",
        blocos: [
          {
            tipo: "lista",
            conteudo: [
              "Meses futuros não aparecem: existem boletos emitidos com vencimento à frente, mas indicador de mês que não aconteceu não significa nada.",
              "O mês corrente é rotulado como '(parcial)' no eixo e avisado no subtítulo do gráfico.",
              "Sem isso, o mês em curso é comparado de igual para igual com o anterior fechado e parece colapso — em 19/07 apareciam 160 pagos contra 4.670 de junho inteiro.",
              "Todo gráfico deve respeitar o seletor 'Gráficos' (chartRange). O de Entrada vs Perdas percorria o histórico inteiro desde 2016 e ignorava a escolha.",
            ],
          },
        ],
      },
    ],
  },

  /* ================================================================== */
  {
    id: "design-system",
    titulo: "Design System",
    icone: "layers",
    secoes: [
      {
        id: "fundamentos",
        titulo: "Fundamentos",
        resumo: "Cor, tipografia e forma — sempre por token",
        blocos: [
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Nunca escreva cor fixa",
            conteudo:
              "Use os tokens do tema (text-primary, bg-card, border-border, text-muted-foreground). Cor " +
              "fixa quebra o modo escuro e o tema do portal, que troca as variáveis CSS. Já aconteceu de " +
              "um roxo ser 'adivinhado' como #6D5BD0 quando o token real é --primary: 247 51% 35% — perto " +
              "o suficiente para passar despercebido e errado o suficiente para destoar ao lado do resto.",
          },
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Elemento", "Padrão", "Observação"],
              linhas: [
                ["Cartão", "rounded-2xl border-border/40 bg-card", "rounded-xl nos gráficos"],
                ["Título de card", "text-sm font-semibold", "Sem heading maior dentro de card"],
                ["Rótulo auxiliar", "text-[10px] / text-[11px] text-muted-foreground", "Unidade, legenda, ref."],
                ["Número de destaque", "text-lg a text-2xl font-bold tabular-nums", "tabular-nums evita dança de dígitos"],
                ["Acento do portal", "#FF6B1A (laranja da marca)", "Só no item ativo da barra flutuante"],
                ["Positivo / negativo", "emerald-600 / red-600", "amber-600 para atenção"],
              ],
            },
          },
          {
            tipo: "texto",
            titulo: "Paleta dos gráficos",
            conteudo:
              "Azul #2563eb (principal/faturamento), verde #16a34a (pago/positivo), vermelho #dc2626 " +
              "(aberto/perda), laranja #f97316 (inadimplente), âmbar #f59e0b (alerta), roxo #8b5cf6 " +
              "(secundário), ciano #0ea5e9. A mesma grandeza deve manter a mesma cor em todas as telas: " +
              "'recebido' é sempre verde, 'em aberto' é sempre vermelho.",
          },
        ],
      },
      {
        id: "componentes",
        titulo: "Componentes padrão",
        resumo: "Use o que existe antes de criar outro",
        blocos: [
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Componente", "Onde", "Para quê"],
              linhas: [
                ["KpiCard", "PIDDashboard", "Número grande + variação + unidade"],
                ["ChartCard", "PIDDashboard", "Moldura de gráfico com ponto colorido e subtítulo"],
                ["SingleSeriesChart / MultiSeriesChart", "PIDDashboard", "Gráfico padronizado, com corte de zeros à esquerda"],
                ["VariationIndicator", "PIDDashboard", "Seta + variação vs mês anterior"],
                ["HelpTip", "Cobrança e Base", "Ícone 'i' com explicação do cálculo"],
                ["BaseAssociacaoCard", "BILayout e PortalLayout", "Base da associação acima dos filtros"],
                ["shadcn/ui", "Global", "Base de todos os primitivos"],
              ],
            },
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Todo número precisa explicar-se",
            conteudo:
              "Card com valor sem contexto gera dúvida recorrente — e a dúvida chega como 'esse número " +
              "está errado'. Todo indicador não óbvio leva um HelpTip dizendo de onde vem e como é " +
              "calculado, e todo card com unidade ambígua exibe a unidade. Isso é requisito, não enfeite.",
          },
        ],
      },
      {
        id: "layout",
        titulo: "Layout e responsividade",
        resumo: "Mobile primeiro, sem estourar largura",
        blocos: [
          {
            tipo: "lista",
            conteudo: [
              "No mobile, blocos de números viram grade (grid-cols-2 / grid-cols-3) e os ícones somem (hidden sm:flex); no desktop viram linha. Empilhar tudo em coluna deixa o card altíssimo.",
              "Use min-w-0 e truncate nos textos dentro de flex — sem isso o conteúdo empurra o container e cria rolagem horizontal.",
              "Cuidado com container mx-auto: ele limita a largura máxima e centraliza. Se o conteúdo da página não usa container, o card fica visivelmente mais estreito que o resto. Foi o que aconteceu com o card Base no portal.",
              "Safe area do iOS entra no offset (bottom: calc(... + env(safe-area-inset-bottom))), nunca como padding interno — como padding, a barra flutuante do portal ficava inchada.",
              "Aviso e alerta que podem aparecer sempre devem ser colapsáveis: o card de boletos duplicados mostra só ícone e quantidade, e abre o detalhe sob clique.",
            ],
          },
        ],
      },
      {
        id: "conteudo",
        titulo: "Texto e tom",
        resumo: "Como escrever na interface",
        blocos: [
          {
            tipo: "lista",
            conteudo: [
              "Português claro, sem jargão técnico na tela do usuário: 'em aberto' e não 'status ABERTO'.",
              "Rótulo diz a unidade quando houver risco de confusão (boletos × placas × veículos).",
              "Data sempre DD/MM/AAAA; número no formato pt-BR; percentual com duas casas.",
              "Mês em curso é rotulado '(parcial)'. Nunca deixe o usuário comparar meio mês com mês inteiro sem aviso.",
              "Mensagem de erro diz o que aconteceu e o que fazer — 'API MGF indisponível; nada foi alterado' é melhor que 'erro ao importar'.",
            ],
          },
        ],
      },
    ],
  },

  /* ================================================================== */
  {
    id: "interface",
    titulo: "Menu e Módulos",
    icone: "workflow",
    secoes: [
      {
        id: "estrutura-menu",
        titulo: "Estrutura do menu",
        resumo: "Sete grupos organizados por objetivo de uso",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "O menu era dividido em três grupos e o de Ferramentas concentrava 16 itens — lista longa " +
              "demais para encontrar qualquer coisa. Hoje são sete grupos, organizados pelo que a pessoa " +
              "está tentando fazer, e não por natureza técnica. Cada grupo abre e fecha, com a preferência " +
              "guardada no navegador.",
          },
          {
            tipo: "tabela",
            conteudo: {
              cabecalho: ["Grupo", "Itens"],
              linhas: [
                ["Início", "Painel"],
                ["Relacionamento", "Atendimentos, Central de Atendimento, Mensagens, Uon1 Talk, Ouvidoria, Comunicados"],
                ["Inteligência", "BI Indicadores, SGA Associados"],
                ["Operação", "Vistorias, Financeiro, Débitos Veiculares, Formulários"],
                ["Documentos", "Uon1 Sign, Documentos, Biblioteca, Termos de Aceite"],
                ["Cadastros", "Associações, Contatos"],
                ["Interno", "Gestão, PPR, Agenda"],
              ],
            },
          },
          {
            tipo: "lista",
            titulo: "Detalhes de comportamento",
            conteudo: [
              "O grupo da rota atual abre sozinho, desde que a sidebar esteja expandida: sem isso, navegar para uma tela cujo grupo está recolhido faz a pessoa perder a referência de onde está. Recolhida, esse auto-abrir é suprimido — não apareceria na tela e ainda deixaria o grupo aberto esperando a próxima expansão.",
              "Recolher a sidebar fecha todos os grupos. Ao expandir de novo ela começa limpa e a pessoa escolhe o grupo, em vez de reabrir com o estado de minutos atrás, que raramente é o que se quer no uso seguinte.",
              "Com a sidebar recolhida aparecem apenas os ícones dos grupos, não a lista inteira de itens. Clicar num ícone expande a sidebar já com aquele grupo aberto — expandir sem abrir o grupo deixaria a pessoa sem retorno visível ao clique.",
              "Ao expandir por clique num ícone, o título daquele grupo pisca em destaque por ~2s. A sidebar inteira aparece de uma vez e o grupo pedido se perderia entre os outros; o destaque diz qual foi, e some sozinho para não virar estado permanente competindo com a marcação da tela ativa.",
              "Com a sidebar recolhida não há linhas separadoras entre os grupos, só espaçamento: cada grupo já é um ícone isolado, e a linha picotava a coluna. Expandida as linhas continuam, porque ali separam blocos de texto.",
              "O ícone do grupo que contém a tela atual fica destacado, para orientar mesmo com a sidebar estreita.",
              "Os ícones de grupo não repetem nenhum ícone de item. Grupos usam formas abstratas (aperto de mão, radar, chave, pasta, banco de dados, escudo); itens usam objetos concretos. Repetir o desenho faria o usuário achar que clicou na tela quando clicou no grupo. Exceção: Início repete o ícone do Painel de propósito — o grupo tem um item só, então grupo e tela são a mesma coisa. A checagem em DEV ignora grupos de item único.",
              "Badges de notificação sobem para o grupo: o cabeçalho de um grupo fechado, e o ícone de grupo com a sidebar recolhida, mostram a soma dos badges dos itens. Sem isso uma mensagem nova ficaria invisível enquanto o grupo estivesse fechado. Com o grupo aberto o total some, porque os badges dos itens já estão à vista e repetir duplicaria a informação.",
              "A soma considera apenas itens que o usuário pode ver — módulo sem permissão ou desabilitado não entra na conta, senão o badge apontaria para uma tela inalcançável.",
              "VALIDAÇÃO — o tsconfig.json da raiz tem \"files\": [] e usa project references. Isso faz `tsc --noEmit` sair com código 0 sem checar arquivo nenhum: ele não segue as referências. E `vite build` usa esbuild, que remove os tipos sem verificá-los. Ou seja, os dois comandos passam com erro de tipo no código. Use `npm run typecheck` (`tsc -b`), que segue as referências e checa de verdade. Um `Compass` indefinido chegou a produção e deu tela branca por causa disso.",
              "Grupo recolhido que contém a tela ativa exibe um ponto colorido.",
              "Documentos, Cadastros e Interno começam recolhidos por serem menos usados no dia a dia.",
              "Ajuda e Configurações ficam fixos no rodapé, fora dos grupos.",
            ],
          },
        ],
      },
      {
        id: "registro-modulos",
        titulo: "Registro de módulos",
        resumo: "Como adicionar um módulo novo sem quebrar a gestão",
        blocos: [
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Módulo novo precisa entrar em SYSTEM_MODULES",
            conteudo:
              "src/config/modulos.ts é o registro canônico: dele saem o menu (AppSidebar) e a tela de " +
              "gestão em Configurações. Item que existe no menu e falta nessa lista aparece normalmente " +
              "para o usuário, mas não pode ser desabilitado — e ninguém percebe, porque a tela de gestão " +
              "simplesmente não o exibe. Aconteceu com Biblioteca. Há um aviso no console em " +
              "desenvolvimento apontando itens órfãos.",
          },
          {
            tipo: "texto",
            titulo: "usuarios e performance",
            conteudo:
              "Ficam fora da gestão de propósito: são chaves de permissão verificadas no código, não itens " +
              "de menu. Desabilitá-las não teria efeito visível.",
          },
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "O bug da inversão, e por que custou tanto para achar",
            conteudo:
              "Por um tempo era impossível desabilitar qualquer módulo: o toast dizia 'desabilitado para " +
              "todos', mas o switch não mudava e o item seguia no menu. A causa era um booleano invertido " +
              "— definirModulo(id, !ativo) quando o correto é definirModulo(id, ativo). Como 'ativo' " +
              "significa 'está habilitado' e o parâmetro se chama 'desabilitar', clicar num módulo " +
              "habilitado executava REABILITAR: um DELETE de linha inexistente, que retornava zero linhas, " +
              "passava na verificação do hook e disparava o toast de sucesso. " +
              "O diagnóstico demorou porque RLS, índice único, permissão do papel e escrita direta pela " +
              "sessão do usuário foram todos testados e estavam corretos. A pista foi o print do toast: " +
              "mensagem de sucesso com efeito nenhum só pode significar que o código executou com êxito a " +
              "operação oposta.",
          },
        ],
      },
    ],
  },

  /* ================================================================== */
  {
    id: "principios",
    titulo: "Princípios",
    icone: "shield",
    secoes: [
      {
        id: "fonte-unica",
        titulo: "Fonte única por número",
        resumo: "O erro que mais se repetiu no sistema",
        blocos: [
          {
            tipo: "alerta",
            nivel: "critico",
            titulo: "Nunca recalcule na tela o que já existe",
            conteudo:
              "Toda vez que duas telas fazem a mesma conta em lugares diferentes, elas divergem — e quem " +
              "descobre é o usuário. Isso apareceu seis vezes: cards de cobrança contra o gráfico por " +
              "dia (187 × 332), inadimplentes do portal contra o PID, placas ativas do card contra o " +
              "gráfico (4.794 × 4.757), Estudo de Base contra Visão Geral (4.804 × 4.794), resumo do " +
              "WhatsApp contra o painel (6,00% × 3,65%) e duas funções concorrentes de inadimplentes " +
              "(245 × 171). Se o número já existe numa função ou tabela, leia de lá. Vale para " +
              "componentes: o carimbo de atualização chegou a ser renderizado em três lugares.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Corrigiu por fora? Apague o atalho",
            conteudo:
              "Paliativo criado para destravar uma investigação vira fonte concorrente se sobreviver. " +
              "Duas funções de inadimplentes conviveram e davam 245 e 171 para o mesmo julho. Ao achar a " +
              "canônica, a paliativa foi removida no mesmo dia — não deixe para depois.",
          },
        ],
      },
      {
        id: "overload",
        titulo: "Parâmetro novo em função SQL",
        resumo: "Armadilha que já derrubou o dashboard",
        blocos: [
          {
            tipo: "alerta",
            nivel: "critico",
            conteudo:
              "Adicionar parâmetro com DEFAULT em função existente cria uma SOBRECARGA nova. As chamadas " +
              "antigas ficam ambíguas e o Postgres devolve 'function is not unique' — o dashboard MGF " +
              "quebrou exatamente assim. Sempre DROP FUNCTION explícito da assinatura antiga, e atualizar " +
              "quem chama na mesma transação.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "O inverso também acontece",
            conteudo:
              "A fila de backfill falhava em segundos com 'Could not find the function ... " +
              "(p_corretora_id, p_modulo)': o chamador usava dois parâmetros e só existia a versão de " +
              "três. Ao mudar assinatura, procure TODOS os chamadores — inclusive edge functions, que o " +
              "banco não valida.",
          },
        ],
      },
      {
        id: "medir",
        titulo: "Medir antes de concluir",
        resumo: "Coincidência convincente não é validação",
        blocos: [
          {
            tipo: "texto",
            conteudo:
              "Várias hipóteses deste sistema pareciam confirmadas e estavam erradas. A regra de " +
              "prorrogação batia em dois meses seguidos nos dois eixos. A explicação de que placas ativas " +
              "eram duplicatas fechava a conta exata (4.685 + 72 = 4.757) e era coincidência — eram " +
              "veículos sem placa. Antes de tratar uma regra como verdadeira: validar em períodos de " +
              "natureza diferente, conferir todas as facetas (contagem e valor, pago e aberto), e " +
              "desconfiar quando o resíduo é proporcional em vez de constante.",
          },
          {
            tipo: "alerta",
            nivel: "atencao",
            titulo: "Descarte hipótese com medição, não com opinião",
            conteudo:
              "Na divergência do resumo de cobrança, a primeira explicação foi 'dado velho'. Parecia " +
              "sólida: a importação tinha created_at de 10/07. Só que os boletos dentro dela eram " +
              "recriados diariamente — bastou olhar o created_at das linhas para derrubar a hipótese. A " +
              "causa real era critério de cálculo. Uma consulta de 30 segundos evitou horas na direção " +
              "errada.",
          },
        ],
      },
      {
        id: "silencio",
        titulo: "Nada pode falhar em silêncio",
        resumo: "O modo de falha mais caro do sistema",
        blocos: [
          {
            tipo: "alerta",
            nivel: "critico",
            conteudo:
              "Todos os problemas mais demorados desta base tinham a mesma assinatura: o sistema dizia " +
              "que estava tudo bem. Cron 'succeeded' sem importar nada; deploy verde com token vencido " +
              "(o script usava '|| echo FALHOU' e engolia o erro); backfill congelado sem log; linha do " +
              "PID criada com zero em vez de nulo; toast de sucesso para operação que não aconteceu. " +
              "Sucesso não pode ser o padrão: só declare êxito quando houver evidência dele — e registre " +
              "a falha onde alguém vá olhar.",
          },
        ],
      },
    ],
  },
];
