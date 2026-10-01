import { formatRub } from "./format";
import { DAILY_QUOTA, PLANS, agentFillsProfile } from "./plans";

export type PublicPageContext = "home" | "tariffs" | "login" | "register" | "other";

export type PlanId = keyof typeof DAILY_QUOTA;

export type QuotaNeed = { publish: number; update: number; promo: number };

const order = Object.keys(DAILY_QUOTA) as PlanId[];

export type TariffGuide =
  | { step: "start" }
  | { step: "listings" }
  | { step: "edits"; publish: number }
  | { step: "promo"; publish: number; update: number }
  | { step: "pick" }
  | { step: "done"; plan: PlanId | null };

export type TariffPrompt = { label: string; href?: string };

export type TariffCard = {
  plan: PlanId;
  mode: "recommend" | "details";
  reason?: string;
};

export type TariffReply = {
  guide: TariffGuide;
  prompts: TariffPrompt[];
  text: string;
  card?: TariffCard;
  comparison?: boolean;
  scenario: string;
};

export const tariffWelcome =
  "Здравствуйте. Я OPS. Помогу подобрать тариф или разобраться, что в него входит.";

export const tariffDifference =
  "Главное отличие — объём ежедневной работы OPS: сколько новых объявлений, правок и продвижений он может вести.";

export const tariffAds =
  "Работа OPS с продвижением входит в лимиты тарифа. Сам рекламный бюджет Авито оплачивается отдельно.";

const again = "Задать другой вопрос";
const compare = "Сравнить с другим";
const choose = "Выбрать тариф";

function maxQuota(key: "publish" | "update" | "promo") {
  return Math.max(...order.map((id) => DAILY_QUOTA[id][key]));
}

export function listingChoices() {
  const caps = order.map((id) => DAILY_QUOTA[id].publish);
  const unique = [...new Set(caps)].sort((a, b) => a - b);
  const choices: { label: string; need: number }[] = [];
  let previous = 0;
  for (const cap of unique) {
    choices.push({ label: `${previous + 1}–${cap}`, need: cap });
    previous = cap;
  }
  const top = unique[unique.length - 1] ?? 0;
  choices.push({ label: `Больше ${top}`, need: top + 1 });
  return choices;
}

export function editChoices() {
  const caps = order.map((id) => DAILY_QUOTA[id].update);
  const unique = [...new Set(caps)].sort((a, b) => a - b);
  const choices: { label: string; need: number }[] = [];
  let previous = 0;
  for (const cap of unique) {
    choices.push({ label: `${previous + 1}–${cap}`, need: cap });
    previous = cap;
  }
  choices.push({ label: "Почти не правим", need: 0 });
  return choices;
}

export function planChoices() {
  return order.map((id) => PLANS[id].title);
}

export function smallestCoveringPlan(need: QuotaNeed): PlanId | null {
  return (
    order.find((id) => {
      const quota = DAILY_QUOTA[id];
      return quota.publish >= need.publish && quota.update >= need.update && quota.promo >= need.promo;
    }) ?? null
  );
}

function fold(value: string) {
  return value.trim().toLowerCase().replace(/-/g, "–").replace(/\s+/g, " ");
}

function matchNeed(text: string, choices: { label: string; need: number }[]) {
  const key = fold(text);
  return choices.find((item) => fold(item.label) === key) ?? null;
}

function startPrompts(): TariffPrompt[] {
  return [
    { label: "Какой тариф мне подходит?" },
    { label: "Что входит в тариф?" },
    { label: "Чем отличаются тарифы?" },
    { label: "Реклама входит в стоимость?" },
  ];
}

function donePrompts(plan: PlanId | null): TariffPrompt[] {
  const prompts: TariffPrompt[] = [];
  if (plan) prompts.push({ label: choose, href: `/register?plan=${plan}` });
  prompts.push({ label: compare }, { label: again });
  return prompts;
}

function reasonFor(plan: PlanId, publish: number, update: number) {
  const title = PLANS[plan].title;
  const binding = update > publish ? `до ${update} правок в день` : `до ${publish} новых объявлений в день`;
  return `Вы указали ${binding} — «${title}» покрывает этот объём без переплаты за больший лимит.`;
}

function aboveMaxText() {
  const top = order[order.length - 1];
  const cap = top ? DAILY_QUOTA[top].publish : maxQuota("publish");
  const title = top ? PLANS[top].title : "Максимальный тариф";
  return `«${title}» — максимальный тариф: до ${cap} новых объявлений в день. Тарифа на больший объём нет.`;
}

function recommend(publish: number, update: number, promo: number): TariffReply {
  const plan = smallestCoveringPlan({ publish, update, promo });
  if (!plan) {
    return {
      guide: { step: "done", plan: null },
      prompts: [{ label: "Сравнить тарифы" }, { label: again }],
      text: aboveMaxText(),
      scenario: "above_max",
    };
  }
  return {
    guide: { step: "done", plan },
    prompts: donePrompts(plan),
    text: `Вам подходит «${PLANS[plan].title}».`,
    card: { plan, mode: "recommend", reason: reasonFor(plan, publish, update) },
    scenario: "recommend",
  };
}

