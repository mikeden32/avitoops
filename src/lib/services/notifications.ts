import { asc, eq, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db } from "../db";
import { notificationOutbox, users } from "../db/schema";
import { logInfo, redact } from "../redact";

type Channel = "email" | "telegram" | "operator";

export async function enqueueNotification(input: {
  userId?: string | null;
  kind: string;
  payload: Record<string, unknown>;
  channels?: Channel[];
}) {
  const channels = input.channels ?? ["email", "telegram"];
  await db.insert(notificationOutbox).values(
    channels.map((channel) => ({
      userId: input.userId ?? null,
      channel,
      kind: input.kind,
      payload: input.payload,
      status: "pending" as const,
    })),
  );
  await dispatchPending();
}

async function sendEmail(to: string, subject: string, text: string) {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) return false;
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({ from, to, subject, text: redact(text) });
  return true;
}

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !/^\d+$/.test(chatId)) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: redact(text) }),
  });
  return response.ok;
}

function messageFor(kind: string, payload: Record<string, unknown>) {
  const title = typeof payload.title === "string" ? payload.title : "объявление";
  if (kind === "published") return `Опубликовано: ${title}`;
  if (kind === "hot_lead") return `Горячий лид: ${String(payload.preview ?? "")}`;
  if (kind === "access_pause") return "Доступ к Авито временно на паузе. Новые задачи не стартуют.";
  if (kind === "low_deposit") return `Мало депозита: ${String(payload.balanceRub ?? 0)} ₽`;
  if (kind === "job_failed") return `Задача с ошибкой: ${String(payload.type ?? "")} ${String(payload.errorCode ?? "")}`;
  if (kind === "payment_lost") return `Просрочена оплата: ${String(payload.email ?? "")}`;
  if (kind === "lead_escalated") return `Лид передан вам: ${String(payload.preview ?? "")}`;
  return kind;
}

export async function dispatchPending() {
  for (let round = 0; round < 10; round += 1) {
    const pending = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.status, "pending"))
      .orderBy(sql`${notificationOutbox.attemptAt} asc nulls first`, asc(notificationOutbox.createdAt))
      .limit(50);
    if (pending.length === 0) return;
    const hadFresh = pending.some((item) => !item.attemptAt);
    for (const item of pending) {
    const user = item.userId
      ? (await db.select().from(users).where(eq(users.id, item.userId)).limit(1))[0]
      : null;
    const text = messageFor(item.kind, item.payload);
    let sent = false;
    try {
      if (item.channel === "email" && user?.email) {
        sent = await sendEmail(user.email, "AvitoOps", text);
      } else if (item.channel === "telegram" && user?.telegram) {
        sent = await sendTelegram(user.telegram, text);
      } else if (item.channel === "operator") {
        const chat = process.env.TELEGRAM_OPERATOR_CHAT_ID;
        if (chat) sent = await sendTelegram(chat, text);
        const adminEmail = process.env.ADMIN_EMAIL;
        if (!sent && adminEmail && process.env.SMTP_HOST) {
          sent = await sendEmail(adminEmail, "AvitoOps оператору", text);
        }
      }
    } catch (error) {
      logInfo(`notify failed ${item.id}: ${error instanceof Error ? error.message : "error"}`);
    }
    if (sent) {
      await db
        .update(notificationOutbox)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notificationOutbox.id, item.id));
    } else {
      await db
        .update(notificationOutbox)
        .set({ attemptAt: new Date() })
        .where(eq(notificationOutbox.id, item.id));
    }
    }
    if (!hadFresh) return;
  }
}
