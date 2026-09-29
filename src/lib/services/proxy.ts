import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { proxySlots } from "../db/schema";
import { AppError } from "../errors";
import { audit } from "./audit";

export async function createSlot(input: {
  actor: string;
  provider: "ltespace" | "ltecenter" | "other";
  label: string;
  region?: string;
  operator?: string;
  secretRef: string;
}) {
  if (!input.label.trim() || !input.secretRef.trim()) {
    throw new AppError("Нужны название и ссылка на секрет");
  }
  const [slot] = await db
    .insert(proxySlots)
    .values({
      provider: input.provider,
      label: input.label.trim(),
      region: input.region?.trim() || null,
      operator: input.operator?.trim() || null,
      secretRef: input.secretRef.trim(),
      status: "free",
    })
    .returning();
  await audit({
    actor: input.actor,
    action: "proxy_create",
    entity: "proxy_slots",
    entityId: slot.id,
    after: { label: slot.label, provider: slot.provider, status: "free" },
  });
  return slot;
}

export async function assignSlot(actor: string, slotId: string, userId: string) {
  const [slot] = await db.select().from(proxySlots).where(eq(proxySlots.id, slotId)).limit(1);
  if (!slot) throw new AppError("Слот не найден");
  if (slot.status !== "free" || slot.assignedUserId) {
    throw new AppError("Слот уже занят или недоступен");
  }
  const [owned] = await db
    .select()
    .from(proxySlots)
    .where(and(eq(proxySlots.assignedUserId, userId), eq(proxySlots.status, "assigned")))
    .limit(1);
  if (owned) throw new AppError("У клиента уже есть слот. Сначала снимите его.");
  const [saved] = await db
    .update(proxySlots)
    .set({ status: "assigned", assignedUserId: userId })
    .where(and(eq(proxySlots.id, slotId), eq(proxySlots.status, "free")))
    .returning();
  if (!saved) throw new AppError("Слот уже занят");
  await audit({
    actor,
    action: "proxy_assign",
    entity: "proxy_slots",
    entityId: slotId,
    after: { assignedUserId: userId, status: "assigned" },
  });
  return saved;
}

export async function unassignSlot(actor: string, slotId: string) {
  const [slot] = await db.select().from(proxySlots).where(eq(proxySlots.id, slotId)).limit(1);
  if (!slot) throw new AppError("Слот не найден");
  const nextStatus = slot.status === "banned" || slot.status === "dead" ? slot.status : "free";
  const [saved] = await db
    .update(proxySlots)
    .set({ assignedUserId: null, status: nextStatus })
    .where(eq(proxySlots.id, slotId))
    .returning();
  await audit({
    actor,
    action: "proxy_unassign",
    entity: "proxy_slots",
    entityId: slotId,
    before: { assignedUserId: slot.assignedUserId, status: slot.status },
    after: { assignedUserId: null, status: saved.status },
  });
  return saved;
}
