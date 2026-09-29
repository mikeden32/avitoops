import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PublicHeader } from "@/components/public-header";
import { Banner, Field, buttonClass } from "@/components/ui";
import { loginAction } from "@/server/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect(session.user.role === "admin" ? "/admin" : "/app");
  const params = await searchParams;
  return (
    <>
      <PublicHeader />
      <main className="shell grid py-12">
        <div className="mx-auto grid w-full max-w-md gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Вход</h1>
        <Banner message={params.error ? "Неверный email или пароль" : undefined} />
        <form action={loginAction} className="grid gap-3 rounded-[20px] border border-line bg-card p-5">
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Пароль">
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <button className={buttonClass()}>Войти</button>
        </form>
        <p className="text-sm text-muted">
          Нет аккаунта? <Link href="/register">Регистрация</Link>
        </p>
        </div>
      </main>
    </>
  );
}
