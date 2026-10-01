import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { planToBill } from "../src/lib/handoff";
import { applyFacts, composeTask, emptyFacts, locationOf } from "../src/lib/services/sale";
import { loadEnv } from "./load-env";

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log(`ok ${name}`);
}

const phrase = "Продаю каркасную баню 6×2,4 за 570 000 ₽. Москва и область";
const ready = composeTask(applyFacts(emptyFacts(), phrase));
check("product", ready.product === "каркасная баня 6×2,4");
check("price", ready.price === 570000);
check("location", ready.location === "Москва и Московская область");
check("ready", ready.completeness === "ready" && ready.missingFields.length === 0);
check("size", ready.attributes.size === "6×2,4");
check("title", ready.title === "Каркасная баня 6×2,4");

for (const sample of ["Москва и область", "Москва и МО", "Москва и Московская область", "Московская область"]) {
  check(`region ${sample}`, locationOf(sample) === "Москва и Московская область");
}
check("city stays city", locationOf("Москва") === "Москва");

const partial = composeTask(applyFacts(emptyFacts(), "Продаю каркасную баню 6×2,4"));
check("asks location next", partial.missingFields[0] === "location" && partial.missingFields.includes("price"));
const withPlace = composeTask(applyFacts(applyFacts(emptyFacts(), "Продаю каркасную баню 6×2,4"), "Москва и МО"));
check("keeps product", withPlace.product === "каркасная баня 6×2,4" && withPlace.missingFields.join() === "price");

check("task handoff does not bill", planToBill(true, "business") === null && planToBill(true, "start") === null);
check("tariff handoff still bills", planToBill(false, "business") === "business" && planToBill(false, "start") === "start");

loadEnv();

