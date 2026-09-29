import { eq } from "drizzle-orm";
import { db } from "../db";
import { accessStatus, subscriptions } from "../db/schema";
import type { AccessState } from "../db/schema";
import { workBlockReason } from "../policy";
import { enqueueNotification } from "./notifications";

export async function refreshOverdue(userId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub || sub.status !== "active") return sub ?? null;
  if (sub.currentPeriodEnd.getTime() >= Date.now()) return sub;
  const [updated] = await db
    .update(subscriptions)
    .set({ status: "past_due" })
    .where(eq(subscriptions.userId, userId))
    .returning();
  const { users } = await import("../db/schema");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await enqueueNotification({
    userId,
    kind: "payment_lost",
    channels: ["operator"],
    payload: { email: user?.email ?? userId },
  });
  return updated;
}

export async function loadGate(userId: string) {
  const subscription = await refreshOverdue(userId);
  const [accessRow] = await db
    .select()
    .from(accessStatus)
    .where(eq(accessStatus.userId, userId))
    .limit(1);
  const access = (accessRow?.state ?? "green") as AccessState;
  return {
    subscription,
    access,
    block: workBlockReason({
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            paymentProvider: subscription.paymentProvider,
          }
        : null,
      access,
    }),
  };
}
