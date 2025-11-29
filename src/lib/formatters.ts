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
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '00,00%';
  
  const percentValue = value * 100;
  
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
