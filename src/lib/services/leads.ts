import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { listings, messagesDigest, users } from "../db/schema";
import { AppError } from "../errors";
import { audit } from "./audit";
import { enqueueNotification } from "./notifications";

export async function createDigest(input: {
  userId: string;
  listingId?: string | null;
  preview: string;
  urgency: "hot" | "normal";
  actor: string;
}) {
  const preview = input.preview.trim();
  if (!preview) throw new AppError("Нужен текст лида");
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
  const { enqueueJob } = await import("./jobs");
  const job = await enqueueJob({
    userId,
    type: "reply",
    listingId: row.listingId,
    payload: { thread_ref: row.id, tone: "short" },
    createdBy: userId,
  });
  await db
    .update(messagesDigest)
    .set({ status: "handled" })
    .where(eq(messagesDigest.id, digestId));
  return job;
}
