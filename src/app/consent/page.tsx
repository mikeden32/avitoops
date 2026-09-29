import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";

export default function ConsentPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 py-12">
        <p className="w-fit rounded-full bg-warn/10 px-3 py-1 text-sm text-warn">Черновик, не для публичного запуска</p>
        <h1 className="text-3xl font-semibold">Согласие на обработку данных</h1>
        <p>
          Для кабинета мы обрабатываем email, телефон, Telegram, сведения об объявлениях и статус доступа к Авито.
          Пароли Авито и параметры прокси в этот кабинет не записываются.
        </p>
        <p>
          Данные используются, чтобы публиковать объявления, отвечать на лиды, считать лимиты тарифа и депозит и
          присылать статусы.
        </p>
        <p>Юридическую редакцию согласия нужно утвердить до публичного запуска.</p>
      </main>
      <SiteFooter />
    </>
  );
}
