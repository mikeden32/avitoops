import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { clientProfiles, curatorLines, curatorOffers, deskTasks, listings, users } from "../db/schema";
import type { Plan } from "../db/schema";
import { AppError } from "../errors";
import { type Upload, assertUploads, compressPhoto, inboxFile } from "../files";
import { askGrok } from "../grok";
import { DAILY_QUOTA, agentFillsProfile } from "../plans";
import { guestPriceLine, speak } from "../curator";
import {
  avitoAskText,
  avitoButton,
  payButton,
  avitoNoText,
  avitoYesText,
  cabinetConsentText,
  cardOf,
  guideGuest,
  guideMember,
  nextSteps,
  resumeOpening,
} from "./guide";
import type { AssistantCard, SaleBrief, TaskState } from "./sale";
import { pauseSubscription } from "./access";
import { getDepositBalance } from "./billing";
import { planOf, queuedCount, quotaFor, slotsTaken, startedToday, trialLive } from "./daily";
import { addDeskTask, copyMonthOpen, copySpendsThisMonth, finishDesign, rememberLine } from "./desk";
import { imageReady } from "./frame";
import { enqueueJob } from "./jobs";
import { createDigest, escalateLead } from "./leads";
import { createListing, updateListing } from "./listings";
import { getProfile } from "./profile";
import { requestPromo } from "./promo";

export type CuratorAction = { href: string; label: string };
export type CuratorResult = {
  handled: boolean;
  reply: string;
  action?: CuratorAction;
  sale?: SaleBrief;
  card?: AssistantCard;
  task?: TaskState;
};

type PublishProposal = {
  action: "publish";
  title: string;
  city: string;
  priceRub: number;
  body: string;
};
type Proposal =
  | PublishProposal
  | { action: "price"; priceRub: number }
  | { action: "photo" }
  | { action: "promo"; maxRub: number }
  | { action: "pause" }
  | { action: "consent" };

const cities: Record<string, string> = {
  туле: "Тула",
  тула: "Тула",
  москве: "Москва",
  москва: "Москва",
  казани: "Казань",
  казань: "Казань",
};

function fold(text: string) {
  return text.toLowerCase().replaceAll("ё", "е");
}

function money(text: string) {
  const thousands = text.match(/(\d+)\s*тысяч/);
  if (thousands) return Number(thousands[1]) * 1000;
  const rub = text.match(/(\d[\d\s]*)\s*(?:₽|руб)/);
  if (rub) return Number(rub[1].replace(/\s/g, ""));
  const plain = text.match(/(?:за|на)\s+(\d{2,7})\b/);
  if (plain) return Number(plain[1]);
  return null;
}

export function isYes(text: string) {
  return /^(да|ок|хорошо|верно|подтверждаю)[.!]?$/i.test(text.trim());
}

export function isKeep(text: string) {
  return /^оставить( так)?[.!]?$/i.test(text.trim());
}

export function isNo(text: string) {
  return /^(нет|не надо|отмена)[.!]?$/i.test(text.trim());
}

export function proposeAssignment(text: string): Proposal | null {
  const raw = text.trim();
  const q = fold(raw);
  if (/[?]/.test(raw) || /как|можно ли|что будет/.test(q)) {
    if (/пауз|останови/.test(q)) return null;
  }
  if (/пауз|останови/.test(q)) return { action: "pause" };
  if (/замен[а-я]*\s+фото|поменя[а-я]*\s+фото|смен[а-я]*\s+фото/.test(q)) return { action: "photo" };
  if (/продвига/.test(q)) {
    const maxRub = money(q);
    if (!maxRub) return null;
    return { action: "promo", maxRub };
  }
  if (/поменяй цену|смени цену|цену на|цена на/.test(q)) {
    const priceRub = money(q);
    if (!priceRub) return null;
    return { action: "price", priceRub };
  }
  if (/вылож|опублик|размест/.test(q)) {
    const priceRub = money(q);
    const cityWord = q.match(/\sв\s+([а-я-]{3,})/)?.[1];
    const item = q.match(/(?:вылож[а-я]*|опублик[а-я]*|размест[а-я]*)\s+([а-я0-9-]{2,})/)?.[1];
    if (!priceRub || !cityWord || !item || item === "объявление") return null;
    const title = item[0].toUpperCase() + item.slice(1);
    const city = cities[cityWord] ?? cityWord[0].toUpperCase() + cityWord.slice(1);
    return { action: "publish", title: title.slice(0, 50), city, priceRub, body: raw };
  }
  return null;
}

