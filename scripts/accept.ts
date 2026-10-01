import { and, eq, inArray } from "drizzle-orm";
import { loadEnv } from "./load-env";

async function main() {
  loadEnv();

const { sqlClient, db } = await import("../src/lib/db");
const { avitoAccounts, jobs, listings, messagesDigest, subscriptions } = await import("../src/lib/db/schema");
const { DAILY_QUOTA, PLANS } = await import("../src/lib/plans");
const { curatorFacts, localReply } = await import("../src/lib/curator");
const { moscowDayRange } = await import("../src/lib/week");
const { replySlotOpen, repliesToday, startedToday } = await import("../src/lib/services/daily");
const { createDigest, templateReply } = await import("../src/lib/services/leads");
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
  const [trial] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
  check(
    "trial day does not grant the scale quota",
    trial?.plan !== "scale" &&
      trial?.paymentProvider === "trial" &&
      trial.status === "active" &&
      trial.currentPeriodEnd.getTime() > Date.now() &&
      trial.currentPeriodEnd.getTime() < Date.now() + 25 * 60 * 60 * 1000,
  );
  check(
    "scale tariff keeps its daily numbers",
    DAILY_QUOTA.scale.publish === 20 &&
      DAILY_QUOTA.scale.update === 20 &&
      DAILY_QUOTA.scale.promo === 20 &&
      DAILY_QUOTA.scale.replies === 200,
  );
  const trialPublish = await enqueueJob({
    userId: user.id,
    type: "publish",
    payload: { listing_id: "none" },
    createdBy: user.id,
  });
  check("trial starts one publish", Boolean(trialPublish.id));
  await fails("trial does not start a second publish", () =>
    enqueueJob({
      userId: user.id,
      type: "publish",
      payload: { listing_id: "none" },
      createdBy: user.id,
    }),
  );
  await db
    .update(jobs)
    .set({ status: "canceled", finishedAt: new Date(), errorCode: "accept_reset" })
    .where(eq(jobs.id, trialPublish.id));

  const subRequest = await createSubscriptionRequest(user.id, "start");
  await confirmPayment("accept", subRequest.id);
  const first = await createListing(user.id, draft("Товар 1"), photo("a.png"), "send");
  await createListing(user.id, draft("Товар 2"), photo("b.png"), "draft");
  await createListing(user.id, draft("Товар 3"), photo("c.png"), "draft");
  const extra = await createListing(user.id, draft("Лишний"), photo("d.png"), "draft");
  check("no cabinet listing cap", Boolean(extra.id));
  await db
    .update(avitoAccounts)
    .set({ status: "connected", refreshToken: "accept-refresh", avitoUserId: "100" })
    .where(eq(avitoAccounts.userId, user.id));

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

  const noon = new Date("2026-09-29T09:00:00.000Z");
  const day = moscowDayRange(noon);
  check(
    "moscow day uses the same offset as the deposit week",
    day.start.toISOString() === "2026-09-28T21:00:00.000Z" && day.end.toISOString() === "2026-09-29T21:00:00.000Z",
  );

  const limits = await registerUser({ email: `limits-${stamp}@test.local`, password: "password-1" });
  await saveProfile(limits.id, {
    companyName: "Лимиты",
    phone: "+70000000010",
    telegram: "",
    avitoPhone: "+70000000011",
    workMode: "own_cabinet",
    cities: ["Тула"],
    categories: ["Товары"],
    consent: true,
  });
  const limitsPay = await createSubscriptionRequest(limits.id, "start");
  await confirmPayment("accept", limitsPay.id);
  await db
    .update(avitoAccounts)
    .set({ status: "connected", refreshToken: "accept-refresh", avitoUserId: "200" })
    .where(eq(avitoAccounts.userId, limits.id));

  async function takeJob(types?: string[]) {
    const res = await nextRoute.POST(
      new Request("http://local/api/internal/jobs/next", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ agent: "avitolog-1", types }),
      }),
    );
    const body = (await res.json()) as {
      job: { id: string; type: string; user_id: string; listing_id: string | null } | null;
    };
    return body.job;
  }

  async function finish(id: string) {
    const done = await completeRoute.POST(
      new Request("http://local/complete", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "done",
          avito_url: "https://www.avito.ru/tula/item_daily",
          external_id: "ext-daily",
        }),
      }),
      { params: Promise.resolve({ id }) },
    );
    if (done.status !== 200) {
      const text = await done.text();
      check("daily job complete", false, text.slice(0, 180));
    }
  }

  for (let index = 0; index < 4; index += 1) {
    await createListing(limits.id, draft(`День ${index}`), photo(`day-${index}.png`), "send");
  }
  for (let index = 0; index < 3; index += 1) {
    const job = await takeJob();
    check("start publish within the day", job?.type === "publish" && job.user_id === limits.id);
    if (job) await finish(job.id);
  }
  check("fourth publish stays queued", (await takeJob()) === null);
  const queuedPublish = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, limits.id), eq(jobs.type, "publish"), eq(jobs.status, "queued")));
  check("full day does not cancel publish", queuedPublish.length === 1);

  const yesterday = new Date(moscowDayRange().start.getTime() - 60 * 60 * 1000);
  await db
    .update(jobs)
    .set({ startedAt: yesterday })
    .where(and(eq(jobs.userId, limits.id), inArray(jobs.status, ["done", "running"])));
  for (let index = 0; index < 3; index += 1) {
    await createListing(limits.id, draft(`Следующие ${index}`), photo(`next-${index}.png`), "send");
  }
  let nextDay = 0;
  for (let index = 0; index < 3; index += 1) {
    const job = await takeJob();
    if (job?.type === "publish" && job.user_id === limits.id) {
      nextDay += 1;
      await finish(job.id);
    }
  }
  const stillQueued = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, limits.id), eq(jobs.type, "publish"), eq(jobs.status, "queued")));
  check(
    "next day starts only three",
    nextDay === 3 && stillQueued.length === 1 && (await startedToday(limits.id, "publish")) === 3,
  );

  const live = await db.select().from(listings).where(and(eq(listings.userId, limits.id), eq(listings.status, "live")));
  for (let index = 0; index < 4; index += 1) {
    await enqueueJob({
      userId: limits.id,
      type: "update",
      listingId: live[index].id,
      payload: { listing_id: live[index].id, fields: ["price"] },
      createdBy: limits.id,
    });
  }
  let edits = 0;
  for (let index = 0; index < 3; index += 1) {
    const job = await takeJob();
    if (job?.type === "update" && job.user_id === limits.id) edits += 1;
  }
  const waitingEdit = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, limits.id), eq(jobs.type, "update"), eq(jobs.status, "queued")));
  check(
    "edit does not spend a publish slot",
    edits === 3 && waitingEdit.length === 1 && (await startedToday(limits.id, "publish")) === 3,
  );

  const promoCard = live[4];
  await fails("daily empty deposit blocks promo", () => requestPromo(limits.id, promoCard.id, 100, limits.id));
  const limitsDeposit = await createDepositRequest(limits.id, 5000);
  await confirmPayment("accept", limitsDeposit.id);
  await setPromoSettings(limits.id, { enabled: true, weekLimitRub: 5000 });
  for (let index = 0; index < 5; index += 1) {
    await requestPromo(limits.id, promoCard.id, 100, limits.id);
  }
  let promos = 0;
  for (let index = 0; index < 3; index += 1) {
    const job = await takeJob();
    if (job?.type === "promo" && job.user_id === limits.id) promos += 1;
  }
  const fifthPromo = await takeJob();
  const queuedPromos = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, limits.id), eq(jobs.type, "promo"), eq(jobs.status, "queued")));
  check("fifth promo stays queued", promos === 3 && queuedPromos.length === 2 && fifthPromo === null);

  await db
    .update(jobs)
    .set({ startedAt: yesterday })
    .where(
      and(
        eq(jobs.userId, limits.id),
        inArray(jobs.type, ["publish", "update"]),
        inArray(jobs.status, ["done", "running"]),
      ),
    );
  for (let index = 0; index < 30; index += 1) {
    const row = await createDigest({
      userId: limits.id,
      preview: `вопрос ${index}`,
      urgency: "normal",
      actor: "accept",
      externalRef: `chat-${index}:m`,
    });
    await db
      .update(messagesDigest)
      .set({ status: "handled", repliedAt: new Date() })
      .where(eq(messagesDigest.id, row.id));
  }
  const overflow = await createDigest({
    userId: limits.id,
    preview: "тридцать первый",
    urgency: "normal",
    actor: "accept",
    externalRef: "chat-overflow:m",
  });
  const hot = await createDigest({
    userId: limits.id,
    preview: "заберите сами",
    urgency: "hot",
    actor: "accept",
    externalRef: "chat-hot:m",
  });
  check(
    "31st reply stays new",
    overflow.status === "new" && overflow.repliedAt == null && (await replySlotOpen(limits.id)) === false,
  );
  check("hot lead skips the reply ceiling", hot.repliedAt == null && (await repliesToday(limits.id)) === 30);
  const duringCeiling = await takeJob();
  const publishWaiting = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, limits.id), eq(jobs.type, "publish"), eq(jobs.status, "queued")));
  check(
    "publish waits and update starts when replies are full",
    duringCeiling?.type === "update" && duringCeiling.user_id === limits.id && publishWaiting.length === 1,
  );
  await fails("template waits until morning", () => templateReply(limits.id, overflow.id));
  const overflowRow = await db.select().from(messagesDigest).where(eq(messagesDigest.id, overflow.id));
  check("template does not stamp a full day", overflowRow[0]?.status === "new" && overflowRow[0]?.repliedAt == null);

  await db.update(messagesDigest).set({ repliedAt: null }).where(eq(messagesDigest.userId, limits.id));
  check("unanswered lead comes before publish", (await takeJob()) === null);
  await db
    .update(messagesDigest)
    .set({ status: "handled", repliedAt: new Date() })
    .where(eq(messagesDigest.id, overflow.id));
  const afterLead = await takeJob();
  check("publish starts after the lead is answered", afterLead?.type === "publish" && afterLead.user_id === limits.id);

  const manual = await createDigest({
    userId: limits.id,
    preview: "шаблон",
    urgency: "normal",
    actor: "accept",
    externalRef: "chat-manual:m",
  });
  const replyJob = await templateReply(limits.id, manual.id);
  const stamped = await db.select().from(messagesDigest).where(eq(messagesDigest.id, manual.id));
  check("template uses a reply slot", stamped[0]?.repliedAt instanceof Date && stamped[0]?.status === "handled");
  const runningReply = await takeJob(["reply"]);
  check("template reply can run", runningReply?.id === replyJob.id);
  if (runningReply) {
    const failedReply = await completeRoute.POST(
      new Request("http://local/complete", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "failed", error_code: "send_failed" }),
      }),
      { params: Promise.resolve({ id: runningReply.id }) },
    );
    check("failed reply is closed", failedReply.status === 200);
  }
  const clearedLead = await db.select().from(messagesDigest).where(eq(messagesDigest.id, manual.id));
  check("failed reply returns the slot", clearedLead[0]?.repliedAt == null && clearedLead[0]?.status === "new");

  await db
    .update(jobs)
    .set({ status: "canceled", finishedAt: new Date(), errorCode: "accept_reset" })
    .where(and(eq(jobs.userId, limits.id), eq(jobs.status, "queued")));

  const { readFile } = await import("node:fs/promises");
  const pages = (
    await Promise.all(
      ["src/app/page.tsx", "src/app/register/page.tsx", "src/app/app/page.tsx", "src/lib/curator.ts", "src/lib/plans.ts"].map(
        (file) => readFile(file, "utf8"),
      ),
    )
  ).join("\n");
  const spoken = [pages, JSON.stringify(PLANS), curatorFacts(), localReply("какие тарифы", null), localReply("нужен прокси", null)].join(
    "\n",
  );
  check("copy has no monthly tasks", !spoken.includes("задач в месяц"));
  check(
    "copy has no cabinet listing cap",
    !/до \d+ объявлений(?! в день)/i.test(spoken),
  );
  const channelAnswer = localReply("нужен прокси", null);
  check(
    "curator does not mention the channel",
    !curatorFacts().includes("канал") && !channelAnswer.includes("канал") && !channelAnswer.toLowerCase().includes("прокси"),
  );

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
  for (let index = 0; index < 11; index += 1) {
    await createListing(business.id, draft(`Бизнес ${index + 1}`), photo(`${index}.png`), "draft");
  }
  const businessCards = await db.select().from(listings).where(eq(listings.userId, business.id));
  check("no cabinet listing cap on business", businessCards.length === 11);

  check("logs redact proxy", !redact("connect 10.0.0.8:3128 password=secret").includes("10.0.0.8"));

  await db
    .update(jobs)
    .set({ status: "canceled", finishedAt: new Date(), errorCode: "accept_reset" })
    .where(inArray(jobs.status, ["queued", "running"]));
  const { curatorTurn, routeBuyerMessage } = await import("../src/lib/services/dispatch");
  const { slotsTaken } = await import("../src/lib/services/daily");
  const { addDeskTask } = await import("../src/lib/services/desk");
  const { clientSpeechOk } = await import("../src/lib/curator");
  const { curatorLines, deskTasks, users } = await import("../src/lib/db/schema");
  const deskUser = await registerUser({ email: `desk-${stamp}@test.local`, password: "password-1", plan: "start" });
  const deskPay = await createSubscriptionRequest(deskUser.id, "start");
  await confirmPayment("accept", deskPay.id);
  await db
    .update(avitoAccounts)
    .set({ status: "connected", refreshToken: "accept-refresh", avitoUserId: "300" })
    .where(eq(avitoAccounts.userId, deskUser.id));
  await db.update(users).set({ cabinetConsentAt: new Date() }).where(eq(users.id, deskUser.id));

  async function deskJobs() {
    return db.select().from(jobs).where(eq(jobs.userId, deskUser.id));
  }
  async function deskRows() {
    return db.select().from(deskTasks).where(eq(deskTasks.userId, deskUser.id));
  }

  const beforeAsk = (await deskJobs()).length + (await deskRows()).length;
  await curatorTurn(deskUser.id, "выложи диван за 15 тысяч в Туле", photo("sofa.png"));
  check("before yes the desk is empty", (await deskJobs()).length + (await deskRows()).length === beforeAsk);
  const listed = await curatorTurn(deskUser.id, "да", photo("sofa.png"));
  const deskAfter = await deskRows();
  const jobsAfter = await deskJobs();
  check(
    "yes creates copy, design and publish",
    deskAfter.some((row) => row.role === "copy") &&
      deskAfter.some((row) => row.role === "design") &&
      jobsAfter.some((row) => row.type === "publish") &&
      (await slotsTaken(deskUser.id, "publish")) === 1 &&
      clientSpeechOk(listed.reply),
  );
  const firstPublish = jobsAfter.find((row) => row.type === "publish");
  const takenDesk = await takeJob();
  check("publish starts the same day", takenDesk?.id === firstPublish?.id && takenDesk?.type === "publish");
  if (takenDesk) await finish(takenDesk.id);

  for (const item of [
    ["шкаф", "9", "b.png"],
    ["стол", "8", "c.png"],
  ] as const) {
    await curatorTurn(deskUser.id, `выложи ${item[0]} за ${item[1]} тысяч в Туле`, photo(item[2]));
    await curatorTurn(deskUser.id, "да");
    const job = await takeJob();
    if (job?.user_id === deskUser.id) await finish(job.id);
  }
  check("three publishes occupy the day", (await slotsTaken(deskUser.id, "publish")) === 3);
  const beforeFourth = (await deskJobs()).filter((row) => row.type === "publish").length;
  await curatorTurn(deskUser.id, "выложи кресло за 7 тысяч в Туле", photo("d.png"));
  const fourth = await curatorTurn(deskUser.id, "да");
  const fourthJobs = (await deskJobs()).filter((row) => row.type === "publish");
  check(
    "fourth publish does not start",
    fourth.reply.includes("Норма этих суток") &&
      clientSpeechOk(fourth.reply) &&
      fourthJobs.length === beforeFourth + 1 &&
      (await slotsTaken(deskUser.id, "publish")) === 3 &&
      (await takeJob()) === null,
  );

  await saveProfile(deskUser.id, {
    companyName: "Стол",
    phone: "+70000000020",
    avitoPhone: "+70000000021",
    workMode: "own_cabinet",
    cities: ["Тула"],
    categories: ["Товары"],
    escalateRules: "скидку",
    consent: true,
  });
  const ordinary = await routeBuyerMessage(deskUser.id, "Диван ещё продаётся?", "desk-chat:1");
  const ordinaryRow = await db
    .select()
    .from(messagesDigest)
    .where(and(eq(messagesDigest.userId, deskUser.id), eq(messagesDigest.externalRef, "desk-chat:1")));
  check(
    "ordinary buyer message goes to replies without another yes",
    ordinary === "reply" && ordinaryRow[0]?.repliedAt == null && ordinaryRow[0]?.status === "new",
  );
  await routeBuyerMessage(deskUser.id, "Можно скидку?", "desk-chat:2");
  const discountRow = await db
    .select()
    .from(messagesDigest)
    .where(eq(messagesDigest.externalRef, "desk-chat:2"));
  const discountLine = await db
    .select()
    .from(curatorLines)
    .where(eq(curatorLines.userId, deskUser.id));
  const discountReply = await db
    .select()
    .from(deskTasks)
    .where(and(eq(deskTasks.userId, deskUser.id), eq(deskTasks.role, "reply")));
  check(
    "discount reaches the curator and not Avito",
    discountRow[0]?.status === "escalated_to_client" &&
      discountRow[0]?.repliedAt == null &&
      discountLine.some((line) => line.content.includes("скидку")) &&
      discountReply.every((row) => row.payload.digestId !== discountRow[0]?.id),
  );

  const liveCard = await db
    .select()
    .from(listings)
    .where(and(eq(listings.userId, deskUser.id), eq(listings.status, "live")));
  const promoBefore = (await deskJobs()).filter((row) => row.type === "promo").length;
  await curatorTurn(deskUser.id, "Продвигай это объявление на 300 рублей");
  const promoYes = await curatorTurn(deskUser.id, "да");
  check(
    "promo without deposit creates no task",
    liveCard.length > 0 &&
      (await deskJobs()).filter((row) => row.type === "promo").length === promoBefore &&
      promoYes.action?.href === "/app/billing",
  );

  const heldCopy = await addDeskTask({ userId: deskUser.id, role: "copy", payload: { spend: false } });
  const heldDesign = await addDeskTask({ userId: deskUser.id, role: "design", payload: {} });
  const heldReply = await enqueueJob({
    userId: deskUser.id,
    type: "reply",
    payload: { thread_ref: "pause-thread", tone: "short" },
    createdBy: deskUser.id,
  });
  await curatorTurn(deskUser.id, "Пауза");
  const stillCopy = await db.select().from(deskTasks).where(eq(deskTasks.id, heldCopy.id));
  const stillReply = await db.select().from(jobs).where(eq(jobs.id, heldReply.id));
  check(
    "pause without yes stops nobody",
    stillCopy[0]?.status === "queued" && stillReply[0]?.status === "queued",
  );
  await curatorTurn(deskUser.id, "да");
  const stoppedCopy = await db.select().from(deskTasks).where(eq(deskTasks.id, heldCopy.id));
  const stoppedDesign = await db.select().from(deskTasks).where(eq(deskTasks.id, heldDesign.id));
  const stoppedReply = await db.select().from(jobs).where(eq(jobs.id, heldReply.id));
  check(
    "pause with yes stops text, photo and replies",
    stoppedCopy[0]?.status === "canceled" &&
      stoppedDesign[0]?.status === "canceled" &&
      stoppedReply[0]?.status === "canceled",
  );

  const guestBefore = (await db.select({ id: jobs.id }).from(jobs)).length;
  const guest = await curatorTurn(null, "выложи диван за 15 тысяч в Туле", photo("guest.png"));
  const price = localReply("сколько стоит", null);
  check(
    "guest hears the start price and gets no task",
    guest.handled &&
      (await db.select({ id: jobs.id }).from(jobs)).length === guestBefore &&
      price.includes("7") &&
      price.includes("900") &&
      price.includes("три объявления в сутки") &&
      price.toLowerCase().includes("дешевле частного авитолога"),
  );

  const site = (
    await Promise.all(
      ["src/app/page.tsx", "src/app/register/page.tsx", "src/components/curator-chat.tsx", "src/components/curator-widget.tsx", "src/components/onboarding-form.tsx", "src/components/cabinet-overview.tsx"].map(
        (file) => readFile(file, "utf8"),
      ),
    )
  ).join("\n");
  check(
    "public speech has no morning and no bot",
    clientSpeechOk(site) && clientSpeechOk(curatorFacts()) && clientSpeechOk(price) && clientSpeechOk(listed.reply),
  );
  check(
    "one curator dialog for text and voice",
    site.includes("Микрофон") && site.includes("sendToCurator") && !site.includes('accept="audio') && !site.includes("defaultChecked"),
  );
  check("new cabinet leads with the curator", site.includes("Объявление заводится разговором") && site.includes("Перейти в Авито"));

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
