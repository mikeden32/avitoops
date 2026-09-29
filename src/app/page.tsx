import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { buttonClass } from "@/components/ui";
import { PLANS } from "@/lib/plans";
import { formatRub } from "@/lib/format";

const steps = [
  "Регистрируетесь и выбираете тариф.",
  "Подключаете Авито и загружаете объявления.",
  "Мы выкладываем, отвечаем и тестируем продвижение в рамках вашего лимита.",
  "В кабинете — ссылки, лиды и расход. Раз в неделю — короткий статус.",
];

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto grid max-w-5xl gap-16 px-4 py-12">
        <section className="grid items-end gap-8 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="grid gap-4">
            <p className="text-sm font-medium uppercase tracking-wide text-accent">Ведение объявлений</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Авито под ключ — объявления живут, ответы идут, бюджет под контролем
            </h1>
            <p className="max-w-xl text-lg text-muted">
              Вы загружаете товары и фото. Мы публикуем, отвечаем клиентам и следим за продвижением. Без возни с
              прокси и круглосуточного сидения в чатах.
            </p>
            <div>
              <Link href="/register?plan=start" className={buttonClass()}>
                Начать — от {formatRub(PLANS.start.priceRub)}/мес
              </Link>
            </div>
          </div>
          <aside className="rounded-3xl border border-line bg-card p-5">
            <p className="text-sm text-muted">Пилот</p>
            <p className="mt-2 text-3xl font-semibold">{formatRub(PLANS.start.priceRub)}</p>
            <p className="text-sm text-muted">в месяц, тариф Старт</p>
            <ul className="mt-4 grid gap-2 text-sm">
              {PLANS.start.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="grid gap-3">
          <h2 className="text-2xl font-semibold">Для кого</h2>
          <p className="max-w-3xl text-muted">
            Мастера, производители, продавцы услуг и товаров по регионам, у кого уже есть что продавать на Авито, но
            нет времени вести кабинет каждый день.
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-semibold">Как это работает</h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step} className="rounded-2xl border border-line bg-card p-4">
                <span className="text-sm text-accent">0{index + 1}</span>
                <p className="mt-2">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-3">
          <h2 className="text-2xl font-semibold">Что входит</h2>
          <p>
            Публикация и обновление объявлений · ответы в чатах · контроль бюджета продвижения · стабильный доступ к
            Авито с нашей стороны · пауза в один клик, если нужно остановить работу.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {Object.values(PLANS).map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-line bg-card p-5">
              <h2 className="text-xl font-semibold">{plan.title}</h2>
              <p className="mt-1 text-2xl font-semibold">{formatRub(plan.priceRub)}/мес</p>
              <ul className="mt-3 grid gap-1 text-sm">
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="grid gap-2">
          <h2 className="text-2xl font-semibold">Не обещаем</h2>
          <p className="max-w-3xl text-muted">
            Гарантированный топ в поиске Авито, обход правил площадки, мгновенные продажи. Работаем аккуратно и в
            рамках лимитов, чтобы аккаунт жил долго.
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-semibold">Вопросы</h2>
          <div className="grid gap-3">
            <p>
              <span className="font-medium">Нужен ли свой Авито?</span> Да, ведём ваш кабинет с вашего согласия.
            </p>
            <p>
              <span className="font-medium">Кто отвечает клиентам?</span> Наша команда по вашим правилам и шаблонам;
              горячих передаём вам.
            </p>
            <p>
              <span className="font-medium">Можно остановить?</span> Да, пауза подписки останавливает публикации и
              ответы.
            </p>
          </div>
          <Link href="/register?plan=start" className={`${buttonClass()} w-fit`}>
            Подключить Старт
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
