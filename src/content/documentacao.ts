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

export const ATUALIZADO_EM = "19/07/2026";

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
              "Quatro schedulers (base, cobrança, MGF, eventos) são acordados de hora em hora pelo cron. " +
              "Cada um verifica se a hora atual está em horarios_sync da associação (padrão 08h e 14h, " +
              "editável na tela Sincronizar) e retorna cedo se não estiver.",
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
                ["Inadimplentes", "placas", "Placas distintas com boleto em aberto no critério do SGA"],
                ["Inadimplência", "%", "Em aberto ÷ emitidos"],
                ["Placas Ativas", "placas", "Veículos ativos, identificados por placa OU chassi"],
              ],
            },
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
              "contagem usar apenas placa, ele desaparece do total. VALECAR tinha 37 nessa situação, D3 tem 279. " +
              "Cuidado no diagnóstico: essa diferença (4.794 linhas contra 4.757 placas) PARECE duplicação " +
              "e não é. Duplicação real existia à parte, na paginação da API, afetando KM PV e EXCLUSIVE " +
              "com 10.000 linhas para ~5.000 veículos.",
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
              "Snapshot diário (veiculo_snapshot_diario), disponível a partir de 19/07/2026",
              "Reconstrução pela base atual — subestima, usar só como último recurso",
            ],
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
                ["veiculo_snapshot_diario", "Conjunto de veículos por dia", "corretora + data + placa"],
                ["placas_ativas_referencia", "Valor oficial do SGA por mês", "corretora + ano + mês"],
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
              "Veículos sem placa: 0km antes do emplacamento. Identificados por chassi.",
              "Regional e cooperativa como objeto JSON em vez de string.",
              "Registros repetidos entre páginas da API.",
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
              "ter dias. Usar created_at fazia a tela dizer 'atualizado há 14h' com dado atualizado de manhã.",
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
              "O grupo da rota atual abre sozinho: sem isso, navegar para uma tela cujo grupo está recolhido faz a pessoa perder a referência de onde está.",
              "Com a sidebar recolhida aparecem apenas os ícones dos grupos, não a lista inteira de itens. Clicar num ícone expande a sidebar já com aquele grupo aberto — expandir sem abrir o grupo deixaria a pessoa sem retorno visível ao clique.",
              "O ícone do grupo que contém a tela atual fica destacado, para orientar mesmo com a sidebar estreita.",
              "Os ícones de grupo não repetem nenhum ícone de item. Grupos usam formas abstratas (aperto de mão, radar, chave, pasta, banco de dados, escudo); itens usam objetos concretos. Repetir o desenho faria o usuário achar que clicou na tela quando clicou no grupo. Exceção: Início repete o ícone do Painel de propósito — o grupo tem um item só, então grupo e tela são a mesma coisa. A checagem em DEV ignora grupos de item único.",
              "Badges de notificação sobem para o grupo: o cabeçalho de um grupo fechado, e o ícone de grupo com a sidebar recolhida, mostram a soma dos badges dos itens. Sem isso uma mensagem nova ficaria invisível enquanto o grupo estivesse fechado. Com o grupo aberto o total some, porque os badges dos itens já estão à vista e repetir duplicaria a informação.",
              "A soma considera apenas itens que o usuário pode ver — módulo sem permissão ou desabilitado não entra na conta, senão o badge apontaria para uma tela inalcançável.",              "Grupo recolhido que contém a tela ativa exibe um ponto colorido.",
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
              "descobre é o usuário. Isso apareceu quatro vezes: cards de cobrança contra o gráfico por " +
              "dia (187 × 332), inadimplentes do portal contra o PID, placas ativas do card contra o " +
              "gráfico (4.794 × 4.757), e Estudo de Base contra Visão Geral. Se o número já existe numa " +
              "função ou tabela, leia de lá. Vale para componentes também: o carimbo de atualização chegou " +
              "a ser renderizado em três lugares e aparecia duplicado na tela do PID.",
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
        ],
      },
    ],
  },
];
