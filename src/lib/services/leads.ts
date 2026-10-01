import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { listings, messagesDigest, users } from "../db/schema";
import { AppError } from "../errors";
import { audit } from "./audit";
import { replySlotOpen } from "./daily";
import { enqueueNotification } from "./notifications";

export async function createDigest(input: {
  userId: string;
  listingId?: string | null;
  preview: string;
  urgency: "hot" | "normal";
  actor: string;
  externalRef?: string | null;
}) {
  const preview = input.preview.trim();
  const externalRef = input.externalRef?.trim() || null;
  if (!preview) throw new AppError("Нужен текст лида");
  if (externalRef) {
    const [existing] = await db
      .select()
      .from(messagesDigest)
      .where(and(eq(messagesDigest.userId, input.userId), eq(messagesDigest.externalRef, externalRef)))
      .limit(1);
    if (existing) return existing;
  }
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || user.role !== "client") throw new AppError("Клиент не найден");
  if (input.listingId) {
    const [listing] = await db
      .select()
      .from(listings)
      .where(and(eq(listings.id, input.listingId), eq(listings.userId, input.userId)))
      .limit(1);
    if (!listing) throw new AppError("Объявление не найдено");
  }
  const [row] = await db
    .insert(messagesDigest)
    .values({
      userId: input.userId,
      listingId: input.listingId ?? null,
      preview,
      externalRef,
      urgency: input.urgency,
      status: "new",
    })
    .returning();
  if (input.urgency === "hot") {
    await enqueueNotification({
      userId: input.userId,
      kind: "hot_lead",
      payload: { preview, digestId: row.id },
    });
  }
  await audit({
    actor: input.actor,
    action: "lead_create",
    entity: "messages_digest",
    entityId: row.id,
    after: { urgency: input.urgency },
  });
  return row;
}

export async function escalateLead(userId: string, digestId: string) {
  const [row] = await db
    .update(messagesDigest)
    .set({ status: "escalated_to_client" })
    .where(and(eq(messagesDigest.id, digestId), eq(messagesDigest.userId, userId)))
    .returning();
  if (!row) throw new AppError("Лид не найден");
  await enqueueNotification({
    userId,
    kind: "lead_escalated",
    payload: { preview: row.preview, digestId },
  });
  return row;
}

export async function templateReply(userId: string, digestId: string) {
  const [row] = await db
    .select()
    .from(messagesDigest)
    .where(and(eq(messagesDigest.id, digestId), eq(messagesDigest.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("Лид не найден");
  if (row.status === "handled") throw new AppError("Лид уже обработан");
  if (!(await replySlotOpen(userId))) throw new AppError("Ответим завтра");
  const [claimed] = await db
    .update(messagesDigest)
    .set({ status: "handled", repliedAt: new Date() })
    .where(
      and(
        eq(messagesDigest.id, digestId),
        eq(messagesDigest.userId, userId),
        eq(messagesDigest.status, row.status),
      ),
    )
    .returning();
  if (!claimed) throw new AppError("Лид уже обработан");
  try {
    const { enqueueJob } = await import("./jobs");
    return await enqueueJob({
      userId,
      type: "reply",
      listingId: row.listingId,
      payload: { thread_ref: row.id, tone: "short" },
      createdBy: userId,
    });
  } catch (error) {
    await db
      .update(messagesDigest)
      .set({ status: row.status, repliedAt: null })
      .where(eq(messagesDigest.id, digestId));
    throw error;
  }
}

export async function releaseReply(digestId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(digestId)) return;
  await db
    .update(messagesDigest)
    .set({ status: "new", repliedAt: null })
    .where(and(eq(messagesDigest.id, digestId), eq(messagesDigest.status, "handled")));
}
