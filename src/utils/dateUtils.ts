import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Valida se uma data é válida e está dentro de um range razoável
 * Previne erros de "timezone displacement out of range"
 */
function isValidDate(date: Date): boolean {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return false;
  }
  // Verificar se o ano está em um range razoável (1900-2100)
  const year = date.getFullYear();
  return year >= 1900 && year <= 2100;
}

/**
 * Cria um Date seguro, retornando null se inválido
 */
function safeParseDate(date: Date | string): Date | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (!isValidDate(dateObj)) {
      console.warn('Data inválida detectada:', date);
      return null;
    }
    return dateObj;
  } catch {
    console.warn('Erro ao parsear data:', date);
    return null;
  }
}

/**
 * Converte data local para UTC mantendo o horário visual
 * Usado ao SALVAR dados no banco
 */
export function toUTC(date: Date | string): string {
  const dateObj = safeParseDate(date);
  if (!dateObj) {
    return new Date().toISOString(); // Fallback para data atual
  }
  try {
    return fromZonedTime(dateObj, TIMEZONE).toISOString();
  } catch (error) {
    console.warn('Erro ao converter para UTC:', error);
    return new Date().toISOString();
  }
}

/**
 * Converte data UTC para timezone local
 * Usado ao EXIBIR dados do banco
 */
export function fromUTC(date: Date | string): Date {
  const dateObj = safeParseDate(date);
  if (!dateObj) {
    return new Date(); // Fallback para data atual
  }
  try {
    return toZonedTime(dateObj, TIMEZONE);
  } catch (error) {
    console.warn('Erro ao converter de UTC:', error);
    return new Date();
  }
}

/**
 * Formata data para datetime-local input (sem conversão de timezone)
 */
export function toDateTimeLocal(date: Date | string): string {
  const dateObj = safeParseDate(date);
  if (!dateObj) {
    return ''; // Retorna vazio se data inválida
  }
  
  try {
    const zonedDate = toZonedTime(dateObj, TIMEZONE);
    
    const year = zonedDate.getFullYear();
    const month = String(zonedDate.getMonth() + 1).padStart(2, '0');
    const day = String(zonedDate.getDate()).padStart(2, '0');
    const hours = String(zonedDate.getHours()).padStart(2, '0');
    const minutes = String(zonedDate.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    console.warn('Erro ao formatar data:', error);
    return '';
  }
}

/**
 * Converte valor de datetime-local input para Date
 */
export function fromDateTimeLocal(value: string): Date {
  // datetime-local retorna no formato: "YYYY-MM-DDTHH:mm"
  // Interpretamos como timezone local (São Paulo)
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Cria data no timezone local
  return new Date(year, month - 1, day, hours, minutes);
}

/**
 * Retorna data/hora atual no timezone de São Paulo
 */
export function now(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}
