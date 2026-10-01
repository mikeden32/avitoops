import { and, count, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { jobs, messagesDigest, subscriptions } from "../db/schema";
import type { JobType, Plan } from "../db/schema";
import { DAILY_QUOTA, TRIAL_QUOTA } from "../plans";
import { moscowDayRange } from "../week";

export async function trialLive(userId: string) {
  const [sub] = await db
    .select({
      paymentProvider: subscriptions.paymentProvider,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return Boolean(
    sub &&
      sub.paymentProvider === "trial" &&
      sub.status === "active" &&
      sub.currentPeriodEnd.getTime() > Date.now(),
  );
}

export async function quotaFor(userId: string) {
  const plan = await planOf(userId);
  if (!plan) return null;
  const trial = await trialLive(userId);
  return { plan, trial, quota: trial ? TRIAL_QUOTA : DAILY_QUOTA[plan] };
}

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

export async function heldQueuedToday(userId: string, type: "publish" | "update" | "promo") {
  const { start, end } = moscowDayRange();
  const [row] = await db
    .select({ value: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        eq(jobs.type, type),
        eq(jobs.status, "queued"),
        gte(jobs.createdAt, start),
        lt(jobs.createdAt, end),
        sql`${jobs.payload}->>'quota_hold' = 'true'`,
      ),
    );
  return Number(row?.value ?? 0);
}

export async function slotsTaken(userId: string, type: "publish" | "update" | "promo") {
  return (await startedToday(userId, type)) + (await heldQueuedToday(userId, type));
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
  const limits = await quotaFor(userId);
  if (!limits) return false;
  return (await repliesToday(userId)) < limits.quota.replies;
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

export async function dailyStartBlock(
  userId: string,
  type: JobType,
  job?: { payload: Record<string, unknown>; createdAt: Date },
) {
  if (type !== "publish" && type !== "update" && type !== "promo") return false;
  const limits = await quotaFor(userId);
  if (!limits) return false;
  const started = await startedToday(userId, type);
  const held = await heldQueuedToday(userId, type);
  const { start, end } = moscowDayRange();
  const self =
    job?.payload.quota_hold === true && job.createdAt >= start && job.createdAt < end ? 1 : 0;
  if (started + held - self >= limits.quota[type]) return true;
  if (type !== "publish") return false;
  const replies = await repliesToday(userId);
  if (replies >= limits.quota.replies) return true;
  return normalReplyBacklog(userId);
}
