import {
  LayoutDashboard, ClipboardList, Building2, FileText, Users,
  AlertTriangle, DollarSign, Calendar, FolderOpen, Headset,
  MessageCircle, TrendingUp, MessageSquareWarning, FileSignature,
  Video, Megaphone, Briefcase, Settings, HelpCircle
} from "lucide-react";

export interface HelpImage {
  src: string;
  caption: string;
}

export interface HelpTopic {
  title: string;
  steps: string[];
  tip?: string;
  images?: HelpImage[];
}

export interface HelpModule {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  topics: HelpTopic[];
}

export const HELP_MODULES: HelpModule[] = [
  {
    id: "painel",
    title: "Painel (Dashboard)",
    description: "Visão geral do sistema com indicadores, gráficos e alertas em tempo real.",
    icon: LayoutDashboard,
    color: "text-blue-500",
    topics: [
      {
        title: "Visão geral dos KPIs",
        steps: [
          "Ao acessar o Painel, você verá cards com os principais indicadores: total de atendimentos abertos, sinistros em andamento, mensagens não lidas e compromissos do dia.",
          "Os valores são atualizados automaticamente. Cada card é clicável e leva direto para a área correspondente.",
          "Os gráficos mostram a evolução dos atendimentos ao longo do tempo e a distribuição por status."
        ],
        tip: "Passe o mouse sobre os gráficos para ver valores detalhados de cada período.",
        images: [
          { src: "/help/painel-dashboard.png", caption: "Painel com KPIs, gráficos de evolução e distribuição por status" }
        ]
      },
      {
        title: "Alertas e notificações",
        steps: [
          "No topo do painel aparecem alertas importantes: atendimentos atrasados, prazos vencendo e pendências de aprovação.",
          "Alertas em vermelho são urgentes e precisam de ação imediata.",
          "Clique no alerta para ir direto ao item que precisa de atenção."
        ],
        tip: "Configure seus alertas personalizados em Configurações > Notificações para receber avisos por e-mail."
      },
      {
        title: "Agenda semanal",
        steps: [
          "A seção de agenda mostra os compromissos dos próximos dias.",
          "Reuniões, retornos agendados e prazos aparecem organizados por data.",
          "Clique em qualquer item para abrir os detalhes completos."
        ]
      }
    ]
  },
  {
    id: "atendimentos",
    title: "Atendimentos",
    description: "Gestão completa de atendimentos com Kanban, fluxos personalizáveis e histórico.",
    icon: ClipboardList,
    color: "text-indigo-500",
    topics: [
      {
        title: "Visão Kanban",
        steps: [
          "Os atendimentos são organizados em colunas que representam cada etapa do fluxo (ex: Novo, Em Análise, Aguardando, Concluído).",
          "Arraste os cards entre as colunas para mudar o status de um atendimento.",
          "Use o botão de visualização (ícone de lista) para alternar entre Kanban e Lista."
        ],
        tip: "Você pode personalizar as colunas do Kanban em Configurações > Fluxos para adaptar ao processo da sua associação.",
        images: [
          { src: "/help/kanban-atendimentos.png", caption: "Visão Kanban com colunas de status e cards de atendimento" }
        ]
      },
      {
        title: "Criar novo atendimento",
        steps: [
          "Clique no botão '+ Novo Atendimento' no canto superior.",
          "Preencha o assunto, selecione a associação (corretora), o contato relacionado e a prioridade.",
          "Opcionalmente, adicione observações, anexos e selecione o fluxo de trabalho.",
          "Clique em 'Salvar' para criar. O atendimento aparecerá na primeira coluna do Kanban."
        ]
      },
      {
        title: "Filtros e busca",
        steps: [
          "Use a barra de busca para encontrar atendimentos por número, assunto ou nome do contato.",
          "Aplique filtros por status, prioridade, associação, responsável ou período.",
          "Os filtros podem ser combinados para resultados mais precisos.",
          "Clique em 'Limpar filtros' para voltar à visão completa."
        ],
        tip: "Use o filtro 'Meus atendimentos' para ver apenas os que estão sob sua responsabilidade."
      },
      {
        title: "Histórico e andamentos",
        steps: [
          "Dentro de cada atendimento, a aba 'Andamentos' registra todas as ações realizadas.",
          "Adicione novos andamentos clicando em '+ Andamento' e descrevendo o que foi feito.",
          "O histórico mostra automaticamente mudanças de status, responsável e edições de campos."
        ]
      },
      {
        title: "Anexos",
        steps: [
          "Na aba 'Anexos' do atendimento, clique em 'Anexar arquivo' ou arraste arquivos para a área indicada.",
          "São aceitos documentos (PDF, DOC), imagens (JPG, PNG) e planilhas (XLS, CSV).",
          "Cada anexo registra quem enviou e quando, para rastreabilidade completa."
        ]
      },
      {
        title: "Prazos e SLA",
        steps: [
          "Cada atendimento pode ter uma data de retorno definida.",
          "Quando o prazo está próximo de vencer, o card fica destacado em amarelo. Quando vence, fica em vermelho.",
          "Os prazos podem ser configurados por fluxo em Configurações > Fluxos > Prazos."
        ],
        tip: "Ative as notificações de prazo para receber alertas automáticos antes do vencimento."
      }
    ]
  },
  {
    id: "associacoes",
    title: "Associações",
    description: "Cadastro e gestão das associações (corretoras) vinculadas ao sistema.",
    icon: Building2,
    color: "text-emerald-500",
    topics: [
      {
        title: "Cadastrar nova associação",
        steps: [
          "Clique em '+ Nova Associação' no canto superior da tela.",
          "Preencha os dados: nome, CNPJ, endereço, telefone, e-mail e responsável.",
          "Opcionalmente, adicione o CEP para preenchimento automático do endereço.",
          "Clique em 'Salvar' para concluir o cadastro."
        ]
      },
      {
        title: "Configurar slug (URL personalizada)",
        steps: [
          "Cada associação pode ter um slug único (ex: 'capital-car') usado no portal do parceiro.",
          "Para configurar, abra a associação e clique em 'Configurar Slug'.",
          "O slug é usado na URL do portal: seusite.com/capital-car/login."
        ],
        tip: "Use slugs curtos e sem caracteres especiais para facilitar o acesso dos parceiros."
      },
      {
        title: "Upload em massa",
        steps: [
          "Para cadastrar várias associações de uma vez, clique em 'Importar' no menu superior.",
          "Baixe o modelo de planilha (CSV/Excel), preencha com os dados e faça o upload.",
          "O sistema validará os dados e mostrará eventuais erros antes de confirmar a importação."
        ]
      },
      {
        title: "Parceiros e usuários da associação",
        steps: [
          "Dentro de cada associação, acesse 'Gerenciar Usuários' para criar acessos ao portal do parceiro.",
          "Cada usuário pode ter permissões específicas: acesso ao BI, ouvidoria ou apenas visualização.",
          "O usuário receberá um e-mail com as credenciais de acesso."
        ]
      }
    ]
  },
  {
    id: "termos",
    title: "Termos de Aceite",
    description: "Criação e gestão de termos que os associados precisam aceitar.",
    icon: FileText,
    color: "text-orange-500",
    topics: [
      {
        title: "Criar novo termo",
        steps: [
          "Acesse Termos de Aceite e clique em '+ Novo Termo'.",
          "Dê um título ao termo e escreva o conteúdo completo no editor de texto.",
          "Defina se o termo é obrigatório ou opcional.",
          "Salve e o termo ficará disponível para vinculação em atendimentos e contratos."
        ]
      },
      {
        title: "Gerenciar termos existentes",
        steps: [
          "Na listagem, você pode editar, desativar ou excluir termos.",
          "Termos desativados não aparecem mais para novos aceites, mas o histórico é mantido.",
          "Use a busca para encontrar termos específicos por título ou conteúdo."
        ]
      }
    ]
  },
  {
    id: "contatos",
    title: "Contatos",
    description: "Base de contatos centralizada com informações de associados e terceiros.",
    icon: Users,
    color: "text-cyan-500",
    topics: [
      {
        title: "Cadastrar contato",
        steps: [
          "Clique em '+ Novo Contato' e preencha: nome, e-mail, telefone, WhatsApp e cargo.",
          "Vincule o contato a uma associação existente para organizar melhor.",
          "Adicione observações relevantes no campo de notas."
        ]
      },
      {
        title: "Buscar e filtrar contatos",
        steps: [
          "Use a barra de busca para localizar por nome, e-mail ou telefone.",
          "Filtre por associação para ver apenas os contatos vinculados.",
          "Clique no contato para ver todos os atendimentos relacionados a ele."
        ],
        tip: "Ao criar um atendimento, os contatos já cadastrados aparecem automaticamente para seleção rápida."
      }
    ]
  },
  {
    id: "sinistros",
    title: "Sinistros",
    description: "Gestão completa do ciclo de sinistros: abertura, deliberação, vistoria e acompanhamento.",
    icon: AlertTriangle,
    color: "text-red-500",
    topics: [
      {
        title: "Abertura de sinistro",
        steps: [
          "A partir de um atendimento, clique em 'Abrir Sinistro' para iniciar o processo.",
          "Preencha os dados do veículo, tipo de evento e descrição detalhada.",
          "Anexe fotos, boletim de ocorrência e documentos relevantes.",
          "O sinistro será criado com status 'Aberto' e ficará visível no painel de sinistros."
        ]
      },
      {
        title: "Deliberação (Comitê)",
        steps: [
          "Sinistros que precisam de análise vão para o Comitê de Deliberação.",
          "No comitê, os membros respondem perguntas padronizadas sobre cobertura, valor e procedência.",
          "Após todas as respostas, o sistema gera um parecer com base nas avaliações.",
          "O resultado pode ser: Aprovado, Reprovado ou Pendente de documentação."
        ],
        tip: "As perguntas do comitê podem ser personalizadas em Sinistros > Configurações."
      },
      {
        title: "Vistoria Digital",
        steps: [
          "Crie uma vistoria digital e envie o link ao associado por WhatsApp ou e-mail.",
          "O associado acessa pelo celular, tira fotos guiadas do veículo e preenche formulário.",
          "As fotos e dados chegam automaticamente ao sistema para análise.",
          "Você pode solicitar fotos adicionais se necessário."
        ]
      },
      {
        title: "Vistoria Manual",
        steps: [
          "Para vistorias presenciais, use a opção 'Vistoria Manual'.",
          "Preencha o checklist de itens do veículo e tire fotos durante a vistoria.",
          "O sistema gera automaticamente um relatório PDF com todas as informações."
        ]
      },
      {
        title: "Acompanhamento público",
        steps: [
          "Cada sinistro gera um link de acompanhamento que pode ser compartilhado com o associado.",
          "O associado acompanha o status em tempo real sem precisar ligar ou enviar mensagem.",
          "As atualizações de status são publicadas automaticamente conforme o processo avança."
        ],
        tip: "Configure os status visíveis ao público em Configurações > Status Público para controlar o que o associado vê."
      }
    ]
  },
  {
    id: "financeiro",
    title: "Financeiro",
    description: "Controle financeiro completo com lançamentos, contas a pagar/receber e fluxo de caixa.",
    icon: DollarSign,
    color: "text-green-500",
    topics: [
      {
        title: "Visão geral financeira",
        steps: [
          "O painel financeiro mostra o resumo: receitas, despesas, saldo e inadimplência.",
          "Os gráficos apresentam a evolução mensal e comparativos entre períodos.",
          "Use os filtros de período para analisar meses ou trimestres específicos."
        ]
      },
      {
        title: "Lançamentos",
        steps: [
          "Acesse 'Lançamentos' para registrar receitas e despesas.",
          "Preencha: descrição, valor, categoria, data de vencimento e forma de pagamento.",
          "Marque como 'Pago' quando o pagamento for confirmado.",
          "Lançamentos recorrentes podem ser configurados para repetir mensalmente."
        ]
      },
      {
        title: "Contas a pagar e receber",
        steps: [
          "A aba 'Contas a Pagar' lista todas as despesas pendentes organizadas por vencimento.",
          "A aba 'Contas a Receber' mostra os valores esperados com status de cada cobrança.",
          "Itens vencidos ficam destacados em vermelho para fácil identificação."
        ],
        tip: "Use a conciliação bancária para cruzar seus lançamentos com o extrato do banco automaticamente."
      },
      {
        title: "Fluxo de caixa",
        steps: [
          "O fluxo de caixa projeta entradas e saídas futuras baseado nos lançamentos cadastrados.",
          "Visualize por semana, mês ou trimestre para planejar melhor.",
          "O gráfico mostra o saldo projetado para identificar possíveis déficits."
        ]
      },
      {
        title: "Notas fiscais",
        steps: [
          "Anexe notas fiscais aos lançamentos para manter o controle documental.",
          "As notas podem ser buscadas por número, fornecedor ou período."
        ]
      }
    ]
  },
  {
    id: "agenda",
    title: "Agenda",
    description: "Calendário de reuniões, compromissos e integração com Google Calendar.",
    icon: Calendar,
    color: "text-purple-500",
    topics: [
      {
        title: "Criar reunião",
        steps: [
          "Clique em '+ Nova Reunião' ou diretamente em um horário no calendário.",
          "Preencha: título, data/hora, duração e participantes.",
          "Adicione uma descrição ou pauta para a reunião.",
          "Os participantes receberão um convite por e-mail com link para a sala de vídeo."
        ]
      },
      {
        title: "Visualizações do calendário",
        steps: [
          "Alterne entre visualização de mês, semana ou dia usando os botões no topo.",
          "Eventos são coloridos por tipo: reuniões em azul, retornos em amarelo, prazos em vermelho.",
          "Clique em qualquer evento para ver detalhes ou editar."
        ]
      },
      {
        title: "Integração com Google Calendar",
        steps: [
          "Em Configurações > Integrações, conecte sua conta Google.",
          "Após conectar, seus eventos do Google Calendar aparecerão automaticamente na agenda.",
          "Reuniões criadas no sistema também são sincronizadas para o Google Calendar."
        ],
        tip: "A sincronização é bidirecional: alterações feitas em qualquer plataforma são refletidas na outra."
      }
    ]
  },
  {
    id: "documentos",
    title: "Documentos",
    description: "Repositório centralizado para upload e gestão de documentos importantes.",
    icon: FolderOpen,
    color: "text-amber-500",
    topics: [
      {
        title: "Upload de documentos",
        steps: [
          "Clique em '+ Novo Documento' e selecione o arquivo do seu computador.",
          "Dê um título descritivo e adicione uma descrição opcional.",
          "São aceitos: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG e outros formatos comuns.",
          "O documento ficará disponível para download por todos os usuários com permissão."
        ]
      },
      {
        title: "Organizar e buscar",
        steps: [
          "Use a barra de busca para encontrar documentos por título ou descrição.",
          "Os documentos são listados por data de upload, com o mais recente primeiro.",
          "Clique no ícone de download para baixar ou no ícone de lixeira para excluir."
        ],
        tip: "Nomeie seus documentos de forma padronizada (ex: 'Contrato_AssociacaoXYZ_2024') para facilitar buscas futuras."
      }
    ]
  },
  {
    id: "central_atendimento",
    title: "Central de Atendimento",
    description: "Hub unificado para comunicação via WhatsApp, e-mail e templates automáticos.",
    icon: Headset,
    color: "text-teal-500",
    topics: [
      {
        title: "WhatsApp integrado",
        steps: [
          "A central recebe e envia mensagens WhatsApp diretamente pelo sistema.",
          "As conversas ficam organizadas por contato com histórico completo.",
          "Use respostas rápidas e templates para agilizar o atendimento.",
          "Mensagens não lidas aparecem com badge no menu lateral."
        ]
      },
      {
        title: "Templates de mensagem",
        steps: [
          "Acesse a aba 'Templates' para criar modelos de mensagem reutilizáveis.",
          "Os templates podem ter variáveis como {nome}, {numero_atendimento} que são preenchidas automaticamente.",
          "Templates aprovados pela Meta podem ser usados para envio ativo via WhatsApp."
        ],
        tip: "Crie templates para situações recorrentes como 'Boas-vindas', 'Atualização de sinistro' e 'Cobrança' para ganhar produtividade."
      },
      {
        title: "E-mail",
        steps: [
          "Na aba de e-mail, configure seu SMTP para enviar e-mails diretamente pelo sistema.",
          "E-mails enviados ficam registrados no histórico do atendimento correspondente.",
          "Use templates HTML para enviar comunicações com visual profissional."
        ]
      },
      {
        title: "Fluxos automáticos",
        steps: [
          "Configure fluxos de WhatsApp para automatizar conversas comuns.",
          "Defina gatilhos (palavras-chave) e respostas automáticas sequenciais.",
          "O fluxo pode coletar dados do cliente e criar atendimentos automaticamente."
        ]
      }
    ]
  },
  {
    id: "mensagens",
    title: "Mensagens",
    description: "Chat interno para comunicação rápida entre os membros da equipe.",
    icon: MessageCircle,
    color: "text-pink-500",
    topics: [
      {
        title: "Enviar mensagens",
        steps: [
          "Selecione um colega na lista de contatos internos à esquerda.",
          "Digite sua mensagem e pressione Enter ou clique no botão de enviar.",
          "As mensagens são entregues em tempo real — sem necessidade de atualizar a página."
        ]
      },
      {
        title: "Notificações de mensagens",
        steps: [
          "Mensagens não lidas aparecem com badge no menu lateral.",
          "Ao receber uma nova mensagem, um som de notificação é tocado (se habilitado).",
          "Clique na notificação para ir direto à conversa."
        ],
        tip: "Use o chat interno para discussões rápidas sobre atendimentos — evite sair do sistema para se comunicar!"
      }
    ]
  },
  {
    id: "bi_indicadores",
    title: "BI - Indicadores",
    description: "Business Intelligence com dashboards de PID, SGA (Eventos), MGF, Cobrança e Estudo de Base.",
    icon: TrendingUp,
    color: "text-violet-500",
    topics: [
      {
        title: "PID (Painel de Indicadores)",
        steps: [
          "O PID mostra indicadores de desempenho consolidados da associação.",
          "Gráficos de evolução mensal, comparativos e rankings são gerados automaticamente.",
          "Selecione a associação no filtro para ver dados específicos."
        ]
      },
      {
        title: "SGA - Eventos",
        steps: [
          "O módulo SGA importa e analisa dados de eventos (sinistros) da plataforma Hinova.",
          "Para importar, acesse SGA > Importação e faça upload da planilha ou configure a automação.",
          "O dashboard mostra: total de eventos, distribuição por tipo, evolução temporal e mapa georreferenciado.",
          "Use os filtros de período e regional para análises específicas."
        ],
        tip: "Configure a importação automática em SGA > Automação para receber dados da Hinova diariamente sem intervenção manual."
      },
      {
        title: "MGF (Margem de Gestão Financeira)",
        steps: [
          "O MGF analisa a saúde financeira das associações com base em receitas e despesas operacionais.",
          "Importe os dados via planilha ou automação Hinova.",
          "O dashboard apresenta margem líquida, ponto de equilíbrio e projeções."
        ]
      },
      {
        title: "Cobrança",
        steps: [
          "O módulo de Cobrança acompanha a inadimplência das associações.",
          "Importe relatórios de boletos (Hinova) para análise automática.",
          "O dashboard mostra: % de inadimplência, evolução mensal, boletos em aberto por regional.",
          "Configure referências de inadimplência para acompanhar metas por dia do mês."
        ]
      },
      {
        title: "Estudo de Base",
        steps: [
          "O Estudo de Base analisa a composição da carteira de associados.",
          "Importe dados para visualizar distribuição geográfica, perfil dos veículos e concentração de risco.",
          "O mapa interativo mostra a distribuição espacial dos associados."
        ]
      },
      {
        title: "Importação de dados",
        steps: [
          "Em cada módulo do BI, acesse a aba 'Importação' para fazer upload manual de planilhas.",
          "O sistema aceita arquivos XLS, XLSX e CSV.",
          "Após o upload, os dados são processados e os dashboards são atualizados automaticamente.",
          "O histórico de importações fica registrado para controle e auditoria."
        ],
        tip: "Ative a automação Hinova para que as importações aconteçam automaticamente via GitHub Actions — configure em cada módulo na aba 'Automação'."
      }
    ]
  },
  {
    id: "ouvidoria",
    title: "Ouvidoria",
    description: "Sistema completo de ouvidoria com formulário público, backoffice e widgets.",
    icon: MessageSquareWarning,
    color: "text-yellow-600",
    topics: [
      {
        title: "Backoffice da ouvidoria",
        steps: [
          "O backoffice lista todas as manifestações recebidas (reclamações, sugestões, elogios, denúncias).",
          "Cada manifestação pode ser respondida, encaminhada ou arquivada.",
          "O status acompanha o ciclo: Aberta > Em Análise > Respondida > Encerrada.",
          "Manifestações pendentes aparecem com badge no menu lateral."
        ]
      },
      {
        title: "Formulário público",
        steps: [
          "Cada associação tem um link público para o formulário de ouvidoria.",
          "O link segue o formato: seusite.com/ouvidoria/slug-da-associacao.",
          "O associado preenche tipo, descrição e dados de contato opcionais.",
          "Manifestações anônimas são aceitas se configurado."
        ],
        tip: "Compartilhe o link da ouvidoria no site da associação, redes sociais e materiais impressos para facilitar o acesso."
      },
      {
        title: "Widget e embed",
        steps: [
          "Use o link embed para incorporar o formulário via iframe no site ou portal do parceiro.",
          "O widget pode ser customizado com as cores da associação.",
          "Copie o código iframe fornecido na configuração e cole no HTML do site."
        ]
      },
      {
        title: "Configurações da ouvidoria",
        steps: [
          "Em Configurações, defina: título personalizado, mensagem de boas-vindas, tipos de manifestação aceitos.",
          "Configure se manifestações anônimas são permitidas.",
          "Defina os e-mails que receberão notificação de novas manifestações."
        ]
      }
    ]
  },
  {
    id: "uon1sign",
    title: "Uon1 Sign",
    description: "Plataforma de contratos digitais com assinatura eletrônica e rastreabilidade completa.",
    icon: FileSignature,
    color: "text-sky-500",
    topics: [
      {
        title: "Criar contrato",
        steps: [
          "Clique em '+ Novo Contrato' e selecione um template ou crie do zero.",
          "Preencha as variáveis do contrato (nomes, valores, datas) nos campos indicados.",
          "Adicione os signatários com nome, e-mail e CPF.",
          "Defina a ordem de assinatura se necessário."
        ]
      },
      {
        title: "Templates de contrato",
        steps: [
          "Acesse 'Templates' para criar modelos reutilizáveis com variáveis dinâmicas.",
          "Use variáveis como {{nome_contratante}}, {{valor}}, {{data}} no corpo do template.",
          "Templates podem incluir logo personalizado e formatação HTML.",
          "Categorize os templates para facilitar a organização."
        ],
        tip: "Crie templates para os contratos mais comuns (adesão, prestação de serviço, distrato) e ganhe agilidade no dia a dia."
      },
      {
        title: "Acompanhar assinaturas",
        steps: [
          "O painel mostra o status de cada contrato: Rascunho, Enviado, Parcialmente Assinado, Concluído.",
          "Contratos assinados recentemente aparecem com badge no menu lateral.",
          "Clique em um contrato para ver quem já assinou e quem falta.",
          "Reenvie o link de assinatura para signatários que ainda não assinaram."
        ]
      },
      {
        title: "Assinatura eletrônica",
        steps: [
          "O signatário recebe um link por e-mail para assinar o contrato.",
          "Ao acessar, ele visualiza o documento completo e desenha sua assinatura na tela.",
          "O sistema registra: IP, data/hora, geolocalização e hash do documento para validade jurídica.",
          "Após todos assinarem, o PDF final é gerado automaticamente."
        ]
      }
    ]
  },
  {
    id: "uon1talk",
    title: "Uon1 Talk",
    description: "Videoconferência integrada para reuniões internas e com associados.",
    icon: Video,
    color: "text-rose-500",
    topics: [
      {
        title: "Criar sala de vídeo",
        steps: [
          "Acesse Uon1 Talk e clique em '+ Nova Sala'.",
          "Dê um nome à sala e defina os participantes.",
          "O link da sala pode ser compartilhado por e-mail ou WhatsApp.",
          "A sala fica ativa até que todos saiam ou o anfitrião encerre."
        ]
      },
      {
        title: "Participar de reunião",
        steps: [
          "Clique no link da reunião recebido por e-mail ou agenda.",
          "Permita o acesso à câmera e microfone quando solicitado pelo navegador.",
          "Use os botões na parte inferior para ligar/desligar câmera, microfone e compartilhar tela."
        ],
        tip: "Use um fone de ouvido para melhor qualidade de áudio e evitar eco durante a chamada."
      }
    ]
  },
  {
    id: "comunicados",
    title: "Comunicados",
    description: "Envio de comunicados internos para toda a equipe ou grupos específicos.",
    icon: Megaphone,
    color: "text-orange-600",
    topics: [
      {
        title: "Criar comunicado",
        steps: [
          "Clique em '+ Novo Comunicado' e preencha título e mensagem.",
          "Opcionalmente, adicione uma imagem e um link externo.",
          "O comunicado aparecerá para todos os usuários do sistema.",
          "Use formatação clara e objetiva para garantir que a mensagem seja compreendida."
        ]
      },
      {
        title: "Gerenciar comunicados",
        steps: [
          "Na listagem, veja todos os comunicados enviados com data e autor.",
          "Desative um comunicado para removê-lo da visualização dos usuários.",
          "Comunicados desativados ficam no histórico para consulta."
        ],
        tip: "Use comunicados para avisos importantes como mudanças de processo, manutenções programadas ou novidades do sistema."
      }
    ]
  },
  {
    id: "gestao",
    title: "Gestão",
    description: "Gestão de funcionários, contratos de trabalho, jornada e ponto eletrônico.",
    icon: Briefcase,
    color: "text-slate-600",
    topics: [
      {
        title: "Funcionários",
        steps: [
          "Cadastre funcionários com dados pessoais, cargo, departamento e dados bancários.",
          "Cada funcionário pode ter documentos anexados (RG, CPF, carteira de trabalho).",
          "Visualize o perfil completo com histórico de alterações."
        ]
      },
      {
        title: "Contratos de trabalho",
        steps: [
          "Crie contratos de trabalho vinculados aos funcionários.",
          "Use templates pré-configurados para agilizar a criação.",
          "Acompanhe vigência, renovações e rescisões.",
          "Gere PDF do contrato para impressão ou envio."
        ]
      },
      {
        title: "Jornada de trabalho",
        steps: [
          "Configure a jornada padrão de cada funcionário (horário de entrada, saída e intervalo).",
          "O sistema calcula automaticamente horas trabalhadas, extras e banco de horas.",
          "Registros de ponto podem ser ajustados manualmente com justificativa."
        ],
        tip: "Configure alertas de ponto para notificar funcionários sobre horários de entrada e saída."
      },
      {
        title: "Fechamento mensal",
        steps: [
          "No final de cada mês, acesse 'Fechamento Mensal' para consolidar os registros de ponto.",
          "Revise horas extras, faltas e atrasos antes de fechar.",
          "Após o fechamento, o período fica bloqueado para edições (a menos que reaberto por um administrador)."
        ]
      },
      {
        title: "Anexos e atestados",
        steps: [
          "Anexe atestados médicos, declarações e outros documentos ao registro do funcionário.",
          "Cada anexo pode ter dias abonados associados, que são descontados automaticamente das faltas.",
          "O histórico de anexos fica disponível para consulta e auditoria."
        ]
      }
    ]
  },
  {
    id: "configuracoes",
    title: "Configurações",
    description: "Personalização do sistema: aparência, segurança, integrações e permissões.",
    icon: Settings,
    color: "text-gray-500",
    topics: [
      {
        title: "Aparência e marca",
        steps: [
          "Personalize as cores do sistema para refletir a identidade visual da sua organização.",
          "Faça upload do logo (versão completa e ícone) que aparecerá no menu lateral.",
          "Altere a imagem da tela de login para dar boas-vindas personalizadas."
        ]
      },
      {
        title: "Segurança (2FA)",
        steps: [
          "Ative a autenticação em dois fatores (2FA) para adicionar uma camada extra de segurança.",
          "Os usuários precisarão de um aplicativo autenticador (Google Authenticator, Authy) para fazer login.",
          "Configure em Configurações > Segurança."
        ],
        tip: "Recomendamos fortemente ativar o 2FA para todos os usuários com acesso administrativo."
      },
      {
        title: "Permissões de menu",
        steps: [
          "Defina quais menus cada papel (role) pode visualizar e editar.",
          "Acesse Configurações > Permissões de Menu por Cargo.",
          "Selecione o cargo e marque/desmarque os menus permitidos.",
          "As mudanças são aplicadas imediatamente para todos os usuários do cargo."
        ]
      },
      {
        title: "Fluxos de trabalho",
        steps: [
          "Configure os fluxos (sequência de status) usados nos atendimentos.",
          "Adicione, remova ou reordene etapas conforme o processo da sua organização.",
          "Cada fluxo pode ter prazos específicos por etapa."
        ]
      },
      {
        title: "Integrações (API)",
        steps: [
          "Configure integrações com sistemas externos como Hinova, Google Calendar e WhatsApp.",
          "Cada integração tem seus próprios campos de configuração (URL, token, credenciais).",
          "Teste a conexão antes de ativar para garantir que tudo funciona."
        ]
      }
    ]
  },
  {
    id: "usuarios",
    title: "Usuários",
    description: "Gestão de usuários do sistema: aprovação, cargos e permissões individuais.",
    icon: Users,
    color: "text-indigo-600",
    topics: [
      {
        title: "Aprovar novos usuários",
        steps: [
          "Quando alguém se cadastra, o registro fica pendente de aprovação.",
          "Acesse Usuários e veja a seção 'Pendentes de Aprovação' no topo.",
          "Revise os dados, defina o cargo (role) e clique em 'Aprovar'.",
          "O usuário receberá acesso ao sistema com as permissões do cargo atribuído."
        ]
      },
      {
        title: "Cargos (Roles)",
        steps: [
          "O sistema possui cargos pré-definidos: Admin, Administrativo, Comercial, Líder e Superintendente.",
          "Cada cargo tem permissões de menu diferentes, configuráveis em Configurações.",
          "Admin tem acesso total. Outros cargos podem ser restringidos conforme necessidade."
        ],
        tip: "Use o cargo 'Comercial' para usuários que precisam apenas de acesso a atendimentos e corretoras, sem ver configurações ou financeiro."
      },
      {
        title: "Permissões individuais",
        steps: [
          "Além das permissões por cargo, é possível definir permissões individuais por usuário.",
          "Acesse o perfil do usuário e clique em 'Permissões de Menu' ou 'Permissões de Fluxo'.",
          "Isso permite exceções — por exemplo, dar acesso ao financeiro para um comercial específico."
        ]
      },
      {
        title: "Desativar ou excluir usuário",
        steps: [
          "Para remover o acesso de um usuário, clique no ícone de exclusão na listagem.",
          "O usuário será desativado e não poderá mais fazer login.",
          "Seus registros e histórico de ações são mantidos para auditoria."
        ]
      }
    ]
  }
];
