import { eq } from "drizzle-orm";
import { db } from "../db";
import { avitoAccounts, clientProfiles, users } from "../db/schema";
import { AppError } from "../errors";
import { audit } from "./audit";

export type ProfileInput = {
  companyName: string;
  phone: string;
  telegram?: string;
  avitoPhone: string;
  workMode: "own_cabinet" | "materials_only";
  cities: string[];
  categories: string[];
  replyRules?: string;
  escalateRules?: string;
  consent: boolean;
};

export async function saveProfile(userId: string, input: ProfileInput) {
  if (!input.consent) throw new AppError("Нужно согласие на ведение кабинета");
  if (!input.companyName.trim() || !input.phone.trim() || !input.avitoPhone.trim()) {
    throw new AppError("Заполните имя, телефон и телефон входа в Авито");
  }
  if (input.cities.length === 0 || input.categories.length === 0) {
    throw new AppError("Укажите города и категории");
  }
  const now = new Date();
  const values = {
    companyName: input.companyName.trim(),
    phone: input.phone.trim(),
    telegram: input.telegram?.trim() || null,
    workMode: input.workMode,
    cities: input.cities,
    categories: input.categories,
    replyRules: input.replyRules?.trim() || null,
    escalateRules: input.escalateRules?.trim() || null,
    consentAt: now,
  };
  const [existing] = await db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId))
    .limit(1);
  if (existing) {
    await db.update(clientProfiles).set(values).where(eq(clientProfiles.userId, userId));
  } else {
    await db.insert(clientProfiles).values({ userId, ...values });
  }
  await db
    .update(users)
    .set({ phone: values.phone, telegram: values.telegram })
    .where(eq(users.id, userId));
  await db
    .update(avitoAccounts)
    .set({ loginHint: input.avitoPhone.trim() })
    .where(eq(avitoAccounts.userId, userId));
  await audit({
    actor: userId,
    action: existing ? "profile_update" : "profile_create",
    entity: "client_profiles",
    entityId: userId,
    after: { companyName: values.companyName, workMode: values.workMode },
  });
}

export async function updateContacts(userId: string, input: { phone: string; telegram?: string }) {
  const phone = input.phone.trim();
  if (!phone) throw new AppError("Укажите телефон");
  const telegram = input.telegram?.trim() || null;
  await db.update(users).set({ phone, telegram }).where(eq(users.id, userId));
  await db
    .update(clientProfiles)
    .set({ phone, telegram })
    .where(eq(clientProfiles.userId, userId));
}

export async function getProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}
