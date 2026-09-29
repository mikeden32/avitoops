import { and, asc, eq, gt, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../db";
import { avitoAccounts, jobs, listings } from "../db/schema";
import type { JobType } from "../db/schema";
import { AppError } from "../errors";
import { clientCanCreate, promoBlockReason } from "../policy";
import { redact } from "../redact";
import { audit } from "./audit";
import { getDepositBalance } from "./billing";
import { dailyStartBlock } from "./daily";
import { loadGate } from "./gate";
import { releaseReply } from "./leads";
import { dispatchPending, enqueueNotification } from "./notifications";

const workTypes = new Set<JobType>(["publish", "update", "reply", "promo", "report"]);

export async function enqueueJob(input: {
  userId: string;
  type: JobType;
  payload: Record<string, unknown>;
  listingId?: string | null;
  createdBy: string;
  asAdmin?: boolean;
}) {
  if (!input.asAdmin && !clientCanCreate(input.type)) {
    throw new AppError("Эту задачу может создать только оператор");
  }
  if (input.type === "heal_access" && !input.asAdmin) {
    throw new AppError("Эту задачу может создать только оператор");
  }
  const gate = await loadGate(input.userId);
  if (input.type === "heal_access") {
    if (gate.access === "green") throw new AppError("Доступ в порядке, смена слота не нужна");
    const open = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, input.userId),
          eq(jobs.type, "heal_access"),
          inArray(jobs.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (open[0]) throw new AppError("Запрос на смену доступа уже создан");
  } else if (gate.block) {
    throw new AppError(gate.block);
  }

  if ((input.type === "publish" || input.type === "update") && input.listingId) {
    const [open] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.listingId, input.listingId),
          inArray(jobs.type, ["publish", "update"]),
          inArray(jobs.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (open) throw new AppError("По этому объявлению уже есть задача в работе");
  }

  if (input.type === "promo") {
    const maxRub = Number(input.payload.max_rub ?? 0);
    const { currentPromo } = await import("./promo");
    const budget = await currentPromo(input.userId);
    const depositRub = await getDepositBalance(input.userId);
    const reason = promoBlockReason({
      enabled: budget.enabled,
      weekLimitRub: budget.weekLimitRub,
      spentRub: budget.spentRub,
      depositRub,
      maxRub,
    });
    if (reason) throw new AppError(reason);
  }

  const [job] = await db
    .insert(jobs)
    .values({
      userId: input.userId,
      listingId: input.listingId ?? null,
      type: input.type,
      payload: input.payload,
      status: "queued",
      createdBy: input.createdBy,
    })
    .returning();

  if ((input.type === "publish" || input.type === "update") && input.listingId) {
    await db
      .update(listings)
      .set({ status: "queued", errorNote: null, updatedAt: new Date() })
      .where(and(eq(listings.id, input.listingId), eq(listings.userId, input.userId)));
  }

  await audit({
    actor: input.createdBy,
    action: "job_create",
    entity: "jobs",
    entityId: job.id,
    after: { type: job.type, userId: job.userId, status: "queued" },
  });
  return job;
}

export function publicJob(job: typeof jobs.$inferSelect) {
  return {
    id: job.id,
    user_id: job.userId,
    listing_id: job.listingId,
    type: job.type,
    payload: job.payload,
    status: job.status,
    created_at: job.createdAt.toISOString(),
  };
}

const marketplace = new Set<JobType>(["publish", "update", "reply", "promo"]);

export async function takeNextJob(agent: string, types?: JobType[]) {
  const gates = new Map<string, Awaited<ReturnType<typeof loadGate>>>();
  let cursor: { at: Date; id: string } | null = null;

  for (let batch = 0; batch < 20; batch += 1) {
    const queued = await db
      .select()
      .from(jobs)
      .where(
        cursor
          ? and(
              eq(jobs.status, "queued"),
              or(gt(jobs.createdAt, cursor.at), and(eq(jobs.createdAt, cursor.at), gt(jobs.id, cursor.id))),
            )
          : eq(jobs.status, "queued"),
      )
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
      .limit(100);
    if (queued.length === 0) return null;

    for (const job of queued) {
      cursor = { at: job.createdAt, id: job.id };
      let gate = gates.get(job.userId);
      if (!gate) {
        gate = await loadGate(job.userId);
        gates.set(job.userId, gate);
      }
      if (job.type === "heal_access") {
        if (gate.access === "green") {
          await cancelJob("system", job.id);
          continue;
        }
      } else if (!workTypes.has(job.type)) {
        continue;
      } else if (gate.block) {
        await cancelJob("system", job.id);
        continue;
      }
      if (types && !types.includes(job.type)) continue;
      if (marketplace.has(job.type)) {
        const [ready] = await db
          .select({ userId: avitoAccounts.userId })
          .from(avitoAccounts)
          .where(
            and(
              eq(avitoAccounts.userId, job.userId),
              eq(avitoAccounts.status, "connected"),
              isNotNull(avitoAccounts.refreshToken),
            ),
          )
          .limit(1);
        if (!ready) continue;
      }
      if (job.type === "promo") {
        const { currentPromo } = await import("./promo");
        const budget = await currentPromo(job.userId);
        const depositRub = await getDepositBalance(job.userId);
        const reason = promoBlockReason({
          enabled: budget.enabled,
          weekLimitRub: budget.weekLimitRub,
          spentRub: budget.spentRub,
          depositRub,
          maxRub: Number(job.payload.max_rub ?? 0),
        });
        if (reason) continue;
      }
      if (await dailyStartBlock(job.userId, job.type)) continue;

      const [taken] = await db
        .update(jobs)
        .set({ status: "running", assignedAgent: agent, startedAt: new Date() })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, "queued")))
        .returning();
      if (!taken) continue;
      if ((taken.type === "publish" || taken.type === "update") && taken.listingId) {
        await db
          .update(listings)
          .set({ status: "publishing", updatedAt: new Date() })
          .where(eq(listings.id, taken.listingId));
      }
      await audit({
        actor: agent,
        action: "job_running",
        entity: "jobs",
        entityId: taken.id,
        after: { status: "running" },
      });
      return taken;
    }
  }
  return null;
}

