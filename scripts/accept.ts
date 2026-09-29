import { eq, inArray } from "drizzle-orm";
import { loadEnv } from "./load-env";

async function main() {
  loadEnv();

const { sqlClient, db } = await import("../src/lib/db");
const { jobs, listings, subscriptions } = await import("../src/lib/db/schema");
const { registerUser, ensureAdmin } = await import("../src/lib/services/users");
const { saveProfile } = await import("../src/lib/services/profile");
const { createSubscriptionRequest, createDepositRequest, confirmPayment, getDepositBalance } =
  await import("../src/lib/services/billing");
const { createListing } = await import("../src/lib/services/listings");
const { enqueueJob } = await import("../src/lib/services/jobs");
const { setAccess, pauseSubscription, resumeSubscription } = await import("../src/lib/services/access");
const { setPromoSettings, requestPromo, currentPromo } = await import("../src/lib/services/promo");
const { createSlot, assignSlot, unassignSlot } = await import("../src/lib/services/proxy");
const { loadDashboard, loadListing } = await import("../src/lib/queries/cabinet");
const { AppError } = await import("../src/lib/errors");
const { redact } = await import("../src/lib/redact");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`OK ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name} ${detail}`);
}

async function fails(name: string, run: () => Promise<unknown>) {
  try {
    await run();
    check(name, false, "expected error");
  } catch (error) {
    check(name, error instanceof AppError, error instanceof Error ? error.message : "");
  }
}

function photo(name: string) {
  return [{ filename: name, mime: "image/png", bytes: png }];
}

function draft(title: string, price = 1000) {
  return {
    title,
    category: "Товары",
    city: "Тула",
    priceRub: price,
    body: "Описание для пилота",
  };
}

