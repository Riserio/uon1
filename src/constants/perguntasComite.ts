// Perguntas do Comitê de Sinistros
export interface PerguntaComite {
  id: string;
  pergunta: string;
  tipo: 'select' | 'text' | 'date' | 'textarea' | 'valor' | 'mapa';
  opcoes?: string[];
  obrigatoria: boolean;
  categoria: string;
  autoPreenchivel?: string;
  peso?: number;
  pesoPositivo?: string[];
  pesoNegativo?: string[];
  nivelAlerta?: 'passivel_negativa' | 'atencao_juridica' | 'atencao_andamento' | 'ressarcimento' | 'aprovacao' | null;
  tiposSinistro?: string[]; // Tipos de sinistro que usam esta pergunta
}

// Pareceres do Comitê com cores
export const PARECERES_COMITE = [
  { 
    value: 'EVENTO REQUER ATENÇÃO PASSIVEL DE NEGATIVA/ANALISE JURIDICA',
    label: 'Evento Requer Atenção - Passível de Negativa/Análise Jurídica',
    cor: 'bg-red-600',
    textCor: 'text-white'
  },
  { 
    value: 'EVENTO REQUER ATENÇÃO - ALGUMAS RESPOSTAS PODEM INDICAR A NECESSIDADE DE UMA ANALISE JURIDICA, SINDICANCIA OU PERICIA PARA ESTE EVENTO',
    label: 'Evento Requer Atenção - Análise Jurídica/Sindicância/Perícia',
    cor: 'bg-orange-500',
    textCor: 'text-white'
  },
  { 
    value: 'EVENTO REQUER ATENÇÃO - ALGUMAS RESPOSTAS PODEM INDICAR MUDANÇAS NO ANDAMENTO DO EVENTO',
    label: 'Evento Requer Atenção - Mudanças no Andamento',
    cor: 'bg-yellow-400',
    textCor: 'text-black'
  },
  { 
    value: 'EVENTO PASSIVEL DE RESARCIMENTO',
    label: 'Evento Passível de Ressarcimento',
    cor: 'bg-lime-500',
    textCor: 'text-white'
  },
  { 
    value: 'EVENTO PASSIVO DE APROVACAO - NENHUMA DAS RESPOSTAS INFORMADAS INDICAM INDICIOS ATENCAO',
    label: 'Evento Passivo de Aprovação',
    cor: 'bg-green-600',
    textCor: 'text-white'
  }
];

export const TIPOS_SINISTRO_PERGUNTAS = [
  'Colisão',
  'Danos da Natureza',
  'Incêndio',
  'Roubo',
  'Furto',
  'Vidros',
  'Perda Total',
  'Terceiro'
];

