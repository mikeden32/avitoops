import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PublicHeader } from "@/components/public-header";
import { Banner, Field, buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { PLANS, isPlan } from "@/lib/plans";
import { registerAction } from "@/server/auth-actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/app");
  const params = await searchParams;
  const plan = params.plan && isPlan(params.plan) ? params.plan : "start";
  return (
    <>
      <PublicHeader />
      <main className="mx-auto grid max-w-md gap-4 px-4 py-12">
        <h1 className="text-3xl font-semibold">Регистрация</h1>
        <Banner message={params.error} />
        <form action={registerAction} className="grid gap-3 rounded-2xl border border-line bg-card p-4">
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
              <option value="start">Старт — {formatRub(PLANS.start.priceRub)}/мес</option>
              <option value="business">Бизнес — {formatRub(PLANS.business.priceRub)}/мес</option>
            </select>
          </Field>
          <p className="text-xs text-muted">
            Нажимая «Создать аккаунт», вы создаёте заявку на оплату. До подтверждения оператором подписка не активна.{" "}
            <Link href="/offer">Оферта</Link> пока в черновике.
          </p>
          <button className={buttonClass()}>Создать аккаунт</button>
        </form>
        <p className="text-sm text-muted">
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
      </main>
    </>
  );
}
