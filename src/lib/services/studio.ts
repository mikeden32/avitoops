import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { curatorOffers, deskTasks, listings, messagesDigest } from "../db/schema";
import { AppError } from "../errors";
import { getDepositBalance } from "./billing";
import { addDeskTask, finishDesign, loadDeskMarks } from "./desk";
import { askGrok } from "../grok";
import { imageReady, paintFrame } from "./frame";
import { replaceListingPhoto } from "./listings";
import { currentPromo } from "./promo";
import type { Upload } from "../files";

export async function loadStudio(userId: string) {
  const desk = await loadDeskMarks(userId);
  const [listing] = await db.select().from(listings).where(eq(listings.userId, userId)).orderBy(desc(listings.updatedAt)).limit(1);
  const [offer] = await db
    .select()
    .from(curatorOffers)
    .where(and(eq(curatorOffers.userId, userId), eq(curatorOffers.status, "open")))
    .orderBy(desc(curatorOffers.createdAt))
    .limit(1);
  const [lead] = await db
    .select()
    .from(messagesDigest)
    .where(eq(messagesDigest.userId, userId))
    .orderBy(desc(messagesDigest.createdAt))
    .limit(1);
  const budget = await currentPromo(userId);
  const depositRub = await getDepositBalance(userId);
  const namedRaw = offer?.action === "promo" ? offer.payload.maxRub : desk.marks.promo.task?.payload.maxRub;
  const named = Number(namedRaw ?? 0);
  return {
    desk,
    listing: listing ?? null,
    offer: offer ?? null,
    lead: lead ?? null,
    depositRub,
    spentRub: budget.spentRub,
    weekLimitRub: budget.weekLimitRub,
    promoRub: Number.isFinite(named) ? named : 0,
    image: imageReady(),
  };
}

export async function queueFrame(userId: string) {
  if (!imageReady()) return { queued: false as const };
  const [listing] = await db.select().from(listings).where(eq(listings.userId, userId)).orderBy(desc(listings.updatedAt)).limit(1);
  if (!listing) throw new AppError("Сначала нужен текст объявления.");
  await db
    .update(deskTasks)
    .set({ status: "canceled", finishedAt: new Date() })
    .where(and(eq(deskTasks.userId, userId), eq(deskTasks.role, "design"), eq(deskTasks.status, "queued")));
  await addDeskTask({
    userId,
    role: "design",
    listingId: listing.id,
    payload: { paint: true },
    status: "queued",
  });
  return { queued: true as const };
}

export async function completeFrame(userId: string) {
  const [task] = await db
    .select()
    .from(deskTasks)
    .where(and(eq(deskTasks.userId, userId), eq(deskTasks.role, "design"), eq(deskTasks.status, "queued")))
    .orderBy(desc(deskTasks.createdAt))
    .limit(1);
  if (!task?.listingId || task.payload.paint !== true) return;
  const [listing] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, task.listingId), eq(listings.userId, userId)))
    .limit(1);
  if (!listing) {
    await finishDesign(task.listingId);
    return;
  }
  const bytes = await paintFrame(
    `Квадратный кадр товара без надписей и водяных знаков. ${listing.title}. ${listing.city}. ${listing.body}`,
  );
  if (!bytes) {
    await db
      .update(deskTasks)
      .set({ status: "hold", finishedAt: null, payload: { ...task.payload, paint: false } })
      .where(eq(deskTasks.id, task.id));
    return;
  }
  try {
    await replaceListingPhoto(userId, listing.id, [{ filename: "frame.jpg", mime: "image/jpeg", bytes }]);
    await finishDesign(listing.id);
  } catch {
    await db
      .update(deskTasks)
      .set({ status: "hold", finishedAt: null, payload: { ...task.payload, paint: false } })
      .where(eq(deskTasks.id, task.id));
  }
}

export async function keepOwnPhoto(userId: string, uploads: Upload[]) {
  const [listing] = await db.select().from(listings).where(eq(listings.userId, userId)).orderBy(desc(listings.updatedAt)).limit(1);
  if (!listing) throw new AppError("Сначала нужен текст объявления.");
  const saved = await replaceListingPhoto(userId, listing.id, uploads);
  await db
    .update(deskTasks)
    .set({ status: "done", finishedAt: new Date(), listingId: saved.id })
    .where(and(eq(deskTasks.userId, userId), eq(deskTasks.role, "design"), eq(deskTasks.status, "queued")));
  const pending = await db
    .select({ id: deskTasks.id })
    .from(deskTasks)
    .where(and(eq(deskTasks.userId, userId), eq(deskTasks.role, "design"), eq(deskTasks.status, "done"), eq(deskTasks.listingId, saved.id)))
    .limit(1);
  if (!pending[0]) {
    await addDeskTask({
      userId,
      role: "design",
      listingId: saved.id,
      payload: { hasPhoto: true },
      status: "done",
    });
  }
  return saved;
}

export async function completeReply(userId: string) {
  const [task] = await db
    .select()
    .from(deskTasks)
    .where(and(eq(deskTasks.userId, userId), eq(deskTasks.role, "reply"), eq(deskTasks.status, "queued")))
    .orderBy(desc(deskTasks.createdAt))
    .limit(1);
  if (!task || task.payload.escalated === true) return;
  let preview = typeof task.payload.preview === "string" ? task.payload.preview : "";
  if (!preview && typeof task.payload.digestId === "string") {
    const [lead] = await db
      .select({ preview: messagesDigest.preview })
      .from(messagesDigest)
      .where(eq(messagesDigest.id, task.payload.digestId))
      .limit(1);
    preview = lead?.preview ?? "";
  }
  let drafted: string | null = null;
  if (preview) {
    try {
      drafted = await askGrok(
        "Напиши короткий ответ покупателю по-русски, 1-2 предложения. Не обещай место в поиске, число заявок и обход правил. Не называй служебные имена.",
        preview.slice(0, 500),
      );
    } catch {
      drafted = null;
    }
  }
  const answer = drafted?.trim() || "Здравствуйте. Напишите, что для вас важно, ответим по правилам объявления.";
  await db
    .update(deskTasks)
    .set({
      status: "done",
      finishedAt: new Date(),
      payload: { ...task.payload, preview, answer },
    })
    .where(eq(deskTasks.id, task.id));
}
