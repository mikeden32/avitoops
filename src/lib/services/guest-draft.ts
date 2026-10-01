import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "../db";
import { curatorLines, guestDrafts, listings } from "../db/schema";
import { audit } from "./audit";
import { cleanLine } from "./desk";
import { composeTask, emptyFacts, factsFromSale, type SaleBrief, type TaskState } from "./sale";

const GUEST_COOKIE = "avitoops-guest";
const SALE_COOKIE = "avitoops-sale";
const SAVED_LINE = "Готово. Я сохранил объявление. Теперь настроим только то, что нужно для работы.";

type StoredTurn = { role: "user" | "assistant"; content: string; at: string };

export type GuestTaskView = TaskState & {
  transcript: { role: "user" | "assistant"; content: string }[];
};

export type ClaimResult =
  | { status: "none" }
  | { status: "claimed" | "already"; listingId: string | null; title: string | null }
  | { status: "expired" }
  | { status: "taken" }
  | { status: "failed" };

type ClaimRow = ClaimResult & { draftId?: string };

export function guestCookiePolicy(nodeEnv = process.env.NODE_ENV) {
  return {
    name: GUEST_COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    secure: nodeEnv === "production",
  };
}

export function guestDraftTtlMs() {
  const raw = Number(process.env.GUEST_DRAFT_TTL_DAYS);
  const days = Number.isFinite(raw) && raw > 0 ? raw : 7;
  return Math.round(days * 24 * 60 * 60 * 1000);
}

export function hashGuestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(maxAge: number) {
  const policy = guestCookiePolicy();
  return {
    httpOnly: policy.httpOnly,
    sameSite: policy.sameSite,
    path: policy.path,
    secure: policy.secure,
    maxAge,
  };
}

function dbSafe(value: string) {
  return value.replaceAll("₽", "руб.").replaceAll("×", "x").replaceAll("\u00a0", " ").replaceAll("\u202f", " ");
}

function showDim(value: string) {
  return value.replace(/(\d)\s*x\s*(\d)/gi, "$1×$2");
}

function storeText(value: string | null, max: number) {
  if (!value) return null;
  const text = dbSafe(value).trim().slice(0, max);
  return text || null;
}

function columns(state: TaskState) {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.attributes)) {
    const stored = storeText(value, 80);
    if (stored) attributes[key.slice(0, 40)] = stored;
  }
  return {
    product: storeText(state.product, 80),
    location: storeText(state.location, 120),
    price: state.price && state.price > 0 ? state.price : null,
    title: storeText(state.title, 50),
    description: storeText(state.description, 2000),
    attributes,
    missingFields: state.missingFields,
    updatedAt: new Date(),
  };
}

function storedTurns(value: unknown): StoredTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: StoredTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string" || !row.content.trim()) continue;
    turns.push({
      role: row.role,
      content: row.content.trim().slice(0, 800),
      at: typeof row.at === "string" ? row.at : new Date().toISOString(),
    });
  }
  return turns.slice(-16);
}

function stateFromRow(row: { product: string | null; location: string | null; price: number | null }) {
  return composeTask({
    product: row.product ? showDim(row.product) : null,
    location: row.location,
    price: row.price,
  });
}

function toView(state: TaskState, turns: StoredTurn[]): GuestTaskView {
  const shown = composeTask({
    product: state.product ? showDim(state.product) : null,
    location: state.location,
    price: state.price,
  });
  return {
    ...shown,
    transcript: turns.map((turn) => ({ role: turn.role, content: showDim(turn.content) })),
  };
}

function pushTurn(turns: StoredTurn[], role: "user" | "assistant", content: string) {
  const text = dbSafe(content).trim().slice(0, 800);
  if (!text) return;
  turns.push({ role, content: text, at: new Date().toISOString() });
}

