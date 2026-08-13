/**
 * Máscaras de digitação dos formulários de sinistro.
 *
 * As perguntas são cadastradas pelo usuário e só têm tipo_campo genérico
 * (text, valor, date...). Para não exigir recadastro de 69 perguntas, a
 * máscara é inferida do enunciado: pergunta que fala em placa recebe máscara
 * de placa, em CPF recebe CPF, e assim por diante. Se nada casar, o campo
 * segue livre — inferir errado seria pior que não mascarar.
 */

export type TipoMascara =
  | 'moeda'
  | 'placa'
  | 'cpf'
  | 'cnpj'
  | 'telefone'
  | 'cep'
  | 'quilometragem'
  | 'inteiro'
  | 'livre';

const so = (v: string) => v.replace(/\D/g, '');

/** R$ 1.234,56 — digitação da direita para a esquerda, como calculadora. */
export function mascaraMoeda(valor: string): string {
  const d = so(valor);
  if (!d) return '';
  const n = Number(d) / 100;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/** Converte o texto mascarado de volta para número. */
export function moedaParaNumero(valor: string): number {
  const d = so(valor);
  return d ? Number(d) / 100 : 0;
}

/** ABC1D23 (Mercosul) ou ABC1234 (antiga). */
export function mascaraPlaca(valor: string): string {
  const v = valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  if (v.length <= 3) return v;
  return v.slice(0, 3) + '-' + v.slice(3);
}

export function mascaraCPF(valor: string): string {
  const d = so(valor).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function mascaraCNPJ(valor: string): string {
  const d = so(valor).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function mascaraTelefone(valor: string): string {
  const d = so(valor).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function mascaraCEP(valor: string): string {
  return so(valor).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

export function mascaraQuilometragem(valor: string): string {
  const d = so(valor);
  if (!d) return '';
  return Number(d).toLocaleString('pt-BR') + ' km';
}

export function mascaraInteiro(valor: string): string {
  return so(valor);
}

const REGRAS: { teste: RegExp; mascara: TipoMascara }[] = [
  { teste: /placa/i, mascara: 'placa' },
  { teste: /\bcnpj\b/i, mascara: 'cnpj' },
  { teste: /\bcpf\b/i, mascara: 'cpf' },
  { teste: /telefone|celular|whatsapp|contato tel/i, mascara: 'telefone' },
  { teste: /\bcep\b/i, mascara: 'cep' },
  { teste: /quilometragem|hodômetro|hodometro|\bkm\b/i, mascara: 'quilometragem' },
  { teste: /quantos|quantidade|número de|numero de/i, mascara: 'inteiro' },
];

/**
 * Descobre a máscara a partir do tipo do campo e do enunciado da pergunta.
 * tipo_campo 'valor' sempre vira moeda; o resto depende do texto.
 */
export function inferirMascara(tipoCampo: string, enunciado: string): TipoMascara {
  if (tipoCampo === 'valor') return 'moeda';
  if (tipoCampo !== 'text' && tipoCampo !== 'textarea') return 'livre';
  const regra = REGRAS.find((r) => r.teste.test(enunciado));
  return regra ? regra.mascara : 'livre';
}

export function aplicarMascara(mascara: TipoMascara, valor: string): string {
  switch (mascara) {
    case 'moeda':
      return mascaraMoeda(valor);
    case 'placa':
      return mascaraPlaca(valor);
    case 'cpf':
      return mascaraCPF(valor);
    case 'cnpj':
      return mascaraCNPJ(valor);
    case 'telefone':
      return mascaraTelefone(valor);
    case 'cep':
      return mascaraCEP(valor);
    case 'quilometragem':
      return mascaraQuilometragem(valor);
    case 'inteiro':
      return mascaraInteiro(valor);
    default:
      return valor;
  }
}

/** Texto de apoio no campo, para a pessoa saber o formato esperado. */
export function placeholderDa(mascara: TipoMascara): string {
  switch (mascara) {
    case 'moeda':
      return 'R$ 0,00';
    case 'placa':
      return 'ABC-1D23';
    case 'cpf':
      return '000.000.000-00';
    case 'cnpj':
      return '00.000.000/0000-00';
    case 'telefone':
      return '(00) 00000-0000';
    case 'cep':
      return '00000-000';
    case 'quilometragem':
      return '0 km';
    case 'inteiro':
      return '0';
    default:
      return 'Digite...';
  }
}
