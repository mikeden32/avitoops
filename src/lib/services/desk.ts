import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { curatorLines, deskTasks } from "../db/schema";
import { COPY_MONTHLY } from "../plans";
import type { Plan } from "../db/schema";
import { moscowMonthRange } from "../week";

export async function addDeskTask(input: {
  userId: string;
  role: "copy" | "design" | "promo" | "reply";
  listingId?: string | null;
  payload?: Record<string, unknown>;
  status?: "queued" | "done" | "hold";
}) {
  const [row] = await db
    .insert(deskTasks)
    .values({
      userId: input.userId,
      role: input.role,
      listingId: input.listingId ?? null,
      payload: input.payload ?? {},
      status: input.status ?? "queued",
      finishedAt: input.status === "done" ? new Date() : null,
    })
    .returning();
  return row;
}

export async function cancelOpenDesk(userId: string) {
  await db
    .update(deskTasks)
    .set({ status: "canceled", finishedAt: new Date() })
    .where(and(eq(deskTasks.userId, userId), eq(deskTasks.status, "queued")));
}

export async function designPending(listingId: string) {
  const [row] = await db
    .select({ id: deskTasks.id })
    .from(deskTasks)
    .where(and(eq(deskTasks.listingId, listingId), eq(deskTasks.role, "design"), eq(deskTasks.status, "queued")))
    .limit(1);
  return Boolean(row);
}

export async function finishDesign(listingId: string) {
  await db
    .update(deskTasks)
    .set({ status: "done", finishedAt: new Date() })
    .where(and(eq(deskTasks.listingId, listingId), eq(deskTasks.role, "design"), eq(deskTasks.status, "queued")));
}

export async function copySpendsThisMonth(userId: string) {
  const { start, end } = moscowMonthRange();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(deskTasks)
    .where(
      and(
        eq(deskTasks.userId, userId),
        eq(deskTasks.role, "copy"),
        ne(deskTasks.status, "canceled"),
        gte(deskTasks.createdAt, start),
        lt(deskTasks.createdAt, end),
        sql`${deskTasks.payload}->>'spend' = 'true'`,
      ),
    );
  return Number(row?.value ?? 0);
}

export function copyMonthOpen(plan: Plan, spent: number) {
  return spent < COPY_MONTHLY[plan];
}

export function cleanLine(content: string) {
  return content.trim().replaceAll("₽.", "руб.").replaceAll("₽", "руб.").slice(0, 1000);
}

export async function rememberLine(userId: string, role: "user" | "assistant", content: string, cardHref?: string | null) {
  const text = cleanLine(content);
  if (!text) return;
  await db.insert(curatorLines).values({ userId, role, content: text, cardHref: cardHref ?? null });
}

export async function pinCard(userId: string, content: string, cardHref: string) {
  const text = cleanLine(content);
  if (!text || !cardHref) return;
  const [row] = await db
    .select({ id: curatorLines.id })
    .from(curatorLines)
    .where(and(eq(curatorLines.userId, userId), eq(curatorLines.role, "assistant"), eq(curatorLines.content, text)))
    .orderBy(desc(curatorLines.createdAt))
    .limit(1);
  if (!row) {
    await rememberLine(userId, "assistant", text, cardHref);
    return;
  }
  await db.update(curatorLines).set({ cardHref }).where(eq(curatorLines.id, row.id));
}

export async function latestDeskRole(userId: string) {
  const [row] = await db
    .select({ role: deskTasks.role })
    .from(deskTasks)
    .where(and(eq(deskTasks.userId, userId), ne(deskTasks.status, "canceled")))
    .orderBy(desc(deskTasks.createdAt))
    .limit(1);
  if (row?.role === "copy" || row?.role === "design" || row?.role === "promo" || row?.role === "reply") return row.role;
  return null;
}

export async function loadCuratorLines(userId: string) {
  const rows = await db
    .select({ role: curatorLines.role, content: curatorLines.content, cardHref: curatorLines.cardHref })
    .from(curatorLines)
    .where(eq(curatorLines.userId, userId))
    .orderBy(desc(curatorLines.createdAt))
    .limit(40);
  return rows.reverse().flatMap((row) => {
    if (row.role !== "user" && row.role !== "assistant") return [];
    return [{ role: row.role, content: row.content, cardHref: row.cardHref }];
  });
}

const DESK_ROLES = ["copy", "design", "promo", "reply"] as const;
export type DeskRoleName = (typeof DESK_ROLES)[number];

export async function loadDeskMarks(userId: string) {
  const rows = await db
    .select()
    .from(deskTasks)
    .where(eq(deskTasks.userId, userId))
    .orderBy(desc(deskTasks.createdAt));
  const marks = Object.fromEntries(
    DESK_ROLES.map((role) => {
      const task = rows.find((row) => row.role === role && row.status !== "canceled") ?? null;
      const state = task?.status === "queued" ? "work" : task?.status === "done" ? "done" : "wait";
      return [role, { state, task }] as const;
    }),
  ) as Record<DeskRoleName, { state: "wait" | "work" | "done"; task: (typeof rows)[number] | null }>;
  const live = DESK_ROLES.some((role) => marks[role].state === "work");
  const focus = DESK_ROLES.find((role) => marks[role].state === "work") ?? DESK_ROLES.find((role) => marks[role].state === "wait") ?? "copy";
  return { marks, live, focus };
}
