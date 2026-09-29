export function formatRub(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

const listingLabels: Record<string, string> = {
  draft: "Черновик",
  queued: "В работе",
  publishing: "В работе",
  live: "Опубликовано",
  error: "Ошибка",
  paused: "Пауза",
};

const jobLabels: Record<string, string> = {
  queued: "В очереди",
  running: "Выполняется",
  done: "Готово",
  failed: "Ошибка",
  canceled: "Отменено",
};

const subLabels: Record<string, string> = {
  active: "Активна",
  past_due: "Ожидает оплату",
  paused: "Пауза",
  canceled: "Отменена",
};

export function listingStatusLabel(status: string) {
  return listingLabels[status] ?? status;
}

export function jobStatusLabel(status: string) {
  return jobLabels[status] ?? status;
}

export function subscriptionStatusLabel(status: string) {
  return subLabels[status] ?? status;
}

export function accessLabel(state: string) {
  return state === "green" ? "Доступ в порядке" : "Временно на паузе";
}
