/**
 * Capítulo "Sincronização e Importação" da documentação viva.
 *
 * Separado de documentacao.ts de propósito: este assunto mudou de arquitetura
 * em 13/08/2026 e tende a continuar evoluindo. Mantê-lo em arquivo próprio
 * deixa o diff legível e evita conflito num arquivo de 1.000+ linhas.
 *
 * Regra deste arquivo, herdada de documentacao.ts: registrar o PORQUÊ. Tudo o
 * que está aqui saiu de investigação de número divergente contra o SGA, e o
 * custo de redescobrir é alto.
 */

import type { DocCapitulo } from "./documentacao";

export const CAPITULO_SINCRONIZACAO: DocCapitulo = {
  id: "sincronizacao",
  titulo: "Sincronização e Importação",
  icone: "workflow",
  secoes: [
    /* ------------------------------------------------------------------ */
    {
      id: "paginacao-hinova",
      titulo: "Paginação da API da Hinova",
      resumo: "Os nomes corretos dos parâmetros — e por que parecia haver um bug",
      blocos: [
        {
          tipo: "alerta",
          nivel: "critico",
          titulo: "Não existe bug de paginação na Hinova",
          conteudo:
            "Chegou-se a concluir que /listar/veiculo era incapaz de paginar, porque tentativas com " +
            "pagina, page, numero_pagina, pagina_corrente, offset e query-string devolviam sempre a " +
            "mesma primeira página. Nenhum desses nomes existe nessa API. Antes de abrir chamado, " +
            "confira os nomes abaixo.",
        },
        {
          tipo: "texto",
          conteudo:
            "A paginação é por deslocamento (offset), não por número de página, e os valores devem ir " +
            "como STRING no corpo JSON. Enviar como número faz o parâmetro ser ignorado silenciosamente: " +
            "a API responde 200, devolve a primeira página e não sinaliza erro algum.",
        },
        {
          tipo: "codigo",
          conteudo:
            'POST /listar/veiculo\n' +
            '{\n' +
            '  "codigo_situacao":        "1",     // obrigatório (ou faixa de DATA CADASTRO / DATA CONTRATO)\n' +
            '  "quantidade_por_pagina":  "2000",  // string, não número\n' +
            '  "inicio_paginacao":       "4000"   // offset em registros, não índice de página\n' +
            '}',
        },
        {
          tipo: "tabela",
          titulo: "Comprovação feita na PROTEV (20.706 veículos)",
          conteudo: {
            cabecalho: ["inicio_paginacao", "Registros", "1ª placa"],
            linhas: [
              ["0", "5.000", "HNE5366"],
              ["5000", "5.000", "HKK8H41"],
              ["10000", "5.000", "HCQ9770"],
              ["20000", "706", "QXK4A63"],
            ],
          },
        },
        {
          tipo: "lista",
          titulo: "Outros comportamentos confirmados no ambiente",
          conteudo: [
            "codigo_situacao é honrado de verdade: situação 1 devolve 20.703 e situação 2 devolve 36.633, com primeira placa diferente.",
            "Omitir codigo_situacao devolve HTTP 406 com a mensagem 'Necessário enviar o CODIGO SITUACAO, conjunto de DATA CADASTRO ou DATA CONTRATO'. Esse 406 é um detector barato: serve para testar se um nome de campo é reconhecido, sem baixar a resposta inteira.",
            "Body vazio devolve HTTP 400, mensagem diferente do 406 — dá para distinguir 'campo não reconhecido' de 'body ausente'.",
            "Os nomes dos campos de data de cadastro/contrato continuam desconhecidos: 18 pares de candidatos foram testados e todos deram 406. Como a paginação por offset resolve, não foi necessário descobri-los.",
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: "importacao-base-fatiada",
      titulo: "Importação da base em fatias",
      resumo: "Por que a importação foi quebrada em etapas retomáveis",
      blocos: [
        {
          tipo: "texto",
          conteudo:
            "A importação da base rodava inteira dentro de uma transação só: autenticação, tabelas de " +
            "apoio, associados e todas as páginas de veículos. Existe um teto de aproximadamente 120 " +
            "segundos para a chamada síncrona (extensions.http dentro da transação) — não é o " +
            "statement_timeout declarado na função, que é maior, e não foi localizado em configuração " +
            "de role nem de banco. Bases grandes simplesmente não cabiam.",
        },
        {
          tipo: "alerta",
          nivel: "critico",
          titulo: "O que tornava isso grave: falha silenciosa",
          conteudo:
            "Quando uma página falhava, o laço fazia EXIT sem erro e gravava o que já tinha baixado como " +
            "se fosse a base completa. O painel exibia número truncado com cara de número correto. " +
            "O sintoma que denuncia é o total ser múltiplo exato do tamanho de página.",
        },
        {
          tipo: "tabela",
          titulo: "Bases truncadas encontradas em 12/08/2026",
          conteudo: {
            cabecalho: ["Associação", "Gravado", "Real", "Faltava"],
            linhas: [
              ["UNIÃO", "5.000", "22.470", "17.470"],
              ["PROTEV", "5.000", "20.712", "15.712"],
              ["KM PV", "5.000", "5.634", "634"],
              ["EXCLUSIVE", "10.000", "5.029", "— (havia repetição)"],
            ],
          },
        },
        {
          tipo: "texto",
          titulo: "Como funciona hoje",
          conteudo:
            "A coleta virou um job retomável, no mesmo modelo do backfill de cobrança. Cada execução " +
            "avança o quanto couber num orçamento de 40 segundos e grava o cursor; o worker continua " +
            "de onde parou no minuto seguinte. Associações pequenas terminam numa única chamada, " +
            "exatamente como antes.",
        },
        {
          tipo: "tabela",
          titulo: "Peças envolvidas",
          conteudo: {
            cabecalho: ["Objeto", "Papel"],
            linhas: [
              ["base_api_jobs", "Fase, cursor de offset, total esperado e contexto (tabelas de apoio e endereços) de cada associação"],
              ["base_api_stg", "Páginas de veículos acumuladas até a coleta fechar"],
              ["importar_base_api(uuid)", "Abre (ou retoma) o job e já adianta o que couber no orçamento"],
              ["processar_base_api(uuid, seg)", "Executa as fases: lookups → associados → veiculos → finalizar"],
              ["processar_base_api_worker()", "Cron de 1 em 1 minuto; continua um job por vez, serializado por advisory lock"],
            ],
          },
        },
        {
          tipo: "lista",
          titulo: "Proteções contra repetir o erro",
          conteudo: [
            "A base ativa só é substituída no fim, depois de conferir o total coletado contra o total_veiculos que a própria API declara. Se vier menos, a troca é abortada e a base anterior é preservada, com registro em integracao_sync_log.",
            "Página que falha tem 3 tentativas com reautenticação antes de desistir. Desistir nunca significa gravar dado parcial.",
            "Lock de transação por associação (pg_try_advisory_xact_lock), porque a fila diária e o worker rodam ambos a cada minuto e poderiam coletar a mesma base em paralelo, duplicando linhas na staging.",
            "O enriquecimento de endereço (/listar/associado) é isolado: se falhar, a base entra sem endereço em vez de derrubar a importação inteira.",
            "derivar_indicadores e derivar_movimentacao_base são chamados dentro da finalização. Antes quem disparava isso era _processar_fila_sync, logo após a importação síncrona; com a finalização acontecendo no worker, os indicadores ficariam presos nos números da base antiga.",
            "Gatilho na tabela estudo_base_importacoes recusa qualquer troca por uma contagem abaixo de 70% da anterior, venha de onde vier — protege até contra caminhos de código fora do banco.",
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: "fila-diaria",
      titulo: "A fila que secava",
      resumo: "Classe de falha que já derrubou cobrança e base",
      blocos: [
        {
          tipo: "alerta",
          nivel: "atencao",
          titulo: "Fila que não se reabre é importação que morre em silêncio",
          conteudo:
            "_processar_fila_sync marca a linha como 'concluido' ao fim do ciclo e como 'erro' após 5 " +
            "tentativas. Durante meses nada devolvia essas linhas para 'pendente'. A importação parava " +
            "sem erro visível, e o dado velho continuava sendo exibido como atual.",
        },
        {
          tipo: "tabela",
          titulo: "Duas ocorrências da mesma causa",
          conteudo: {
            cabecalho: ["Módulo", "Efeito observado"],
            linhas: [
              ["cobranca_recente", "ASSPASS 15 dias, PACTUAL 19 e AUTOLIDER 18 sem boleto novo. As demais só pareciam saudáveis porque o backfill histórico ainda estava rodando."],
              ["base", "As 16 associações travadas em 'erro', a maioria desde 18/07, por um bug de chave duplicada em estudo_base_importacoes."],
            ],
          },
        },
        {
          tipo: "texto",
          titulo: "Mecanismo atual",
          conteudo:
            "enfileirar_sync_diario() reabre o ciclo às 06h e às 13h (BRT). Cobrança volta para a fila " +
            "_sync_queue; base tem tabela de job e worker próprios, senão ficaria horas atrás dos ciclos " +
            "de cobrança. Reenfileirar é barato: as rotinas pulam sozinhas quando o dado ainda está " +
            "fresco (o ciclo recente é ignorado se terminou há menos de 6h).",
        },
        {
          tipo: "lista",
          titulo: "Bug de chave duplicada — vale conhecer o padrão",
          conteudo: [
            "estudo_base_importacoes e cadastro_importacoes têm índice único de 'uma importação ativa por corretora'.",
            "A função inseria a nova importação já como ativo=true e só depois desativava a anterior, o que viola o índice.",
            "A ordem correta é desativar primeiro, inserir depois. Ao criar tabela nova de importação com esse índice, verifique a ordem antes de publicar.",
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: "alertas-confiaveis",
      titulo: "Alertas que refletem o estado atual",
      resumo: "Por que o erro exibido precisa ser um erro ainda não superado",
      blocos: [
        {
          tipo: "texto",
          conteudo:
            "status_importacoes_corretora alimenta o cartão 'Importação desatualizada' nos BIs. Ele " +
            "mostrava o último erro registrado, sem verificar se a importação já tinha se recuperado. " +
            "Uma falha transitória de autenticação às 03:00, resolvida às 03:04, seguia acesa o dia " +
            "inteiro — e alerta que grita sem motivo é alerta que se aprende a ignorar.",
        },
        {
          tipo: "lista",
          titulo: "Regras atuais",
          conteudo: [
            "O erro só aparece se nenhum sucesso do mesmo módulo veio depois dele.",
            "O erro só aparece se tiver menos de 24 horas.",
            "Ao se recuperar, a rotina registra um sucesso apenas quando o último registro do módulo era falha — assim o alerta apaga sem poluir o log a cada 2 minutos.",
            "Falha de autenticação na Hinova é transitória e ganhou uma segunda tentativa imediata, em vez de deixar a associação parada até a próxima janela.",
          ],
        },
        {
          tipo: "alerta",
          nivel: "info",
          titulo: "Como investigar uma importação suspeita",
          conteudo:
            "Comece por integracao_sync_log filtrando a associação. Depois confira base_api_jobs (fase, " +
            "coletados contra esperado) e _sync_queue (status e tentativas). Total de base em múltiplo " +
            "exato de 1.000 é sinal de truncamento; fila inteira em 'concluido' ou 'erro' é sinal de " +
            "fila seca.",
        },
      ],
    },
  ],
};
