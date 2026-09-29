const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function moscowWeekStart(date = new Date()): string {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
  const day = shifted.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  shifted.setUTCDate(shifted.getUTCDate() - diff);
  return shifted.toISOString().slice(0, 10);
}
