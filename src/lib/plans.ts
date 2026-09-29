import type { Plan } from "./db/schema";

export const PLAN_LIMITS: Record<Plan, number> = {
  start: 3,
  business: 10,
};

export const PLAN_PRICES: Record<Plan, number> = {
  start: 4900,
  business: 9900,
};

export const PLANS: Record<
  Plan,
  { id: Plan; title: string; priceRub: number; listings: number; points: string[] }
> = {
  start: {
    id: "start",
    title: "Старт",
    priceRub: 4900,
    listings: 3,
    points: [
      "До 3 объявлений",
      "Ответы в чатах",
      "Статус в кабинете",
      "Реклама Авито — отдельно, с депозита",
    ],
  },
  business: {
    id: "business",
    title: "Бизнес",
    priceRub: 9900,
    listings: 10,
    points: [
      "До 10 объявлений",
      "Эконом-продвижение в лимите",
      "Выделенный канал доступа",
      "Еженедельный отчёт",
    ],
  },
};

export const LOW_DEPOSIT_RUB = Number(process.env.LOW_DEPOSIT_RUB ?? 500);

export function isPlan(value: string): value is Plan {
  return value === "start" || value === "business";
}
