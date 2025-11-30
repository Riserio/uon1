// Perguntas do Comitê de Sinistros
export interface PerguntaComite {
  id: string;
  pergunta: string;
  tipo: 'select' | 'text' | 'date' | 'textarea';
  opcoes?: string[];
  obrigatoria: boolean;
  categoria: string;
  autoPreenchivel?: string; // Campo que pode ser preenchido automaticamente de outra fonte
}

export const PERGUNTAS_COMITE: PerguntaComite[] = [
  {
    id: 'parecer_analista',
    pergunta: '1. Parecer do Analista (Esta é uma informação baseada na opinião do analista, fica sob responsabilidade da associação a definição do evento).',
    tipo: 'select',
    opcoes: ['Aprovado', 'Negado', 'Sindicância', 'Necessário Análise Jurídica', 'Perícia Técnica'],
    obrigatoria: true,
    categoria: 'Parecer'
  },
  {
    id: 'relato_analista',
    pergunta: '2. Relato do Analista',
    tipo: 'textarea',
    obrigatoria: true,
    categoria: 'Parecer'
  },
  {
    id: 'nexo_causal',
    pergunta: '3. Evento possui nexo causal?',
    tipo: 'select',
    opcoes: ['Sim! Sem indícios de Fraude', 'Não! Há indícios de fraude.', 'Necessário sindicância.', 'Perícia técnica', 'Outro'],
    obrigatoria: true,
    categoria: 'Análise'
  },
  {
    id: 'passivo_ressarcimento',
    pergunta: '4. Passivo de Ressarcimento/Ação de ressarcimento?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Análise'
  },
  {
    id: 'tipo_acionamento',
    pergunta: '5. Tipo de acionamento',
    tipo: 'select',
    opcoes: ['Associado', 'Terceiro', 'Associado e Terceiro'],
    obrigatoria: true,
    categoria: 'Acionamento'
  },
  {
    id: 'nome_acionante',
    pergunta: '6. Nome do Acionante',
    tipo: 'select',
    opcoes: ['Próprio associado', 'Outro'],
    obrigatoria: true,
    categoria: 'Acionamento'
  },
  {
    id: 'nome_associado',
    pergunta: '7. Nome do Associado',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Dados do Associado',
    autoPreenchivel: 'cliente_nome'
  },
  {
    id: 'nome_condutor',
    pergunta: '8. Nome do condutor',
    tipo: 'select',
    opcoes: ['Próprio Associado', 'Outro'],
    obrigatoria: true,
    categoria: 'Condutor'
  },
  {
    id: 'condutor_habilitado',
    pergunta: '9. Condutor Habilitado?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Condutor'
  },
  {
    id: 'associado_habilitado',
    pergunta: '10. Associado Habilitado?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Associado'
  },
  {
    id: 'relacao_associado_condutor',
    pergunta: '11. Qual a relação do associado e do condutor?',
    tipo: 'text',
    obrigatoria: false,
    categoria: 'Condutor'
  },
  {
    id: 'placa',
    pergunta: '12. Placa',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Veículo',
    autoPreenchivel: 'veiculo_placa'
  },
  {
    id: 'protocolo_evento',
    pergunta: '13. Protocolo do Evento',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Evento'
  },
  {
    id: 'tipo_evento',
    pergunta: '14. Tipo do Evento',
    tipo: 'select',
    opcoes: ['Colisão', 'Vidros', 'Furto', 'Roubo', 'Danos da Natureza', 'Incêndio', 'Perda total'],
    obrigatoria: true,
    categoria: 'Evento',
    autoPreenchivel: 'tipo_sinistro'
  },
  {
    id: 'data_evento',
    pergunta: '15. Data do Evento',
    tipo: 'date',
    obrigatoria: true,
    categoria: 'Evento',
    autoPreenchivel: 'data_incidente'
  },
  {
    id: 'envolvimento',
    pergunta: '16. Envolvimento',
    tipo: 'select',
    opcoes: ['Causador', 'Vítima'],
    obrigatoria: true,
    categoria: 'Evento'
  },
  {
    id: 'numero_bo',
    pergunta: '17. Número do Boletim de Ocorrência',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Boletim de Ocorrência'
  },
  {
    id: 'data_hora_bo',
    pergunta: '18. Data e hora do Boletim de ocorrência',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Boletim de Ocorrência'
  },
  {
    id: 'data_primeiro_contato',
    pergunta: '19. Data do primeiro contato do associado',
    tipo: 'date',
    obrigatoria: true,
    categoria: 'Contato'
  },
  {
    id: 'datas_coerentes',
    pergunta: '20. Datas e horários informados pelo associado estão coerentes? (DATA/HORA EVENTO; DATA/HORA BO; DATA/HORA PRIMEIRO CONTATO)',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: false,
    categoria: 'Análise'
  },
  {
    id: 'divergencia_datas',
    pergunta: '21. Qual divergência encontrada acima?',
    tipo: 'textarea',
    obrigatoria: false,
    categoria: 'Análise'
  },
  {
    id: 'dias_apos_fato',
    pergunta: '22. Boletim foi registrado quantos dias após o fato?',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Boletim de Ocorrência'
  },
  {
    id: 'bo_presencial',
    pergunta: '23. BO Presencial?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Boletim de Ocorrência'
  },
  {
    id: 'relato_bo',
    pergunta: '24. Relato do Boletim de ocorrência',
    tipo: 'textarea',
    obrigatoria: true,
    categoria: 'Boletim de Ocorrência'
  },
  {
    id: 'houve_vitimas',
    pergunta: '25. Houve vítimas?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Evento'
  },
  {
    id: 'fotos_veiculo_associado',
    pergunta: '26. Fotos do veículo associado incluídas?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Documentação'
  },
  {
    id: 'total_veiculos_ativos',
    pergunta: '27. Total de veículos ATIVOS do associado na base',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Associado'
  },
  {
    id: 'evento_anterior',
    pergunta: '28. Associado possui evento anterior registrado na associação?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Histórico'
  },
  {
    id: 'evento_anterior_recuperado',
    pergunta: '29. Caso de evento anterior o veículo foi recuperado?',
    tipo: 'select',
    opcoes: ['Sim', 'Não! Houve negativa.', 'Não! Houve desistência por parte do associado.', 'Não! Houve acordo com associado.'],
    obrigatoria: true,
    categoria: 'Histórico'
  },
  {
    id: 'fotos_veiculo_terceiro',
    pergunta: '30. Fotos do veículo terceiro incluídas?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Terceiro'
  },
  {
    id: 'local_evento',
    pergunta: '31. Local do Evento',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Evento'
  },
  {
    id: 'sinalizacao_local',
    pergunta: '32. Possui sinalização no local do acidente?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Evento'
  },
  {
    id: 'observacao_local',
    pergunta: 'Observação sobre o local do evento',
    tipo: 'textarea',
    obrigatoria: true,
    categoria: 'Evento'
  },
  {
    id: 'status_veiculo_data_evento',
    pergunta: '33. Status do veículo na data do evento',
    tipo: 'select',
    opcoes: ['Ativo', 'Inadimplente'],
    obrigatoria: true,
    categoria: 'Veículo'
  },
  {
    id: 'data_cadastro',
    pergunta: '34. Data de cadastro',
    tipo: 'date',
    obrigatoria: true,
    categoria: 'Associado'
  },
  {
    id: 'regional',
    pergunta: '35. Regional',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Associado'
  },
  {
    id: 'boletos_aberto',
    pergunta: '36. Boletos em aberto',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Financeiro'
  },
  {
    id: 'historico_financeiro',
    pergunta: '37. Histórico financeiro do associado',
    tipo: 'select',
    opcoes: ['Associado paga os boletos em dia.', 'Associado sempre paga os boletos em atraso.', 'Não se aplica (terceiro)'],
    obrigatoria: true,
    categoria: 'Financeiro'
  },
  {
    id: 'consulta_sbl',
    pergunta: '38. Consulta veículos em Outras associações (SBL) - SGA: MENU 7.14.',
    tipo: 'select',
    opcoes: ['Ativo em outra base', 'Outro status diferente de ativo.', 'Não consta.'],
    obrigatoria: true,
    categoria: 'Consultas'
  },
  {
    id: 'sbl_caso_ativo',
    pergunta: 'Caso ativo informar o que foi encontrado.',
    tipo: 'textarea',
    obrigatoria: false,
    categoria: 'Consultas'
  },
  {
    id: 'ultimo_vencimento_pagamento',
    pergunta: '39. Informar último vencimento de boleto última data de pagamento. Exemplo: Vencido em 00/00/0000 - pago em 00/00/0000.',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Financeiro'
  },
  {
    id: 'marca_modelo',
    pergunta: '40. Marca/Modelo do veículo',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Veículo',
    autoPreenchivel: 'veiculo_marca_modelo'
  },
  {
    id: 'ano_fabricacao',
    pergunta: '41. Ano de Fabricação',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Veículo',
    autoPreenchivel: 'veiculo_ano'
  },
  {
    id: 'cota_participacao',
    pergunta: '42. Cota de participação',
    tipo: 'text',
    obrigatoria: true,
    categoria: 'Financeiro'
  },
  {
    id: 'passivo_negativa',
    pergunta: '43. Passivo de Negativa',
    tipo: 'select',
    opcoes: ['Sim', 'Não', 'A definir'],
    obrigatoria: true,
    categoria: 'Análise'
  },
  {
    id: 'motivo_negativa',
    pergunta: '44. Caso passivo de negativa explicar o motivo.',
    tipo: 'textarea',
    obrigatoria: true,
    categoria: 'Análise'
  },
  {
    id: 'cnh_vencida',
    pergunta: '45. CNH Vencida',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Documentação'
  },
  {
    id: 'data_vencimento_cnh',
    pergunta: '46. Data de vencimento da CNH',
    tipo: 'date',
    obrigatoria: true,
    categoria: 'Documentação'
  },
  {
    id: 'possui_tacografo',
    pergunta: '47. Possui Tacógrafo?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Veículo'
  },
  {
    id: 'possui_rastreador',
    pergunta: '48. Possui rastreador?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Veículo'
  },
  {
    id: 'localizacao_rastreador_bo',
    pergunta: '49. Caso possua rastreador a localização bate com o que consta no boletim de ocorrência?',
    tipo: 'textarea',
    obrigatoria: true,
    categoria: 'Veículo'
  },
  {
    id: 'contato_assistencia',
    pergunta: '50. Contato com a assistência?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Assistência'
  },
  {
    id: 'data_contato_assistencia',
    pergunta: '51. Data do contato com assistência',
    tipo: 'date',
    obrigatoria: true,
    categoria: 'Assistência'
  },
  {
    id: 'atendimento_terceiro',
    pergunta: '52. Atendimento a Terceiro?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Terceiro'
  },
  {
    id: 'dados_terceiro',
    pergunta: '53. Nome do terceiro / Contato do terceiro / Placa do terceiro / Marca/Modelo',
    tipo: 'textarea',
    obrigatoria: false,
    categoria: 'Terceiro'
  },
  {
    id: 'analise_vistoria_previa',
    pergunta: '54. Análise da vistoria Prévia',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Vistoria'
  },
  {
    id: 'avaria_pre_existente',
    pergunta: '55. Veículo possui avaria pré existente?',
    tipo: 'select',
    opcoes: ['Sim', 'Não', 'Não se aplica'],
    obrigatoria: true,
    categoria: 'Vistoria'
  },
  {
    id: 'irregularidade_constatada',
    pergunta: '56. Constatado irregularidade?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Vistoria'
  },
  {
    id: 'veiculo_multas',
    pergunta: '57. Veículo possui multas?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Veículo'
  },
  {
    id: 'multas_relacao_evento',
    pergunta: '58. Caso possua multas alguma multa pode ter relação com o evento. Ex: Excesso de velocidade.',
    tipo: 'textarea',
    obrigatoria: true,
    categoria: 'Veículo'
  },
  {
    id: 'comunicacao_venda',
    pergunta: '59. Veículo possui comunicação de venda?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: false,
    categoria: 'Veículo'
  },
  {
    id: 'monta_bo',
    pergunta: '60. Monta registrada no B.O',
    tipo: 'select',
    opcoes: ['Pequena Monta', 'Média Monta', 'Grande Monta', 'Não se aplica', 'Outro'],
    obrigatoria: true,
    categoria: 'Análise'
  },
  {
    id: 'contato_ligacao_associado',
    pergunta: '61. Foi feito contato por ligação com o associado?',
    tipo: 'select',
    opcoes: ['Sim', 'Não'],
    obrigatoria: true,
    categoria: 'Entrevista'
  },
  {
    id: 'sentimento_entrevista',
    pergunta: '62. Qual seu sentimento ao fazer a entrevista com associado?',
    tipo: 'select',
    opcoes: [
      'Foi claro e objetivo, não mostrou dúvidas sobre o ocorrido.',
      'Associado foi claro porém demonstrou alguma dúvida sobre o ocorrido.',
      'Associado demonstrou insegurança ao responder sobre o ocorrido.',
      'Associado estava ligeiramente nervoso ao responder sobre o ocorrido.',
      'Associado estava extremamente nervoso e inseguro sobre o ocorrido.',
      'Não foi feito contato com associado'
    ],
    obrigatoria: true,
    categoria: 'Entrevista'
  },
  {
    id: 'localizacao_googlemaps',
    pergunta: '63. Incluir localização do evento no Google Maps',
    tipo: 'text',
    obrigatoria: false,
    categoria: 'Evento'
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

// Ordem das categorias para exibição
export const ORDEM_CATEGORIAS = [
  'Parecer',
  'Análise',
  'Acionamento',
  'Dados do Associado',
  'Condutor',
  'Associado',
  'Veículo',
  'Evento',
  'Boletim de Ocorrência',
  'Contato',
  'Histórico',
  'Terceiro',
  'Financeiro',
  'Consultas',
  'Documentação',
  'Assistência',
  'Vistoria',
  'Entrevista'
];