export async function completeJob(
  jobId: string,
  input: {
    status: "done" | "failed";
    avitoUrl?: string;
    externalId?: string;
    errorCode?: string;
    errorNote?: string;
    spentRub?: number;
  },
) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.status !== "running") throw new AppError("Задача не выполняется");

  const listingDone = (job.type === "publish" || job.type === "update") && Boolean(job.listingId);
  const avitoUrl = listingDone && input.status === "done" ? normalizeUrl(input.avitoUrl) : null;
  const promoSpend =
    job.type === "promo" && input.status === "done"
      ? Number.isInteger(input.spentRub)
        ? Number(input.spentRub)
        : Number(job.payload.max_rub ?? 0)
      : null;
  const errorNote = input.errorNote ? redact(input.errorNote).slice(0, 500) : null;

  const closed = await db.transaction(async (tx) => {
    let lowBalance: number | null = null;
    if (promoSpend !== null) {
      const { recordPromoSpend } = await import("./promo");
      const spend = await recordPromoSpend(
        job.userId,
        promoSpend,
        job.id,
        Number(job.payload.max_rub ?? 0),
        tx,
      );
      if (spend.notifyLow) lowBalance = spend.balance;
    }
    const [updated] = await tx
      .update(jobs)
      .set({
        status: input.status,
        finishedAt: new Date(),
        errorCode: input.status === "failed" ? input.errorCode || "failed" : null,
        errorNote,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "running")))
      .returning();
    if (!updated) throw new AppError("Задача уже закрыта");

    let title = "";
    if (listingDone && job.listingId) {
      if (input.status === "done") {
        const [listing] = await tx
          .update(listings)
          .set({
            status: "live",
            avitoUrl,
            externalId: input.externalId?.trim() || null,
            errorNote: null,
            updatedAt: new Date(),
          })
          .where(eq(listings.id, job.listingId))
          .returning();
        title = listing?.title ?? "";
      } else {
        await tx
          .update(listings)
          .set({ status: "error", errorNote, updatedAt: new Date() })
          .where(eq(listings.id, job.listingId));
      }
    }
    return { updated, lowBalance, title };
  });

  if (input.status === "failed" && job.type === "reply") {
    await releaseReply(digestId(job.payload));
  }
  if (closed.lowBalance !== null) {
    await enqueueNotification({
      userId: job.userId,
      kind: "low_deposit",
      payload: { balanceRub: closed.lowBalance },
    });
  }
  if (listingDone && job.listingId && input.status === "done") {
    await enqueueNotification({
      userId: job.userId,
      kind: "published",
      payload: { title: closed.title, url: avitoUrl, listingId: job.listingId },
    });
  } else if (input.status === "failed") {
    await enqueueNotification({
      userId: job.userId,
      kind: "job_failed",
      channels: ["operator"],
      payload: { type: job.type, errorCode: input.errorCode || "failed", jobId },
    });
  }

  await audit({
    actor: job.assignedAgent || "system",
    action: "job_status",
    entity: "jobs",
    entityId: job.id,
    before: { status: "running" },
    after: { status: input.status },
  });
  await dispatchPending();
  return closed.updated;
}