function promoWouldChange(publish: number, update: number) {
  const base = smallestCoveringPlan({ publish, update, promo: 0 });
  const daily = smallestCoveringPlan({ publish, update, promo: Math.max(publish, update, 1) });
  const sometimes = smallestCoveringPlan({ publish, update, promo: DAILY_QUOTA[order[0]].promo });
  return base !== daily || base !== sometimes;
}

function afterListings(publish: number): TariffReply {
  const top = maxQuota("publish");
  if (publish > top) {
    return {
      guide: { step: "done", plan: null },
      prompts: [{ label: "Сравнить тарифы" }, { label: again }],
      text: aboveMaxText(),
      scenario: "above_max",
    };
  }
  if (publish >= top) return recommend(publish, 0, 0);
  return {
    guide: { step: "edits", publish },
    prompts: editChoices().map((item) => ({ label: item.label })),
    text: "Сколько правок существующих объявлений обычно требуется в день?",
    scenario: "ask_edits",
  };
}

function afterEdits(publish: number, update: number): TariffReply {
  if (publish > maxQuota("publish") || update > maxQuota("update")) {
    return {
      guide: { step: "done", plan: null },
      prompts: [{ label: "Сравнить тарифы" }, { label: again }],
      text: aboveMaxText(),
      scenario: "above_max",
    };
  }
  if (!promoWouldChange(publish, update)) return recommend(publish, update, 0);
  return {
    guide: { step: "promo", publish, update },
    prompts: [{ label: "Да" }, { label: "Иногда" }, { label: "Нет" }],
    text: "Нужно ли ежедневно использовать продвижение?",
    scenario: "ask_promo",
  };
}

function promoNeed(answer: string, publish: number, update: number) {
  const key = fold(answer);
  if (key === "нет") return 0;
  if (key === "иногда") return DAILY_QUOTA[order[0]].promo;
  if (key === "да") return Math.max(publish, update);
  return null;
}

function planByTitle(text: string) {
  const key = fold(text);
  return order.find((id) => fold(PLANS[id].title) === key) ?? null;
}

export function tariffReply(guide: TariffGuide, message: string): TariffReply | null {
  const text = message.trim();
  if (!text) return null;

  if (text === again) {
    return {
      guide: { step: "start" },
      prompts: startPrompts(),
      text: "Спросите про тариф или напишите свой вопрос.",
      scenario: "restart",
    };
  }

  if (text === "Подобрать мне тариф" || text === "Подобрать тариф" || text === "Какой тариф мне подходит?") {
    return {
      guide: { step: "listings" },
      prompts: listingChoices().map((item) => ({ label: item.label })),
      text: "Сколько новых объявлений вам обычно нужно размещать в день?",
      scenario: "ask_listings",
    };
  }

  if (guide.step === "done" && (text === compare || text === "Сравнить тарифы")) {
    return {
      guide,
      prompts: donePrompts(guide.plan),
      text: tariffDifference,
      comparison: true,
      scenario: "compare",
    };
  }

  if (guide.step === "start") {
    if (text === "Что входит в тариф?") {
      return {
        guide: { step: "pick" },
        prompts: planChoices().map((label) => ({ label })),
        text: "Какой тариф вас интересует?",
        scenario: "ask_plan",
      };
    }
    if (text === "Чем отличаются тарифы?" || text === "Сравнить тарифы") {
      return {
        guide: { step: "done", plan: null },
        prompts: [
          { label: "Подобрать мне тариф" },
          { label: "Сравнить подробнее", href: "/tariffs#compare-title" },
          { label: again },
        ],
        text: tariffDifference,
        comparison: true,
        scenario: "difference",
      };
    }
    if (text === "Реклама входит в стоимость?") {
      return {
        guide: { step: "done", plan: null },
        prompts: [{ label: again }],
        text: tariffAds,
        scenario: "ads",
      };
    }
    return null;
  }

  if (guide.step === "listings") {
    const choice = matchNeed(text, listingChoices());
    if (!choice) return null;
    return afterListings(choice.need);
  }

  if (guide.step === "edits") {
    const choice = matchNeed(text, editChoices());
    if (!choice) return null;
    return afterEdits(guide.publish, choice.need);
  }

  if (guide.step === "promo") {
    const promo = promoNeed(text, guide.publish, guide.update);
    if (promo === null) return null;
    return recommend(guide.publish, guide.update, promo);
  }

  if (guide.step === "pick") {
    const plan = planByTitle(text);
    if (!plan) return null;
    return {
      guide: { step: "done", plan },
      prompts: donePrompts(plan),
      text: PLANS[plan].title,
      card: { plan, mode: "details" },
      scenario: "plan_details",
    };
  }

  return null;
}

