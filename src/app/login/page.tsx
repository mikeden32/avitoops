import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Вход" };
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PublicHeader } from "@/components/public-header";
import { Banner, Field, buttonClass } from "@/components/ui";
import { SocialJoin } from "@/components/social-join";
import { configuredSocialButtons } from "@/lib/social-auth";
import { loginAction } from "@/server/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect(session.user.role === "admin" ? "/admin" : "/app");
  const params = await searchParams;
  const fromTask = params.from === "task";
  const error = params.error === "credentials" ? "Неверный email или пароль" : params.error;
  return (
    <>
      <PublicHeader />
      <main className="shell grid py-12 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto grid w-full max-w-md gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">{fromTask ? "Сохраните работу OPS" : "Вход"}</h1>
        {fromTask ? <p className="text-sm text-muted">Войдите — объявление и диалог останутся на месте.</p> : null}
        <Banner id="login-error" message={error} />
        <form action={loginAction} className="grid gap-3 rounded-[20px] border border-line bg-card p-5">
          {fromTask ? <input type="hidden" name="from" value="task" /> : null}
          <Field label="Email">
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </Field>
          <Field label="Пароль">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </Field>
          <button className={buttonClass()}>Войти</button>
        </form>
        <p className="text-sm text-muted">
          Нет аккаунта? <Link href={fromTask ? "/register?from=task" : "/register"}>Регистрация</Link>
        </p>
        {fromTask ? null : (
          <SocialJoin plan="start" title="Или войдите с помощью" from="login" providers={configuredSocialButtons()} />
        )}
        </div>
      </main>
    </>
  );
}
