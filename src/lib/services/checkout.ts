import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { paymentRequests, users } from "../db/schema";
import { AppError } from "../errors";
import { planTitle } from "../plans";
import { logInfo } from "../redact";
import {
  YooKassaError,
  type YooPayment,
  createYooKassaPayment,
  getYooKassaPayment,
  sameAmount,
  siteUrl,
  yookassaConfigured,
} from "../yookassa";
import { confirmPayment } from "./billing";

function asAppError(error: unknown) {
  if (error instanceof AppError) return error;
  if (error instanceof YooKassaError) return new AppError(error.message);
  throw error;
}

export async function creditYooKassaPayment(payment: YooPayment) {
  if (!payment.requestId) return "ignored" as const;
  const [row] = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.id, payment.requestId))
    .limit(1);
  if (!row || row.providerPaymentId !== payment.id) return "ignored" as const;
  if (row.status === "paid") return "credited" as const;
  if (row.status !== "pending") return "ignored" as const;
  if (payment.status !== "succeeded" || !payment.paid) return "pending" as const;
  if (payment.amount.currency !== "RUB" || !sameAmount(payment.amount.value, row.amountRub)) {
    logInfo("yookassa amount mismatch");
    return "ignored" as const;
  }
  try {
    await confirmPayment("yookassa", row.id, "yookassa");
  } catch (error) {
    if (error instanceof AppError && error.message.includes("уже обработана")) return "credited" as const;
    throw error;
  }
  logInfo("yookassa credited");
  return "credited" as const;
}

export async function syncPendingPayments(userId: string) {
  const result = { credited: 0, canceled: false };
  if (!yookassaConfigured()) return result;
  const rows = await db
    .select()
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.userId, userId),
        eq(paymentRequests.status, "pending"),
        isNotNull(paymentRequests.providerPaymentId),
      ),
    );
  for (const row of rows) {
    if (!row.providerPaymentId) continue;
    try {
      const payment = await getYooKassaPayment(row.providerPaymentId);
      if (payment.status === "canceled") result.canceled = true;
      const credited = await creditYooKassaPayment(payment);
      if (credited === "credited") result.credited += 1;
    } catch (error) {
      if (!(error instanceof YooKassaError) && !(error instanceof AppError)) throw error;
      logInfo("yookassa sync failed");
    }
  }
  return result;
}

export async function startCheckout(userId: string, requestId: string) {
  if (!yookassaConfigured()) {
    throw new AppError("ЮKassa ещё не настроена");
  }
  const [request] = await db
    .select()
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.id, requestId),
        eq(paymentRequests.userId, userId),
        eq(paymentRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (!request) throw new AppError("Заявка не найдена или уже обработана");
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email) throw new AppError("У аккаунта нет email для чека");

  let idempotenceKey = request.id;
  if (request.providerPaymentId) {
    let payment: YooPayment;
    try {
      payment = await getYooKassaPayment(request.providerPaymentId);
    } catch (error) {
      throw asAppError(error);
    }
    if (payment.status === "succeeded") {
      const result = await creditYooKassaPayment(payment);
      if (result === "credited") return null;
      throw new AppError("Платёж в ЮKassa не совпал с заявкой");
    }
    if (payment.status === "pending" && payment.confirmationUrl) return payment.confirmationUrl;
    if (payment.status === "canceled") idempotenceKey = randomUUID();
    else throw new AppError("Платёж уже создан и ещё обрабатывается");
  }

  const description =
    request.kind === "subscription"
      ? `AvitoOps, тариф ${planTitle(request.plan)}`
      : "AvitoOps, депозит на рекламу";
  let created: YooPayment;
  try {
    created = await createYooKassaPayment({
      amountRub: request.amountRub,
      description,
      returnUrl: `${siteUrl()}/app/billing?check=1`,
      requestId: request.id,
      email: user.email,
      idempotenceKey,
    });
  } catch (error) {
    throw asAppError(error);
  }
  await db
    .update(paymentRequests)
    .set({ providerPaymentId: created.id })
    .where(eq(paymentRequests.id, request.id));
  if (!created.confirmationUrl) throw new AppError("ЮKassa не вернула страницу оплаты");
  return created.confirmationUrl;
}

export async function resumeCheckout(userId: string, kind: "subscription" | "deposit") {
  const [row] = await db
    .select({ id: paymentRequests.id })
    .from(paymentRequests)
    .where(
      and(eq(paymentRequests.userId, userId), eq(paymentRequests.kind, kind), eq(paymentRequests.status, "pending")),
    )
    .orderBy(desc(paymentRequests.createdAt))
    .limit(1);
  if (!row) return null;
  return startCheckout(userId, row.id);
}