async function main() {
const { db } = await import("../src/lib/db");
const { guestDrafts, listings, curatorLines, users, subscriptions, avitoAccounts, accessStatus, promoBudgets, auditEvents } =
  await import("../src/lib/db/schema");
const { hashGuestToken, claimGuestDraft, cabinetTaskContext, cleanupGuestDrafts, guestCookiePolicy } = await import("../src/lib/services/guest-draft");
const { registerUser } = await import("../src/lib/services/users");

const stamp = randomBytes(4).toString("hex");
const password = randomBytes(12).toString("base64url");
const productionCookie = guestCookiePolicy("production");
const localCookie = guestCookiePolicy("development");
check(
  "production cookie flags",
  productionCookie.name === "avitoops-guest" &&
    productionCookie.httpOnly &&
    productionCookie.secure &&
    productionCookie.sameSite === "lax" &&
    productionCookie.path === "/" &&
    !("domain" in productionCookie),
);
check("local http cookie is not secure", localCookie.secure === false);

const owner = await registerUser({ email: `phase3-${stamp}-a@avitoops.local`, password });
const other = await registerUser({ email: `phase3-${stamp}-b@avitoops.local`, password });

async function wipe(userId: string) {
  await db.delete(auditEvents).where(eq(auditEvents.actor, userId));
  await db.delete(guestDrafts).where(eq(guestDrafts.claimedByUserId, userId));
  await db.delete(curatorLines).where(eq(curatorLines.userId, userId));
  await db.delete(listings).where(eq(listings.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.delete(avitoAccounts).where(eq(avitoAccounts.userId, userId));
  await db.delete(accessStatus).where(eq(accessStatus.userId, userId));
  await db.delete(promoBudgets).where(eq(promoBudgets.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

const created: string[] = [];

try {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashGuestToken(token);
  created.push(tokenHash);
  await db.insert(guestDrafts).values({
    tokenHash,
    status: "active",
    product: ready.product?.replaceAll("×", "x") ?? null,
    location: ready.location,
    price: ready.price,
    title: ready.title?.replaceAll("×", "x") ?? null,
    description: "Каркасная баня 6x2,4. Москва и Московская область. Цена 570 000 руб.",
    attributes: { size: "6x2,4" },
    missingFields: [],
    visibleTranscript: [
      { role: "user", content: "Продаю каркасную баню 6x2,4 за 570 000 руб. Москва и область", at: new Date().toISOString() },
      { role: "assistant", content: "Собрал объявление. Проверьте карточку.", at: new Date().toISOString() },
    ],
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const before = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, owner.id));
  const first = await claimGuestDraft(owner.id, token);
  const second = await claimGuestDraft(owner.id, token);
  const after = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, owner.id));
  const lines = await db.select({ id: curatorLines.id }).from(curatorLines).where(eq(curatorLines.userId, owner.id));
  if (first.status !== "claimed" || second.status !== "already") throw new Error("claim status");
  check("claim creates listing", Boolean(first.listingId));
  check("repeat claim same listing", second.listingId === first.listingId);
  check("no duplicate listing", after.length === before.length + 1);
  check("conversation moved", lines.length >= 2);
  check("claim result has no sale payload", !("sale" in first));
  const context = await cabinetTaskContext(owner.id);
  check("cabinet reads the claimed listing", context.city === ready.location && context.priceRub === 570000 && Boolean(context.item));

  const stolen = await claimGuestDraft(other.id, token);
  const otherListings = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, other.id));
  check("other account cannot take draft", stolen.status === "taken" && otherListings.length === 0);
  check("taken result has no title", !("title" in stolen));

  const expiredToken = randomBytes(32).toString("base64url");
  const expiredHash = hashGuestToken(expiredToken);
  created.push(expiredHash);
  await db.insert(guestDrafts).values({
    tokenHash: expiredHash,
    status: "active",
    product: "стол",
    location: "Тула",
    price: 1000,
    title: "Стол",
    description: "Стол. Тула. Цена 1 000 руб.",
    attributes: {},
    missingFields: [],
    visibleTranscript: [],
    expiresAt: new Date(Date.now() - 1000),
  });
  const expired = await claimGuestDraft(owner.id, expiredToken);
  const still = await db
    .select({ status: guestDrafts.status })
    .from(guestDrafts)
    .where(eq(guestDrafts.tokenHash, expiredHash))
    .limit(1);
  check("expired token is refused", expired.status === "expired" && still[0]?.status === "active");
  check("expired result has no title", !("title" in expired));

  const unknown = await claimGuestDraft(owner.id, randomBytes(32).toString("base64url"));
  check("unknown token leaks nothing", unknown.status === "none" && !("title" in unknown));

  const parked = randomBytes(32).toString("base64url");
  const parkedHash = hashGuestToken(parked);
  created.push(parkedHash);
  await db.insert(guestDrafts).values({
    tokenHash: parkedHash,
    status: "active",
    product: "лавка",
    location: null,
    price: null,
    title: null,
    description: null,
    attributes: {},
    missingFields: ["location", "price"],
    visibleTranscript: [{ role: "user", content: "лавка", at: new Date().toISOString() }],
    expiresAt: new Date(Date.now() + 60_000),
  });
  const left = await db
    .select({ status: guestDrafts.status })
    .from(guestDrafts)
    .where(and(eq(guestDrafts.tokenHash, parkedHash), eq(guestDrafts.status, "active")))
    .limit(1);
  check("unclaimed draft survives", left.length === 1);

  async function insertReady(token: string) {
    const tokenHash = hashGuestToken(token);
    created.push(tokenHash);
    await db.insert(guestDrafts).values({
      tokenHash,
      status: "active",
      product: ready.product?.replaceAll("×", "x") ?? null,
      location: ready.location,
      price: ready.price,
      title: ready.title?.replaceAll("×", "x") ?? null,
      description: "Каркасная баня 6x2,4. Москва и Московская область. Цена 570 000 руб.",
      attributes: { size: "6x2,4" },
      missingFields: [],
      visibleTranscript: [
        { role: "user", content: "Продаю каркасную баню", at: new Date().toISOString() },
        { role: "assistant", content: "Собрал объявление. Проверьте карточку.", at: new Date().toISOString() },
      ],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return tokenHash;
  }

  const sameToken = randomBytes(32).toString("base64url");
  const sameHash = await insertReady(sameToken);
  const sameListingsBefore = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, owner.id));
  const sameLinesBefore = await db.select({ id: curatorLines.id }).from(curatorLines).where(eq(curatorLines.userId, owner.id));
  const [sameA, sameB] = await Promise.all([claimGuestDraft(owner.id, sameToken), claimGuestDraft(owner.id, sameToken)]);
  const sameIds = [sameA, sameB].flatMap((row) => ("listingId" in row && row.listingId ? [row.listingId] : []));
  const sameListingsAfter = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, owner.id));
  const sameLinesAfter = await db.select({ id: curatorLines.id }).from(curatorLines).where(eq(curatorLines.userId, owner.id));
  check("parallel same user shares listing", sameIds.length === 2 && sameIds[0] === sameIds[1]);
  check("parallel same user claimed once", [sameA.status, sameB.status].sort().join() === "already,claimed");
  check("parallel same user one listing", sameListingsAfter.length === sameListingsBefore.length + 1);
  check("parallel same user one transcript", sameLinesAfter.length === sameLinesBefore.length + 3);

  const crossToken = randomBytes(32).toString("base64url");
  await insertReady(crossToken);
  const ownerBefore = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, owner.id));
  const otherBefore = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, other.id));
  const [crossA, crossB] = await Promise.all([claimGuestDraft(owner.id, crossToken), claimGuestDraft(other.id, crossToken)]);
  const winner = [crossA, crossB].find((row) => row.status === "claimed");
  const loser = [crossA, crossB].find((row) => row.status === "taken");
  const ownerAfter = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, owner.id));
  const otherAfter = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, other.id));
  check(
    "parallel cross user one owner",
    Boolean(winner && "listingId" in winner && winner.listingId) && loser?.status === "taken" && !("title" in loser),
  );
  check(
    "parallel cross user one listing",
    ownerAfter.length - ownerBefore.length + (otherAfter.length - otherBefore.length) === 1,
  );

  const keepHash = hashGuestToken(randomBytes(32).toString("base64url"));
  created.push(keepHash);
  await db.insert(guestDrafts).values({
    tokenHash: keepHash,
    status: "active",
    product: "лавка",
    location: "Тула",
    price: 2000,
    title: "Лавка",
    description: "Лавка. Тула. Цена 2 000 руб.",
    attributes: {},
    missingFields: [],
    visibleTranscript: [],
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  });
  const openHash = hashGuestToken(randomBytes(32).toString("base64url"));
  created.push(openHash);
  await db.insert(guestDrafts).values({
    tokenHash: openHash,
    status: "claimed",
    product: "полка",
    location: "Казань",
    price: 3000,
    title: null,
    description: null,
    attributes: {},
    missingFields: ["price"],
    visibleTranscript: [],
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    claimedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    claimedByUserId: owner.id,
  });
  await db
    .update(guestDrafts)
    .set({
      claimedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    })
    .where(eq(guestDrafts.tokenHash, sameHash));
  await cleanupGuestDrafts();
  const keepRow = await db.select({ id: guestDrafts.id }).from(guestDrafts).where(eq(guestDrafts.tokenHash, keepHash)).limit(1);
  const parkedRow = await db.select({ id: guestDrafts.id }).from(guestDrafts).where(eq(guestDrafts.tokenHash, parkedHash)).limit(1);
  const expiredRow = await db.select({ id: guestDrafts.id }).from(guestDrafts).where(eq(guestDrafts.tokenHash, expiredHash)).limit(1);
  const openRow = await db.select({ id: guestDrafts.id }).from(guestDrafts).where(eq(guestDrafts.tokenHash, openHash)).limit(1);
  const settledRow = await db.select({ id: guestDrafts.id }).from(guestDrafts).where(eq(guestDrafts.tokenHash, sameHash)).limit(1);
  const settledListing = sameIds[0]
    ? await db.select({ id: listings.id }).from(listings).where(eq(listings.id, sameIds[0])).limit(1)
    : [];
  check("cleanup keeps a live draft", keepRow.length === 1 && parkedRow.length === 1);
  check("cleanup removes an expired draft", expiredRow.length === 0);
  check("cleanup keeps a claimed draft without a listing", openRow.length === 1);
  check("cleanup removes a settled claim and keeps the listing", settledRow.length === 0 && settledListing.length === 1);

  console.log("phase3 check passed");
} finally {
  for (const tokenHash of created) {
    await db.delete(guestDrafts).where(eq(guestDrafts.tokenHash, tokenHash));
  }
  await wipe(other.id);
  await wipe(owner.id);
  const { sqlClient } = await import("../src/lib/db");
  await sqlClient.end({ timeout: 5 });
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