try {
  await db
    .update(jobs)
    .set({ status: "canceled", finishedAt: new Date(), errorCode: "accept_reset" })
    .where(inArray(jobs.status, ["queued", "running"]));
  await ensureAdmin();
  const stamp = Date.now();
  const user = await registerUser({ email: `pilot-${stamp}@test.local`, password: "password-1" });
  await saveProfile(user.id, {
    companyName: "Пилот",
    phone: "+70000000000",
    telegram: "",
    avitoPhone: "+70000000001",
    workMode: "own_cabinet",
    cities: ["Тула"],
    categories: ["Товары"],
    consent: true,
  });
  await fails("listing before payment", () => createListing(user.id, draft("Рано"), photo("a.png"), "draft"));

  const subRequest = await createSubscriptionRequest(user.id, "start");
  await confirmPayment("accept", subRequest.id);
  const first = await createListing(user.id, draft("Товар 1"), photo("a.png"), "send");
  await createListing(user.id, draft("Товар 2"), photo("b.png"), "draft");
  await createListing(user.id, draft("Товар 3"), photo("c.png"), "draft");
  await fails("plan cap", () => createListing(user.id, draft("Лишний"), photo("d.png"), "draft"));

  const nextRoute = await import("../src/app/api/internal/jobs/next/route");
  const completeRoute = await import("../src/app/api/internal/jobs/[id]/complete/route");
  const denied = await nextRoute.POST(
    new Request("http://local/api/internal/jobs/next", {
      method: "POST",
      headers: { authorization: "Bearer wrong", "content-type": "application/json" },
      body: JSON.stringify({ agent: "avitolog-1" }),
    }),
  );
  check("internal auth", denied.status === 401);

  const takenRes = await nextRoute.POST(
    new Request("http://local/api/internal/jobs/next", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ agent: "avitolog-1" }),
    }),
  );
  const takenBody = (await takenRes.json()) as {
    job: { id: string; type: string; listing_id: string | null } | null;
  };
  check(
    "worker takes publish",
    takenRes.status === 200 && takenBody.job?.type === "publish" && takenBody.job.listing_id === first.id,
  );
  const url = "https://www.avito.ru/tula/item_1";
  const done = await completeRoute.POST(
    new Request("http://local/complete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "done", avito_url: url, external_id: "ext-1" }),
    }),
    { params: Promise.resolve({ id: takenBody.job!.id }) },
  );
  check("worker completes publish", done.status === 200);
  const card = await loadListing(user.id, first.id);
  check(
    "live url in cabinet",
    card?.listing.status === "live" && card.listing.avitoUrl === url,
    JSON.stringify({ status: card?.listing.status, url: card?.listing.avitoUrl }),
  );

  const second = await db.select().from(listings).where(eq(listings.userId, user.id));
  const draftRow = second.find((item) => item.title === "Товар 2");
  await enqueueJob({
    userId: user.id,
    type: "publish",
    listingId: draftRow!.id,
    payload: { listing_id: draftRow!.id },
    createdBy: user.id,
  });
  await setAccess("accept", user.id, "red", "429");
  const paused = await db.select().from(listings).where(eq(listings.id, draftRow!.id));
  const open = await db.select().from(jobs).where(eq(jobs.userId, user.id));
  check(
    "pause cancels publish",
    paused[0]?.status === "paused" && open.filter((job) => job.type === "publish" && job.status === "queued").length === 0,
  );
  await fails("publish blocked on red", () =>
    enqueueJob({
      userId: user.id,
      type: "publish",
      listingId: draftRow!.id,
      payload: { listing_id: draftRow!.id },
      createdBy: user.id,
    }),
  );
  const healRows = await db.select().from(jobs).where(eq(jobs.userId, user.id));
  check("one heal job", healRows.filter((job) => job.type === "heal_access").length === 1);
  await setAccess("accept", user.id, "red", "429");
  const healRowsAgain = await db.select().from(jobs).where(eq(jobs.userId, user.id));
  check("no heal loop", healRowsAgain.filter((job) => job.type === "heal_access").length === 1);
  await fails("client cannot heal", () =>
    enqueueJob({
      userId: user.id,
      type: "heal_access",
      payload: { reason: "429" },
      createdBy: user.id,
    }),
  );

  await setAccess("accept", user.id, "green");
  await pauseSubscription(user.id, user.id);
  await fails("paused subscription blocks publish", () =>
    enqueueJob({
      userId: user.id,
      type: "update",
      listingId: first.id,
      payload: { listing_id: first.id, fields: ["price"] },
      createdBy: user.id,
    }),
  );
  await resumeSubscription(user.id, user.id);

  await fails("promo without deposit", () => requestPromo(user.id, first.id, 100, user.id));
  const deposit = await createDepositRequest(user.id, 1000);
  await confirmPayment("accept", deposit.id);
  await setPromoSettings(user.id, { enabled: true, weekLimitRub: 300 });
  await fails("promo above week limit", () => requestPromo(user.id, first.id, 400, user.id));
  const promo = await requestPromo(user.id, first.id, 200, user.id);
  const promoTaken = await nextRoute.POST(
    new Request("http://local/api/internal/jobs/next", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ agent: "avitolog-1" }),
    }),
  );
  const promoBody = (await promoTaken.json()) as { job: { id: string; type: string } | null };
  check("worker takes promo", promoBody.job?.id === promo.id && promoBody.job.type === "promo");
  const promoDone = await completeRoute.POST(
    new Request("http://local/complete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "done", spent_rub: 200 }),
    }),
    { params: Promise.resolve({ id: promo.id }) },
  );
  check("promo spend recorded", promoDone.status === 200 && (await getDepositBalance(user.id)) === 800);
  const budget = await currentPromo(user.id);
  check("week spent", budget.spentRub === 200);
  await fails("promo above remaining week", () => requestPromo(user.id, first.id, 200, user.id));
  await requestPromo(user.id, first.id, 100, user.id);

  const slot = await createSlot({
    actor: "accept",
    provider: "ltespace",
    label: `slot-${stamp}`,
    region: "Тула",
    secretRef: "vault://pilot/slot-1",
  });
  await assignSlot("accept", slot.id, user.id);
  const other = await registerUser({ email: `other-${stamp}@test.local`, password: "password-1" });
  await fails("slot is not shared", () => assignSlot("accept", slot.id, other.id));
  const dash = await loadDashboard(user.id);
  check("cabinet hides proxy", !JSON.stringify(dash).includes("vault://") && dash.access === "green");
  await unassignSlot("accept", slot.id);
  const { proxySlots } = await import("../src/lib/db/schema");
  const [freed] = await db.select().from(proxySlots).where(eq(proxySlots.id, slot.id));
  check("slot unassigned", freed?.status === "free" && freed.assignedUserId === null);

  await db
    .update(subscriptions)
    .set({ status: "past_due", currentPeriodEnd: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) })
    .where(eq(subscriptions.userId, user.id));
  await fails("past due over 3 days", () =>
    enqueueJob({
      userId: user.id,
      type: "reply",
      payload: { thread_ref: "x", tone: "short" },
      createdBy: user.id,
    }),
  );
  await db
    .update(subscriptions)
    .set({ status: "past_due", currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) })
    .where(eq(subscriptions.userId, user.id));
  const grace = await enqueueJob({
    userId: user.id,
    type: "report",
    payload: {},
    createdBy: "accept",
    asAdmin: true,
  });
  check("grace period allows work", grace.status === "queued");

  const business = await registerUser({ email: `biz-${stamp}@test.local`, password: "password-1" });
  const bizPay = await createSubscriptionRequest(business.id, "business");
  await confirmPayment("accept", bizPay.id);
  await saveProfile(business.id, {
    companyName: "Бизнес",
    phone: "+70000000002",
    avitoPhone: "+70000000003",
    workMode: "own_cabinet",
    cities: ["Москва"],
    categories: ["Услуги"],
    consent: true,
  });
  for (let index = 0; index < 10; index += 1) {
    await createListing(business.id, draft(`Бизнес ${index + 1}`), photo(`${index}.png`), "draft");
  }
  await fails("business cap", () => createListing(business.id, draft("Одиннадцатый"), photo("x.png"), "draft"));

  check("logs redact proxy", !redact("connect 10.0.0.8:3128 password=secret").includes("10.0.0.8"));
  console.log(failed === 0 ? "ACCEPT PASS" : `ACCEPT FAIL ${failed}`);
} finally {
  await sqlClient.end({ timeout: 5 });
}

if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
