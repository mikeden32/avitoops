import type { AccessState, JobType, Plan } from "./db/schema";
import { PLAN_LIMITS } from "./plans";

const DAY = 24 * 60 * 60 * 1000;

export type SubscriptionGate = {
  status: "active" | "past_due" | "paused" | "canceled";
  currentPeriodEnd: Date;
};

export function workBlockReason(input: {
  subscription: SubscriptionGate | null;
  access: AccessState;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const sub = input.subscription;
  if (!sub) return "Нет активной подписки";
  if (sub.status === "paused") return "Сервис на паузе";
  if (sub.status === "canceled") return "Подписка отменена";
  if (sub.status === "past_due") {
    const graceEnd = sub.currentPeriodEnd.getTime() + 3 * DAY;
    if (now.getTime() > graceEnd) return "Оплата просрочена больше 3 дней";
  } else if (sub.status !== "active") {
    return "Подписка не активна";
  }
  if (input.access !== "green") return "Доступ временно на паузе";
  return null;
}

export function listingCap(plan: Plan) {
  return PLAN_LIMITS[plan];
}

export function promoBlockReason(input: {
  enabled: boolean;
  weekLimitRub: number;
  spentRub: number;
  depositRub: number;
  maxRub: number;
}): string | null {
  if (!input.enabled) return "Продвижение выключено";
  if (input.weekLimitRub <= 0) return "Недельный лимит не задан";
  if (input.depositRub <= 0) return "Депозит пуст";
  if (input.maxRub <= 0) return "Укажите сумму продвижения";
  const weekLeft = input.weekLimitRub - input.spentRub;
  if (input.spentRub >= input.weekLimitRub || weekLeft < input.maxRub) {
    return "Сумма выше недельного лимита";
  }
  if (input.depositRub < input.maxRub) return "Сумма выше остатка депозита";
  return null;
}

export function clientCanCreate(type: JobType) {
  return type === "publish" || type === "update" || type === "reply" || type === "promo";
}

export function isAccessState(value: string): value is AccessState {
  return value === "green" || value === "yellow" || value === "red";
}
