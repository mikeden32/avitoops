"use server";

import { cookies, headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { auth } from "@/auth";
import { cabinetBrief, replyAsCurator, type CuratorTurn } from "@/lib/curator";
import type { Upload } from "@/lib/files";
import { loadDashboard } from "@/lib/queries/cabinet";
import { curatorTurn, ensureCuratorOpening } from "@/lib/services/dispatch";
import { latestDeskRole, loadCuratorLines, pinCard, rememberLine } from "@/lib/services/desk";
import { avitoButton, cardOf, payButton } from "@/lib/services/guide";
import { speak } from "@/lib/curator";
import { speakGrok } from "@/lib/grok";
import { routeListingExtraction, routeMode } from "@/lib/ai/router";
import { cabinetTaskContext, persistGuestTurn, readGuestState } from "@/lib/services/guest-draft";
import { saleFromFacts, type AssistantCard, type SaleBrief } from "@/lib/services/sale";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(800),
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

const SALE_COOKIE = "avitoops-sale";

async function readSale(): Promise<SaleBrief> {
  const jar = await cookies();
  const raw = jar.get(SALE_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SaleBrief;
    return {
      item: typeof parsed.item === "string" ? parsed.item : undefined,
      city: typeof parsed.city === "string" ? parsed.city : undefined,
      priceRub: typeof parsed.priceRub === "number" ? parsed.priceRub : undefined,
    };
  } catch {
    return {};
  }
}

async function writeSale(sale: SaleBrief) {
  const jar = await cookies();
  jar.set(SALE_COOKIE, JSON.stringify(sale), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
}

async function clearSale() {
  const jar = await cookies();
  jar.set(SALE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}

function saleFilled(sale: SaleBrief) {
  return Boolean(sale.item || sale.city || sale.priceRub);
}

function paidCabinet(status: string | null, periodEnd: Date | null, trial: boolean) {
  return !trial && status === "active" && periodEnd instanceof Date && periodEnd.getTime() > Date.now();
}

async function photosOf(formData: FormData): Promise<Upload[]> {
  const photos: Upload[] = [];
  for (const item of formData.getAll("photo")) {
    if (!(item instanceof File) || item.size === 0 || item.type.startsWith("audio/")) continue;
    photos.push({
      filename: item.name || "photo.jpg",
      mime: item.type || "image/jpeg",
      bytes: Buffer.from(await item.arrayBuffer()),
    });
  }
  return photos;
}

export async function askCurator(
  formData: FormData,
): Promise<
  | {
      reply: string;
      action?: { href: string; label: string };
      card?: AssistantCard;
      task?: Awaited<ReturnType<typeof persistGuestTurn>>;
      role?: Awaited<ReturnType<typeof latestDeskRole>>;
      audio?: string | null;
    }
  | { error: string }
> {
  const message = String(formData.get("message") ?? "").trim();
  const parsedMessage = z.string().trim().min(1).max(800).safeParse(message);
  if (!parsedMessage.success) return { error: "Напишите вопрос короче, до 800 символов." };
  let history: CuratorTurn[] = [];
  try {
    const raw = JSON.parse(String(formData.get("history") ?? "[]")) as unknown;
    const parsed = z.array(turnSchema).max(8).safeParse(raw);
    if (parsed.success) history = parsed.data.slice(-6);
  } catch {
    history = [];
  }
  const headerList = await headers();
  const who = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const session = await auth();
  let cabinet: string | null = null;
  let useModel = false;
  const userId = session?.user?.role === "client" ? session.user.id : null;
  if (userId) {
    const dash = await loadDashboard(userId);
    cabinet = cabinetBrief(dash);
    useModel = paidCabinet(dash.subscriptionStatus, dash.periodEnd, dash.trial);
  }
  const bucket = useModel && userId ? `paid:${userId}` : `free:${userId ?? who}`;
  const allowed = useModel ? allowQuestion(bucket, 30, 60_000) : allowQuestion(bucket, 8, 10 * 60_000);
  if (!allowed) {
    return {
      error: useModel
        ? "Слишком много реплик подряд. Подождите минуту."
        : "До регистрации и оплаты тарифа вопросов немного. Посмотрите тарифы или зайдите чуть позже.",
    };
  }
  const photos = await photosOf(formData);
  const prior = userId ? null : await readGuestState();
  const serverSale = userId ? await cabinetTaskContext(userId) : null;
  const fromServer = Boolean(serverSale && saleFilled(serverSale));
  if (fromServer) await clearSale();
  const sale = userId ? (fromServer && serverSale ? serverSale : await readSale()) : saleFromFacts(prior?.state ?? { product: null, location: null, price: null });
  const turned = await curatorTurn(userId, parsedMessage.data, photos, { useModel, sale, task: prior?.state });
  if (!userId && prior) {
    const reply = turned.handled ? turned.reply : speak(await replyAsCurator(parsedMessage.data, history, cabinet, useModel));
    const rulesTask = turned.task ?? prior.state;
    const known = {
      product: prior.state.product,
      location: prior.state.location,
      price: prior.state.price,
      attributes: prior.state.attributes,
      confirmed: Boolean(prior.state.product || prior.state.location || prior.state.price),
    };
    const mode = routeMode();
    if (mode === "shadow") {
      void routeListingExtraction({ text: parsedMessage.data, known, rules: rulesTask }).catch(() => undefined);
    }
    let nextTask = rulesTask;
    let nextReply = reply;
    if (mode === "live") {
      const decision = await routeListingExtraction({ text: parsedMessage.data, known, rules: rulesTask });
      if (decision.apply && decision.task && decision.reply) {
        nextTask = decision.task;
        nextReply = speak(decision.reply);
      }
    }
    const task = await persistGuestTurn(nextTask, parsedMessage.data, nextReply);
    const audioBytes = await speakGrok(nextReply);
    const audio = audioBytes ? Buffer.from(audioBytes).toString("base64") : null;
    return { reply, action: turned.action, task, audio };
  }
  if (turned.sale && !fromServer) await writeSale(turned.sale);
  const role = userId ? await latestDeskRole(userId) : null;
  const reply = turned.handled ? turned.reply : speak(await replyAsCurator(parsedMessage.data, history, cabinet, useModel));
  if (!turned.handled && userId) {
    await rememberLine(userId, "user", parsedMessage.data);
    await rememberLine(userId, "assistant", reply, turned.card?.href);
  } else if (userId && turned.card?.href) {
    await pinCard(userId, reply, turned.card.href);
  }
  const audioBytes = await speakGrok(reply);
  const audio = audioBytes ? Buffer.from(audioBytes).toString("base64") : null;
  if (turned.handled) return { reply, action: turned.action, card: turned.card, role, audio };
  return { reply, role, audio };
}

export async function loadGuestTask() {
  const { loadGuestTask: load } = await import("@/lib/services/guest-draft");
  return load();
}

export async function resetGuestTask() {
  const { resetGuestTask: reset } = await import("@/lib/services/guest-draft");
  return reset();
}

export async function openCurator() {
  const session = await auth();
  if (!session?.user || session.user.role !== "client" || !session.user.id) return [];
  const lines = await loadCuratorLines(session.user.id);
  const ids = [
    ...new Set(
      lines.flatMap((line) => {
        const id = line.cardHref?.split("/").pop();
        return id ? [id] : [];
      }),
    ),
  ];
  const cards = new Map<string, ReturnType<typeof cardOf>>();
  if (ids.length) {
    const rows = await db
      .select()
      .from(listings)
      .where(and(eq(listings.userId, session.user.id), inArray(listings.id, ids)));
    for (const row of rows) cards.set(`/app/listings/${row.id}`, cardOf(session.user.id, row));
  }
  return lines.map((line) => ({
    role: line.role,
    content: line.content,
    card: line.cardHref ? cards.get(line.cardHref) : undefined,
  }));
}

export async function curatorBoot() {
  const session = await auth();
  if (!session?.user || session.user.role !== "client" || !session.user.id) {
    return { open: false, stage: "ready" as const, role: null, action: undefined as { href: string; label: string } | undefined };
  }
  const serverSale = await cabinetTaskContext(session.user.id);
  if (saleFilled(serverSale)) await clearSale();
  const sale = saleFilled(serverSale) ? serverSale : await readSale();
  const stage = await ensureCuratorOpening(session.user.id, sale);
  const role = await latestDeskRole(session.user.id);
  const action = stage === "connect" ? avitoButton : stage === "pay" ? payButton : undefined;
  const open = stage === "consent" || stage === "connect" || stage === "ask" || stage === "photo" || stage === "pay";
  return { open, stage, role, action };
}
