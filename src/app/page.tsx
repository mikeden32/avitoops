import type { Metadata } from "next";
import Link from "next/link";
import { OpsFaq } from "@/components/home/ops-faq";
import { OpsPricing } from "@/components/home/ops-pricing";
import { OpsTryButton } from "@/components/home/ops-try";
import { OpsWorkflow } from "@/components/home/ops-workflow";
import { OpsAssistant } from "@/components/ops-assistant";
import { OpsHero } from "@/components/ops-hero";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "AvitoOps — Авито ведут за Вас" },
  description:
    "OPS собирает объявление из обычной задачи, показывает карточку и ждёт подтверждения перед важным действием.",
};

const trust = [
  ["Вы подтверждаете важное", "OPS не принимает критичные решения молча."],
  ["Всё видно в кабинете", "Понятно, что сделано и что сейчас в работе."],
  ["Можно поставить на паузу", "Работу можно остановить."],
  ["В рамках правил площадки", "Без обещаний обхода ограничений и гарантированного топа."],
] as const;

const day = [
  ["09:12", "Подготовлено объявление «Каркасная баня 6×2,4»"],
  ["09:18", "Запрошено подтверждение цены"],
  ["10:02", "Внесены правки в 2 объявления"],
  ["11:27", "Есть новый вопрос покупателя — требуется ваше решение"],
  ["12:40", "Обновлён статус продвижения"],
] as const;

