import { z } from "zod";
import { askGrok } from "../grok";
import { logInfo } from "../redact";
import { formatRub } from "../format";
import { speak } from "../curator";
import {
  canonicalDimensions,
  canonicalLocation,
  deterministicEdit,
  normalizeLocationList,
  parseRussianPrice,
  rulesNeedSenior,
} from "./listing-facts";
import { composeTask, moneyOf, saleFromFacts, type SaleBrief, type TaskFacts, type TaskState } from "../services/sale";

const SAVE_TASK = { href: "/register?from=task", label: "Сохранить и продолжить" };

const seniorSchema = z.object({
  intent: z.enum(["create_listing", "edit_listing", "strategy", "other"]).optional(),
  message: z.string().max(500),
  nextQuestion: z.string().max(180).nullable().optional(),
  draftPatch: z
    .object({
      product: z.string().max(80).nullable().optional(),
    })
    .optional(),
  readyForDraft: z.boolean().optional(),
  offerEnhancement: z.boolean().optional(),
});

export type OnboardingRoute = "rules-edit" | "guided-senior" | "strategy-senior" | "fallback";

export type SeniorClient = (input: { system: string; user: string }) => Promise<string | null>;

export type OnboardingTurn = {
  handled: boolean;
  route: OnboardingRoute | null;
  reply: string;
  task: TaskState;
  sale: SaleBrief;
  action?: { href: string; label: string };
  seniorCalls: number;
  intent: string | null;
  readyForDraft: boolean;
  questionAsked: boolean;
  draftUpdated: boolean;
  fallbackReason?: string;
};

type BrainFacts = TaskFacts & { size: string | null; priceDeferred: boolean };

const SYSTEM = [
  "Ты OPS, AI-авитолог AvitoOps. Веди человека к объявлению обычным русским языком.",
  "Верни только JSON: intent, message, nextQuestion, draftPatch.product, readyForDraft, offerEnhancement.",
  "В message максимум один вопрос. Не перечисляй анкету.",
  "Не спрашивай поле, которое уже есть во facts. Если priceDeferred, не проси цену.",
  "Если есть product, location и price, не задавай вопрос: подтверди данные и предложи усилить заголовок и описание.",
  "Не пиши слова product, location, заполните, обязательные поля. Не проси пароль.",
].join(" ");

function fold(text: string) {
  return text.toLowerCase().replaceAll("ё", "е");
}

function questions(text: string) {
  return text.match(/\?/g)?.length ?? 0;
}

function priceDeferred(text: string) {
  const q = fold(text);
  return /не знаю сколько|цен[а-я]{0,3}\s+пока\s+не|пока\s+не\s+знаю|цен[а-я]{0,3}\s+не\s+(?:знаю|известн|указан)|цена\s+пока\s+неизвестн/.test(q);
}

function wantsChecklist(text: string) {
  const q = fold(text);
  return /анкет/.test(q) || /что тебе нужно знать/.test(q) || /спроси (?:всё|все) сразу/.test(q);
}

function isTariff(text: string) {
  const q = fold(text);
  if (/тариф|подписк|оферт|депозит/.test(q)) return true;
  return /сколько стоит/.test(q) && /тариф|подписк|сервис|avitoops/.test(q);
}

function isGreeting(text: string) {
  return /^(?:привет|здравствуйте|добрый день|добрый вечер|доброе утро)[.!]?$/.test(fold(text.trim()));
}

function cleanProduct(value: string | null | undefined) {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 80) return null;
  if (/https?:|@|\bpassword\b/i.test(text)) return null;
  return text;
}

function offeredProduct(text: string) {
  const match = text.match(/(?:прода(?:ю|ем|ём|ть|вать|м)|сда(?:ю|ем|ём|м)|хочу\s+продать|помоги(?:те)?\s+продать)\s+(.+)/i);
  if (!match?.[1]) return null;
  let rest = match[1].split(/[,.]/)[0] ?? match[1];
  rest = rest.replace(/\s+за\s+\d[\s\S]*$/i, "");
  rest = rest.replace(/\s+в\s+[а-яё-]{3,}.*$/i, "");
  rest = rest.replace(/\d+(?:[.,]\d+)?\s*(?:на|[xх×*])\s*\d+(?:[.,]\d+)?/gi, " ");
  rest = rest.replace(/[.?!\s]+$/g, "").trim();
  if (rest.length < 3 || rest.split(/\s+/).length > 6) return null;
  const product = rest
    .split(/\s+/)
    .map((word) => {
      const lower = fold(word);
      if (lower.endsWith("ую") && lower.length > 3) return `${lower.slice(0, -2)}ая`;
      if (lower.endsWith("ю") && lower.length > 3) return `${lower.slice(0, -1)}я`;
      return lower;
    })
    .join(" ");
  return cleanProduct(product);
}

