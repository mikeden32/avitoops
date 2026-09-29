"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/auth";
import { cabinetBrief, replyAsCurator, type CuratorTurn } from "@/lib/curator";
import { loadDashboard } from "@/lib/queries/cabinet";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(800),
});

const inputSchema = z.object({
  message: z.string().trim().min(1).max(800),
  history: z.array(turnSchema).max(8),
});

const hits = new Map<string, number[]>();

function allowQuestion(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function modelUnlocked(status: string | null, periodEnd: Date | null) {
  return status === "active" && periodEnd instanceof Date && periodEnd.getTime() > Date.now();
}

export async function askCurator(raw: unknown): Promise<{ reply: string } | { error: string }> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { error: "Напишите вопрос короче, до 800 символов." };
  const headerList = await headers();
  const who = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const session = await auth();

  let cabinet: string | null = null;
  let useModel = false;
  if (session?.user?.role === "client" && session.user.id) {
    const dash = await loadDashboard(session.user.id);
    cabinet = cabinetBrief(dash);
    useModel = modelUnlocked(dash.subscriptionStatus, dash.periodEnd);
  }

  const bucket = useModel && session?.user?.id ? `paid:${session.user.id}` : `free:${session?.user?.id ?? who}`;
  const allowed = useModel
    ? allowQuestion(bucket, 12, 60_000)
    : allowQuestion(bucket, 8, 10 * 60_000);
  if (!allowed) {
    return {
      error: useModel
        ? "Слишком много вопросов подряд. Подождите минуту."
        : "До регистрации и оплаты тарифа вопросов немного. Посмотрите тарифы или зайдите чуть позже.",
    };
  }

  const history: CuratorTurn[] = parsed.data.history.slice(-6);
  const reply = await replyAsCurator(parsed.data.message, history, cabinet, useModel);
  return { reply };
}
