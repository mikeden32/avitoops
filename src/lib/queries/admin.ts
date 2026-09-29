import { count, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  accessStatus,
  avitoAccounts,
  jobs,
  listings,
  notificationOutbox,
  paymentRequests,
  proxySlots,
  subscriptions,
  users,
} from "../db/schema";

export async function loadClients() {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      role: users.role,
      plan: subscriptions.plan,
      subscriptionStatus: subscriptions.status,
      periodEnd: subscriptions.currentPeriodEnd,
      access: accessStatus.state,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(accessStatus, eq(accessStatus.userId, users.id))
    .where(eq(users.role, "client"))
    .orderBy(desc(users.createdAt));
  const listingCounts = await db
    .select({ userId: listings.userId, value: count() })
    .from(listings)
    .groupBy(listings.userId);
  const counts = new Map(listingCounts.map((row) => [row.userId, Number(row.value)]));
  return rows.map((row) => ({ ...row, listings: counts.get(row.id) ?? 0 }));
}

export async function loadClient(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "client") return null;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const [access] = await db.select().from(accessStatus).where(eq(accessStatus.userId, userId)).limit(1);
  const [avito] = await db.select().from(avitoAccounts).where(eq(avitoAccounts.userId, userId)).limit(1);
  const userListings = await db
    .select({ id: listings.id, title: listings.title, status: listings.status })
    .from(listings)
    .where(eq(listings.userId, userId));
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    telegram: user.telegram,
    plan: sub?.plan ?? null,
    subscriptionStatus: sub?.status ?? null,
    periodEnd: sub?.currentPeriodEnd ?? null,
    access: access?.state ?? "green",
    accessReason: access?.reason ?? "",
    avitoStatus: avito?.status ?? "pending",
    loginHint: avito?.loginHint ?? "",
    avitoNotes: avito?.notes ?? "",
    listings: userListings,
  };
}

export async function loadJobs(status?: string) {
  const statusFilter =
    status === "queued" ||
    status === "running" ||
    status === "done" ||
    status === "failed" ||
    status === "canceled"
      ? eq(jobs.status, status)
      : undefined;
  const query = db
    .select({
      id: jobs.id,
      userId: jobs.userId,
      email: users.email,
      listingId: jobs.listingId,
      type: jobs.type,
      payload: jobs.payload,
      status: jobs.status,
      assignedAgent: jobs.assignedAgent,
      createdBy: jobs.createdBy,
      errorCode: jobs.errorCode,
      errorNote: jobs.errorNote,
      createdAt: jobs.createdAt,
      finishedAt: jobs.finishedAt,
    })
    .from(jobs)
    .innerJoin(users, eq(users.id, jobs.userId));
  const filtered = statusFilter ? query.where(statusFilter) : query;
  return filtered.orderBy(desc(jobs.createdAt)).limit(200);
}

export async function loadSlots() {
  return db
    .select({
      id: proxySlots.id,
      provider: proxySlots.provider,
      label: proxySlots.label,
      region: proxySlots.region,
      operator: proxySlots.operator,
      status: proxySlots.status,
      assignedUserId: proxySlots.assignedUserId,
      email: users.email,
      secretRef: proxySlots.secretRef,
    })
    .from(proxySlots)
    .leftJoin(users, eq(users.id, proxySlots.assignedUserId))
    .orderBy(desc(proxySlots.createdAt));
}

export async function loadPayments() {
  return db
    .select({
      id: paymentRequests.id,
      userId: paymentRequests.userId,
      email: users.email,
      kind: paymentRequests.kind,
      plan: paymentRequests.plan,
      amountRub: paymentRequests.amountRub,
      status: paymentRequests.status,
      createdAt: paymentRequests.createdAt,
    })
    .from(paymentRequests)
    .innerJoin(users, eq(users.id, paymentRequests.userId))
    .orderBy(desc(paymentRequests.createdAt));
}

export async function loadNotifications() {
  return db.select().from(notificationOutbox).orderBy(desc(notificationOutbox.createdAt)).limit(100);
}
