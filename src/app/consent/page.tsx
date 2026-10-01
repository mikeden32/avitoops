import type { Metadata } from "next";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Согласие на обработку данных" };

export default function ConsentPage() {
  return (
    <>
      <PublicHeader />
      <main className="shell grid gap-4 py-12">
        <div className="grid max-w-3xl gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Согласие на обработку данных</h1>
        <p>
          Для кабинета мы обрабатываем email, телефон, Telegram, сведения об объявлениях и статус доступа к Авито.
          Пароль Авито в этот кабинет не записывается.
        </p>
        <p>
          Данные используются, чтобы публиковать объявления, отвечать на лиды, считать лимиты тарифа и депозит и
          присылать статусы.
        </p>
        <p id="cookies">
          Cookie на сайте технические: они запоминают вход в кабинет. Рекламных и сторонних cookie для слежки мы не ставим.
          Кнопка «Согласен» в полосе cookie на любой странице сохраняет ваше согласие в этом браузере.
        </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
