/**
 * Formata um número como moeda brasileira (R$)
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formata um número com separadores de milhares
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formata um número como porcentagem com 4 dígitos (00,00%)
 * O valor deve ser um decimal (0.5 = 50%, 0.1234 = 12,34%)
 * Se o valor já estiver em formato de porcentagem (>1 ou <-1 e não é fração válida), 
 * não multiplica por 100
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '00,00%';
  
  // Se o valor absoluto for maior que 1 e menor que 100, assumimos que já é porcentagem
  // Por exemplo: 1.48 significa 1.48%, não 148%
  // Valores como 0.5 (50%) ou 0.0148 (1.48%) serão multiplicados por 100
  let percentValue: number;
  
  // Se o valor já parecer ser uma porcentagem (entre 0 e 100 em módulo, exceto frações válidas)
  // valores típicos de fração decimal: 0.xxxx
  // valores típicos de porcentagem: x.xx ou xx.xx
  if (Math.abs(value) > 1 && Math.abs(value) < 100) {
    // Já é porcentagem, não multiplica
    percentValue = value;
  } else if (Math.abs(value) >= 100) {
    // Valor muito alto - provavelmente já é porcentagem mal formatada ou erro
    percentValue = value;
  } else {
    // Valor entre -1 e 1 - é uma fração, multiplica por 100
    percentValue = value * 100;
  }
  
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(percentValue) + '%';
}

/**
 * Calcula porcentagem de forma segura (evita divisão por zero)
 * Retorna valor decimal (0.5 = 50%)
 */
export function calcPercent(numerator: number | null | undefined, denominator: number | null | undefined): number {
  const num = numerator || 0;
  const den = denominator || 0;
  if (den === 0) return 0;
  return num / den;
}