export async function cancelOpenJobs(userId: string, actor: string) {
  const open = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, userId), inArray(jobs.status, ["queued", "running"])));
  for (const job of open) {
    if (job.type === "heal_access") continue;
    await db
      .update(jobs)
      .set({ status: "canceled", finishedAt: new Date(), errorCode: "stopped" })
      .where(eq(jobs.id, job.id));
    if (job.listingId && (job.type === "publish" || job.type === "update")) {
      const [listing] = await db.select().from(listings).where(eq(listings.id, job.listingId)).limit(1);
      if (listing && (listing.status === "queued" || listing.status === "publishing")) {
        await db
          .update(listings)
          .set({
            status: listing.avitoUrl ? "live" : "paused",
            updatedAt: new Date(),
          })
          .where(eq(listings.id, listing.id));
      }
    }
    if (job.type === "reply") await releaseReply(digestId(job.payload));
    await audit({
      actor,
      action: "job_status",
      entity: "jobs",
      entityId: job.id,
      before: { status: job.status },
      after: { status: "canceled" },
    });
  }
}

export async function cancelJob(actor: string, jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) throw new AppError("Задача не найдена");
  if (job.status !== "queued" && job.status !== "running") {
    throw new AppError("Задача уже закрыта");
  }
  await db
    .update(jobs)
    .set({ status: "canceled", finishedAt: new Date(), errorCode: "canceled" })
    .where(eq(jobs.id, jobId));
  if (job.listingId && (job.type === "publish" || job.type === "update")) {
    const [listing] = await db.select().from(listings).where(eq(listings.id, job.listingId)).limit(1);
    if (listing && (listing.status === "queued" || listing.status === "publishing")) {
      await db
        .update(listings)
        .set({ status: listing.avitoUrl ? "live" : "paused", updatedAt: new Date() })
        .where(eq(listings.id, listing.id));
    }
  }
  if (job.type === "reply") await releaseReply(digestId(job.payload));
  await audit({
    actor,
    action: "job_status",
    entity: "jobs",
    entityId: jobId,
    before: { status: job.status },
    after: { status: "canceled" },
  });
}

function digestId(payload: Record<string, unknown>) {
  return typeof payload.thread_ref === "string" ? payload.thread_ref : "";
}

function normalizeUrl(value?: string) {
  if (!value?.trim()) throw new AppError("Нужна ссылка на объявление");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError("Ссылка на объявление некорректна");
  }
  if (url.username || url.password) throw new AppError("Ссылка не должна содержать логин");
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AppError("Нужна http(s) ссылка");
  return url.toString();
}
