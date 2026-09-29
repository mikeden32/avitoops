import { eq } from "drizzle-orm";
import { db, type Tx } from "../db";
import { ledger, promoBudgets } from "../db/schema";
import { AppError } from "../errors";
import { LOW_DEPOSIT_RUB } from "../plans";
import { moscowWeekStart } from "../week";
import { audit } from "./audit";
import { getDepositBalance } from "./billing";

type Exec = typeof db | Tx;

export async function currentPromo(userId: string, executor: Exec = db) {
  const week = moscowWeekStart();
  const [budget] = await executor.select().from(promoBudgets).where(eq(promoBudgets.userId, userId)).limit(1);
  if (!budget) throw new AppError("Бюджет продвижения не найден");
  if (budget.weekStart < week) {
    const [reset] = await executor
      .update(promoBudgets)
      .set({ spentRub: 0, weekStart: week })
      .where(eq(promoBudgets.userId, userId))
      .returning();
    return reset;
  }
  return budget;
}

export async function setPromoSettings(userId: string, input: { enabled: boolean; weekLimitRub: number }) {
  if (!Number.isInteger(input.weekLimitRub) || input.weekLimitRub < 0) {
    throw new AppError("Лимит должен быть целым числом от 0");
  }
  await currentPromo(userId);
  const [saved] = await db
    .update(promoBudgets)
    .set({
      enabled: input.enabled && input.weekLimitRub > 0,
      weekLimitRub: input.weekLimitRub,
    })
    .where(eq(promoBudgets.userId, userId))
    .returning();
  await audit({
    actor: userId,
    action: "promo_settings",
    entity: "promo_budgets",
    entityId: userId,
    after: { enabled: saved.enabled, weekLimitRub: saved.weekLimitRub },
  });
  return saved;
}

export async function requestPromo(userId: string, listingId: string, maxRub: number, createdBy: string) {
  const { listings } = await import("../db/schema");
  const { and } = await import("drizzle-orm");
  const [listing] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
    .limit(1);
  if (!listing) throw new AppError("Объявление не найдено");
  if (listing.status !== "live") throw new AppError("Продвигать можно опубликованное объявление");
  const { enqueueJob } = await import("./jobs");
  return enqueueJob({
    userId,
    type: "promo",
    listingId,
    payload: { listing_id: listingId, max_rub: maxRub },
    createdBy,
  });
}

export async function recordPromoSpend(
  userId: string,
  spentRub: number,
  jobId: string,
  maxRub: number,
  executor: Exec = db,
) {
  if (!Number.isInteger(spentRub) || spentRub <= 0) throw new AppError("Некорректная сумма расхода");
  if (!Number.isInteger(maxRub) || maxRub <= 0 || spentRub > maxRub) {
    throw new AppError("Расход выше заявленной суммы");
  }
  const before = await getDepositBalance(userId, executor);
  const budget = await currentPromo(userId, executor);
  if (budget.spentRub + spentRub > budget.weekLimitRub) {
    throw new AppError("Расход выше недельного лимита");
  }
  if (before < spentRub) throw new AppError("Расход выше депозита");
  await executor
    .update(promoBudgets)
    .set({ spentRub: budget.spentRub + spentRub })
    .where(eq(promoBudgets.userId, userId));
  await executor.insert(ledger).values({
    userId,
    kind: "promo_spend",
    amountRub: spentRub,
    meta: { jobId },
  });
  const balance = before - spentRub;
  return {
    balance,
    notifyLow: before >= LOW_DEPOSIT_RUB && balance < LOW_DEPOSIT_RUB,
  };
}
