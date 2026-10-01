import Link from "next/link";
import { Card, PageTitle, buttonClass } from "@/components/ui";
import { formatDateTime, formatRub, subscriptionStatusLabel } from "@/lib/format";
import { planTitle } from "@/lib/plans";
import type { loadDashboard } from "@/lib/queries/cabinet";

type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

function listingsWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "объявление";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "объявления";
  return "объявлений";
}

function quickHints(data: Dashboard) {
  const hints: { title: string; text: string; href: string }[] = [];
  const trial = data.trial && data.subscriptionStatus === "active";
  if (!data.consented) {
    hints.push({
      title: "Согласие",
      text: "Куратор прочитает согласие и дождётся отдельного «да». Галочка сама не ставится.",
      href: "/app",
    });
  } else if (!data.hasProfile) {
    hints.push({
      title: "Анкета",
      text: "Форма анкеты остаётся, если удобнее заполнить её руками.",
      href: "/app/onboarding",
    });
  }
  if (trial) {
    hints.push({
      title: "Пробные сутки",
      text: "Бесплатно одно объявление и все функции: текст, кадр, продвижение с депозита и ответы. Со вторых суток нужен оплаченный тариф.",
      href: "/app",
    });
  }
  if (data.access !== "green") {
    hints.push({
      title: "Пауза",
      text: data.block || "Новые публикации, правки и ответы сейчас не стартуют.",
      href: "/app/settings",
    });
  }
  if (data.newLeads > 0) {
    hints.push({
      title: "Лиды",
      text:
        data.newLeads === 1
          ? "Есть новое сообщение от покупателя."
          : `Новых сообщений: ${data.newLeads}. Спорные уже должны быть у вас.`,
      href: "/app/leads",
    });
  }
  if (!trial && data.depositRub <= 0) {
    hints.push({
      title: "Депозит",
      text: "Продвижение оплачивается только с депозита.",
      href: "/app/billing",
    });
  }
  const left = Math.max(data.publishQuota - data.publishStarted, 0);
  if (!trial && data.hasProfile && data.access === "green" && left > 0) {
    hints.push({
      title: "Выкладка",
      text: `Сегодня ещё можно выложить ${left} ${listingsWord(left)}.`,
      href: "/app/listings/new",
    });
  }
  if (hints.length === 0) {
    hints.push({
      title: "Сейчас",
      text: "Объявления по тарифу на Авито. Новые сообщения смотрите в лидах.",
      href: "/app/leads",
    });
  }
  return hints.slice(0, 3);
}

export function CabinetOverview({ data }: { data: Dashboard }) {
  const hints = quickHints(data);
  const trial = data.trial && data.subscriptionStatus === "active";
  return (
    <div className="grid gap-4">
      <PageTitle
        title="Кабинет"
        text="Объявление заводится разговором с OPS. Форма ниже — если удобнее руками."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">Выкладка сегодня</p>
          <p className="text-2xl font-extrabold tracking-tight">
            {data.publishStarted} из {data.publishQuota}
          </p>
          <p className="mt-1 text-sm text-muted">
            лимит тарифа{data.publishQueued > 0 ? `, в очереди ${data.publishQueued}` : ""}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Новые лиды</p>
          <p className="text-2xl font-extrabold tracking-tight">{data.newLeads}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Депозит</p>
          <p className="text-2xl font-extrabold tracking-tight">{formatRub(data.depositRub)}</p>
          <p className="mt-1 text-sm text-muted">реклама только отсюда</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Карточек в кабинете</p>
          <p className="text-2xl font-extrabold tracking-tight">{data.listingCount}</p>
        </Card>
      </div>
      {!data.consented ? (
        <Card>
          <p>Куратор читает согласие и ждёт отдельное «да». Галочка сама не ставится.</p>
        </Card>
      ) : null}
      {data.consented && !data.avitoConnected ? (
        <Card>
          <p>Пароль не нужен. Откроется страница Авито, там разрешите доступ.</p>
          <a className={`${buttonClass()} mt-3 w-fit`} href="/api/avito/connect">
            Перейти в Авито
          </a>
        </Card>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-lg font-extrabold">Подсказки</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {hints.map((hint) => (
            <Link key={hint.title} href={hint.href} className="rounded-[20px] border border-line bg-card p-4">
              <p className="text-xs font-bold tracking-wide text-accent uppercase">{hint.title}</p>
              <p className="mt-2 font-medium">{hint.text}</p>
            </Link>
          ))}
        </div>
      </section>
      <Card>
        <p>
          Тариф: {planTitle(data.plan)} ·{" "}
          {trial ? "пробные сутки" : data.subscriptionStatus ? subscriptionStatusLabel(data.subscriptionStatus) : "нет оплаты"}
        </p>
        <p className="text-sm text-muted">
          {trial
            ? `До ${formatDateTime(data.periodEnd)} бесплатно одно объявление и все функции: текст, кадр, продвижение с депозита и ответы. Со вторых суток работает оплаченный тариф.`
            : `Окончание периода: ${formatDateTime(data.periodEnd)}`}
        </p>
      </Card>
    </div>
  );
}
