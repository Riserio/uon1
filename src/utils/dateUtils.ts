import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Converte data local para UTC mantendo o horário visual
 * Usado ao SALVAR dados no banco
 */
export function toUTC(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return fromZonedTime(dateObj, TIMEZONE).toISOString();
}

/**
 * Converte data UTC para timezone local
 * Usado ao EXIBIR dados do banco
 */
export function fromUTC(date: Date | string): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return toZonedTime(dateObj, TIMEZONE);
}

/**
 * Formata data para datetime-local input (sem conversão de timezone)
 */
export function toDateTimeLocal(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const zonedDate = toZonedTime(dateObj, TIMEZONE);
  
  const year = zonedDate.getFullYear();
  const month = String(zonedDate.getMonth() + 1).padStart(2, '0');
  const day = String(zonedDate.getDate()).padStart(2, '0');
  const hours = String(zonedDate.getHours()).padStart(2, '0');
  const minutes = String(zonedDate.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
