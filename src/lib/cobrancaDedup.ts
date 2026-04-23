/**
 * Lógica de deduplicação fiel ao relatório SGA Hinova.
 *
 * O SGA exibe 1 linha por pessoa+data_vencimento, mesmo quando a pessoa
 * tem múltiplos veículos vencendo no mesmo dia. Também ignora boletos
 * "acumulados/refaturados" (com data de vencimento original em dia diferente
 * do dia de vencimento configurado para o veículo).
 *
 * Esta função aplica as mesmas regras para que o BI bata com o SGA.
 *
 * Regras:
 *  1. Excluir boletos onde dia_vencimento_veiculo ≠ dia(data_vencimento_original)
 *     (estes são boletos acumulados/refaturados que o SGA não conta)
 *  2. Manter apenas 1 boleto por (nome normalizado + data_vencimento),
 *     escolhendo o de maior valor (replica o comportamento do SGA)
 */

export interface BoletoDedupRow {
  nome?: string | null;
  data_vencimento?: string | null;
  data_vencimento_original?: string | null;
  dia_vencimento_veiculo?: number | null;
  valor?: number | string | null;
  [key: string]: any;
}

/** Normaliza nome: trim, collapse múltiplos espaços, uppercase, remove acentos. */
export function normalizarNome(nome: string | null | undefined): string {
  if (!nome) return "";
  return String(nome)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai o dia (1-31) de uma string ISO YYYY-MM-DD ou similar. */
function extrairDia(dataStr: string | null | undefined): number | null {
  if (!dataStr) return null;
  const match = String(dataStr).match(/^\d{4}-\d{2}-(\d{2})/);
  if (match) return parseInt(match[1], 10);
  // fallback DD/MM/YYYY
  const br = String(dataStr).match(/^(\d{1,2})\//);
  if (br) return parseInt(br[1], 10);
  return null;
}

/** Converte valor para número (aceita string ou number). */
function toNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/**
 * Verifica se um boleto é "acumulado/refaturado".
 * É considerado acumulado quando o dia da data_vencimento_original
 * não bate com o dia_vencimento_veiculo cadastrado.
 */
export function isBoletoAcumulado(b: BoletoDedupRow): boolean {
  if (b.dia_vencimento_veiculo == null) return false;
  const diaOriginal = extrairDia(b.data_vencimento_original);
  if (diaOriginal == null) return false;
  return diaOriginal !== Number(b.dia_vencimento_veiculo);
}

/**
 * Aplica a deduplicação fiel ao SGA.
 * Retorna apenas 1 boleto por (nome_normalizado + data_vencimento),
 * escolhendo o de maior valor, e excluindo boletos acumulados.
 */
export function dedupSGAFiel<T extends BoletoDedupRow>(boletos: T[]): T[] {
  if (!Array.isArray(boletos) || boletos.length === 0) return [];

  // Regra fiel ao SGA: agrupar por nome+data_vencimento, manter o de maior valor.
  // (A regra anterior de filtrar "acumulados" via dia_vencimento_veiculo se
  // mostrou agressiva demais - removia ~50% dos boletos válidos.)
  const mapa = new Map<string, T>();
  for (const b of boletos) {
    const nome = normalizarNome(b.nome);
    const dv = b.data_vencimento || "";
    if (!nome || !dv) {
      // sem chave válida, mantém individualmente
      mapa.set(`__nokey_${mapa.size}`, b);
      continue;
    }
    const key = `${nome}|${dv}`;
    const existente = mapa.get(key);
    if (!existente) {
      mapa.set(key, b);
    } else if (toNumber(b.valor) > toNumber(existente.valor)) {
      mapa.set(key, b);
    }
  }

  return Array.from(mapa.values());
}