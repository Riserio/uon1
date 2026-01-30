import { now } from "@/utils/dateUtils";

/**
 * Próxima execução diária às 09:00 no horário de Brasília (America/Sao_Paulo).
 * Retorna um Date já no fuso de SP (igual ao restante do app).
 */
export function getNextDailyRunBrasilia(hour = 9, minute = 0): Date {
  const spNow = now();
  const next = new Date(spNow);
  next.setHours(hour, minute, 0, 0);

  if (spNow.getTime() <= next.getTime()) return next;

  next.setDate(next.getDate() + 1);
  return next;
}
