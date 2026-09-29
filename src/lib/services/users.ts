import { hash, compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { accessStatus, avitoAccounts, promoBudgets, subscriptions, users } from "../db/schema";
import { AppError } from "../errors";
import { moscowWeekStart } from "../week";
import { audit } from "./audit";

export async function registerUser(input: { email: string; password: string; phone?: string }) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hash(input.password, 10);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          phone: input.phone?.trim() || null,
          role: "client",
          passwordHash,
        })
        .returning();
      await tx.insert(avitoAccounts).values({ userId: user.id, status: "pending" });
      await tx.insert(accessStatus).values({ userId: user.id, state: "green" });
      await tx.insert(promoBudgets).values({
        userId: user.id,
        weekLimitRub: 0,
        spentRub: 0,
        enabled: false,
        weekStart: moscowWeekStart(),
      });
      await tx.insert(subscriptions).values({
        userId: user.id,
        plan: "scale",
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
        paymentProvider: "trial",
      });
      return user;
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new AppError("Такой email уже зарегистрирован");
    }
    throw error;
  }
}

export async function verifyUser(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user) return null;
  const ok = await compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;
  const passwordHash = await hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, role: "admin", passwordHash })
    .returning();
  await audit({
    actor: "system",
    action: "admin_seed",
    entity: "users",
    entityId: user.id,
    after: { email, role: "admin" },
  });
  return user;
}

export async function findUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}
