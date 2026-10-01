import { eq } from "drizzle-orm";
import { db } from "../db";
import { accessStatus, avitoAccounts, subscriptions } from "../db/schema";
import type { AccessState } from "../db/schema";
import { AppError } from "../errors";
import { isAccessState } from "../policy";
import { audit } from "./audit";
import { cancelOpenDesk } from "./desk";
import { cancelOpenJobs, enqueueJob } from "./jobs";
import { enqueueNotification } from "./notifications";

export async function setAccess(actor: string, userId: string, state: string, reason?: string) {
  if (!isAccessState(state)) throw new AppError("Некорректный статус доступа");
  const [before] = await db.select().from(accessStatus).where(eq(accessStatus.userId, userId)).limit(1);
  const [saved] = await db
    .insert(accessStatus)
    .values({ userId, state, reason: reason?.trim() || null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: accessStatus.userId,
      set: { state, reason: reason?.trim() || null, updatedAt: new Date() },
    })
    .returning();
  await audit({
    actor,
    action: "access_status",
    entity: "access_status",
    entityId: userId,
    before: before ? { state: before.state } : null,
    after: { state },
  });
  if (state !== "green") {
    await cancelOpenJobs(userId, actor);
    await enqueueNotification({
      userId,
      kind: "access_pause",
      payload: { state },
    });
    await enqueueNotification({
      userId,
      kind: "job_failed",
      channels: ["operator"],
      payload: { type: "access", errorCode: reason || state },
    });
    try {
      await enqueueJob({
        userId,
        type: "heal_access",
        payload: { reason: reason?.trim() || state },
        createdBy: actor,
        asAdmin: true,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  return saved;
}

export async function pauseSubscription(actor: string, userId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) throw new AppError("Подписка не найдена");
  await db.update(subscriptions).set({ status: "paused" }).where(eq(subscriptions.userId, userId));
  try {
    await cancelOpenJobs(userId, actor);
  } finally {
    await cancelOpenDesk(userId);
  }
  await audit({
    actor,
    action: "subscription_pause",
    entity: "subscriptions",
    entityId: sub.id,
    before: { status: sub.status },
    after: { status: "paused" },
  });
}

export async function resumeSubscription(actor: string, userId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub || sub.status !== "paused") throw new AppError("Подписка не на паузе");
  if (sub.currentPeriodEnd.getTime() < Date.now()) {
    throw new AppError("Период подписки закончился");
  }
  await db.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.userId, userId));
  await audit({
    actor,
    action: "subscription_resume",
    entity: "subscriptions",
    entityId: sub.id,
    before: { status: "paused" },
    after: { status: "active" },
  });
}

export async function cancelSubscription(actor: string, userId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) throw new AppError("Подписка не найдена");
  await db.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.userId, userId));
  await cancelOpenJobs(userId, actor);
  await audit({
    actor,
    action: "subscription_cancel",
    entity: "subscriptions",
    entityId: sub.id,
    after: { status: "canceled" },
  });
}

export async function setAvitoStatus(
  actor: string,
  userId: string,
  status: "pending" | "connected" | "blocked",
  notes?: string,
) {
  const [saved] = await db
    .update(avitoAccounts)
    .set({ status, notes: notes?.trim() || null })
    .where(eq(avitoAccounts.userId, userId))
    .returning();
  if (!saved) throw new AppError("Аккаунт Авито не найден");
  await audit({
    actor,
    action: "avito_status",
    entity: "avito_accounts",
    entityId: saved.id,
    after: { status },
  });
  return saved;
}

export function accessStateOf(value: string | null | undefined): AccessState {
  if (value === "yellow" || value === "red" || value === "green") return value;
  return "green";
}
