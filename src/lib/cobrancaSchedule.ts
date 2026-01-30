import { now } from "@/utils/dateUtils";

/**
 * Calcula a próxima execução diária no horário de Brasília.
 *
 * @param timeStr Formato "HH:mm:ss" ou "HH:mm" (default "09:00:00")
 * @returns Date já no fuso de SP (America/Sao_Paulo)
 */
export function getNextDailyRunBrasilia(timeStr: string | null = "09:00:00"): Date {
  const [hh, mm] = (timeStr ?? "09:00:00").split(":").map(Number);
  const hour = isNaN(hh) ? 9 : hh;
  const minute = isNaN(mm) ? 0 : mm;

  const spNow = now();
  const next = new Date(spNow);
  next.setHours(hour, minute, 0, 0);

  // Se já passou hoje, vai para amanhã
  if (spNow.getTime() > next.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Converte horário de Brasília (HH:mm) para cron UTC.
 * GitHub Actions opera em UTC; Brasília = UTC-3.
 */
export function brasiliaToCronUTC(timeStr: string | null): string {
  const [hh, mm] = (timeStr ?? "09:00").split(":").map(Number);
  const h = isNaN(hh) ? 9 : hh;
  const m = isNaN(mm) ? 0 : mm;
  const utcHour = (h + 3) % 24; // UTC = Brasília + 3
  return `${m} ${utcHour} * * *`; // cron: "M H * * *" (every day)
}

/**
 * Retorna texto legível do cron UTC.
 */
export function cronUTCLabel(timeStr: string | null): string {
  const [hh, mm] = (timeStr ?? "09:00").split(":").map(Number);
  const h = isNaN(hh) ? 9 : hh;
  const m = isNaN(mm) ? 0 : mm;
  const utcHour = (h + 3) % 24;
  return `${String(utcHour).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
}

/**
 * Contagem regressiva até Date (Brasília) em formato "Xh Ym".
 */
export function countdown(target: Date): string {
  const spNow = now();
  let diff = target.getTime() - spNow.getTime();
  if (diff <= 0) return "em instantes";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  diff %= 1000 * 60 * 60;
  const mins = Math.floor(diff / (1000 * 60));

  if (hours > 0) {
    return `em ${hours}h ${mins}m`;
  }
  return `em ${mins}m`;
}
