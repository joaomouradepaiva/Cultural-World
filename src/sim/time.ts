// Calendário interno. t = minutos de jogo desde o início. Dia 0 é uma sexta-feira.

export const MIN_PER_DAY = 1440;
const WEEKDAY_OFFSET = 4; // dia 0 = sexta (0 = segunda)

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function dayOf(t: number): number {
  return Math.floor(t / MIN_PER_DAY);
}

export function minuteOfDay(t: number): number {
  return ((t % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

export function hourOf(t: number): number {
  return Math.floor(minuteOfDay(t) / 60);
}

/** 0 = segunda ... 6 = domingo */
export function weekdayOf(t: number): number {
  return (dayOf(t) + WEEKDAY_OFFSET) % 7;
}

export function weekOf(t: number): number {
  return Math.floor((dayOf(t) + WEEKDAY_OFFSET) / 7);
}

/** Meses simplificados de 30 dias, começando em Março do Ano 1. */
export function monthOf(t: number): { month: number; year: number; dayOfMonth: number } {
  const d = dayOf(t);
  const m = Math.floor(d / 30) + 2;
  return { month: m % 12, year: 1 + Math.floor(m / 12), dayOfMonth: (d % 30) + 1 };
}

export function at(day: number, hour: number, minute = 0): number {
  return day * MIN_PER_DAY + hour * 60 + minute;
}

export function fmtClock(t: number): string {
  const m = Math.floor(minuteOfDay(t));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function fmtDate(t: number): string {
  const { month, dayOfMonth, year } = monthOf(t);
  return `${WEEKDAYS_SHORT[weekdayOf(t)]} ${dayOfMonth} ${MONTHS[month]} · Ano ${year}`;
}

export function fmtDayShort(t: number): string {
  const { month, dayOfMonth } = monthOf(t);
  return `${WEEKDAYS_SHORT[weekdayOf(t)]} ${dayOfMonth} ${MONTHS[month]}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Horas de funcionamento: 10:00 – 02:00 */
export function isOpenHours(t: number, openHour: number, closeHour: number): boolean {
  const h = hourOf(t);
  return closeHour < openHour ? h >= openHour || h < closeHour : h >= openHour && h < closeHour;
}