export function tariffFactsLine() {
  const rows = order.map((id) => {
    const quota = DAILY_QUOTA[id];
    const plan = PLANS[id];
    return `${plan.title}: ${plan.priceRub} руб в месяц, ${quota.publish} новых, ${quota.update} правок, до ${quota.promo} продвижений`;
  });
  return `Страница: тарифы. Факты: ${rows.join(". ")}. ${tariffAds}`.slice(0, 800);
}

export function planProfileLine(plan: PlanId) {
  return agentFillsProfile(plan) ? "Анкету заполняем по вашим ответам." : "Анкету заполняете сами.";
}

const tariffSwitchLine =
  "Смена тарифа сама не включается. В биллинге можно отправить заявку на другой тариф. Пока предыдущая заявка на тариф не оплачена, новая не создаётся.";

export function wantsListing(text: string) {
  const key = fold(text);
  return /создай|создать|сделай объявлен|вылож|опублик|размести объявлен|разместить объявлен/.test(key);
}

function seasonCount(text: string, season: "зим" | "лет") {
  const key = fold(text);
  const after = key.match(new RegExp(`(?:^|[^а-яё])${season}[а-яё]{0,8}[^\\d]{0,30}(\\d+)`));
  if (after) return Number(after[1]);
  const before = key.match(new RegExp(`(\\d+)[^\\d]{0,30}${season}`));
  return before ? Number(before[1]) : null;
}

function quotaSentence(plan: PlanId) {
  const quota = DAILY_QUOTA[plan];
  const item = PLANS[plan];
  return `«${item.title}»: до ${quota.publish} новых объявлений в день, ${formatRub(item.priceRub)} в месяц`;
}

function seasonalReply(winter: number, summer: number): TariffReply {
  const summerLeads = summer >= winter;
  const peakNeed = summerLeads ? summer : winter;
  const quietNeed = summerLeads ? winter : summer;
  const peakLabel = summerLeads ? "Летом" : "Зимой";
  const quietLabel = summerLeads ? "Зимой" : "Летом";
  const peak = smallestCoveringPlan({ publish: peakNeed, update: 0, promo: 0 });
  const quiet = smallestCoveringPlan({ publish: quietNeed, update: 0, promo: 0 });
  if (!peak) {
    return {
      guide: { step: "done", plan: null },
      prompts: [{ label: "Сравнить тарифы" }, { label: again }],
      text: `${peakLabel} нужен объём до ${peakNeed} новых объявлений в день. ${aboveMaxText()}`,
      scenario: "seasonal_above_max",
    };
  }
  const parts = [`${peakLabel} нужен объём до ${peakNeed} новых объявлений в день. Это покрывает ${quotaSentence(peak)}.`];
  if (quiet && quiet !== peak) {
    parts.push(`${quietLabel} объём до ${quietNeed} новых объявлений в день покрывает ${quotaSentence(quiet)}.`);
    parts.push(tariffSwitchLine);
  } else if (quiet === peak) {
    parts.push(`${quietLabel} объём до ${quietNeed} тоже укладывается в этот тариф.`);
  }
  return {
    guide: { step: "done", plan: peak },
    prompts: donePrompts(peak),
    text: parts.join(" "),
    card: {
      plan: peak,
      mode: "recommend",
      reason: parts.join(" "),
    },
    scenario: "seasonal",
  };
}

function volumeCounts(text: string) {
  const key = fold(text);
  const publish = [...key.matchAll(/(\d+)\s*(?:новых\s+)?объявлен/g)].map((item) => Number(item[1]));
  const update = [...key.matchAll(/(\d+)\s*прав(?:ок|к)/g)].map((item) => Number(item[1]));
  if (publish.length === 0 && update.length === 0) return null;
  return {
    publish: publish.length ? Math.max(...publish) : 0,
    update: update.length ? Math.max(...update) : 0,
  };
}

export function consultTariff(message: string): TariffReply | null {
  const text = message.trim();
  if (!text || wantsListing(text)) return null;
  const winter = seasonCount(text, "зим");
  const summer = seasonCount(text, "лет");
  if (winter != null && summer != null && /объявлен/.test(fold(text))) return seasonalReply(winter, summer);
  const counts = volumeCounts(text);
  if (counts && (counts.publish > 0 || counts.update > 0)) {
    const reply = recommend(counts.publish, counts.update, 0);
    if (counts.update > counts.publish && reply.card?.reason) {
      return { ...reply, text: `${reply.text} ${reply.card.reason}`, scenario: "volume_edits" };
    }
    return { ...reply, scenario: "volume" };
  }
  return {
    guide: { step: "start" },
    prompts: startPrompts(),
    text: "Здесь подбираем тариф по объёму работы, а не карточку объявления. Напишите, сколько новых объявлений и правок нужно в день, или выберите «Подобрать тариф».",
    scenario: "tariff_clarify",
  };
}