function silentFacts(current: TaskState, text: string): BrainFacts {
  const deferred = current.attributes.priceStatus === "unknown" || priceDeferred(text);
  const parsed = parseRussianPrice(text);
  const heardPrice = deferred ? null : parsed.explicit && parsed.value ? parsed.value : moneyOf(text);
  const location = canonicalLocation(text) ?? current.location;
  const product = offeredProduct(text) ?? current.product;
  const size = canonicalDimensions(text) ?? current.attributes.size ?? null;
  return {
    product,
    location,
    price: heardPrice ?? (deferred ? null : current.price),
    size,
    priceDeferred: deferred && !(heardPrice && !priceDeferred(text)),
  };
}

function taskOf(facts: BrainFacts): TaskState {
  const task = composeTask({ product: facts.product, location: facts.location, price: facts.priceDeferred ? null : facts.price });
  const attributes = { ...task.attributes };
  if (facts.size) attributes.size = facts.size;
  if (facts.priceDeferred && !facts.price) attributes.priceStatus = "unknown";
  return { ...task, attributes };
}

function showSize(size: string) {
  return size.replaceAll("x", "×").replaceAll(".", ",");
}

function selling(product: string) {
  return product
    .split(" ")
    .map((word) => {
      if (word.endsWith("ая")) return `${word.slice(0, -2)}ую`;
      if (word.endsWith("яя")) return `${word.slice(0, -2)}юю`;
      if (word.endsWith("а")) return `${word.slice(0, -1)}у`;
      if (word.endsWith("я")) return `${word.slice(0, -1)}ю`;
      return word;
    })
    .join(" ");
}

function whereWord(product: string) {
  const last = product.split(" ").at(-1) ?? product;
  if (/[ая]$/i.test(last)) return "она";
  if (/[ое]$/i.test(last)) return "оно";
  return "он";
}

function inPlace(location: string) {
  if (location.includes(" и ")) return location;
  if (location.endsWith("ск")) return `в ${location}е`;
  if (location.endsWith("а")) return `в ${location.slice(0, -1)}е`;
  return `в городе ${location}`;
}

function ready(facts: BrainFacts) {
  return Boolean(facts.product && facts.location && facts.price && !facts.priceDeferred);
}

function asksKnown(text: string, facts: BrainFacts) {
  const q = fold(text);
  if (facts.product && /что (?:именно )?прода|какой товар|укажите товар/.test(q)) return true;
  if (facts.location && /в каком городе|где (?:она|он|оно) наход|какой город|где находится/.test(q)) return true;
  if ((facts.price || facts.priceDeferred) && /какую цену|за какую цену|сколько просить|назовите цену/.test(q)) return true;
  if (facts.size && /какой размер|какие размеры/.test(q)) return true;
  return false;
}

function readyLine(facts: BrainFacts) {
  const size = facts.size ? ` ${showSize(facts.size)}` : "";
  const place = facts.location ? ` ${inPlace(facts.location)}` : "";
  const price = facts.price ? `, цена ${formatRub(facts.price)}` : "";
  return `Понял. ${cap(facts.product ?? "объявление")}${size}${place}${price}. Основные данные уже есть — я собрал черновик объявления. Могу теперь усилить заголовок и описание. Когда черновик сохранится, можно подключить Авито.`;
}

function cap(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}

function fallbackLine(facts: BrainFacts) {
  if (ready(facts)) return readyLine(facts);
  if (facts.priceDeferred && facts.product && !facts.location) {
    return `Цена пока не определена — это нормально. Могу позже помочь с ориентиром. Где находится ${facts.product}?`;
  }
  if (facts.priceDeferred && facts.product && facts.location) {
    return `Цена пока не определена — это нормально. ${cap(facts.product)} ${inPlace(facts.location)} уже записал. Размер, если знаете, можно добавить следом.`;
  }
  if (facts.product && !facts.location) return `Понял, продаём ${selling(facts.product)}. Где ${whereWord(facts.product)} находится?`;
  if (facts.product && facts.location && !facts.price) return `Записал: ${facts.location}. Какую цену поставить?`;
  return "Что продаёте? Я соберу объявление из вашего рассказа.";
}

function checklist(facts: BrainFacts) {
  const lines = ["Коротко, что поможет собрать объявление:"];
  if (!facts.product) lines.push("— что продаёте");
  if (!facts.location) lines.push("— где находится");
  if (!facts.price && !facts.priceDeferred) lines.push("— цена, если уже решили");
  if (!facts.size) lines.push("— размер, если знаете");
  if (lines.length === 1) return "Основные данные уже есть. Могу усилить заголовок и описание.";
  lines.push("Можно ответить одним сообщением.");
  return lines.join("\n");
}

function acceptSpeech(raw: string | null, facts: BrainFacts) {
  if (!raw) return null;
  let parsed: unknown;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const body = seniorSchema.safeParse(parsed);
  if (!body.success) return null;
  const product = cleanProduct(body.data.draftPatch?.product);
  const nextFacts: BrainFacts = {
    ...facts,
    product: facts.product ?? product,
  };
  const complete = ready(nextFacts);
  let message = body.data.message.trim();
  const next = body.data.nextQuestion?.trim();
  if (next && !complete && questions(message) === 0 && !message.includes(next)) message = `${message} ${next}`;
  if (!message || questions(message) > 1) return { facts: nextFacts, message: null };
  if (complete && questions(message) > 0) return { facts: nextFacts, message: null };
  if (asksKnown(message, nextFacts) || /заполните|обязательн|необходимо указать|\bproduct\b|\blocation\b/i.test(message)) {
    return { facts: nextFacts, message: null };
  }
  return { facts: nextFacts, message };
}