// Perguntas organizadas conforme planilha - COLISÃO, DANOS DA NATUREZA, INCÊNDIO
export const PERGUNTAS_COMITE: PerguntaComite[] = [
  // === ANÁLISE PRÉVIA ===
  {
    id: 'parecer_analista',
    pergunta: 'Parecer do Analista',
    tipo: 'select',
    opcoes: PARECERES_COMITE.map(p => p.value),
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'relato_analista',
    pergunta: 'Relato do Analista',
    tipo: 'textarea',
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'situacao_associado_ativo',
    pergunta: 'Situação do Associado Ativo',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'situacao_atual_veiculo',
    pergunta: 'Se não, qual a situação atual do veículo',
    tipo: 'text',
    obrigatoria: false,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'data_cadastro_associado',
    pergunta: 'Data de Cadastro do Associado',
    tipo: 'date',
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'assinatura_termos_condizem',
    pergunta: 'Assinatura dos Termos de Adesão, Vistoria e Acionamento condizem com assinatura da documentação do associado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'possui_boletos_vencidos',
    pergunta: 'Possui Boletos Vencidos',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'possui_coberturas_contratadas',
    pergunta: 'Possui Coberturas Contratadas',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'financiamento',
    pergunta: 'Financiamento',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'possui_acionamento_terceiros',
    pergunta: 'Possui Acionamento de Terceiros',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'placa_confere_cadastrada',
    pergunta: 'Placa de Documentação confere com Placa Cadastrada',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'datas_respeitam_prereq',
    pergunta: 'Data de Evento, Data de Comunicação de Evento e Data de Acionamento respeitam pré-requisito de tempo',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'possui_evento_anterior',
    pergunta: 'Associado Possui Evento Anterior',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'leilao_aluguel_chassi_remarcado',
    pergunta: 'Leilão / Aluguel / Chassi Remarcado / Benefício Tributário',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'enviado_fotos_evento',
    pergunta: 'Enviado Fotos do Evento',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'estado_pneus',
    pergunta: 'Estado dos Pneus',
    tipo: 'select',
    opcoes: ['BONS', 'REGULAR', 'RUIM'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 3,
    pesoPositivo: ['BONS'],
    pesoNegativo: ['RUIM'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total']
  },
  {
    id: 'houve_acionamento_assistencia',
    pergunta: 'Houve Acionamento Assistência 24 Horas',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'possui_protecao_outra_associacao',
    pergunta: 'Possui Proteção em Outra Associação',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_juridica',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'houve_comunicacao_policial',
    pergunta: 'Houve Comunicação Policial',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'monta',
    pergunta: 'Monta',
    tipo: 'select',
    opcoes: ['PEQUENA/NÃO REGISTRADO', 'MEDIA', 'GRANDE'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total']
  },
  {
    id: 'enviou_crocri',
    pergunta: 'Enviou Croqui',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'condutor_habilitado',
    pergunta: 'Condutor Habilitado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'habilitacao_valida',
    pergunta: 'Habilitação Válida',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'existe_parentesco_envolvidos',
    pergunta: 'Existe Parentesco entre os Envolvidos (Associado e Terceiro)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_juridica',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'veiculo_rebaixado',
    pergunta: 'Veículo Rebaixado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total']
  },
  {
    id: 'laudo_inmetro',
    pergunta: 'Caso Positivo, Existe Laudo INMETRO',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total']
  },

  // === ANÁLISE FINANCEIRA ===
  {
    id: 'tabela_fipe',
    pergunta: 'Tabela FIPE',
    tipo: 'valor',
    obrigatoria: true,
    categoria: 'ANÁLISE FINANCEIRA',
    autoPreenchivel: 'veiculo_valor_fipe',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'cota_participacao',
    pergunta: 'Cota de Participação',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'ANÁLISE FINANCEIRA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'valores_aberto_boletos',
    pergunta: 'Valores em Aberto (Boletos)',
    tipo: 'valor',
    obrigatoria: true,
    categoria: 'ANÁLISE FINANCEIRA',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'depreciacao_percentual',
    pergunta: '% Depreciação',
    tipo: 'valor',
    obrigatoria: false,
    categoria: 'ANÁLISE FINANCEIRA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'ipva_valor',
    pergunta: 'IPVA',
    tipo: 'valor',
    obrigatoria: false,
    categoria: 'ANÁLISE FINANCEIRA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'multas_valor',
    pergunta: 'Multas',
    tipo: 'valor',
    obrigatoria: false,
    categoria: 'ANÁLISE FINANCEIRA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'financiamento_valor',
    pergunta: 'Financiamento',
    tipo: 'valor',
    obrigatoria: false,
    categoria: 'ANÁLISE FINANCEIRA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'total_indenizar',
    pergunta: 'Total a Indenizar',
    tipo: 'valor',
    obrigatoria: false,
    categoria: 'ANÁLISE FINANCEIRA',
    tiposSinistro: ['Roubo', 'Furto']
  },

  // === ANÁLISE DOCUMENTAL ===
  {
    id: 'termo_acionamento',
    pergunta: 'Termo de Acionamento – Devidamente preenchido e assinado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'termo_subrogacao',
    pergunta: 'Termo de Sub-rogação – Devidamente preenchido e assinado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'termo_indenizacao_integral',
    pergunta: 'Termo de Cientificação de Indenização Integral',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Roubo', 'Furto', 'Perda Total']
  },
  {
    id: 'bo_obrigatorio',
    pergunta: 'Boletim de Ocorrência Policial Militar, Civil, Rodoviário, Bombeiros, etc. – Obrigatoriamente realizado na data do evento',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'pericias_laudos',
    pergunta: 'Perícias e laudos confeccionados por órgãos competentes. Caso o condutor tenha sido encaminhado para atendimento médico/hospitalar, providenciar ficha clínica',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'laudo_necroscopico',
    pergunta: 'Em caso de morte do condutor do veículo protegido, providenciar laudo necroscópico',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total']
  },
  {
    id: 'laudo_alcoometria',
    pergunta: 'Laudo de Alcoometria',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'atencao_juridica',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total']
  },
  {
    id: 'contrato_social_pj',
    pergunta: 'Cópia autenticada do Contrato Social ou Estatuto (na hipótese do proprietário ser pessoa jurídica)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'crlv_em_dia',
    pergunta: 'CRLV (Documento do Veículo) – Em dia com os pagamentos',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'cnh_condutor',
    pergunta: 'CNH do Condutor',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'cnh_associado',
    pergunta: 'CNH do Associado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'comprovante_endereco',
    pergunta: 'Comprovante de Endereço',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'fotos_local_avaria',
    pergunta: 'Fotos do local do evento e fotos do veículo mostrando claramente a avaria, contendo identificação (chassi e placa)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'procuracao_transferencia',
    pergunta: 'Procuração de Plenos Poderes para Transferência do Veículo (confeccionada em cartório)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Roubo', 'Furto', 'Perda Total']
  },
  {
    id: 'certidao_negativa_debitos',
    pergunta: 'Certidão Negativa - IPVA, DPVAT e Multas (quitados) – Na falta desta documentação todos os débitos serão descontados',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Roubo', 'Furto', 'Perda Total']
  },
  {
    id: 'manual_chaves',
    pergunta: 'Manual e Chaves do Veículo (incluir chaves reservas) – Na ausência, sua reposição poderá ser cobrada',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Roubo', 'Furto', 'Perda Total']
  },
  {
    id: 'nota_fiscal_0km',
    pergunta: 'Nota Fiscal de Compra do Veículo – Em caso de cobertura de 0KM',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Roubo', 'Furto', 'Perda Total']
  },
  {
    id: 'carta_saldo_devedor',
    pergunta: 'Carta de Saldo Devedor (para veículos financiados)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Roubo', 'Furto', 'Perda Total']
  },
  {
    id: 'termo_acionamento_vidros',
    pergunta: 'Termo de Acionamento de Vidros – Devidamente preenchido e assinado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Vidros']
  },
  {
    id: 'fotos_vidro_quebrado',
    pergunta: 'Fotos do vidro quebrado mostrando claramente a avaria, contendo identificação do veículo (chassi e placa)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE DOCUMENTAL',
    tiposSinistro: ['Vidros']
  },

  // === CHECKLIST PERGUNTAS DE CAUSALIDADE ===
  {
    id: 'estado_conservacao_veiculo',
    pergunta: 'Qual estado de conservação do veículo nas fotos',
    tipo: 'select',
    opcoes: ['BOM', 'RUIM', 'IRREGULAR', 'DETERIORADO'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 5,
    pesoPositivo: ['BOM'],
    pesoNegativo: ['RUIM', 'DETERIORADO'],
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'qtd_passageiros',
    pergunta: 'Quantos passageiros estavam no veículo no momento do evento',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'veiculo_manutencao_recente',
    pergunta: 'Veículo passou por manutenção recentemente',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total']
  },
  {
    id: 'indicio_embriaguez',
    pergunta: 'Houve indícios de embriaguez ou efeito de entorpecentes',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 10,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'houve_infracao_transito',
    pergunta: 'Houve infração de trânsito',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 5,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'dano_causado_carga',
    pergunta: 'Dano foi causado por carga transportada',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Vidros', 'Perda Total']
  },
  {
    id: 'evento_testemunhas',
    pergunta: 'Evento possui testemunhas',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'contato_testemunha',
    pergunta: 'Entrou em contato com alguma testemunha',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: false,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'relato_testemunhas',
    pergunta: 'Relato da(s) testemunha(s)',
    tipo: 'textarea',
    obrigatoria: false,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'local_possui_cameras',
    pergunta: 'Local possui câmeras (verificar Google Maps)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'associado_informou_cameras',
    pergunta: 'Associado informou que no local existia câmeras',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'fotos_frenagem_pista',
    pergunta: 'Fotos enviadas pelo associado apresentam frenagem na pista',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Perda Total', 'Terceiro']
  },
  {
    id: 'possivel_vandalismo',
    pergunta: 'Existe possível causa de vandalismo',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Vidros', 'Perda Total']
  },
  {
    id: 'frenagem_condiz_croqui',
    pergunta: 'Frenagem condiz com croqui enviado pelo associado',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 5,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'atencao_juridica',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Perda Total', 'Terceiro']
  },
  {
    id: 'estava_chovendo',
    pergunta: 'Estava chovendo no momento da colisão',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Perda Total', 'Terceiro']
  },
  {
    id: 'quebra_regras_regulamento',
    pergunta: 'Houve quebra de regras apresentadas no regulamento',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 10,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Perda Total', 'Terceiro']
  },
  {
    id: 'local_evento_maps',
    pergunta: 'Local do Evento (Google Maps)',
    tipo: 'mapa',
    obrigatoria: false,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'dinamica_condiz_local',
    pergunta: 'Dinâmica informada pelo associado condiz com o local do evento',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Perda Total', 'Terceiro']
  },
  {
    id: 'detalhe_colisao_associado',
    pergunta: 'Detalhe da colisão veículo associado',
    tipo: 'select',
    opcoes: ['FRONTAL DIREITA', 'FRONTAL ESQUERDA', 'LATERAL DIREITA', 'LATERAL ESQUERDA', 'TRASEIRA DIREITA', 'TRASEIRA ESQUERDA', 'DIAGONAL FRONTAL DIREITA', 'DIAGONAL FRONTAL ESQUERDA', 'DIAGONAL TRASEIRA DIREITA', 'DIAGONAL TRASEIRA ESQUERDA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Perda Total', 'Terceiro']
  },
  {
    id: 'detalhe_colisao_terceiro',
    pergunta: 'Detalhe da colisão veículo terceiro',
    tipo: 'select',
    opcoes: ['FRONTAL DIREITA', 'FRONTAL ESQUERDA', 'LATERAL DIREITA', 'LATERAL ESQUERDA', 'TRASEIRA DIREITA', 'TRASEIRA ESQUERDA', 'DIAGONAL FRONTAL DIREITA', 'DIAGONAL FRONTAL ESQUERDA', 'DIAGONAL TRASEIRA DIREITA', 'DIAGONAL TRASEIRA ESQUERDA'],
    obrigatoria: false,
    categoria: 'CHECKLIST CAUSALIDADE',
    tiposSinistro: ['Colisão', 'Perda Total', 'Terceiro']
  },
  {
    id: 'congruencia_colisao',
    pergunta: 'Congruência da colisão dos veículos (objeto) confere - (Congruência: altura, profundidade e gravidade do dano)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'relatos_conferem',
    pergunta: 'Relatos conferem',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'CHECKLIST CAUSALIDADE',
    peso: 10,
    pesoPositivo: ['SIM'],
    pesoNegativo: ['NÃO'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },

  // === RELATO ANALISTA CONCLUSÃO ===
  {
    id: 'divergencia_informacoes',
    pergunta: 'Existe divergência de informações (pré-abertura, abertura, B.O e croqui)',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    peso: 10,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'descricao_divergencia',
    pergunta: 'Caso sim, descreva abaixo',
    tipo: 'textarea',
    obrigatoria: false,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'danos_registrados_vistoria_previa',
    pergunta: 'Danos apresentados no evento foram registrados na vistoria prévia',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    peso: 10,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'qual_dano_registrado',
    pergunta: 'Caso sim, qual dano',
    tipo: 'text',
    obrigatoria: false,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'notificacao_avaria_preexistente',
    pergunta: 'Houve notificação de avaria preexistente',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'necessidade_sindicancia',
    pergunta: 'Necessidade de Sindicância',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO'],
    obrigatoria: true,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    peso: 10,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_juridica',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'situacao_evento',
    pergunta: 'Situação do Evento',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },
  {
    id: 'observacao_evento',
    pergunta: 'Observação sobre o Evento',
    tipo: 'textarea',
    obrigatoria: false,
    categoria: 'RELATO ANALISTA CONCLUSÃO',
    tiposSinistro: ['Colisão', 'Danos da Natureza', 'Incêndio', 'Roubo', 'Furto', 'Vidros', 'Perda Total', 'Terceiro']
  },

  // === PERGUNTAS ESPECÍFICAS ROUBO/FURTO ===
  {
    id: 'ipva_atraso',
    pergunta: 'IPVA em Atraso',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 5,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'atencao_andamento',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'multas_veiculo',
    pergunta: 'Multas',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'checktdo',
    pergunta: 'CheckTDO',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'veiculo_impedimento',
    pergunta: 'Veículo com Impedimento',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    peso: 10,
    pesoPositivo: ['NÃO'],
    pesoNegativo: ['SIM'],
    nivelAlerta: 'passivel_negativa',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'qual_impedimento',
    pergunta: 'Caso positivo, qual impedimento',
    tipo: 'text',
    obrigatoria: false,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'consulta_patio',
    pergunta: 'Consulta Pátio',
    tipo: 'select',
    opcoes: ['SIM', 'NÃO', 'NÃO SE APLICA'],
    obrigatoria: true,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Roubo', 'Furto']
  },
  {
    id: 'patios_pesquisados',
    pergunta: 'Pátios Pesquisados',
    tipo: 'text',
    obrigatoria: false,
    categoria: 'ANÁLISE PRÉVIA',
    tiposSinistro: ['Roubo', 'Furto']
  }
];

// Agrupar perguntas por categoria
export const CATEGORIAS_PERGUNTAS = PERGUNTAS_COMITE.reduce((acc, pergunta) => {
  if (!acc[pergunta.categoria]) {
    acc[pergunta.categoria] = [];
  }
  acc[pergunta.categoria].push(pergunta);
  return acc;
}, {} as Record<string, PerguntaComite[]>);

// Ordem das categorias
export const ORDEM_CATEGORIAS = [
  'ANÁLISE PRÉVIA',
  'ANÁLISE FINANCEIRA',
  'ANÁLISE DOCUMENTAL',
  'CHECKLIST CAUSALIDADE',
  'RELATO ANALISTA CONCLUSÃO'
];

// Filtrar perguntas por tipo de sinistro
export const filtrarPerguntasPorTipo = (tipoSinistro: string): PerguntaComite[] => {
  return PERGUNTAS_COMITE.filter(p => 
    !p.tiposSinistro || p.tiposSinistro.includes(tipoSinistro)
  );
};

// Agrupar perguntas filtradas por categoria
export const getCategoriasPerguntas = (tipoSinistro?: string) => {
  const perguntas = tipoSinistro ? filtrarPerguntasPorTipo(tipoSinistro) : PERGUNTAS_COMITE;
  
  return perguntas.reduce((acc, pergunta) => {
    if (!acc[pergunta.categoria]) {
      acc[pergunta.categoria] = [];
    }
    acc[pergunta.categoria].push(pergunta);
    return acc;
  }, {} as Record<string, PerguntaComite[]>);
};
