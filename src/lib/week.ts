const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function moscowWeekStart(date = new Date()): string {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
  const day = shifted.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  shifted.setUTCDate(shifted.getUTCDate() - diff);
  return shifted.toISOString().slice(0, 10);
}

export function moscowDayRange(date = new Date()) {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
  const key = shifted.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${key}T00:00:00.000Z`) - MOSCOW_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