function TrustIcon({ index }: { index: number }) {
  const paths = [
    "M5 12.5 9 16.5 19 7.5",
    "M4 12s3.5-6 8-6 8 6 8 6-3.5 6-8 6-8-6-8-6z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    "M8 6v4M16 6v4M7 11h10v7H7z",
    "M12 4 19 7v5c0 4.2-2.8 7.2-7 8-4.2-.8-7-3.8-7-8V7z",
  ];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 text-accent">
      <path d={paths[index]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <OpsHero />
      <main>
        <section className="border-y border-line bg-paper" aria-label="Как устроена работа">
          <div className="hero-shell grid grid-cols-1 gap-5 py-6 min-[360px]:grid-cols-2 lg:grid-cols-4">
            {trust.map(([title, text], index) => (
              <div key={title} className="grid grid-cols-[auto_1fr] gap-3">
                <TrustIcon index={index} />
                <div>
                  <p className="text-sm font-extrabold">{title}</p>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <OpsWorkflow />

        <section id="capabilities" className="bg-paper py-16" aria-labelledby="capabilities-title">
          <div className="hero-shell">
            <h2 id="capabilities-title" className="max-w-3xl text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              Один помощник вместо рутинной работы с объявлениями
            </h2>
            <div className="mt-8 grid gap-3 md:grid-cols-6">
              <article className="rounded-[24px] border border-line bg-card p-5 md:col-span-4">
                <h3 className="text-xl font-extrabold">Создаёт объявления</h3>
                <p className="mt-2 max-w-xl text-muted">
                  Собирает понятную карточку из обычного сообщения: дом, баня, аренда контейнера или услуга вроде
                  установки септика.
                </p>
              </article>
              <article className="rounded-[24px] border border-line bg-card p-5 md:col-span-2">
                <h3 className="text-lg font-extrabold">Помогает с ответами</h3>
                <p className="mt-2 text-sm text-muted">Работает по правилам и данным, которые задал бизнес.</p>
              </article>
              <article className="rounded-[24px] border border-line bg-card p-5 md:col-span-2">
                <h3 className="text-lg font-extrabold">Вносит правки</h3>
                <p className="mt-2 text-sm text-muted">Обновляет цену, название и текст уже выложенных объявлений.</p>
              </article>
              <article className="rounded-[24px] border border-line bg-card p-5 md:col-span-2">
                <h3 className="text-lg font-extrabold">Помогает с продвижением</h3>
                <p className="mt-2 text-sm text-muted">
                  Ставка берётся с депозита и не выходит за дневной и недельный лимит. Сумму называете вы.
                </p>
              </article>
              <article className="rounded-[24px] border border-line bg-card p-5 md:col-span-2">
                <h3 className="text-lg font-extrabold">Работает с голосом</h3>
                <p className="mt-2 text-sm text-muted">Можно сказать задачу, если браузер разрешает микрофон.</p>
              </article>
              <article className="rounded-[24px] border border-line bg-card p-5 md:col-span-6">
                <h3 className="text-lg font-extrabold">Показывает статус</h3>
                <p className="mt-2 text-muted">Видно, что сделано, что идёт сейчас и где требуется ваше решение.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-ink text-white" aria-labelledby="control-title">
          <div className="hero-shell grid gap-8 py-16 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="control-title" className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Автоматизация без потери контроля
              </h2>
              <div className="mt-6 grid max-w-md gap-3 rounded-[24px] bg-white/10 p-4">
                <p className="text-xs font-bold tracking-wide text-white/60 uppercase">Пример</p>
                <p className="text-sm font-semibold">OPS</p>
                <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
                  Карточка готова. Цена 570 000 ₽, Москва и область. Публикуем?
                </p>
                <div className="flex flex-wrap gap-2">
                  <OpsTryButton className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-bold">
                    Изменить
                  </OpsTryButton>
                  <OpsTryButton className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-ink">
                    Подтвердить
                  </OpsTryButton>
                </div>
              </div>
            </div>
            <ul className="grid gap-4">
              <li>
                <h3 className="text-lg font-extrabold">Важные действия проходят через подтверждение</h3>
                <p className="mt-1 text-sm text-white/70">Перед выкладкой OPS показывает карточку и ждёт отдельное «да».</p>
              </li>
              <li>
                <h3 className="text-lg font-extrabold">Можно остановить работу</h3>
                <p className="mt-1 text-sm text-white/70">Пауза останавливает новые публикации, правки, ответы и продвижение.</p>
              </li>
              <li>
                <h3 className="text-lg font-extrabold">В кабинете видно ход работы</h3>
                <p className="mt-1 text-sm text-white/70">Объявления, задачи и расход на рекламу остаются на экране.</p>
              </li>
            </ul>
          </div>
        </section>

        <section className="hero-shell py-16" aria-labelledby="day-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="day-title" className="max-w-3xl text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              Пока вы занимаетесь бизнесом, OPS ведёт задачи
            </h2>
            <p className="rounded-full border border-line px-3 py-1 text-xs font-bold tracking-wide text-muted uppercase">
              Пример рабочего дня
            </p>
          </div>
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
            <span className="size-16 lg:sticky lg:top-24">
              <OpsAssistant state="idle" />
            </span>
            <ol className="grid gap-0 border-l border-line">
              {day.map(([time, text], index) => (
                <li key={time} className="ops-rise grid grid-cols-[4.5rem_1fr] gap-3 py-3 pl-4" style={{ animationDelay: `${index * 80}ms` }}>
                  <time className="text-sm font-bold text-muted">{time}</time>
                  <p className="font-medium">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <OpsPricing />

        <section className="hero-shell pb-16" aria-labelledby="limits-title">
          <div className="rounded-[24px] border border-line bg-card p-6 sm:p-8">
            <h2 id="limits-title" className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
              Работаем как инструмент бизнеса, а не как обещание магии
            </h2>
            <p className="mt-3 max-w-3xl text-muted">
              OPS помогает автоматизировать работу с объявлениями, но не обещает гарантированную позицию в поиске,
              мгновенную продажу или обход правил площадки.
            </p>
            <ul className="mt-4 grid gap-2 text-sm text-muted">
              <li>Рекламный бюджет оплачивается отдельно.</li>
              <li>Результат зависит от товара, предложения, цены, региона и спроса.</li>
              <li>Автоматические действия выполняются только в пределах подключённых функций и лимитов тарифа.</li>
            </ul>
          </div>
        </section>

        <OpsFaq />

        <section className="hero-shell pb-20" aria-labelledby="start-title">
          <div className="grid gap-6 rounded-[28px] border border-line bg-paper p-6 sm:p-10 lg:grid-cols-[auto_1fr] lg:items-center">
            <span className="size-20">
              <OpsAssistant state="attention" />
            </span>
            <div className="grid gap-4">
              <h2 id="start-title" className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Дайте OPS первую задачу
              </h2>
              <p className="max-w-2xl text-muted">
                Опишите, что продаёте. Начнём с объявления и покажем результат до следующего важного действия.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <OpsTryButton className={`${buttonClass()} w-full sm:w-fit`}>Попробовать OPS</OpsTryButton>
                <Link href="#tariffs" className={`${buttonClass("ghost")} w-full sm:w-fit`}>
                  Смотреть тарифы
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
