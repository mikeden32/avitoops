import { rm } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { listings, subscriptions, users } from "../db/schema";
import type { ListingStatus } from "../db/schema";
import { AppError } from "../errors";
import { assertUploads, safeJoin, saveUploads, type Upload } from "../files";
import { getProfile } from "./profile";
import { enqueueJob } from "./jobs";

export type ListingInput = {
  title: string;
  category: string;
  city: string;
  priceRub: number;
  body: string;
  sku?: string;
  deliveryNote?: string;
  kitNote?: string;
  operatorNotes?: string;
};

const sendable = new Set<ListingStatus>(["draft", "error", "paused"]);

async function assertCanCreate(userId: string) {
  const profile = await getProfile(userId);
  const [person] = await db
    .select({ consent: users.cabinetConsentAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!profile && !person?.consent) throw new AppError("Сначала нужно согласие на ведение кабинета");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (
    sub?.paymentProvider === "trial" &&
    (sub.status !== "active" || sub.currentPeriodEnd.getTime() <= Date.now())
  ) {
    throw new AppError("Пробные сутки закончились. Чтобы продолжить, нужна оплата тарифа.");
  }
  if (!sub || (sub.status !== "active" && sub.status !== "past_due")) {
    throw new AppError("Создавать объявления можно после оплаты тарифа");
  }
}

export async function createListing(
  userId: string,
  input: ListingInput,
  uploads: Upload[],
  intent: "draft" | "send",
  options?: { allowEmptyPhoto?: boolean },
) {
  validateListing(input);
  assertUploads(uploads);
  await assertCanCreate(userId);
  const [created] = await db
    .insert(listings)
    .values({
      userId,
      title: input.title.trim(),
      category: input.category.trim(),
      city: input.city.trim(),
      priceRub: input.priceRub,
      body: input.body.trim(),
      photos: [],
      sku: clean(input.sku),
      deliveryNote: clean(input.deliveryNote),
      kitNote: clean(input.kitNote),
      operatorNotes: clean(input.operatorNotes),
      status: "draft",
    })
    .returning();
  if (uploads.length === 0 && options?.allowEmptyPhoto) return created;
  let photos: string[];
  try {
    photos = await saveUploads(userId, created.id, uploads);
  } catch (error) {
    await db.delete(listings).where(eq(listings.id, created.id));
    throw error;
  }
  if (photos.length === 0) {
    await db.delete(listings).where(eq(listings.id, created.id));
    throw new AppError("Добавьте хотя бы одно фото");
  }
  const [saved] = await db
    .update(listings)
    .set({ photos, updatedAt: new Date() })
    .where(eq(listings.id, created.id))
    .returning();
  if (intent === "send") {
    try {
      await enqueueJob({
        userId,
        type: "publish",
        listingId: saved.id,
        payload: { listing_id: saved.id },
        createdBy: userId,
      });
    } catch (error) {
      await discardListing(userId, saved.id, saved.photos);
      throw error;
    }
  }
  return saved;
}

async function discardListing(userId: string, listingId: string, photos: string[]) {
  for (const name of photos) {
    await rm(safeJoin(userId, listingId, name), { force: true });
  }
  await db.delete(listings).where(and(eq(listings.id, listingId), eq(listings.userId, userId)));
}

export async function updateListing(
  userId: string,
  listingId: string,
  input: ListingInput,
  uploads: Upload[],
  remove: string[],
  intent: "draft" | "send",
) {
  validateListing(input);
  const listing = await ownListing(userId, listingId);
  if (listing.status === "queued" || listing.status === "publishing") {
    throw new AppError("Объявление уже в работе");
  }
  const photos = listing.photos.filter((name) => !remove.includes(name));
  assertUploads(uploads, photos.length);
  const added = await saveUploads(userId, listing.id, uploads);
  const nextPhotos = [...photos, ...added];
  if (nextPhotos.length === 0 && intent !== "draft") throw new AppError("Добавьте хотя бы одно фото");
  const changed = changedFields(listing, input, nextPhotos);
  const [saved] = await db
    .update(listings)
    .set({
      title: input.title.trim(),
      category: input.category.trim(),
      city: input.city.trim(),
      priceRub: input.priceRub,
      body: input.body.trim(),
      photos: nextPhotos,
      sku: clean(input.sku),
      deliveryNote: clean(input.deliveryNote),
      kitNote: clean(input.kitNote),
      operatorNotes: clean(input.operatorNotes),
      updatedAt: new Date(),
    })
    .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
    .returning();
  if (intent === "send") {
    if (listing.status === "live") {
      if (changed.length === 0) throw new AppError("Нет изменений для обновления");
      await enqueueJob({
        userId,
        type: "update",
        listingId,
        payload: { listing_id: listingId, fields: changed },
        createdBy: userId,
      });
    } else if (sendable.has(listing.status)) {
      await enqueueJob({
        userId,
        type: "publish",
        listingId,
        payload: { listing_id: listingId },
        createdBy: userId,
      });
    } else {
      throw new AppError("Это объявление нельзя отправить в работу");
    }
  }
  return saved;
}

export async function movePhoto(userId: string, listingId: string, filename: string, dir: "up" | "down") {
  const listing = await ownListing(userId, listingId);
  const photos = [...listing.photos];
  const index = photos.indexOf(filename);
  if (index < 0) throw new AppError("Фото не найдено");
  const target = dir === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= photos.length) return listing;
  const [item] = photos.splice(index, 1);
  photos.splice(target, 0, item);
  const [saved] = await db
    .update(listings)
    .set({ photos, updatedAt: new Date() })
    .where(eq(listings.id, listingId))
    .returning();
  return saved;
}

export async function replaceListingPhoto(userId: string, listingId: string, uploads: Upload[]) {
  const listing = await ownListing(userId, listingId);
  if (listing.status === "queued" || listing.status === "publishing") {
    throw new AppError("Объявление уже в работе");
  }
  assertUploads(uploads);
  const added = await saveUploads(userId, listing.id, uploads);
  if (added.length === 0) throw new AppError("Добавьте хотя бы одно фото");
  for (const name of listing.photos) {
    await rm(safeJoin(userId, listing.id, name), { force: true });
  }
  const [saved] = await db
    .update(listings)
    .set({ photos: added, updatedAt: new Date() })
    .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
    .returning();
  return saved;
}

export async function ownListing(userId: string, listingId: string) {
  const [listing] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
    .limit(1);
  if (!listing) throw new AppError("Объявление не найдено");
  return listing;
}

function validateListing(input: ListingInput) {
  if (!input.title.trim() || input.title.trim().length > 50) {
    throw new AppError("Заголовок обязателен, до 50 символов");
  }
  if (!input.category.trim() || !input.city.trim() || !input.body.trim()) {
    throw new AppError("Заполните категорию, город и описание");
  }
  if (!Number.isInteger(input.priceRub) || input.priceRub < 0) {
    throw new AppError("Укажите цену в рублях");
  }
}

function clean(value?: string) {
  const text = value?.trim();
  return text ? text : null;
}

function changedFields(
  listing: typeof listings.$inferSelect,
  input: ListingInput,
  photos: string[],
) {
  const fields: string[] = [];
  if (listing.title !== input.title.trim()) fields.push("title");
  if (listing.category !== input.category.trim()) fields.push("category");
  if (listing.city !== input.city.trim()) fields.push("city");
  if (listing.priceRub !== input.priceRub) fields.push("price");
  if (listing.body !== input.body.trim()) fields.push("body");
  if (JSON.stringify(listing.photos) !== JSON.stringify(photos)) fields.push("photos");
  return fields;
}
