import { readFileSync } from "node:fs";
import { guideGuestOnboarding, type SeniorClient } from "../src/lib/ai/onboarding";
import { deterministicEdit } from "../src/lib/ai/listing-facts";
import { composeTask, emptyFacts } from "../src/lib/services/sale";
import { loadEnv } from "./load-env";

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log(`ok ${name}`);
}

function questions(text: string) {
  return text.match(/\?/g)?.length ?? 0;
}

function brain(message: string, product?: string | null): SeniorClient {
  return async () =>
    JSON.stringify({
      intent: "create_listing",
      message,
      nextQuestion: null,
      draftPatch: { product: product ?? null },
    });
}

async function main() {
  const blank = composeTask(emptyFacts());
  const logs: string[] = [];
  const previous = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const bath = await guideGuestOnboarding({
      text: "Хочу продать баню",
      task: blank,
      senior: brain("Понял, продаём баню. Где она находится?", "баня"),
    });
    check(
      "A one question after a plain wish",
      bath.handled &&
        bath.route === "guided-senior" &&
        bath.seniorCalls === 1 &&
        bath.task.product === "баня" &&
        questions(bath.reply) === 1 &&
        bath.reply.includes("баню") &&
        !bath.readyForDraft,
    );

    const full = await guideGuestOnboarding({
      text: "Каркасная баня 6×2,4, Подольск, 570 тысяч",
      task: blank,
      senior: brain(
        "Понял. Каркасная баня 6×2,4 в Подольске, цена 570 000 ₽. Основные данные уже есть — я собрал черновик объявления. Могу теперь усилить заголовок и описание.",
        "каркасная баня",
      ),
    });
    check(
      "B full phrase is a draft without a question",
      full.route === "guided-senior" &&
        full.seniorCalls === 1 &&
        full.task.product === "каркасная баня" &&
        full.task.location === "Подольск" &&
        full.task.price === 570000 &&
        full.task.attributes.size === "6x2.4" &&
        full.readyForDraft &&
        questions(full.reply) === 0 &&
        full.action?.href === "/register?from=task",
    );

    const unknown = await guideGuestOnboarding({
      text: "Продаю стол, цену пока не знаю, Тула",
      task: blank,
      senior: brain("За какую цену?", "стол"),
    });
    check(
      "C unknown price is not demanded",
      unknown.task.product === "стол" &&
        unknown.task.location === "Тула" &&
        unknown.task.price == null &&
        unknown.task.attributes.priceStatus === "unknown" &&
        !/какую цену/i.test(unknown.reply) &&
        unknown.reply.includes("не определена"),
    );

    const loose = await guideGuestOnboarding({
      text: "У меня есть какая-то бытовка, хочу выставить",
      task: blank,
      senior: brain("Понял, есть бытовка. Где она находится?", "бытовка"),
    });
    check(
      "D loose phrase is guided",
      loose.route === "guided-senior" &&
        loose.seniorCalls === 1 &&
        loose.task.product === "бытовка" &&
        questions(loose.reply) === 1 &&
        !loose.reply.includes("Что именно хотите продавать"),
    );

    let editCalls = 0;
    const priced = composeTask({ product: "баня", location: "Подольск", price: 500000 });
    const priceEdit = await guideGuestOnboarding({
      text: "Поменяй цену на 620000",
      task: priced,
      senior: async () => {
        editCalls += 1;
        return null;
      },
    });
    check(
      "E price edit stays on rules",
      editCalls === 0 &&
        priceEdit.route === "rules-edit" &&
        priceEdit.seniorCalls === 0 &&
        priceEdit.task.price === 620000 &&
        priceEdit.task.product === "баня" &&
        priceEdit.reply.includes("620"),
    );
    check("E deterministic edit still sees the price command", deterministicEdit("Поменяй цену на 620000")?.changedField === "price");

    const cityEdit = await guideGuestOnboarding({
      text: "Город теперь Чехов",
      task: priced,
      senior: async () => {
        editCalls += 1;
        return null;
      },
    });
    check(
      "F city edit stays on rules",
      editCalls === 0 &&
        cityEdit.route === "rules-edit" &&
        cityEdit.seniorCalls === 0 &&
        cityEdit.task.location === "Чехов" &&
        cityEdit.task.price === 500000,
    );

    const strategy = await guideGuestOnboarding({
      text: "Проанализируй конкурентов и предложи стратегию",
      task: blank,
      senior: brain("Для стратегии сначала закончу карточку. Что продаёте?"),
    });
    check(
      "G strategy stays on the senior route",
      strategy.route === "strategy-senior" &&
        strategy.seniorCalls === 1 &&
        !strategy.reply.includes("Что именно хотите продавать") &&
        !strategy.reply.includes("В каком городе") &&
        !strategy.reply.includes("За какую цену"),
    );

    let listCalls = 0;
    const list = await guideGuestOnboarding({
      text: "Что тебе нужно знать? Спроси всё сразу",
      task: blank,
      senior: async () => {
        listCalls += 1;
        return null;
      },
    });
    check(
      "H checklist can ask for the missing set",
      listCalls === 0 && list.seniorCalls === 0 && list.intent === "checklist" && list.reply.includes("что продаёте") && list.reply.includes("где находится"),
    );

    const wording = await guideGuestOnboarding({
      text: "Не знаю, что лучше написать",
      task: blank,
      senior: brain("Подскажу формулировку. Что продаёте?"),
    });
    check(
      "I wording help is not the old form",
      wording.route === "guided-senior" &&
        wording.seniorCalls === 1 &&
        wording.reply.includes("Что продаёте") &&
        !wording.reply.includes("Что именно хотите продавать"),
    );

    const down = await guideGuestOnboarding({
      text: "Хочу продать баню",
      task: blank,
      senior: async () => null,
    });
    check(
      "senior outage still asks one question",
      down.route === "fallback" && down.seniorCalls === 1 && down.task.product === "баня" && questions(down.reply) === 1 && down.fallbackReason === "unavailable",
    );

    loadEnv();
    const { curatorTurn } = await import("../src/lib/services/dispatch");
    const guestEdit = await curatorTurn(null, "Поменяй цену на 620000", [], {
      sale: { item: "баня", city: "Подольск", priceRub: 500000 },
      task: priced,
      senior: async () => {
        editCalls += 1;
        return null;
      },
    });
    check("guest price edit does not call senior", editCalls === 0 && guestEdit.task?.price === 620000);
    const yes = await curatorTurn(null, "да", [], {
      senior: async () => {
        editCalls += 1;
        return null;
      },
    });
    check("guest yes does not call senior", editCalls === 0 && yes.handled && yes.reply.includes("регистрац"));

    const aiLog = logs.filter((line) => line.includes("guided_onboarding")).join("\n");
    check(
      "telemetry skips the user text",
      aiLog.includes('"route":"guided-senior"') &&
        aiLog.includes('"seniorCalls":1') &&
        !aiLog.includes("Хочу продать") &&
        !aiLog.includes("Подольск") &&
        !aiLog.includes("570"),
    );

    const source = readFileSync(new URL("../src/lib/ai/onboarding.ts", import.meta.url), "utf8");
    const guest = readFileSync(new URL("../src/server/curator-actions.ts", import.meta.url), "utf8");
    const draft = readFileSync(new URL("../src/lib/services/guest-draft.ts", import.meta.url), "utf8");
    check("onboarding does not call cloudru", !source.includes("cloudru") && !source.includes("routeListingExtraction"));
    check("guest rate limit stays", guest.includes("allowQuestion(bucket, 8, 10 * 60_000)"));
    check(
      "claim still requires a ready draft and the same register path",
      draft.includes('state.completeness === "ready"') && source.includes('href: "/register?from=task"'),
    );

    console.log = previous;
    console.log("onboarding check passed");
  } catch (error) {
    console.log = previous;
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "onboarding check failed");
  process.exit(1);
});