function parseModel(raw: string): Proposal | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      action?: string;
      title?: string;
      city?: string;
      priceRub?: number;
      maxRub?: number;
    };
    if (parsed.action === "pause") return { action: "pause" };
    if (parsed.action === "photo") return { action: "photo" };
    if (parsed.action === "promo" && Number.isInteger(parsed.maxRub)) {
      return { action: "promo", maxRub: Number(parsed.maxRub) };
    }
    if (parsed.action === "price" && Number.isInteger(parsed.priceRub)) {
      return { action: "price", priceRub: Number(parsed.priceRub) };
    }
    if (
      parsed.action === "publish" &&
      parsed.title &&
      parsed.city &&
      Number.isInteger(parsed.priceRub)
    ) {
      return {
        action: "publish",
        title: parsed.title.slice(0, 50),
        city: parsed.city.slice(0, 40),
        priceRub: Number(parsed.priceRub),
        body: "",
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function checkedProposal(model: Proposal | null, userText: string): Proposal | null {
  const local = proposeAssignment(userText);
  if (!local) return null;
  if (!model || model.action !== local.action) return local;
  if (local.action === "publish" && model.action === "publish") {
    const words = fold(userText);
    if (model.priceRub !== local.priceRub) return local;
    if (!words.includes(fold(model.city).slice(0, 3))) return local;
    if (!words.includes(fold(model.title))) return local;
    return { ...local, title: model.title.slice(0, 50) };
  }
  if (local.action === "price" && model.action === "price" && model.priceRub === local.priceRub) return local;
  if (local.action === "promo" && model.action === "promo" && model.maxRub === local.maxRub) return local;
  return local;
}

async function modelProposal(text: string) {
  if (!process.env.XAI_API_KEY) return null;
  try {
    const raw = await askGrok(
      "Верни только JSON с полями action (publish, price, photo, promo, pause или none), title, city, priceRub, maxRub. Числа бери из реплики, не выдумывай. Без пояснений.",
      text,
    );
    return raw ? parseModel(raw) : null;
  } catch {
    return null;
  }
}

const consentText = cabinetConsentText;

async function consented(userId: string) {
  const [row] = await db
    .select({ at: users.cabinetConsentAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(row?.at);
}

async function openOffer(userId: string) {
  const [row] = await db
    .select()
    .from(curatorOffers)
    .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open")))
    .orderBy(desc(curatorOffers.createdAt))
    .limit(1);
  return row ?? null;
}

async function dropOpen(userId: string) {
  const current = await openOffer(userId);
  if (!current) return;
  const names = photoNames(current.payload);
  await db.update(curatorOffers).set({ status: "dropped" }).where(eq(curatorOffers.id, current.id));
  await removeInbox(userId, names);
}

function photoNames(payload: Record<string, unknown>) {
  return Array.isArray(payload.photoNames) ? payload.photoNames.filter((name) => typeof name === "string") : [];
}

async function saveInbox(userId: string, offerId: string, photos: Upload[]) {
  assertUploads(photos);
  const names: string[] = [];
  for (const photo of photos) {
    if (photo.bytes.length === 0 || photo.mime.startsWith("audio/")) continue;
    const stored = await compressPhoto(photo.bytes);
    const name = `${offerId}-${names.length}.jpg`;
    const full = inboxFile(userId, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeNamed(full, stored);
    names.push(name);
  }
  return names;
}

async function writeNamed(full: string, bytes: Buffer) {
  await writeFile(full, bytes);
}

async function removeInbox(userId: string, names: string[]) {
  for (const name of names) {
    await rm(inboxFile(userId, name), { force: true }).catch(() => undefined);
  }
}

async function readInbox(userId: string, names: string[]): Promise<Upload[]> {
  const uploads: Upload[] = [];
  for (const name of names) {
    const bytes = await readFile(inboxFile(userId, name));
    uploads.push({ filename: name, mime: "image/jpeg", bytes });
  }
  return uploads;
}

async function answer(
  userId: string,
  userText: string,
  reply: string,
  action?: CuratorAction,
  card?: AssistantCard,
): Promise<CuratorResult> {
  const clean = speak(reply);
  await rememberLine(userId, "user", userText);
  await rememberLine(userId, "assistant", clean, card?.href);
  return { handled: true, reply: clean, action, card };
}

async function publishReadyDraft(userId: string, message: string): Promise<CuratorResult> {
  const [listing] = await db.select().from(listings).where(eq(listings.userId, userId)).orderBy(desc(listings.updatedAt)).limit(1);
  if (!listing || (listing.status !== "draft" && listing.status !== "error")) {
    return answer(userId, message, "Подтверждать пока нечего. Сначала скажите, что сделать.");
  }
  const shown = cardOf(userId, listing);
  if (listing.photos.length === 0) {
    return answer(userId, message, "Без кадра в Авито не отправлю.", undefined, shown);
  }
  const { loadGate } = await import("./gate");
  const gate = await loadGate(userId);
  if (gate.block) {
    const action = gate.block.includes("оплат") ? payButton : undefined;
    return answer(userId, message, gate.block, action, shown);
  }
  try {
    await enqueueJob({
      userId,
      type: "publish",
      listingId: listing.id,
      payload: { listing_id: listing.id, quota_hold: true },
      createdBy: userId,
    });
  } catch (error) {
    const note = error instanceof AppError ? error.message : "Не получилось отдать задачу.";
    return answer(userId, message, note, undefined, shown);
  }
  return answer(userId, message, `Выкладка заняла одно место нормы этих суток. ${nextSteps}`, undefined, shown);
}

function planReply(proposal: Proposal, photos: number, plan: Plan | null, trial = false) {
  if (proposal.action === "pause") {
    return "Пауза остановит тексты, фото, продвижение и ответы. Подтвердите.";
  }
  if (proposal.action === "promo") {
    return `Продвижение на ${proposal.maxRub} ₽ поставим после подтверждения. Сумму берём ту, что вы назвали.`;
  }
  if (proposal.action === "price") {
    return `Правку цены на ${proposal.priceRub} ₽ отдаём копирайтеру. Это не новая выкладка. Подтвердите.`;
  }
  if (proposal.action === "photo") {
    return "Замену фото отдаём дизайнеру. Это правка, не новый текст. Подтвердите.";
  }
  if (proposal.action !== "publish") return "Подтвердите, если это нужно сделать.";
  const photo = photos > 0 ? "Фото у дизайнера." : "Фото пока нет, без него выкладка не стартует.";
  const wording =
    (trial || (plan && agentFillsProfile(plan)))
      ? ` Копирайтер предлагает формулировку: «${proposal.title}. ${proposal.city}. Цена ${proposal.priceRub} ₽». В карточку она попадёт после подтверждения.`
      : "";
  return `Текст отдаём копирайтеру, фото — дизайнеру. Затем объявление встанет в выкладку и займёт одно место из нормы этих суток. ${photo}${wording} Подтвердите.`;
}

async function editableListing(userId: string) {
  const rows = await db.select().from(listings).where(eq(listings.userId, userId)).orderBy(desc(listings.updatedAt));
  return rows.find((row) => row.status === "live" || row.status === "draft" || row.status === "paused" || row.status === "error") ?? null;
}

async function distinctCard(userId: string, title: string, body: string, city: string, priceRub: number) {
  const rows = await db
    .select({ title: listings.title, body: listings.body })
    .from(listings)
    .where(eq(listings.userId, userId));
  let nextTitle = title;
  let nextBody = body;
  const titles = new Set(rows.map((row) => row.title.trim()));
  const leads = new Set(rows.map((row) => row.body.trim().split("\n")[0]));
  if (titles.has(nextTitle)) nextTitle = `${title}, ${city}`.slice(0, 50);
  if (titles.has(nextTitle)) nextTitle = `${title}, ${priceRub} руб.`.slice(0, 50);
  if (leads.has(nextBody.split("\n")[0])) nextBody = `${body}\n${city}, ${priceRub} руб.`;
  return { title: nextTitle, body: nextBody };
}

async function execute(userId: string, action: string, payload: Record<string, unknown>): Promise<CuratorResult> {
  if (action === "consent") {
    await db.update(users).set({ cabinetConsentAt: new Date() }).where(eq(users.id, userId));
    await db.insert(curatorOffers).values({
      id: randomUUID(),
      userId,
      action: "avito_have",
      payload: {},
      status: "open",
    });
    return { handled: true, reply: speak(`Согласие есть. ${avitoAskText}`) };
  }
  if (action === "avito_have") {
    return { handled: true, reply: speak(avitoYesText), action: avitoButton };
  }
  if (!(await consented(userId))) {
    return { handled: true, reply: speak(consentText) };
  }
  if (action !== "pause") {
    const { loadGate } = await import("./gate");
    const gate = await loadGate(userId);
    if (gate.block) return { handled: true, reply: speak(gate.block) };
  }
  const plan = await planOf(userId);
  if (action === "pause") {
    await pauseSubscription(userId, userId);
    return { handled: true, reply: speak("Остановили тексты, фото, продвижение и ответы.") };
  }
  if (action === "promo") {
    const maxRub = Number(payload.maxRub ?? 0);
    const live = (
      await db.select().from(listings).where(eq(listings.userId, userId)).orderBy(desc(listings.updatedAt))
    ).find((row) => row.status === "live");
    if (!live) return { handled: true, reply: speak("Нет выложенного объявления для продвижения.") };
    const deposit = await getDepositBalance(userId);
    if (deposit <= 0) {
      return {
        handled: true,
        reply: speak("Депозита не хватает, задачу продвижения не ставлю."),
        action: { href: "/app/billing", label: "Пополнить депозит" },
      };
    }
    try {
      await requestPromo(userId, live.id, maxRub, userId);
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Задачу продвижения не ставлю.";
      return { handled: true, reply: speak(message) };
    }
    await addDeskTask({
      userId,
      role: "promo",
      listingId: live.id,
      payload: { maxRub },
      status: "done",
    });
    return { handled: true, reply: speak(`Продвижение на ${maxRub} ₽ отдано. Оплату ассистент сам не проводит.`) };
  }
  if (action === "price" || action === "photo") {
    const listing = await editableListing(userId);
    if (!listing) return { handled: true, reply: speak("Нет объявления для этой правки.") };
    const quota = plan ? DAILY_QUOTA[plan].update : 0;
    const hold = quota > 0 && (await slotsTaken(userId, "update")) < quota;
    if (action === "price") {
      const priceRub = Number(payload.priceRub ?? 0);
      await addDeskTask({
        userId,
        role: "copy",
        listingId: listing.id,
        payload: { kind: "price", spend: false, priceRub },
        status: "done",
      });
      await updateListing(
        userId,
        listing.id,
        {
          title: listing.title,
          category: listing.category,
          city: listing.city,
          priceRub,
          body: listing.body,
          sku: listing.sku ?? undefined,
          deliveryNote: listing.deliveryNote ?? undefined,
          kitNote: listing.kitNote ?? undefined,
          operatorNotes: listing.operatorNotes ?? undefined,
        },
        [],
        [],
        "draft",
      );
      await enqueueJob({
        userId,
        type: "update",
        listingId: listing.id,
        payload: { listing_id: listing.id, fields: ["price"], quota_hold: hold },
        createdBy: userId,
      });
      return { handled: true, reply: speak("Копирайтер получил правку цены. Это не новая выкладка.") };
    }
    const names = photoNames(payload);
    const uploads = await readInbox(userId, names);
    if (uploads.length === 0) return { handled: true, reply: speak("Для замены нужно фото в чате. Выкладку это не открывает.") };
    await addDeskTask({
      userId,
      role: "design",
      listingId: listing.id,
      payload: { kind: "photo" },
      status: "done",
    });
    await addDeskTask({
      userId,
      role: "copy",
      listingId: listing.id,
      payload: { kind: "photo", spend: false },
      status: "done",
    });
    await updateListing(
      userId,
      listing.id,
      {
        title: listing.title,
        category: listing.category,
        city: listing.city,
        priceRub: listing.priceRub,
        body: listing.body,
        sku: listing.sku ?? undefined,
        deliveryNote: listing.deliveryNote ?? undefined,
        kitNote: listing.kitNote ?? undefined,
        operatorNotes: listing.operatorNotes ?? undefined,
      },
      uploads,
      [],
      "draft",
    );
    await enqueueJob({
      userId,
      type: "update",
      listingId: listing.id,
      payload: { listing_id: listing.id, fields: ["photos"], quota_hold: hold },
      createdBy: userId,
    });
    await removeInbox(userId, names);
    return { handled: true, reply: speak("Дизайнер заменил фото. Это правка, не новый текст.") };
  }
  if (action === "rename" || action === "reword") {
    const listing = await editableListing(userId);
    if (!listing) return { handled: true, reply: speak("Нет объявления для этой правки.") };
    const title = action === "rename" ? String(payload.title ?? listing.title).slice(0, 50) : listing.title;
    const body = action === "reword" ? String(payload.body ?? listing.body) : listing.body;
    await addDeskTask({
      userId,
      role: "copy",
      listingId: listing.id,
      payload: { kind: action, spend: false },
      status: "done",
    });
    await updateListing(
      userId,
      listing.id,
      {
        title,
        category: listing.category,
        city: listing.city,
        priceRub: listing.priceRub,
        body,
        sku: listing.sku ?? undefined,
        deliveryNote: listing.deliveryNote ?? undefined,
        kitNote: listing.kitNote ?? undefined,
        operatorNotes: listing.operatorNotes ?? undefined,
      },
      [],
      [],
      "draft",
    );
    if (listing.status === "live") {
      const quota = plan ? DAILY_QUOTA[plan].update : 0;
      const hold = quota > 0 && (await slotsTaken(userId, "update")) < quota;
      await enqueueJob({
        userId,
        type: "update",
        listingId: listing.id,
        payload: { listing_id: listing.id, fields: [action === "rename" ? "title" : "body"], quota_hold: hold },
        createdBy: userId,
      });
    }
    const saved = await editableListing(userId);
    return {
      handled: true,
      reply: speak(action === "rename" ? "Копирайтер записал новое название." : "Копирайтер записал новый текст."),
      card: saved ? cardOf(userId, saved) : undefined,
    };
  }
  if (action !== "publish") return { handled: true, reply: speak("Это действие ассистент не отдаёт.") };
  const title = String(payload.title ?? "").trim();
  const city = String(payload.city ?? "").trim();
  const priceRub = Number(payload.priceRub ?? 0);
  const given = String(payload.body ?? "").trim();
  if (!plan) return { handled: true, reply: speak("Сначала выберите тариф.") };
  const limits = await quotaFor(userId);
  if (limits?.trial) {
    const used = (await startedToday(userId, "publish")) + (await queuedCount(userId, "publish"));
    if (used >= 1) {
      return {
        handled: true,
        reply: speak("В пробные сутки выкладывается одно объявление. Следующее уйдёт после оплаты тарифа."),
        action: payButton,
      };
    }
  }
  const spent = await copySpendsThisMonth(userId);
  if (!copyMonthOpen(plan, spent)) {
    return { handled: true, reply: speak("Новые тексты этого месяца уже выбраны. Город, адрес и цену можно поменять отдельно.") };
  }
  const names = photoNames(payload);
  const uploads = names.length ? await readInbox(userId, names) : [];
  const card = limits?.trial || agentFillsProfile(plan)
    ? { title, body: `${title}. ${city}. Цена ${priceRub} руб.` }
    : { title, body: given || title };
  const unique = await distinctCard(userId, card.title, card.body, city, priceRub);
  const profile = await getProfile(userId);
  const copyTask = await addDeskTask({
    userId,
    role: "copy",
    payload: { kind: "new_text", spend: true, title: unique.title, body: unique.body, city, priceRub },
    status: "done",
  });
  const canPaint = uploads.length === 0 && imageReady();
  const designTask = await addDeskTask({
    userId,
    role: "design",
    payload: { hasPhoto: uploads.length > 0, paint: canPaint },
    status: uploads.length > 0 ? "done" : canPaint ? "queued" : "hold",
  });
  const room = (await slotsTaken(userId, "publish")) < (limits?.quota.publish ?? DAILY_QUOTA[plan].publish);
  const saved = await createListing(
    userId,
    {
      title: unique.title,
      category: profile?.categories[0] || unique.title,
      city,
      priceRub,
      body: unique.body,
    },
    uploads,
    "draft",
    { allowEmptyPhoto: uploads.length === 0 },
  );
  await db.update(deskTasks).set({ listingId: saved.id }).where(eq(deskTasks.id, copyTask.id));
  await db.update(deskTasks).set({ listingId: saved.id }).where(eq(deskTasks.id, designTask.id));
  const shown = cardOf(userId, { ...saved, photos: saved.photos ?? [] });
  if (uploads.length === 0) {
    return {
      handled: true,
      reply: speak("Черновик можно смотреть. Дизайнер ждёт фото: без него в Авито карточка не уйдёт."),
      card: shown,
    };
  }
  await enqueueJob({
    userId,
    type: "publish",
    listingId: saved.id,
    payload: { listing_id: saved.id, quota_hold: room },
    createdBy: userId,
  });
  await finishDesign(saved.id);
  await removeInbox(userId, names);
  if (!room) {
    return {
      handled: true,
      reply: speak("Норма этих суток выбрана. Следующее объявление уйдёт, когда сутки сменятся."),
      card: shown,
    };
  }
  const freeLine = limits?.trial ? "Это бесплатное объявление пробных суток." : "Выкладка заняла одно место нормы этих суток.";
  return {
    handled: true,
    reply: speak(`Копирайтер получил текст, дизайнер — фото. ${freeLine} ${nextSteps}`),
    card: shown,
  };
}

export async function keepCopyWording(userId: string, message: string): Promise<CuratorResult> {
  const current = await openOffer(userId);
  if (!current || (current.action !== "publish" && current.action !== "reword" && current.action !== "rename")) {
    return answer(userId, message, "Пока нечего оставлять. Сначала соберём текст.");
  }
  await db
    .update(curatorOffers)
    .set({ payload: { ...current.payload, kept: true } })
    .where(eq(curatorOffers.id, current.id));
  return answer(userId, message, "Текст останется таким. В карточку он попадёт после «да».");
}

export async function confirmPromoStake(userId: string): Promise<CuratorResult> {
  const current = await openOffer(userId);
  if (!current || current.action !== "promo") {
    return {
      handled: true,
      reply: speak("Сначала назовите сумму ассистенту. В первое объявление продвижение само не входит."),
    };
  }
  return confirm(userId, "да", []);
}

export async function curatorTurn(
  userId: string | null,
  text: string,
  photos: Upload[] = [],
  options?: { useModel?: boolean; sale?: SaleBrief },
): Promise<CuratorResult> {
  const message = text.trim();
  const sale = options?.sale ?? {};
  if (!message) return { handled: false, reply: "" };
  if (!userId) {
    if (proposeAssignment(message) || isYes(message) || isNo(message) || /вылож|пауз|продвига|цену/.test(fold(message))) {
      return { handled: true, reply: speak(`${guestPriceLine()} Задачи без регистрации не создаются.`) };
    }
    const guest = guideGuest(message, sale);
    if (guest) return { handled: true, reply: guest.reply, action: guest.action, sale: guest.sale, task: guest.task };
    return { handled: false, reply: "" };
  }
  const images = photos.filter((item) => item.bytes.length > 0 && !item.mime.startsWith("audio/"));
  if (isYes(message)) {
    const current = await openOffer(userId);
    if (!current) return publishReadyDraft(userId, message);
    return confirm(userId, message, images);
  }
  if (isNo(message)) {
    const current = await openOffer(userId);
    if (!current) return { handled: false, reply: "" };
    if (current.action === "avito_have") {
      await db.update(curatorOffers).set({ status: "accepted" }).where(eq(curatorOffers.id, current.id));
      return answer(userId, message, avitoNoText, avitoButton);
    }
    await dropOpen(userId);
    return answer(userId, message, "Хорошо, задачу не ставлю.");
  }
  if (!(await consented(userId))) {
    await dropOpen(userId);
    const id = randomUUID();
    await db.insert(curatorOffers).values({ id, userId, action: "consent", payload: {}, status: "open" });
    return answer(userId, message, consentText);
  }
  if (isKeep(message)) return keepCopyWording(userId, message);
  const local = proposeAssignment(message);
  if (!local && /вылож|опублик|размест/.test(fold(message))) {
    return answer(userId, message, "Напишите, что выложить, за какую цену и в каком городе. Фото приложите в чат.");
  }
  if (!local && /поменяй цену|смени цену/.test(fold(message))) {
    return answer(userId, message, "На какую цену поменять? Это будет правка, не новая выкладка.");
  }
  if (!local) {
    const guided = await guideMember(userId, message, sale);
    if (guided) return guided;
    return { handled: false, reply: "" };
  }
  const model = options?.useModel ? await modelProposal(message) : null;
  const proposal = checkedProposal(model, message) ?? local;
  await dropOpen(userId);
  const id = randomUUID();
  let names: string[] = [];
  try {
    names = images.length ? await saveInbox(userId, id, images) : [];
  } catch (error) {
    const note = error instanceof AppError ? error.message : "Фото не прочиталось.";
    return answer(userId, message, note);
  }
  const plan = await planOf(userId);
  const trial = await trialLive(userId);
  const payload =
    proposal.action === "publish"
      ? { title: proposal.title, city: proposal.city, priceRub: proposal.priceRub, body: proposal.body, photoNames: names }
      : proposal.action === "price"
        ? { priceRub: proposal.priceRub, photoNames: names }
        : proposal.action === "promo"
          ? { maxRub: proposal.maxRub, photoNames: names }
          : { photoNames: names };
  await db.insert(curatorOffers).values({ id, userId, action: proposal.action, payload, status: "open" });
  return answer(userId, message, planReply(proposal, names.length, plan, trial));
}

async function confirm(userId: string, message: string, photos: Upload[]): Promise<CuratorResult> {
  const current = await openOffer(userId);
  if (!current) return answer(userId, message, "Подтверждать пока нечего. Сначала скажите, что сделать.");
  const claimed = await db
    .update(curatorOffers)
    .set({ status: "accepted" })
    .where(and(eq(curatorOffers.id, current.id), eq(curatorOffers.status, "open")))
    .returning();
  if (!claimed[0]) return answer(userId, message, "Подтверждать пока нечего. Сначала скажите, что сделать.");
  let payload = { ...current.payload };
  if (photos.length) {
    try {
      const extra = await saveInbox(userId, current.id, photos);
      payload = { ...payload, photoNames: [...photoNames(payload), ...extra] };
      await db.update(curatorOffers).set({ payload }).where(eq(curatorOffers.id, current.id));
    } catch (error) {
      const note = error instanceof AppError ? error.message : "Фото не прочиталось.";
      return answer(userId, message, note);
    }
  }
  try {
    const done = await execute(userId, current.action, payload);
    await rememberLine(userId, "user", message);
    await rememberLine(userId, "assistant", done.reply, done.card?.href);
    return { ...done, handled: true };
  } catch (error) {
    const note = error instanceof AppError ? error.message : "Не получилось отдать задачу.";
    return answer(userId, message, note);
  }
}

function wantsHuman(rules: string | null, text: string) {
  if (!rules?.trim()) return false;
  const hay = fold(text);
  return rules
    .split(/[,;\n]/)
    .map((part) => fold(part.trim()))
    .filter((part) => part.length >= 4)
    .some((part) => hay.includes(part));
}

export async function repliesAllowed(userId: string) {
  if (!(await consented(userId))) return false;
  const plan = await planOf(userId);
  if (!plan) return false;
  const { loadGate } = await import("./gate");
  const gate = await loadGate(userId);
  return !gate.block;
}

export async function routeBuyerMessage(userId: string, text: string, externalRef: string) {
  const [profile] = await db
    .select({ escalateRules: clientProfiles.escalateRules })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId))
    .limit(1);
  const hot = wantsHuman(profile?.escalateRules ?? null, text);
  const row = await createDigest({
    userId,
    preview: text,
    urgency: hot ? "hot" : "normal",
    actor: "curator",
    externalRef,
  });
  if (row.status !== "new") return hot ? "client" : "reply";
  if (hot) {
    await escalateLead(userId, row.id);
    const note = speak(`Покупатель написал: «${text.trim().slice(0, 400)}». Это из списка, когда писать вам. На Авито не отвечаем.`);
    await rememberLine(userId, "assistant", note);
    await addDeskTask({
      userId,
      role: "reply",
      listingId: row.listingId,
      payload: { digestId: row.id, preview: text.trim().slice(0, 400), escalated: true },
      status: "done",
    });
    return "client";
  }
  if (!(await repliesAllowed(userId))) return "hold";
  await addDeskTask({
    userId,
    role: "reply",
    listingId: row.listingId,
    payload: { digestId: row.id },
  });
  return "reply";
}

export async function ensureCuratorOpening(userId: string, sale: SaleBrief = {}) {
  return resumeOpening(userId, sale);
}
