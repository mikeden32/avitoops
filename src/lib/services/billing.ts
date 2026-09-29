import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { ledger, paymentRequests, subscriptions } from "../db/schema";
import type { Plan } from "../db/schema";
import { AppError } from "../errors";
import { PLAN_PRICES, isPlan } from "../plans";
import { audit } from "./audit";

const MONTH = 30 * 24 * 60 * 60 * 1000;

export async function getDepositBalance(userId: string) {
  const rows = await db.select().from(ledger).where(eq(ledger.userId, userId));
  return rows.reduce((sum, row) => {
    if (row.kind === "deposit" || row.kind === "refund") return sum + row.amountRub;
    if (row.kind === "promo_spend") return sum - row.amountRub;
    return sum;
  }, 0);
}

export async function createSubscriptionRequest(userId: string, plan: Plan) {
  const pending = await db
    .select()
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.userId, userId),
        eq(paymentRequests.kind, "subscription"),
        eq(paymentRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending[0]) throw new AppError("Заявка на подписку уже ждёт подтверждения");
  const [row] = await db
    .insert(paymentRequests)
    .values({
      userId,
      kind: "subscription",
      plan,
      amountRub: PLAN_PRICES[plan],
      status: "pending",
    })
    .returning();
  await audit({
    actor: userId,
    action: "payment_request",
    entity: "payment_requests",
    entityId: row.id,
    after: { kind: "subscription", plan, amountRub: row.amountRub },
  });
  return row;
}

export async function createDepositRequest(userId: string, amountRub: number) {
  if (!Number.isInteger(amountRub) || amountRub < 100 || amountRub > 1_000_000) {
    throw new AppError("Сумма депозита от 100 до 1 000 000 ₽");
  }
  const pending = await db
    .select()
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.userId, userId),
        eq(paymentRequests.kind, "deposit"),
        eq(paymentRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending[0]) throw new AppError("Заявка на депозит уже ждёт подтверждения");
  const [row] = await db
    .insert(paymentRequests)
    .values({ userId, kind: "deposit", amountRub, status: "pending" })
    .returning();
  await audit({
    actor: userId,
    action: "payment_request",
    entity: "payment_requests",
    entityId: row.id,
    after: { kind: "deposit", amountRub },
  });
  return row;
}

export async function confirmPayment(actor: string, requestId: string) {
  const request = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(paymentRequests)
      .set({ status: "paid", resolvedAt: new Date(), resolvedBy: actor })
      .where(and(eq(paymentRequests.id, requestId), eq(paymentRequests.status, "pending")))
      .returning();
    if (!request) throw new AppError("Заявка не найдена или уже обработана");

    if (request.kind === "subscription") {
      if (!request.plan || !isPlan(request.plan)) throw new AppError("У заявки нет тарифа");
      const [current] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, request.userId))
        .limit(1);
      const now = new Date();
      const base =
        current && current.status === "active" && current.currentPeriodEnd > now
          ? current.currentPeriodEnd
          : now;
      const periodEnd = new Date(base.getTime() + MONTH);
      if (current) {
        await tx
          .update(subscriptions)
          .set({
            plan: request.plan,
            status: "active",
            currentPeriodEnd: periodEnd,
            paymentProvider: "manual",
            paymentProviderId: request.id,
          })
          .where(eq(subscriptions.userId, request.userId));
      } else {
        await tx.insert(subscriptions).values({
          userId: request.userId,
          plan: request.plan,
          status: "active",
          currentPeriodEnd: periodEnd,
          paymentProvider: "manual",
          paymentProviderId: request.id,
        });
      }
      await tx.insert(ledger).values({
        userId: request.userId,
        kind: "subscription",
        amountRub: request.amountRub,
        meta: { requestId: request.id, plan: request.plan, provider: "manual" },
      });
    } else {
      await tx.insert(ledger).values({
        userId: request.userId,
        kind: "deposit",
        amountRub: request.amountRub,
        meta: { requestId: request.id, provider: "manual" },
      });
    }

    return request;
  });
  await audit({
    actor,
    action: "payment_confirmed",
    entity: "payment_requests",
    entityId: request.id,
    after: {
      kind: request.kind,
      amountRub: request.amountRub,
      plan: request.plan,
    },
  });
  return request;
}

export async function rejectPayment(actor: string, requestId: string) {
  const [request] = await db
    .update(paymentRequests)
    .set({ status: "rejected", resolvedAt: new Date(), resolvedBy: actor })
    .where(and(eq(paymentRequests.id, requestId), eq(paymentRequests.status, "pending")))
    .returning();
  if (!request) throw new AppError("Заявка не найдена или уже обработана");
  await audit({
    actor,
    action: "payment_rejected",
    entity: "payment_requests",
    entityId: request.id,
  });
  return request;
}

export async function listLedger(userId: string) {
  return db.select().from(ledger).where(eq(ledger.userId, userId)).orderBy(desc(ledger.createdAt));
}

export async function listPaymentRequests(userId?: string) {
  if (userId) {
    return db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.userId, userId))
      .orderBy(desc(paymentRequests.createdAt));
  }
  return db.select().from(paymentRequests).orderBy(desc(paymentRequests.createdAt));
}
