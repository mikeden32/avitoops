import Link from "next/link";
import { auth, signOut } from "@/auth";
import { buttonClass } from "./ui";

export async function PublicHeader() {
  const session = await auth();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          AvitoOps
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/tariffs">Тарифы</Link>
          {session?.user ? (
            <>
              <Link href={session.user.role === "admin" ? "/admin" : "/app"}>Кабинет</Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className={buttonClass("ghost")}>Выйти</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Войти</Link>
              <Link href="/register" className={buttonClass()}>
                Начать
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
