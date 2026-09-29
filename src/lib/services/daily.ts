import { and, count, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "../db";
import { jobs, messagesDigest, subscriptions } from "../db/schema";
import type { JobType, Plan } from "../db/schema";
import { DAILY_QUOTA } from "../plans";
import { moscowDayRange } from "../week";

export async function planOf(userId: string): Promise<Plan | null> {
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return sub?.plan ?? null;
}

export async function startedToday(userId: string, type: "publish" | "update" | "promo") {
  const { start, end } = moscowDayRange();
  const [row] = await db
    .select({ value: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        eq(jobs.type, type),
        inArray(jobs.status, ["running", "done"]),
        gte(jobs.startedAt, start),
        lt(jobs.startedAt, end),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function queuedCount(userId: string, type: "publish" | "update" | "promo") {
  const [row] = await db
    .select({ value: count() })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.type, type), eq(jobs.status, "queued")));
  return Number(row?.value ?? 0);
}

export async function repliesToday(userId: string) {
  const { start, end } = moscowDayRange();
  const [row] = await db
    .select({ value: count() })
    .from(messagesDigest)
    .where(
      and(
        eq(messagesDigest.userId, userId),
        gte(messagesDigest.repliedAt, start),
        lt(messagesDigest.repliedAt, end),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function replySlotOpen(userId: string) {
  const plan = await planOf(userId);
  if (!plan) return false;
  return (await repliesToday(userId)) < DAILY_QUOTA[plan].replies;
}

async function normalReplyBacklog(userId: string) {
  const [row] = await db
    .select({ id: messagesDigest.id })
    .from(messagesDigest)
    .where(
      and(
        eq(messagesDigest.userId, userId),
        eq(messagesDigest.status, "new"),
        eq(messagesDigest.urgency, "normal"),
        isNotNull(messagesDigest.externalRef),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function dailyStartBlock(userId: string, type: JobType) {
  if (type !== "publish" && type !== "update" && type !== "promo") return false;
  const plan = await planOf(userId);
  if (!plan) return false;
  if ((await startedToday(userId, type)) >= DAILY_QUOTA[plan][type]) return true;
  if (type !== "publish") return false;
  const replies = await repliesToday(userId);
  if (replies >= DAILY_QUOTA[plan].replies) return true;
  return normalReplyBacklog(userId);
}
