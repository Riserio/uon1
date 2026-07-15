import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Search,
  LayoutDashboard,
  ClipboardList,
  Building2,
  FileText,
  Users,
  SearchCheck,
  DollarSign,
  Calendar,
  Headset,
  MessageCircle,
  TrendingUp,
  MessageSquareWarning,
  FileSignature,
  Video,
  Megaphone,
  Briefcase,
  FileEdit,
  ClipboardCheck,
  CarFront,
  Settings,
  Scale,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

/* ============================================================
 * Biblioteca — página pública (sem login) com duas abas:
 *  - Ajuda: referência rápida de cada menu do sistema.
 *  - Estudo Regulatório: leis, resoluções, circulares e normas
 *    que fundamentam governança, riscos e compliance.
 * Reconstruída no design system do app (shadcn/Tailwind).
 * ============================================================ */

type RegItem = {
  id: string;
  cat: "leis" | "resolucoes" | "circulares" | "normas" | "ods";
  number: string;
  date: string;
  status: "vigente" | "parcial";
  title: string;
  resumoCurto: string;
  summary: string;
  points: string[];
  tags: string[];
  source: string;
};

const REG_DATA: RegItem[] = [
  {
    id: "lc213", cat: "leis", number: "Lei Complementar nº 213/2025", date: "15 jan. 2025", status: "vigente",
    title: "Marco Legal da Proteção Patrimonial Mutualista e das Cooperativas de Seguros",
    resumoCurto: "A lei que cria juridicamente o setor de proteção patrimonial mutualista.",
    summary: "Lei complementar que institui, pela primeira vez, um marco legal próprio para as operações de proteção patrimonial mutualista (PPM) e para as cooperativas de seguros, submetendo ambas à supervisão do CNSP e da Susep. Cria a figura da administradora de operações de PPM como pessoa jurídica exclusiva para gerir os grupos mutualistas, distinta das associações de participantes.",
    points: [
      "Reconhece a PPM como atividade regulada, distinta de seguro, mas sujeita a supervisão prudencial e de conduta da Susep.",
      "Art. 9º trata do cadastramento e da cessação de atividades das associações preexistentes.",
      "Base legal direta da Resolução CNSP nº 491/2026, que a regulamenta em detalhe.",
      "É a norma-mãe da existência jurídica da administradora de PPM.",
    ],
    tags: ["PPM", "base legal"], source: "Presidência da República",
  },
  {
    id: "lei12846", cat: "leis", number: "Lei nº 12.846/2013", date: "1º ago. 2013", status: "vigente",
    title: "Lei Anticorrupção (Lei da Empresa Limpa)",
    resumoCurto: "Responsabiliza a empresa por corrupção, mesmo sem culpa do dirigente.",
    summary: "Dispõe sobre a responsabilização administrativa e civil objetiva de pessoas jurídicas pela prática de atos contra a administração pública, nacional ou estrangeira. A responsabilidade independe de culpa ou dolo do administrador — basta o ato lesivo em benefício da empresa.",
    points: [
      "Responsabilização objetiva: a empresa responde mesmo sem prova de culpa dos dirigentes.",
      "Pune corrupção, fraude a licitações, obstrução de investigações, entre outros atos lesivos.",
      "Programas de integridade (compliance) eficazes são atenuante da multa (Decreto nº 8.420/2015).",
      "Fundamenta a exigência de Código de Ética/Conduta e canal de denúncias.",
    ],
    tags: ["anticorrupção", "compliance"], source: "Presidência da República",
  },
  {
    id: "lgpd", cat: "leis", number: "Lei nº 13.709/2018 (LGPD)", date: "14 ago. 2018", status: "vigente",
    title: "Lei Geral de Proteção de Dados Pessoais",
    resumoCurto: "Regras para coletar, usar e proteger dados pessoais.",
    summary: "Regula o tratamento de dados pessoais por pessoas físicas e jurídicas, com o objetivo de proteger os direitos fundamentais de liberdade, privacidade e livre desenvolvimento da personalidade. Central para qualquer administradora que colete dados de participantes, beneficiários e colaboradores.",
    points: [
      "Exige base legal para cada tratamento (consentimento, contrato, obrigação legal, etc.).",
      "Impõe direitos ao titular: acesso, correção, eliminação, portabilidade, revogação.",
      "Exige medidas técnicas e administrativas de segurança — conecta-se às ISO 27001/27002 e à Circular Susep 638/2021.",
      "ANPD pode aplicar sanções de até 2% do faturamento (limitado a R$ 50 milhões) por infração.",
    ],
    tags: ["dados pessoais", "privacidade", "ANPD"], source: "Presidência da República",
  },
  {
    id: "pnrs", cat: "leis", number: "Lei nº 12.305/2010", date: "2 ago. 2010", status: "vigente",
    title: "Política Nacional de Resíduos Sólidos (PNRS)",
    resumoCurto: "Base legal das políticas internas de sustentabilidade/ESG.",
    summary: "Institui a Política Nacional de Resíduos Sólidos, com princípios, objetivos e instrumentos para a gestão integrada de resíduos, incluindo a responsabilidade compartilhada entre fabricantes, distribuidores, comerciantes e consumidores.",
    points: [
      "Introduz o conceito de responsabilidade compartilhada pelo ciclo de vida dos produtos.",
      "Base para políticas internas de sustentabilidade e descarte responsável (papel, eletrônicos, etc.).",
      "Referência típica em políticas ESG corporativas.",
      "Conecta-se aos compromissos voluntários de sustentabilidade (ODS, Pacto Global, ISO 14001).",
    ],
    tags: ["ESG", "sustentabilidade"], source: "Presidência da República",
  },
  {
    id: "lei9613", cat: "leis", number: "Lei nº 9.613/1998", date: "3 mar. 1998", status: "vigente",
    title: "Lei de Lavagem de Dinheiro",
    resumoCurto: "Base de todo o programa de PLD/FT.",
    summary: "Dispõe sobre os crimes de lavagem ou ocultação de bens, direitos e valores, a prevenção da utilização do sistema financeiro para tais ilícitos e cria o COAF. Alterada substancialmente pela Lei nº 12.683/2012, que ampliou o rol de infrações antecedentes e de pessoas obrigadas.",
    points: [
      "Art. 1º: tipifica ocultar/dissimular a origem de bens provenientes de qualquer infração penal.",
      "Art. 9º define as pessoas obrigadas ao mecanismo de controle (seguradoras, corretoras, previdência).",
      "Arts. 10 e 11: identificação de clientes, manutenção de registros e comunicação de operações suspeitas ao COAF.",
      "Art. 12: sanções administrativas (advertência, multa até R$ 20 milhões, inabilitação, cassação).",
    ],
    tags: ["PLD/FT", "COAF"], source: "Presidência da República",
  },
  {
    id: "cnsp416", cat: "resolucoes", number: "Resolução CNSP nº 416/2021", date: "20 jul. 2021", status: "vigente",
    title: "Sistema de Controles Internos, Estrutura de Gestão de Riscos e Auditoria Interna",
    resumoCurto: "A norma central de governança.",
    summary: "Norma central de governança: exige que toda supervisionada mantenha Sistema de Controles Internos (SCI), Estrutura de Gestão de Riscos (EGR) e atividade de Auditoria Interna, com papéis, responsabilidades e segregação de funções bem definidos.",
    points: [
      "Art. 9º: exige diretor estatutário responsável pelos controles internos, sem acúmulo com funções executivas de negócio.",
      "Arts. 10/18/29: unidades segregadas de conformidade, gestão de riscos e auditoria interna.",
      "Art. 16/17: formalização do apetite por risco e da política de gestão de riscos.",
      "Art. 21: exige Comitê de Riscos com requisitos de independência dos membros.",
    ],
    tags: ["governança", "SCI", "EGR"], source: "Susep",
  },
  {
    id: "cnsp491", cat: "resolucoes", number: "Resolução CNSP nº 491/2026", date: "4 maio 2026", status: "vigente",
    title: "Normas Gerais para Operações de Proteção Patrimonial Mutualista",
    resumoCurto: "A norma que efetivamente rege a operação diária de PPM.",
    summary: "Regulamenta em detalhe a LC nº 213/2025. Define a administradora, a separação estrutural entre associação e administração, capital mínimo, governança, provisões técnicas, transferência de gestão de grupos e poderes de supervisão da Susep.",
    points: [
      "Art. 2º: prazo de 24 meses para as associações preexistentes se adequarem; janela de 90 dias para pedidos prioritários.",
      "Art. 5º/6º: administração privativa de sociedade por ações com objeto social exclusivo (separação estrutural obrigatória).",
      "Art. 8º: exige atuário responsável técnico, contador, ouvidor e diretor responsável técnico.",
      "Arts. 51-54 / 122-126: amplos poderes de supervisão da Susep (suspensão de adesões, auditorias, transferência compulsória).",
      "Arts. 135-136: exigências de PLD/FT e guarda de documentos por no mínimo 5 anos.",
    ],
    tags: ["PPM", "norma central"], source: "Susep/CNSP, DOU 06/05/2026",
  },
  {
    id: "cnsp321", cat: "resolucoes", number: "Resolução CNSP nº 321/2015", date: "15 jul. 2015", status: "vigente",
    title: "Capital Mínimo Requerido, Provisões Técnicas e Planos de Regularização de Solvência",
    resumoCurto: "Os gatilhos numéricos de entrada em regime especial.",
    summary: "Disciplina o cálculo do Capital Mínimo Requerido (CMR) e do Patrimônio Líquido Ajustado (PLA), os capitais de risco, as provisões técnicas e os planos de regularização de solvência (PRS) e de liquidez (PRL).",
    points: [
      "Arts. 67-69: gatilhos de PRS/PRL conforme a insuficiência do PLA em relação ao CMR (até 50% → PRS; 50-70% → direção fiscal; >70% → liquidação).",
      "Arts. 75/75-A: hipóteses de regime especial por descumprimento do plano de regularização.",
      "Referenciada pela Resolução CNSP 395/2020 como parâmetro de solvência.",
      "Relevante por analogia — a Resolução 491/2026 remete a parâmetros similares (CMR/PLA).",
    ],
    tags: ["solvência", "CMR", "PLA"], source: "Susep",
  },
  {
    id: "circ612", cat: "circulares", number: "Circular SUSEP nº 612/2020", date: "18 ago. 2020", status: "vigente",
    title: "Prevenção à Lavagem de Dinheiro e ao Financiamento do Terrorismo (PLD/FT)",
    resumoCurto: "O manual operacional de PLD/FT.",
    summary: "Regulamenta, no mercado supervisionado pela Susep, a política, os procedimentos e os controles internos de PLD/FT exigidos pela Lei nº 9.613/1998, incluindo avaliação interna de risco, identificação de clientes/PEPs, monitoramento reforçado e comunicação ao COAF.",
    points: [
      "Art. 12: exige diretor responsável por PLD/FT com acesso irrestrito aos dados de identificação.",
      "Capítulo VI: avaliação interna de risco (cliente, produto, geografia), revisada a cada 2 anos.",
      "Art. 35, §5º: comunicação automática ao COAF acima de R$ 10.000 (prêmio em espécie).",
      "Arts. 41-43: relatório anual de avaliação de efetividade, data-base 31/12.",
    ],
    tags: ["PLD/FT", "COAF"], source: "Susep",
  },
  {
    id: "circ648", cat: "circulares", number: "Circular SUSEP nº 648/2021", date: "12 nov. 2021", status: "vigente",
    title: "Estrutura de Capital, Provisões Técnicas e Teste de Adequação de Passivos (TAP)",
    resumoCurto: "Regras técnicas de provisões e teste de adequação de passivos.",
    summary: "Estabelece as regras detalhadas para constituição de provisões técnicas (PPNG, PSL, PDR, PMBAC, etc.), a metodologia do Teste de Adequação de Passivos (TAP) e critérios de capital baseado em risco.",
    points: [
      "Capítulo II: regras e procedimentos do TAP — obrigatório para S1, S2 e S3.",
      "Art. 45: o estudo atuarial do TAP deve justificar hipóteses e premissas de cada variável projetada.",
      "Art. 124: regras de contabilização de transferência de carteira.",
      "Art. 156: relatório sobre adequação dos controles internos aos riscos.",
    ],
    tags: ["provisões técnicas", "TAP", "capital"], source: "Susep",
  },
  {
    id: "circ700", cat: "circulares", number: "Circular SUSEP nº 700/2024", date: "4 abr. 2024", status: "vigente",
    title: "Autorização para Funcionamento, Atos Societários e Sandbox Regulatório",
    resumoCurto: "Procedimento para nomear/destituir diretores e outros atos societários.",
    summary: "Unifica e moderniza os procedimentos de autorização da Susep: início de operações, eleição/destituição de administradores, integralização de capital e estrutura de controle societário. Revoga oito circulares anteriores.",
    points: [
      "Organiza os atos em três grupos: autorização prévia, homologação e mera comunicação.",
      "Compatibiliza-se com a Resolução CNSP nº 422/2021.",
      "Relevante nos processos de nomeação/destituição de diretores e atos societários futuros.",
    ],
    tags: ["autorização", "atos societários"], source: "Susep, DOU 15/04/2024",
  },
  {
    id: "circ638", cat: "circulares", number: "Circular SUSEP nº 638/2021", date: "27 jul. 2021", status: "vigente",
    title: "Requisitos de Segurança Cibernética",
    resumoCurto: "Base regulatória da Política de Segurança Cibernética.",
    summary: "Estabelece os requisitos mínimos de segurança cibernética das sociedades supervisionadas pela Susep, cobrindo governança, gestão de riscos cibernéticos, proteção de dados, continuidade de negócios e resposta a incidentes.",
    points: [
      "Exige Política de Segurança Cibernética formal, revisada ao menos anualmente.",
      "Cobre governança, riscos cibernéticos, proteção de dados e resposta a incidentes.",
      "Conecta-se às ISO/IEC 27001:2022, 27002:2022, ao NIST CSF 2.0 e ao COBIT.",
    ],
    tags: ["cibersegurança", "governança de TI"], source: "Susep",
  },
  {
    id: "iso27001", cat: "normas", number: "ISO/IEC 27001:2022", date: "2022", status: "vigente",
    title: "Sistema de Gestão de Segurança da Informação (SGSI)",
    resumoCurto: "A norma certificável de segurança da informação.",
    summary: "Norma internacional certificável que especifica os requisitos para estabelecer, implementar, manter e melhorar um Sistema de Gestão de Segurança da Informação. Estrutura-se no ciclo PDCA e no Anexo A com 93 controles (versão 2022).",
    points: [
      "Exige política de segurança, avaliação/tratamento de riscos e Declaração de Aplicabilidade (SoA).",
      "Os 93 controles do Anexo A (2022): organizacionais, pessoas, físicos e tecnológicos.",
      "Complementa a ISO/IEC 27002:2022 (guia de implementação).",
      "Base técnica para a Política de Segurança Cibernética (Circular Susep nº 638/2021).",
    ],
    tags: ["segurança da informação", "certificável"], source: "ISO/IEC",
  },
  {
    id: "iso27002", cat: "normas", number: "ISO/IEC 27002:2022", date: "2022", status: "vigente",
    title: "Código de Prática para Controles de Segurança da Informação",
    resumoCurto: "O manual de implementação prática dos controles da 27001.",
    summary: "Guia complementar à ISO 27001, detalhando a implementação prática de cada um dos 93 controles de segurança da informação, com orientações de propósito, atributos e implementação.",
    points: [
      "Não é certificável isoladamente — é o manual de referência dos controles do Anexo A da 27001.",
      "Introduziu atributos de controle (tipo, propriedades, capacidades operacionais).",
      "Usada com o NIST CSF e o COBIT para desenhar a arquitetura de controles de TI.",
    ],
    tags: ["segurança da informação"], source: "ISO/IEC",
  },
  {
    id: "nistcsf", cat: "normas", number: "NIST Cybersecurity Framework 2.0", date: "2024", status: "vigente",
    title: "Estrutura de Gestão de Risco Cibernético do NIST",
    resumoCurto: "Framework estratégico de cibersegurança, com foco em governança.",
    summary: "Framework voluntário do NIST (EUA) para gestão de risco cibernético, organizado em seis funções: Identificar, Proteger, Detectar, Responder, Recuperar e — nova na v2.0 — Governar.",
    points: [
      "A função Governar (nova na v2.0): estratégia, papéis, políticas e supervisão de risco cibernético na alta administração.",
      "Não é certificável; é linguagem comum para benchmarking e maturidade.",
      "Usado com a ISO 27001 (o CSF fornece o 'o quê', a ISO fornece o 'como').",
    ],
    tags: ["cibersegurança", "governança"], source: "NIST (EUA)",
  },
  {
    id: "cobit", cat: "normas", number: "COBIT 2019", date: "2019", status: "vigente",
    title: "Control Objectives for Information and Related Technologies",
    resumoCurto: "Conecta objetivos de negócio a controles de TI.",
    summary: "Framework de governança e gestão de TI corporativa, mantido pela ISACA, que conecta objetivos de negócio a objetivos de TI e a processos e controles específicos.",
    points: [
      "40 objetivos de governança e gestão, agrupados em domínios.",
      "Usa fatores de design para customizar o modelo conforme porte, estratégia e risco.",
      "Complementa a ISO 27001/27002 e o COSO ERM.",
    ],
    tags: ["governança de TI", "ISACA"], source: "ISACA",
  },
  {
    id: "iso31000", cat: "normas", number: "ISO 31000:2018", date: "2018", status: "vigente",
    title: "Gestão de Riscos — Diretrizes",
    resumoCurto: "A base conceitual comum da gestão de riscos.",
    summary: "Norma internacional (não certificável) que estabelece princípios, uma estrutura e um processo genérico para gestão de riscos, aplicável a qualquer organização, setor ou tipo de risco.",
    points: [
      "Processo: comunicação/consulta → contexto → identificação → análise → avaliação → tratamento → monitoramento.",
      "A gestão de riscos deve ser integrada, estruturada, personalizada, inclusiva e dinâmica.",
      "Base conceitual comum da EGR (Resolução CNSP 416/2021) e do COSO ERM.",
    ],
    tags: ["gestão de riscos", "ISO"], source: "ISO",
  },
  {
    id: "cosoerm", cat: "normas", number: "COSO ERM 2017", date: "2017", status: "vigente",
    title: "Enterprise Risk Management — Integrating with Strategy and Performance",
    resumoCurto: "Conecta risco a estratégia e criação de valor.",
    summary: "Framework de gestão de riscos corporativos do COSO, que integra a gestão de riscos à definição de estratégia e ao desempenho, através de 20 princípios em 5 componentes.",
    points: [
      "5 componentes: Governança e Cultura; Estratégia e Objetivos; Desempenho; Revisão; Informação e Reporte.",
      "Foco na ligação entre risco e criação/preservação de valor estratégico.",
      "Citado ao lado da ISO 31000 nas políticas do setor segurador brasileiro.",
    ],
    tags: ["gestão de riscos", "estratégia"], source: "COSO",
  },
  {
    id: "iso37301", cat: "normas", number: "ISO 37301:2021", date: "2021", status: "vigente",
    title: "Sistemas de Gestão de Compliance — Requisitos",
    resumoCurto: "A norma certificável de compliance.",
    summary: "Norma internacional certificável (substitui a ISO 19600) que especifica os requisitos para um Sistema de Gestão de Compliance eficaz, incluindo liderança, avaliação de riscos de compliance e canal de denúncias.",
    points: [
      "Exige identificação e avaliação periódica de obrigações de compliance (legais, regulatórias, contratuais, voluntárias).",
      "Exige órgão de compliance com autoridade, independência e recursos.",
      "Trata de canais de denúncia e proteção contra retaliação.",
    ],
    tags: ["compliance", "certificável"], source: "ISO",
  },
  {
    id: "iso14001", cat: "normas", number: "ISO 14001:2015", date: "2015", status: "vigente",
    title: "Sistemas de Gestão Ambiental — Requisitos",
    resumoCurto: "A norma certificável de gestão ambiental.",
    summary: "Norma internacional certificável que especifica os requisitos para um sistema de gestão ambiental, permitindo à organização melhorar seu desempenho ambiental de forma sistemática.",
    points: [
      "Baseada no ciclo PDCA, com foco em aspectos e impactos ambientais significativos.",
      "Referência típica em políticas ESG/sustentabilidade corporativas.",
      "Dialoga com a Lei nº 12.305/2010 (PNRS).",
    ],
    tags: ["ESG", "meio ambiente", "certificável"], source: "ISO",
  },
  {
    id: "iso26000", cat: "normas", number: "ISO 26000:2010", date: "2010", status: "vigente",
    title: "Diretrizes sobre Responsabilidade Social",
    resumoCurto: "Diretriz não certificável de responsabilidade social.",
    summary: "Norma internacional de diretrizes (não certificável) sobre responsabilidade social, cobrindo sete temas: governança, direitos humanos, práticas de trabalho, meio ambiente, práticas leais, consumidor e comunidade.",
    points: [
      "Não é certificável — é referência conceitual e de linguagem comum.",
      "Citada junto ao Pacto Global da ONU e aos ODS.",
      "Reforça accountability e transparência como pilares da governança.",
    ],
    tags: ["responsabilidade social", "ESG"], source: "ISO",
  },
  {
    id: "ods", cat: "ods", number: "ODS — Objetivos de Desenvolvimento Sustentável (ONU)", date: "Agenda 2030", status: "vigente",
    title: "17 Objetivos de Desenvolvimento Sustentável",
    resumoCurto: "Agenda voluntária de sustentabilidade usada em relatórios ESG.",
    summary: "Agenda global adotada pela ONU em 2015, com 17 objetivos e 169 metas para erradicar a pobreza, proteger o planeta e garantir prosperidade até 2030.",
    points: [
      "No setor financeiro/segurador, os mais citados: ODS 8, 10, 12, 13 e 16 (que dialoga com anticorrupção e compliance).",
      "Não é vinculante — é compromisso voluntário usado como referência estratégica.",
    ],
    tags: ["ESG", "ONU", "voluntário"], source: "ONU",
  },
  {
    id: "pactoglobal", cat: "ods", number: "Pacto Global da ONU", date: "2000", status: "vigente",
    title: "10 Princípios do Pacto Global",
    resumoCurto: "10 princípios voluntários de direitos humanos, trabalho, meio ambiente e anticorrupção.",
    summary: "Iniciativa voluntária da ONU que convida empresas a alinhar operações e estratégias a dez princípios universais em direitos humanos, trabalho, meio ambiente e anticorrupção.",
    points: [
      "Direitos Humanos (1-2): apoiar e respeitar direitos humanos; não ser cúmplice de violações.",
      "Trabalho (3-6): liberdade de associação, fim do trabalho forçado e infantil, não discriminação.",
      "Meio Ambiente (7-9): prevenção, responsabilidade ambiental, tecnologias limpas.",
      "Anticorrupção (10): combater corrupção — conecta-se à Lei nº 12.846/2013.",
    ],
    tags: ["ESG", "ONU", "anticorrupção"], source: "ONU",
  },
];

