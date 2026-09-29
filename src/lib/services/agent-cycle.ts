import { and, asc, count, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { avitoAccounts, clientProfiles, listings, messagesDigest } from "../db/schema";
import { askGrok } from "../grok";
import { logInfo } from "../redact";
import {
  avitoSelfId,
  incomingAvitoMessages,
  refreshAvitoToken,
  sendAvitoMessage,
} from "../avito";
import { replySlotOpen } from "./daily";
import { createDigest } from "./leads";
import { enqueueNotification } from "./notifications";
import { completeJob, takeNextJob } from "./jobs";

function wantsHuman(rules: string | null, text: string) {
  if (!rules?.trim()) return false;
  const hay = text.toLowerCase();
  return rules
    .split(/[,;\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 4)
    .some((part) => hay.includes(part));
}

async function replyText(rules: string | null, buyer: string) {
  const system = [
    "Ты агент Авито. Напиши короткий ответ покупателю по правилам клиента.",
    "Не проси пароль и код. Не обещай место в поиске. До 400 знаков.",
    rules ? `Правила: ${rules}` : "Правил нет: поздоровайся и уточни вопрос.",
  ].join("\n");
  try {
    const text = await askGrok(system, buyer);
    if (text) return text;
  } catch {
    logInfo("grok reply failed");
  }
  const fallback = rules?.trim().split("\n")[0]?.slice(0, 300);
  return fallback || "Здравствуйте. Уточните, пожалуйста, что вас интересует.";
}

async function syncAccount(account: {
  userId: string;
  avitoUserId: string | null;
  refreshToken: string;
}) {
  const token = await refreshAvitoToken(account.refreshToken);
  if (token.refreshToken && token.refreshToken !== account.refreshToken) {
    await db
      .update(avitoAccounts)
      .set({ refreshToken: token.refreshToken })
      .where(eq(avitoAccounts.userId, account.userId));
  }
  let avitoUserId = account.avitoUserId;
  if (!avitoUserId) {
    avitoUserId = await avitoSelfId(token.accessToken);
    if (!avitoUserId) return { leads: 0, replies: 0 };
    await db.update(avitoAccounts).set({ avitoUserId }).where(eq(avitoAccounts.userId, account.userId));
  }
  const [profile] = await db
    .select({ replyRules: clientProfiles.replyRules, escalateRules: clientProfiles.escalateRules })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, account.userId))
    .limit(1);
  const messages = await incomingAvitoMessages(token.accessToken, avitoUserId);
  let leads = 0;
  let replies = 0;
  for (const message of messages) {
    const externalRef = `${message.chatId}:${message.messageId}`;
    const hot = wantsHuman(profile?.escalateRules ?? null, message.text);
    const row = await createDigest({
      userId: account.userId,
      preview: message.text,
      urgency: hot ? "hot" : "normal",
      actor: "grok-avitolog",
      externalRef,
    });
    if (row.status !== "new") continue;
    leads += 1;
  }
  const pending = await db
    .select()
    .from(messagesDigest)
    .where(
      and(
        eq(messagesDigest.userId, account.userId),
        eq(messagesDigest.status, "new"),
        eq(messagesDigest.urgency, "normal"),
        isNotNull(messagesDigest.externalRef),
      ),
    )
    .orderBy(asc(messagesDigest.createdAt));
  for (const row of pending) {
    if (!(await replySlotOpen(account.userId))) break;
    const chatId = row.externalRef?.split(":")[0];
    if (!chatId) continue;
    const text = await replyText(profile?.replyRules ?? null, row.preview);
    try {
      await sendAvitoMessage(token.accessToken, avitoUserId, chatId, text);
    } catch {
      logInfo("avito reply failed");
      continue;
    }
    const [saved] = await db
      .update(messagesDigest)
      .set({ status: "handled", repliedAt: new Date() })
      .where(and(eq(messagesDigest.id, row.id), eq(messagesDigest.status, "new")))
      .returning();
    if (saved) replies += 1;
  }
  return { leads, replies };
}

async function closeReport() {
  const job = await takeNextJob("grok-avitolog", ["report"]);
  if (!job) return false;
  const [listingCount] = await db
    .select({ value: count() })
    .from(listings)
    .where(eq(listings.userId, job.userId));
  const facts = `Объявлений в кабинете: ${Number(listingCount?.value ?? 0)}.`;
  let text = facts;
  try {
    const drafted = await askGrok(
      "Собери короткий отчёт для клиента кабинета Авито. Без обещаний места в поиске. До 500 знаков.",
      facts,
    );
    if (drafted) text = drafted;
  } catch {
    logInfo("grok report failed");
  }
  await enqueueNotification({
    userId: job.userId,
    kind: "report_ready",
    payload: { text },
  });
  await completeJob(job.id, { status: "done" });
  return true;
}

export async function runAgentCycle() {
  const accounts = await db
    .select({
      userId: avitoAccounts.userId,
      avitoUserId: avitoAccounts.avitoUserId,
      refreshToken: avitoAccounts.refreshToken,
    })
    .from(avitoAccounts)
    .where(and(eq(avitoAccounts.status, "connected"), isNotNull(avitoAccounts.refreshToken)));
  let leads = 0;
  let replies = 0;
  for (const account of accounts) {
    if (!account.refreshToken) continue;
    try {
      const result = await syncAccount({
        userId: account.userId,
        avitoUserId: account.avitoUserId,
        refreshToken: account.refreshToken,
      });
      leads += result.leads;
      replies += result.replies;
    } catch {
      logInfo(`avito sync failed for ${account.userId}`);
    }
  }
  const report = await closeReport();
  return { accounts: accounts.length, leads, replies, report };
}
