"use server";

import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { AppError } from "@/lib/errors";
import { planToBill } from "@/lib/handoff";
import { isPlan } from "@/lib/plans";
import { socialConfigured, socialProvider } from "@/lib/social-auth";
import { createSubscriptionRequest } from "@/lib/services/billing";
import { registerUser } from "@/lib/services/users";
import { bail, readText } from "./form";

const registerSchema = z.object({
  email: z.string().trim().email("Укажите email"),
  password: z.string().min(8, "Пароль от 8 символов"),
  phone: z.string().trim().optional(),
});

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: readText(formData, "email"),
    password: readText(formData, "password"),
    phone: readText(formData, "phone"),
  });
  const fromTask = readText(formData, "from") === "task";
  const planRaw = readText(formData, "plan");
  const back = fromTask ? "/register?from=task" : `/register${isPlan(planRaw) ? `?plan=${planRaw}` : ""}`;
  if (!parsed.success) {
    bail(back, new AppError(parsed.error.issues[0]?.message ?? "Проверьте форму"));
  }
  const billed = planToBill(fromTask, planRaw);
  try {
    const user = await registerUser({ ...parsed.data, plan: billed ?? undefined });
    if (billed) await createSubscriptionRequest(user.id, billed);
  } catch (error) {
    bail(back, error);
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: fromTask ? "/app?saved=1" : "/app",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect(fromTask ? "/login?from=task&error=credentials" : "/login?error=credentials");
    throw error;
  }
}

export async function socialJoinAction(formData: FormData) {
  const providerId = readText(formData, "provider");
  const planRaw = readText(formData, "plan");
  const plan = isPlan(planRaw) ? planRaw : "start";
  const provider = socialProvider(providerId);
  const from = readText(formData, "from");
  const back = from === "login" ? "/login" : `/register?plan=${plan}`;
  if (!provider) bail(back, new AppError("Этот способ входа не поддерживается"));
  if (!socialConfigured(provider.id)) {
    bail(back, new AppError(`Вход через ${provider.title} ещё не подключён`));
  }
  const jar = await cookies();
  jar.set("avitoops-join-plan", plan, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  try {
    await signIn(provider.id, {
      redirectTo: "/app",
    });
  } catch (error) {
    if (error instanceof AuthError) bail(back, new AppError(`Не удалось войти через ${provider.title}`));
    throw error;
  }
}

export async function loginAction(formData: FormData) {
  const email = readText(formData, "email");
  const password = readText(formData, "password");
  const fromTask = readText(formData, "from") === "task";
  const fail = fromTask ? "/login?from=task&error=credentials" : "/login?error=credentials";
  const { verifyUser } = await import("@/lib/services/users");
  const user = await verifyUser(email, password);
  if (!user) redirect(fail);
  const next = user.role === "admin" ? "/admin" : fromTask ? "/app?saved=1" : "/app";
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: next,
    });
  } catch (error) {
    if (error instanceof AuthError) redirect(fail);
    throw error;
  }
}