const REG_CATS: { id: string; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "leis", label: "Leis" },
  { id: "resolucoes", label: "Resoluções CNSP" },
  { id: "circulares", label: "Circulares Susep" },
  { id: "normas", label: "Normas & Frameworks" },
  { id: "ods", label: "ODS & Pacto Global" },
];

const AJUDA_ITEMS: { icon: React.ComponentType<{ className?: string }>; label: string; desc: string }[] = [
  { icon: LayoutDashboard, label: "Painel", desc: "Visão geral com os principais indicadores e atalhos do dia a dia." },
  { icon: ClipboardList, label: "Atendimentos", desc: "Registro e acompanhamento dos atendimentos aos associados." },
  { icon: Building2, label: "Associações", desc: "Cadastro e gestão das corretoras/associações parceiras." },
  { icon: FileText, label: "Termos de Aceite", desc: "Modelos e controle dos termos assinados pelos associados." },
  { icon: Users, label: "Contatos", desc: "Base de contatos e relacionamento." },
  { icon: SearchCheck, label: "Vistorias", desc: "Vistorias digitais e manuais de veículos e sinistros." },
  { icon: DollarSign, label: "Financeiro", desc: "Lançamentos financeiros, cobrança e conciliação." },
  { icon: Calendar, label: "Agenda", desc: "Compromissos, tarefas e lembretes." },
  { icon: FileText, label: "Documentos", desc: "Repositório de documentos do sistema." },
  { icon: Headset, label: "Central de Atendimento", desc: "E-mails e WhatsApp unificados em um só lugar." },
  { icon: MessageCircle, label: "Mensagens", desc: "Mensagens internas entre usuários." },
  { icon: Search, label: "SGA — Associados", desc: "Consulta à base de associados sincronizada do SGA." },
  { icon: TrendingUp, label: "BI - Indicadores", desc: "Painel de BI: placas ativas, sinistros, financeiro e Estudo de Base." },
  { icon: MessageSquareWarning, label: "Ouvidoria", desc: "Gestão das manifestações de ouvidoria." },
  { icon: FileSignature, label: "Uon1 Sign", desc: "Assinatura eletrônica de contratos." },
  { icon: Video, label: "Uon1 Talk", desc: "Reuniões e chamadas de vídeo." },
  { icon: Megaphone, label: "Comunicados", desc: "Avisos e comunicados internos." },
  { icon: Briefcase, label: "Gestão", desc: "Ferramentas de gestão da associação." },
  { icon: FileEdit, label: "Formulários", desc: "Criação e coleta de formulários públicos." },
  { icon: ClipboardCheck, label: "PPR", desc: "Programa de participação em resultados." },
  { icon: CarFront, label: "Débitos Veiculares", desc: "Consulta e gestão de débitos veiculares." },
  { icon: Settings, label: "Configurações", desc: "Integrações, preferências e ajustes do sistema." },
];

