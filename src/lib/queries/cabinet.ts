import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  avitoAccounts,
  clientProfiles,
  jobs,
  listings,
  messagesDigest,
  paymentRequests,
  subscriptions,
} from "../db/schema";
import { assertNoSecrets } from "../redact";
import { getDepositBalance, listLedger } from "../services/billing";
import { loadGate } from "../services/gate";
import { currentPromo } from "../services/promo";

export async function loadDashboard(userId: string) {
  const gate = await loadGate(userId);
  const [listingCount] = await db
    .select({ value: count() })
    .from(listings)
    .where(eq(listings.userId, userId));
  const [leadCount] = await db
    .select({ value: count() })
    .from(messagesDigest)
    .where(and(eq(messagesDigest.userId, userId), eq(messagesDigest.status, "new")));
  const depositRub = await getDepositBalance(userId);
  const profile = await db
    .select({ companyName: clientProfiles.companyName })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId))
    .limit(1);
  const data = {
    access: gate.access,
    block: gate.block,
    plan: gate.subscription?.plan ?? null,
    subscriptionStatus: gate.subscription?.status ?? null,
    periodEnd: gate.subscription?.currentPeriodEnd ?? null,
    listingCount: Number(listingCount?.value ?? 0),
    newLeads: Number(leadCount?.value ?? 0),
    depositRub,
    hasProfile: Boolean(profile[0]),
  };
  assertNoSecrets(data);
  return data;
}

export async function loadListings(userId: string) {
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      city: listings.city,
      priceRub: listings.priceRub,
      status: listings.status,
      avitoUrl: listings.avitoUrl,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .where(eq(listings.userId, userId))
    .orderBy(desc(listings.updatedAt));
  assertNoSecrets(rows);
  return rows;
}

export async function loadListing(userId: string, listingId: string) {
  const [listing] = await db
    .select({
      id: listings.id,
      title: listings.title,
      category: listings.category,
      city: listings.city,
      priceRub: listings.priceRub,
      body: listings.body,
      photos: listings.photos,
      avitoUrl: listings.avitoUrl,
      status: listings.status,
      sku: listings.sku,
      deliveryNote: listings.deliveryNote,
      kitNote: listings.kitNote,
      operatorNotes: listings.operatorNotes,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
    .limit(1);
  if (!listing) return null;
  const history = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      createdAt: jobs.createdAt,
      finishedAt: jobs.finishedAt,
      errorCode: jobs.errorCode,
    })
    .from(jobs)
    .where(and(eq(jobs.listingId, listingId), eq(jobs.userId, userId)))
    .orderBy(desc(jobs.createdAt));
  const data = { listing, history };
  assertNoSecrets(data);
  return data;
}

export async function loadLeads(userId: string) {
  const rows = await db
    .select({
      id: messagesDigest.id,
      preview: messagesDigest.preview,
      urgency: messagesDigest.urgency,
      status: messagesDigest.status,
      createdAt: messagesDigest.createdAt,
      listingTitle: listings.title,
    })
    .from(messagesDigest)
    .leftJoin(listings, eq(messagesDigest.listingId, listings.id))
    .where(eq(messagesDigest.userId, userId))
    .orderBy(desc(messagesDigest.createdAt));
  assertNoSecrets(rows);
  return rows;
}

export async function loadPromo(userId: string) {
  const budget = await currentPromo(userId);
  const depositRub = await getDepositBalance(userId);
  const live = await db
    .select({ id: listings.id, title: listings.title })
    .from(listings)
    .where(and(eq(listings.userId, userId), eq(listings.status, "live")));
  const data = {
    enabled: budget.enabled,
    weekLimitRub: budget.weekLimitRub,
    spentRub: budget.spentRub,
    weekStart: budget.weekStart,
    depositRub,
    live,
  };
  assertNoSecrets(data);
  return data;
}

export async function loadBilling(userId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const requests = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.userId, userId))
    .orderBy(desc(paymentRequests.createdAt));
  const data = {
    plan: sub?.plan ?? null,
    status: sub?.status ?? null,
    periodEnd: sub?.currentPeriodEnd ?? null,
    depositRub: await getDepositBalance(userId),
    requests: requests.map((item) => ({
      id: item.id,
      kind: item.kind,
      plan: item.plan,
      amountRub: item.amountRub,
      status: item.status,
      createdAt: item.createdAt,
    })),
    ledger: (await listLedger(userId)).map((item) => ({
      id: item.id,
      kind: item.kind,
      amountRub: item.amountRub,
      createdAt: item.createdAt,
    })),
  };
  assertNoSecrets(data);
  return data;
}

export async function loadSettings(userId: string) {
  const profile = await db.select().from(clientProfiles).where(eq(clientProfiles.userId, userId)).limit(1);
  const [account] = await db
    .select({ loginHint: avitoAccounts.loginHint, status: avitoAccounts.status })
    .from(avitoAccounts)
    .where(eq(avitoAccounts.userId, userId))
    .limit(1);
  const [sub] = await db
    .select({ status: subscriptions.status, periodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  const data = {
    phone: profile[0]?.phone ?? "",
    telegram: profile[0]?.telegram ?? "",
    companyName: profile[0]?.companyName ?? "",
    loginHint: account?.loginHint ?? "",
    avitoStatus: account?.status ?? "pending",
    subscriptionStatus: sub?.status ?? null,
    periodEnd: sub?.periodEnd ?? null,
  };
  assertNoSecrets(data);
  return data;
}

export async function loadOnboarding(userId: string) {
  const [profile] = await db.select().from(clientProfiles).where(eq(clientProfiles.userId, userId)).limit(1);
  const [account] = await db
    .select({ loginHint: avitoAccounts.loginHint })
    .from(avitoAccounts)
    .where(eq(avitoAccounts.userId, userId))
    .limit(1);
  const data = {
    companyName: profile?.companyName ?? "",
    phone: profile?.phone ?? "",
    telegram: profile?.telegram ?? "",
    avitoPhone: account?.loginHint ?? "",
    workMode: profile?.workMode ?? "own_cabinet",
    cities: profile?.cities.join(", ") ?? "",
    categories: profile?.categories.join(", ") ?? "",
    replyRules: profile?.replyRules ?? "",
    escalateRules: profile?.escalateRules ?? "",
  };
  assertNoSecrets(data);
  return data;
}