async function findByHash(tokenHash: string) {
  const [row] = await db.select().from(guestDrafts).where(eq(guestDrafts.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

function readSaleCookie(raw: string | undefined): SaleBrief {
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

function clearNamed(jar: Awaited<ReturnType<typeof cookies>>, name: string) {
  jar.set(name, "", cookieOptions(0));
}

async function writeDraft(state: TaskState, turns: StoredTurn[], existingId?: string) {
  const fields = columns(state);
  const trimmed = turns.slice(-16);
  if (existingId) {
    await db.update(guestDrafts).set({ ...fields, visibleTranscript: trimmed }).where(eq(guestDrafts.id, existingId));
    return;
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + guestDraftTtlMs());
  await db.insert(guestDrafts).values({
    tokenHash: hashGuestToken(token),
    status: "active",
    ...fields,
    visibleTranscript: trimmed,
    expiresAt,
  });
  const jar = await cookies();
  jar.set(GUEST_COOKIE, token, cookieOptions(Math.floor(guestDraftTtlMs() / 1000)));
  clearNamed(jar, SALE_COOKIE);
}

export async function readGuestState() {
  const empty = composeTask(emptyFacts());
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value;
  if (token) {
    const row = await findByHash(hashGuestToken(token));
    if (row?.status === "active") {
      if (row.expiresAt.getTime() <= Date.now()) {
        return { state: empty, transcript: [] as StoredTurn[], expired: true, stored: false };
      }
      return {
        state: stateFromRow(row),
        transcript: storedTurns(row.visibleTranscript),
        expired: false,
        stored: true,
      };
    }
    return { state: empty, transcript: [] as StoredTurn[], expired: false, stored: false };
  }
  const sale = readSaleCookie(jar.get(SALE_COOKIE)?.value);
  if (sale.item || sale.city || sale.priceRub) {
    return { state: composeTask(factsFromSale(sale)), transcript: [] as StoredTurn[], expired: false, stored: false };
  }
  return { state: empty, transcript: [] as StoredTurn[], expired: false, stored: false };
}

export async function loadGuestTask(): Promise<GuestTaskView | { expired: true } | null> {
  const read = await readGuestState();
  if (read.expired) {
    const jar = await cookies();
    clearNamed(jar, GUEST_COOKIE);
    return { expired: true };
  }
  if (read.stored) {
    const jar = await cookies();
    if (jar.get(SALE_COOKIE)) clearNamed(jar, SALE_COOKIE);
    return toView(read.state, read.transcript);
  }
  if (read.state.product || read.state.location || read.state.price) {
    await writeDraft(read.state, []);
    return toView(read.state, []);
  }
  return null;
}

export async function persistGuestTurn(state: TaskState, userText: string, assistantText: string) {
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value;
  const now = Date.now();
  const row = token ? await findByHash(hashGuestToken(token)) : null;
  const usable = row && row.status === "active" && row.expiresAt.getTime() > now ? row : null;
  const turns = usable ? storedTurns(usable.visibleTranscript) : [];
  pushTurn(turns, "user", userText);
  pushTurn(turns, "assistant", assistantText);
  await writeDraft(state, turns, usable?.id);
  if (usable) clearNamed(jar, SALE_COOKIE);
  return toView(state, turns);
}

export async function resetGuestTask() {
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value;
  if (token) {
    await db
      .delete(guestDrafts)
      .where(and(eq(guestDrafts.tokenHash, hashGuestToken(token)), eq(guestDrafts.status, "active")));
  }
  clearNamed(jar, GUEST_COOKIE);
  clearNamed(jar, SALE_COOKIE);
  return { ok: true as const };
}

function atOf(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60_000) return new Date();
  return date;
}

export async function claimGuestDraft(userId: string, token: string): Promise<ClaimRow> {
  const tokenHash = hashGuestToken(token);
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(guestDrafts).where(eq(guestDrafts.tokenHash, tokenHash)).for("update").limit(1);
    if (!row) return { status: "none" as const };
    if (row.status === "claimed") {
      if (row.claimedByUserId === userId) {
        return {
          status: "already" as const,
          listingId: row.claimedListingId,
          title: row.title ? showDim(row.title) : null,
          draftId: row.id,
        };
      }
      return { status: "taken" as const };
    }
    if (row.expiresAt.getTime() <= Date.now()) return { status: "expired" as const };
    const state = stateFromRow(row);
    const ready = state.completeness === "ready" && state.title && state.location && state.price && state.description;
    let listingId: string | null = null;
    if (ready && state.title && state.location && state.price && state.description) {
      const title = storeText(state.title, 50);
      const city = storeText(state.location, 120);
      const body = storeText(state.description, 2000);
      if (title && city && body) {
        const [created] = await tx
          .insert(listings)
          .values({
            userId,
            title,
            category: "Другое",
            city,
            priceRub: state.price,
            body,
            photos: [],
            status: "draft",
          })
          .returning();
        listingId = created.id;
      }
    }
    const now = new Date();
    const lines = storedTurns(row.visibleTranscript)
      .map((turn) => ({
        userId,
        role: turn.role,
        content: cleanLine(dbSafe(turn.content)),
        createdAt: atOf(turn.at),
      }))
      .filter((line) => line.content);
    if (lines.length) await tx.insert(curatorLines).values(lines);
    if (listingId) {
      await tx.insert(curatorLines).values({
        userId,
        role: "assistant",
        content: cleanLine(SAVED_LINE),
        cardHref: `/app/listings/${listingId}`,
        createdAt: now,
      });
    }
    await tx
      .update(guestDrafts)
      .set({
        status: "claimed",
        claimedAt: now,
        claimedByUserId: userId,
        claimedListingId: listingId,
        updatedAt: now,
      })
      .where(eq(guestDrafts.id, row.id));
    return {
      status: "claimed" as const,
      listingId,
      title: listingId ? showDim(state.title ?? "") : null,
      draftId: row.id,
    };
  });
  if (result.status === "claimed" && result.draftId) {
    await audit({
      actor: userId,
      action: "guest_draft_claimed",
      entity: "guest_draft",
      entityId: result.draftId,
      after: { listingId: result.listingId },
    });
  }
  return result;
}

export async function claimGuestDraftForCurrentUser(): Promise<ClaimResult> {
  const session = await auth();
  const userId = session?.user?.role === "client" ? session.user.id : null;
  if (!userId) return { status: "none" };
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value;
  if (!token) return { status: "none" };
  try {
    const result = await claimGuestDraft(userId, token);
    if (result.status === "claimed" || result.status === "already") {
      return { status: result.status, listingId: result.listingId, title: result.title };
    }
    if (result.status === "taken" || result.status === "expired" || result.status === "none") return { status: result.status };
    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}

export async function latestClaimedDraft(userId: string) {
  const [row] = await db
    .select({ listingId: guestDrafts.claimedListingId, title: guestDrafts.title })
    .from(guestDrafts)
    .where(and(eq(guestDrafts.claimedByUserId, userId), eq(guestDrafts.status, "claimed")))
    .orderBy(desc(guestDrafts.claimedAt))
    .limit(1);
  if (!row?.listingId) return null;
  return { listingId: row.listingId, title: row.title ? showDim(row.title) : null };
}

export async function cabinetTaskContext(userId: string): Promise<SaleBrief> {
  const [draft] = await db
    .select({
      listingId: guestDrafts.claimedListingId,
      product: guestDrafts.product,
      location: guestDrafts.location,
      price: guestDrafts.price,
    })
    .from(guestDrafts)
    .where(and(eq(guestDrafts.claimedByUserId, userId), eq(guestDrafts.status, "claimed")))
    .orderBy(desc(guestDrafts.claimedAt))
    .limit(1);
  if (draft?.listingId) {
    const [listing] = await db
      .select({ title: listings.title, city: listings.city, priceRub: listings.priceRub })
      .from(listings)
      .where(and(eq(listings.id, draft.listingId), eq(listings.userId, userId)))
      .limit(1);
    if (listing) return { item: listing.title, city: listing.city, priceRub: listing.priceRub };
  }
  if (draft && (draft.product || draft.location || draft.price)) {
    return {
      item: draft.product ? showDim(draft.product) : undefined,
      city: draft.location ?? undefined,
      priceRub: draft.price ?? undefined,
    };
  }
  const [listing] = await db
    .select({ title: listings.title, city: listings.city, priceRub: listings.priceRub })
    .from(listings)
    .where(eq(listings.userId, userId))
    .orderBy(desc(listings.createdAt))
    .limit(1);
  if (listing) return { item: listing.title, city: listing.city, priceRub: listing.priceRub };
  return {};
}

export async function claimedLocation(userId: string) {
  const context = await cabinetTaskContext(userId);
  return context.city ?? null;
}

export async function cleanupGuestDrafts(now = new Date()) {
  const claimedCutoff = new Date(now.getTime() - guestDraftTtlMs());
  const expired = await db.delete(guestDrafts).where(lt(guestDrafts.expiresAt, now)).returning({ id: guestDrafts.id });
  const settled = await db
    .delete(guestDrafts)
    .where(and(eq(guestDrafts.status, "claimed"), isNotNull(guestDrafts.claimedListingId), lt(guestDrafts.claimedAt, claimedCutoff)))
    .returning({ id: guestDrafts.id });
  return { expired: expired.length, settled: settled.length };
}
