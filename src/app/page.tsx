import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { buttonClass } from "@/components/ui";
import { PLANS } from "@/lib/plans";
import { formatRub } from "@/lib/format";

const steps = [
  "Регистрируетесь и выбираете тариф.",
  "Ставите задачи по кабинету: что сделать, как отвечать, какой бюджет.",
  "Мы закрываем их в вашем кабинете.",
  "В кабинете — статус, лиды и расход рекламы.",
];

const included = [
  "Задачи по всему кабинету Авито",
  "Публикации, правки и ответы в чатах",
  "Контроль бюджета продвижения",
  "Закрываем задачи, которые вы поставили",
  "Пауза в один клик, если нужно остановить помощника",
];

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <section className="bg-white">
        <div className="shell grid items-center gap-8 py-10 lg:grid-cols-2 lg:py-14">
          <div className="grid gap-5">
            <p className="text-sm font-bold text-accent">Авито-помощник</p>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              Вы ставите задачи — мы ведём Авито
            </h1>
            <p className="max-w-xl text-lg text-muted">
              Автоматизируем работу с кабинетом целиком. Вы ставите задачи, мы их закрываем: публикации, ответы,
              продвижение и остальная работа, на которую каждый день уходит время.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/register?plan=start" className={buttonClass()}>
                Начать — от {formatRub(PLANS.start.priceRub)}/мес
              </Link>
              <Link href="/tariffs" className={buttonClass("ghost")}>
                Смотреть тарифы
              </Link>
            </div>
            <p className="text-sm text-muted">
              Новым — 1 день тарифа {PLANS.scale.title} бесплатно. Дальше от {formatRub(PLANS.start.priceRub)} в месяц.
            </p>
          </div>
          <article className="rounded-[20px] border border-line bg-paper p-5">
            <p className="text-sm font-bold text-accent">{PLANS.start.hint}</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">{formatRub(PLANS.start.priceRub)}</p>
            <p className="text-sm text-muted">в месяц, тариф {PLANS.start.title}</p>
            <ul className="mt-4 grid gap-2 text-sm">
              {PLANS.start.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <main className="shell grid gap-14 py-12">
        <section className="grid gap-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Для кого</h2>
          <p className="max-w-3xl text-muted">
            Мастера, производители, продавцы услуг и товаров, у кого уже есть что продавать, но на кабинет Авито каждый
            день уходит время. Вы ставите задачи — мы их закрываем.
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-extrabold tracking-tight">Как это работает</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step} className="rounded-[20px] border border-line bg-card p-4">
                <span className="flex size-8 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-white">
                  {index + 1}
                </span>
                <p className="mt-3 font-medium">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Как вы получаете услугу</h2>
          <p className="max-w-3xl text-muted">
            Физической доставки нет. Услуга оказывается дистанционно: после подтверждения оплаты работа идёт в вашем
            кабинете на сайте и в вашем кабинете Авито.
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-extrabold tracking-tight">Что входит</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {included.map((item) => (
              <li key={item} className="rounded-2xl bg-card px-4 py-3 text-sm font-medium">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4">
          <div className="grid gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">Тарифы</h2>
            <p className="max-w-3xl text-muted">
              Тарифы отличаются тем, сколько объявлений в день выкладывается, сколько правок в день делается и сколько
              объявлений в день ставится на продвижение. Ответы идут по правилам клиента. Реклама Авито оплачивается
              отдельно, с депозита.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.values(PLANS).map((plan) => (
            <article key={plan.id} className="flex flex-col gap-4 rounded-[20px] border border-line bg-card p-5">
              <div>
                <h2 className="text-xl font-extrabold">{plan.title}</h2>
                <p className="text-sm text-muted">{plan.hint}</p>
                <p className="mt-1 text-3xl font-extrabold tracking-tight">
                  {formatRub(plan.priceRub)}
                  <span className="text-base font-semibold text-muted">/мес</span>
                </p>
              </div>
              <ul className="grid flex-1 gap-2 text-sm">
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href={`/register?plan=${plan.id}`} className={buttonClass()}>
                Выбрать {plan.title}
              </Link>
            </article>
          ))}
          </div>
        </section>

        <section className="rounded-[20px] bg-card p-5">
          <h2 className="text-2xl font-extrabold tracking-tight">Не обещаем</h2>
          <p className="mt-2 max-w-3xl text-muted">
            Гарантированный топ в поиске Авито, обход правил площадки, мгновенные продажи. Работаем аккуратно и в
            рамках лимитов, чтобы аккаунт жил долго.
          </p>
        </section>

        <section className="grid gap-4">
          <h2 className="text-2xl font-extrabold tracking-tight">Вопросы</h2>
          <div className="grid gap-3">
            {[
              ["Нужен ли свой Авито?", "Да. Помощник работает в вашем кабинете, с вашего согласия."],
              [
                "Кто отвечает клиентам?",
                "Помощник отвечает по вашим правилам. Горячий лид передаём вам.",
              ],
              ["Можно остановить?", "Да. Пауза останавливает работу помощника."],
            ].map(([question, answer]) => (
              <div key={question} className="rounded-[20px] bg-card px-4 py-3">
                <p className="font-bold">{question}</p>
                <p className="mt-1 text-sm text-muted">{answer}</p>
              </div>
            ))}
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
