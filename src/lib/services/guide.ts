import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { avitoAccounts, curatorLines, curatorOffers, listings } from "../db/schema";
import { speak } from "../curator";
import { formatRub } from "../format";
import { agentFillsProfile } from "../plans";
import { rememberLine } from "./desk";
import { planOf, trialLive } from "./daily";
import {
  absorbSale,
  applyFacts,
  composeTask,
  factsChanged,
  factsFromSale,
  missingSaleQuestion,
  saleChanged,
  saleFromFacts,
  saleReady,
  taskQuestion,
  taskReadyLine,
  type AssistantCard,
  type SaleBrief,
} from "./sale";

export const cabinetConsentText =
  "Чтобы вести ваш кабинет, нужно согласие: объявления и ответы покупателям пойдут после вашего «да». Пароль Авито мы не записываем. Напишите «да» отдельным сообщением.";

export const avitoAskText = "Кабинет Авито уже есть?";

export const avitoYesText =
  "Пароль не нужен. Кнопка «Перейти в Авито» откроет страницу Авито, там разрешите доступ.";

export const avitoNoText =
  "Кабинета ещё нет. Три шага: откройте Авито, заведите профиль, вернитесь и нажмите «Перейти в Авито». Пароль вводить не нужно.";

export const avitoButton = { href: "/api/avito/connect", label: "Перейти в Авито" };

export const payButton = { href: "/app/billing", label: "Оплатить тариф" };

export const nextSteps =
  "Дальше два шага: как отвечать покупателям и какую сумму ставить на продвижение с депозита. Сумму назовёте вы. В первое объявление продвижение не входит.";

export function cardOf(
  userId: string,
  listing: { id: string; title: string; city: string; priceRub: number; body: string; photos: string[] },
): AssistantCard {
  const photo = listing.photos[0] ? `/api/photos/${userId}/${listing.id}/${listing.photos[0]}` : null;
  return {
    href: `/app/listings/${listing.id}`,
    title: listing.title,
    city: listing.city,
    priceRub: listing.priceRub,
    body: listing.body,
    photo,
  };
}

const saveTaskButton = { href: "/register?from=task", label: "Сохранить и продолжить" };

export function guideGuest(text: string, sale: SaleBrief) {
  const before = factsFromSale(sale);
  const next = applyFacts(before, text);
  if (!factsChanged(before, next)) return null;
  const task = composeTask(next);
  const ask = taskQuestion(task);
  const brief = saleFromFacts(next);
  if (ask) return { reply: speak(ask), sale: brief, task };
  return { reply: speak(taskReadyLine(task)), action: saveTaskButton, sale: brief, task };
}

function wordingOf(sale: SaleBrief, plan: string | null, trial = false) {
  const item = sale.item ?? "";
  const city = sale.city ?? "";
  const price = sale.priceRub ?? 0;
  const title = (item[0]?.toUpperCase() ?? "") + item.slice(1);
  const fills = trial || agentFillsProfile(plan);
  const body = fills
    ? `${title}. ${city}. Цена ${price} руб.`
    : `${item}. ${city}. Цена ${price} руб.`;
  const line = fills
    ? `Копирайтер предлагает: «${title}». ${body} Оставить так, поправить словами или прислать свой текст?`
    : `Копирайтер записал ваши слова: «${title}». ${body} Оставить так, поправить словами или прислать свой текст?`;
  return { title: title.slice(0, 50), body, line };
}

async function said(userId: string, content: string) {
  const [row] = await db
    .select({ id: curatorLines.id })
    .from(curatorLines)
    .where(and(eq(curatorLines.userId, userId), eq(curatorLines.content, content)))
    .limit(1);
  return Boolean(row);
}

async function rememberOnce(userId: string, content: string) {
  const clean = speak(content).replaceAll("₽.", "руб.").replaceAll("₽", "руб.");
  if (await said(userId, clean)) return clean;
  await rememberLine(userId, "assistant", clean);
  return clean;
}

async function avitoConnected(userId: string) {
  const [account] = await db
    .select({ status: avitoAccounts.status })
    .from(avitoAccounts)
    .where(eq(avitoAccounts.userId, userId))
    .limit(1);
  return account?.status === "connected";
}

async function latestListing(userId: string) {
  const [row] = await db
    .select()
    .from(listings)
    .where(eq(listings.userId, userId))
    .orderBy(desc(listings.updatedAt))
    .limit(1);
  return row ?? null;
}

async function openAvitoOffer(userId: string) {
  const [row] = await db
    .select()
    .from(curatorOffers)
    .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.action, "avito_have"), eq(curatorOffers.status, "open")))
    .orderBy(desc(curatorOffers.createdAt))
    .limit(1);
  return row ?? null;
}

