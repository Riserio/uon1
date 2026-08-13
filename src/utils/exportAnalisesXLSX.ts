import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

/**
 * Planilha de análises de sinistro: uma linha por placa, uma coluna por pergunta.
 *
 * O cruzamento pesado (respostas jsonb chaveadas por ID da pergunta x cadastro
 * de perguntas) acontece na RPC relatorio_analises_sinistro. Aqui só montamos o
 * arquivo — assim não buscamos o questionário inteiro uma vez por sinistro.
 *
 * O cabeçalho tem duas linhas: a primeira agrupa por categoria, a segunda traz
 * a pergunta. Perguntas obrigatórias vêm marcadas com asterisco.
 */

type Pergunta = {
  id: string;
  pergunta: string;
  categoria: string;
  obrigatoria: boolean;
};

type Linha = {
  placa: string;
  associado: string;
  associacao: string;
  tipo_sinistro: string;
  data_evento: string | null;
  atendimento: number | null;
  veiculo: string | null;
  valor_fipe: number | null;
  parecer_analista: string | null;
  parecer_associacao: string | null;
  valor_aprovado: number | null;
  finalizado: boolean | null;
  entrevista_data: string | null;
  respostas: Record<string, string>;
};

export interface FiltrosAnalises {
  corretoraId?: string | null;
  tipoSinistro?: string | null;
  desde?: string | null;
}

const dataBR = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

export async function exportAnalisesXLSX(filtros: FiltrosAnalises = {}): Promise<number> {
  const { data, error } = await supabase.rpc('relatorio_analises_sinistro', {
    p_corretora_id: filtros.corretoraId ?? null,
    p_tipo_sinistro: filtros.tipoSinistro ?? null,
    p_desde: filtros.desde ?? null,
  });
  if (error) throw error;

  const payload = (data ?? {}) as { perguntas?: Pergunta[]; linhas?: Linha[] };
  const perguntas = payload.perguntas ?? [];
  const linhas = payload.linhas ?? [];

  if (linhas.length === 0) {
    throw new Error('Nenhuma análise encontrada para os filtros informados.');
  }

  const colunasFixas = [
    'Placa',
    'Associado',
    'Associação',
    'Tipo de sinistro',
    'Data do evento',
    'Atendimento',
    'Veículo',
    'Valor FIPE',
    'Parecer do analista',
    'Parecer da associação',
    'Valor aprovado',
    'Finalizado',
    'Última atualização',
  ];

  const linhaCategorias = [
    ...colunasFixas.map(() => ''),
    ...perguntas.map((p) => p.categoria),
  ];

  const linhaPerguntas = [
    ...colunasFixas,
    ...perguntas.map((p) => (p.obrigatoria ? p.pergunta + ' *' : p.pergunta)),
  ];

  const corpo = linhas.map((l) => [
    l.placa,
    l.associado,
    l.associacao,
    l.tipo_sinistro,
    dataBR(l.data_evento),
    l.atendimento ?? '',
    l.veiculo ?? '',
    l.valor_fipe ?? '',
    l.parecer_analista ?? '',
    l.parecer_associacao ?? '',
    l.valor_aprovado ?? '',
    l.finalizado ? 'Sim' : 'Não',
    dataBR(l.entrevista_data),
    ...perguntas.map((p) => l.respostas?.[p.id] ?? ''),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([linhaCategorias, linhaPerguntas, ...corpo]);

  // Mescla o cabeçalho de categoria sobre as colunas da mesma categoria.
  const merges: XLSX.Range[] = [];
  let inicio = colunasFixas.length;
  for (let i = 1; i <= perguntas.length; i++) {
    const atual = perguntas[i]?.categoria;
    const anterior = perguntas[i - 1]?.categoria;
    if (atual !== anterior) {
      const fim = colunasFixas.length + i - 1;
      if (fim > inicio) merges.push({ s: { r: 0, c: inicio }, e: { r: 0, c: fim } });
      inicio = colunasFixas.length + i;
    }
  }
  ws['!merges'] = merges;

  ws['!cols'] = [
    { wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
    { wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 20 }, { wch: 20 },
    { wch: 14 }, { wch: 11 }, { wch: 16 },
    ...perguntas.map(() => ({ wch: 26 })),
  ];

  // Congela as colunas de identificação e as duas linhas de cabeçalho — sem
  // isso a planilha fica impossível de ler com 69 colunas de perguntas.
  ws['!freeze'] = { xSplit: 1, ySplit: 2 } as unknown as XLSX.Range;

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: false }] };
  XLSX.utils.book_append_sheet(wb, ws, 'Análises');

  const hoje = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `analises-sinistro-${hoje}.xlsx`);

  return linhas.length;
}
