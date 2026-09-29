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
            Первый день — бесплатно, с дневными нормами тарифа Сеть: 20 объявлений, 20 правок и продвижение до 20 объявлений в день. Выбранный тариф подключим после оплаты.{" "}
            <Link href="/offer">Оферта</Link>
          </p>
          <button className={buttonClass()}>Создать аккаунт</button>
        </form>
        <p className="text-sm text-muted">
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
        </div>
      </main>
    </>
  );
}
