import Link from "next/link";
import { Card, PageTitle, buttonClass } from "@/components/ui";
import { accessLabel, formatDateTime, formatRub, subscriptionStatusLabel } from "@/lib/format";
import { planTitle } from "@/lib/plans";
import { loadDashboard } from "@/lib/queries/cabinet";
import { requireClient } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireClient();
  const data = await loadDashboard(user.id);
  return (
    <main className="grid gap-4">
      <PageTitle
        title="Кабинет"
        text="Ручной ввод — формы профиля, объявления и депозита. Авито-куратор отвечает на вопросы и не публикует объявления из чата."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">Доступ</p>
          <p className="text-2xl font-extrabold tracking-tight">{accessLabel(data.access)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Выкладка сегодня</p>
          <p className="text-2xl font-extrabold tracking-tight">
            {data.publishStarted} / {data.publishQuota}
          </p>
          <p className="mt-1 text-sm text-muted">В очереди: {data.publishQueued}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Новые лиды</p>
          <p className="text-2xl font-extrabold tracking-tight">{data.newLeads}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Депозит</p>
          <p className="text-2xl font-extrabold tracking-tight">{formatRub(data.depositRub)}</p>
        </Card>
      </div>
      <Card>
        <h2 className="text-lg font-extrabold">Ручной ввод</h2>
        <p className="mt-1 text-sm text-muted">
          Профиль, объявление, тексты для покупателей и депозит заполняете сами. Куратор только подсказывает.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className={buttonClass()} href="/app/onboarding">
            Профиль
          </Link>
          <Link className={buttonClass()} href="/app/listings/new">
            Объявление
          </Link>
          <Link className={buttonClass("ghost")} href="/app/billing">
            Депозит
          </Link>
        </div>
      </Card>
      <Card>
        <p>
          Тариф: {planTitle(data.plan)} ·{" "}
          {data.trial && data.subscriptionStatus === "active"
            ? "пробный день"
            : data.subscriptionStatus
              ? subscriptionStatusLabel(data.subscriptionStatus)
              : "нет оплаты"}
        </p>
        <p className="text-sm text-muted">
          {data.trial && data.subscriptionStatus === "active"
            ? `Пробный день тарифа Сеть до ${formatDateTime(data.periodEnd)}. Потом кабинет остановится, пока не пройдёт оплата выбранного тарифа.`
            : `Следующее окончание периода: ${formatDateTime(data.periodEnd)}`}
        </p>
        {data.block ? <p className="mt-2 text-sm text-warn">{data.block}</p> : null}
      </Card>
    </main>
  );
}