export async function resumeOpening(userId: string, sale: SaleBrief) {
  const { users } = await import("../db/schema");
  const [consent] = await db.select({ at: users.cabinetConsentAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!consent?.at) {
    const [open] = await db
      .select({ id: curatorOffers.id })
      .from(curatorOffers)
      .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open"), eq(curatorOffers.action, "consent")))
      .limit(1);
    if (!open) {
      await db.insert(curatorOffers).values({
        id: randomUUID(),
        userId,
        action: "consent",
        payload: { sale },
        status: "open",
      });
    }
    const prefix = saleReady(sale) ? `Запомнил: ${sale.item}, ${sale.city}, ${formatRub(sale.priceRub ?? 0)}. ` : "";
    await rememberOnce(userId, `${prefix}${cabinetConsentText}`);
    return "consent" as const;
  }
  if (!(await avitoConnected(userId))) {
    if (!(await openAvitoOffer(userId))) {
      await db.insert(curatorOffers).values({
        id: randomUUID(),
        userId,
        action: "avito_have",
        payload: { sale },
        status: "open",
      });
    }
    await rememberOnce(userId, avitoAskText);
    return "connect" as const;
  }
  const card = await latestListing(userId);
  if (!card) {
    const ask = missingSaleQuestion(sale);
    if (ask) {
      await rememberOnce(userId, ask);
      return "ask" as const;
    }
    const plan = await planOf(userId);
    const wording = wordingOf(sale, plan, await trialLive(userId));
    const [open] = await db
      .select({ id: curatorOffers.id })
      .from(curatorOffers)
      .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open")))
      .limit(1);
    if (!open) {
      await db.insert(curatorOffers).values({
        id: randomUUID(),
        userId,
        action: "publish",
        payload: {
          title: wording.title,
          city: sale.city,
          priceRub: sale.priceRub,
          body: wording.body,
          photoNames: [],
        },
        status: "open",
      });
    }
    await rememberOnce(userId, wording.line);
    return "ask" as const;
  }
  if (card.photos.length === 0 && (card.status === "draft" || card.status === "error")) {
    await rememberOnce(userId, "Остановились на фото. Пришлите снимок в чат. Без фото в Авито карточка не уйдёт, черновик можно смотреть.");
    return "photo" as const;
  }
  const { loadGate } = await import("./gate");
  const gate = await loadGate(userId);
  if (gate.subscription?.paymentProvider === "trial" && gate.block) {
    await rememberOnce(userId, "Карточку смотрим и Авито можно подключить. На площадку встанет после оплаты тарифа.");
    return "pay" as const;
  }
  if (card.status === "queued" || card.status === "publishing" || card.status === "live") {
    await rememberOnce(userId, `Объявление уже в работе. ${nextSteps}`);
  }
  return "ready" as const;
}

export async function guideMember(userId: string, text: string, sale: SaleBrief) {
  const q = text.toLowerCase().replaceAll("ё", "е");
  const card = await latestListing(userId);
  if (/один файл|собери/.test(q) && card) {
    return {
      handled: true as const,
      reply: speak("Это та же карточка: фото, название, цена, город и текст. Отдельный файл не собираю."),
      card: cardOf(userId, card),
      sale,
    };
  }
  if (/поменяй название|смени название|другое название/.test(q)) {
    const title = text.split(/название(?:\s+на)?/i)[1]?.trim().replace(/^[«"]|[»"]$/g, "");
    if (!title || title.length < 2) {
      return { handled: true as const, reply: speak("Какое название поставить? В карточку оно попадёт после «да»."), sale };
    }
    await db
      .update(curatorOffers)
      .set({ status: "dropped" })
      .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open")));
    await db.insert(curatorOffers).values({
      id: randomUUID(),
      userId,
      action: "rename",
      payload: { title: title.slice(0, 50) },
      status: "open",
    });
    return {
      handled: true as const,
      reply: speak(`Название станет «${title.slice(0, 50)}». В карточку оно попадёт после «да».`),
      sale,
    };
  }
  if (/другой текст|поменяй текст|свой текст/.test(q)) {
    const body = text.replace(/.*(?:другой текст|поменяй текст|свой текст)\s*/i, "").trim();
    if (body.length < 2) {
      return { handled: true as const, reply: speak("Пришлите свой текст. В карточку он попадёт после «да»."), sale };
    }
    await db
      .update(curatorOffers)
      .set({ status: "dropped" })
      .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open")));
    await db.insert(curatorOffers).values({
      id: randomUUID(),
      userId,
      action: "reword",
      payload: { body: body.slice(0, 2000) },
      status: "open",
    });
    return { handled: true as const, reply: speak("Текст записал. В карточку он попадёт после «да»."), sale };
  }
  if (!(await avitoConnected(userId))) {
    if (/нет кабинет|кабинета нет|ещё нет|еще нет|не завед/.test(q)) {
      await db
        .update(curatorOffers)
        .set({ status: "accepted" })
        .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.action, "avito_have"), eq(curatorOffers.status, "open")));
      return { handled: true as const, reply: speak(avitoNoText), action: avitoButton, sale };
    }
    return null;
  }
  if (saleReady(sale) && text.trim().length > 12 && !text.includes("?")) {
    const [pending] = await db
      .select()
      .from(curatorOffers)
      .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open"), eq(curatorOffers.action, "publish")))
      .limit(1);
    if (pending) {
      const payload = { ...(pending.payload as Record<string, unknown>), body: text.trim().slice(0, 2000) };
      await db.update(curatorOffers).set({ payload }).where(eq(curatorOffers.id, pending.id));
      return { handled: true as const, reply: speak("Текст записал. В карточку он попадёт после «да»."), sale };
    }
  }
  if (card) return null;
  const next = absorbSale(sale, text);
  if (!saleChanged(sale, next)) return null;
  const ask = missingSaleQuestion(next);
  if (ask) return { handled: true as const, reply: speak(ask), sale: next };
  const plan = await planOf(userId);
  const wording = wordingOf(next, plan, await trialLive(userId));
  await db
    .update(curatorOffers)
    .set({ status: "dropped" })
    .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open")));
  await db.insert(curatorOffers).values({
    id: randomUUID(),
    userId,
    action: "publish",
    payload: {
      title: wording.title,
      city: next.city,
      priceRub: next.priceRub,
      body: wording.body,
      photoNames: [],
    },
    status: "open",
  });
  return { handled: true as const, reply: speak(wording.line), sale: next };
}

