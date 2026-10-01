import type { Metadata } from "next";
import Link from "next/link";
import { OpenTariffFit } from "@/components/curator-provider";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { buttonClass } from "@/components/ui";
import { formatRub } from "@/lib/format";
import { DAILY_QUOTA, PLANS, agentFillsProfile } from "@/lib/plans";

export const metadata: Metadata = { title: "Тарифы" };

const quotaRows = [
  ["publish", "Новые объявления"],
  ["update", "Правки"],
  ["promo", "Продвижения"],
  ["replies", "Ответы"],
] as const;

const steps = [
  ["Выбираете объём", "Тариф задаёт дневные лимиты OPS."],
  ["Настраиваете работу", "Подключаете аккаунт и правила."],
  ["OPS начинает вести задачи", "Вы подтверждаете важные действия."],
] as const;

const questions = [
  [
    "Первые сутки действительно бесплатные?",
    "Да. После регистрации первые сутки бесплатно: одно объявление и все функции. Со вторых суток работает оплаченный тариф.",
  ],
  [
    "Когда списываются деньги?",
    "Регистрация оплату не списывает. Деньги за тариф списываются, когда вы оплачиваете заявку. Рекламный бюджет на депозит оплачивается отдельно.",
  ],
  [
    "Можно сменить тариф?",
    "Да. В биллинге отправляется заявка на другой тариф. Пока предыдущая заявка на тариф не оплачена, новая не создаётся.",
  ],
  [
    "Реклама входит в стоимость?",
    "Работа OPS с продвижением входит в дневной лимит тарифа. Сам рекламный бюджет Авито оплачивается отдельно, с депозита. Сумму называете вы.",
  ],
  [
    "Что происходит после лимита?",
    "Когда дневная норма выбрана, следующее объявление уходит после смены суток. В первые сутки можно выложить одно объявление, следующее — после оплаты тарифа.",
  ],
  [
    "Можно поставить работу на паузу?",
    "Да. Пауза останавливает новые публикации, правки, ответы и продвижение.",
  ],
] as const;

export default function TariffsPage() {
  const plans = Object.values(PLANS);
  return (
    <>
      <PublicHeader />
      <main className="hero-shell grid gap-16 py-12 sm:py-16">
        <section className="grid max-w-3xl gap-4">
          <p className="text-sm font-bold text-accent">Тарифы AvitoOps</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Выберите объём работы для OPS</h1>
          <p className="text-lg text-muted">
            Во всех тарифах принцип один: OPS ведёт объявления, правки и ответы. Отличается ежедневный объём работы.
          </p>
          <p className="text-sm text-muted">Первые сутки бесплатно · рекламный бюджет оплачивается отдельно</p>
          <OpenTariffFit className={`${buttonClass()} w-fit`}>Подобрать тариф</OpenTariffFit>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Тарифы">
          {plans.map((plan) => {
            const quota = DAILY_QUOTA[plan.id];
            return (
              <article key={plan.id} className="flex h-full flex-col gap-5 rounded-[24px] border border-line bg-card p-5">
                <div>
                  <h2 className="text-xl font-extrabold">{plan.title}</h2>
                  <p className="mt-1 text-sm text-muted">{plan.hint}</p>
                </div>
                <p className="text-4xl font-extrabold tracking-tight">
                  {formatRub(plan.priceRub)}
                  <span className="text-base font-semibold text-muted"> / мес</span>
                </p>
                <ul className="grid flex-1 gap-2 text-sm">
                  {quotaRows.map(([key, label]) => (
                    <li key={key} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                      <span className="text-muted">{label}</span>
                      <span className="font-extrabold">{quota[key]}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted">
                  {agentFillsProfile(plan.id) ? "Анкету заполняем по вашим ответам." : "Анкету заполняете сами."}
                </p>
                <Link href={`/register?plan=${plan.id}`} className={`${buttonClass()} mt-auto w-full`}>
                  Выбрать {plan.title}
                </Link>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4" aria-labelledby="compare-title">
          <h2 id="compare-title" className="text-3xl font-extrabold tracking-tight">
            Сравните тарифы
          </h2>
          <div className="hidden overflow-hidden rounded-[24px] border border-line lg:grid lg:grid-cols-5">
            <div className="bg-paper p-3 text-sm font-bold">В день</div>
            {plans.map((plan) => (
              <div key={plan.id} className="border-l border-line bg-card p-3 text-sm font-extrabold">
                {plan.title}
                <span className="mt-1 block font-semibold text-muted">{formatRub(plan.priceRub)}</span>
              </div>
            ))}
            {quotaRows.map(([key, label]) => (
              <div key={key} className="contents">
                <div className="border-t border-line bg-paper p-3 text-sm">{label}</div>
                {plans.map((plan) => (
                  <div key={`${plan.id}-${key}`} className="border-t border-l border-line bg-card p-3 text-sm font-extrabold">
                    {DAILY_QUOTA[plan.id][key]}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:hidden">
            {plans.map((plan) => {
              const quota = DAILY_QUOTA[plan.id];
              return (
                <details key={plan.id} className="rounded-[20px] border border-line bg-card p-4">
                  <summary className="cursor-pointer font-extrabold">
                    {plan.title}
                    <span className="mt-1 block text-sm font-semibold text-muted">{formatRub(plan.priceRub)} / мес</span>
                  </summary>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {quotaRows.map(([key, label]) => (
                      <li key={key} className="flex justify-between gap-3">
                        <span className="text-muted">{label}</span>
                        <span className="font-extrabold">{quota[key]}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4" aria-labelledby="service-title">
          <h2 id="service-title" className="text-3xl font-extrabold tracking-tight">
            Как вы получаете услугу
          </h2>
          <p className="max-w-2xl text-sm text-muted">Это услуга, не товар. Доставки и самовывоза нет.</p>
          <ol className="grid gap-3 md:grid-cols-3">
            {steps.map(([title, text], index) => (
              <li key={title} className="grid gap-2 rounded-[24px] border border-line bg-card p-5">
                <p className="text-sm font-bold text-accent">0{index + 1}</p>
                <h3 className="text-lg font-extrabold">{title}</h3>
                <p className="text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid max-w-3xl gap-2" aria-labelledby="tariff-faq-title">
          <h2 id="tariff-faq-title" className="text-3xl font-extrabold tracking-tight">
            Вопросы
          </h2>
          {questions.map(([question, answer]) => (
            <details key={question} className="border-b border-line py-3">
              <summary className="cursor-pointer font-extrabold">{question}</summary>
              <p className="pt-2 text-sm text-muted">{answer}</p>
            </details>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
