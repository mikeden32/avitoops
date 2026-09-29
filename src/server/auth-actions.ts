"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { AppError } from "@/lib/errors";
import { isPlan } from "@/lib/plans";
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
  if (!parsed.success) {
    bail("/register", new AppError(parsed.error.issues[0]?.message ?? "Проверьте форму"));
  }
  const planRaw = readText(formData, "plan");
  try {
    const user = await registerUser(parsed.data);
    if (isPlan(planRaw)) await createSubscriptionRequest(user.id, planRaw);
  } catch (error) {
    bail(`/register${isPlan(planRaw) ? `?plan=${planRaw}` : ""}`, error);
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/app/billing",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=credentials");
    throw error;
  }
}

export async function loginAction(formData: FormData) {
  const email = readText(formData, "email");
  const password = readText(formData, "password");
  const { verifyUser } = await import("@/lib/services/users");
  const user = await verifyUser(email, password);
  if (!user) redirect("/login?error=credentials");
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: user.role === "admin" ? "/admin" : "/app",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=credentials");
    throw error;
  }
}
