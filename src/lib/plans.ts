import type { Plan } from "./db/schema";

/**
 * Себестоимость на сентябрь 2026, в рублях на клиента в месяц.
 * Канал: индивидуальный LTE-порт ~2 500 ₽ плюс 500 ₽ запаса на замену. Один канал на аккаунт.
 * Команда — агенты Grok, не штат людей. Ставка grok-4.6 при коротком контексте: $2 вход и $6 выход за 1 млн.
 * Смесь агента 85% вход / 15% выход = $2,60 за 1 млн. Курс плана 95 ₽/$ → 250 ₽ за 1 млн.
 * Объём: около 150 тыс. токенов на задачу (несколько шагов, контекст короче 200 тыс., двойной тариф не включается).
 * Цена = себестоимость / 0,55, полка с запасом около 45%.
 */
export const COST_RATES = {
  accessChannelRub: 3000,
  tokenRubPerMillion: 250,
  platformRub: 200,
} as const;

export const PLAN_COST: Record<Plan, { jobs: number; tokenMillions: number; platformRub: number }> = {
  start: { jobs: 25, tokenMillions: 4, platformRub: 200 },
  growth: { jobs: 50, tokenMillions: 7.5, platformRub: 200 },
  business: { jobs: 80, tokenMillions: 12, platformRub: 200 },
  scale: { jobs: 140, tokenMillions: 21, platformRub: 300 },
};

export function accessCostRub() {
  return COST_RATES.accessChannelRub;
}

export function tokenCostRub(plan: Plan) {
  return Math.round(PLAN_COST[plan].tokenMillions * COST_RATES.tokenRubPerMillion);
}

export function platformCostRub(plan: Plan) {
  return PLAN_COST[plan].platformRub;
}

export function directCostRub(plan: Plan) {
  return accessCostRub() + tokenCostRub(plan) + platformCostRub(plan);
}

export const DAILY_QUOTA: Record<
  Plan,
  { publish: number; update: number; promo: number; replies: number }
> = {
  start: { publish: 3, update: 3, promo: 3, replies: 30 },
  growth: { publish: 6, update: 6, promo: 6, replies: 60 },
  business: { publish: 10, update: 10, promo: 10, replies: 120 },
  scale: { publish: 20, update: 20, promo: 20, replies: 200 },
};

export const PLAN_PRICES: Record<Plan, number> = {
  start: 7900,
  growth: 9500,
  business: 11500,
  scale: 15900,
};

export const PLANS: Record<
  Plan,
  { id: Plan; title: string; priceRub: number; hint: string; points: string[] }
> = {
  start: {
    id: "start",
    title: "Старт",
    priceRub: PLAN_PRICES.start,
    hint: "Три новых объявления каждый день",
    points: [
      "3 объявления в день",
      "3 правки в день",
      "Продвижение до 3 объявлений в день, деньги с депозита",
      "Ответы покупателям по вашим правилам",
      "Анкету заполняете сами",
    ],
  },
  growth: {
    id: "growth",
    title: "Рост",
    priceRub: PLAN_PRICES.growth,
    hint: "Шесть новых объявлений каждый день",
    points: [
      "6 объявлений в день",
      "6 правок в день",
      "Продвижение до 6 объявлений в день, деньги с депозита",
      "Ответы покупателям по вашим правилам",
      "Анкету заполняем по вашим ответам",
    ],
  },
  business: {
    id: "business",
    title: "Бизнес",
    priceRub: PLAN_PRICES.business,
    hint: "Десять новых объявлений каждый день",
    points: [
      "10 объявлений в день",
      "10 правок в день",
      "Продвижение до 10 объявлений в день, деньги с депозита",
      "Ответы покупателям по вашим правилам",
      "Анкету заполняем по вашим ответам",
    ],
  },
  scale: {
    id: "scale",
    title: "Сеть",
    priceRub: PLAN_PRICES.scale,
    hint: "Двадцать новых объявлений каждый день",
    points: [
      "20 объявлений в день",
      "20 правок в день",
      "Продвижение до 20 объявлений в день, деньги с депозита",
      "Ответы покупателям по вашим правилам",
      "Анкету заполняем по вашим ответам",
    ],
  },
};

for (const plan of Object.keys(PLAN_PRICES) as Plan[]) {
  if (PLAN_PRICES[plan] <= directCostRub(plan)) {
    throw new Error(`Тариф ${plan} не покрывает себестоимость`);
  }
}

export const LOW_DEPOSIT_RUB = Number(process.env.LOW_DEPOSIT_RUB ?? 500);

export function isPlan(value: string): value is Plan {
  return value === "start" || value === "growth" || value === "business" || value === "scale";
}

export function planTitle(plan: string | null | undefined) {
  if (plan && isPlan(plan)) return PLANS[plan].title;
  return "не выбран";
}

export function agentFillsProfile(plan: string | null | undefined) {
  return plan === "growth" || plan === "business" || plan === "scale";
}