function changed(before: TaskState, after: TaskState) {
  return (
    before.product !== after.product ||
    before.location !== after.location ||
    before.price !== after.price ||
    before.attributes.size !== after.attributes.size ||
    before.attributes.priceStatus !== after.attributes.priceStatus
  );
}

function finish(input: {
  started: number;
  route: OnboardingRoute;
  reply: string;
  before: TaskState;
  facts: BrainFacts;
  seniorCalls: number;
  intent: string;
  fallbackReason?: string;
  success: boolean;
}): OnboardingTurn {
  const task = taskOf(input.facts);
  const reply = speak(input.reply);
  const readyForDraft = ready(input.facts);
  const turn: OnboardingTurn = {
    handled: true,
    route: input.route,
    reply,
    task,
    sale: saleFromFacts(task),
    ...(readyForDraft ? { action: SAVE_TASK } : {}),
    seniorCalls: input.seniorCalls,
    intent: input.intent,
    readyForDraft,
    questionAsked: questions(reply) > 0,
    draftUpdated: changed(input.before, task),
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
  };
  logInfo(
    `[ai] ${JSON.stringify({
      task: "guided_onboarding",
      route: turn.route,
      intent: turn.intent,
      readyForDraft: turn.readyForDraft,
      questionAsked: turn.questionAsked,
      draftUpdated: turn.draftUpdated,
      latencyMs: Date.now() - input.started,
      success: input.success,
      seniorCalls: turn.seniorCalls,
      ...(turn.fallbackReason ? { fallbackReason: turn.fallbackReason } : {}),
    })}`,
  );
  return turn;
}

export async function grokOnboardingClient(input: { system: string; user: string }) {
  return askGrok(input.system, input.user);
}

export async function guideGuestOnboarding(input: {
  text: string;
  task: TaskState;
  senior?: SeniorClient;
}): Promise<OnboardingTurn> {
  const started = Date.now();
  const text = input.text.trim();
  if (!text || isGreeting(text) || isTariff(text)) {
    return {
      handled: false,
      route: null,
      reply: "",
      task: input.task,
      sale: saleFromFacts(input.task),
      seniorCalls: 0,
      intent: null,
      readyForDraft: false,
      questionAsked: false,
      draftUpdated: false,
    };
  }
  const senior = input.senior ?? grokOnboardingClient;
  if (wantsChecklist(text)) {
    const facts = silentFacts(input.task, text);
    return finish({
      started,
      route: "guided-senior",
      reply: checklist(facts),
      before: input.task,
      facts,
      seniorCalls: 0,
      intent: "checklist",
      success: true,
    });
  }
  const edit = deterministicEdit(text);
  if (edit) {
    const facts = silentFacts(input.task, "");
    if (edit.changedField === "price" && edit.facts.price) {
      facts.price = edit.facts.price;
      facts.priceDeferred = false;
    }
    if (edit.changedField === "location") {
      facts.location = normalizeLocationList(edit.facts.locations);
    }
    const reply =
      edit.changedField === "price" && facts.price
        ? `Готово, цену поменял на ${formatRub(facts.price)}.`
        : `Готово, город поменял на ${facts.location}.`;
    return finish({
      started,
      route: "rules-edit",
      reply,
      before: input.task,
      facts,
      seniorCalls: 0,
      intent: "edit_listing",
      success: true,
    });
  }
  const heard = silentFacts(input.task, text);
  const strategy = rulesNeedSenior(text);
  let seniorCalls = 0;
  let fallbackReason: string | undefined;
  let speech: string | null = null;
  let facts = heard;
  try {
    seniorCalls = 1;
    const raw = await senior({
      system: SYSTEM,
      user: JSON.stringify({
        facts: {
          product: heard.product,
          location: heard.location,
          price: heard.priceDeferred ? null : heard.price,
          dimensions: heard.size,
          priceDeferred: heard.priceDeferred,
        },
        strategy,
        message: text.slice(0, 800),
      }),
    });
    if (!raw) fallbackReason = "unavailable";
    const accepted = acceptSpeech(raw, heard);
    if (accepted) {
      facts = accepted.facts;
      speech = accepted.message;
      if (!speech) fallbackReason = "senior_message";
    } else if (raw) fallbackReason = "senior_message";
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    fallbackReason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "provider_error";
  }
  const reply = speech ?? fallbackLine(facts);
  return finish({
    started,
    route: strategy ? "strategy-senior" : speech ? "guided-senior" : "fallback",
    reply,
    before: input.task,
    facts,
    seniorCalls,
    intent: strategy ? "strategy" : "create_listing",
    success: Boolean(speech),
    ...(speech ? {} : { fallbackReason }),
  });
}
