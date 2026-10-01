import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Регистрация" };
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PublicHeader } from "@/components/public-header";
import { Banner, Field, buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { PLANS, isPlan } from "@/lib/plans";
import { SocialJoin } from "@/components/social-join";
import { configuredSocialButtons } from "@/lib/social-auth";
import { registerAction } from "@/server/auth-actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; error?: string; from?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/app");
  const params = await searchParams;
  const fromTask = params.from === "task";
  const plan = params.plan && isPlan(params.plan) ? params.plan : "start";
  if (fromTask) {
    return (
      <>
        <PublicHeader />
        <main className="shell grid py-12 pb-[max(3rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto grid w-full max-w-md gap-4">
            <h1 className="text-3xl font-extrabold tracking-tight">Сохраните работу OPS</h1>
            <p className="text-sm text-muted">Создайте аккаунт — объявление и диалог останутся на месте.</p>
            <Banner id="register-error" message={params.error} />
            <form action={registerAction} className="grid gap-3 rounded-[20px] border border-line bg-card p-5">
              <input type="hidden" name="from" value="task" />
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-invalid={params.error ? true : undefined}
                  aria-describedby={params.error ? "register-error" : undefined}
                />
              </Field>
              <Field label="Пароль">
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  aria-invalid={params.error ? true : undefined}
                  aria-describedby={params.error ? "register-error" : undefined}
                />
              </Field>
              <p className="text-xs text-muted">
                Оплаты на этом шаге нет. Первые сутки можно собрать объявление, тариф выбирается перед выкладкой после них.{" "}
                <Link href="/offer">Оферта</Link>
              </p>
              <button className={buttonClass()}>Создать аккаунт</button>
            </form>
            <p className="text-center text-sm text-muted">
              Уже есть аккаунт? <Link href="/login?from=task">Войти</Link>
            </p>
          </div>
        </main>
      </>
    );
  }
  return (
    <>
      <PublicHeader />
      <main className="shell grid py-12">
        <div className="mx-auto grid w-full max-w-md gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Регистрация</h1>
        <Banner message={params.error} />
        <form action={registerAction} className="grid gap-3 rounded-[20px] border border-line bg-card p-5">
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Телефон" hint="Необязательно, можно указать на онбординге">
            <input name="phone" type="tel" autoComplete="tel" />
          </Field>
          <Field label="Пароль">
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Тариф">
            <select name="plan" defaultValue={plan}>
              {Object.values(PLANS).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {formatRub(item.priceRub)}/мес
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-muted">
            Первые сутки бесплатно: одно объявление и все функции — текст, кадр, продвижение с депозита и ответы
            покупателям. Со вторых суток работает выбранный тариф.{" "}
            <Link href="/offer">Оферта</Link>
          </p>
          <button className={buttonClass()}>Создать аккаунт</button>
        </form>
        <p className="text-center text-sm text-muted">
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
        <SocialJoin plan={plan} providers={configuredSocialButtons()} />
        </div>
      </main>
    </>
  );
}