function StatusBadge({ status }: { status: RegItem["status"] }) {
  return (
    <Badge variant={status === "vigente" ? "secondary" : "outline"} className="uppercase text-[10px] tracking-wide">
      {status}
    </Badge>
  );
}

export default function Biblioteca() {
  const [cat, setCat] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [studyMode, setStudyMode] = useState(false);
  const [selected, setSelected] = useState<RegItem | null>(null);
  const [studyIndex, setStudyIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [deck, setDeck] = useState<RegItem[]>([]);

  const filtered = useMemo(() => {
    return REG_DATA.filter((d) => {
      if (cat !== "todos" && d.cat !== cat) return false;
      if (!search) return true;
      const hay = (d.number + " " + d.title + " " + d.summary + " " + d.tags.join(" ")).toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [cat, search]);

  const startStudy = () => {
    setDeck(filtered);
    setStudyIndex(0);
    setFlipped(false);
    setStudyMode(true);
  };

  const currentCard = deck[studyIndex];

  const nextCard = () => {
    if (deck.length === 0) return;
    setStudyIndex((studyIndex + 1) % deck.length);
    setFlipped(false);
  };
  const prevCard = () => {
    if (deck.length === 0) return;
    setStudyIndex((studyIndex - 1 + deck.length) % deck.length);
    setFlipped(false);
  };
  const shuffle = () => {
    const d = [...deck];
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    setDeck(d);
    setStudyIndex(0);
    setFlipped(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Biblioteca</h1>
              <p className="text-sm text-muted-foreground">Ajuda do sistema e estudo regulatório · acesso público</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="ajuda" className="space-y-6">
          <TabsList>
            <TabsTrigger value="ajuda" className="gap-1.5">
              <BookOpen className="h-4 w-4" /> Ajuda
            </TabsTrigger>
            <TabsTrigger value="regulatorio" className="gap-1.5">
              <Scale className="h-4 w-4" /> Estudo Regulatório
            </TabsTrigger>
          </TabsList>

          {/* ---------------- AJUDA ---------------- */}
          <TabsContent value="ajuda" className="space-y-4 mt-0">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Referência rápida de cada menu do sistema — o que você encontra em cada área.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AJUDA_ITEMS.map((m) => {
                const Icon = m.icon;
                return (
                  <Card key={m.label} className="p-4 flex gap-3 items-start">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{m.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.desc}</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ---------------- ESTUDO REGULATÓRIO ---------------- */}
          <TabsContent value="regulatorio" className="space-y-5 mt-0">
            <p className="text-sm text-muted-foreground max-w-3xl">
              Leis, resoluções CNSP, circulares Susep e normas internacionais que fundamentam a governança, riscos e
              compliance. Clique em qualquer item para ver o detalhamento e os pontos-chave para estudo.
            </p>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por número, tema ou palavra-chave (ex: PLD, capital mínimo, ISO)..."
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button variant={studyMode ? "outline" : "default"} size="sm" onClick={() => setStudyMode(false)}>
                  Consultar
                </Button>
                <Button variant={studyMode ? "default" : "outline"} size="sm" onClick={startStudy}>
                  Modo estudo
                </Button>
              </div>
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-2">
              {REG_CATS.map((c) => {
                const n = c.id === "todos" ? REG_DATA.length : REG_DATA.filter((d) => d.cat === c.id).length;
                const active = cat === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCat(c.id);
                      if (studyMode) startStudy();
                    }}
                    className={
                      "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors " +
                      (active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground hover:text-foreground hover:border-primary/50")
                    }
                  >
                    {c.label}
                    <span
                      className={
                        "text-[10px] rounded-full px-1.5 " +
                        (active ? "bg-primary-foreground/20" : "bg-muted text-foreground")
                      }
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Browse grid */}
            {!studyMode && (
              <>
                {filtered.length === 0 ? (
                  <div className="text-center text-muted-foreground py-16">Nenhum dispositivo encontrado para essa busca.</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((d) => (
                      <Card
                        key={d.id}
                        onClick={() => setSelected(d)}
                        className="p-4 cursor-pointer border-l-4 border-l-primary hover:shadow-md hover:border-l-primary/70 transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[11px] font-semibold text-primary">{d.number}</span>
                          <StatusBadge status={d.status} />
                        </div>
                        <h3 className="font-semibold text-[15px] leading-snug">{d.title}</h3>
                        <p className="text-xs font-medium text-primary">{d.resumoCurto}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{d.summary}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {d.tags.map((t) => (
                            <span key={t} className="text-[10px] rounded-full bg-muted px-2 py-0.5 font-mono">{t}</span>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Study mode */}
            {studyMode && (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="text-xs text-muted-foreground font-mono">
                  {deck.length === 0 ? "0 / 0" : `${studyIndex + 1} / ${deck.length}`}
                </div>
                <Card
                  onClick={() => setFlipped(!flipped)}
                  className="w-full max-w-xl min-h-[260px] p-7 cursor-pointer flex flex-col justify-center"
                >
                  {!currentCard ? (
                    <p className="text-center text-muted-foreground">Nenhum cartão nesta categoria.</p>
                  ) : !flipped ? (
                    <div className="space-y-3">
                      <div className="font-mono text-xs text-primary">{currentCard.number}</div>
                      <h3 className="text-xl font-semibold leading-snug">{currentCard.title}</h3>
                      <div className="text-xs text-muted-foreground pt-4">clique para revelar o conteúdo</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <h4 className="font-mono text-[11px] uppercase tracking-wide text-primary">O que diz</h4>
                      <p className="text-sm leading-relaxed">{currentCard.summary}</p>
                      <ul className="space-y-1.5 pt-1">
                        {currentCard.points.slice(0, 4).map((p, i) => (
                          <li key={i} className="text-xs text-muted-foreground pl-3 border-l-2 border-primary/40 leading-relaxed">{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={prevCard}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <Button variant="default" size="sm" onClick={shuffle}>
                    <Shuffle className="h-4 w-4 mr-1" /> Embaralhar
                  </Button>
                  <Button variant="outline" size="sm" onClick={nextCard}>
                    Próximo <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <footer className="mt-10 pt-4 border-t text-[11px] text-muted-foreground text-center font-mono">
          Uso interno de estudo e referência · não substitui a consulta ao texto oficial
        </footer>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="font-mono text-xs text-primary">{selected.number}</div>
                <DialogTitle className="text-xl leading-snug">{selected.title}</DialogTitle>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {selected.date} · {selected.status.toUpperCase()}
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm font-semibold text-primary">{selected.resumoCurto}</p>
                <p className="text-sm leading-relaxed">{selected.summary}</p>
                <div>
                  <h4 className="font-mono text-[11px] uppercase tracking-wide text-primary border-b pb-1.5 mb-2">
                    Pontos-chave para estudo
                  </h4>
                  <ul className="space-y-2">
                    {selected.points.map((p, i) => (
                      <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-primary/50 leading-relaxed">{p}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t text-[11px] text-muted-foreground font-mono">
                  <span>{selected.tags.join(" · ")}</span>
                  <span>{selected.source}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
