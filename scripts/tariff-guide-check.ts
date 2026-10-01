import { DAILY_QUOTA, PLANS } from "../src/lib/plans";
import {
  consultTariff,
  editChoices,
  listingChoices,
  smallestCoveringPlan,
  tariffAds,
  tariffReply,
  type TariffGuide,
} from "../src/lib/tariff-guide";

function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    console.error(`FAIL ${name} ${detail}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

function step(guide: TariffGuide, message: string) {
  const reply = tariffReply(guide, message);
  if (!reply) throw new Error(`not handled: ${message}`);
  return reply;
}

const listings = listingChoices();
const edits = editChoices();
const band = (need: number, choices: { label: string; need: number }[]) => {
  const found = choices.find((item) => item.need === need);
  if (!found) throw new Error(`missing band ${need}`);
  return found.label;
};

const startNeed = DAILY_QUOTA.start.publish;
const growthNeed = DAILY_QUOTA.growth.publish;
const businessNeed = DAILY_QUOTA.business.publish;
const scaleNeed = DAILY_QUOTA.scale.publish;

const asked = step({ step: "start" }, "Какой тариф мне подходит?");
check("fit asks listings", asked.guide.step === "listings" && asked.scenario === "ask_listings");

const low = step(asked.guide, band(startNeed, listings));
check("1-3 asks edits", low.guide.step === "edits");
if (low.guide.step === "edits") {
  const quiet = step(low.guide, "Почти не правим");
  check("1-3 and few edits is start", quiet.card?.plan === "start" && quiet.guide.step === "done");
  const heavier = step(low.guide, band(scaleNeed, edits));
  check("edits above listings pick scale", heavier.card?.plan === "scale");
}

const mid = step(asked.guide, band(growthNeed, listings));
check("4-6 asks edits", mid.guide.step === "edits");
if (mid.guide.step === "edits") {
  const fit = step(mid.guide, band(growthNeed, edits));
  check("4-6 is growth", fit.card?.plan === "growth" && fit.card.mode === "recommend");
  check("growth skips promo", fit.scenario === "recommend");
  check(
    "growth reason uses quota",
    Boolean(fit.card?.reason?.includes(String(growthNeed)) && fit.card.reason.includes(PLANS.growth.title)),
  );
}

const ten = step(asked.guide, band(businessNeed, listings));
if (ten.guide.step === "edits") {
  const fit = step(ten.guide, band(startNeed, edits));
  check("7-10 stays business", fit.card?.plan === "business");
}

const top = step(asked.guide, band(scaleNeed, listings));
check("11-20 is scale without extra questions", top.card?.plan === "scale" && top.scenario === "recommend");

const over = step(asked.guide, listings[listings.length - 1]?.label ?? "");
check("above max has no plan card", over.scenario === "above_max" && !over.card);

check(
  "promo above listings selects business",
  smallestCoveringPlan({
    publish: DAILY_QUOTA.start.publish,
    update: 0,
    promo: DAILY_QUOTA.business.promo,
  }) === "business",
);

const seasonalScript = tariffReply(
  { step: "start" },
  "У меня сезонный бизнес, зимой 2 объявления, летом 15. Что лучше?",
);
check("unknown text is not handled", seasonalScript === null);

const seasonal = consultTariff("У меня сезонный бизнес: зимой 2 объявления, летом 15. Какой тариф лучше?");
const summerPlan = smallestCoveringPlan({ publish: 15, update: 0, promo: 0 });
const winterPlan = smallestCoveringPlan({ publish: 2, update: 0, promo: 0 });
check(
  "seasonal stays on tariffs",
  Boolean(
    seasonal &&
      summerPlan &&
      winterPlan &&
      seasonal.scenario === "seasonal" &&
      seasonal.card?.plan === summerPlan &&
      seasonal.text.includes(PLANS[summerPlan].title) &&
      seasonal.text.includes(PLANS[winterPlan].title) &&
      seasonal.text.includes("заявку на другой тариф") &&
      !seasonal.text.includes("В каком городе") &&
      !seasonal.text.includes("За какую цену"),
  ),
);

const editText = consultTariff("У меня 5 объявлений, но по 12 правок каждый день. Что выбрать?");
const editPlan = smallestCoveringPlan({ publish: 5, update: 12, promo: 0 });
check(
  "edits in free text pick the update limit",
  Boolean(editText && editPlan && editText.card?.plan === editPlan && /правок/.test(editText.text)),
);

const pitch = consultTariff("Я продаю бани в Москве");
check(
  "product pitch does not start a listing",
  Boolean(pitch && pitch.scenario === "tariff_clarify" && !pitch.text.includes("В каком городе") && pitch.text.includes("тариф")),
);
check("create listing leaves tariff consult", consultTariff("Создай мне объявление на баню") === null);

for (const label of ["Что входит в тариф?", "Чем отличаются тарифы?", "Реклама входит в стоимость?"]) {
  check(`${label} is local`, tariffReply({ step: "start" }, label) !== null);
}

const included = step({ step: "start" }, "Что входит в тариф?");
const detail = step(included.guide, PLANS.growth.title);
check("plan chip is details card", detail.card?.mode === "details" && detail.card.plan === "growth");

const diff = step({ step: "start" }, "Чем отличаются тарифы?");
check(
  "difference offers three actions",
  diff.comparison === true &&
    diff.prompts.map((item) => item.label).join("|") === "Подобрать мне тариф|Сравнить подробнее|Задать другой вопрос",
);
check("difference compare links to the page", diff.prompts[1]?.href === "/tariffs#compare-title");
const fromDiff = step(diff.guide, "Подобрать мне тариф");
check("pick from difference asks listings", fromDiff.scenario === "ask_listings" && fromDiff.guide.step === "listings");

const ads = step({ step: "start" }, "Реклама входит в стоимость?");
check("ads rule is separate budget", ads.text === tariffAds && ads.text.includes("отдельно"));

const restarted = step(detail.guide, "Задать другой вопрос");
check("restart returns four prompts", restarted.prompts.length === 4 && restarted.guide.step === "start");

if (process.exitCode) {
  console.error("tariff guide check failed");
} else {
  console.log("tariff guide check passed");
}
